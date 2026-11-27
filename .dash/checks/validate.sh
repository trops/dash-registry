#!/usr/bin/env bash
# validate: what this repo's CI checks (DASH-111). Bots run it as a
# repo check ({ kind: "repo", name: "validate" }); by hand:
#   npx -p @trops/dash-core dash-check validate
set -o pipefail
echo "+ npm run lint"
npm run lint || { echo '{"reason": "npm run lint failed: see the output above"}'; exit 1; }
echo "+ npm test"
npm test || { echo '{"reason": "npm test failed: see the output above"}'; exit 1; }
echo "+ npm run build"
npm run build || { echo '{"reason": "npm run build failed: see the output above"}'; exit 1; }
echo '{"reason": "npm run lint, npm test, npm run build passed"}'
