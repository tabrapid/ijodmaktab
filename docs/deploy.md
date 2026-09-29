# Ishlab chiqarishga joylashtirish

Bu qo‘llanma tizimni maktab serverida (yoki VPS’da) ishga tushirish tartibini beradi. Real o‘quvchi
ma’lumotlari kiritilishidan oldin hosting joylashuvi, kirish vakolatlari va saqlash muddatlari maktab bilan
kelishiladi (reja, 16-bo‘lim) — bu hujjat huquqiy muvofiqlik xulosasi emas.

## 1. Tarkib

| Qism           | Nima                                                                   | Port (standart)             |
| -------------- | ---------------------------------------------------------------------- | --------------------------- |
| `apps/api`     | NestJS API (`node dist/main.js`)                                       | 4000 (faqat ichki tarmoqda) |
| `apps/web`     | Next.js veb-ilova (`next start`), `/api/*` so‘rovlarini API ga uzatadi | 3000 (faqat ichki tarmoqda) |
| PostgreSQL 16  | Asosiy baza                                                            | 5432 (faqat ichki tarmoqda) |
| Fayl ombori    | `STORAGE_DIR` papkasi: yuklangan dalillar, karantin, eksportlar        | —                           |
| Teskari proksi | nginx / Caddy: HTTPS, faqat veb-ilovaga yo‘naltiradi                   | 443                         |

Brauzer faqat veb-ilova bilan gaplashadi (bitta manba, cookie `SameSite=Lax`, CORS kerak emas). API va
bazani internetga ochmang.

## 2. Talablar

- Node.js ≥ 22.12, pnpm 10 (`corepack enable`).
- PostgreSQL 16.
- Server soati UTC bo‘lishi tavsiya etiladi; maktab vaqti (Asia/Tashkent) ilovaning o‘zida hisoblanadi.
- `pg_dump`/`pg_restore` (zaxira uchun, `postgresql-client` paketi).

## 3. Baza va rollar

Ikki rol ishlatiladi:

- **egasi (`ijod_owner`)** — jadvallar egasi; faqat migratsiya va zaxira uchun;
- **ilova (`ijod_app`)** — API shu rol bilan ulanadi; audit jurnalini o‘zgartira olmaydi va triggerni
  o‘chira olmaydi (reja, 2-bo‘lim: audit yozuvlarini hech kim odatiy interfeys orqali o‘chira olmaydi).

Superuser sifatida:

```sql
CREATE ROLE ijod_owner LOGIN PASSWORD '...kuchli parol...';
CREATE ROLE ijod_app   LOGIN PASSWORD '...boshqa kuchli parol...';
CREATE DATABASE ijod OWNER ijod_owner;
GRANT CONNECT ON DATABASE ijod TO ijod_app;
```

Migratsiyalarni egasi rolida bajaring (`apps/api` papkasida):

```bash
DATABASE_URL="postgresql://ijod_owner:...@localhost:5432/ijod?schema=public" pnpm db:deploy
```

Yangilashda e’tibor bering: `20260927170000_batch2_features` migratsiyasi avval yaratilgan barcha sessiyalarda
to‘liq ekran nazoratini yoqadi, rejalashtirilgan va ochiq sessiyalar ham bunga kiradi. O‘qituvchilarni oldindan
ogohlantiring. Sessiya sahifasidagi “To‘liq ekran nazorati” qatorida nazoratni boshlanmagan sessiyada yoqish
yoki o‘chirish, ochiq sessiyada esa faqat o‘chirish mumkin. Bu o‘zgarish auditga yoziladi. Allaqachon
to‘xtatilgan o‘quvchilarga “Jonli kuzatuv”da ruxsat beriladi.

So‘ng egasi rolida ilova huquqlarini bering (har yangi migratsiyadan keyin ham qayta ishlatish xavfsiz):

```sql
GRANT USAGE ON SCHEMA public TO ijod_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ijod_app;
REVOKE UPDATE, DELETE, TRUNCATE ON "AuditEvent" FROM ijod_app;
REVOKE ALL ON "_prisma_migrations" FROM ijod_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ijod_app;
```

Tekshiruv (ilova rolida) — ikkalasi ham rad etilishi kerak:

```sql
UPDATE "AuditEvent" SET action = 'x' WHERE id = 1;          -- permission denied
ALTER TABLE "AuditEvent" DISABLE TRIGGER "AuditEvent_no_update"; -- must be owner
```

Bu sozlama amalda sinovdan o‘tkazilgan: API shu cheklangan rol bilan kirish, sessiyalar, bildirishnomalar va
fon vazifalarini xatosiz bajaradi.

## 4. Muhit sozlamalari

`apps/api/.env` (namuna: `apps/api/.env.example`):

| O‘zgaruvchi            | Ishlab chiqarishda                                                                                                                                                                                       |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`             | `production`                                                                                                                                                                                             |
| `DATABASE_URL`         | `ijod_app` roli bilan ulanish                                                                                                                                                                            |
| `PORT`                 | `4000`                                                                                                                                                                                                   |
| `WEB_ORIGIN`           | Tashqi manzil, masalan `https://ijod.maktab.uz` (bir nechta bo‘lsa vergul bilan)                                                                                                                         |
| `APP_ENCRYPTION_KEY`   | 32 baytlik base64: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`. TOTP kalitlari shu bilan shifrlanadi — **yo‘qotmang va almashtirmang** (aks holda 2FA qayta sozlanadi) |
| `COOKIE_SECURE`        | `true` (faqat HTTPS)                                                                                                                                                                                     |
| `TRUST_PROXY`          | `true` (teskari proksi ortida — mijoz IP manzili to‘g‘ri aniqlanadi)                                                                                                                                     |
| `SESSION_TTL_HOURS`    | Faolsizlikdan keyin chiqib ketish muddati (standart 12)                                                                                                                                                  |
| `STORAGE_DIR`          | Masalan `/srv/ijod/storage` (egasi — API jarayoni foydalanuvchisi, huquq `700`)                                                                                                                          |
| `ANSWER_GRACE_SECONDS` | Tarmoq kechikishi uchun muddatdan keyingi qo‘shimcha soniyalar (standart 2)                                                                                                                              |
| `BACKUP_STATUS_FILE`   | Zaxira skripti yozadigan fayl — super admin panelida oxirgi zaxira vaqti ko‘rinadi                                                                                                                       |

`SEED_DEMO_PASSWORD` va `pnpm db:seed` faqat demo uchun — haqiqiy bazada ishlatmang.

`apps/web/.env`: `API_URL=http://127.0.0.1:4000`.

## 5. Yig‘ish va ishga tushirish

```bash
pnpm install --frozen-lockfile
pnpm build                    # shared → api (prisma generate + nest build) → web (next build)
```

systemd namunasi (`/etc/systemd/system/ijod-api.service`):

```ini
[Unit]
Description=Ijod maktabi API
After=network.target postgresql.service

[Service]
User=ijod
WorkingDirectory=/srv/ijod/app/apps/api
ExecStart=/usr/bin/node dist/main.js
Restart=always
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

Veb-ilova uchun xuddi shunday (`WorkingDirectory=/srv/ijod/app/apps/web`,
`ExecStart=/usr/bin/npx next start --port 3000`). API bitta jarayonda ishlaydi: fon vazifalari (muddati
o‘tgan urinishlarni yakunlash, eslatmalar, eksportlar, yetim fayllarni tozalash) shu jarayonning ichida.
Bir nechta API nusxasi ishga tushirilsa, fon vazifalarini faqat bittasida qoldiring (`BACKGROUND_JOBS=off`
qolganlarida).

## 6. HTTPS teskari proksi (nginx)

```nginx
server {
  listen 443 ssl http2;
  server_name ijod.maktab.uz;
  # ssl_certificate ...; ssl_certificate_key ...;

  client_max_body_size 12m;   # fayl chegarasi 10 MB + multipart zaxirasi

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto https;
  }
}
```

## 7. Birinchi super admin

Demo seed ishlatilmaydi. Super admin buyruq qatoridan yaratiladi (egasi yoki ilova roli bilan):

```bash
cd apps/api
pnpm admin:create --login tizim.admin --last Familiya --first Ism --school "Maktab nomi"
```

Vaqtinchalik parol faqat bir marta ko‘rsatiladi. Kirish manzili — `/system/login`; birinchi kirishda parol
almashtiriladi va ikki bosqichli tasdiqlash (TOTP ilovasi) majburiy sozlanadi. Keyin super admin
administrator hisobini yaratadi, administrator esa maktab tuzilmasi va hisoblarni (Excel import bilan)
to‘ldiradi.

## 8. Zaxira

`scripts/backup.sh` ni cron orqali ishga tushiring va tiklashni muntazam sinab ko‘ring — batafsil:
[docs/zaxira.md](zaxira.md).

## 9. Yuklama

Bir vaqtda test topshiradigan eng katta guruh bo‘yicha oldindan sinov o‘tkazing: javob saqlash
(`PUT /api/attempts/:id/answers/:questionId`), heartbeat (20 soniyada bir) va topshirish. Har o‘quvchi uchun
faqat qisqa so‘rovlar yuboriladi; asosiy yuk — PostgreSQL yozuvlari. Imtihon davrida zaxira oralig‘ini
qisqartiring (masalan, har soatda).
