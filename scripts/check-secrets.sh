#!/usr/bin/env bash
# Fails if the service-role key is referenced anywhere except the isolated server-only module,
# the example env file, docs, or this script.
set -euo pipefail
cd "$(dirname "$0")/.."

hits=$(grep -rIn "SERVICE_ROLE" src \
  --include='*.ts' --include='*.tsx' --include='*.js' --include='*.jsx' \
  | grep -v "src/lib/supabase/admin.server.ts" || true)

if [ -n "$hits" ]; then
  echo "ERROR: service-role key referenced outside src/lib/supabase/admin.server.ts:"
  echo "$hits"
  exit 1
fi

if [ -f src/lib/supabase/admin.server.ts ] && ! grep -q "server-only" src/lib/supabase/admin.server.ts; then
  echo "ERROR: admin.server.ts must import 'server-only'"
  exit 1
fi

echo "secret check passed"
