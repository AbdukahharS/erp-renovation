/**
 * Uzbek-language default renovation template (Latin script).
 * Translated from tz-content.en.ts.
 */

import { type DefaultTemplateContent, photo, video } from "./types.ts";

export const DEFAULT_TEMPLATE_UZ: DefaultTemplateContent = {
	name: "Standart kvartira ta'miri",
	stages: [
		{
			order: 1,
			name: "Obyektni tayyorlash",
			subStages: [
				{
					code: "1.1",
					name: "Obyektni dastlabki qabul qilish va boshlang'ich ma'lumotlarni qayd etish",
					performerType: "INSPECTOR",
					standardDurationDays: 1,
					wageRatePerSqm: "0",
					description:
						"Mastersrlar kelishidan oldin texnik nazorat tomonidan bajariladi. Belgilangan byudjetni yashirin kamchiliklardan himoya qilish uchun obyektning quruvchidan qabul qilingan holatini hujjatlashtiradi. Asboblar: lazerli daraja, 2 metrlik chizg'ich, ruletka, qog'oz varag'i (shamollatish tekshiruvi).",
					mediaRequirements: [
						photo("Barcha hisoblagichlar ko'rsatkichlarining fotosi (suv, elektr, isitish)."),
						photo("Barcha xonalarning panoramik fotosuratlari (dastlabki holat)."),
						photo(
							"Kirish eshigi, qo'sh oynali derazalar va deraza tokchalarining batafsil fotosi (quruvchidan qolgan tirnalish va siniqlar).",
						),
						photo("Suv ta'minoti va kanalizatsiya stояklarining hozirgi holatining fotosi."),
						video("Boshlang'ich holatni hujjatlashtiruvchi ixtiyoriy video aylanish.", false),
					],
					checklistItems: [
						{ text: "Kirish eshigida mexanik shikastlanishlar yo'q; qulflar to'g'ri ishlaydi." },
						{
							text: "Qo'sh oynali derazalar va romlar butun, yoriqlar, tirnalish va siniqlarsiz. Furnitura tutilishlarsiz ishlaydi.",
						},
						{
							text: "Mavjud devorlarning vertikaldan og'ishi o'lchangan.",
							criteria:
								"Og'ish me'yordan oshsa, quruvchi uchun qo'shimcha ishlar dalolatnomasi tuziladi yoki smeta to'g'rilanadi.",
						},
						{
							text: "Shamollatish shaxtalari bloklanmagan; havo oqimi mavjud.",
							criteria: "Shaxta oldida ushlangan qog'oz varag'i bilan tekshiriladi.",
						},
						{
							text: "Shift, devorlar va kanalizatsiya/suv ta'minoti stояklarí yaqinida oqish izlari yo'q.",
						},
						{
							text: "Kvartiraga kiruvchi elektr kabeli kuchlanish ostida; vaqtinchalik shchit ishchi holatda.",
						},
						{
							text: "Suv va isitish uchun uzib qo'yish ventillari (kirish kranlari) suvni to'liq, hech qanday tomchilashsiz to'xtatadi.",
						},
					],
				},
				{
					code: "1.2",
					name: "Demontaj ishlari",
					performerType: "MASTER",
					specialization: "DEMOLITION",
					standardDurationDays: 3,
					wageRatePerSqm: "12.00",
					description:
						"Obyekt «yalang'och beton» bo'lmasa yoki devor-pardalarni buzish kerak bo'lsa bajariladi.",
					mediaRequirements: [
						photo("To'liq tozalangan xonalar fotosi (pol, devorlar, shift)."),
						photo(
							"Eski quvurlar/kommunikatsiyalarning kesilgan nuqtalari fotosi (agar kerak bo'lsa).",
						),
						photo("Olib chiqilgan axlat fotosi (kvartira oldidagi bo'sh joy va toza kirish)."),
					],
					checklistItems: [
						{
							text: "Faqat demontaj rejasida ko'rsatilgan konstruksiyalar buzilgan.",
							criteria: "Sxema bilan solishtirilgan.",
						},
						{
							text: "Devor va shift sirtlaridan eski qoplamalar (oboylar, bo'yoq, ko'chgan suvoq), mixlar va ankerlar to'liq olib tashlangan.",
						},
						{
							text: "Buzilgan devor-pardalarning ko'taruvchi devorlar/pol/shift bilan tutash joylari asosiy yuza bilan tekis darajagacha tozalangan.",
						},
						{
							text: "Qurilish axlati to'liq paketlarga yig'ilgan, kvartiradan olib chiqilgan va turar-joy majmuasidan tashqariga olib ketilgan.",
						},
						{
							text: "Umumiy foydalanish joylari (yo'lak, lift) axlat olib chiqilgandan keyin tozalangan; boshqaruv kompaniyasi/qo'shnilardan shikoyatlar yo'q.",
						},
					],
				},
				{
					code: "1.3",
					name: "Planirovkani belgilash va geometriya o'lchovi",
					performerType: "MASTER",
					specialization: "FOREMAN",
					standardDurationDays: 1,
					wageRatePerSqm: "5.00",
					description:
						"Yangi devorlarni qurishdan oldingi kritik bosqich. Bu yerda qilingan xato qiyshiq burchaklarga olib keladi, ularda o'rnatma mebel mos kelmaydi. Asboblar: lazerli liniya generator, ruletka, gunya.",
					mediaRequirements: [
						photo("Polga kelajakdagi devor-pardalarning belgilash chiziqlari fotosi."),
						photo(
							"Asosiy zonalarda (santexnika xonalari, oshxonalar, o'rnatma shkaflar zonalari) 90 graduslik burchaklarni belgilovchi lazerli darajaning fotosi.",
						),
					],
					checklistItems: [
						{
							text: "Poldagi devorlar belgisi tasdiqlangan texnik planirovkaga aniq mos keladi.",
							criteria: "Aniqlik 1 sm.",
						},
						{
							text: "Santexnika xonasida belgilash kelajakdagi plitka qoplash va vanna/dush podonini o'rnatish uchun aniq 90 graduslik burchaklarni kafolatlaydi.",
						},
						{
							text: "Oshxona zonasida devorlar geometriyasi (belgilash bo'yicha) oshxona garnituri uchun mukammal to'g'ri burchak hosil qiladi.",
						},
						{
							text: "Belgilashdagi eshik bo'shliqlari o'lchamlari kelajakdagi suvoq qatlamining qalinligini va eshik o'rnatish choklarini hisobga oladi.",
						},
						{ text: "Yo'lak belgisi devorlarning parallelligini ta'minlaydi." },
					],
				},
			],
		},
		{
			order: 2,
			name: "Geometriya qurish va suvoq ishlari",
			subStages: [
				{
					code: "2.1",
					name: "Ichki devor-pardalarni o'rnatish",
					performerType: "MASTER",
					specialization: "MASON",
					standardDurationDays: 5,
					wageRatePerSqm: "18.00",
					description:
						"Yangi xonalarni shakllantiradi. Suvoq boshlanguncha terimni ko'rib chiqing. Asboblar: lazerli daraja, 2 metrlik chizg'ich, ruletka.",
					mediaRequirements: [
						photo("Birinchi qator terimning fotosi (nam zonalar uchun gidroizolatsiya tasmasida)."),
						photo("Yangi devor-pardalarning ko'taruvchi devorlar va shift bilan tutashish fotosi."),
						photo("Eshik bo'shliqlari ustidagi o'rnatilgan ustun balkalari fotosi."),
					],
					checklistItems: [
						{
							text: "Devor-pardalarning vertikaldan og'ishi 1 metr balandlikka 2 mm dan oshmaydi.",
						},
						{
							text: "Devor-pardalar ko'taruvchi devorlarga qattiq bog'langan.",
							criteria: "Har 2–3 qatorda armatura yoki perfolenta ishlatilgan.",
						},
						{
							text: "Yuqori qator terim va shift orasida demfer bo'shlig'i qoldirilgan, montaj ko'pigi bilan to'ldirilgan.",
							criteria:
								"1–2 sm bo'shliq; perekrytie plitasi cho'kishi vaqtidagi yoriqlardan himoya.",
						},
						{
							text: "Eshik bo'shliqlari ustidagi ustun balkalari tekis o'rnatilgan, har tomondan devorlarga 15–20 sm dan kam bo'lmagan tayanch bilan (materialga qarab).",
						},
						{
							text: "Eshik bo'shliqlari o'lchamlari (kenglik va tayyor pol darajasidan balandlik) texnik loyihaga aniq mos keladi.",
						},
						{
							text: "Xona geometriyasi vizual va ruletka bo'yicha rejaga mos keladi (parallel devorlar orasidagi masofalar teng).",
						},
					],
				},
				{
					code: "2.2",
					name: "Mayoqlarni tayyorlash va o'rnatish",
					performerType: "MASTER",
					specialization: "PLASTERER",
					standardDurationDays: 2,
					wageRatePerSqm: "8.00",
					description:
						"Eng muhim yashirin bosqichlardan biri. Suvoq qo'llanguncha texnik nazorat mayoqlarni qabul qilishi kerak. Asboblar: lazerli daraja, qurilish gunyasi (90°).",
					mediaRequirements: [
						photo(
							"Changdan tozalangan va praymerlangan devorlarning fotosi (devor yaltiroq ko'rinishi yoki rangi o'zgargan bo'lishi kerak).",
						),
						photo("Turli materiallar birikishida armaturali to'rning fotosi."),
						photo("Lazer nuri tushirilgan o'rnatilgan mayoqlarning fotosi."),
					],
					checklistItems: [
						{
							text: "Devorlar changdan tozalangan; praymer bir tekis qo'llanilgan, quruq dog'larsiz.",
							criteria: "Teginish bilan tekshiriladi — qo'lda chang yo'q.",
						},
						{
							text: "Turli materiallar birikishlarida (masalan, monolit beton va gazoblok) shisha tolali suvoq to'ri o'rnatilgan.",
							criteria: "Yoriqlardan himoya.",
						},
						{
							text: "Mayoqlar lazerli darajaga qat'iy mos o'rnatilgan; vertikal og'ishlar yo'q.",
						},
						{
							text: "Oshxona, santexnika zonalari va o'rnatma shkaflar zonalarida mayoqlar suvoqdan keyin burchak aniq 90 gradus bo'ladigan tarzda o'rnatilgan.",
							criteria: "Mayoqlar bo'ylab gunya va lazer bilan tekshirilgan.",
						},
						{
							text: "Rejalashtirilgan suvoq qatlami qalinligi minimallashtirilgan (noto'g'ri o'rnatilgan mayoqlar tufayli material ortiqcha sarflanishi yo'q).",
						},
					],
				},
				{
					code: "2.3",
					name: "Suvoq ishlari",
					performerType: "MASTER",
					specialization: "PLASTERER",
					standardDurationDays: 6,
					wageRatePerSqm: "22.00",
					description:
						"Geometriya bosqichining yakuni. Qabul qilingandan keyin devorlar muhandislik tarmoqlarini yotqizishga tayyor bo'lishi kerak. Asboblar: 2 metrlik chizg'ich, shchup, qurilish gunyasi.",
					mediaRequirements: [
						photo("Suvoqlangan xonalarning panoramik fotosi."),
						photo(
							"KRITIK: olingan metall mayoqlar va ulardan qolgan to'ldirilgan ariqchalar fotosi.",
						),
					],
					checklistItems: [
						{
							text: "Metall mayoqlar devorlardan olingan, ularning o'rnatilgan joylari tekis suvoqlangan.",
							criteria: "Qolgan mayoqlar finish qoplamada zang paydo qiladi.",
						},
						{
							text: "Barcha yo'nalishlarda (vertikal, gorizontal, diagonal) 2 metrlik chizg'ichni qo'llaganda bo'shliq 1,5–2 mm dan oshmaydi.",
						},
						{
							text: "Santexnika xonalari, oshxona va o'rnatma mebel zonalaridagi burchaklar aniq 90 gradus.",
							criteria: "Og'ish 1 metrga 1 mm dan oshmasin.",
						},
						{
							text: "Devor-pol birlashish chizig'i (kelajakdagi plintus zonasi) tepa-pastliklarsiz mukammal chiziqqa keltirilgan.",
						},
						{
							text: "Suvoq yuzasi bir xil, chuqur tirnalish, eritma oqishlari va qatlam ajralishlarisiz.",
							criteria: "Urilganda bo'sh ovoz yo'q.",
						},
					],
				},
			],
		},
		{
			order: 3,
			name: "Qo'pol muhandislik tarmoqlari",
			subStages: [
				{
					code: "3.1",
					name: "Qo'pol konditsioner va shamollatish",
					performerType: "MASTER",
					specialization: "HVAC",
					standardDurationDays: 2,
					wageRatePerSqm: "10.00",
					description:
						"Birinchi navbatda o'rnatiladi, chunki konditsioner trassalari eng katta hajmli va elektr simlari bilan tez-tez kesishadi. Asboblar: pufakli daraja, ruletka.",
					mediaRequirements: [
						photo("Ichki blokdan tashqi blokga yotqizilgan freon liniyalarining fotosi."),
						photo(
							"Konditsioner drenaj quvurining kanalizatsiya stояkiga ulanishi fotosi (quruq qulfli alohida sifon orqali).",
						),
						photo("Ichki bloklar uchun chiqishlar fotosi, daraja qo'llangan holda."),
					],
					checklistItems: [
						{
							text: "Freon liniyalari butun uzunligi bo'ylab izolyatsiyaga (fleks) to'liq o'ralgan, izolyatsiya uzilishlarisiz.",
							criteria: "Devorlar ichida kondensat hosil bo'lishini oldini oladi.",
						},
						{
							text: "Drenaj liniyasi drenaj tomon kamida 2–3 graduslik uzluksiz nishab bilan yotqizilgan.",
							criteria: "Qarshi nishablar va salqilashsiz.",
						},
						{
							text: "Drenaj kanalizatsiyaga QAT'IY ravishda quruq/tomchili qulfli sifon orqali ulangan.",
							criteria: "Kvartiraga kanalizatsiya hidlari kirishining oldini oladi.",
						},
						{
							text: "Liniyalar shift/devorlarga perfolenta yoki xomutlar bilan ishonchli mahkamlangan; salqilash yo'q.",
						},
						{
							text: "Freon trubkasi va kuch kabeli chiqishlari kelajakdagi blok ulanishlari uchun yetarli zahira uzunlikka ega.",
							criteria: "Kamida 50 sm.",
						},
					],
				},
				{
					code: "3.2",
					name: "Qo'pol santexnika",
					performerType: "MASTER",
					specialization: "PLUMBER",
					standardDurationDays: 4,
					wageRatePerSqm: "16.00",
					description:
						"Suv ta'minoti quvurlari, kanalizatsiya va yashirin installation ramkalari. Kelajakdagi da'volar (oqishlar) nuqtai nazaridan eng xavfli bosqich. Asboblar: manometrli bosim sinov nasosi, lazerli daraja, ruletka, gunya.",
					mediaRequirements: [
						photo(
							"Yig'ilgan kollektor uzelining fotosi (kollektorlar, filtrlar, bosim reduktorlari).",
						),
						photo(
							"Devorga osilgan unitazlar/umumalniklar uchun installation ramkalari fotosi, daraja va ruletka qo'llangan (balandlik qayd etilgan).",
						),
						photo("Gidravlik sinov (oprеssовка) vaqtida manometrning fotosi."),
						photo("Kanalizatsiya stояkining shovqin izolyatsiyasi fotosi."),
					],
					checklistItems: [
						{
							text: "KRITIK SINOV: suv ta'minoti tizimi oprеssовка qilingan.",
							criteria:
								"Odatda 30 daqiqa davomida 10 bar. Manometrdа bosim tushishi yo'q; ulanishlarda oqish yo'q.",
						},
						{
							text: "Unitaz installation ramkalari qattiq mahkamlangan (yuk ostida lyuftga ega emas), barcha tekisliklarda aniq daraja bo'yicha o'rnatilgan.",
						},
						{
							text: "Installation ramkasidagi tayyor pol belgisi kelajakdagi pol qoplamasining hisoblangan darajasiga aniq mos keladi.",
							criteria: "Odatda 1 metr; stяjka va plitka qalinligini hisobga olgan holda.",
						},
						{
							text: "Yashirin smesitellar uchun chiqishlar to'g'ri chuqurlikda (aniq model uchun ko'rsatmaga muvofiq) va aniq darajaga o'rnatilgan.",
						},
						{
							text: "Kanalizatsiya quvurlari standart nishab bilan yotqizilgan.",
							criteria: "50 mm quvurlar uchun 1 metrga 2 sm; 110 mm quvurlar uchun 1 metrga 1 sm.",
						},
						{
							text: "Barcha suv ta'minoti quvurlari issiqlik izolyatsiyasiga (qizil/ko'k) o'ralgan, poldagi quvurlar perekrytie plitasiga ishonchli mahkamlangan.",
						},
						{
							text: "Kanalizatsiya stояki avtomobil yoki maxsus shovqin izolyatsiyali material bilan bo'shliqlarsiz o'ralgan.",
						},
					],
				},
				{
					code: "3.3",
					name: "Qo'pol elektrika va past kuchlanishli tarmoqlar",
					performerType: "MASTER",
					specialization: "ELECTRICIAN",
					standardDurationDays: 4,
					wageRatePerSqm: "15.00",
					description: "Asboblar: lazerli daraja, ruletka, mul'timetr.",
					mediaRequirements: [
						photo("Old qopqoqlarisiz yig'ilgan elektroshchitning fotosi."),
						photo("Past kuchlanishli shchit fotosi (router, TV taqsimlagichlar)."),
						photo("Barcha taqsimlash quticlarining ochiq holatdagi fotosi (izolyatsiyadan oldin)."),
						photo("Shift va devordagi kabel trassalarining panoramik fotosi."),
					],
					checklistItems: [
						{
							text: "Devor ariqchalari rozetka/uchirgichlardan shiftga qat'iy vertikal yo'naltirilgan. Gorizontal devor ariqchalari va diagonal yo'nalishlar yo'q.",
						},
						{
							text: "Kuch va past kuchlanishli kabellar (internet, TV) alohida gofralarda yotqizilgan va faqat to'g'ri burchak ostida kesishadi.",
							criteria: "Halaqit va shovqinlarning oldini olish.",
						},
						{
							text: "Taqsimlash quticlaridagi ulanishlar payvandlash, gilzalar bilan presslash yoki Wago klemmalar bilan amalga oshirilgan.",
							criteria: "Buralishlar QAT'IY taqiqlanadi.",
						},
						{
							text: "Podrozetniklar devorga suvoq tekisligi bilan tekis o'rnatilgan (chiqib turmaydi va chuqur cho'kib qolmagan), eritma changidan tozalangan.",
						},
						{
							text: "Podrozetniklar balandligi va eshik bo'shliqlari/burchaklarga nisbatan joylashishi loyihaga 1 sm aniqlik bilan mos keladi.",
						},
						{
							text: "Elektroshchitdagi barcha kabellar belgilangan; avtomatlar nominallari chiqayotgan kabellar kesimiga mos keladi.",
							criteria: "Masalan, rozetkalar uchun: 2,5 mm² kabel — avtomat 16 A dan oshmasin.",
						},
					],
				},
			],
		},
		{
			order: 4,
			name: "Pol stяjkasini qurish",
			subStages: [
				{
					code: "4.1",
					name: "Asosni tayyorlash va shovqin izolyatsiyasi",
					performerType: "MASTER",
					specialization: "SCREED",
					standardDurationDays: 1,
					wageRatePerSqm: "6.00",
					description:
						"Stяjka devorlar va perekrytie plitalari bilan qattiq kontakt qilmasligi kerak, aks holda u barcha urilish shovqinini qo'shnilarga uzatadi (va «suzuvchi pol» texnologiyasini buzadi).",
					mediaRequirements: [
						photo("Qurilish axlatidan va changdan tozalangan beton asosning fotosi."),
						photo(
							"Yotqizilgan shovqin izolyatsiyali material fotosi (masalan, «Шуманет» yoki ekvivalent), choklari yopishtirilgan.",
						),
						photo("Barcha xonalar perimetrining mahkamlangan demfer tasma bilan fotosi."),
						photo("Yotqizilgan armaturali to'r fotosi (agar nam stяjka qo'llanilsa)."),
					],
					checklistItems: [
						{
							text: "Asos axlatdan to'liq tozalangan; poldagi kabel trassalari va quvurlar ishonchli mahkamlangan va havoda «osilib turmaydi».",
						},
						{
							text: "Demfer tasma xonalarning butun perimetri bo'ylab yotqizilgan, shuningdek poldan ko'tarilayotgan barcha isitish va suv quvurlari atrofiga o'ralgan.",
							criteria: "Qalinligi 8–10 mm.",
						},
						{
							text: "Shovqin izolyatsiyasi listlari ustma-ust (yoki armatura tasmasi bilan yopishtirilgan tutashishlarda) yotqizilgan, eritma perekrytie plitasiga sizib chiqishi mumkin bo'lgan uzilish va bo'shliqlarsiz.",
						},
						{
							text: "Muhandislik kommunikatsiyalari (quvurlar) kritik zonalarda bir-birini vertikal kesib o'tmaydi (aks holda ularning ustidagi stяjka juda yupqa bo'lib yoriladi).",
						},
					],
				},
				{
					code: "4.2",
					name: "Stяjka quyish",
					performerType: "MASTER",
					specialization: "SCREED",
					standardDurationDays: 3,
					wageRatePerSqm: "14.00",
					description:
						"Zamonaviy ta'mirlarda mukammal tekis yuza va tezroq quritish uchun odatda yarim quruq mexanizatsiyalangan stяjka qo'llaniladi. Asboblar: 2 metrlik chizg'ich, lazerli liniya generator, ruletka.",
					mediaRequirements: [
						photo(
							"Polietilen plyonka bilan yopilgan tayyor stяjkaning fotosi (mustahkamlikni to'g'ri olish va namlikni saqlash uchun).",
						),
						photo("Kesilgan deformatsiya choklarining fotosi."),
					],
					checklistItems: [
						{
							text: "GEOMETRIYA: 2 metrlik chizg'ichni turli yo'nalishlarda qo'llaganda bo'shliq 2 mm dan oshmaydi.",
							criteria: "Kvartsvinil, laminat yoki katta formatli plitka uchun kritik.",
						},
						{
							text: "DARAJA: tayyor stяjka belgisi kelajakdagi pol qoplamasi qalinligini hisobga olgan holda loyiha balandligiga aniq mos keladi.",
							criteria: "Masalan, muhandislik taxtasi va yelimi uchun aniq 15 mm qoldirilgan.",
						},
						{
							text: "Ko'p darajali stяjka (agar loyihada turli qalinlikdagi plitka va laminat tutashuvi bo'lsa) loyihaga aniq balandlik farqi bilan bajarilgan.",
						},
						{
							text: "Eshik bo'shliqlarida va 20 kv.m. dan ortiq maydonli xonalarda deformatsiya (cho'kish) choklari kesilgan.",
							criteria: "Stяjkaning ixtiyoriy yorilishini oldini oladi.",
						},
						{
							text: "Stяjka yuzasi zich, oyoq ostida sinmaydi, bo'sh joylar yo'q.",
						},
						{
							text: "Oldingi bosqichda suvoqlangan devorlar stяjka eritmasi bilan changlanmagan; demfer tasma pol darajasidan tepada chiqib turadi.",
						},
					],
				},
			],
		},
		{
			order: 5,
			name: "Finishgacha tayyorgarlik (White Box)",
			subStages: [
				{
					code: "5.1",
					name: "GKL konstruksiyalarini montaj qilish",
					performerType: "MASTER",
					specialization: "DRYWALL",
					standardDurationDays: 4,
					wageRatePerSqm: "13.00",
					description:
						"Shiftlar, qutilar, yashirin pardalar uchun ko'zalar. Ikki bosqichda topshiriladi: avval yashirin karkas, keyin qoplama. Asboblar: lazerli daraja, ruletka, 2 metrlik chizg'ich.",
					mediaRequirements: [
						photo("GKL bilan qoplashdan oldin yig'ilgan metall karkas fotosi."),
						photo(
							"O'rnatilgan fanera zakladnoylari fotosi (kelajakdagi shkaflar, og'ir lustralar yoki televizorlar uchun).",
						),
						photo(
							"Qoplamadan keyingi tayyor konstruksiyalar fotosi (alohida: devorlardagi soya choklar uzellari).",
						),
					],
					checklistItems: [
						{
							text: "Shiftning ko'taruvchi profili qadami qat'iy 400 mm.",
							criteria: "Bo'yash uchun ishonchlilik standarti.",
						},
						{
							text: "Zakladnoy elementlar texnik loyihada ko'rsatilgan barcha joylarda o'rnatilgan va ishonchli mahkamlangan.",
						},
						{
							text: "GKL listlari shaxmat tartibida o'rnatilgan (choklar «xoch» hosil qilmaydi); zavod qirralari shpaklyovka aralashmasi uchun 22,5 gradusga zariflashtirilgan.",
						},
						{
							text: "Osilgan choklar yo'q: barcha list ulanishlari qat'iy metall profilga tushadi.",
						},
						{
							text: "Soya profillari (shift yoki plintus) tutashishlarda daraja farqlarisiz bir tekislikda o'rnatilgan; burchaklar 45 gradusga zariflashtirilgan.",
						},
					],
				},
				{
					code: "5.2",
					name: "Yashirin eshik ramkalarini o'rnatish",
					performerType: "MASTER",
					specialization: "DOOR_INSTALLER",
					standardDurationDays: 1,
					wageRatePerSqm: "5.00",
					description:
						"Minimalistik ta'mirlarda yashirin eshiklar bo'yashdan oldin o'rnatiladi, shunda bo'yoqchilar devorni ramka bilan bir tekislikda chiqaradi. Asboblar: lazerli liniya generator, pufakli daraja, ruletka.",
					mediaRequirements: [
						photo("Tirgaklar bilan o'rnatilgan ramkaning fotosi."),
						photo("Devor va ramka tekisligini proyeksiyalovchi lazerli darajaning fotosi."),
					],
					checklistItems: [
						{
							text: "Alyumin eshik ramkasi suvoqlangan devor bilan qat'iy bir tekislikda o'rnatilgan.",
							criteria: "Og'ish 0 mm.",
						},
						{ text: "Ramka barcha tekisliklarda qat'iy vertikal o'rnatilgan." },
						{
							text: "Ramkaning pastki qirrasidan tayyor pol darajasigacha to'g'ri bo'shliq saqlangan (pol qoplamasi qalinligini hisobga olgan holda).",
						},
						{
							text: "Ramka va devor orasidagi bo'shliq montaj ko'pigi bilan zich va bir tekis to'ldirilgan.",
						},
					],
				},
				{
					code: "5.3",
					name: "Bo'yashga tayyorgarlik ishlari",
					performerType: "MASTER",
					specialization: "PAINTER",
					standardDurationDays: 8,
					wageRatePerSqm: "20.00",
					description:
						"Eng uzoq va talabchan bosqich. Qat'iy sifat mezonlari (Q4 standarti) bo'yicha qabul qilinadi. Asboblar: bo'yoqchi inspeksiya lampasi (qiya yorug'lik lampasi) — majburiy; 2 metrlik chizg'ich.",
					mediaRequirements: [
						photo(
							"Armatura qog'oz tasmasi bilan to'ldirilgan GKL choklarining fotosi (shisha to'r emas!).",
						),
						photo(
							"Barcha devor va shiftlarga qo'llanilgan to'qilmagan mato fotosi (mikroyorqlardan himoya).",
						),
						photo(
							"Barcha tashqi burchaklarga o'rnatilgan metall yoki plastik burchak profillari fotosi.",
						),
					],
					checklistItems: [
						{
							text: "Tashqi burchaklar (deraza otkoslarí, qutilar) mukammal to'g'ri; profillar devor tekisligidan chiqib turmaydi; burchak qat'iy 90 gradus.",
						},
						{
							text: "Devor-shift va devor-pol birlashish chiziqlari mukammal 90 graduslik chiziqqa keltirilgan.",
							criteria: "Yashirin plintus va soya shiftlarni o'rnatish uchun kritik.",
						},
						{
							text: "QIYA YORUG'LIK TEKSHIRUVI: inspeksiya lampasini devor/shift yuzasi bilan parallel yo'naltirganda cho'kish, do'mboqlar, chuqur jimlash tirnalishlari yoki shpaklyovka oqishlari ko'rinmaydi. Yuza bir xil.",
						},
						{
							text: "Deraza otkoslarí bo'yashga tayyorlangan; tekisliklar bir xil, otkoslar burchaklari ikkala tomonda bir xil.",
						},
						{
							text: "Xonalar bo'yash changidan to'liq tozalangan; devorlar praymerlangan va finish qatlam (bo'yoq) uchun tayyor.",
						},
					],
				},
			],
		},
		{
			order: 6,
			name: "Finish qoplama",
			subStages: [
				{
					code: "6.1",
					name: "Plitka qoplash",
					performerType: "MASTER",
					specialization: "TILER",
					standardDurationDays: 6,
					wageRatePerSqm: "25.00",
					description:
						"Eng qimmat finish turi. Tizim plitka yelimi va zatirka sarfini qayd etishi shart. Asboblar: lazerli liniya generator, 2 metrlik chizg'ich, qurilish gunyasi, shchup.",
					mediaRequirements: [
						photo(
							"Birinchi qatorning «quruq» yotqizilishi fotosi (naqsh va qirqimlarni kelishish).",
						),
						photo(
							"Qo'llanilgan gidroizolyatsiya fotosi (agar qo'pol santexnika bosqichida topshirilmagan bo'lsa).",
						),
						photo(
							"Epoksid yoki sement zatirka qo'llashdan oldin yelimdan tozalangan choklar fotosi.",
						),
						photo(
							"Foydalanilgan o'ramlar fotosi (yelim qoplari, zatirka idishlari) — sarfni birlik smeta bilan solishtirish uchun.",
						),
					],
					checklistItems: [
						{
							text: "Qoplangan plitka tekisligi og'ishi 2 metrga 1,5 mm dan oshmaydi.",
							criteria: "Chizg'ich bilan barcha diagonallar bo'yicha tekshiriladi.",
						},
						{
							text: "Tor qirqimlar (5 sm dan kam) ko'rinadigan zonalarda yo'q; yotqizish simmetrik (dizayn-loyihaga muvofiq).",
						},
						{
							text: "Barcha tashqi burchaklar (qutilar, ko'zalar) qat'iy 45 graduslik zariflash bilan bajarilgan; emalda siniqlar yo'q.",
						},
						{
							text: "Plitka choklari bir xil (standart 1–1,5 mm); xochchalar va SVP (plitkani tekislash tizimlari) to'liq olib tashlangan.",
						},
						{
							text: "Zatirka bir tekis qo'llanilgan, bo'shliq, kovaklik va plitka yuzasiga oqishlarsiz. Epoksid zatirka qoldiqlarsiz tozalangan (plitka yuzasi yopishqoq emas).",
						},
						{
							text: "Rezina bolg'a bilan urilganda butun maydon bo'ylab bo'sh ovozlar aniqlanmagan.",
						},
					],
				},
				{
					code: "6.2",
					name: "Devorlar va shiftlarni bo'yash",
					performerType: "MASTER",
					specialization: "PAINTER",
					standardDurationDays: 3,
					wageRatePerSqm: "12.00",
					description:
						"Bo'yoq obyekt to'liq changdan tozalanganidan keyingina qo'llaniladi. Asboblar: inspeksiya lampasi (qiya yorug'lik).",
					mediaRequirements: [
						photo(
							"Himoya plyonkasi bilan yopilgan derazalar, kirish eshigi va yashirin eshik ramkalari fotosi (sachrashlardan himoya).",
						),
						photo("Bo'sh bo'yoq idishlari fotosi (sarf nazorati)."),
					],
					checklistItems: [
						{
							text: "Yuza bir tekis bo'yalgan; o'tkazib yuborilgan joylar, valikdan qolgan chiziqlar va dog'lar yo'q.",
							criteria: "Inspeksiya yorug'ligi ostida tekshiriladi.",
						},
						{
							text: "Bo'yalgan yuzada yopishgan axlat, valik tukları va bo'yoq oqishlari yo'q.",
						},
						{
							text: "Ikki turli rang chizig'i (masalan, shift/devor) mukammal to'g'ri, sizib o'tishlarsiz.",
							criteria: "1 metr masofadan tekshiriladi.",
						},
					],
				},
				{
					code: "6.3",
					name: "Pol qoplamasini o'rnatish",
					performerType: "MASTER",
					specialization: "FLOORING",
					standardDurationDays: 2,
					wageRatePerSqm: "11.00",
					description: "Laminat, kvartsvinil yoki muhandislik taxtasi.",
					mediaRequirements: [
						photo("Tozalangan stяjka va yopishtirilgan chokli yotqizilgan podlojka fotosi."),
						photo("Devor perimetri bo'ylab deformatsiya bo'shliqlarining batafsil fotosi."),
					],
					checklistItems: [
						{
							text: "Pol qoplamasi bo'sag'asiz, yagona uzluksiz polotno sifatida yotqizilgan (agar maydon va ishlab chiqaruvchi reglamenti ruxsat bersa).",
						},
						{
							text: "Devorlar, quvurlar va o'rnatma mebel atrofidagi butun perimetr bo'ylab texnik deformatsiya bo'shlig'i saqlangan.",
							criteria: "Odatda 8–10 mm.",
						},
						{
							text: "Yuza bo'ylab yurganda g'ichirlash, sinish yoki egilish yo'q (qulflash birikmasi buzilmagan; stяjka tekis).",
						},
						{
							text: "Naqsh (yog'och teksturasi) tasodifiy taqsimlangan; yonma-yon bir xil planka takrorlanishlari yo'q.",
						},
					],
				},
			],
		},
		{
			order: 7,
			name: "Finish montaj (muhandislik tarmoqlari va furnitura)",
			subStages: [
				{
					code: "7.1",
					name: "Finish elektrika",
					performerType: "MASTER",
					specialization: "ELECTRICIAN",
					standardDurationDays: 2,
					wageRatePerSqm: "8.00",
					description:
						"Barcha changli va nam ishlar tugagandan keyin tizim avtomatik ravishda elektriklarni old furniturani o'rnatishga chaqiradi.",
					mediaRequirements: [photo("O'rnatilgan old ramkalar va tayyor elektroshchit fotosi.")],
					checklistItems: [
						{ text: "Rozetka va uchirgich ramkalari devorga bo'shliqlarsiz zich yopishadi." },
						{
							text: "Mexanizmlar qat'iy gorizontal o'rnatilgan.",
							criteria: "Mini-daraja bilan tekshiriladi.",
						},
						{ text: "Barcha yoritgichlar ulangan va ishchi holatda." },
						{
							text: "Elektroshchit to'liq yig'ilgan; old qopqoqlar o'rnatilgan; avtomatlarning yakuniy belgilanishi qo'llanilgan. UZO/AVDT «Test» tugmasi ishlashi tekshirilgan.",
						},
					],
				},
				{
					code: "7.2",
					name: "Finish santexnika",
					performerType: "MASTER",
					specialization: "PLUMBER",
					standardDurationDays: 2,
					wageRatePerSqm: "9.00",
					description:
						"Barcha changli va nam ishlar tugagandan keyin tizim avtomatik ravishda santexniklarni old furniturani o'rnatishga chaqiradi.",
					mediaRequirements: [
						photo("O'rnatilgan devorga osilgan unitaz, umumalniklar va dush tizimlari fotosi."),
						photo("Nam zonalardagi barcha germetik choklar fotosi."),
					],
					checklistItems: [
						{
							text: "Devorga osilgan unitaz, umumalniklar va dush tizimlari qat'iy daraja bo'yicha o'rnatilgan.",
						},
						{
							text: "Smesitellarning xromli/mat-qora qismlarida kalitdan tirnalish yo'q.",
							criteria: "Montaj to'g'ri asbob bilan amalga oshirilgan.",
						},
						{
							text: "Barcha nam zonalar (vanna/umumalnik-plitka tutashuvi) sanitar germetik bilan ishlangan; chok bir tekis, uzilishlarsiz.",
						},
						{
							text: "Barcha nuqtalarda 10 daqiqa suv ochilgan: umumalniklar va vanna ostida oqish yo'q; suv tez oqib ketadi.",
							criteria: "Nishablar to'g'ri.",
						},
					],
				},
			],
		},
		{
			order: 8,
			name: "Tozalash va yakuniy qabul (Yunit yopish)",
			subStages: [
				{
					code: "8.1",
					name: "Professional tozalash",
					performerType: "MASTER",
					specialization: "CLEANING",
					standardDurationDays: 1,
					wageRatePerSqm: "4.00",
					description:
						"Tizim obyektni tozaliksiz yakuniy bosqichga o'tkazmaydi. Tashqi tozalash pudratchisi tomonidan bajariladi.",
					mediaRequirements: [
						photo("Tozalangan yuzalar, derazalar, oynalar va dush bo'limlari fotosi."),
					],
					checklistItems: [
						{
							text: "Qurilish changi barcha yuzalardan, jumladan isitish radiatorlarining ichki qismlari va eshiklarning yuqori qirralaridan to'liq olib tashlangan.",
						},
						{
							text: "Derazalar, oynalar va shisha dush bo'limlari iz qoldirmasdan yuvilgan.",
						},
						{
							text: "Derazalar va plitkada qurilish aralashmalari, skotch yoki bo'yoq izlari yo'q.",
						},
					],
				},
				{
					code: "8.2",
					name: "Yakuniy audit va moliyaviy yopish",
					performerType: "INSPECTOR",
					standardDurationDays: 1,
					wageRatePerSqm: "0",
					description:
						"ERP ichidagi tizim qadami, ishlab chiqarish siklining muvaffaqiyatini qayd etadi. Egasi yoki yopish huquqiga ega inspektor tomonidan bajariladi.",
					mediaRequirements: [
						photo("Tayyor ta'mirning yakuniy professional fotolari (portfolio shakllantirish)."),
					],
					checklistItems: [
						{
							text: "Portfolio shakllantirish: tayyor ta'mirning yakuniy professional fotolari obyekt kartochkasiga yuklangan.",
						},
						{
							text: "Kamchiliklar xulosasi: ERP har bosqichdagi qaytarish (kamchilik) sonini tahlil qilib, ichki master reytinglarini avtomatik ravishda to'g'rilagan.",
						},
						{
							text: "Yunit iqtisodiyotini qayd etish: tizim barcha tranzaksiyalarni (material xarajatlari, to'langan master maoshlari, transport xarajatlari) konsolidatsiya qildi va loyihaning yakuniy rentabelligini chiqardi.",
							criteria: "Agar tannarx maqsadli ko'rsatkich ichida bo'lsa — yashil marker.",
						},
						{
							text: "Qabul-topshirish dalolatnomasi imzolash uchun avtomatik shakllantirilgan.",
						},
						{
							text: "Status o'zgarishi: «Obyekt muvaffaqiyatli yakunlandi» bosilgan; konveyer sikli yopilgan.",
						},
					],
				},
			],
		},
	],
};
