#!/bin/bash
# retry_seedance.sh — keep firing demo_e2e.py every 10 min until it succeeds.
# Intended to run once BytePlus Seedance account overdue balance is cleared.
#
# Run detached:
#   nohup ./retry_seedance.sh > /tmp/ledger/seedance_retry.log 2>&1 &
#
# Kill it:
#   kill $(cat /tmp/ledger/retry_seedance.pid)

set -u

LOG_DIR=/tmp/ledger
mkdir -p "$LOG_DIR"
echo $$ > "$LOG_DIR/retry_seedance.pid"

MAX_ATTEMPTS=18       # ~3 hours at 10 min spacing
SLEEP_BETWEEN=600     # 10 min
REPO_DIR="$(cd "$(dirname "$0")" && pwd)"

for attempt in $(seq 1 "$MAX_ATTEMPTS"); do
  echo ""
  echo "=== Seedance retry attempt $attempt/$MAX_ATTEMPTS at $(date) ==="

  cd "$REPO_DIR" && python3 demo_e2e.py
  exit_code=$?

  if [ $exit_code -eq 0 ]; then
    echo "=== SUCCESS on attempt $attempt at $(date) ==="
    exit 0
  fi

  echo "=== attempt $attempt failed (exit $exit_code); sleeping ${SLEEP_BETWEEN}s ==="
  sleep "$SLEEP_BETWEEN"
done

echo "=== EXHAUSTED $MAX_ATTEMPTS attempts at $(date). Clear the BytePlus bill and rerun manually. ==="
exit 1
