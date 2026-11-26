#!/bin/bash
# The release gate: build (node --check, duplicate names, CSS braces) → smoke on every route → extra suites in tests/suite-*.py
# Prints "GATE PASSED <ver>" only if every step passed.
set -o pipefail; cd "$(dirname "$0")/.."; PORT=${PORT:-8840}
python3 build.py | tee .gate.log || { echo "GATE FAILED: build"; exit 1; }
VER=$(grep -o 'BUILD OK [0-9a-f]*' .gate.log | cut -d' ' -f3)
(cd dist && exec python3 -m http.server $PORT >/dev/null 2>&1) & SV=$!; sleep 1
trap "kill $SV 2>/dev/null" EXIT
python3 tests/smoke.py $PORT ${QUICK:+quick} || { echo "GATE FAILED: smoke"; exit 1; }
for s in tests/suite-*.py tests/suite-*.mjs; do [ -e "$s" ] || continue; echo "== $s"
  case $s in *.py) python3 $s $PORT;; *.mjs) node $s;; esac || { echo "GATE FAILED: $s"; exit 1; }; done
echo "GATE PASSED $VER"
