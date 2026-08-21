// ==========================================================================
//  СКЕНЕР ЗА КАСОВИ БЕЛЕЖКИ (БГ) — чист парсър (без I/O)
//  Поддържа Kaufland / Lidl / Billa / Fantastico формат
// ==========================================================================

// --------------------------------------------------------------------------
// КЛЮЧОВИ ДУМИ
// --------------------------------------------------------------------------

const TOTAL_KEYWORDS = [
	/общо\s*сума/i,
	/сума\s*за\s*плащане/i,
	/обща\s*сума/i,
	/к\.?\s*плащане/i,
	/всичко/i,
	/\btotal\b/i,
	/(?:^|\s)сума(?:\s|$)/i,
];

// Редове, които съдържат "сума"/"плащане" и т.н., но НЕ са реалната крайна сума.
// Проверяват се ПРЕДИ TOTAL_KEYWORDS, за да не спираме парсването твърде рано.
const EXCLUDE_FROM_TOTAL = [
	/обш[aа]\s*сум[aа]\s*(?:в\s*)?лв/i,  // БГН сума — искаме само EUR
	/обща\s*сума\s*(?:в\s*)?лв/i,   // вариант без OCR грешка
	// Картово плащане — ред след реалната сума (СУМА КАРТА / КАРТА СУМА / БЕЗНАЛИЧНО)
	/сума.*карт|карт.*сума/i,   // "СУМА КАРТА", "СУМА С КАРТА", "КАРТА СУМА"
	/безналично/i,               // "БЕЗНАЛИЧНО" / "БЕЗНАЛИЧНО/КАРТА"
	/картово/i,                  // "КАРТОВО ПЛАЩАНЕ"
	// Плащане / ресто — редове СЛЕД реалната сума
	/дадена?\s*сума/i,
	/подадена?/i,
	/получена?\s*сума/i,
	/^получен/i,
	/наличност/i,
	/банкова\s*карт/i,
	/платено/i,
	/ресто/i,
	/спестен/i,
	/икономи/i,
	/натрупан/i,
	/точки/i,
];

const DISCOUNT_KEYWORDS = [
	/#?xtra\s*отстъпк/i,
	/отстъпк/i,
	/намален/i,
	/промо/i,
	/бонус/i,
	/discount/i,
	/#k\s*card/i,
];

const IGNORE_KEYWORDS = [
	/касов\s*бон/i,
	/фискал/i,
	/обект/i,
	/^адрес/i,
	/^бул\.|^ул\./i,
	/еик|булстат/i,
	/зддс|ддс\s*№/i,
	/касиер/i,
	/оператор/i,
	/^дата/i,
	/^час/i,
	/благодар/i,
	/посет/i,
	/www\.|http/i,
	/^тел\.?:/i,
	/плащане\s*в\s*брой/i,
	/безконтактно/i,
	/дебит|кредит/i,
	/ресто/i,
	/получена\s*сума/i,
	/бр\.?\s*артикул/i,
	/данъчна\s*група/i,
	/обменен\s*курс/i,
	/^[абв]\s*[-–]\s*\d/i,
	/^унп:/i,
	/^#\d/i,
	/^евро\s*#/i,
];

// Ред само с количество и единична цена: "2 бр X 1.99" / "0.550 кг X 3.20" / "2 x 1.99"
const QTY_REGEX = /^(\d+[.,]?\d*)\s*(?:бр|бройки|кг|kg)?\s*[xXхХ]\s*(\d+[.,]\d{1,2})/i;

// Продуктов ред: описание + цена накрая (с незадължителна ДДС буква и незадължителна валута)
const PRICE_AT_END_REGEX =
	/^(.{2,60}?)\s+(-?\d+[.,]\d{2})\s*([\u0410\u0411\u0412\u0430\u0431\u0432]?)\s*(?:лв\.?|BGN)?\s*$/;

// --------------------------------------------------------------------------
// ПОМОЩНИ ФУНКЦИИ
// --------------------------------------------------------------------------

// OCR често бърка кирилски букви с цифри в числов контекст (О <-> 0, З <-> 3)
function normalizeOcrNumber(str) {
	return String(str)
		.replace(/(?<=\d[.,]?)[Оо](?=\d)|(?<=\d)[Оо](?=[.,]?\d)/g, '0')
		.replace(/[Зз](?=[.,]?\d)/g, '3')
		.replace(/,/g, '.')
		.replace(/\s+/g, '');
}

function parsePrice(str) {
	const norm = normalizeOcrNumber(str);
	const match = norm.match(/-?\d+\.\d{1,2}/);
	if (!match) return null;
	return Number.parseFloat(match[0]);
}

// Взима ПОСЛЕДНОТО (най-дясното) десетично число на реда — без премахване на интервали.
// Предотвратява "2 81.45" → "281.45" при OCR шум пред сумата.
function parsePriceLast(str) {
	const normalized = String(str)
		.replace(/[Оо](?=\d)/g, '0')
		.replace(/[Зз](?=[.,]?\d)/g, '3')
		.replace(/,/g, '.')
		.replace(/(\d{1,3})\s+(\d{3}\.)/g, '$1$2');
	const matches = normalized.match(/-?\d+\.\d{1,2}/g);
	if (!matches) return null;
	const val = Number.parseFloat(matches[matches.length - 1]);
	return Number.isFinite(val) ? val : null;
}

function round2(n) {
	return Math.round(n * 100) / 100;
}

// --------------------------------------------------------------------------
// ОСНОВНА ФУНКЦИЯ: парсиране на суровия OCR текст
// --------------------------------------------------------------------------

/**
 * Извлича всичко значимо от OCR текста на касова бележка.
 * Връща { products, total, merchant, date }
 */
export function parseReceiptText(rawText, { debug = false } = {}) {
	const text = String(rawText ?? '');
	const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

	const products = [];
	let detectedTotal = null;
	let stopParsingProducts = false;

	for (const line of lines) {
		const isExcludedTotal = EXCLUDE_FROM_TOTAL.some((rx) => rx.test(line));

		// --- Проверка за крайна сума ---
		if (!isExcludedTotal && TOTAL_KEYWORDS.some((rx) => rx.test(line))) {
			const price = parsePriceLast(line);
			if (price !== null && price > 0) {
				if (debug) console.debug(`[receipt] TOTAL match: "${line}" → ${price}`);
				detectedTotal = price;
			}
			stopParsingProducts = true;
			continue;
		}

		if (isExcludedTotal) {
			if (debug) console.debug(`[receipt] EXCLUDED: "${line}"`);
			continue;
		}

		if (stopParsingProducts) continue;
		if (IGNORE_KEYWORDS.some((rx) => rx.test(line))) continue;

		// --- Ред с отстъпка → прикачваме към последния продукт ---
		if (DISCOUNT_KEYWORDS.some((rx) => rx.test(line))) {
			const discountAmount = parsePrice(line);
			if (discountAmount !== null && products.length > 0) {
				const last = products[products.length - 1];
				const amount = Math.abs(discountAmount);
				last.discount = round2((last.discount || 0) + amount);
				last.finalPrice = round2(last.totalPrice - last.discount);
			}
			continue;
		}

		// --- Ред с количество × единична цена ("2.000 x 1.55") ---
		const qtyMatch = line.match(QTY_REGEX);
		if (qtyMatch && products.length > 0) {
			const qty = Number.parseFloat(normalizeOcrNumber(qtyMatch[1]));
			const unitPrice = parsePrice(qtyMatch[2]);
			const last = products[products.length - 1];
			if (Number.isFinite(qty) && qty > 0) last.quantity = qty;
			if (unitPrice !== null) last.unitPrice = unitPrice;
			continue;
		}

		// --- Продуктен ред: текст + цена накрая ---
		const priceMatch = line.match(PRICE_AT_END_REGEX);
		if (priceMatch) {
			const name = priceMatch[1].trim();
			const price = parsePrice(priceMatch[2]);
			if (name.length < 2 || price === null || price < 0) continue;
			products.push({
				name,
				quantity: 1,
				unitPrice: price,
				totalPrice: price,
				discount: 0,
				finalPrice: price,
			});
		}
	}

	// Преизчисляваме общата цена за продукти с qty > 1
	for (const p of products) {
		if (p.quantity !== 1) {
			p.totalPrice = round2(p.unitPrice * p.quantity);
			p.finalPrice = round2(p.totalPrice - p.discount);
		}
	}

	// Fallback за сума: линейно сканиране, изпускайки умножения редове
	if (detectedTotal === null) {
		const values = [];
		for (const line of lines) {
			if (EXCLUDE_FROM_TOTAL.some((rx) => rx.test(line))) continue;
			if (/\d+[.,]\d+\s*[xX×]\s*\d+[.,]\d+/.test(line)) continue;
			if (/\d[.,]\d{2}\s*[-–—]/.test(line)) continue;
			for (const m of line.match(/\d+[.,]\d{2}/g) ?? []) {
				const val = Number.parseFloat(m.replace(',', '.'));
				if (Number.isFinite(val) && val > 0) values.push(val);
			}
		}
		detectedTotal = values.length ? values[values.length - 1] : null;
	}

	return {
		products,
		total: detectedTotal,
		merchant: parseMerchantFromReceipt(text),
		date: parseDateFromReceipt(text),
	};
}

// --------------------------------------------------------------------------
// ТРИТЕ ОСНОВНИ ЕКСПОРТА (съвместими с Transactions.jsx)
// --------------------------------------------------------------------------

export function parseAmountFromReceipt(text) {
	return parseReceiptText(text).total;
}

export function parseMerchantFromReceipt(text) {
	const ignoredWords = [
		'ФИСКАЛЕН', 'КАСОВ', 'БЕЛЕЖКА', 'ОБЩО', 'ОБЩА', 'TOTAL',
		'ДДС', 'ЗДДС', 'VAT', 'БЛАГОДАРИМ', 'АРТИКУЛ',
		'СУМА', 'ПЛАЩАНЕ', 'ДАЖЕ', 'БОН', 'КРАЙ', 'СМЕТКА',
		'ПОКАЗАНИЕ', 'УНП', 'ОПЕРАТОР', 'КАСИЕР', 'ЕВРО',
		'ОТСТЪПКИ', 'ОТСТЪПКА', 'КУПОН',
	];

	const lines = String(text ?? '')
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean);

	const candidates = lines
		.filter((line) => line.length >= 3 && line.length <= 80)
		.filter((line) => !/^\d/.test(line))
		.filter((line) => !/\d{3,}/.test(line.replace(/[\s.,x–—-]/g, '')))
		.filter((line) => !ignoredWords.some((word) => line.toUpperCase().includes(word)))
		.filter((line) => /[A-Za-zА-Яа-яЁё]/.test(line))
		.filter((line) => !/^(ДАТА|ВРЕМЕ|ОБЩО|КРАЙНА|СУМА|ПЛАЩАНЕ|БЛАГОДАРИМ|ЧЕСТИТ|#)/i.test(line))
		.filter((line) => !/\b(ЛВ|EUR|USD|BGN)\b/i.test(line))
		.filter((line) => !/^(ул\.|бул\.|пл\.|ул |бул |пл )/i.test(line))
		.filter((line) => !(line.length <= 20 && /(?:^|\s)(кг|гр|мл|л|бр|г)(?:\s|$)/i.test(line)));

	if (!candidates.length) return '';

	// Веригатели на български вериги
	const chainPattern =
		/кауфланд|kaufland|билла|billa|лидл|lidl|пени|penny|фантастико|т[- ]?маркет|метро|хипермаркет|супермаркет|дискаунт/i;
	const chainCandidate = candidates.find((l) => chainPattern.test(l));
	if (chainCandidate) return chainCandidate;

	const legalCandidate = candidates.find((l) =>
		/(ЕООД|ООД|АД|ЕАД|ДЗЗД|КК|ЕТ|EOOD|OOD)(?:\s|$)/i.test(l),
	);
	if (legalCandidate) return legalCandidate;

	const storeCandidate = candidates.find((l) => /магазин|shop|store|market|super|фирма|комерс|търгов|trade/i.test(l));
	if (storeCandidate) return storeCandidate;

	const nonProduct = candidates.find(
		(l) =>
			!/\b(МЛЯКО|ХЛЯБ|СУШЕН|СЛАДК|КЕФИР|ЙОГУРТ|МЕСО|КОЛБАС|СОС|БИСКВИТ|СИРЕНЕ|ЗЕЛЕНЧУЦИ|ПИВО|ВОДА)\b/i.test(l) &&
			l.length > 4,
	);
	return nonProduct ?? candidates[0];
}

export function parseDateFromReceipt(text) {
	const match = String(text ?? '').match(/(\d{1,2}[./-]\d{1,2}[./-](?:\d{4}|\d{2}))/);
	return match ? match[1] : '';
}
