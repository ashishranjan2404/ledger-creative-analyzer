import asyncio
import logging
import time
from dataclasses import dataclass
from datetime import datetime, timezone
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

log = logging.getLogger(__name__)


class AudioSource(Protocol):
    def on_utterance(self, cb) -> None: ...
    def start(self) -> None: ...
    def stop(self) -> None: ...


@dataclass
class OrchestratorConfig:
    thread_interval: float = 120.0
    context_interval: float = 300.0
    max_seconds: float = 5400.0


class Orchestrator:
    def __init__(
        self,
        session: Session,
        client: AnthropicClient,
        config: OrchestratorConfig,
        audio_source: Optional[AudioSource] = None,
    ):
        self.session = session
        self.client = client
        self.cfg = config
        self.audio_source = audio_source
        self._loop: Optional[asyncio.AbstractEventLoop] = None

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
        self._pause_check_interval = 0.5
        self._pause_threshold = 1.2
        self._last_immediate_for_ts: Optional[float] = None
        self._utterance_received_monotonic = time.monotonic()

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
        line = f"{datetime.now(timezone.utc).isoformat()} | {u.text}\n"
        self.session.triggers_log.parent.mkdir(parents=True, exist_ok=True)
        with self.session.triggers_log.open("a", encoding="utf-8") as fh:
            fh.write(line)

    async def _run_context(self) -> None:
        latest = self.buffer.latest_timestamp()
        if latest is None:
            return
        dist = await self.context_tier.run(now=latest)
        self.claude_md_writer.write_managed_section(dist.render_markdown())

    async def _run_thread(self) -> None:
        latest = self.buffer.latest_timestamp()
        if latest is None:
            return
        baseline = self.context_tier.last.topic
        await self.thread_tier.run(baseline_topic=baseline, now=latest)
        log.info("thread tier ran")

    async def _run_immediate(self) -> None:
        latest = self.buffer.latest_timestamp()
        if latest is None:
            return
        out = await self.immediate_tier.run(now=latest)
        log.info("immediate: %s", out.candidates)

    async def _pause_watcher(self) -> None:
        """Fire ImmediateTier when no new utterance has arrived for >_pause_threshold seconds."""
        while not self._lifecycle._stop_event.is_set():
            await asyncio.sleep(self._pause_check_interval)
            # RES-2 / Fix 7: do NOT fire _run_immediate after _on_shutdown has
            # started tearing down audio — check the flag after each sleep.
            if self._shutting_down:
                return
            latest = self.buffer.latest_timestamp()
            if latest is None:
                continue
            if self._last_immediate_for_ts == latest:
                continue
            elapsed = time.monotonic() - self._utterance_received_monotonic
            if elapsed >= self._pause_threshold:
                self._last_immediate_for_ts = latest
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
            if latest is not None:
                dist = await self.context_tier.run(now=latest)
                self.claude_md_writer.write_managed_section(dist.render_markdown())
                all_text = self.buffer.as_text()
                try:
                    polished = await self.polish_tier.run(final_distillation=dist, full_transcript=all_text)
                    self.session.distillation_md.write_text(polished, encoding="utf-8")
                except Exception:
                    # Polish call failed (e.g. context-window exceeded or network
                    # error at shutdown).  Fall back to writing the plain context
                    # distillation so the user is not left with an empty file.
                    log.exception("PolishTier failed at shutdown — writing context distillation as fallback")
                    self.session.distillation_md.write_text(dist.render_markdown(), encoding="utf-8")
        finally:
            # RES-1 / Fix 6: always close the transcript writer, even if
            # context tier or polish raises — prevents file-handle leaks.
            self.transcript_writer.close()

    def _on_utterance_from_audio(self, utterance_dict: dict) -> None:
        """Bridge callback from audio source: mark wall-clock + ingest."""
        self._utterance_received_monotonic = time.monotonic()
        self.ingest(utterance_dict)

    async def run(self) -> None:
        # Capture the running event loop so that ingest(), which may be called
        # from a background audio-pump thread, can safely schedule work via
        # loop.call_soon_threadsafe() instead of asyncio.create_task().
        self._loop = asyncio.get_event_loop()
        self._lifecycle.install_signal_handlers()
        self._utterance_received_monotonic = time.monotonic()
        if self.audio_source is not None:
            self.audio_source.on_utterance(self._on_utterance_from_audio)
            self.audio_source.start()
        runners = asyncio.gather(
            self._context_runner.run(),
            self._thread_runner.run(),
            self._pause_watcher(),
            return_exceptions=True,
        )
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
