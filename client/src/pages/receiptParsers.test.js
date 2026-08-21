import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parseAmountFromReceipt,
  parseMerchantFromReceipt,
  parseDateFromReceipt,
  parseReceiptText,
} from './receiptParsers.js';

// --- parseAmountFromReceipt ---

test('parseAmountFromReceipt finds amount from Bulgarian receipt text', () => {
  const text = 'ФИСКАЛНА БЕЛЕЖКА\nМагазин Пример\nСУМА ЗА ПЛАЩАНЕ 12,34\nБЛАГОДАРИМ';
  assert.equal(parseAmountFromReceipt(text), 12.34);
});

test('parseAmountFromReceipt handles spaced amounts and currency labels', () => {
  const text = 'КРАЙНА СУМА 1 234,56 лв';
  assert.equal(parseAmountFromReceipt(text), 1234.56);
});

test('parseAmountFromReceipt returns the EUR total on a EUR-only receipt', () => {
  const text = 'ОБЩА СУМА ЕВРО  81.45';
  assert.equal(parseAmountFromReceipt(text), 81.45);
});

test('parseAmountFromReceipt ignores product quantity lines like "2.000 x 0.75"', () => {
  const text = 'Мляко 1л\n2.000 x 0.75\nОБЩА СУМА ЕВРО  12.34';
  assert.equal(parseAmountFromReceipt(text), 12.34);
});

// --- parseMerchantFromReceipt ---

test('parseMerchantFromReceipt selects the shop name from receipt lines', () => {
  const text = 'ФИСКАЛНА БЕЛЕЖКА\nМагазин Пример ООД\nДата 06.08.2026\nОБЩО 12,34';
  assert.equal(parseMerchantFromReceipt(text), 'Магазин Пример ООД');
});

test('parseMerchantFromReceipt prefers the store name over product lines in noisy OCR text', () => {
  const text = 'ФИСКАЛЕН БОН\nМляко 1 л\nМагазин Пример ЕООД\nОБЩО 12,34\nБЛАГОДАРИМ';
  assert.equal(parseMerchantFromReceipt(text), 'Магазин Пример ЕООД');
});

test('parseMerchantFromReceipt finds Kaufland store name and ignores address line', () => {
  const text = 'Хипермаркет Кауфланд Стара Загора-Бедечка\nУл. Иван Вазов 2\nЗДДС No BG131129282\nAlvina Омек 3.29';
  assert.equal(parseMerchantFromReceipt(text), 'Хипермаркет Кауфланд Стара Загора-Бедечка');
});

test('parseMerchantFromReceipt ignores ЗДДС number line and operator lines', () => {
  const text = 'ЗДДС No BG131129282\n#0001     Оператор 1\nУНП: BN021892-0126\nBilla Sofia';
  assert.equal(parseMerchantFromReceipt(text), 'Billa Sofia');
});

// --- parseDateFromReceipt ---

test('parseDateFromReceipt understands common receipt date formats', () => {
  const text = 'Дата: 06/08/2026\nВреме: 14:30';
  assert.equal(parseDateFromReceipt(text), '06/08/2026');
});

// --- parseReceiptText (comprehensive) ---

test('parseReceiptText extracts products, total, merchant and date from a Kaufland-style receipt', () => {
  const text = [
    'Хипермаркет Кауфланд Стара Загора-Бедечка',
    'Ул. Иван Вазов 2',
    'ЗДДС No BG131129282',
    'УНП: BN021892',
    'Essex гел пране3,75л           7.66 б',
    'Nastea праск.1.5 л             0.99 б',
    '#XTRA отстъпка                 0.20',
    'ОТСТЪПКИ',
    '2.000 x 0.75',
    'ОБЩА СУМА ЕВРО  8.65',
    'ОБЩА СУМА В ЛВ  16.91',
    'ОБМЕНЕН КУРС 1 ЕВРО = 1.95583 ЛВ',
  ].join('\n');

  const result = parseReceiptText(text);

  assert.equal(result.total, 8.65);
  assert.equal(result.merchant, 'Хипермаркет Кауфланд Стара Загора-Бедечка');
  assert.ok(result.products.length >= 2, `Expected at least 2 products, got ${result.products.length}`);
});

test('parseReceiptText fixes OCR digit/letter confusion (О→0, З→3)', () => {
  const text = 'Продукт     З.99 б\nОБЩА СУМА ЕВРО  З.99';
  const result = parseReceiptText(text);
  assert.equal(result.total, 3.99);
});

test('parseAmountFromReceipt ignores OCR noise digit before total — "2 81.45" should give 81.45 not 281.45', () => {
  const text = 'ОБЩА СУМА ЕВРО 2 81.45';
  assert.equal(parseAmountFromReceipt(text), 81.45);
});

test('parseAmountFromReceipt handles OCR Щ→Ш mistake in ОБЩА/ОБША СУМА ЕВРО', () => {
  const text = 'ОБША СУМА ЕВРО 81.45';
  assert.equal(parseAmountFromReceipt(text), 81.45);
});

test('parseAmountFromReceipt ignores "ДАДЕНА СУМА" (cash tendered) after the real total', () => {
  const text = 'ОБЩА СУМА ЕВРО  21.30\nДАДЕНА СУМА  41.65\nРЕСТО  20.35';
  assert.equal(parseAmountFromReceipt(text), 21.30);
});

test('parseAmountFromReceipt ignores "ПОЛУЧЕНА СУМА" (received cash) after the real total', () => {
  const text = 'ОБЩА СУМА ЕВРО  21.30\nПОЛУЧЕНА СУМА  41.65\nРЕСТО  20.35';
  assert.equal(parseAmountFromReceipt(text), 21.30);
});

test('parseAmountFromReceipt ignores card payment lines after the real total', () => {
  const text = 'СУМА В ЕВРО  21.30\nСУМА КАРТА  21.30\nБЕЗНАЛИЧНО  21.30';
  assert.equal(parseAmountFromReceipt(text), 21.30);
});
