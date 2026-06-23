import snaptextSchema from "./snaptext/schema.json";

export type OcrValueType = "number" | "string" | "boolean" | "object" | "unknown";
export type OcrScalarValue = string | number | boolean | null;

export interface OcrItem {
  id: string;
  field: string;
  label: string;
  value: string;
  rawValue: OcrScalarValue;
  valueType: OcrValueType;
  correctedValue?: string;
}

export interface TxtItem {
  field: string;
  label: string;
  value: string;
  rawValue: OcrScalarValue;
  valueType: OcrValueType;
}

export interface ScoringDetail {
  id: string;
  field: string;
  label: string;
  expected: string;
  actual: string;
  match: boolean;
  similarity: number;
  valueType: OcrValueType;
}

export interface ScoringResult {
  score: number;
  totalFields: number;
  matchedFields: number;
  details: ScoringDetail[];
}

interface SchemaField {
  field: string;
  label: string;
  valueType: OcrValueType;
}

const FIELD_ALIASES: Record<string, string> = {
  amount: "amount",
  total: "amount",
  total_amount: "amount",
  grand_total: "amount",
  total_invoice: "amount",
  total_tagihan: "amount",
  nilai_tagihan: "amount",
  nilai_kuitansi: "amount",
  biaya_total: "amount",
  provider: "provider_name",
  provider_name: "provider_name",
  hospital: "provider_name",
  hospital_name: "provider_name",
  nama_provider: "provider_name",
  nama_rs: "provider_name",
  nama_rumah_sakit: "provider_name",
  member: "member_name",
  member_name: "member_name",
  patient_name: "member_name",
  nama_pasien: "member_name",
  nama_anggota: "member_name",
  invoice: "invoice_number",
  invoice_no: "invoice_number",
  invoice_number: "invoice_number",
  billing_no: "invoice_number",
  no_invoice: "invoice_number",
  no_tagihan: "invoice_number",
  no_kuitansi: "invoice_number",
  hospital_invoice_no: "invoice_number",
  
  // NIK & Member ID -> patient_identifier
  member_id: "patient_identifier",
  nik: "patient_identifier",
  
  // Policy / Card -> insurance_number
  policy_number: "insurance_number",
  card_no: "insurance_number",
  
  // Claim Type -> encounter_type
  claim_type: "encounter_type",
  
  // Amount Incurred -> amount
  amt_incurred: "amount",

  page_number: "document_metadata.page_number",
  document_metadata_page_number: "document_metadata.page_number",
  total_pages: "document_metadata.total_pages",
  totalpages: "document_metadata.total_pages",
  document_metadata_total_pages: "document_metadata.total_pages",
  pageNumber: "document_metadata.page_number",
  pagenumber: "document_metadata.page_number",
  readability_score: "document_metadata.readability_score",
  document_metadata_readability_score: "document_metadata.readability_score",
  data_usability_score: "document_metadata.data_usability_score",
  document_metadata_data_usability_score: "document_metadata.data_usability_score",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getRecordValue(record: Record<string, unknown>, key: string): Record<string, unknown> | null {
  const value = record[key];
  return isRecord(value) ? value : null;
}

function getSchemaFields(): SchemaField[] {
  if (!isRecord(snaptextSchema)) return [];

  const properties = getRecordValue(snaptextSchema, "properties");
  if (!properties) return [];

  const fields: SchemaField[] = [];

  for (const [key, value] of Object.entries(properties)) {
    if (!isRecord(value)) continue;

    const type = typeof value.type === "string" ? toValueType(value.type) : "unknown";

    if (type === "object") {
      const nestedProperties = getRecordValue(value, "properties");
      if (!nestedProperties) continue;

      for (const [nestedKey, nestedValue] of Object.entries(nestedProperties)) {
        const nestedType = isRecord(nestedValue) && typeof nestedValue.type === "string" ? toValueType(nestedValue.type) : "unknown";
        fields.push({
          field: `${key}.${nestedKey}`,
          label: toLabel(`${key}.${nestedKey}`),
          valueType: nestedType,
        });
      }
      continue;
    }

    fields.push({
      field: key,
      label: toLabel(key),
      valueType: type,
    });
  }

  return fields;
}

const SCHEMA_FIELDS = getSchemaFields();
const SCHEMA_FIELD_MAP = new Map(SCHEMA_FIELDS.map((field) => [field.field, field]));

function toValueType(type: string): OcrValueType {
  if (type === "number" || type === "integer") return "number";
  if (type === "string") return "string";
  if (type === "boolean") return "boolean";
  if (type === "object") return "object";
  return "unknown";
}

function toLabel(field: string): string {
  return field
    .replace(/^document_metadata\./, "metadata.")
    .split(/[._]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function normalizeFieldName(field: string): string {
  const dotted = field.trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_.-]/g, "_");
  if (SCHEMA_FIELD_MAP.has(dotted)) return dotted;

  const compact = dotted.replace(/[.-]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
  return FIELD_ALIASES[compact] ?? compact;
}

function isKnownSchemaField(field: string): boolean {
  return SCHEMA_FIELD_MAP.has(field);
}

function getSchemaField(field: string): SchemaField {
  return SCHEMA_FIELD_MAP.get(field) ?? {
    field,
    label: toLabel(field),
    valueType: "unknown",
  };
}

function stringifyScalar(value: OcrScalarValue): string {
  if (value === null) return "";
  return String(value).trim();
}

function toScalarValue(value: unknown): OcrScalarValue {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (value === undefined) return null;

  return JSON.stringify(value);
}

function parseNumberValue(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  let cleaned = trimmed
    .replace(/rp\.?/gi, "")
    .replace(/idr/gi, "")
    .replace(/[^0-9,.-]/g, "")
    .trim();

  if (!cleaned) return null;

  const lastDot = cleaned.lastIndexOf(".");
  const lastComma = cleaned.lastIndexOf(",");

  if (lastDot > lastComma) {
    cleaned = cleaned.replace(/,/g, "");
    const parts = cleaned.split(".");
    if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3)) {
      cleaned = cleaned.replace(/\./g, "");
    }
  } else if (lastComma > lastDot) {
    cleaned = cleaned.replace(/\./g, "");
    const parts = cleaned.split(",");
    if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3)) {
      cleaned = cleaned.replace(/,/g, "");
    } else {
      cleaned = cleaned.replace(",", ".");
    }
  }

  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeValueForComparison(field: string, value: string, valueType: OcrValueType): string {
  if (valueType === "number" || field === "amount" || field.endsWith("_score") || field.endsWith("page_number") || field.endsWith("total_pages")) {
    const parsed = parseNumberValue(value);
    return parsed === null ? "" : String(parsed);
  }

  return value
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshteinDistance(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const previousRow = Array.from({ length: a.length + 1 }, (_, index) => index);
  let currentRow = previousRow.slice();

  for (let rowIndex = 1; rowIndex <= b.length; rowIndex += 1) {
    currentRow = [rowIndex];

    for (let columnIndex = 1; columnIndex <= a.length; columnIndex += 1) {
      const substitutionCost = a[columnIndex - 1] === b[rowIndex - 1] ? 0 : 1;
      currentRow[columnIndex] = Math.min(
        currentRow[columnIndex - 1] + 1,
        previousRow[columnIndex] + 1,
        previousRow[columnIndex - 1] + substitutionCost,
      );
    }

    for (let index = 0; index < currentRow.length; index += 1) {
      previousRow[index] = currentRow[index] ?? 0;
    }
  }

  return previousRow[a.length] ?? 0;
}

function calculateSimilarity(expected: string, actual: string, field: string, valueType: OcrValueType): number {
  const normalizedExpected = normalizeValueForComparison(field, expected, valueType);
  const normalizedActual = normalizeValueForComparison(field, actual, valueType);

  if (!normalizedExpected && !normalizedActual) return 1;
  if (!normalizedExpected || !normalizedActual) return 0;
  if (normalizedExpected === normalizedActual) return 1;

  if (valueType === "number") return 0;

  const distance = levenshteinDistance(normalizedExpected, normalizedActual);
  return Math.max(0, 1 - distance / Math.max(normalizedExpected.length, normalizedActual.length));
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(text);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function stripMarkdownJsonFence(text: string): string {
  return text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
}

function parsePossibleJsonString(text: string): Record<string, unknown> | null {
  const direct = parseJsonObject(stripMarkdownJsonFence(text));
  if (direct) return direct;

  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return parseJsonObject(text.slice(firstBrace, lastBrace + 1));
  }

  return null;
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let inQuotes = false;
  let token = "";

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const nextChar = line[index + 1];

    if (char === '"' && nextChar === '"' && inQuotes) {
      token += '"';
      index += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      result.push(token.trim());
      token = "";
    } else {
      token += char;
    }
  }

  result.push(token.trim());
  return result;
}

function setCanonicalValue(target: Map<string, OcrScalarValue>, rawField: string, rawValue: unknown): void {
  const field = normalizeFieldName(rawField);
  if (!isKnownSchemaField(field)) return;

  target.set(field, toScalarValue(rawValue));
}

function collectFromObject(value: Record<string, unknown>, target: Map<string, OcrScalarValue>, prefix = ""): void {
  for (const [key, nestedValue] of Object.entries(value)) {
    const field = prefix ? `${prefix}.${key}` : key;

    if (isRecord(nestedValue)) {
      setCanonicalValue(target, field, nestedValue);
      collectFromObject(nestedValue, target, field);
      continue;
    }

    setCanonicalValue(target, field, nestedValue);
  }
}

function collectKeyValueLines(text: string, target: Map<string, OcrScalarValue>): void {
  const lines = text.split(/\r?\n/g).map((line) => line.trim()).filter(Boolean);

  for (const line of lines) {
    const separatorMatch = line.match(/^([^:=\t|]+)\s*[:=\t|]\s*(.+)$/);
    if (!separatorMatch) continue;

    const key = separatorMatch[1];
    const value = separatorMatch[2];
    if (!key || value === undefined) continue;

    setCanonicalValue(target, key, value);
  }
}

function collectCsvRows(text: string, target: Map<string, OcrScalarValue>): void {
  const rows = text
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter(Boolean)
    .map(parseCsvLine);

  if (rows.length === 0) return;

  const header = rows[0] ?? [];
  const normalizedHeader = header.map(normalizeFieldName);
  const knownHeaderIndexes = normalizedHeader
    .map((field, index) => ({ field, index }))
    .filter(({ field }) => isKnownSchemaField(field));

  if (knownHeaderIndexes.length > 0) {
    const dataRow = rows[1] ?? [];
    for (const { field, index } of knownHeaderIndexes) {
      const value = dataRow[index];
      if (value !== undefined) target.set(field, value);
    }
    return;
  }

  for (const row of rows) {
    if (row.length < 2) continue;
    setCanonicalValue(target, row[0] ?? "", row[1] ?? "");
  }
}

function parseOcrUploadCsvLine(text: string, target: Map<string, OcrScalarValue>): boolean {
  const line = text.trim();
  if (!line) return false;

  const rows = line.split(/\r?\n/g).filter(Boolean);
  
  // The user's CSV might have multiple lines if they upload a batch, but typically 1 ground truth per TXT
  // Or it could be 1 line of headers and 1 line of data. Let's find the data row.
  let dataRow: string[] = [];
  
  for (const r of rows) {
    const cols = parseCsvLine(r);
    // 33 columns based on the cheatsheet
    if (cols.length >= 32 && cols.length <= 34) {
      // If it looks like a header row (e.g. starts with "Payor ID"), skip it
      if (cols[0]?.toLowerCase().includes("payor")) continue;
      dataRow = cols;
      break;
    }
  }

  if (dataRow.length === 0) return false;

  const mockObject: Record<string, unknown> = {};

  // Indices based on the 33 column cheatsheet:
  // 2: Policy Number
  // 3: Member ID
  // 7: Member Name
  // 9: Claim Type
  // 12: Admission Date
  // 13: Discharge Date
  // 18: Diagnosis Code
  // 19: Secondary Diagnosis Code List
  // 20: Amt Incurred
  // 29: Hospital Invoice No

  mockObject["insurance_number"] = dataRow[2] !== "NULL" ? dataRow[2] : "";
  mockObject["patient_identifier"] = dataRow[3] !== "NULL" ? dataRow[3] : "";
  mockObject["member_name"] = dataRow[7] !== "NULL" ? dataRow[7] : "";
  mockObject["encounter_type"] = dataRow[9] !== "NULL" ? dataRow[9] : "";

  const adm = dataRow[12];
  if (adm && adm.length === 8 && adm !== "NULL") {
    mockObject["admission_date"] = `${adm.substring(4, 8)}-${adm.substring(2, 4)}-${adm.substring(0, 2)}`;
  } else if (adm !== "NULL") {
    mockObject["admission_date"] = adm;
  }

  const dis = dataRow[13];
  if (dis && dis.length === 8 && dis !== "NULL") {
    mockObject["discharge_date"] = `${dis.substring(4, 8)}-${dis.substring(2, 4)}-${dis.substring(0, 2)}`;
  } else if (dis !== "NULL") {
    mockObject["discharge_date"] = dis;
  }

  // Column 21 is Amt Approved. Previously 20 (Amt Incurred).
  const amtStr = dataRow[21] !== "NULL" ? dataRow[21] : "";
  mockObject["amount"] = amtStr.replace(/\.00$/, "");
  mockObject["invoice_number"] = dataRow[29] !== "NULL" ? dataRow[29] : "";

  const diagnoses: any[] = [];
  const primaryCode = dataRow[18];
  if (primaryCode && primaryCode !== "NULL") {
    diagnoses.push({
      code: primaryCode,
      type: "PRIMARY",
      sequence: 1
    });
  }

  const secondaryList = dataRow[19];
  if (secondaryList && secondaryList !== "NULL") {
    const codes = secondaryList.split("!");
    codes.forEach((code) => {
      const trimmed = code.trim();
      if (trimmed && trimmed !== "NULL") {
        diagnoses.push({
          code: trimmed,
          type: "SECONDARY",
          sequence: diagnoses.length + 1
        });
      }
    });
  }

  if (diagnoses.length > 0) {
    mockObject["diagnoses"] = diagnoses;
  }

  collectFromObject(mockObject, target);
  return true;
}

function itemsFromMap<T extends OcrItem | TxtItem>(values: Map<string, OcrScalarValue>, kind: "ocr" | "txt"): T[] {
  return Array.from(values.entries()).map(([field, rawValue]) => {
    const schemaField = getSchemaField(field);
    const value = stringifyScalar(rawValue);
    const item = {
      id: `${kind}-${field.replace(/[^a-z0-9]+/gi, "-")}`,
      field,
      label: schemaField.label,
      value,
      rawValue,
      valueType: schemaField.valueType,
    };

    return item as T;
  });
}

function hasKnownFields(record: Record<string, unknown>): boolean {
  const values = new Map<string, OcrScalarValue>();
  collectFromObject(record, values);
  return values.size > 0;
}

function mergeRecordValue(target: Record<string, unknown>, key: string, value: unknown): void {
  const current = target[key];

  if (Array.isArray(current) && Array.isArray(value)) {
    target[key] = [...current, ...value];
    return;
  }

  if (isRecord(current) && isRecord(value)) {
    target[key] = { ...current, ...value };
    return;
  }

  target[key] = value;
}

function extractSnaptextPagesData(record: Record<string, unknown>): Record<string, unknown> | null {
  const pages = record.pages;
  if (!Array.isArray(pages)) return null;

  const merged: Record<string, unknown> = {};
  const totalPages = typeof record.totalPages === "number" ? record.totalPages : undefined;

  if (totalPages !== undefined) {
    merged.document_metadata = { total_pages: totalPages };
  }

  for (const page of pages) {
    if (!isRecord(page)) continue;

    const pageNumber = typeof page.pageNumber === "number" ? page.pageNumber : undefined;
    const data = page.data;
    if (!isRecord(data)) continue;

    for (const [key, value] of Object.entries(data)) {
      mergeRecordValue(merged, key, value);
    }

    if (pageNumber !== undefined && !isRecord(merged.document_metadata)) {
      merged.document_metadata = { page_number: pageNumber };
    } else if (pageNumber !== undefined && isRecord(merged.document_metadata) && merged.document_metadata.page_number === undefined) {
      merged.document_metadata.page_number = pageNumber;
    }
  }

  return Object.keys(merged).length > 0 ? merged : null;
}

function extractSnaptextPayload(value: unknown): Record<string, unknown> | string | null {
  if (typeof value === "string") {
    return parsePossibleJsonString(value) ?? value;
  }

  if (!isRecord(value)) return null;
  if (hasKnownFields(value)) return value;

  const pageData = extractSnaptextPagesData(value);
  if (pageData && hasKnownFields(pageData)) return pageData;

  const candidateKeys = [
    "result",
    "data",
    "output",
    "json",
    "response",
    "structuredData",
    "extractedData",
    "fields",
    "document",
    "payload",
  ];

  for (const key of candidateKeys) {
    const nested = value[key];
    if (typeof nested === "string") {
      const parsed = parsePossibleJsonString(nested);
      if (parsed && hasKnownFields(parsed)) return parsed;
    }

    if (isRecord(nested)) {
      const extracted = extractSnaptextPayload(nested);
      if (extracted) return extracted;
    }
  }

  const choices = value.choices;
  if (Array.isArray(choices)) {
    for (const choice of choices) {
      if (!isRecord(choice)) continue;
      const message = getRecordValue(choice, "message");
      const content = typeof message?.content === "string" ? message.content : null;
      if (!content) continue;

      const parsed = parsePossibleJsonString(content);
      if (parsed && hasKnownFields(parsed)) return parsed;
    }
  }

  return value;
}

export function parseTxtGroundTruth(txtContent: string): TxtItem[] {
  const values = new Map<string, OcrScalarValue>();
  const jsonObject = parsePossibleJsonString(txtContent);

  if (jsonObject) {
    collectFromObject(jsonObject, values);
  } else {
    const handled = parseOcrUploadCsvLine(txtContent, values);
    if (!handled) {
      collectKeyValueLines(txtContent, values);
      collectCsvRows(txtContent, values);
    }
  }

  return itemsFromMap<TxtItem>(values, "txt");
}

export function parseOcrResult(ocrRawResult: unknown): OcrItem[] {
  const values = new Map<string, OcrScalarValue>();
  const payload = extractSnaptextPayload(ocrRawResult);

  if (typeof payload === "string") {
    collectKeyValueLines(payload, values);
    collectCsvRows(payload, values);
  } else if (isRecord(payload)) {
    collectFromObject(payload, values);
  }

  return itemsFromMap<OcrItem>(values, "ocr");
}

export function scoreOcrAgainstTxt(ocrItems: OcrItem[], txtItems: TxtItem[]): ScoringResult {
  const SCORED_FIELDS = ["member_name", "amount", "invoice_number", "admission_date", "discharge_date"];
  const ocrByField = new Map(ocrItems.map((item) => [item.field, item]));
  let matchedFields = 0;

  const details = txtItems
    .filter((txtItem) => SCORED_FIELDS.includes(txtItem.field))
    .map((txtItem) => {
      const ocrItem = ocrByField.get(txtItem.field);
      const actual = ocrItem?.correctedValue ?? ocrItem?.value ?? "";
      const similarity = calculateSimilarity(txtItem.value, actual, txtItem.field, txtItem.valueType);
      const match = similarity === 1;

      if (match) matchedFields += 1;

      return {
        id: txtItem.field,
        field: txtItem.field,
        label: txtItem.label,
        expected: txtItem.value,
        actual,
        match,
        similarity,
        valueType: txtItem.valueType,
      } satisfies ScoringDetail;
    });

  const totalFields = details.length;
  const score = totalFields === 0 ? 0 : Number(((matchedFields / totalFields) * 100).toFixed(2));

  return {
    score,
    totalFields,
    matchedFields,
    details,
  };
}

export function applyCorrectionsAndRescore(
  ocrItems: OcrItem[],
  corrections: Record<string, string>,
  txtItems: TxtItem[],
): { updatedItems: OcrItem[]; scoring: ScoringResult } {
  const existingFields = new Set(ocrItems.map((item) => item.field));
  const updatedItems = ocrItems.map((item) => {
    const correction = corrections[item.field] ?? corrections[item.id];
    if (correction === undefined) return item;

    return {
      ...item,
      correctedValue: correction,
    };
  });

  for (const [fieldOrId, value] of Object.entries(corrections)) {
    const field = normalizeFieldName(fieldOrId);
    if (!isKnownSchemaField(field) || existingFields.has(field)) continue;

    const schemaField = getSchemaField(field);
    updatedItems.push({
      id: `ocr-${field.replace(/[^a-z0-9]+/gi, "-")}`,
      field,
      label: schemaField.label,
      value: "",
      rawValue: null,
      valueType: schemaField.valueType,
      correctedValue: value,
    });
  }

  return {
    updatedItems,
    scoring: scoreOcrAgainstTxt(updatedItems, txtItems),
  };
}
