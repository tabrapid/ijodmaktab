#!/usr/bin/env bash
# Zaxira nusxasini YANGI (bo‘sh) bazaga va bo‘sh fayl papkasiga tiklaydi.
# Ishlayotgan bazani tasodifan ustidan yozmaslik uchun bo‘sh bo‘lmagan maqsad rad etiladi.
#
# Ishlatish:
#   scripts/restore.sh <zaxira-papka> <maqsad DATABASE_URL> <maqsad STORAGE_DIR>
# So‘ng tekshirish:
#   DATABASE_URL=<maqsad> STORAGE_DIR=<maqsad> pnpm --filter @ijod/api backup:verify
set -euo pipefail

if [[ $# -ne 3 ]]; then
  echo "Foydalanish: scripts/restore.sh <zaxira-papka> <maqsad DATABASE_URL> <maqsad STORAGE_DIR>" >&2
  exit 1
fi
SOURCE="$1"
TARGET_URL="$2"
TARGET_STORAGE="$3"
PG_URL="$(printf '%s' "$TARGET_URL" | sed -E 's/([?&])schema=[^&]*&?/\1/; s/[?&]$//')"

echo "Nazorat yig‘indilari tekshirilmoqda…"
( cd "$SOURCE" && sha256sum --check --quiet SHA256SUMS )

TABLES="$(psql "$PG_URL" -Atc "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'")"
if [[ "$TABLES" != "0" ]]; then
  echo "Maqsad bazada $TABLES ta jadval bor. Tiklash uchun yangi bo‘sh baza yarating." >&2
  exit 2
fi
if [[ -d "$TARGET_STORAGE" && -n "$(ls -A "$TARGET_STORAGE")" ]]; then
  echo "Maqsad fayl papkasi bo‘sh emas: $TARGET_STORAGE" >&2
  exit 2
fi

echo "Baza tiklanmoqda…"
pg_restore --no-owner --exit-on-error --dbname="$PG_URL" "$SOURCE/database.dump"

echo "Fayllar tiklanmoqda…"
mkdir -p "$TARGET_STORAGE"
tar -C "$TARGET_STORAGE" -xzf "$SOURCE/storage.tar.gz"
mkdir -p "$TARGET_STORAGE/files" "$TARGET_STORAGE/quarantine" "$TARGET_STORAGE/exports"

echo "Tiklandi. Endi bog‘lanishlarni tekshiring: pnpm --filter @ijod/api backup:verify (DATABASE_URL va STORAGE_DIR — maqsad)."
