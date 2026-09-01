import test from "node:test";
import assert from "node:assert/strict";

import { buildCsvImportPreview, buildCsvRowDedupeKey, evaluateCsvRowStatus } from "./csvImport.js";

test("reads semicolon CSV with european amount format and valid dates", () => {
  const csv = `Дата;Описание;Сума;Тип
08.08.2026;Гастрономия;-45,99;expense
09.08.2026;Заплата;1.234,56;income`;

  const preview = buildCsvImportPreview(csv, {
    walletId: 42,
    existingTransactions: [],
    now: new Date("2026-08-10T12:00:00Z"),
  });

  assert.equal(preview.validRows, 2);
  assert.equal(preview.rows[0].amount, -45.99);
  assert.equal(preview.rows[1].amount, 1234.56);
  assert.equal(preview.rows[0].date, "2026-08-08");
  assert.equal(preview.rows[1].date, "2026-08-09");
});

test("reads comma-thousands decimal-dot CSV amount format", () => {
  const csv = `Date,Description,Amount\n2026-08-07,Groceries,-1,234.56\n2026-08-08,Salary,2,345.67`;

  const preview = buildCsvImportPreview(csv, {
    walletId: 7,
    existingTransactions: [],
    now: new Date("2026-08-10T12:00:00Z"),
  });

  assert.equal(preview.validRows, 2);
  assert.equal(preview.rows[0].amount, -1234.56);
  assert.equal(preview.rows[1].amount, 2345.67);
});

test("recognizes common alternate column names from bank exports", () => {
  const csv = `date,details,amount,credit,debit\n2026-08-06,ATM withdrawal,120.00,,120.00\n2026-08-08,Salary,,2500.00,`;

  const preview = buildCsvImportPreview(csv, {
    walletId: 9,
    existingTransactions: [],
    now: new Date("2026-08-10T12:00:00Z"),
  });

  assert.equal(preview.validRows, 2);
  assert.equal(preview.rows[0].type, "expense");
  assert.equal(preview.rows[1].type, "income");
});

test("handles DSK export metadata before the transaction table", () => {
  const csv = `"БАНКА","БАНКА ДСК ЕАД"
"АДРЕС","СОФИЯ, МОСКОВСКА 19"
"Счетоводна дата","Вальор","Основание","Наредител","Номер сметка на наредителя / получателя","Вид на трансакцията","Свързваща референция","Валутен курс","Сума във валутата на превода","Дебит EUR","Кредит EUR","Дата","час"
"26.08.2026","26.08.2026","474836xxxxxx0742  БДСК ТАКСА ПАРИЧЕН ТРАНСФЕР 24.08.2026 19:30<br/>Авт. код: B93041<br/>Номер на у-во: 90000000","BGR SOFIA BETANO BG","7291061523019999","КАРТОВА ОПЕРАЦИЯ","608260934307551","","","1,51","","26.08.2026","17:04"
"27.08.2026","27.08.2026","474836xxxxxx0742  VISA P2P - ИЗПРАЩАНЕ СУМИ 25.08.2026 13:04<br/>Авт. код: B30448","IRL Dublin Revolut  3650","","КАРТОВА ОПЕРАЦИЯ","","","","20,00","","27.08.2026","16:58"`;

  const preview = buildCsvImportPreview(csv, {
    walletId: 42,
    existingTransactions: [],
    now: new Date("2026-08-31T12:00:00Z"),
  });

  assert.equal(preview.validRows, 2);
  assert.equal(preview.rows[0].amount, -1.51);
  assert.equal(preview.rows[1].amount, -20);
  assert.equal(preview.rows[0].description.includes("БДСК ТАКСА"), true);
});

test("marks duplicate rows inside the same CSV import as duplicate", () => {
  const csv = `Date,Description,Amount
2026-08-07,Supermarket,-12.50
2026-08-07,Supermarket,-12.50`;

  const preview = buildCsvImportPreview(csv, {
    walletId: 42,
    existingTransactions: [],
    now: new Date("2026-08-10T12:00:00Z"),
  });

  assert.equal(preview.validRows, 1);
  assert.equal(preview.duplicateRows, 1);
  assert.equal(preview.rows[0].status, "valid");
  assert.equal(preview.rows[1].status, "duplicate");
});

test("duplicate detection rejects the same edit against the current preview batch", () => {
  const seenHashes = new Set([
    buildCsvRowDedupeKey({ date: "2026-08-07", description: "Supermarket", amount: -12.5, type: "expense" }, 42),
  ]);

  const status = evaluateCsvRowStatus(
    { date: "2026-08-07", description: "Supermarket", amount: -12.5, type: "expense" },
    [],
    42,
    new Date("2026-08-10T12:00:00Z"),
    seenHashes,
  );

  assert.equal(status.status, "duplicate");
});
