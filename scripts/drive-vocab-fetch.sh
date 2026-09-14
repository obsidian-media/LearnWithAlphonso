#!/usr/bin/env bash
# Drives repeated fetch-vocab-images.ts runs against a term list until it's
# fully covered, merging each round's successes and recomputing what's left,
# with a cooldown between rounds so Pixabay's per-minute rate limit (the
# bottleneck once Pexels' hourly quota is spent) has time to recover.
set -euo pipefail

TERMS_FILE="$1"   # original full term list, e.g. scripts/vocab-terms-missing-en.json
PREFIX="$2"       # output file prefix, e.g. scripts/vocab-images-batch-en
MERGED_OUT="$3"   # final merged results file, e.g. scripts/vocab-images-merged-en.json

set -a; source .env; set +a

ROUND=1
CURRENT="$TERMS_FILE"
NO_RESULT_FILE="${PREFIX}-no-result.json"
echo "[]" > "$NO_RESULT_FILE"
echo "{}" > "$MERGED_OUT"

while true; do
  COUNT=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$CURRENT','utf-8')).length)")
  if [ "$COUNT" -eq 0 ]; then
    echo "All terms covered or exhausted. Done."
    break
  fi
  echo "=== Round $ROUND: $COUNT terms remaining ==="
  OUT="${PREFIX}-r${ROUND}.json"
  LOG="${PREFIX}-r${ROUND}.log"
  node_modules/.bin/tsx scripts/fetch-vocab-images.ts "$CURRENT" "$OUT" 2>&1 | tee "$LOG"

  # Merge this round's successes into the running merged output, and track
  # true "no results" terms (both providers responded but found nothing) so
  # they're excluded from retries -- only rate-limit stops get retried.
  node -e "
    const fs = require('fs');
    const merged = JSON.parse(fs.readFileSync('$MERGED_OUT','utf-8'));
    const round = JSON.parse(fs.readFileSync('$OUT','utf-8'));
    for (const [k,v] of Object.entries(round)) merged[k] = v;
    fs.writeFileSync('$MERGED_OUT', JSON.stringify(merged, null, 2));

    const log = fs.readFileSync('$LOG','utf-8');
    const noResult = JSON.parse(fs.readFileSync('$NO_RESULT_FILE','utf-8'));
    const re = /^ - (.+): no results for query/gm;
    let m;
    while ((m = re.exec(log))) noResult.push(m[1]);
    fs.writeFileSync('$NO_RESULT_FILE', JSON.stringify([...new Set(noResult)], null, 2));

    const all = JSON.parse(fs.readFileSync('$TERMS_FILE','utf-8'));
    const doneKeys = new Set(Object.keys(merged).map(k=>k.toLowerCase()));
    const skip = new Set(noResult.map(k=>k.toLowerCase()));
    const remaining = all.filter(t => {
      const term = Array.isArray(t) ? t[0] : t;
      return !doneKeys.has(term.toLowerCase()) && !skip.has(term.toLowerCase());
    });
    fs.writeFileSync('${PREFIX}-remaining.json', JSON.stringify(remaining, null, 2));
    console.log('merged total:', doneKeys.size, '| no-result:', skip.size, '| remaining:', remaining.length);
  "
  CURRENT="${PREFIX}-remaining.json"
  ROUND=$((ROUND + 1))
  REMAINING_NOW=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$CURRENT','utf-8')).length)")
  if [ "$REMAINING_NOW" -eq 0 ]; then
    echo "All terms covered. Done."
    break
  fi
  if [ "$ROUND" -gt 20 ]; then
    echo "Safety stop after 20 rounds -- something is stuck."
    break
  fi
  echo "Cooling down 75s before next round..."
  sleep 75
done

echo "Final: $MERGED_OUT has $(node -e "console.log(Object.keys(JSON.parse(require('fs').readFileSync('$MERGED_OUT','utf-8'))).length)") entries."
