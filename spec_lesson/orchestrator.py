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
from typing import Any, Callable, Optional, Protocol

from .audio_ingress import AudioIngress
from .audio_ingress import AudioSource  # re-export for callers that import from here
from .lifecycle import SessionLifecycle
from .session import Session
from .tiers.client import AnthropicClient
from .tiers.context import ContextTier
from .tiers.thread import ThreadTier
from .tiers.polish import PolishTier
from .tiers.immediate import ImmediateTier
from .tiers.scheduler import PeriodicRunner
from .transcript.utterance import Utterance
from .writer.claude_md import ClaudeMdWriter
from .hud.observer import HudObserver

log = logging.getLogger(__name__)


UtteranceCallback = Callable[[dict[str, Any]], None]


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


@dataclass
class _PauseWatcherState:
    """Encapsulates pause-detection state and logic for the Immediate tier gate.

    Extracted from Orchestrator to consolidate the four scattered rate-limit
    fields (check_interval, pause_threshold, min_utterances, min_interval) and
    reduce cyclomatic complexity of ``_pause_watcher`` from 8 branches to 2.
    """
    check_interval: float
    pause_threshold: float
    min_utterances: int
    min_interval: float
    last_fired_for_ts: Optional[float] = None
    last_fired_monotonic: float = 0.0

    def should_fire(
        self,
        latest_ts: Optional[float],
        utterance_count: int,
        now_mono: float,
        last_utterance_mono: float,
    ) -> bool:
        """Return True iff all gates pass and a pause has been detected.

        *last_utterance_mono*: monotonic timestamp of the most recent utterance,
        sourced from ``ingress.last_utterance_monotonic``.
        """
        if latest_ts is None:
            return False
        if utterance_count < self.min_utterances:
            return False
        if self.last_fired_for_ts == latest_ts:
            return False
        if now_mono - self.last_fired_monotonic < self.min_interval:
            return False
        elapsed_since_speech = now_mono - last_utterance_mono
        return elapsed_since_speech >= self.pause_threshold

    def mark_fired(self, latest_ts: float, now_mono: float) -> None:
        """Record that the Immediate tier just fired for *latest_ts*."""
        self.last_fired_for_ts = latest_ts
        self.last_fired_monotonic = now_mono


class Orchestrator:
    """Wire and run all spec-lesson subsystems for one session.

    Owns tier runners (context, thread, immediate), ``ClaudeMdWriter``,
    ``AudioIngress`` (which owns the buffer, transcript writer, and trigger
    detector), and ``SessionLifecycle``.  ``run()`` is the top-level
    coroutine; ``ingest()`` is the thread-safe intake point for utterance
    dicts from any source.
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
        self._observer = observer
        self._loop: Optional[asyncio.AbstractEventLoop] = None
        self._session_start: float = time.monotonic()

        self.ingress = AudioIngress(
            transcript_path=session.transcript_jsonl,
            triggers_log_path=session.triggers_log,
            audio_source=audio_source,
            on_trigger_fired=self._on_trigger_fired,
        )

        # Convenience aliases kept for backward compatibility: existing tests
        # (and callers) may reference orch.buffer, orch.transcript_writer,
        # orch.trigger directly.
        self.buffer = self.ingress.buffer
        self.transcript_writer = self.ingress.transcript_writer
        self.trigger = self.ingress.trigger

        self.claude_md_writer = ClaudeMdWriter(session.claude_md)

        self.context_tier = ContextTier(client=client, buffer=self.buffer)
        self.thread_tier = ThreadTier(client=client, buffer=self.buffer)
        self.polish_tier = PolishTier(client=client)
        self.immediate_tier = ImmediateTier(client=client, buffer=self.buffer)

        self._context_runner = PeriodicRunner(name="context", interval_seconds=config.context_interval, callback=self._run_context)
        self._thread_runner = PeriodicRunner(name="thread", interval_seconds=config.thread_interval, callback=self._run_thread)
        self._lifecycle = SessionLifecycle(state_dir=session.state_dir, max_seconds=config.max_seconds)
        self._lifecycle.on_shutdown(self._on_shutdown)

        # COST-2 / pause detection: all rate-limit state lives in one dataclass.
        self._pause_watcher_state = _PauseWatcherState(
            check_interval=config.pause_check_interval,
            pause_threshold=config.pause_threshold,
            min_utterances=config.immediate_min_utterances,
            min_interval=config.immediate_min_interval,
        )

        # RES-2 / Fix 7: shutdown guard — set to True as the FIRST action
        # inside _on_shutdown so _pause_watcher stops before teardown begins.
        self._shutting_down: bool = False

    def ingest(self, utterance_dict: dict) -> None:
        """Thread-safe utterance intake.  Thin delegate to ``AudioIngress.ingest()``."""
        self.ingress.ingest(utterance_dict)

    def override_pause_settings(
        self,
        *,
        check_interval: Optional[float] = None,
        pause_threshold: Optional[float] = None,
        min_utterances: Optional[int] = None,
        min_interval: Optional[float] = None,
    ) -> None:
        """Test-only: override pause watcher settings after construction."""
        pw = self._pause_watcher_state
        if check_interval is not None:
            pw.check_interval = check_interval
        if pause_threshold is not None:
            pw.pause_threshold = pause_threshold
        if min_utterances is not None:
            pw.min_utterances = min_utterances
        if min_interval is not None:
            pw.min_interval = min_interval

    def _on_trigger_fired(self, u: Utterance) -> None:
        """Schedule context runner and notify HUD observer when a trigger phrase fires.

        AudioIngress has already written the trigger log entry.
        """
        # ingest()/on_trigger_fired may be called from a non-loop thread (e.g.
        # the DeepgramStream pump thread).  Use call_soon_threadsafe when the
        # loop is available; fall back to create_task for the stdin-feed case
        # where ingest() is called from inside a coroutine on the loop thread.
        if self._loop is not None:
            self._loop.call_soon_threadsafe(self._context_runner._trigger.set)
        else:
            asyncio.create_task(self._context_runner.trigger_now())

        if self._observer is not None:
            try:
                elapsed = time.monotonic() - self._session_start
                self._observer.on_trigger(at=elapsed, phrase=u.text)
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
        """Fire ImmediateTier when no new utterance has arrived for >pause_threshold seconds."""
        pw = self._pause_watcher_state
        # FAULT-5: track the monotonic clock at each tick so we can detect a
        # system suspend/hibernate.  On Linux, CLOCK_MONOTONIC advances during
        # sleep, so a gap >> check_interval means the machine was asleep.  On
        # macOS, CLOCK_UPTIME_RAW does NOT advance during sleep, so the gap
        # stays small — the macOS case is harmless but we apply the same guard
        # for consistency.  If the gap is absurdly large (>3600 s), reset the
        # last-utterance reference to now so the stale pause-detection state
        # does not cause a spurious ImmediateTier fire on resume.
        _last_tick_mono: float = time.monotonic()
        while not self._lifecycle.is_stopping:
            await asyncio.sleep(pw.check_interval)
            # RES-2 / Fix 7: do NOT fire _run_immediate after _on_shutdown has
            # started tearing down audio — check the flag after each sleep.
            if self._shutting_down:
                return
            now_mono = time.monotonic()
            # FAULT-5: suppress spurious fire on resume from hibernate.
            tick_gap = now_mono - _last_tick_mono
            _last_tick_mono = now_mono
            if tick_gap > 3600.0:
                log.warning(
                    "spec-lesson: large monotonic gap (%.0fs) — likely resumed from suspend; "
                    "skipping ImmediateTier fire to avoid stale-state spurious call.",
                    tick_gap,
                )
                continue
            latest = self.buffer.latest_timestamp()
            if pw.should_fire(latest, len(self.buffer.all()), now_mono,
                              last_utterance_mono=self.ingress.last_utterance_monotonic):
                pw.mark_fired(latest, now_mono)  # type: ignore[arg-type]
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
        self.ingress.stop()
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
            self.ingress.close()

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
        # Capture the running event loop so that _on_trigger_fired(), which may
        # be called from a background audio-pump thread, can safely schedule
        # work via loop.call_soon_threadsafe() instead of asyncio.create_task().
        self._loop = asyncio.get_event_loop()
        self._session_start = time.monotonic()
        self._lifecycle.install_signal_handlers()
        self.ingress.start()
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
