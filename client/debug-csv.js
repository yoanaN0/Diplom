function parseCsvText(csvText = "") {
  const normalized = String(csvText ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (!normalized.trim()) return [];
  const delimiter = ",";
  const rows = [];
  let currentCell = "";
  let currentRow = [];
  let inQuotes = false;
  const pushCurrentCell = () => { currentRow.push(currentCell); currentCell = ""; };
  for (let index = 0; index < normalized.length; index += 1) {
    const character = normalized[index];
    if (character === '"') {
      if (inQuotes && normalized[index + 1] === '"') { currentCell += '"'; index += 1; }
      else { inQuotes = !inQuotes; }
      continue;
    }
    if (character === delimiter && !inQuotes) { pushCurrentCell(); continue; }
    if ((character === "\n" || character === "\r") && !inQuotes) {
      pushCurrentCell();
      if (currentRow.some((cell) => String(cell).trim() !== "")) rows.push(currentRow);
      currentRow = [];
      if (character === "\r" && normalized[index + 1] === "\n") index += 1;
      continue;
    }
    currentCell += character;
  }
  if (currentCell.length > 0 || currentRow.length > 0) { pushCurrentCell(); if (currentRow.some((cell) => String(cell).trim() !== "")) rows.push(currentRow); }
  return rows.map((row) => row.map((cell) => String(cell).trim()));
}

function normalizeHeader(value = "") {
  return String(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}
function getHeaderIndex(headerRow = [], possibleNames = []) {
  if (!Array.isArray(headerRow) || !Array.isArray(possibleNames) || !possibleNames.length) return -1;
  for (let index = 0; index < headerRow.length; index += 1) {
    const headerName = normalizeHeader(headerRow[index]);
    for (const possibleName of possibleNames) {
      const normalizedPossibleName = normalizeHeader(possibleName);
      if (headerName === normalizedPossibleName || headerName.includes(normalizedPossibleName) || normalizedPossibleName.includes(headerName)) return index;
    }
  }
  return -1;
}
function getColumnValue(row, possibleNames, headerRow = []) {
  if (!Array.isArray(row)) return "";
  if (Array.isArray(headerRow) && headerRow.length) {
    const headerIndex = getHeaderIndex(headerRow, possibleNames);
    if (headerIndex >= 0 && headerIndex < row.length) return row[headerIndex];
  }
  if (!headerRow || !headerRow.length) {
    const lowerKeys = row.map((cell) => normalizeHeader(cell));
    for (const name of possibleNames) {
      const index = lowerKeys.findIndex((cell) => cell === normalizeHeader(name));
      if (index >= 0) return row[index];
    }
  }
  return "";
}
function parseAmount(value) {
  if (value === null || value === undefined || value === "") return null;
  let cleaned = String(value).trim();
  cleaned = cleaned.replace(/[$€£\s]/g, "");
  cleaned = cleaned.replace(/\u00A0/g, "");
  cleaned = cleaned.replace(/[()]/g, (character) => (character === "(" ? "-" : ""));
  if (!cleaned || !/[\d,\.]/.test(cleaned)) return null;
  const hasComma = cleaned.includes(",");
  const hasDot = cleaned.includes(".");
  if (hasComma && hasDot) {
    const lastCommaIndex = cleaned.lastIndexOf(",");
    const lastDotIndex = cleaned.lastIndexOf(".");
    const decimalSeparator = lastCommaIndex > lastDotIndex ? "," : ".";
    const sanitized = decimalSeparator === ","
      ? cleaned.replace(/\./g, "").replace(",", ".")
      : cleaned.replace(/,/g, "");
    if (!/^[-+]?\d*\.?\d+$/.test(sanitized)) return null;
    const parsed = Number(sanitized);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (hasComma) {
    const commaParts = cleaned.split(",");
    const lastPart = commaParts[commaParts.length - 1];
    const sanitized = lastPart.length <= 2 ? cleaned.replace(/\./g, "").replace(",", ".") : cleaned.replace(/,/g, "");
    if (!/^[-+]?\d*\.?\d+$/.test(sanitized)) return null;
    const parsed = Number(sanitized);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (hasDot) {
    const dotParts = cleaned.split(".");
    const lastPart = dotParts[dotParts.length - 1];
    const sanitized = lastPart.length <= 2 ? cleaned.replace(/,/g, "") : cleaned.replace(/\./g, "");
    if (!/^[-+]?\d*\.?\d+$/.test(sanitized)) return null;
    const parsed = Number(sanitized);
    return Number.isFinite(parsed) ? parsed : null;
  }
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

const csv = 'Date,Description,Amount\n2026-08-07,Groceries,-1,234.56\n2026-08-08,Salary,2,345.67';
const rows = parseCsvText(csv);
console.log(JSON.stringify(rows, null, 2));
const header = rows[0];
for (const row of rows.slice(1)) {
  const amountValue = getColumnValue(row, ['amount','sum','suma','balance','transaction amount','amount eur','сума','износ'], header) || '';
  const creditValue = getColumnValue(row, ['credit','incoming','income','приход','credit amount','кредит'], header) || '';
  const debitValue = getColumnValue(row, ['debit','outgoing','expense','разход','debit amount','дебит'], header) || '';
  const explicitCreditAmount = parseAmount(creditValue);
  const explicitDebitAmount = parseAmount(debitValue);
  let parsedAmount = parseAmount(amountValue);
  let inferredType = 'expense';
  if (explicitDebitAmount !== null) {
    parsedAmount = -Math.abs(explicitDebitAmount);
    inferredType = 'expense';
  } else if (explicitCreditAmount !== null) {
    parsedAmount = Math.abs(explicitCreditAmount);
    inferredType = 'income';
  } else if (parsedAmount !== null) {
    if (parsedAmount < 0) {
      inferredType = 'expense';
    } else if (String('Salary').toLowerCase().includes('withdraw') || String('Salary').toLowerCase().includes('payment')) {
      parsedAmount = -Math.abs(parsedAmount);
      inferredType = 'expense';
    } else {
      parsedAmount = Math.abs(parsedAmount);
      inferredType = 'income';
    }
  }
  console.log({ row, amountValue, parsedAmount, inferredType, creditValue, debitValue });
}
