# Zaxira nusxa va tiklash

Reja, 16-bo‘lim: zaxira nusxadan tiklash amalda tekshiriladi. 19-bo‘lim, 12-ssenariy: zaxiradan tiklangan
tizim hisoblar, javoblar va fayllar bog‘lanishini saqlashi kerak. Bu hujjat shu tekshiruvning tartibi.

## Nimalar saqlanadi

| Qism                 | Qanday                                                             | Izoh                                                                                |
| -------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| PostgreSQL bazasi    | `pg_dump --format=custom`                                          | Hisoblar, sinflar, testlar, urinishlar, javoblar, baholash tarixi, portfolio, audit |
| Fayl ombori          | `STORAGE_DIR/files` va `STORAGE_DIR/quarantine` → `storage.tar.gz` | Portfolio dalillari. Eksport fayllari vaqtinchalik — ular qayta yaratiladi          |
| Nazorat yig‘indilari | `SHA256SUMS`                                                       | Tiklashdan oldin fayllar butunligi tekshiriladi                                     |

`APP_ENCRYPTION_KEY` zaxiraga **kirmaydi**, lekin usiz tiklangan tizimda ikki bosqichli kirish kalitlarini
ochib bo‘lmaydi. Uni alohida, xavfsiz joyda (masalan, maktab rahbariyatidagi muhrlangan konvertda yoki
parol menejerida) saqlang.

## Zaxira olish

```bash
DATABASE_URL="postgresql://ijod_owner:...@localhost:5432/ijod?schema=public" \
STORAGE_DIR=/srv/ijod/storage \
BACKUP_DIR=/srv/ijod/backups \
BACKUP_STATUS_FILE=/srv/ijod/backup-status \
BACKUP_RETENTION_DAYS=14 \
scripts/backup.sh
```

Natija: `/srv/ijod/backups/<UTC vaqt>/{database.dump, storage.tar.gz, SHA256SUMS, CREATED_AT}`.
Muvaffaqiyatli tugaganda `BACKUP_STATUS_FILE` ga vaqt yoziladi — super admin panelidagi “Zaxira” kartasi shu
faylni o‘qiydi (API da ham `BACKUP_STATUS_FILE` ko‘rsatilgan bo‘lishi kerak).

Tavsiya etiladigan jadval (cron, server vaqti UTC):

```cron
# Har kuni 21:15 UTC (Toshkent 02:15)
15 21 * * * ijod /srv/ijod/app/scripts/backup.sh >> /var/log/ijod-backup.log 2>&1
# Imtihon haftalarida — har soatda (08:00–18:00 Toshkent)
5 3-13 * * 1-6 ijod /srv/ijod/app/scripts/backup.sh >> /var/log/ijod-backup.log 2>&1
```

Nusxalarning kamida bittasini boshqa jismoniy joyga (boshqa server yoki shifrlangan tashqi disk) ko‘chiring.
Maksimal yo‘qotilishi mumkin bo‘lgan oraliq (RPO) va tiklash muddati (RTO) maktab bilan kelishiladi; imtihon
davrida kunlik zaxiraning o‘zi yetarli emas.

## Tiklash

Tiklash har doim **yangi bo‘sh** bazaga va **bo‘sh** fayl papkasiga qilinadi — skript ishlayotgan bazani
ustidan yozishni rad etadi.

```bash
# 1) Yangi baza (superuser yoki CREATEDB huquqi bilan)
createdb -O ijod_owner ijod_restored

# 2) Tiklash
scripts/restore.sh /srv/ijod/backups/20260927T211500Z \
  "postgresql://ijod_owner:...@localhost:5432/ijod_restored?schema=public" \
  /srv/ijod/storage-restored

# 3) Bog‘lanishlarni tekshirish (quyida)
# 4) Ilova rolining huquqlarini qayta bering (docs/deploy.md, 3-bo‘lim)
# 5) API ning DATABASE_URL va STORAGE_DIR qiymatlarini yangi joyga o‘zgartirib, qayta ishga tushiring
```

## Tiklashni tekshirish (12-ssenariy)

`pnpm backup:verify` (`apps/api` papkasida) bazada va diskda quyidagilarni tekshiradi:

1. har bir urinish o‘z tayinloviga (o‘quvchi va sessiya) mos;
2. har bir javob shu sessiya testidagi savolga tegishli;
3. portfolio dalili egasining o‘z fayli;
4. har bir fayl yozuvi uchun diskda fayl bor va SHA-256 yig‘indisi mos;
5. audit jurnalini himoyalovchi trigger tiklangan.

`--json` rejimida esa bo‘limlar bo‘yicha “barmoq izi” chiqadi: foydalanuvchilar (login, parol xeshi, rollar),
sinfga a’zolik, sessiyalar, urinishlar (ballar bilan), javoblar, baholash tarixi, portfolio, fayllar va audit
yozuvlarining tartiblangan xeshi.

Tartib:

```bash
cd apps/api

# Zaxira olishdan oldin — asl tizim (yozuvlar to‘xtatilgan paytda, masalan tunda):
DATABASE_URL=<asl> STORAGE_DIR=<asl ombor> pnpm backup:verify --json > oldin.json

# Tiklangandan keyin — yangi tizim:
DATABASE_URL=<tiklangan> STORAGE_DIR=<tiklangan ombor> pnpm backup:verify --json > keyin.json

diff oldin.json keyin.json && echo "Tiklash to‘liq: bog‘lanishlar va fayllar saqlangan"
```

Ikki fayl bir xil bo‘lishi, `problems` ro‘yxati bo‘sh bo‘lishi va chiqish kodi `0` bo‘lishi kerak.
Keyin brauzerda qo‘lda tekshiring: bir o‘quvchi bilan kirish, uning natijasi va portfolio dalilini ochish,
o‘qituvchi bilan sessiya natijalarini Excelga eksport qilish.

Bu tartib ishlab chiqish muhitida sinab ko‘rilgan: demo baza + portfolio fayli bilan zaxira → yangi bazaga
tiklash → `backup:verify --json` natijalari to‘liq bir xil chiqdi; fayl ataylab buzilganda tekshiruv
“nazorat yig‘indisi mos emas” deb xato qaytardi, bo‘sh bo‘lmagan bazaga tiklash esa rad etildi.

## Tekshiruv jurnali

Har tiklash sinovidan so‘ng qayd eting: sana, zaxira nomi, tiklash davomiyligi, `backup:verify` natijasi,
qo‘lda tekshirgan xodim. Kamida har chorakda va har yirik yangilanishdan oldin takrorlang.
