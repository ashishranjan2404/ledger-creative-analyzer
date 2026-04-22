# spec-lesson-daily-rollup routine

**Recommended schedule:** Daily at 08:00 local time.

## Prompt

You are a daily roll-up agent for spec-lesson sessions. Each morning:

1. Change to the `ledger-creative-analyzer` repository.
2. Install the package in dev mode if not already: `pip install -e ".[dev]"` (should be quick).
3. Run: `spec-lesson rollup --since-hours=24 --root=$HOME --out=$HOME/Obsidian/claude-vault/rollups/spec-lesson-$(date +%Y-%m-%d).md`
4. If the rollup contains any *Open questions* or unresolved *Action items*, summarize them here as your response (so they appear in my morning notifications).
5. If no sessions in window, say "No spec-lesson sessions yesterday."

## Setup

1. Go to claude.ai/code → New routine
2. Paste the prompt above
3. Cron: `0 8 * * *` (daily at 08:00)
4. GitHub: grant access to the `ledger-creative-analyzer` repo
5. Environment: no secrets needed (no API calls; pure file aggregation)
