/**
 * Utilities to strip or redact Personal Identifiable Information (PII)
 * from data before sending it to AI providers.
 */

// Basic redaction for text blobs
export function sanitizeClinicalText(text: string): string {
  if (!text || typeof text !== 'string') return text;
  
  let sanitized = text;
  // Redact potential NIKs (16 digits)
  sanitized = sanitized.replace(/\b\d{16}\b/g, '[NIK_REDACTED]');
  // Redact emails
  sanitized = sanitized.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL_REDACTED]');
  // Redact phone numbers (Indonesian 08xx / +62)
  sanitized = sanitized.replace(/\b(\+62|62|0)8[1-9][0-9]{6,10}\b/g, '[PHONE_REDACTED]');
  
  return sanitized;
}

// Targeted redaction for known ClaimValidationInput structure
export function sanitizeClaimValidationInput(payload: any): any {
  if (!payload || typeof payload !== 'object') return payload;
  
  // Deep clone to avoid mutating the original object used by DB/UI
  const sanitized = JSON.parse(JSON.stringify(payload));
  
  if (sanitized.patient) {
    if (sanitized.patient.name) sanitized.patient.name = '[PASIEN]';
    if (sanitized.patient.id) sanitized.patient.id = '[ID_REDACTED]';
    if (sanitized.patient.dateOfBirth) sanitized.patient.dateOfBirth = '1900-01-01'; // Default valid date to avoid schema errors
    // Gender is kept as it is clinically relevant
  }
  
  if (sanitized.encounter?.facility) {
    if (sanitized.encounter.facility.name) sanitized.encounter.facility.name = '[FACILITY_REDACTED]';
  }
  
  if (sanitized.claimId) sanitized.claimId = '[CLAIM_ID_REDACTED]';
  
  // Optionally, we could redact notes if they are free text, but they might contain clinical info.
  // We'll apply text-based redaction to notes just in case.
  if (sanitized.notes) {
    sanitized.notes = sanitizeClinicalText(sanitized.notes);
  }

  return sanitized;
}

// Aggressive recursive redaction for unknown JSON structures
export function sanitizeArbitraryJson(
  json: any,
  redactPatterns: string[] = [],
  safeContextsArr: string[] = []
): any {
  if (!json) return json;
  if (typeof json === 'string') return sanitizeClinicalText(json);
  if (typeof json !== 'object') return json;

  const sanitized = JSON.parse(JSON.stringify(json));
  
  // Create RegExp objects dynamically
  const piiKeyPatterns = redactPatterns.map(pattern => new RegExp(pattern, 'i'));
  const safeContexts = safeContextsArr.map(pattern => new RegExp(pattern, 'i'));

  function stripPii(obj: any) {
    if (!obj || typeof obj !== 'object') return;
    
    if (Array.isArray(obj)) {
      obj.forEach(stripPii);
      return;
    }

    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        if (typeof obj[key] === 'object') {
          stripPii(obj[key]);
          continue;
        }

        const isString = typeof obj[key] === 'string';
        const isPiiKey = piiKeyPatterns.some(regex => regex.test(key));
        const isSafeContext = safeContexts.some(regex => regex.test(key));

        if (isPiiKey && !isSafeContext && isString) {
          obj[key] = '[REDACTED]';
        } else if (isString) {
          obj[key] = sanitizeClinicalText(obj[key]);
        }
      }
    }
  }

  stripPii(sanitized);
  return sanitized;
}
