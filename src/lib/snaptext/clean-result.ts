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
  /\b(not\s+listed|not\s+shown|not\s+available|not\s+on\s+this\s+page|tidak\s+tercantum|tidak\s+ada)\b/i,
  /\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/,
  /\b(crp|uric acid|electrolyte|nat|kal|chlo|creatinine|ureum|glucose|sgpt|sgot|d-?dimer|cbc|full blood count)\b/i,
  /\b(mri|mra|ecg|electrocardiogram|echocardiogram|doppler|radiology|laboratory|diagnostic)\b/i,
  /\b(syringe|needle|nacl|asering|otsu|brainact|interco|xarelto|plavix|trajenta|crestor|lipitor|brilinta|esoferr|farmasal)\b/i,
  /\b(consultation|visit|bed rental|food and beverage|o2 per day|therapy|procedure|ward|pharmacy)\b/i,
  /\b(panin|life|asuransi|insurance|hospital|siloam|mrccc)\b/i,
];

const BENEFIT_OR_NON_BILLING_PATTERNS = [
  /\b(benefit|limit|manfaat|reimbursement|reimburs|reimburst|schedule|quotation|estimated\s+cost|tarif\s+kamar|as\s+charge)\b/i,
  /\b(tidak\s+dijamin|uncover|not\s+covered|exclusion|maksimum\s+per\s+tahun|per\s+tahun\s+pertanggungan)\b/i,
];

const SUPPLY_NAME_PATTERN = /\b(syringe|needle|cannula|catheter|diaper|electrode|tegaderm|underpad|extension\s+tube|extention\s+tube|intrafix|vasofix|skintact|opsite|swab|jelly|connector|infusion\s+set|consumable|medical\s+supply|alkes|bmhp)\b/i;
const MEDICATION_NAME_PATTERN = /\b(tab|tablet|cap|capsule|inj|injection|inf|vial|amp|ampoule|mg|mcg|gram|ml|nacl|asering|xarelto|plavix|trajenta|crestor|lipitor|brilinta|brainact|interco|esoferr|farmasal|neurotam|neuroaid|forxiga)\b/i;

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
  const hasCodedStroke = rawDiagnoses.some((diagnosis) => Boolean(diagnosis.code?.startsWith("I63") || diagnosis.code?.startsWith("I69") || /cerebral\s+infarction/i.test(diagnosis.name)));
  const hasCodedHypertension = rawDiagnoses.some((diagnosis) => diagnosis.code === "I10" || /hypertension|hipertensi/i.test(diagnosis.name));
  const hasCodedDiabetes = rawDiagnoses.some((diagnosis) => diagnosis.code && /diabetes|dm\s*tipe/i.test(diagnosis.name));
  const hasCodedLipid = rawDiagnoses.some((diagnosis) => diagnosis.code && /lipid|hyperlip|hiperlip/i.test(diagnosis.name));

  const filtered = rawDiagnoses.filter((diagnosis) => {
    if (diagnosis.code) return true;
    if ((hasCodedPrimary || hasCodedStroke) && /stroke|cvd|cerebral|infarction|infark/i.test(diagnosis.name)) return false;
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

  const sorted = Array.from(byKey.values())
    .sort((a, b) => {
      if (a.type === "PRIMARY" && b.type !== "PRIMARY") return -1;
      if (a.type !== "PRIMARY" && b.type === "PRIMARY") return 1;
      if (a.code && !b.code) return -1;
      if (!a.code && b.code) return 1;
      return a.sequence - b.sequence;
    })
    .slice(0, 8);

  const hasPrimary = sorted.some((diagnosis) => diagnosis.type === "PRIMARY");
  const result = sorted.map((diagnosis, index) => ({
    ...diagnosis,
    type: !hasPrimary && index === 0 ? "PRIMARY" : diagnosis.type,
    sequence: index + 1,
  }));

  return result.length > 0 ? result : undefined;
}

function normalizeItemType(value: unknown): CleanLineItem["item_type"] | null {
  const normalized = asCleanString(value)?.toUpperCase() ?? "";
  if (normalized === "PROCEDURE" || normalized === "MEDICATION" || normalized === "MEDICAL_SUPPLY") return normalized;
  if (normalized.includes("MEDICATION") || normalized.includes("DRUG")) return "MEDICATION";
  if (normalized.includes("SUPPLY") || normalized.includes("CONSUMABLE") || normalized.includes("ALKES")) return "MEDICAL_SUPPLY";
  return null;
}

function normalizeLineItemType(item: Record<string, unknown>, name: string, category: string | null): CleanLineItem["item_type"] | null {
  const rawType = normalizeItemType(item.item_type ?? item.type);
  const text = [name, category ?? ""].join(" ");

  if (SUPPLY_NAME_PATTERN.test(text)) return "MEDICAL_SUPPLY";
  if (/\b(drug|drugs|pharmacy|farmasi)\b/i.test(category ?? "") || MEDICATION_NAME_PATTERN.test(name)) return "MEDICATION";

  return rawType ?? "PROCEDURE";
}

function shouldExcludeLineItemName(name: string, category: string | null): boolean {
  const text = [name, category ?? ""].join(" ");
  if (BENEFIT_OR_NON_BILLING_PATTERNS.some((pattern) => pattern.test(text))) return true;
  if (/\b(sub\s*total|subtotal|total\s+(drugs|laboratory|radiology|diagnostic|procedure|bed|consultation)|grand\s+total)\b/i.test(name)) return true;
  return false;
}

function sanitizeLineItem(item: unknown): CleanLineItem | null {
  if (!isRecord(item)) return null;

  const name = asCleanString(item.name);
  const category = asCleanString(item.category);
  const totalPrice = asNumber(item.total_price ?? item.totalPrice ?? item.amount);
  if (!name || totalPrice === null || totalPrice <= 0 || shouldExcludeLineItemName(name, category)) return null;

  const itemType = normalizeLineItemType(item, name, category);
  if (!itemType) return null;

  const quantity = asNumber(item.quantity ?? item.qty);
  const rawUnitPrice = asNumber(item.unit_price ?? item.unitPrice ?? item.price);
  const normalizedQuantity = quantity !== null && quantity > 0 ? quantity : 1;
  const computedUnitPrice = totalPrice / normalizedQuantity;
  const unitPrice = rawUnitPrice !== null && rawUnitPrice > 0 ? rawUnitPrice : computedUnitPrice;
  const unitPriceMismatchRatio = computedUnitPrice > 0 ? Math.abs(unitPrice - computedUnitPrice) / computedUnitPrice : 0;
  const normalizedUnitPrice = normalizedQuantity > 1 && unitPriceMismatchRatio > 0.05 ? computedUnitPrice : unitPrice;
  const serviceDate = asCleanString(item.service_date ?? item.performed_date);
  const lineItem: CleanLineItem = {
    item_type: itemType,
    name,
    total_price: totalPrice,
  };

  const code = asCleanString(item.code ?? item.service_code);
  if (code && code !== "-") lineItem.code = code;

  if (category) lineItem.category = category;

  const genericName = asCleanString(item.generic_name ?? item.genericName);
  if (genericName && genericName.toLowerCase() !== name.toLowerCase()) lineItem.generic_name = genericName;

  const dosage = asCleanString(item.dosage);
  if (dosage && !/^qty\s*:/i.test(dosage)) lineItem.dosage = dosage;

  lineItem.quantity = normalizedQuantity;
  lineItem.unit_price = normalizedUnitPrice;

  const frequency = asCleanString(item.frequency);
  if (frequency) lineItem.frequency = frequency;

  const duration = asCleanString(item.duration);
  if (duration && !isIsoDate(duration)) lineItem.duration = duration;

  if (serviceDate && isIsoDate(serviceDate)) lineItem.service_date = serviceDate;

  return lineItem;
}

function isSummaryLineItem(item: CleanLineItem): boolean {
  if (item.code || item.service_date) return false;
  const normalizedName = item.name.toLowerCase().trim();
  const normalizedCategory = item.category?.toLowerCase().trim();
  if (normalizedName.includes("subtotal") || normalizedName.includes("sub total")) return true;
  return Boolean(normalizedCategory && normalizedName === normalizedCategory);
}

function getLineItemDedupeKey(item: CleanLineItem): string {
  return [
    item.item_type,
    item.code ?? "",
    item.name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(),
    item.service_date ?? "",
    item.quantity,
    Math.round(item.total_price),
  ].join("|");
}

function sanitizeLineItems(value: unknown): CleanLineItem[] | undefined {
  if (!Array.isArray(value)) return undefined;

  const sanitizedItems = value.map(sanitizeLineItem).filter((item): item is CleanLineItem => item !== null);
  const hasDetailedItems = sanitizedItems.some((item) => Boolean(item.code || item.service_date));
  const items = hasDetailedItems ? sanitizedItems.filter((item) => !isSummaryLineItem(item)) : sanitizedItems;

  const byKey = new Map<string, CleanLineItem>();
  for (const item of items) {
    const key = getLineItemDedupeKey(item);
    if (!byKey.has(key)) byKey.set(key, item);
  }

  const result = Array.from(byKey.values());
  return result.length > 0 ? result : undefined;
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
