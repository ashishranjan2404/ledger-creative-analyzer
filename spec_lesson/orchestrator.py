import asyncio
import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from .lifecycle import SessionLifecycle
from .session import Session
from .tiers.client import AnthropicClient
from .tiers.context import ContextTier
from .tiers.thread import ThreadTier
from .tiers.polish import PolishTier
from .tiers.scheduler import PeriodicRunner
from .transcript.buffer import RollingTranscript
from .transcript.persist import TranscriptWriter
from .transcript.utterance import Utterance
from .trigger.detector import TriggerDetector
from .writer.claude_md import ClaudeMdWriter

log = logging.getLogger(__name__)


@dataclass
class OrchestratorConfig:
    thread_interval: float = 120.0    # 2 minutes
    context_interval: float = 300.0   # 5 minutes
    max_seconds: float = 5400.0       # 1.5 hours


class Orchestrator:
    def __init__(self, session: Session, client: AnthropicClient, config: OrchestratorConfig):
        self.session = session
        self.client = client
        self.cfg = config

        self.buffer = RollingTranscript()
        self.transcript_writer = TranscriptWriter(session.transcript_jsonl)
        self.claude_md_writer = ClaudeMdWriter(session.claude_md)

        self.context_tier = ContextTier(client=client, buffer=self.buffer)
        self.thread_tier = ThreadTier(client=client, buffer=self.buffer)
        self.polish_tier = PolishTier(client=client)
        self.trigger = TriggerDetector()

        self._context_runner = PeriodicRunner(
            name="context",
            interval_seconds=config.context_interval,
            callback=self._run_context,
        )
        self._thread_runner = PeriodicRunner(
            name="thread",
            interval_seconds=config.thread_interval,
            callback=self._run_thread,
        )
        self._lifecycle = SessionLifecycle(
            state_dir=session.state_dir,
            max_seconds=config.max_seconds,
        )
        self._lifecycle.on_shutdown(self._on_shutdown)

    def ingest(self, utterance_dict: dict) -> None:
        u = Utterance.from_dict(utterance_dict)
        self.buffer.append(u)
        self.transcript_writer.append(u)
        if u.is_final and self.trigger.check(u.text, now=u.timestamp):
            self._log_trigger(u)
            # fire-and-forget: force context refresh now
            asyncio.create_task(self._context_runner.trigger_now())

    def _log_trigger(self, u: Utterance) -> None:
        line = f"{datetime.now(timezone.utc).isoformat()} | {u.text}\n"
        self.session.triggers_log.parent.mkdir(parents=True, exist_ok=True)
        with self.session.triggers_log.open("a", encoding="utf-8") as fh:
            fh.write(line)

    async def _run_context(self) -> None:
        latest = self.buffer.latest_timestamp()
        if latest is None:
            return  # nothing yet
        dist = await self.context_tier.run(now=latest)
        self.claude_md_writer.write_managed_section(dist.render_markdown())

    async def _run_thread(self) -> None:
        latest = self.buffer.latest_timestamp()
        if latest is None:
            return
        baseline = self.context_tier.last.topic
        await self.thread_tier.run(baseline_topic=baseline, now=latest)
        # HUD integration is Plan 3; Plan 1 just logs
        log.info("thread tier ran")

    async def _on_shutdown(self) -> None:
        self._context_runner.stop()
        self._thread_runner.stop()
        # final context pass
        latest = self.buffer.latest_timestamp()
        if latest is not None:
            dist = await self.context_tier.run(now=latest)
            self.claude_md_writer.write_managed_section(dist.render_markdown())
            # polish
            all_text = self.buffer.as_text()
            polished = await self.polish_tier.run(final_distillation=dist, full_transcript=all_text)
            self.session.distillation_md.write_text(polished, encoding="utf-8")
        self.transcript_writer.close()

    async def run(self) -> None:
        self._lifecycle.install_signal_handlers()
        runners = asyncio.gather(
            self._context_runner.run(),
            self._thread_runner.run(),
            return_exceptions=True,
        )
        await self._lifecycle.run_until_done()
        # after lifecycle exits, stop runners
        self._context_runner.stop()
        self._thread_runner.stop()
        try:
            await runners
        except Exception:
            pass
