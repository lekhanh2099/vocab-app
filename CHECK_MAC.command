#!/bin/bash
set -e
cd "$(dirname "$0")"
echo "Node: $(node -v)"
npm run check
echo
echo "✓ Release checks completed."
