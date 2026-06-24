/**
 * Utilities to strip or redact Personal Identifiable Information (PII)
 * from data before sending it to AI providers.
 */

// Pre-compiled regex patterns to prevent ReDoS from dynamic pattern creation
const NIK_PATTERN = /\b\d{16}\b/g;
const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const PHONE_PATTERN = /\b(\+62|62|0)8[1-9][0-9]{6,10}\b/g;

// Cache for validated dynamic patterns (bounded to prevent memory issues)
const patternCache = new Map<string, RegExp>();
const MAX_CACHED_PATTERNS = 100;

function getSafePattern(pattern: string): RegExp | null {
  if (patternCache.has(pattern)) return patternCache.get(pattern)!;

  // Prevent ReDoS: reject overly complex patterns
  if (pattern.length > 100) return null;
  // Reject patterns with nested quantifiers that could cause catastrophic backtracking
  if (/[+*]{2,}|\{[\d,]+\}[+*]|\([^)]*[+*][^)]*\)[+*]/.test(pattern)) return null;

  try {
    const regex = new RegExp(pattern, 'i');
    if (patternCache.size >= MAX_CACHED_PATTERNS) {
      // Evict oldest entry
      const firstKey = patternCache.keys().next().value;
      if (firstKey) patternCache.delete(firstKey);
    }
    patternCache.set(pattern, regex);
    return regex;
  } catch {
    return null;
  }
}

// Basic redaction for text blobs
export function sanitizeClinicalText(text: string): string {
  if (!text || typeof text !== 'string') return text;
  
  let sanitized = text;
  // Redact potential NIKs (16 digits)
  sanitized = sanitized.replace(NIK_PATTERN, '[NIK_REDACTED]');
  // Redact emails
  sanitized = sanitized.replace(EMAIL_PATTERN, '[EMAIL_REDACTED]');
  // Redact phone numbers (Indonesian 08xx / +62)
  sanitized = sanitized.replace(PHONE_PATTERN, '[PHONE_REDACTED]');
  
  return sanitized;
}

// Targeted redaction for known ClaimValidationInput structure
export function sanitizeClaimValidationInput(payload: unknown): unknown {
  if (!payload || typeof payload !== 'object') return payload;
  
  // Deep clone to avoid mutating the original object used by DB/UI
  const sanitized = JSON.parse(JSON.stringify(payload));
  
  if (sanitized.patient) {
    if (sanitized.patient.name) sanitized.patient.name = '[PASIEN]';
    if (sanitized.patient.id) sanitized.patient.id = '[ID_REDACTED]';
    if (sanitized.patient.dateOfBirth) sanitized.patient.dateOfBirth = '1900-01-01';
    // Gender is kept as it is clinically relevant
  }
  
  if (sanitized.encounter?.facility) {
    if (sanitized.encounter.facility.name) sanitized.encounter.facility.name = '[FACILITY_REDACTED]';
  }
  
  if (sanitized.claimId) sanitized.claimId = '[CLAIM_ID_REDACTED]';
  
  // Apply text-based redaction to free-text notes
  if (sanitized.notes && typeof sanitized.notes === 'string') {
    sanitized.notes = sanitizeClinicalText(sanitized.notes);
  }

  return sanitized;
}

// Aggressive recursive redaction for unknown JSON structures
export function sanitizeArbitraryJson(
  json: unknown,
  redactPatterns: string[] = [],
  safeContextsArr: string[] = []
): unknown {
  if (!json) return json;
  if (typeof json === 'string') return sanitizeClinicalText(json);
  if (typeof json !== 'object') return json;

  const sanitized = JSON.parse(JSON.stringify(json));
  
  // Build validated RegExp objects with ReDoS protection
  const piiKeyPatterns = redactPatterns
    .map(p => getSafePattern(p))
    .filter((p): p is RegExp => p !== null);
  const safeContexts = safeContextsArr
    .map(p => getSafePattern(p))
    .filter((p): p is RegExp => p !== null);

  /**
   * Recursively redact PII from a JSON object.
   *
   * @param obj        - The object to sanitize in-place
   * @param depth      - Current recursion depth (guard against stack overflow)
   * @param parentKey  - The key of the parent object that contains `obj`.
   *                     Used to detect "safe contexts" at the parent level so
   *                     that clinical names (diagnoses[].name, medications[].name)
   *                     are NOT redacted even though "name" is a PII key.
   */
  function stripPii(obj: unknown, depth: number = 0, parentKey: string = ''): void {
    // Prevent stack overflow from deeply nested objects
    if (!obj || typeof obj !== 'object' || depth > 20) return;
    
    // Check if the current parent key is itself a safe context
    // e.g. "diagnoses", "medications", "procedures", "drug", etc.
    const parentIsSafeContext = parentKey
      ? safeContexts.some(regex => regex.test(parentKey))
      : false;

    if (Array.isArray(obj)) {
      obj.forEach(item => stripPii(item, depth + 1, parentKey));
      return;
    }

    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        const value = (obj as Record<string, unknown>)[key];

        if (typeof value === 'object') {
          // Pass this key as the parent context for the next level
          stripPii(value, depth + 1, key);
          continue;
        }

        const isString = typeof value === 'string';
        const isPiiKey = piiKeyPatterns.some(regex => regex.test(key));
        const isSafeContext = safeContexts.some(regex => regex.test(key));

        // Redact only if:
        // 1. Key matches a PII pattern
        // 2. Key itself is NOT a safe context
        // 3. Parent object is NOT a safe context (to protect clinical child names)
        if (isPiiKey && !isSafeContext && !parentIsSafeContext && isString) {
          (obj as Record<string, unknown>)[key] = '[REDACTED]';
        } else if (isString) {
          (obj as Record<string, unknown>)[key] = sanitizeClinicalText(value);
        }
      }
    }
  }

  stripPii(sanitized);
  return sanitized;
}
