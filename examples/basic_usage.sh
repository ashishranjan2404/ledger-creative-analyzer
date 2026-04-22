#!/usr/bin/env bash
# examples/basic_usage.sh — drive spec-lesson headlessly from a fixture
#
# Usage:
#   bash examples/basic_usage.sh
#
# What it does:
#   1. Activates the project venv (if present).
#   2. Starts spec-lesson in fake-API mode so no Anthropic/Deepgram keys are needed.
#   3. Feeds a JSONL meeting transcript from the integration fixture via stdin.
#   4. Caps the session at 5 seconds (SPEC_LESSON_MAX_SECONDS=5).
#   5. Prints the resulting CLAUDE.md managed section.
#
# Prerequisites:
#   pip install -e ".[dev]"          # installs the spec-lesson entry point
#
set -euo pipefail
cd "$(dirname "$0")/.."

# Activate venv when running outside CI (CI installs into the global env).
if [[ -f .venv/bin/activate ]]; then
  # shellcheck source=/dev/null
  source .venv/bin/activate
fi

SPEC_LESSON_FAKE_API=1 SPEC_LESSON_MAX_SECONDS=5 \
  spec-lesson start --transcript-stdin \
  < tests/integration/fixtures/meeting_transcript.jsonl

echo ""
echo "--- CLAUDE.md (managed section) ---"
if [[ -f CLAUDE.md ]]; then
  cat CLAUDE.md
else
  echo "(no CLAUDE.md written — session produced no output)"
fi
