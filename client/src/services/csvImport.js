function parseCsvText(csvText = "") {
  const normalized = String(csvText ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (!normalized.trim()) {
    return [];
  }

  const delimiter = detectCsvDelimiter(normalized);
  const rows = [];
  let currentCell = "";
  let currentRow = [];
  let inQuotes = false;

  const pushCurrentCell = () => {
    currentRow.push(currentCell);
    currentCell = "";
  };

  for (let index = 0; index < normalized.length; index += 1) {
    const character = normalized[index];

    if (character === '"') {
      if (inQuotes && normalized[index + 1] === '"') {
        currentCell += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (character === delimiter && !inQuotes) {
      pushCurrentCell();
      continue;
    }

    if ((character === "\n" || character === "\r") && !inQuotes) {
      pushCurrentCell();
      if (currentRow.some((cell) => String(cell).trim() !== "")) {
        rows.push(currentRow);
      }
      currentRow = [];
      if (character === "\r" && normalized[index + 1] === "\n") {
        index += 1;
      }
      continue;
    }

    currentCell += character;
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    pushCurrentCell();
    if (currentRow.some((cell) => String(cell).trim() !== "")) {
      rows.push(currentRow);
    }
  }

  return rows.map((row) => row.map((cell) => String(cell).trim()));
}

function detectCsvDelimiter(rawText) {
  const sampleLines = String(rawText).split(/\n/).slice(0, 5).filter(Boolean);
  const candidates = [",", ";", "\t"];

  let bestDelimiter = ",";
  let bestScore = -1;

  for (const delimiter of candidates) {
    let score = 0;

    for (const line of sampleLines) {
      const occurrenceCount = (line.match(new RegExp(`\\${delimiter}`, "g")) || []).length;
      if (occurrenceCount > 0) {
        score += occurrenceCount;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestDelimiter = delimiter;
    }
  }

  return bestDelimiter;
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
  if (!Array.isArray(headerRow) || !Array.isArray(possibleNames) || !possibleNames.length) {
    return -1;
  }

  for (let index = 0; index < headerRow.length; index += 1) {
    const headerName = normalizeHeader(headerRow[index]);

    for (const possibleName of possibleNames) {
      const normalizedPossibleName = normalizeHeader(possibleName);
      if (
        headerName === normalizedPossibleName ||
        headerName.includes(normalizedPossibleName) ||
        normalizedPossibleName.includes(headerName)
      ) {
        return index;
      }
    }
  }

  return -1;
}

function getColumnValue(row, possibleNames, headerRow = []) {
  if (!Array.isArray(row)) {
    return "";
  }

  if (Array.isArray(headerRow) && headerRow.length) {
    const headerIndex = getHeaderIndex(headerRow, possibleNames);
    if (headerIndex >= 0 && headerIndex < row.length) {
      return row[headerIndex];
    }
  }

  if (!headerRow || !headerRow.length) {
    const lowerKeys = row.map((cell) => normalizeHeader(cell));
    for (const name of possibleNames) {
      const index = lowerKeys.findIndex((cell) => cell === normalizeHeader(name));
      if (index >= 0) {
        return row[index];
      }
    }
  }

  return "";
}

const COLUMN_KEYWORDS = {
  date: [
    "счетоводна дата",
    "accounting date",
    "date",
    "дата",
    "value date",
    "booking date",
    "transaction date",
    "вальор",
  ],
  description: [
    "основание",
    "description",
    "details",
    "narrative",
    "merchant",
    "payee",
    "counterparty",
    "описание",
    "детайли",
    "наредител",
    "получател",
  ],
  debit: [
    "дебит",
    "debit",
    "withdrawal",
    "outgoing",
    "разход",
    "изходяща сума",
  ],
  credit: [
    "кредит",
    "credit",
    "income",
    "incoming",
    "приход",
    "входяща сума",
  ],
  amount: [
    "сума",
    "amount",
    "transaction amount",
    "sum",
    "suma",
    "износ",
  ],
  type: [
    "type",
    "transaction type",
    "тип",
    "вид",
  ],
  category: [
    "category",
    "категория",
    "account",
    "сметка",
  ],
  externalReference: [
    "свързваща референция",
    "референция",
    "reference",
    "transaction reference",
    "transaction id",
    "authorization code",
  ],
};

function mapColumns(headerRow = []) {
  const normalized = headerRow.map((cell) => normalizeHeader(cell));
  const mapping = {};

  for (const [field, keywords] of Object.entries(COLUMN_KEYWORDS)) {
    for (let columnIndex = 0; columnIndex < normalized.length; columnIndex += 1) {
      const currentHeader = normalized[columnIndex];
      if (keywords.some((keyword) => currentHeader === keyword || currentHeader.includes(keyword) || keyword.includes(currentHeader))) {
        mapping[field] = columnIndex;
        break;
      }
    }
  }

  return mapping;
}

function findTransactionHeaderRow(rows = []) {
  const candidateKeywords = Object.values(COLUMN_KEYWORDS).flat();
  const limit = Math.min(rows.length, 15);

  for (let index = 0; index < limit; index += 1) {
    const row = rows[index] || [];
    const normalizedRow = row.map((cell) => normalizeHeader(cell));
    const matches = normalizedRow.filter((cell) => candidateKeywords.some((candidate) => cell === candidate || cell.includes(candidate) || candidate.includes(cell))).length;

    if (matches >= 2 && row.length >= 4) {
      return index;
    }
  }

  return 0;
}

function dateToIso(value) {
  if (!value) {
    return null;
  }

  const trimmed = String(value).trim();
  const normalized = trimmed.replace(/\s+/g, " ");

  const isoPatterns = [
    /^\d{4}-\d{2}-\d{2}$/,
    /^\d{4}\/\d{2}\/\d{2}$/,
    /^\d{2}\.\d{2}\.\d{4}$/,
    /^\d{2}\/\d{2}\/\d{4}$/,
    /^\d{2}-\d{2}-\d{4}$/,
    /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/,
  ];

  for (const pattern of isoPatterns) {
    if (pattern.test(normalized)) {
      const [firstPart, secondPart, thirdPart] = normalized.split(/[\-/.]/);
      const year = normalized.includes("-") && normalized.length >= 10 && normalized[4] === "-" ? firstPart : null;

      if (year) {
        return `${year}-${secondPart}-${thirdPart}`;
      }

      if (normalized.includes("/")) {
        const [day, month, yearPart] = normalized.split("/");
        return `${yearPart}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
      }

      if (normalized.includes(".")) {
        const [day, month, yearPart] = normalized.split(".");
        return `${yearPart}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
      }
    }
  }

  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseAmount(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  let cleaned = String(value).trim();
  cleaned = cleaned.replace(/[$€£\s]/g, "");
  cleaned = cleaned.replace(/\u00A0/g, "");
  cleaned = cleaned.replace(/[()]/g, (character) => (character === "(" ? "-" : ""));

  if (!cleaned || !/[\d,\.]/.test(cleaned)) {
    return null;
  }

  const hasComma = cleaned.includes(",");
  const hasDot = cleaned.includes(".");

  if (hasComma && hasDot) {
    const lastCommaIndex = cleaned.lastIndexOf(",");
    const lastDotIndex = cleaned.lastIndexOf(".");
    const decimalSeparator = lastCommaIndex > lastDotIndex ? "," : ".";
    const sanitized = decimalSeparator === ","
      ? cleaned.replace(/\./g, "").replace(",", ".")
      : cleaned.replace(/,/g, "");

    if (!/^[-+]?\d*\.?\d+$/.test(sanitized)) {
      return null;
    }
    const parsed = Number(sanitized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  if (hasComma) {
    const commaParts = cleaned.split(",");
    const lastPart = commaParts[commaParts.length - 1];
    const sanitized = lastPart.length <= 2
      ? cleaned.replace(/\./g, "").replace(",", ".")
      : cleaned.replace(/,/g, "");

    if (!/^[-+]?\d*\.?\d+$/.test(sanitized)) {
      return null;
    }

    const parsed = Number(sanitized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  if (hasDot) {
    const dotParts = cleaned.split(".");
    const lastPart = dotParts[dotParts.length - 1];
    const sanitized = lastPart.length <= 2
      ? cleaned.replace(/,/g, "")
      : cleaned.replace(/\./g, "");

    if (!/^[-+]?\d*\.?\d+$/.test(sanitized)) {
      return null;
    }

    const parsed = Number(sanitized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function inferTransactionType(rawType, amount, description = "") {
  const candidate = String(rawType ?? "").trim().toLowerCase();
  const text = `${candidate} ${description}`.toLowerCase();

  if (candidate.includes("income") || candidate.includes("приход") || candidate.includes("credit") || candidate.includes("кредит") || text.includes("salary") || text.includes("заплата")) {
    return "income";
  }

  if (candidate.includes("expense") || candidate.includes("разход") || candidate.includes("debit") || candidate.includes("дебит") || candidate.includes("withdraw") || candidate.includes("withdrawal") || candidate.includes("плащане") || candidate.includes("payment")) {
    return "expense";
  }

  if (Number(amount) < 0) {
    return "expense";
  }

  return "income";
}

function normalizeDescriptionForDedupe(value = "") {
  return String(value ?? "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function normalizeTypeForDedupe(value = "", amount = 0) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "income" || normalized === "expense") {
    return normalized;
  }

  return Number(amount) < 0 ? "expense" : "income";
}

function normalizeAmountForDedupe(value = 0) {
  const numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric)) {
    return "0.00";
  }

  return Math.abs(numeric).toFixed(2);
}

function formatLocalDateForMessage(value) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isoDateToLocalDate(value) {
  const parts = String(value || "").split("-");
  if (parts.length !== 3) {
    return null;
  }

  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }

  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function buildCsvRowDedupeKey(row, walletId = null) {
  const normalizedDate = dateToIso(row?.date ?? "") || "";
  const normalizedDescription = normalizeDescriptionForDedupe(row?.description ?? row?.title ?? "");
  const normalizedType = normalizeTypeForDedupe(row?.type ?? "", row?.amount ?? 0);
  const normalizedAmount = normalizeAmountForDedupe(row?.amount ?? 0);
  const normalizedWalletId = Number(walletId ?? row?.walletId ?? row?.wallet_id ?? 0);

  return `${normalizedWalletId}:${normalizedDate}:${normalizedType}:${normalizedAmount}:${normalizedDescription}`;
}

export function evaluateCsvRowStatus(row, existingTransactions = [], walletId = null, now = new Date(), currentSeenHashes = null) {
  const rawDate = row?.date ?? "";
  const rawDescription = row?.description ?? "";
  const rawAmount = row?.amount ?? 0;
  const rawType = row?.type ?? "";
  const rawCategory = row?.category ?? "Общи";

  const parsedDate = dateToIso(rawDate);
  const parsedAmount = Number(rawAmount);
  const normalizedDescription = String(rawDescription || "").replace(/\s+/g, " ").trim();

  const startDate = new Date(now);
  startDate.setHours(0, 0, 0, 0);
  startDate.setDate(startDate.getDate() - 6);

  const endDate = new Date(now);
  endDate.setHours(23, 59, 59, 999);

  const candidateDate = parsedDate ? isoDateToLocalDate(parsedDate) : null;
  const isWithinWindow = candidateDate && candidateDate >= startDate && candidateDate <= endDate;

  if (!parsedDate || !candidateDate || Number.isNaN(candidateDate.getTime())) {
    return { status: "invalid", issue: "Невалидна дата." };
  }

  if (!Number.isFinite(parsedAmount) || parsedAmount === 0) {
    return { status: "invalid", issue: "Невалидна сума." };
  }

  if (!normalizedDescription) {
    return { status: "invalid", issue: "Липсва описание." };
  }

  if (!isWithinWindow) {
    return {
      status: "outsideWindow",
      issue: `Извън период от последните 7 дни (${formatLocalDateForMessage(startDate)} до ${formatLocalDateForMessage(endDate)}).`,
    };
  }

  const seenHashes = new Set();
  for (const transaction of existingTransactions) {
    const normalizedDescription = normalizeDescriptionForDedupe(transaction?.description ?? transaction?.title ?? "");
    const normalizedDate = dateToIso(transaction?.date ?? transaction?.transactionDate ?? transaction?.transaction_date ?? "");
    const normalizedAmount = Number(transaction?.amount ?? 0);
    const existingWalletId = Number(transaction?.walletId ?? transaction?.wallet_id ?? 0);
    const normalizedType = normalizeTypeForDedupe(transaction?.type ?? "", normalizedAmount);

    if (normalizedDescription && normalizedDate && Number.isFinite(normalizedAmount) && existingWalletId > 0) {
      seenHashes.add(buildCsvRowDedupeKey({
        date: normalizedDate,
        description: normalizedDescription,
        amount: normalizedAmount,
        type: normalizedType,
      }, existingWalletId));
    }
  }

  const dedupeKey = buildCsvRowDedupeKey({
    date: parsedDate,
    description: normalizedDescription,
    amount: parsedAmount,
    type: rawType,
  }, Number(walletId));

  if (currentSeenHashes) {
    if (currentSeenHashes.has(dedupeKey)) {
      return { status: "duplicate", issue: "Вече съществува в този CSV импорт." };
    }
    currentSeenHashes.add(dedupeKey);
  }

  if (seenHashes.has(dedupeKey)) {
    return { status: "duplicate", issue: "Вече съществува." };
  }

  return { status: "valid", issue: "" };
}

export function buildCsvImportPreview(csvText, options = {}) {
  const { existingTransactions = [], walletId = null, now = new Date() } = options;
  const rows = parseCsvText(csvText);

  if (rows.length < 2) {
    return {
      rows: [],
      validRows: 0,
      duplicateRows: 0,
      invalidRows: 0,
      outsideWindowRows: 0,
      error: "CSV файлът е празен или няма заглавия.",
    };
  }

  const headerRowIndex = findTransactionHeaderRow(rows);
  const rawHeaderRow = rows[headerRowIndex] || rows[0];
  const mapping = mapColumns(rawHeaderRow);
  const normalizedRows = rows.slice(headerRowIndex + 1).map((row) => {
    if (row.length <= rawHeaderRow.length) {
      return [...row, ...Array(Math.max(rawHeaderRow.length - row.length, 0)).fill("")];
    }

    return [...row.slice(0, rawHeaderRow.length - 1), row.slice(rawHeaderRow.length - 1).join(",")];
  });

  const payloadRows = [];
  const currentSeenHashes = new Set();

  for (let index = 0; index < normalizedRows.length; index += 1) {
    const row = normalizedRows[index];

    const getField = (field, fallbackNames = []) => {
      const mappedIndex = mapping[field];
      if (mappedIndex !== undefined && row[mappedIndex] !== undefined && String(row[mappedIndex]).trim() !== "") {
        return row[mappedIndex];
      }
      const fallback = getColumnValue(row, fallbackNames, rawHeaderRow);
      return fallback || "";
    };

    const dateValue = getField("date", ["date", "datum", "transaction date", "posting date", "дата", "датум"]);
    const descriptionValue = getField("description", ["description", "details", "title", "reference", "merchant", "payee", "counterparty", "основание", "описание", "детайли", "наименование", "получател"]) || row[1] || "";
    const debitValue = getField("debit", ["debit", "outgoing", "expense", "разход", "debit amount", "дебит"]) || "";
    const creditValue = getField("credit", ["credit", "incoming", "income", "приход", "credit amount", "кредит"]) || "";
    let amountValue = getField("amount", ["amount", "sum", "suma", "balance", "transaction amount", "amount eur", "сума", "износ"]) || "";
    const typeValue = getField("type", ["type", "transaction type", "тип", "вид"]) || "";
    const categoryValue = getField("category", ["category", "категория", "account", "сметка"]) || "";

    const explicitDebitAmount = parseAmount(debitValue);
    const explicitCreditAmount = parseAmount(creditValue);
    let parsedAmount = parseAmount(amountValue);

    if (parsedAmount === null) {
      const numericFallback = row
        .map((cell) => String(cell).trim())
        .filter((cell) => cell !== "" && parseAmount(cell) !== null)
        .at(-1) || "";
      parsedAmount = parseAmount(numericFallback);
    }

    if (explicitDebitAmount !== null && explicitCreditAmount === null) {
      parsedAmount = -Math.abs(explicitDebitAmount);
    } else if (explicitCreditAmount !== null && explicitDebitAmount === null) {
      parsedAmount = Math.abs(explicitCreditAmount);
    } else if (parsedAmount !== null) {
      const rawAmountText = String(amountValue || debitValue || creditValue || "").trim();
      const normalizedDescriptionText = String(descriptionValue || "").toLowerCase();
      const hasExplicitNegativeSign = /^-/.test(rawAmountText) || /\(/.test(rawAmountText);
      const isExpenseContext = normalizedDescriptionText.includes("withdraw") || normalizedDescriptionText.includes("payment") || normalizedDescriptionText.includes("debit") || normalizedDescriptionText.includes("expense") || normalizedDescriptionText.includes("разход") || normalizedDescriptionText.includes("плащане");

      if (parsedAmount < 0 || hasExplicitNegativeSign || isExpenseContext) {
        parsedAmount = -Math.abs(parsedAmount);
      } else {
        parsedAmount = Math.abs(parsedAmount);
      }
    }

    const inferredType = inferTransactionType(typeValue, parsedAmount, String(descriptionValue || ""));
    const parsedDate = dateToIso(dateValue);
    const normalizedDescription = String(descriptionValue || "").replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const externalReferenceValue = getField("externalReference", ["свързваща референция", "референция", "reference", "transaction reference", "transaction id", "authorization code"]) || "";

    const candidate = {
      id: `${index + 1}-${Date.now()}`,
      date: parsedDate || "",
      description: normalizedDescription,
      amount: parsedAmount !== null ? Number(parsedAmount.toFixed(2)) : 0,
      type: inferredType,
      category: "",
      externalReference: String(externalReferenceValue || "").trim(),
    };

    const { status, issue } = evaluateCsvRowStatus(candidate, existingTransactions, walletId, now, currentSeenHashes);

    payloadRows.push({
      ...candidate,
      status,
      issue,
      rawRow: row,
      header: rawHeaderRow,
    });
  }

  const validRows = payloadRows.filter((row) => row.status === "valid");
  const duplicateRows = payloadRows.filter((row) => row.status === "duplicate");
  const invalidRows = payloadRows.filter((row) => row.status === "invalid");
  const outsideWindowRows = payloadRows.filter((row) => row.status === "outsideWindow");
  const windowStart = new Date(now);
  windowStart.setHours(0, 0, 0, 0);
  windowStart.setDate(windowStart.getDate() - 6);
  const windowEnd = new Date(now);
  windowEnd.setHours(0, 0, 0, 0);

  return {
    rows: payloadRows,
    validRows: validRows.length,
    duplicateRows: duplicateRows.length,
    invalidRows: invalidRows.length,
    outsideWindowRows: outsideWindowRows.length,
    startDate: formatLocalDateForMessage(windowStart),
    endDate: formatLocalDateForMessage(windowEnd),
    error: payloadRows.some((row) => row.status === "outsideWindow") ? "Някои редове са извън допустимия 7-дневен период." : "",
  };
}

export function formatCsvImportSummary(preview) {
  if (!preview || !Array.isArray(preview.rows)) {
    return "Няма данни за импортиране.";
  }

  return `Валидни: ${preview.validRows} • Дублирани: ${preview.duplicateRows} • Невалидни: ${preview.invalidRows} • Извън период: ${preview.outsideWindowRows}`;
}
