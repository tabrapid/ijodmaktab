#!/usr/bin/env bash
# Ijod maktabi: ma’lumotlar bazasi va yopiq fayl omborining zaxira nusxasi.
#
# Ishlatish (masalan, har kuni cron orqali; imtihon davrida tez-tez):
#   DATABASE_URL=postgresql://... STORAGE_DIR=/srv/ijod/storage BACKUP_DIR=/srv/ijod/backups \
#   BACKUP_STATUS_FILE=/srv/ijod/backup-status scripts/backup.sh
#
# Natija: $BACKUP_DIR/<UTC vaqt>/{database.dump, storage.tar.gz, SHA256SUMS, CREATED_AT}
# Muvaffaqiyatli tugasa BACKUP_STATUS_FILE ga vaqt yoziladi — super admin panelida ko‘rinadi.
# Tiklash va tekshirish tartibi: docs/zaxira.md
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL belgilanmagan}"
STORAGE_DIR="${STORAGE_DIR:-./apps/api/storage}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"

# Prisma manzilidagi “schema=” parametri pg_dump uchun tushunarsiz — faqat u olib tashlanadi.
PG_URL="$(printf '%s' "$DATABASE_URL" | sed -E 's/([?&])schema=[^&]*&?/\1/; s/[?&]$//')"

umask 077
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
TARGET="$BACKUP_DIR/$STAMP"
mkdir -p "$TARGET"

echo "Baza nusxalanmoqda…"
pg_dump --format=custom --no-owner --file="$TARGET/database.dump" "$PG_URL"

echo "Fayllar nusxalanmoqda…"
# Eksportlar vaqtinchalik (qayta yaratiladi), shuning uchun faqat yuklangan fayllar va karantin olinadi.
AREAS=()
for area in files quarantine; do
  [[ -d "$STORAGE_DIR/$area" ]] && AREAS+=("$area")
done
if [[ ${#AREAS[@]} -gt 0 ]]; then
  tar -C "$STORAGE_DIR" -czf "$TARGET/storage.tar.gz" "${AREAS[@]}"
else
  tar -czf "$TARGET/storage.tar.gz" --files-from /dev/null
fi

( cd "$TARGET" && sha256sum database.dump storage.tar.gz > SHA256SUMS )
date -u +%Y-%m-%dT%H:%M:%SZ > "$TARGET/CREATED_AT"

# Eski nusxalarni tozalash (RETENTION_DAYS kundan eski papkalar).
find "$BACKUP_DIR" -mindepth 1 -maxdepth 1 -type d -mtime +"$RETENTION_DAYS" -exec rm -rf {} +

if [[ -n "${BACKUP_STATUS_FILE:-}" ]]; then
  date -u +%Y-%m-%dT%H:%M:%SZ > "$BACKUP_STATUS_FILE"
fi
echo "Zaxira tayyor: $TARGET"
