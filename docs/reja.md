# Ijod maktabi — mahsulot va ishlab chiqish rejasi

Versiya: 1.0 · Sana: 2026-09-27

Holat: foydalanuvchi talablari asosidagi taklif etilgan spetsifikatsiya. Bu tayyor ishlaydigan dastur emas. Berilgan maktab sayti ochilmadi; uning mazmuni haqidagi taxminlar rejaga kiritilmadi.

## 1. Maqsad va dastlabki doira

Maktab o‘quvchilari va o‘qituvchilarining portfoliolari, onlayn nazorat ishlari va ta’lim natijalari bitta tizimda boshqariladi. Asosiy jarayon: ro‘yxat shakllantirish → test yaratish → sinfga tayinlash → topshirish → baholash → tahlil → keyingi o‘quv ishini rejalashtirish.

Dastlabki farazlar: bitta maktab, o‘zbek lotin interfeysi, telefon va kompyuterga mos veb-ilova, maktab yaratadigan hisoblar, internet orqali test. Ota-ona kabineti, to‘liq elektron jurnal va mobil ilova keyingi bosqichlar uchun.

Atamalar: import — Excel kabi fayldan tizimga yuklash; eksport — tizimdan Excel, Word yoki PDF faylini yuklab olish. Foydalanuvchi talablaridagi natijalarni “import qilib olish” ushbu hujjatda eksport deb yuritiladi.

## 2. Rollar va ruxsatlar

Dashboardlar to‘rtta: o‘quvchi; o‘qituvchi; rahbariyat va administrator; super admin. Rahbariyat va administrator bir paneldan foydalansa ham, ruxsatlari alohida bo‘ladi. Bir odamga zarur bo‘lsa bir nechta rol biriktiriladi.

| Imkoniyat | O‘quvchi | O‘qituvchi | Direktor o‘rinbosari | Administrator | Super admin |
|---|---|---|---|---|---|
| O‘z portfoliosini yuritish | Ha | Ha | Zaruratga ko‘ra | Yo‘q | Zaruratga ko‘ra |
| O‘quvchilarni ko‘rish | Faqat o‘zi | Biriktirilgan sinflar, o‘quvga zarur maydonlar | Butun maktab | Hisob yuritish uchun zarur maydonlar | Alohida vakolat bilan |
| Test yaratish va o‘tkazish | Yo‘q | Biriktirilgan fan va sinflar | Istalgan sinf | Qo‘shimcha pedagogik rolsiz yo‘q | Tegishli vakolat bilan |
| Natijalarni ko‘rish | O‘ziniki | O‘z sessiyalari; qo‘shimcha vakolat bo‘lsa kengroq | Butun maktab | Odatiy holatda yo‘q | Ha, murojaatlar qayd etiladi |
| Natijalarni eksport qilish | Shaxsiy hisobot | Ruxsatli sessiyalar | Ruxsatli maktab hisobotlari | O‘quv natijalari emas | Ha, qayd etiladi |
| Sinf, foydalanuvchi va biriktirishlar | Yo‘q | Ko‘rish | Vakolat doirasida | Ha | Ha |
| Shaxsiy identifikatorlar | Zarur bo‘lsa o‘ziniki | Yo‘q | Alohida ruxsat bilan | Alohida ruxsat bilan | Alohida ruxsat bilan |
| Rollar, texnik sozlamalar, audit | Yo‘q | Yo‘q | Cheklangan audit | Cheklangan boshqaruv | Ha |

Sinf rahbari alohida hisob turi emas, o‘qituvchiga beriladigan sinf doirasidagi qo‘shimcha vakolat bo‘ladi. U o‘z sinfining portfoliolarini tasdiqlashi va belgilangan natijalarni ko‘rishi mumkin.

Super admin menyusi va hisoblari oddiy foydalanuvchilarga ko‘rsatilmaydi. Alohida kirish manzili bo‘ladi, lekin maxfiy URL himoya o‘rnini bosmaydi. Serverda rol tekshiruvi, ikki bosqichli kirish, sessiyalarni bekor qilish va muhim amallar jurnali zarur. “Mutlaq boshqaruv” tizim boshqaruvi sifatida talqin qilinadi; izsiz natija o‘zgartirish yoki auditni yashirish funksiyasi bo‘lmaydi. Super admin ham odatiy interfeys orqali audit yozuvlarini o‘chira olmaydi.

## 3. Asosiy modullar va ekranlar

1. Kirish va hisobni tiklash: maktab bergan login, vaqtinchalik parolni almashtirish, bloklangan hisobni tiklash, xodimlar uchun qo‘shimcha tasdiqlash.
2. Maktab tuzilmasi: o‘quv yili, sinf, fan, sinf rahbari, o‘qituvchi–fan–sinf biriktirishlari, faol va bitirgan o‘quvchilar.
3. Portfolio: shaxsiy profil, yutuqlar, sertifikatlar, ijodiy ishlar, tasdiqlash navbati, eksport.
4. Savollar banki: mavzu va fan bo‘yicha qayta ishlatiladigan savollar.
5. Testlar kutubxonasi: test shablonlari, papkalar, versiyalar va hamkorlik.
6. Test sessiyalari: tayinlash, vaqt, kod, jonli ishtirok, yakunlash.
7. Baholash: avtomatik tekshiruv, keyingi bosqichda yozma javoblar uchun mezonli qo‘lda tekshiruv, apellyatsiya.
8. Tahlil markazi: o‘quvchi, sinf, fan, mavzu, savol va maktab darajasidagi hisobotlar.
9. Eksport markazi: Excel jadvallar, Word bayonnomalar, PDF portfolio.
10. Bildirishnomalar, audit va tizim sozlamalari.

O‘quvchi bosh sahifasi: yaqinlashayotgan testlar, “Kodni kiritish”, so‘nggi natijalar, fanlar bo‘yicha o‘sish, portfolio holati va bildirishnomalar.

O‘qituvchi bosh sahifasi: bugungi sessiyalar, sinflar, test yaratish, tekshiriladigan ishlar, mavzular bo‘yicha qiyinchiliklar va shaxsiy portfolio.

Rahbariyat bosh sahifasi: sinflar kesimidagi ko‘rsatkichlar, testda ishtirok, tugallanmagan ishlar, o‘zlashtirish yo‘nalishlari, tasdiqlash navbati. Administrator uchun shu panelda hisoblar va maktab tuzilmasi ko‘rinadi.

Super admin: foydalanuvchilar va vakolatlar, maktab ma’lumotlariga ruxsatli kirish, xatoliklar, zaxira nusxalar holati, eksportlar va audit. Boshqa foydalanuvchi nomidan yashirin kirish MVP tarkibiga kirmaydi.

## 4. Hisoblar va o‘quv yili

Ochiq ro‘yxatdan o‘tish dastlab o‘chirilgan. Administrator hisoblarni bittalab yoki Excel orqali yaratadi. Import oldidan ustunlarni moslashtirish, majburiy maydonlarni tekshirish, takroriy yozuvlarni ko‘rsatish va tasdiqlash ekrani bo‘ladi. Xato qatorlar sababi bilan alohida yuklab olinadi.

Har bir foydalanuvchining o‘zgarmas ichki ID raqami bo‘ladi. JSHSHIR yoki hujjat raqami ichki ID bilan bir xil maydon emas. Ular faqat aniq ehtiyoj va maktab belgilagan tartib mavjud bo‘lsa saqlanadi, umumiy jadvalda niqoblanadi, standart eksportga kiritilmaydi.

Sinfga a’zolik o‘quv yili va amal qilish sanalari bilan yuritiladi. O‘quvchi boshqa sinfga o‘tganda eski test natijalari eski sinf va o‘quv yili bilan qoladi. Bitiruvchi hisob arxivlanadi; tarixiy ma’lumotlar o‘chib ketmaydi. Hisob deaktivatsiyasi, arxivlash va butunlay o‘chirish alohida amallardir.

## 5. Portfolio modeli

Yozuv maydonlari: nom, tur, fan/yo‘nalish, tavsif, tashkilot, sana, bosqich (maktab, tuman, viloyat, respublika, xalqaro), natija yoki o‘rin, dalil fayli/havolasi, ko‘rinish doirasi, tekshiruvchi va holat.

Ijod maktabiga mos turlar: she’r, hikoya, esse, maqola, tarjima, kitobdagi nashr, tanlov, olimpiada, ilmiy yoki dasturiy loyiha, sertifikat. O‘qituvchi uchun metodik ishlanma, malaka oshirish, ochiq dars va nashrlar ham mavjud.

Jarayon: qoralama → tekshiruvga yuborildi → tasdiqlandi yoki tuzatishga qaytarildi. Qaytarish sababi majburiy. Tasdiqlangan yozuvning muhim maydoni o‘zgarsa qayta tasdiqlanadi. Tasdiqlovchi o‘z yozuvini o‘zi tasdiqlamaydi.

Tasdiqlanmagan hujjat profil ichida shu belgi bilan ko‘rinadi, tasdiqlangan yutuqlar hisobotiga qo‘shilmaydi. O‘quvchi portfoliolari avtomatik ommaga ochilmaydi. PDF eksportda kerakli yutuqlar va sanalar tanlanadi; ijodiy ishlarning muallifligi saqlanadi.

## 6. Testning to‘rtta alohida tushunchasi

- Savol banki: alohida, qayta ishlatiladigan savollar va ularning versiyalari.
- Test shabloni: savollar to‘plami, ballar, ketma-ketlik va asosiy sozlamalar.
- Test sessiyasi: muayyan sinf/guruh, vaqt, kirish kodi va o‘tkazuvchi biriktirilgan tadbir.
- Urinish: bitta o‘quvchining aynan shu sessiyadagi javoblari, holati va bahosi.

Masalan, “Algebra, 1-bob” shablonidan 9-A va 9-B uchun ikkita sessiya yaratiladi. Kodlari va vaqtlari boshqa, shabloni bir xil. Kutubxonadagi test keyin o‘zgarsa oldingi sessiyalar o‘zgarmaydi: ular test va savollarning muzlatilgan nusxasidan foydalanadi.

Savolning bilish, qo‘llash yoki mulohaza kategoriyasi uning oson/o‘rta/qiyin darajasidan alohida saqlanadi. Bitta savol bitta asosiy kategoriyaga mansub bo‘ladi, shunda ball ikki marta hisoblanmaydi.

## 7. Test yaratish ustasi — 10 bosqich

1. **Pasport:** nom, fan, sinf darajasi, bob/mavzu, maqsad, til, o‘quv yili va teglar.
2. **Tuzilma:** bilish, qo‘llash va mulohaza uchun savollar soni hamda rejalashtirilgan ballar. Masalan, 5×2 + 5×4 + 5×6 = 60 ball; bu namuna, majburiy standart emas.
3. **Savollar:** yangi savol kiritish, bankdan tanlash yoki oldingi testdan nusxa olish. Rasm, formula va izoh qo‘shish. Dastlab bitta to‘g‘ri javobli savollar; keyin ko‘p javobli, qisqa javob, moslashtirish va yozma savollar.
4. **Baholash:** har savol kategoriyasi, maksimal balli, javob kaliti va izohi. MVPda noto‘g‘ri/bo‘sh javob 0, to‘g‘ri javob to‘liq ball. Keyingi ko‘p javobli savollar uchun qisman ball berish siyosati oldindan aniq tanlanadi.
5. **Avtomatik tekshiruv:** bo‘sh matn, yo‘q javob kaliti, noto‘g‘ri ball, takror savol, reja bilan nomuvofiqlik va yetishmayotgan kategoriya haqida xabar. Qat’iy xatolar nashrni to‘xtatadi; tavsiyaviy ogohlantirishlar tushuntiriladi.
6. **Oldindan ko‘rish:** o‘quvchi ko‘rinishi, telefon va kompyuter ko‘rinishi, namunaviy topshirish, to‘g‘ri/noto‘g‘ri javoblar bilan baholashni sinash.
7. **Auditoriya:** ruxsatli sinf yoki sinflar, kichik guruh yoxud tanlangan o‘quvchilar. Tayinlangan o‘quvchilar ro‘yxati sessiya tarixida saqlanadi; keyingi o‘zgarishlar qayd etiladi.
8. **Vaqt va tartib:** boshlanish, yopilish, davomiylik, kirish muddati, urinishlar soni, savollarni aralashtirish, ortga qaytish, maxsus qo‘shimcha vaqt. Nazorat ishi uchun standart — bitta urinish.
9. **Natija siyosati:** ball qachon ko‘rsatiladi; javob va izohlar qachon ochiladi; o‘tish chegarasi va qayta topshirish qoidasi. Standart: barcha ishtirokchilar yakunlagach yoki sessiya yopilgach e’lon qilish.
10. **Tasdiqlash va e’lon:** yakuniy xulosa, muzlatilgan versiya, sessiya yaratish, bildirishnoma, o‘tkazuvchiga kirish kodi. Kod o‘quvchi bildirishnomasiga qo‘shilmaydi.

Test bankdan mezon bo‘yicha tasodifiy yig‘ilsa, har bir variantning kategoriyalar kesimidagi soni va maksimal balli teng bo‘lishi tekshiriladi. Tanlangan savollar urinish boshlanishida saqlanadi va sahifa yangilanganda almashmaydi. Dastlab bir xil savollarni turli tartibda berish yetarli.

## 8. Test o‘tkazish va ishonchlilik

O‘quvchi o‘z hisobiga kiradi → tayinlangan testni ochadi → kod kiritadi → qoidalarni ko‘radi → boshlaydi → javob beradi → topshiradi → e’lon qilingan natijani ko‘radi.

Kod sessiyaga tegishli, tasodifiy va muddatli. Kodni bilishning o‘zi yetmaydi: server o‘quvchining tayinlangan ro‘yxatda ekanini, sessiya ochiqligini va urinish huquqini tekshiradi. Noto‘g‘ri kod urinishlariga tezlik cheklovi qo‘yiladi. Kod almashtirilsa oldingi kod yangi kirishlar uchun bekor bo‘ladi, boshlangan urinishlar esa davom etadi.

Taymer server vaqtidan hisoblanadi. Standart yakun vaqti = sessiya yopilishi bilan (boshlangan vaqt + davomiylik + individual qo‘shimcha vaqt) orasidagi ertaroq vaqt. Kech kirish kamaygan vaqtni ko‘rsatadi; alohida uzaytirish vakolatli xodim tomonidan sabab bilan kiritiladi. Barcha vaqtlar bazada UTC, interfeysda Asia/Tashkent bo‘yicha aks etadi.

Har javob serverga avtomatik saqlanadi. “Saqlandi”, “Saqlanmoqda”, “Internet uzildi” holatlari aniq ko‘rinadi. Sahifa yangilanganda serverdagi urinish tiklanadi. Vaqtincha yuborilmagan javoblar qayta yuborilishi mumkin, lekin to‘liq oflayn imtihon va’da qilinmaydi. Muddat o‘tgach yetib kelgan javoblar avtomatik qabul qilinmaydi; oxirgi serverda saqlangan javoblar baholanadi, texnik istisno alohida qayd etiladi.

Takroriy “Topshirish” bir xil natijani qaytaradi, ikkinchi urinish yaratmaydi. Bir vaqtning o‘zida ikki qurilmadan qarama-qarshi javob yozishni cheklash kerak. Taymer tugasa server urinishni yakunlaydi, hatto brauzer yopilgan bo‘lsa ham. Javob kaliti imtihon davomida o‘quvchining brauzeriga yuborilmaydi.

O‘qituvchi jonli ekranda: tayinlangan, boshlamagan, ishlayotgan, topshirgan va aloqa muammosi kuzatilganlar sonini ko‘radi. Zaruratda sessiyani boshlaydi/yopadi, individual muddatni uzaytiradi yoki sabab bilan urinishni bekor qiladi. Har bir o‘zgarish auditga yoziladi.

Tab almashtirish qayd etilishi mumkin, lekin bu avtomatik “ko‘chirdi” xulosasi yoki ballni kamaytirish uchun asos emas. MVPda yashirin kamera, mikrofon yoki doimiy ekran kuzatuvi bo‘lmaydi.

## 9. Natijalar: aniq ta’riflar

Har kategoriya uchun o‘quvchi foizi = olingan kategoriya balli / kategoriya maksimal balli × 100.

Umumiy foiz = barcha olingan ballar yig‘indisi / barcha maksimal ballar yig‘indisi × 100. Kategoriyalar maksimumi turlicha bo‘lsa, uchta foizning oddiy o‘rtachasi olinmaydi.

| O‘quvchi | Bilish /10 | Qo‘llash /20 | Mulohaza /30 | Jami /60 | Umumiy foiz |
|---|---:|---:|---:|---:|---:|
| Ali | 8 | 14 | 18 | 40 | 66,7% |
| Zebo | 10 | 18 | 27 | 55 | 91,7% |

Alining kategoriya foizlari: 80%, 70%, 60%. Ularning o‘rtachasi 70% bo‘lsa ham, umumiy natija 40/60 = 66,7%.

Sinf uchun uchta turli ko‘rsatkich alohida nom bilan beriladi:

1. **Kategoriya o‘zlashtirishi:** yaroqli yakunlangan ishlarning shu kategoriyadan olgan ballari yig‘indisi / shu ishlarning kategoriya maksimal ballari yig‘indisi × 100. Bir xil test uchun o‘quvchilarning kategoriya foizlari o‘rtachasiga teng.
2. **Belgilangan mezonga yetganlar ulushi:** kategoriya chegarasiga yetganlar soni / shu kategoriya bo‘yicha yakuniy bahosi bor ishtirokchilar soni × 100. Masalan, chegara 60%, 25 ishtirokchidan 20 nafari yetdi: 80%.
3. **Qatnashish:** yaroqli topshirganlar soni / tayinlanganlar soni × 100. Masalan, 30 kishidan 25 nafari: 83,3%.

Bu misolda mezonga yetganlar 20/25 = 80%; barcha tayinlanganlarga nisbatan ko‘rsatilsa 20/30 = 66,7% deb alohida nomlanadi. Har ko‘rsatkich yonida surat/maxraj sonlari ko‘rinadi.

Boshlamaganlar 0 ball sifatida yashirincha o‘rtachaga qo‘shilmaydi. Nol olgan yakunlangan ish esa haqiqiy 0 sifatida qatnashadi. Tekshirilayotgan yoki bekor qilingan ishlar yakuniy hisobdan alohida turadi. Kategoriya yo‘q yoki maxraj 0 bo‘lsa “— / mavjud emas” ko‘rsatiladi.

Bir nechta urinishga ruxsat berilsa, birinchi/oxirgi/eng yaxshi urinish siyosati sessiya boshlanishidan oldin belgilanadi va hisobotda yoziladi. Ichki hisoblash yaxlitlanmagan qiymatlar bilan, ko‘rsatish bir kasr xonasi bilan bajariladi. Turli murakkablikdagi testlarning foiz o‘sishi avtomatik bilim o‘sishi deb talqin qilinmaydi; taqqoslash fan, mavzu va test tuzilmasi bilan birga ko‘rsatiladi.

Xato savol topilganda: sabab → ta’sir ko‘radigan ishlar ro‘yxati → savolni hisobdan chiqarish kabi belgilangan siyosat → qayta hisoblash → yangi baholash versiyasi → bildirishnoma. Oldingi va yangi natija saqlanadi; izsiz o‘zgartirish yo‘q.

## 10. Tahlil markazi

- O‘quvchi: vaqt bo‘yicha natijalar, fan/mavzu/kategoriya kesimi, noto‘g‘ri javoblar izohi, individual mashq yo‘nalishlari.
- Sinf: o‘rtacha va mediana, ballar taqsimoti, qatnashish, belgilangan chegaraga yetganlar, tekshirilmagan ishlar.
- Savol: to‘g‘ri javob ulushi, variantlarni tanlash taqsimoti, javobsiz qoldirganlar. Juda ko‘p xato qilingan savol “tekshirish tavsiya etiladi” deb belgilanadi, avtomatik nuqsonli deb topilmaydi.
- Matritsa: qatorlarda o‘quvchilar, ustunlarda savollar yoki mavzular; kataklarda ball va holat. Rangdan tashqari matn/raqam ham bo‘ladi.
- Maktab: o‘quv yili, sinf va fanlar bo‘yicha taqqoslash, ishtirok va portfolio tasdiqlari.

Har diagrammadan asos bo‘lgan jadvalga o‘tish mumkin. Filtrlar barcha kartalar va eksportga bir xil qo‘llanadi. O‘qituvchilar sifati faqat sinf test foizi bilan avtomatik reyting qilinmaydi.

## 11. Qidirish, filtrlash va saralash

| Bo‘lim | Filtrlar | Saralash |
|---|---|---|
| O‘quvchilar | O‘quv yili, sinf, holat, sinf rahbari, portfolio tasdiqlanishi, oxirgi faollik | F.I.Sh., sinf, oxirgi faollik, tasdiqlangan yutuqlar soni |
| Natijalar | Fan, mavzu, sessiya, sana oralig‘i, kategoriya foizi, umumiy foiz oralig‘i, urinish holati | Umumiy ball, kategoriya balli, topshirish vaqti, ism |
| Savollar va testlar | Muallif, fan, sinf darajasi, mavzu, kategoriya, qiyinlik, teg, ulashilganlik, holat | Yangilangan sana, savollar soni, umumiy ball, nom |
| Portfolio | Egasi, tur, bosqich, fan, sana, tashkilot, tasdiq holati | Sana, bosqich, o‘rin, egasi |
| O‘qituvchilar | Fan, biriktirilgan sinf, holat, sertifikat turi, amal qilish muddati | Ism, fan, yaqin tugaydigan sertifikat |

Umumiy qidiruv: ism, familiya, ichki ID, test nomi. Shaxsiy hujjat raqami orqali qidirish odatiy foydalanuvchilarga ochilmaydi. Lotin apostrofining turli ko‘rinishlari qidiruvda moslashtiriladi, asl yozuv saqlanadi.

Kengaytirilgan filtrlar AND/OR guruhlarini, bir nechta qiymatni va bo‘sh maydonlarni qo‘llaydi. Masalan: 10-sinf VA matematika VA mulohaza < 50% VA holat = yakunlangan. Saralash: avval mulohaza o‘sish tartibida, keyin umumiy foiz, keyin ism. Teng qiymatlar ichki ID bilan barqaror tartiblanadi.

Jadval imkoniyatlari: ustunlarni tanlash, o‘lchamlarini o‘zgartirish, birinchi ustunni mahkamlash, sahifalash, faol filtr belgilarini ko‘rish, filtrni tozalash, saqlangan ko‘rinishlar, tanlangan qatorlar yoki barcha filtrlangan qatorlar eksporti. Eksport tugmasi qatorlar sonini oldindan ko‘rsatadi. Ruxsatlar serverda tekshiriladi, filtrni o‘zgartirish ularni chetlab o‘tmaydi.

## 12. Eksport va hisobotlar

Excel (.xlsx): Umumiy ma’lumot; O‘quvchilar natijalari; Kategoriyalar; Savollar tahlili; Ishtirok holati varaqlari. Sarlavhalar, maksimal ball, filtrlar, test versiyasi, baholash versiyasi, yaratilgan vaqt va foiz maxrajlari ko‘rsatiladi. Sonlar haqiqiy raqam formatida yoziladi; foydalanuvchi matni formula sifatida bajarilmaydi.

Word (.docx): nazorat ishi bayonnomasi, fan/sinf/sana, mas’ul o‘qituvchi, natijalar jadvali, kategoriya xulosalari, tahlil uchun izoh va imzo joyi.

PDF: shaxsiy portfolio yoki ko‘rishga qulay yakuniy hisobot. Excel/Word asosiy talab, PDF qo‘shimcha qulaylik.

Katta eksportlar navbatda tayyorlanadi; tayyor bo‘lganda bildirishnoma beriladi. Fayl havolasi vaqtinchalik va ruxsat bilan ochiladi. Eksport yaratishda va yuklab olishda huquq qayta tekshiriladi. Eksport auditida kim, qachon, qaysi filtr va qaysi maydonlar bilan yuklagani qayd etiladi. Shaxsiy identifikatorlar standart eksportdan chiqariladi.

## 13. O‘qituvchilar hamkorligi

Testlar shaxsiy papkalar va teglar bilan tartiblanadi. Ulashish turlari: faqat ko‘rish; nusxa olish; birgalikda tahrirlash. Egasi va dastlabki muallif saqlanadi. Boshqa o‘qituvchi ishlatishi uchun nusxa olishi mumkin; bu asl nusxani o‘zgartirmaydi. Boshlangan sessiyada ishlatilayotgan test versiyasi o‘zgarmaydi.

Maktab savollar bankiga chiqarish uchun metodik tekshiruvchi tasdiqlashi mumkin. Xususiy savollar qidiruv va eksport orqali boshqa o‘qituvchilarga sizib chiqmasligi tekshiriladi.

## 14. Bildirishnomalar

Voqealar: test tayinlandi, vaqt o‘zgardi, boshlanish yaqinlashdi, natija e’lon qilindi, portfolio tasdiqlandi/qaytarildi, eksport tayyor, sertifikat muddati yaqinlashdi. Ilova ichidagi bildirishnomalar MVPga kiradi. Telegram yoki email keyingi bosqich; ular ichida test javoblari, shaxsiy hujjat raqami yoki yopiq portfolio fayllari yuborilmaydi.

## 15. Taklif etilgan texnik tuzilma

Bir markaziy server ilovasi va modullarga ajratilgan kod bazasi yetarli. Dastlab mikroservislarga bo‘lish talab etilmaydi. Tarkib: moslashuvchan veb-interfeys; server API; relyatsion ma’lumotlar bazasi; yopiq fayl ombori; eksport/bildirishnomalar uchun fon vazifalari.

Ma’lumot modeli: School, AcademicYear, Class, Subject, User, RoleAssignment, Enrollment, TeachingAssignment, PortfolioItem, PortfolioReview, FileAsset, Question, QuestionVersion, TestTemplate, TestVersion, TestQuestion, TestShare, AssessmentSession, SessionAssignment, Attempt, Answer, GradeRevision, Notification, ExportJob, AuditEvent.

Bog‘lanishlar: User → Enrollment → Class/AcademicYear; Teacher → TeachingAssignment → Subject/Class; TestTemplate → TestVersion → QuestionVersion; AssessmentSession → TestVersion va SessionAssignment; SessionAssignment → Attempt → Answer. GradeRevision eski va yangi baholash natijalarini bog‘laydi.

Tayyor stack tanlovi mavjud kod bazasi va hostingga qarab amalga oshiriladi; muayyan versiyalar ushbu rejaning tasdiqlangan qismi emas. Avval ma’lumotlar modeli, ruxsatlar va hisoblash qoidalari mustahkamlanadi.

## 16. Ishga tushirish talablari

Har so‘rovda foydalanuvchi, rol, sinf va resurs egasi tekshiriladi. Parollar qayta o‘qiladigan shaklda saqlanmaydi; ulanishlar shifrlanadi. Fayllar hajmi va haqiqiy turi tekshiriladi, xavfli fayllar karantinga olinadi. Ommaviy fayl havolalari bilan o‘quvchi hujjatlari ochib qo‘yilmaydi.

Maktab bilan ma’lumot maydonlari, kirish vakolatlari, saqlash/o‘chirish muddati, foydalanuvchiga tushuntirish va kerakli rozilik jarayoni kelishiladi. Hosting joylashuvi va amaldagi mahalliy talablar real ma’lumot kiritilishidan oldin alohida tekshiriladi; ushbu hujjat huquqiy muvofiqlik xulosasi emas.

Zaxira nusxadan tiklash amalda tekshiriladi. Dastlabki xizmat maqsadi sifatida maksimal yo‘qotilishi mumkin bo‘lgan ma’lumot oralig‘i va tiklash muddati maktab bilan belgilanadi. Imtihon davrida oddiy kundalik zaxiraning o‘zi yetarli bo‘lmasligi hisobga olinadi.

Yuklama maqsadi bir vaqtda test topshiradigan rejalashtirilgan o‘quvchilar soniga qarab belgilanadi. Saqlash, topshirish va taymer bilan bog‘liq server amallari shu yuklamada tekshiriladi. Klaviatura bilan boshqarish, o‘qilishi qulay kontrast, mobil moslashuv va rangsiz ham tushunarli holatlar talab etiladi.

## 17. Ishlab chiqish bosqichlari va qabul mezonlari

| Bosqich | Natija | Qabul mezoni |
|---|---|---|
| 0. Loyihalash | Ekranlar, ruxsatlar, ma’lumotlar modeli, formulalar | Oddiy va chekka holatlar kelishilgan; namunaviy hisoblar to‘g‘ri |
| 1. Poydevor | Kirish, rollar, o‘quv yili, sinflar, biriktirishlar, import | Begona sinf/resursga API orqali kirish rad etiladi; import xatolari ko‘rinadi |
| 2. Testning to‘liq oqimi | Bank, konstruktor, sessiya, kod, taymer, autosave, baholash | Bir o‘qituvchi test yaratadi, tayinlangan o‘quvchi topshiradi, to‘g‘ri natija olinadi |
| 3. Natijalar va eksport | Kategoriya formulalari, jadvallar, filtr, Excel va Word | Ekran va fayldagi ball/foizlar teng; qatnashmagan va 0 olganlar farqlanadi |
| 4. Portfolio va boshqaruv | Tasdiqlash, ijodiy ishlar, rahbariyat ko‘rinishi | Tasdiqsiz yutuq tasdiqlanganlar hisobotiga tushmaydi; ko‘rish huquqlari ishlaydi |
| 5. Pilot | Bitta sinf va bir necha o‘qituvchi bilan amaliy sinov | Internet uzilishi, vaqt tugashi, qayta kirish, eksport, zaxiradan tiklash tekshirilgan |
| 6. Kengaytirish | Boshqa sinflar, murakkab savollar, hamkorlik va chuqur tahlil | Pilotdagi muhim muammolar yopilgan; rejalashtirilgan yuklama ko‘tariladi |

Birinchi sinovga yaroqli reliz: hisoblar/sinflar, bitta javobli savollar, uchta kategoriya, individual ball, sessiya kodi, server taymeri, avtomatik saqlash, natijalar va Excel. Maktabga keng joriy etiladigan birinchi relizga Word eksport, portfolio, tasdiqlash, rahbariyat ko‘rinishi, audit va zaxiradan tiklash ham kiradi.

Muddat jamoa, mavjud kod va haftalik ish vaqtiga bog‘liq; ma’lumotsiz qat’iy kalendar va’da qilinmaydi. Har bosqich ishlaydigan natija va qabul mezoni bilan yopiladi.

## 18. Keyingi foydali funksiyalar

Yuqori ustuvorlik: natijaga e’tiroz yuborish; o‘qituvchining individual izohi; mezon bo‘yicha qo‘shimcha mashq tayinlash; o‘quv yili almashuvi; savollar sifati tahlili; sertifikat muddati eslatmasi; nazorat ishlari umumiy taqvimi.

Keyinroq: yozma va ijodiy ishlar uchun rubrikalar (mazmun, mantiq, uslub, imlo kabi alohida mezonlar); anonimlashtirilgan tekshirish; ota-ona kabineti; Telegram bildirishnomalari; savol importi; rozilik asosidagi ommaviy portfolio; AI yordamida savol qoralamasi va izoh taklifi. AI chiqishi o‘qituvchi tekshiruvisiz nashr etilmaydi va yakuniy pedagogik hukm hisoblanmaydi.

## 19. Majburiy tekshiruv ssenariylari

1. O‘quvchi begona o‘quvchining natijasi va faylini ID almashtirib ocholmaydi.
2. Boshqa sinf o‘quvchisi kodni bilsa ham sessiyaga kira olmaydi.
3. Test banki tahriri boshlangan yoki yakunlangan sessiyani o‘zgartirmaydi.
4. Server muddati brauzer soatini o‘zgartirishdan ta’sirlanmaydi.
5. Qayta yuborilgan topshirish so‘rovi qo‘shimcha urinish yaratmaydi.
6. Internet uzilishi va qayta kirish saqlangan javoblarni yo‘qotmaydi.
7. Nol ball, qatnashmagan, tekshirilayotgan va bekor qilingan holatlar farqlanadi.
8. Turlicha kategoriya maksimumlari umumiy foizni to‘g‘ri beradi.
9. Eksport ruxsati bekor qilingach eski havola himoyani chetlab o‘tmaydi.
10. Sinfga ko‘chirish tarixiy natijalarni yangi sinfga yozib yubormaydi.
11. Qayta baholash sabab va eski/yangi qiymatni saqlaydi.
12. Zaxira nusxadan tiklangan tizim hisoblar, javoblar va fayllar bog‘lanishini saqlaydi.

## 20. Birinchi amaliy ish paketi

Boshlash uchun: to‘rtta dashboardning ekran xaritasi; ruxsatlar matritsasi; hisob/sinf/test/sessiya/urinish/portfolio ma’lumotlar sxemasi; test yaratish ustasi maketi; natijalar jadvali va eksport namunasi. Keyin bitta to‘liq jarayon amalga oshiriladi: o‘qituvchi test yaratadi → sinfga yuboradi → o‘quvchi kod bilan topshiradi → o‘qituvchi natijani Excelga oladi.

Aniqlashtirish uchun eng muhim ma’lumotlar: o‘quvchi va o‘qituvchilar soni, eng katta bir vaqtdagi test guruhi, mavjud saytning kodi bor-yo‘qligi, shaxsiy ID deganda ichki ID yoki hujjat raqami nazarda tutilgani, kim portfolio tasdiqlashi. Hozircha ushbu hujjatdagi farazlar bilan maket va ma’lumotlar modelini tayyorlash mumkin.
