"""Central coordinator that wires together all spec-lesson subsystems.

``Orchestrator.run()`` is the top-level coroutine: it starts audio capture,
runs three periodic tiers (ContextTier every 5 min, ThreadTier every 2 min,
ImmediateTier on speech pause), and triggers a final PolishTier pass on
shutdown.  ``ingest()`` is the single intake point for utterance dicts and
is safe to call from any thread.
"""
import asyncio
import logging
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Optional, Protocol

from .lifecycle import SessionLifecycle
from .session import Session
from .tiers.client import AnthropicClient
from .tiers.context import ContextTier
from .tiers.thread import ThreadTier
from .tiers.polish import PolishTier
from .tiers.immediate import ImmediateTier
from .tiers.scheduler import PeriodicRunner
from .transcript.buffer import RollingTranscript
from .transcript.persist import TranscriptWriter
from .transcript.utterance import Utterance
from .trigger.detector import TriggerDetector
from .writer.claude_md import ClaudeMdWriter
from .hud.observer import HudObserver

log = logging.getLogger(__name__)


class AudioSource(Protocol):
    """Structural interface for any audio input source.

    Implementors must support ``on_utterance(cb)`` to register a callback,
    ``start()`` to begin capture, and ``stop()`` to tear down cleanly.
    ``cli._LiveSource`` and test mocks satisfy this protocol.
    """
    def on_utterance(self, cb) -> None: ...
    def start(self) -> None: ...
    def stop(self) -> None: ...


@dataclass
class OrchestratorConfig:
    thread_interval: float = 120.0
    context_interval: float = 300.0
    max_seconds: float = 5400.0
    pause_check_interval: float = 0.5
    pause_threshold: float = 1.2
    # COST-2: gate ImmediateTier — require at least this many utterances before
    # the first fire and enforce a minimum wall-clock interval between fires to
    # prevent a burst of calls during rapid back-and-forth exchanges.
    immediate_min_utterances: int = 3
    immediate_min_interval: float = 10.0  # seconds between consecutive fires


class Orchestrator:
    """Wire and run all spec-lesson subsystems for one session.

    Owns the ``RollingTranscript`` buffer, three tier runners (context, thread,
    immediate), the ``ClaudeMdWriter``, ``TranscriptWriter``, ``TriggerDetector``,
    and ``SessionLifecycle``.  ``run()`` is the top-level coroutine; ``ingest()``
    is the thread-safe intake point for utterance dicts from any source.
    """

    def __init__(
        self,
        session: Session,
        client: AnthropicClient,
        config: OrchestratorConfig,
        audio_source: Optional[AudioSource] = None,
        observer: Optional[HudObserver] = None,
    ):
        self.session = session
        self.client = client
        self.cfg = config
        self.audio_source = audio_source
        self._observer = observer
        self._loop: Optional[asyncio.AbstractEventLoop] = None
        self._session_start: float = time.monotonic()

        self.buffer = RollingTranscript()
        self.transcript_writer = TranscriptWriter(session.transcript_jsonl)
        self.claude_md_writer = ClaudeMdWriter(session.claude_md)

        self.context_tier = ContextTier(client=client, buffer=self.buffer)
        self.thread_tier = ThreadTier(client=client, buffer=self.buffer)
        self.polish_tier = PolishTier(client=client)
        self.immediate_tier = ImmediateTier(client=client, buffer=self.buffer)
        self.trigger = TriggerDetector()

        self._context_runner = PeriodicRunner(name="context", interval_seconds=config.context_interval, callback=self._run_context)
        self._thread_runner = PeriodicRunner(name="thread", interval_seconds=config.thread_interval, callback=self._run_thread)
        self._lifecycle = SessionLifecycle(state_dir=session.state_dir, max_seconds=config.max_seconds)
        self._lifecycle.on_shutdown(self._on_shutdown)

        # pause detection for Immediate tier
        self._pause_check_interval = config.pause_check_interval
        self._pause_threshold = config.pause_threshold
        self._last_immediate_for_ts: Optional[float] = None
        self._utterance_received_monotonic = time.monotonic()
        # COST-2: rate-limiting state for Immediate tier
        self._immediate_min_utterances = config.immediate_min_utterances
        self._immediate_min_interval = config.immediate_min_interval
        self._last_immediate_fire_monotonic: float = 0.0

        # RES-2 / Fix 7: shutdown guard — set to True as the FIRST action
        # inside _on_shutdown so _pause_watcher stops before teardown begins.
        self._shutting_down: bool = False

    def ingest(self, utterance_dict: dict) -> None:
        u = Utterance.safe_from_dict(utterance_dict)
        if u is None:
            return  # malformed frame — warning already logged inside safe_from_dict
        self.buffer.append(u)
        self.transcript_writer.append(u)
        if u.is_final and self.trigger.check(u.text, now=u.timestamp):
            self._log_trigger(u)
            # ingest() may be called from a non-loop thread (e.g. the
            # DeepgramStream pump thread).  asyncio.create_task() requires a
            # running event loop on the calling thread and will raise
            # RuntimeError otherwise.  Use call_soon_threadsafe so the trigger
            # is always scheduled on the event-loop thread regardless of which
            # thread calls ingest().
            if self._loop is not None:
                self._loop.call_soon_threadsafe(self._context_runner._trigger.set)
            else:
                # Fallback for ingest() called before run() (e.g. stdin feed
                # that runs inside a coroutine on the loop thread).
                asyncio.create_task(self._context_runner.trigger_now())

    def _log_trigger(self, u: Utterance) -> None:
        self.trigger.log_fire(self.session.triggers_log, u.text)
        if self._observer is not None:
            try:
                self._observer.on_trigger(at=u.timestamp, phrase=u.text)
            except Exception as e:
                log.warning("observer.on_trigger failed: %s", e)

    async def _run_context(self) -> None:
        latest = self.buffer.latest_timestamp()
        if latest is None:
            return
        dist = await self.context_tier.run(now=latest)
        self.claude_md_writer.write_managed_section(dist.render_markdown())
        if self._observer is not None:
            elapsed = time.monotonic() - self._session_start
            try:
                self._observer.on_context(
                    at=elapsed,
                    topic=dist.topic,
                    decisions_count=len(dist.decisions),
                )
            except Exception as e:
                log.warning("observer.on_context failed: %s", e)

    async def _run_thread(self) -> None:
        latest = self.buffer.latest_timestamp()
        if latest is None:
            return
        baseline = self.context_tier.last.topic
        drift_state = await self.thread_tier.run(baseline_topic=baseline, now=latest)
        log.info("thread tier ran")
        if self._observer is not None:
            elapsed = time.monotonic() - self._session_start
            try:
                self._observer.on_thread(
                    at=elapsed,
                    drift=drift_state.drift,
                    current_topic=drift_state.current_topic,
                    drift_from=drift_state.drift_from,
                )
            except Exception as e:
                log.warning("observer.on_thread failed: %s", e)

    async def _run_immediate(self) -> None:
        latest = self.buffer.latest_timestamp()
        if latest is None:
            return
        out = await self.immediate_tier.run(now=latest)
        log.info("immediate: %s", out.candidates)
        if self._observer is not None:
            elapsed = time.monotonic() - self._session_start
            try:
                self._observer.on_immediate(at=elapsed, candidates=out.candidates)
            except Exception as e:
                log.warning("observer.on_immediate failed: %s", e)

    async def _pause_watcher(self) -> None:
        """Fire ImmediateTier when no new utterance has arrived for >_pause_threshold seconds."""
        while not self._lifecycle.is_stopping:
            await asyncio.sleep(self._pause_check_interval)
            # RES-2 / Fix 7: do NOT fire _run_immediate after _on_shutdown has
            # started tearing down audio — check the flag after each sleep.
            if self._shutting_down:
                return
            latest = self.buffer.latest_timestamp()
            if latest is None:
                continue
            # COST-2: require a minimum number of utterances before the first fire.
            if len(self.buffer.all()) < self._immediate_min_utterances:
                continue
            if self._last_immediate_for_ts == latest:
                continue
            # COST-2: enforce a minimum wall-clock interval between fires.
            now_mono = time.monotonic()
            if now_mono - self._last_immediate_fire_monotonic < self._immediate_min_interval:
                continue
            elapsed = now_mono - self._utterance_received_monotonic
            if elapsed >= self._pause_threshold:
                self._last_immediate_for_ts = latest
                self._last_immediate_fire_monotonic = now_mono
                try:
                    await self._run_immediate()
                except Exception as e:
                    log.warning("immediate tier failed: %s", e)

    async def _on_shutdown(self) -> None:
        # RES-2 / Fix 7: set the flag FIRST so _pause_watcher stops iterating
        # before we tear down audio and run final tier passes.
        self._shutting_down = True

        self._context_runner.stop()
        self._thread_runner.stop()
        if self.audio_source is not None:
            try:
                self.audio_source.stop()
            except Exception:
                pass
        try:
            latest = self.buffer.latest_timestamp()
            if latest is None:
                # FAULT-6: no speech detected — write a stub so the user knows
                # the daemon ran and give actionable guidance.
                log.warning(
                    "spec-lesson: no speech was detected during this session. "
                    "Check that your microphone is selected and not muted."
                )
                stub = (
                    "# spec-lesson session (no speech detected)\n\n"
                    "Session ran but no utterances were received. "
                    "Check that audio capture is configured (mic unmuted, BlackHole installed).\n"
                )
                try:
                    self.session.distillation_md.write_text(stub, encoding="utf-8")
                except OSError:
                    pass
                return

            # FAULT-8: wrap the final context tier run in its own try/except so
            # that an Anthropic 500 at shutdown doesn't prevent session.md from
            # being written.  Fall back to the last successful distillation.
            try:
                dist = await self.context_tier.run(now=latest)
            except Exception as e:
                log.warning("final context tier run failed at shutdown: %s — using last cached distillation", e)
                dist = self.context_tier.last  # last successful distillation

            try:
                self.claude_md_writer.write_managed_section(dist.render_markdown())
            except OSError as e:
                log.warning("could not write CLAUDE.md at shutdown: %s", e)

            all_text = self.buffer.as_text()
            try:
                polished = await self.polish_tier.run(final_distillation=dist, full_transcript=all_text)
                if self.transcript_writer.degraded:
                    polished = (
                        f"> Warning: Transcript writer was degraded during this session: "
                        f"{self.transcript_writer.degradation_reason}\n\n"
                        + polished
                    )
                self.session.distillation_md.write_text(polished, encoding="utf-8")
                if self._observer is not None:
                    try:
                        self._observer.on_polish(at=time.monotonic() - self._session_start)
                    except Exception as e:
                        log.warning("observer.on_polish failed: %s", e)
            except Exception:
                # Polish call failed (e.g. context-window exceeded or network
                # error at shutdown).  Fall back to writing the plain context
                # distillation so the user is not left with an empty file.
                log.exception("PolishTier failed at shutdown — writing context distillation as fallback")
                try:
                    self.session.distillation_md.write_text(dist.render_markdown(), encoding="utf-8")
                except OSError as e:
                    log.warning("could not write distillation fallback: %s", e)
        finally:
            # RES-1 / Fix 6: always close the transcript writer, even if
            # context tier or polish raises — prevents file-handle leaks.
            self.transcript_writer.close()

    def _on_utterance_from_audio(self, utterance_dict: dict) -> None:
        """Bridge callback from audio source: mark wall-clock + ingest."""
        self._utterance_received_monotonic = time.monotonic()
        self.ingest(utterance_dict)

    async def _hud_tick_task(self) -> None:
        """Update observer.tick(elapsed) once per second while not shutting down."""
        while not self._lifecycle.is_stopping:
            await asyncio.sleep(1.0)
            if self._observer is not None:
                elapsed = time.monotonic() - self._session_start
                try:
                    self._observer.tick(elapsed=elapsed)
                except Exception as e:
                    log.warning("observer.tick failed: %s", e)

    async def run(self) -> None:
        # Capture the running event loop so that ingest(), which may be called
        # from a background audio-pump thread, can safely schedule work via
        # loop.call_soon_threadsafe() instead of asyncio.create_task().
        self._loop = asyncio.get_event_loop()
        self._session_start = time.monotonic()
        self._lifecycle.install_signal_handlers()
        self._utterance_received_monotonic = time.monotonic()
        if self.audio_source is not None:
            self.audio_source.on_utterance(self._on_utterance_from_audio)
            self.audio_source.start()
        gather_tasks = [
            self._context_runner.run(),
            self._thread_runner.run(),
            self._pause_watcher(),
        ]
        if self._observer is not None:
            gather_tasks.append(self._hud_tick_task())
        runners = asyncio.gather(*gather_tasks, return_exceptions=True)
        await self._lifecycle.run_until_done()
        # Ensure stop event is set (covers the max_seconds timeout path where
        # run_until_done exits without request_stop() having been called).
        self._lifecycle.request_stop()
        self._context_runner.stop()
        self._thread_runner.stop()
        try:
            await runners
        except Exception:
            pass
