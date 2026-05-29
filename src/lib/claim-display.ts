import { decryptCredential, encryptCredential } from '@/lib/api-key';

type ClaimDisplayMetadata = {
  patient?: {
    name?: string;
    birthDate?: string | null;
    gender?: string | null;
    identifier?: Array<{ value?: string | null }>;
  };
  claimId?: string | null;
  insuranceNumber?: string | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function isRedacted(value: unknown) {
  return typeof value === 'string' && /^\[(?:REDACTED|PASIEN|ID_REDACTED|CLAIM_ID_REDACTED|NIK_REDACTED|EMAIL_REDACTED|PHONE_REDACTED)/i.test(value);
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

export function buildClaimDisplayMetadata(payload: unknown): string | null {
  const input = asRecord(payload);
  if (!input) return null;

  const patient = asRecord(input.patient);
  const extra = asRecord(input.extra);
  const identifiers = Array.isArray(patient?.identifier) ? patient.identifier : [];

  const metadata: ClaimDisplayMetadata = {
    patient: patient ? {
      name: stringOrNull(patient.name) || undefined,
      birthDate: stringOrNull(patient.birthDate ?? patient.dateOfBirth),
      gender: stringOrNull(patient.gender),
      identifier: identifiers
        .map((item) => asRecord(item))
        .filter((item): item is Record<string, unknown> => item !== null)
        .map((item) => ({ value: stringOrNull(item.value) })),
    } : undefined,
    claimId: stringOrNull(input.claimId),
    insuranceNumber: stringOrNull(extra?.insuranceNumber),
  };

  if (!metadata.patient?.name && !metadata.claimId && !metadata.insuranceNumber && !metadata.patient?.identifier?.length) {
    return null;
  }

  return encryptCredential(JSON.stringify(metadata));
}

export function readClaimDisplayMetadata(metadata: unknown): ClaimDisplayMetadata | null {
  const meta = asRecord(metadata);
  const cipher = stringOrNull(meta?.uiDisplayCipher);
  if (!cipher) return null;

  const decrypted = decryptCredential(cipher);
  if (!decrypted) return null;

  try {
    return JSON.parse(decrypted) as ClaimDisplayMetadata;
  } catch {
    return null;
  }
}

export function applyClaimDisplayMetadataToPayload(inputPayload: unknown, metadata: unknown): unknown {
  const display = readClaimDisplayMetadata(metadata);
  if (!display || !inputPayload || typeof inputPayload !== 'object') return inputPayload;

  const payload = JSON.parse(JSON.stringify(inputPayload));
  payload.patient = payload.patient || {};
  payload.extra = payload.extra || {};

  if (display.patient?.name && (!payload.patient.name || isRedacted(payload.patient.name))) payload.patient.name = display.patient.name;
  if (display.patient?.birthDate && (!payload.patient.birthDate || isRedacted(payload.patient.birthDate))) payload.patient.birthDate = display.patient.birthDate;
  if (display.patient?.gender && !payload.patient.gender) payload.patient.gender = display.patient.gender;
  if (display.patient?.identifier?.length) {
    payload.patient.identifier = Array.isArray(payload.patient.identifier) ? payload.patient.identifier : [];
    display.patient.identifier.forEach((identifier, index) => {
      if (!identifier.value) return;
      payload.patient.identifier[index] = payload.patient.identifier[index] || {};
      if (!payload.patient.identifier[index].value || isRedacted(payload.patient.identifier[index].value)) {
        payload.patient.identifier[index].value = identifier.value;
      }
    });
  }
  if (display.claimId && (!payload.claimId || isRedacted(payload.claimId))) payload.claimId = display.claimId;
  if (display.insuranceNumber && (!payload.extra.insuranceNumber || isRedacted(payload.extra.insuranceNumber))) payload.extra.insuranceNumber = display.insuranceNumber;

  return payload;
}

export function applyClaimDisplayMetadataToJob<T extends { inputPayload: unknown; metadata?: unknown }>(job: T): T {
  return {
    ...job,
    inputPayload: applyClaimDisplayMetadataToPayload(job.inputPayload, job.metadata),
  };
}
