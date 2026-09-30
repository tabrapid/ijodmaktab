# Ijod maktabi

O‘quvchi va o‘qituvchilar portfoliosi, onlayn nazorat ishlari (kod, taymer, avtomatik saqlash, baholash) va
natijalar tahlili tizimi. Talablar: [docs/reja.md](docs/reja.md).

**Stack:** Next.js 16 (App Router, React 19, Tailwind CSS 4) · NestJS 12 · PostgreSQL 16 · Prisma 7 ·
TypeScript · pnpm monorepo.

## Imkoniyatlar

| Rol                                   | Nimalar mumkin                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **O‘quvchi**                          | O‘zi ro‘yxatdan o‘tish (`/register`: hujjatdagi F.I.Sh., tug‘ilgan sana, JSHSHIR — ixtiyoriy, sinf), kod bilan testga kirish, test to‘liq ekranda (chiqsa — test to‘xtaydi, o‘qituvchi ruxsati bilan davom etadi), server taymeri bilan topshirish (internet uzilsa javoblar saqlanib, tiklanganda yuboriladi), natija va kategoriyalar bo‘yicha tahlil, portfolio: Milliy sertifikat, CEFR, IELTS, SAT, olimpiada va ijodiy ishlar, tekshiruvga yuborish, PDF chop etish                                                                                                                                                  |
| **O‘qituvchi**                        | O‘zi ro‘yxatdan o‘tish (o‘rinbosar tasdiqlagach kiradi); “Ma’lumotnoma”: OTM, ilmiy daraja, malaka toifasi, milliy va xalqaro sertifikatlar, kurslar va tanlovlar (hujjatlar bilan), o‘quvchi sertifikatlariga bir tugma bilan ustozlik; savollar banki, 10 bosqichli test ustasi, maktab test banki, “Yangi sessiya” oqimi (o‘z / ulashilgan / bank testi, asl testni o‘zgartirmasdan qo‘shimcha savollar), sessiyalar: jonli kuzatuv (to‘xtatilgan o‘quvchiga ruxsat berish, vaqt qo‘shish), natijalar, savollar tahlili, qayta baholash, javoblar matritsasi, Excel/Word eksport; sinflar va o‘quvchi natijalari tarixi |
| **Sinf rahbari**                      | O‘qituvchi imkoniyatlari + o‘z sinfi portfoliolarini o‘quvchi bo‘yicha guruhlab tasdiqlash (nima yangi yoki o‘zgargani ko‘rinadi), sinfdagi sessiyalar natijalari                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| **Rahbariyat** (direktor o‘rinbosari) | Maktab ko‘rsatkichlari; “O‘quvchilar”: barcha o‘quvchilar 11-sinfdan 7-sinfgacha, sinf kartochkalari (sinf rahbarini tayinlash), o‘quvchi profili (shaxsiy ma’lumotlar, portfolio, natijalar, yangi parol berish); “Ro‘yxatdan o‘tish”: o‘qituvchi arizalarini tasdiqlash, yangi o‘quvchilar, ro‘yxatdan o‘tishni ochish/yopish; “Portfoliolar”: katalog, jamlangan portfolio, ZIP, tasdiqlash; test banki va test o‘tkazish; o‘qituvchi va o‘quvchi hisoblarini yaratish; o‘qituvchilar ma’lumotnomasini ko‘rish; cheklangan audit                                                                                        |
| **Administrator**                     | Hisoblar (bittalab yoki Excel import: ustunlarni moslashtirish, xatolarni yuklab olish), rollar, bloklash/parol tiklash, o‘quv yili, fanlar, sinflar, biriktirishlar. O‘quv natijalarini ko‘rmaydi                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **Super admin**                       | Alohida kirish (`/system/login`) va majburiy ikki bosqichli tasdiqlash; tizim holati, xavfsizlik hodisalari, zaxira holati, xatoliklar, audit                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |

Hamma rollar uchun: yorug‘ / qorong‘u / tizim bo‘yicha mavzu, profil rasmi (yuqori o‘ng burchakdagi menyu yoki
_Profil_ sahifasi).

Natijalar formulalari (reja, 9-bo‘lim) `packages/shared` da bitta joyda: umumiy foiz = Σ olingan / Σ maksimal
ball; kategoriya o‘zlashtirishi va mezonga yetganlar (yakunlaganlardan va tayinlanganlardan alohida);
qatnashish; boshlamaganlar o‘rtachaga 0 sifatida qo‘shilmaydi, nol olgan yakunlangan ish esa haqiqiy 0;
bir nechta urinishda — oldindan belgilangan siyosat (birinchi / oxirgi / eng yaxshi). Ekran va eksport aynan
bir xil hisob-kitobdan foydalanadi. Har ko‘rsatkich surat va maxraj bilan ko‘rsatiladi.

## Tuzilma

```
apps/api        NestJS API: auth, users, structure, questions, tests, sessions, attempts, grading,
                results, exports, portfolio, files, dashboard, audit, notifications, jobs
apps/api/prisma Prisma sxemasi, migratsiyalar, demo seed
apps/web        Next.js veb-ilova (/api/* so‘rovlari API ga proksi qilinadi — bitta manba)
packages/shared Enumlar va o‘zbekcha nomlar, zod sxemalar, baholash/ko‘rsatkich formulalari, vaqt (Asia/Tashkent)
scripts         Zaxira va tiklash skriptlari
docs            Reja, joylashtirish va zaxira qo‘llanmalari
```

## Mahalliy ishga tushirish

Kerak bo‘ladi:

- **Node.js 22 LTS** (≥ 22.12) — https://nodejs.org
- **pnpm 10** — `corepack enable` (Windows’da administrator sifatida) yoki `npm install -g pnpm@10`
- **Git**
- **PostgreSQL 16** — eng osoni **Docker Desktop** orqali (quyida). Docker bo‘lmasa, PostgreSQL 16 ni
  o‘rnating va “Dockersiz” bo‘limidagi SQL ni bajaring.

Docker Desktop ochiq bo‘lsin. Buyruqlar macOS/Linux terminalida ham, Windows PowerShell’da ham bir xil ishlaydi:

```bash
git clone -b claude/confident-sagan-g9fdfs https://github.com/tabrapid/ijodmaktab.git
cd ijodmaktab
pnpm install          # bog‘liqliklar (Prisma klienti ham avtomatik yaratiladi)
pnpm local:setup      # .env va shifrlash kaliti, Docker’da PostgreSQL, migratsiyalar, demo ma’lumotlar
pnpm dev              # veb: http://localhost:3000, API: http://localhost:4000/api
```

`pnpm local:setup` 5432-portda kompyuterdagi boshqa PostgreSQL (Homebrew, Postgres.app) javob berayotganini
o‘zi aniqlaydi: Docker bazasini bo‘sh portga ko‘chiradi (loyiha ildizidagi `.env` → `POSTGRES_PORT`) va
`apps/api/.env` dagi manzillarni moslaydi. Uni qayta ishga tushirish xavfsiz — tayyor qadamlar o‘zgarmaydi.

Qadamlarni qo‘lda bajarish:

```bash
docker compose up -d                       # PostgreSQL 16 + test uchun ijod_test bazasi
pnpm env:setup                             # .env fayllari va shifrlash kaliti (APP_ENCRYPTION_KEY)
pnpm --filter @ijod/shared build
pnpm db:deploy                             # jadvallar (migratsiyalar)
pnpm db:seed                               # demo maktab (faqat mahalliy!)
pnpm dev
```

`pnpm dev` ishga tushgach brauzerda **http://localhost:3000** ni oching. To‘xtatish — terminalda `Ctrl+C`,
bazani to‘xtatish — `docker compose down`.

### Yangi versiyani olgandan keyin (`git pull`)

Yangi versiyada kutubxonalar yoki baza migratsiyalari qo‘shilgan bo‘lishi mumkin, shuning uchun har `git pull`
dan keyin:

```bash
pnpm install          # yangi kutubxonalar (masalan, sharp, jszip, shriftlar)
pnpm db:deploy        # yangi migratsiyalar
pnpm dev
```

Yangi demo ma’lumotlarni ko‘rish uchun `pnpm db:deploy` o‘rniga `pnpm db:reset` ni bajaring — u mahalliy
bazani **tozalab**, qaytadan to‘ldiradi (o‘zingiz kiritgan ma’lumotlar o‘chadi).

### Dockersiz (o‘rnatilgan PostgreSQL 16)

`psql` yoki pgAdmin’da superuser sifatida:

```sql
CREATE USER ijod WITH PASSWORD 'ijod' CREATEDB;
CREATE DATABASE ijod OWNER ijod;
CREATE DATABASE ijod_test OWNER ijod;
```

So‘ng yuqoridagi qadamlarni `docker compose up -d` siz davom ettiring.

### Tez-tez uchraydigan muammolar

| Belgi                                                                                                 | Yechim                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `P1010: User was denied access on the database (not available)` yoki `port 5432 is already allocated` | 5432-portni kompyuterdagi boshqa PostgreSQL (Homebrew, Postgres.app) band qilgan va so‘rovlar Docker’dagi bazaga emas, o‘shanga boryapti (u yerda `ijod` foydalanuvchisi yo‘q). Eng osoni: `pnpm local:setup` (portni o‘zi almashtiradi). Qo‘lda: loyiha ildizida `.env` fayliga `POSTGRES_PORT=5433` yozing, `docker compose up -d`, so‘ng `apps/api/.env` dagi ikkala manzilda `localhost:5432` → `localhost:5433`. Yoki boshqa PostgreSQL’ni to‘xtating (`brew services stop postgresql@16` / Postgres.app’dan chiqish) |
| `APP_ENCRYPTION_KEY 32 baytlik base64 qiymat bo‘lishi kerak`, veb jurnalida `ECONNREFUSED ...:4000`   | `pnpm env:setup` ni bajaring va `pnpm dev` ni qayta ishga tushiring (`.env` o‘zgarishi avtomatik o‘qilmaydi)                                                                                                                                                                                                                                                                                                                                                                                                               |
| `Cannot find module .../generated/prisma/client.js`                                                   | `pnpm --filter @ijod/api db:generate`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `Cannot find module 'jszip'` / `'sharp'` yoki `Can't resolve '@fontsource-variable/...'`              | `git pull` dan keyin `pnpm install` bajarilmagan — bajaring va `pnpm dev` ni qayta ishga tushiring                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 3000 yoki 4000 port band                                                                              | Band qilgan dasturni yoping. Aks holda: veb porti — `apps/web/package.json` (`--port`) va `apps/api/.env` dagi `WEB_ORIGIN`; API porti — `apps/api/.env` dagi `PORT` va `apps/web/.env` dagi `API_URL`                                                                                                                                                                                                                                                                                                                     |
| Kirishda “So‘rov ruxsat etilmagan manbadan yuborilgan” xatosi                                         | Brauzerdagi manzil `apps/api/.env` dagi `WEB_ORIGIN` bilan bir xil bo‘lsin (`http://localhost:3000`, `127.0.0.1` emas)                                                                                                                                                                                                                                                                                                                                                                                                     |
| Demo ma’lumotlarni boshidan tiklash                                                                   | `pnpm db:reset` (mahalliy bazani tozalab, qayta to‘ldiradi)                                                                                                                                                                                                                                                                                                                                                                                                                                                                |

### Sinab ko‘rish ssenariysi

Ikki xil rolni bir vaqtda sinash uchun ikkinchi foydalanuvchini **boshqa brauzerda yoki inkognito oynada**
oching (bir brauzerda faqat bitta kirish sessiyasi saqlanadi).

1. **O‘qituvchi** `d.karimova` → _Sessiyalar_ → “Algebra … 9-A” (ochiq) → _Jonli kuzatuv_.
2. **O‘quvchi** `ali.aliyev` (inkognito) → _Kodni kiritish_: **KV2026** → qoidalarga rozilik → _Testni boshlash_.
   Javob belgilang — o‘qituvchi ekranida javoblar soni yangilanadi. Internetni vaqtincha o‘chirib ko‘ring:
   javoblar navbatda saqlanadi va aloqa tiklanganda yuboriladi.
3. O‘quvchi _Topshirish_ → natija va kategoriyalar ko‘rinadi.
4. O‘qituvchi → _Natijalar_ → filtrlar, taqsimot grafigi (_Jadval_ tugmasi), _Excel_ / _Word hisobot_;
   _Savollar tahlili_ → _Qayta baholash_; yopilgan “9-B” sessiyasida to‘liq natijalar bor.
5. O‘qituvchi → _Testlar va bank_ → _Yangi test_ — 10 bosqichli usta orqali o‘z testingizni yarating; tayyor
   testni _Maktab bankiga chiqarish_ mumkin. _Sessiyalar_ → _Yangi sessiya_ — o‘z, ulashilgan yoki bankdagi
   testni tanlab (xohlasangiz nusxaga qo‘shimcha savol qo‘shib) sessiya yarating. `m.tursunova` bankdagi algebra
   testidan 9-B uchun sessiya yarata oladi.
6. **To‘liq ekran nazorati:** o‘quvchi testni boshlaganda sahifa to‘liq ekranga o‘tadi. `Esc` bosib chiqsa yoki
   boshqa oynaga o‘tsa, test darhol to‘xtaydi; o‘qituvchining _Jonli kuzatuv_ sahifasida o‘quvchi qizil rangda
   yuqorida chiqadi va bildirishnoma keladi. _Ruxsat berish_ (xohlasa qo‘shimcha daqiqa bilan) bosilgach o‘quvchi
   _Davom etish_ orqali testga qaytadi.
7. **Rahbariyat** `n.rahbarova` → _Portfoliolar_: o‘quvchilar katalogi → “Abduganiyev Jaloliddin” → jamlangan
   portfolio (IELTS, SAT, Milliy sertifikat, olimpiada), _Sertifikatlarni yuklab olish (ZIP)_; _Tasdiqlash_
   yorlig‘ida o‘zgargan sertifikat (B+ → A) farqi bilan ko‘rinadi. _Foydalanuvchilar_ → o‘qituvchi yoki o‘quvchi
   hisobini yarating — login va vaqtinchalik parol ko‘rsatiladi va chop etiladi. **Administrator** `admin` →
   foydalanuvchilar, Excel import.
8. **Ro‘yxatdan o‘tish:** kirish sahifasidagi _Ro‘yxatdan o‘tish_ → _O‘quvchi sifatida_ — F.I.Sh. hujjatdagidek
   (katta harf yoki `'` bilan yozilsa ham to‘g‘rilanadi), tug‘ilgan sana, JSHSHIR (ID-karta bo‘lsa), sinf, login va
   parol → darhol kiradi. _O‘qituvchi sifatida_ ro‘yxatdan o‘tgan hisob (masalan, demo `s.nazarova`) direktor
   o‘rinbosari `n.rahbarova` → _Ro‘yxatdan o‘tish_ sahifasida tasdiqlagach ishlaydi. Login yoki parolni unutgan
   o‘quvchiga o‘rinbosar _O‘quvchilar_ → o‘quvchi → _Hisob_ → _Yangi parol berish_ orqali vaqtinchalik parol beradi.
9. **O‘quvchilar bo‘limi** (`n.rahbarova`): _Barcha o‘quvchilar_ — 11-A dan 7-D gacha; _Sinflar_ — kartochkada sinf
   rahbari, bo‘sh sinfga _Tayinlash_ (masalan, `r.olimov`); o‘quvchini bosing — profil, portfolio va natijalari.
10. **Ma’lumotnoma** (`d.karimova` → _Ma’lumotnoma_): toifa hujjati, sertifikatlar; 10–11-bandlarda o‘quvchini
    tanlab (“Abduganiyev”) mos tasdiqlangan sertifikatiga _Ustozlik qildim_. O‘rinbosar o‘qituvchining
    ma’lumotnomasini _Foydalanuvchilar_ → o‘qituvchi → _Ma’lumotnoma_ orqali ko‘radi.
11. **Super admin** `superadmin` → http://localhost:3000/system/login (telefonda Google Authenticator yoki shunga
    o‘xshash TOTP ilova kerak — birinchi kirishda QR kod skanerlanadi).

### Demo hisoblar

Parol hammasiga: `Demo2026!` (`SEED_DEMO_PASSWORD`).

| Login                                                                            | Rol                               | Izoh                                                                                                   |
| -------------------------------------------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `d.karimova`                                                                     | O‘qituvchi                        | Matematika; 9-A sinf rahbari; ochiq va yakunlangan sessiyalari bor; to‘ldirilgan ma’lumotnoma namunasi |
| `m.tursunova`                                                                    | O‘qituvchi                        | 9-B sinf rahbari; Matematika (9-B) — maktab bankidagi algebra testidan o‘z sinfiga sessiya yaratadi    |
| `j.rahimov`                                                                      | O‘qituvchi                        | 10-A sinf rahbari                                                                                      |
| `b.yusupov`                                                                      | Direktor o‘rinbosari + o‘qituvchi | Rahbariyat paneli; Tarix (10-A)                                                                        |
| `n.rahbarova`                                                                    | Direktor o‘rinbosari              | Dars bermaydi: Portfoliolar, Test banki, Savollar banki, Sessiyalar, Foydalanuvchilar                  |
| `admin`                                                                          | Administrator                     | Hisoblar va maktab tuzilmasi                                                                           |
| `superadmin`                                                                     | Super admin                       | `/system/login`; birinchi kirishda TOTP ilovasi ulanadi                                                |
| `ali.aliyev`, `zebo.karimova`, `sardor.toshmatov` …                              | O‘quvchi (9-A)                    | Ochiq test kodi: **KV2026**                                                                            |
| `jaloliddin.abduganiyev`                                                         | O‘quvchi                          | Portfoliosida IELTS, SAT, Milliy sertifikat, olimpiada; ikkita yozuv tasdiqlashni kutmoqda             |
| `yasmina.sultonova`, `otabek.pardayev`, `munisa.ahmadjonova`, `shohjahon.toirov` | O‘quvchi                          | O‘zi ro‘yxatdan o‘tgan (yaqinda) — _Ro‘yxatdan o‘tish_ sahifasida ko‘rinadi                            |
| `s.nazarova`                                                                     | O‘qituvchi (tasdiq kutmoqda)      | O‘zi ro‘yxatdan o‘tgan, o‘rinbosar tasdiqlaguncha kira olmaydi                                         |
| `g.xolmirzayeva`, `s.ismoilov`, `n.qosimova`, `r.olimov`                         | O‘qituvchi                        | 11-A, 10-B, 8-A sinf rahbarlari; `r.olimov` — sinfsiz (tayinlashni sinash uchun)                       |

## Tekshiruvlar

```bash
pnpm typecheck          # barcha paketlar
pnpm lint               # oxlint
pnpm test               # shared va API birlik testlari (formulalar, baholash, vaqt)
pnpm test:e2e           # API e2e: haqiqiy PostgreSQL (TEST_DATABASE_URL, nomi “_test” bilan tugashi shart)
```

E2E testlar reja 19-bo‘limidagi majburiy ssenariylarni qamraydi: begona natija/faylga ID almashtirib kira
olmaslik; boshqa sinf o‘quvchisi kod bilan kira olmasligi; bank tahriri boshlangan sessiyani o‘zgartirmasligi;
server muddati; takroriy topshirish yangi urinish yaratmasligi; uzilish va qayta kirishda javoblar saqlanishi;
nol / qatnashmagan / tekshirilayotgan / bekor qilingan holatlarning farqi; turlicha kategoriya
maksimumlari; eksport havolasi ruxsat bekor qilingach ishlamasligi; sinfga ko‘chirish tarixiy natijalarga
ta’sir qilmasligi; qayta baholash tarixi. 12-ssenariy (zaxiradan tiklash) —
[docs/zaxira.md](docs/zaxira.md) dagi tartib va `pnpm --filter @ijod/api backup:verify`.

## Xavfsizlik bo‘yicha asosiy qarorlar

- Sessiya — bazada saqlanadigan tasodifiy token, `httpOnly` cookie; faolsizlikda 12 soat, mutlaq 7 kun;
  parollar argon2id; 5 marta xato → 15 daqiqa blok; vaqtinchalik parol birinchi kirishda almashtiriladi.
- Har so‘rovda rol, sinf va resurs egasi serverda tekshiriladi; begona resurs “topilmadi” deb qaytadi.
- Audit jurnali faqat qo‘shiladi (baza triggeri); ishlab chiqarishda ilova cheklangan rol bilan ulanadi.
- Fayllar hajmi (10 MB) va haqiqiy turi (magic bytes) tekshiriladi; noma’lum tur karantinga olinadi;
  fayllar faqat ruxsat bilan, yopiq ombordan beriladi; qoralama yozuv fayli faqat egasiga ochiq. Biriktirilmagan
  eski yuklamalar avtomatik tozalanadi. Profil rasmi serverda qayta ishlanadi (512×512 WEBP, EXIF olib tashlanadi).
- Direktor o‘rinbosari faqat o‘qituvchi va o‘quvchi hisoblarini boshqaradi; boshqa rahbar yoki administrator
  hisobiga tega olmaydi.
- O‘zi ro‘yxatdan o‘tish: ochiq sahifalarda IP bo‘yicha urinishlar cheklangan; o‘qituvchi hisobi direktor
  o‘rinbosari tasdiqlaguncha ishlamaydi (tasdiqlashni holatni qo‘lda o‘zgartirib chetlab o‘tib bo‘lmaydi); JSHSHIR
  tekshiriladi (sana va nazorat raqami), bazada faqat shifrlangan holda saqlanadi, ro‘yxat va javoblarda yashiriladi,
  ochib ko‘rish audit jurnaliga yoziladi. Parollar hech kimga ko‘rinmaydi — unutilsa, o‘rinbosar vaqtinchalik parol beradi.
- O‘qituvchi ma’lumotnomasidagi hujjatlarni faqat o‘qituvchining o‘zi va rahbariyat ochadi.
- To‘liq ekran nazorati serverda: to‘xtatilgan urinishga javob yozib bo‘lmaydi, ruxsatni faqat sessiyani
  boshqaradigan o‘qituvchi yoki rahbariyat beradi, vaqt esa to‘xtamaydi.
- Test paytida to‘g‘ri javoblar mijozga yuborilmaydi; muddat, urinish va natija ko‘rinishi serverda.

## Joylashtirish va zaxira

- Ishlab chiqarishga joylashtirish, baza rollari, HTTPS va birinchi super admin: [docs/deploy.md](docs/deploy.md)
- Zaxira, tiklash va tiklashni tekshirish: [docs/zaxira.md](docs/zaxira.md)
