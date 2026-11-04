#!/usr/bin/env bash
# สร้างหน้า FT จาก ft-src (เว็บดาวเทียมเดิม) + ไฟล์ที่แก้ใน overlay/
# ใช้: bash ft-build/build.sh test   → ft-test/ (อ่านอย่างเดียว)
#      bash ft-build/build.sh live   → ft/     (บันทึกได้)
set -euo pipefail
MODE=${1:-test}
ROOT=$(cd "$(dirname "$0")/.." && pwd)
WORK=${WORK:-/tmp/ft-work}
rm -rf "$WORK" && mkdir -p "$WORK" && cp -r "$ROOT/ft-src/." "$WORK/"
cd "$WORK"
rm -rf app/api app/chatgpt-auth.ts app/layout.tsx app/backup-panel.tsx \
  lib/seed.json lib/db.ts lib/backup-sql.ts lib/backup-file.ts lib/overview-cache.ts lib/excel-receipts.ts lib/connector* \
  postcss.config.mjs pnpm-workspace.yaml next.config.ts vite.config.ts package.json pnpm-lock.yaml package-lock.json
cp -r "$ROOT/ft-build/overlay/." "$WORK/"
npm install --no-audit --no-fund
if [ "$MODE" = test ]; then FT_READ_ONLY=1 npx vite build; OUT=ft-test; else npx vite build; OUT=ft; fi
rm -rf "$ROOT/$OUT" && cp -r dist "$ROOT/$OUT"
echo "เสร็จ: $ROOT/$OUT"
