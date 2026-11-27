#!/usr/bin/env bash
# setup: install what this repo needs, as its CI does (DASH-111).
# Runs in the job's workspace. Exit 0 passes; the last line says why.
set -o pipefail
echo "+ npm install --no-audit --no-fund"
npm install --no-audit --no-fund || { echo '{"reason": "npm install --no-audit --no-fund failed: see the output above"}'; exit 1; }
echo '{"reason": "npm install --no-audit --no-fund passed"}'
