# Ijod maktabi

O‘quvchi va o‘qituvchilar portfoliosi, onlayn nazorat ishlari (kod, taymer, avtomatik saqlash, baholash) va
natijalar tahlili tizimi. Talablar: [docs/reja.md](docs/reja.md).

**Stack:** Next.js 16 (App Router, React 19, Tailwind CSS 4) · NestJS 12 · PostgreSQL 16 · Prisma 7 ·
TypeScript · pnpm monorepo.

## Imkoniyatlar

| Rol | Nimalar mumkin |
|---|---|
| **O‘quvchi** | Kod bilan testga kirish, server taymeri bilan topshirish (internet uzilsa javoblar saqlanib, tiklanganda yuboriladi), natija va kategoriyalar bo‘yicha tahlil, portfolio yuritish va tekshiruvga yuborish, PDF chop etish |
| **O‘qituvchi** | Savollar banki, 10 bosqichli test ustasi (pasport → reja → savollar → ballar → tekshiruv → ko‘rinish → auditoriya → vaqt → natija siyosati → e’lon), sessiyalar: jonli kuzatuv, vaqt qo‘shish, urinishni bekor qilish, natijalar (filtrlar, taqsimot), savollar tahlili, qayta baholash (tarix bilan), javoblar matritsasi, Excel/Word eksport; sinflar va o‘quvchi natijalari tarixi |
| **Sinf rahbari** | O‘qituvchi imkoniyatlari + o‘z sinfi portfoliolarini tasdiqlash va sinfdagi sessiyalar natijalarini ko‘rish |
| **Rahbariyat** (direktor o‘rinbosari) | Maktab bo‘yicha ko‘rsatkichlar, barcha sessiyalar, portfolio tasdiqlash va qidiruv, maktab savollar bankiga chiqarish, cheklangan audit |
| **Administrator** | Hisoblar (bittalab yoki Excel import: ustunlarni moslashtirish, xatolarni yuklab olish), rollar, bloklash/parol tiklash, o‘quv yili, fanlar, sinflar, biriktirishlar. O‘quv natijalarini ko‘rmaydi |
| **Super admin** | Alohida kirish (`/system/login`) va majburiy ikki bosqichli tasdiqlash; tizim holati, xavfsizlik hodisalari, zaxira holati, xatoliklar, audit |

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

Talablar: Node.js ≥ 22.12, pnpm 10 (`corepack enable`), Docker (yoki o‘rnatilgan PostgreSQL 16).

```bash
pnpm install
docker compose up -d                       # PostgreSQL + test uchun ijod_test bazasi

cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
# apps/api/.env dagi APP_ENCRYPTION_KEY ni almashtiring:
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

pnpm --filter @ijod/shared build
pnpm db:deploy                             # migratsiyalar
pnpm db:seed                               # demo maktab (faqat mahalliy!)
pnpm dev                                   # veb: http://localhost:3000, API: http://localhost:4000/api
```

### Demo hisoblar

Parol hammasiga: `Demo2026!` (`SEED_DEMO_PASSWORD`).

| Login | Rol | Izoh |
|---|---|---|
| `d.karimova` | O‘qituvchi | Matematika; 9-A sinf rahbari; ochiq va yakunlangan sessiyalari bor |
| `m.tursunova` | O‘qituvchi | 9-B sinf rahbari |
| `j.rahimov` | O‘qituvchi | 10-A sinf rahbari |
| `b.yusupov` | Direktor o‘rinbosari + o‘qituvchi | Rahbariyat paneli |
| `admin` | Administrator | Hisoblar va maktab tuzilmasi |
| `superadmin` | Super admin | `/system/login`; birinchi kirishda TOTP ilovasi ulanadi |
| `ali.aliyev`, `zebo.karimova`, `sardor.toshmatov` … | O‘quvchi (9-A) | Ochiq test kodi: **KV2026** |

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
  fayllar faqat ruxsat bilan, yopiq ombordan beriladi. Biriktirilmagan eski yuklamalar avtomatik tozalanadi.
- Test paytida to‘g‘ri javoblar mijozga yuborilmaydi; muddat, urinish va natija ko‘rinishi serverda.

## Joylashtirish va zaxira

- Ishlab chiqarishga joylashtirish, baza rollari, HTTPS va birinchi super admin: [docs/deploy.md](docs/deploy.md)
- Zaxira, tiklash va tiklashni tekshirish: [docs/zaxira.md](docs/zaxira.md)
