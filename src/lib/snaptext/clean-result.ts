type JsonValue = unknown;

interface CleanDiagnosis {
  code?: string;
  name: string;
  type: "PRIMARY" | "SECONDARY" | "COMPLICATION";
  sequence: number;
}

interface CleanLineItem {
  item_type: "PROCEDURE" | "MEDICATION" | "MEDICAL_SUPPLY";
  name: string;
  total_price: number;
  code?: string;
  category?: string;
  generic_name?: string;
  dosage?: string;
  quantity?: number;
  unit_price?: number;
  frequency?: string;
  duration?: string;
  service_date?: string;
}

const ROOT_KEYS = new Set([
  "amount",
  "provider_name",
  "member_name",
  "invoice_number",
  "patient_identifier",
  "insurance_number",
  "patient_birth_date",
  "patient_gender",
  "encounter_type",
  "admission_date",
  "discharge_date",
  "diagnoses",
  "line_items",
  "document_metadata",
]);

const LINE_ITEM_KEYS = new Set([
  "item_type",
  "code",
  "name",
  "category",
  "generic_name",
  "dosage",
  "quantity",
  "unit_price",
  "total_price",
  "frequency",
  "duration",
  "service_date",
]);

const DIAGNOSIS_HEADING_NAMES = new Set([
  "diagnosis",
  "diagnoses",
  "primary diagnosis",
  "secondary diagnosis",
  "diagnosa utama",
  "diagnosa sekunder",
  "drugs",
  "drug",
  "medication",
  "medications",
  "emergency",
  "laboratory",
  "radiology",
  "diagnostic",
]);

const NON_DIAGNOSIS_PATTERNS = [
  /\b(crp|uric acid|electrolyte|nat|kal|chlo|creatinine|ureum|glucose|sgpt|sgot|d-?dimer|cbc|full blood count)\b/i,
  /\b(mri|mra|ecg|electrocardiogram|echocardiogram|doppler|radiology|laboratory|diagnostic)\b/i,
  /\b(syringe|needle|nacl|asering|otsu|brainact|interco|xarelto|plavix|trajenta|crestor|lipitor|brilinta|esoferr|farmasal)\b/i,
  /\b(consultation|visit|bed rental|food and beverage|o2 per day|therapy|procedure|ward|pharmacy)\b/i,
  /\b(panin|life|asuransi|insurance|hospital|siloam|mrccc)\b/i,
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isJsonValue(value: unknown): value is JsonValue {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return true;
  if (Array.isArray(value)) return value.every(isJsonValue);
  if (!isRecord(value)) return false;
  return Object.values(value).every(isJsonValue);
}

function asCleanString(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  const normalized = trimmed.toLowerCase();
  if (["-", "null", "undefined", "n/a", "na", "{}", "[]", ", ,"].includes(normalized)) return null;
  if (trimmed.startsWith("{\"op\"") || trimmed.includes("BROKEN TOON") || trimmed.includes("To proceed, I will")) return null;

  return trimmed;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const text = asCleanString(value);
  if (!text) return null;

  const cleaned = text
    .replace(/rp\.?/gi, "")
    .replace(/idr/gi, "")
    .replace(/[^0-9,.-]/g, "")
    .trim();

  if (!cleaned) return null;

  const hasComma = cleaned.includes(",");
  const hasDot = cleaned.includes(".");
  let normalized = cleaned;

  if (hasComma && hasDot) {
    normalized = cleaned.replace(/\./g, "").replace(",", ".");
  } else if (hasComma) {
    normalized = cleaned.replace(",", ".");
  } else if (hasDot) {
    const fractionalPart = cleaned.split(".").at(-1) ?? "";
    normalized = fractionalPart.length === 3 ? cleaned.replace(/\./g, "") : cleaned;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function normalizeDiagnosisType(value: unknown, index: number): CleanDiagnosis["type"] {
  const normalized = asCleanString(value)?.toUpperCase() ?? "";
  if (normalized === "SECONDARY" || normalized === "SEKUNDER") return "SECONDARY";
  if (normalized === "COMPLICATION" || normalized === "KOMPLIKASI") return "COMPLICATION";
  return index === 0 ? "PRIMARY" : "SECONDARY";
}

function getValidIcdCode(value: unknown): string | null {
  const text = asCleanString(value)?.toUpperCase() ?? null;
  if (!text) return null;
  return /^[A-TV-Z]\d{2}(?:\.\d+)?$/.test(text) ? text : null;
}

function normalizeDiagnosisName(value: unknown): string | null {
  const text = asCleanString(value);
  if (!text) return null;

  const cleaned = text
    .replace(/^(primary|secondary)\s+diagnosis\s*:?\s*/i, "")
    .replace(/^diagnosis\s*:?\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) return null;
  const key = cleaned.toLowerCase().replace(/[.:]+$/g, "").trim();
  if (DIAGNOSIS_HEADING_NAMES.has(key)) return null;
  if (NON_DIAGNOSIS_PATTERNS.some((pattern) => pattern.test(cleaned))) return null;

  return cleaned;
}

function getDiagnosisDedupeKey(diagnosis: CleanDiagnosis): string {
  if (diagnosis.code) return `code:${diagnosis.code}`;
  return `name:${diagnosis.name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()}`;
}

function isDiagnosisBetter(candidate: CleanDiagnosis, current: CleanDiagnosis): boolean {
  if (candidate.code && !current.code) return true;
  if (!candidate.code && current.code) return false;
  if (candidate.name.length !== current.name.length) return candidate.name.length > current.name.length;
  return candidate.sequence < current.sequence;
}

function sanitizeDiagnoses(value: unknown): CleanDiagnosis[] | undefined {
  if (!Array.isArray(value)) return undefined;

  const rawDiagnoses = value
    .map((item, index): CleanDiagnosis | null => {
      if (!isRecord(item)) return null;

      const code = getValidIcdCode(item.code);
      const name = normalizeDiagnosisName(item.name) ?? (code ? code : null);
      if (!name) return null;

      return {
        ...(code ? { code } : {}),
        name,
        type: normalizeDiagnosisType(item.type, index),
        sequence: asNumber(item.sequence) ?? index + 1,
      };
    })
    .filter((item): item is CleanDiagnosis => item !== null);

  const hasCodedPrimary = rawDiagnoses.some((diagnosis) => diagnosis.type === "PRIMARY" && diagnosis.code);
  const hasCodedHypertension = rawDiagnoses.some((diagnosis) => diagnosis.code === "I10" || /hypertension|hipertensi/i.test(diagnosis.name));
  const hasCodedDiabetes = rawDiagnoses.some((diagnosis) => diagnosis.code && /diabetes|dm\s*tipe/i.test(diagnosis.name));
  const hasCodedLipid = rawDiagnoses.some((diagnosis) => diagnosis.code && /lipid|hyperlip|hiperlip/i.test(diagnosis.name));

  const filtered = rawDiagnoses.filter((diagnosis) => {
    if (diagnosis.code) return true;
    if (hasCodedPrimary && diagnosis.type === "PRIMARY" && /stroke|cvd|cerebral|infarction/i.test(diagnosis.name)) return false;
    if (hasCodedHypertension && /^(ht|hipertensi|hypertension)$/i.test(diagnosis.name)) return false;
    if (hasCodedDiabetes && /^(dm|dm tipe 2|diabetes)$/i.test(diagnosis.name)) return false;
    if (hasCodedLipid && /lipid|hiperlip|hyperlip/i.test(diagnosis.name)) return false;
    return diagnosis.name.length >= 4;
  });

  const byKey = new Map<string, CleanDiagnosis>();
  for (const diagnosis of filtered) {
    const key = getDiagnosisDedupeKey(diagnosis);
    const existing = byKey.get(key);
    if (!existing || isDiagnosisBetter(diagnosis, existing)) {
      byKey.set(key, diagnosis);
    }
  }

  const result = Array.from(byKey.values())
    .sort((a, b) => {
      if (a.type === "PRIMARY" && b.type !== "PRIMARY") return -1;
      if (a.type !== "PRIMARY" && b.type === "PRIMARY") return 1;
      return a.sequence - b.sequence;
    })
    .map((diagnosis, index) => ({ ...diagnosis, sequence: index + 1 }));

  return result.length > 0 ? result : undefined;
}

function normalizeItemType(value: unknown): CleanLineItem["item_type"] | null {
  const normalized = asCleanString(value)?.toUpperCase() ?? "";
  if (normalized === "PROCEDURE" || normalized === "MEDICATION" || normalized === "MEDICAL_SUPPLY") return normalized;
  if (normalized.includes("MEDICATION") || normalized.includes("DRUG")) return "MEDICATION";
  if (normalized.includes("SUPPLY") || normalized.includes("CONSUMABLE") || normalized.includes("ALKES")) return "MEDICAL_SUPPLY";
  return null;
}

function sanitizeLineItem(item: unknown): CleanLineItem | null {
  if (!isRecord(item)) return null;

  const name = asCleanString(item.name);
  const itemType = normalizeItemType(item.item_type ?? item.type);
  const totalPrice = asNumber(item.total_price ?? item.totalPrice ?? item.amount);
  if (!name || !itemType || totalPrice === null) return null;

  const quantity = asNumber(item.quantity ?? item.qty);
  const unitPrice = asNumber(item.unit_price ?? item.unitPrice ?? item.price);
  const serviceDate = asCleanString(item.service_date ?? item.performed_date);
  const lineItem: CleanLineItem = {
    item_type: itemType,
    name,
    total_price: totalPrice,
  };

  const code = asCleanString(item.code ?? item.service_code);
  if (code && code !== "-") lineItem.code = code;

  const category = asCleanString(item.category);
  if (category) lineItem.category = category;

  const genericName = asCleanString(item.generic_name ?? item.genericName);
  if (genericName && genericName.toLowerCase() !== name.toLowerCase()) lineItem.generic_name = genericName;

  const dosage = asCleanString(item.dosage);
  if (dosage && !/^qty\s*:/i.test(dosage)) lineItem.dosage = dosage;

  if (quantity !== null && quantity > 0) lineItem.quantity = quantity;
  else lineItem.quantity = 1;

  if (unitPrice !== null && unitPrice > 0) lineItem.unit_price = unitPrice;
  else lineItem.unit_price = totalPrice / lineItem.quantity;

  const frequency = asCleanString(item.frequency);
  if (frequency) lineItem.frequency = frequency;

  const duration = asCleanString(item.duration);
  if (duration && !isIsoDate(duration)) lineItem.duration = duration;

  if (serviceDate && isIsoDate(serviceDate)) lineItem.service_date = serviceDate;

  return lineItem;
}

function sanitizeLineItems(value: unknown): CleanLineItem[] | undefined {
  if (!Array.isArray(value)) return undefined;

  const items = value.map(sanitizeLineItem).filter((item): item is CleanLineItem => item !== null);
  return items.length > 0 ? items : undefined;
}

function sanitizeDocumentMetadata(value: unknown): Record<string, JsonValue> | undefined {
  if (!isRecord(value)) return undefined;

  const result: Record<string, JsonValue> = {};
  for (const key of ["page_number", "total_pages", "readability_score", "data_usability_score"]) {
    const numberValue = asNumber(value[key]);
    if (numberValue !== null) result[key] = numberValue;
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

function sanitizePayloadRecord(record: Record<string, unknown>): Record<string, JsonValue> {
  const result: Record<string, JsonValue> = {};

  for (const key of ROOT_KEYS) {
    const value = record[key];

    if (key === "diagnoses") {
      const diagnoses = sanitizeDiagnoses(value);
      if (diagnoses) result.diagnoses = diagnoses;
      continue;
    }

    if (key === "line_items") {
      const lineItems = sanitizeLineItems(value);
      if (lineItems) result.line_items = lineItems;
      continue;
    }

    if (key === "document_metadata") {
      const metadata = sanitizeDocumentMetadata(value);
      if (metadata) result.document_metadata = metadata;
      continue;
    }

    if (key === "amount") {
      const amount = asNumber(value);
      if (amount !== null) result.amount = amount;
      continue;
    }

    const stringValue = asCleanString(value);
    if (stringValue) result[key] = stringValue;
  }

  return result;
}

function mergePageData(record: Record<string, unknown>): Record<string, unknown> | null {
  const pages = record.pages;
  if (!Array.isArray(pages)) return null;

  const merged: Record<string, unknown> = {};
  if (record.totalPages !== undefined) {
    merged.document_metadata = { total_pages: record.totalPages };
  }

  for (const page of pages) {
    if (!isRecord(page) || !isRecord(page.data)) continue;
    Object.assign(merged, page.data);
    if (typeof page.pageNumber === "number") {
      merged.document_metadata = { ...(isRecord(merged.document_metadata) ? merged.document_metadata : {}), page_number: page.pageNumber };
    }
  }

  return Object.keys(merged).length > 0 ? merged : null;
}

export function sanitizeSnaptextOcrResult(value: unknown): JsonValue {
  if (!isRecord(value)) return isJsonValue(value) ? value : {};

  if (isRecord(value.result)) {
    return {
      ...sanitizePayloadRecord(value),
      result: sanitizeSnaptextOcrResult(value.result),
    };
  }

  const pageData = mergePageData(value);
  if (pageData) {
    return {
      ...sanitizePayloadRecord(value),
      totalPages: asNumber(value.totalPages) ?? undefined,
      pages: Array.isArray(value.pages)
        ? value.pages
            .map((page): JsonValue | null => {
              if (!isRecord(page)) return null;
              const data = isRecord(page.data) ? sanitizePayloadRecord(page.data) : {};
              if (Object.keys(data).length === 0) return null;
              const pageNumber = asNumber(page.pageNumber);
              return {
                ...(pageNumber !== null ? { pageNumber } : {}),
                data,
              };
            })
            .filter((page): page is JsonValue => page !== null)
        : [],
    };
  }

  return sanitizePayloadRecord(value);
}

export function sanitizeSnaptextPayloadRecord(value: unknown): Record<string, JsonValue> {
  if (!isRecord(value)) return {};
  return sanitizePayloadRecord(value);
}
