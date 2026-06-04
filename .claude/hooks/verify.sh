#!/bin/bash
# Verification gate — run after substantial changes.
set -e
echo "Running verification gate..."
pnpm build
pnpm check
pnpm test
echo "All checks passed."
