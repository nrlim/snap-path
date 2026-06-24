import type { ClaimValidationInput } from "@/lib/ai/types";
import type { OcrItem, TxtItem } from "@/lib/ocr-scoring";

export interface BuildOcrClaimPayloadInput {
  ocrJobId: string;
  clientId: string | null;
  providerId: string | null;
  providerName: string | null;
  pdfUrl: string;
  pdfStoragePath: string;
  ocrItems: OcrItem[];
  txtItems?: (OcrItem | TxtItem)[];
  ocrRawResult: unknown;
}

export interface OcrClaimValidationPayload extends ClaimValidationInput {
  providerId: string;
  extra: {
    source: "SNAPTEXT_OCR_INVOICE";
    ocrJobId: string;
    invoiceNumber?: string;
    insuranceNumber?: string;
    documentReadabilityScore?: string;
    documentDataUsabilityScore?: string;
    los?: string;
    missingClinicalFields: string[];
  };
}

export function buildClaimValidationPayloadFromAI(
  aiMappedPayload: Partial<ClaimValidationInput>,
  input: BuildOcrClaimPayloadInput
): { payload: OcrClaimValidationPayload; mappingLog: Record<string, string> } {
  const mappingLog: Record<string, string> = {
    "_info": "Mapped using AI Smart Mapping (mapArbitraryJsonToClaim)"
  };

  const txtDiagnoses = extractDiagnosesFromTxtItems(input.txtItems);

  const payload: ClaimValidationInput = {
    providerId: input.providerId || "",
    patient: {
      id: aiMappedPayload.patient?.id || "",
      name: aiMappedPayload.patient?.name || "Pasien OCR",
      dateOfBirth: aiMappedPayload.patient?.dateOfBirth || "",
      gender: aiMappedPayload.patient?.gender || "M",
    },
    encounter: {
      type: aiMappedPayload.encounter?.type || "RAWAT_JALAN",
      admissionDate: aiMappedPayload.encounter?.admissionDate || "",
      dischargeDate: aiMappedPayload.encounter?.dischargeDate || "",
      facility: {
        id: aiMappedPayload.encounter?.facility?.id || input.providerId || "",
        name: aiMappedPayload.encounter?.facility?.name || input.providerName || "Faskes",
        type: aiMappedPayload.encounter?.facility?.type || "KLINIK",
      }
    },
    diagnoses: aiMappedPayload.diagnoses ? [...aiMappedPayload.diagnoses] : [],
    procedures: aiMappedPayload.procedures ? [...aiMappedPayload.procedures] : [],
    medications: aiMappedPayload.medications ? [...aiMappedPayload.medications] : [],
    policyRules: aiMappedPayload.policyRules ? aiMappedPayload.policyRules.map((rule: any) => {
      let parsedActionJson = undefined;
      if (rule.actionJsonStr) {
        try {
          parsedActionJson = JSON.parse(rule.actionJsonStr);
        } catch (e) {
          console.warn("Failed to parse actionJsonStr", rule.actionJsonStr);
        }
      }
      return {
        ...rule,
        actionJson: parsedActionJson || rule.actionJson
      };
    }) : [],
    documents: aiMappedPayload.documents ? [...aiMappedPayload.documents] : [],
    totalClaimAmount: aiMappedPayload.totalClaimAmount || 0,
    currency: aiMappedPayload.currency,
    notes: aiMappedPayload.notes,
  };

  // Inject ICD-10 codes from TXT if missing or invalid
  payload.diagnoses = payload.diagnoses.map((diag, index) => {
    let code = diag.code;
    const isValid = /^[A-TV-Z]\d{2}(?:\.\d+)?$/.test((code || "").trim().toUpperCase());
    
    if (!isValid && txtDiagnoses.length > index) {
      code = txtDiagnoses[index].code;
      mappingLog[`diagnoses.${index}.code`] = `Injected from ground truth TXT: ${code}`;
    }

    return {
      ...diag,
      code: code || `OCR-DIAG-${index + 1}`
    };
  });

  return {
    payload: {
      ...payload,
      providerId: input.providerId || "",
      extra: {
        source: "SNAPTEXT_OCR_INVOICE",
        ocrJobId: input.ocrJobId,
        missingClinicalFields: [],
      },
    },
    mappingLog,
  };
}

export interface OcrClaimValidationPayloadResult {
  payload: OcrClaimValidationPayload;
  mappingLog: Record<string, string>;
}

interface InvoiceDiagnosisInput {
  code?: unknown;
  name?: unknown;
  type?: unknown;
  sequence?: unknown;
}

interface InvoiceLineItemInput {
  item_type?: unknown;
  type?: unknown;
  category?: unknown;
  code?: unknown;
  service_code?: unknown;
  kfa_code?: unknown;
  name?: unknown;
  description?: unknown;
  generic_name?: unknown;
  genericName?: unknown;
  dosage?: unknown;
  quantity?: unknown;
  qty?: unknown;
  unit_price?: unknown;
  unitPrice?: unknown;
  price?: unknown;
  total_price?: unknown;
  totalPrice?: unknown;
  amount?: unknown;
  frequency?: unknown;
  duration?: unknown;
  service_date?: unknown;
  performed_date?: unknown;
  is_medication?: unknown;
}

type ClaimDiagnosisType = ClaimValidationInput["diagnoses"][number]["type"];
type EncounterType = ClaimValidationInput["encounter"]["type"];

const RAW_RESULT_CANDIDATE_KEYS = [
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
  "snaptextResult",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim());
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function parsePossibleJsonString(text: string): Record<string, unknown> | null {
  const direct = parseJsonObject(text);
  if (direct) return direct;

  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return parseJsonObject(text.slice(firstBrace, lastBrace + 1));
  }

  return null;
}

function hasInvoiceClaimSignal(record: Record<string, unknown>): boolean {
  return [
    "amount",
    "provider_name",
    "member_name",
    "invoice_number",
    "patient_identifier",
    "patient_birth_date",
    "patient_gender",
    "encounter_type",
    "admission_date",
    "discharge_date",
    "diagnoses",
    "line_items",
  ].some((key) => record[key] !== undefined);
}

function mergeSnaptextPageData(record: Record<string, unknown>): Record<string, unknown> | null {
  const pages = record.pages;
  if (!Array.isArray(pages)) return null;

  const merged: Record<string, unknown> = {};
  for (const page of pages) {
    if (!isRecord(page) || !isRecord(page.data)) continue;
    Object.assign(merged, page.data);
  }

  return hasInvoiceClaimSignal(merged) ? merged : null;
}

function extractStructuredRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "string") {
    return parsePossibleJsonString(value) ?? {};
  }

  if (!isRecord(value)) return {};
  if (hasInvoiceClaimSignal(value)) return value;

  const pageData = mergeSnaptextPageData(value);
  if (pageData) return pageData;

  for (const key of RAW_RESULT_CANDIDATE_KEYS) {
    const nested = value[key];
    if (typeof nested === "string") {
      const parsed = parsePossibleJsonString(nested);
      if (parsed && hasInvoiceClaimSignal(parsed)) return parsed;
    }

    if (isRecord(nested)) {
      const extracted = extractStructuredRecord(nested);
      if (hasInvoiceClaimSignal(extracted)) return extracted;
    }
  }

  return value;
}

function getItemValue(ocrItems: OcrItem[], field: string): string | null {
  const item = ocrItems.find((candidate) => candidate.field === field);
  const value = item?.correctedValue ?? item?.value;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function getStringFromSources(ocrItems: OcrItem[], record: Record<string, unknown>, field: string): string | null {
  return getItemValue(ocrItems, field) ?? getString(record, field);
}

function parseNumberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;

  const cleaned = value
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

function normalizeDate(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10);

  const dmy = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (dmy) {
    const day = dmy[1]?.padStart(2, "0");
    const month = dmy[2]?.padStart(2, "0");
    const rawYear = dmy[3] ?? "";
    const year = rawYear.length === 2 ? `20${rawYear}` : rawYear;
    if (day && month && year) return `${year}-${month}-${day}`;
  }

  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

function normalizeGender(value: string | null): "M" | "F" | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (["m", "male", "l", "laki-laki", "laki", "pria"].includes(normalized)) return "M";
  if (["f", "female", "p", "perempuan", "wanita"].includes(normalized)) return "F";
  return null;
}

function normalizeEncounterType(value: string | null): EncounterType {
  const normalized = String(value ?? "").trim().toUpperCase();
  if (["RAWAT_JALAN", "OUTPATIENT", "AMB", "RJ", "OPD"].includes(normalized)) return "RAWAT_JALAN";
  if (["IGD", "EMERGENCY", "EMER", "ER", "GAWAT_DARURAT"].includes(normalized)) return "IGD";
  return "RAWAT_INAP";
}

function normalizeDiagnosisType(value: unknown, index: number): ClaimDiagnosisType {
  const normalized = String(value ?? "").trim().toUpperCase();
  if (normalized === "SECONDARY" || normalized === "SEKUNDER") return "SECONDARY";
  if (normalized === "COMPLICATION" || normalized === "KOMPLIKASI") return "COMPLICATION";
  return index === 0 ? "PRIMARY" : "SECONDARY";
}

function readArray(record: Record<string, unknown>, keys: string[]): unknown[] {
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) return value;
  }
  return [];
}

function isValidIcdCode(value: string): boolean {
  return /^[A-TV-Z]\d{2}(?:\.\d+)?$/.test(value.trim().toUpperCase());
}

function normalizeDiagnosisName(value: string): string | null {
  const cleaned = value
    .replace(/^(primary|secondary)\s+diagnosis\s*:?\s*/i, "")
    .replace(/^diagnosis\s*:?\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) return null;
  if (/^(diagnosis|primary diagnosis|secondary diagnosis|drugs|emergency|laboratory|radiology|diagnostic)$/i.test(cleaned)) return null;
  if (/\b(crp|uric acid|electrolyte|creatinine|ureum|glucose|sgpt|sgot|d-?dimer|cbc|mri|ecg|syringe|nacl|consultation|visit|bed rental)\b/i.test(cleaned)) return null;
  return cleaned;
}

export function extractDiagnosesFromTxtItems(txtItems?: (OcrItem | TxtItem)[]): Array<{code: string; type: string}> {
  const txtDiagnoses: Array<{code: string; type: string}> = [];
  if (txtItems) {
    const diagCodes = txtItems.filter(item => item.field.startsWith("diagnoses.") && item.field.endsWith(".code"));
    const diagTypes = txtItems.filter(item => item.field.startsWith("diagnoses.") && item.field.endsWith(".type"));
    diagCodes.forEach(codeItem => {
      const match = codeItem.field.match(/^diagnoses\.(\d+)\.code$/);
      if (match) {
        const index = match[1];
        const typeItem = diagTypes.find(t => t.field === `diagnoses.${index}.type`);
        txtDiagnoses.push({
          code: codeItem.value,
          type: typeItem ? typeItem.value : "SECONDARY"
        });
      }
    });
    // Sort so PRIMARY is first
    txtDiagnoses.sort((a, b) => {
      if (a.type === "PRIMARY" && b.type !== "PRIMARY") return -1;
      if (a.type !== "PRIMARY" && b.type === "PRIMARY") return 1;
      return 0;
    });
  }
  return txtDiagnoses;
}

function buildDiagnoses(record: Record<string, unknown>, txtItems?: (OcrItem | TxtItem)[]): ClaimValidationInput["diagnoses"] {
  const txtDiagnoses = extractDiagnosesFromTxtItems(txtItems);

  const diagnoses = readArray(record, ["diagnoses", "diagnosis", "icd10"]);

  if (diagnoses.length > 0) {
    const parsed = diagnoses
      .map((item, index) => {
        if (!isRecord(item)) return null;
        const diagnosis = item as InvoiceDiagnosisInput;
        const rawCode = typeof diagnosis.code === "string" ? diagnosis.code.trim().toUpperCase() : "";
        let code = isValidIcdCode(rawCode) ? rawCode : "";
        
        // If code is not valid or empty, try to get from txt
        if (!code && txtDiagnoses.length > index) {
          code = txtDiagnoses[index].code;
        }

        const rawName = typeof diagnosis.name === "string" && diagnosis.name.trim() ? diagnosis.name.trim() : code;
        const name = normalizeDiagnosisName(rawName);
        if (!code && !name) return null;

        return {
          code: code || `OCR-DIAG-${index + 1}`,
          name: name || code,
          type: normalizeDiagnosisType(diagnosis.type, index),
          sequence: parseNumberValue(diagnosis.sequence) ?? index + 1,
          hasIcdCode: Boolean(code),
        };
      })
      .filter((item): item is ClaimValidationInput["diagnoses"][number] & { hasIcdCode: boolean } => item !== null);

    const hasCodedPrimary = parsed.some((diagnosis) => diagnosis.type === "PRIMARY" && diagnosis.hasIcdCode);
    const byKey = new Map<string, ClaimValidationInput["diagnoses"][number] & { hasIcdCode: boolean }>();

    for (const diagnosis of parsed) {
      if (hasCodedPrimary && !diagnosis.hasIcdCode && diagnosis.type === "PRIMARY" && /stroke|cvd|cerebral|infarction/i.test(diagnosis.name)) {
        continue;
      }

      const key = diagnosis.hasIcdCode ? `code:${diagnosis.code}` : `name:${diagnosis.name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()}`;
      const existing = byKey.get(key);
      if (!existing || (diagnosis.hasIcdCode && !existing.hasIcdCode) || diagnosis.name.length > existing.name.length) {
        byKey.set(key, diagnosis);
      }
    }

    return Array.from(byKey.values())
      .sort((a, b) => {
        if (a.type === "PRIMARY" && b.type !== "PRIMARY") return -1;
        if (a.type !== "PRIMARY" && b.type === "PRIMARY") return 1;
        return a.sequence - b.sequence;
      })
      .map((diagnosis, index) => ({
        code: diagnosis.code,
        name: diagnosis.name,
        type: diagnosis.type,
        sequence: index + 1,
      }));
  }

  const rawCode = getString(record, "diagnosis_code")?.toUpperCase() ?? "";
  let code = isValidIcdCode(rawCode) ? rawCode : "";
  if (!code && txtDiagnoses.length > 0) {
    code = txtDiagnoses[0].code;
  }
  const name = normalizeDiagnosisName(getString(record, "diagnosis_name") ?? code);
  if (!code && !name) return [];

  return [{ code: code || "OCR-DIAG-1", name: name ?? code, type: "PRIMARY", sequence: 1 }];
}

function getLineItemName(item: InvoiceLineItemInput, index: number): string {
  const name = typeof item.name === "string" && item.name.trim() ? item.name.trim() : null;
  const description = typeof item.description === "string" && item.description.trim() ? item.description.trim() : null;
  return name ?? description ?? `Item invoice ${index + 1}`;
}

function isMedicationLineItem(item: InvoiceLineItemInput): boolean {
  if (typeof item.is_medication === "boolean") return item.is_medication;
  const text = [item.item_type, item.type, item.category, item.name, item.description]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();
  return /\b(obat|farmalkes|farmasi|drug|drugs|medicine|medication|medical_supply|medical supply|supply|supplies|consumables|alkes|bhp|bmhp)\b/.test(text);
}

function buildProceduresAndMedications(record: Record<string, unknown>): Pick<ClaimValidationInput, "procedures" | "medications"> {
  const lineItems = readArray(record, ["line_items", "items", "invoice_items", "billing_items", "details"]);
  const procedures: ClaimValidationInput["procedures"] = [];
  const medications: ClaimValidationInput["medications"] = [];

  lineItems.forEach((rawItem, index) => {
    if (!isRecord(rawItem)) return;
    const item = rawItem as InvoiceLineItemInput;
    const quantity = Math.max(1, parseNumberValue(item.quantity ?? item.qty) ?? 1);
    const totalPrice = Math.max(0, parseNumberValue(item.total_price ?? item.totalPrice ?? item.amount) ?? 0);
    const unitPrice = Math.max(0, parseNumberValue(item.unit_price ?? item.unitPrice ?? item.price) ?? (quantity > 0 ? totalPrice / quantity : totalPrice));
    const name = getLineItemName(item, index);

    if (isMedicationLineItem(item)) {
      medications.push({
        name,
        genericName: typeof (item.generic_name ?? item.genericName) === "string" ? String(item.generic_name ?? item.genericName).trim() : undefined,
        dosage: typeof item.dosage === "string" ? item.dosage.trim() : undefined,
        quantity,
        unitPrice,
        totalPrice: totalPrice || unitPrice * quantity,
        frequency: typeof item.frequency === "string" ? item.frequency.trim() : undefined,
        duration: typeof item.duration === "string" ? item.duration.trim() : undefined,
      });
      return;
    }

    procedures.push({
      code: typeof (item.code ?? item.service_code) === "string" ? String(item.code ?? item.service_code).trim() || null : null,
      name,
      category: typeof item.category === "string" ? item.category.trim() : undefined,
      quantity,
      unitPrice,
      totalPrice: totalPrice || unitPrice * quantity,
      performedDate: normalizeDate(typeof (item.service_date ?? item.performed_date) === "string" ? String(item.service_date ?? item.performed_date) : null) ?? undefined,
    });
  });

  return { procedures, medications };
}

function collectMissingClinicalFields(payload: Pick<ClaimValidationInput, "diagnoses" | "procedures" | "medications">): string[] {
  const missing: string[] = [];
  if (payload.diagnoses.length === 0) missing.push("diagnoses");
  if (payload.procedures.length === 0) missing.push("procedures");
  if (payload.medications.length === 0) missing.push("medications");
  return missing;
}

export function buildClaimValidationPayloadFromOcr(input: BuildOcrClaimPayloadInput): OcrClaimValidationPayloadResult {
  const record = extractStructuredRecord(input.ocrRawResult);
  const providerName = input.providerName ?? getStringFromSources(input.ocrItems, record, "provider_name") ?? "Provider dari invoice OCR";
  const memberName = getStringFromSources(input.ocrItems, record, "member_name") ?? "Pasien dari invoice OCR";
  const invoiceNumber = getStringFromSources(input.ocrItems, record, "invoice_number") ?? input.ocrJobId;
  const totalClaimAmount = parseNumberValue(getStringFromSources(input.ocrItems, record, "amount") ?? record.amount) ?? 0;
  const birthDate = normalizeDate(getString(record, "patient_birth_date")) ?? "1900-01-01";
  const gender = normalizeGender(getString(record, "patient_gender")) ?? "M";
  const encounterType = normalizeEncounterType(getString(record, "encounter_type"));
  const admissionDate = normalizeDate(getString(record, "admission_date")) ?? new Date().toISOString().slice(0, 10);
  const dischargeDate = normalizeDate(getString(record, "discharge_date")) ?? undefined;
  const patientIdentifier = getString(record, "patient_identifier") ?? invoiceNumber;
  const insuranceNumber = getString(record, "insurance_number") ?? undefined;
  const diagnoses = buildDiagnoses(record, input.txtItems);
  const { procedures, medications } = buildProceduresAndMedications(record);
  const missingClinicalFields = collectMissingClinicalFields({ diagnoses, procedures, medications });

  const mappingLog: Record<string, string> = {
    amount: String(totalClaimAmount),
    provider_name: providerName,
    member_name: memberName,
    invoice_number: invoiceNumber,
    patient_identifier: patientIdentifier,
    insurance_number: insuranceNumber ?? "",
    patient_birth_date: birthDate ?? "",
    patient_gender: gender ?? "",
    encounter_type: encounterType,
    admission_date: admissionDate ?? "",
    discharge_date: dischargeDate ?? "",
    "diagnoses.length": String(diagnoses.length),
    "procedures.length": String(procedures.length),
    "medications.length": String(medications.length),
  };

  const payload: OcrClaimValidationPayload = {
    clientId: input.clientId,
    providerId: input.providerId ?? "",
    claimId: invoiceNumber,
    patient: {
      id: patientIdentifier,
      name: memberName,
      dateOfBirth: birthDate,
      gender,
    },
    encounter: {
      type: encounterType,
      admissionDate,
      dischargeDate,
      facility: {
        id: input.providerId ?? "OCR_PROVIDER_UNRESOLVED",
        name: providerName,
        type: "RS",
      },
    },
    diagnoses,
    procedures,
    medications,
    totalClaimAmount,
    currency: "IDR",
    notes: [
      `Payload validasi klaim dibuat otomatis dari hasil OCR SnapText invoice job ${input.ocrJobId}.`,
      missingClinicalFields.length > 0
        ? `Field klinis belum lengkap dari invoice: ${missingClinicalFields.join(", ")}. Reviewer perlu melengkapi data sebelum adjudikasi final.`
        : "Field klinis utama berhasil diekstrak dari invoice.",
    ].join(" "),
    documents: [
      {
        type: "INVOICE",
        url: input.pdfUrl,
        description: `Invoice OCR ${invoiceNumber} (${input.pdfStoragePath})`,
      },
    ],
    extra: {
      source: "SNAPTEXT_OCR_INVOICE",
      ocrJobId: input.ocrJobId,
      invoiceNumber,
      insuranceNumber,
      documentReadabilityScore: getItemValue(input.ocrItems, "document_metadata.readability_score") ?? undefined,
      documentDataUsabilityScore: getItemValue(input.ocrItems, "document_metadata.data_usability_score") ?? undefined,
      missingClinicalFields,
    },
  };

  return { payload, mappingLog };
}
