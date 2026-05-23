# Clinical Pathway Data Contract & Implementation Guide

> **Wajib dibaca sebelum mengubah fitur Clinical Pathway, Claim Validation, Fees & Drugs, AI Usage Logs, atau scoring.**
>
> Tujuan dokumen ini adalah mencegah agent/developer salah mengambil key data, mengganti field yang sudah berjalan, atau membuat result UI menjadi kosong/keliru.

---

## 1. Prinsip utama

1. **Jangan mengubah nama field output yang sudah dipakai UI** tanpa update semua consumer.
2. **Wizard input, validator, workflow aggregator, dan result viewer punya kontrak field yang harus konsisten.**
3. **Field harga input dari form bisa memakai `price`; validator/output wajib normalize ke `unitPrice`, `totalPrice`, `claimedUnitPrice`, `claimedTotal`.**
4. **Clinical pathway timeline boleh group hari**, selama `dayRange` menutup seluruh `estimatedLos`.
5. **Score harus menjelaskan penyebab minus secara eksplisit** dan tidak mencampur issue harga dengan issue master data tidak terdaftar.
6. **AI usage logs hanya untuk request AI**, bukan request API biasa.

---

## 2. End-to-end flow Clinical Pathway

```text
PathwayWizard
  -> /api/v1/claims/validate
  -> claim-validation workflow steps
  -> validators/generators
  -> aggregateAndSaveStep
  -> ClaimJob.outputResult
  -> PathwayResultViewer
```

### File utama

| Area | File |
| --- | --- |
| Input wizard | `src/app/dashboard/clinical-pathway/components/PathwayWizard.tsx` |
| Result UI | `src/app/dashboard/clinical-pathway/components/PathwayResultViewer.tsx` |
| Timeline UI | `src/app/dashboard/clinical-pathway/components/PathwayTimeline.tsx` |
| Workflow aggregation | `src/workflows/claim-validation/steps.ts` |
| Tariff validator | `src/lib/ai/validators/tariff.ts` |
| Drug validator | `src/lib/ai/validators/drug-price.ts` |
| Diagnosis validator | `src/lib/ai/validators/diagnosis.ts` |
| Document validator | `src/lib/ai/validators/document.ts` |
| Pathway generator | `src/lib/ai/generators/pathway.ts` |
| AI gateway | `src/lib/ai/gateway.ts` |
| AI driver/prompt | `src/lib/ai/drivers/openai.ts` |
| API docs | `public/swagger.json`, `src/app/api-docs/page.tsx`, `src/app/api-docs/ScalarDocs.tsx` |

---

## 3. Input contract dari PathwayWizard

`PathwayWizard` menerima input user dan saat submit harus mengirim payload yang sudah dinormalisasi.

### Procedure input di form

Form bisa menyimpan procedure seperti ini:

```ts
{
  code: string;
  name?: string;
  description?: string;
  quantity: number;
  price?: number;       // input UI
  unitPrice?: number;   // normalized
  totalPrice?: number;  // normalized
}
```

### Medication input di form

```ts
{
  name: string;
  genericName?: string;
  quantity: number;
  price?: number;       // input UI
  unitPrice?: number;   // normalized
  totalPrice?: number;  // normalized
}
```

### Submit normalization wajib

Sebelum dikirim ke API, wizard wajib menghasilkan:

```ts
procedures: procedures.map(proc => ({
  ...proc,
  description: proc.description || proc.name || proc.procedureName || proc.code,
  unitPrice: proc.unitPrice ?? proc.price ?? 0,
  totalPrice: proc.totalPrice ?? ((proc.unitPrice ?? proc.price ?? 0) * (proc.quantity || 1)),
}))

medications: medications.map(med => ({
  ...med,
  unitPrice: med.unitPrice ?? med.price ?? 0,
  totalPrice: med.totalPrice ?? ((med.unitPrice ?? med.price ?? 0) * (med.quantity || 1)),
}))
```

**Jangan hapus normalization ini.** Kalau dihapus, Fees & Drugs bisa menampilkan total claim kosong dan validator bisa salah memberi status `Compliant`.

---

## 4. Tariff validator contract

File: `src/lib/ai/validators/tariff.ts`

### Input yang harus didukung

Validator harus menerima variasi field berikut:

| Meaning | Field fallback |
| --- | --- |
| Unit price | `unitPrice`, `price`, `claimedUnitPrice` |
| Total price | `totalPrice`, `claimedTotal`, `claimedPrice`, atau `unitPrice * quantity` |
| Name/description | `description`, `name`, `procedureName`, `code` |

### Output item tariff

```ts
{
  code: string;
  description: string;       // nama tindakan untuk UI
  quantity: number;
  claimedUnitPrice: number;
  claimedTotal: number;
  masterBasePrice: number;
  masterMaxPrice: number;
  expectedTotal: number;
  status: "WITHIN_RANGE" | "OVER_THRESHOLD" | "UNDER_PRICED" | "NOT_FOUND";
  variancePct: number;
  notes: string;
}
```

### Status tariff

| Status | Meaning |
| --- | --- |
| `WITHIN_RANGE` | Claimed total masih dalam threshold master tariff. |
| `OVER_THRESHOLD` | Claimed total melewati master max + threshold. |
| `UNDER_PRICED` | Claimed total jauh di bawah referensi (saat ini `< -20%`). |
| `NOT_FOUND` | Procedure tidak ada di master tariff. Ini bukan price compliance; ini masuk scoring `Kesiapan master data`. |

### Important

- `NOT_FOUND` tidak boleh dianggap `Compliant`.
- `UNDER_PRICED` tidak boleh dianggap `Compliant`.
- UI Fees & Drugs harus menampilkan **nama tindakan**, bukan kode sebagai title utama.

---

## 5. Drug price validator contract

File: `src/lib/ai/validators/drug-price.ts`

### Input yang harus didukung

| Meaning | Field fallback |
| --- | --- |
| Unit price | `unitPrice`, `price`, `claimedUnitPrice` |
| Total price | `totalPrice`, `claimedTotal`, atau `unitPrice * quantity` |
| Name | `name`, `medicationName` |

### Output item drug

```ts
{
  name: string;
  genericName: string | null;
  quantity: number;
  claimedUnitPrice: number;
  claimedTotal: number;
  marketPriceMax: number;
  marketPriceMaxWithThreshold: number;
  expectedTotal: number;
  status: "WITHIN_RANGE" | "OVER_THRESHOLD" | "UNDER_PRICED" | "NOT_FOUND" | "CACHE_HIT";
  variancePct: number;
  sources: string[];
  cachedAt: string | null;
}
```

### Status drug

| Status | Meaning |
| --- | --- |
| `WITHIN_RANGE` | Claimed unit price masih dalam threshold market reference. |
| `OVER_THRESHOLD` | Claimed unit price melewati market max + threshold. |
| `UNDER_PRICED` | Claimed unit price jauh di bawah market reference (`variancePct < -20`). |
| `NOT_FOUND` | Obat tidak ditemukan di cache/reference/AI estimate. Masuk scoring `Kesiapan master data`. |
| `CACHE_HIT` | Referensi harga berasal dari cache. |

### Important negative case

Jika:

```text
claimedUnitPrice = 75.000
marketPriceMaxWithThreshold = 150.000
variancePct = -50%
```

Status harus `UNDER_PRICED`, bukan `WITHIN_RANGE`.

---

## 6. Clinical pathway generator & LOS contract

File: `src/lib/ai/generators/pathway.ts`

### Source priority

1. Pakai template `ClinicalPathway` dari DB jika tersedia dan active.
2. Jika tidak ada template, fallback ke AI generation.

### Output pathway

```ts
{
  jobId: string;
  diagnosisCode: string;
  diagnosisName: string;
  pathwayVersion: string;
  estimatedLos: number;
  phases: ClinicalPathwayPhase[];
  totalEstimatedCost: number | null;
  generatedBy: "AI" | "TEMPLATE" | "HYBRID";
  confidence: number;
}
```

### Phase contract

```ts
{
  phaseId: string;
  phaseName: string; // title klinis saja: Admission, Treatment, Monitoring, Discharge
  dayRange: string;  // Day 1, Day 2-4, Day 5-7
  objectives: string[];
  assessments: Array<{ name: string; frequency: string; mandatory: boolean }>;
  treatments: Array<{ name: string; route?: string | null; mandatory: boolean }>;
  medications: Array<{ name: string; dosage: string; frequency: string; route: string; duration: string; mandatory: boolean }>;
  nursing: Array<{ activity: string; frequency: string }>;
  nutrition: { diet: string; restrictions?: string[] | null };
  education: string[];
  dischargeGate?: { criteria: string[]; mustMeetAll: boolean } | null;
}
```

### LOS and timeline behavior

- Timeline **boleh grouping days**.
- Contoh valid untuk `estimatedLos = 7`:

```text
Day 1 - Admission
Day 2-4 - Treatment
Day 5-6 - Monitoring
Day 7 - Discharge
```

- Backend wajib memastikan phase terakhir mencakup `estimatedLos`.
- Jika AI hanya mengembalikan sampai `Day 4` untuk `estimatedLos = 7`, backend harus memperluas final `dayRange` sampai `Day 7`.
- Jangan paksa 1 phase per hari jika grouping lebih clinically readable.

---

## 7. Timeline UI contract

File: `src/app/dashboard/clinical-pathway/components/PathwayTimeline.tsx`

### Title format

Timeline title harus:

```text
[dayRange] - [phaseName]
```

Contoh:

```text
Day 1 - Admission
Day 2-4 - Treatment
Day 5-6 - Monitoring
Day 7 - Discharge
```

### Jangan lakukan

- Jangan ubah semua title menjadi single-day sequential kalau AI/DB memberi group day yang valid.
- Jangan tampilkan `Day 0` ke user. Normalize menjadi `Day 1`.
- Jangan membuat title seperti `Day 1-2 - Day 1-2`.

---

## 8. Score breakdown contract

Scoring dihitung di `aggregateAndSaveStep` dan disimpan di `outputResult.scoreBreakdown`.

### Current scoring parameters

| Code | Label | Max deduction | Trigger |
| --- | --- | ---: | --- |
| `DIAGNOSIS_TREATMENT` | Diagnosis & tindakan klinis | 25 | `diagnosisValidation.isValid === false` |
| `TARIFF` | Tarif tindakan terdaftar | 20 | Registered tariff item over threshold / invalid |
| `DRUG_PRICE` | Harga obat terdaftar | 20 | Registered drug item over threshold / invalid |
| `DOCUMENT` | Kelengkapan dokumen | 10 | `documentValidation.isValid === false` |
| `LOS` | LOS compliance | 10 | actual LOS missing while AI LOS exists, or actual LOS > expected LOS |
| `UNREGISTERED_MASTER_DATA` | Kesiapan master data | 15 | tariff/drug item `NOT_FOUND` |

### Why separated?

- `Tarif tindakan terdaftar` dan `Harga obat terdaftar` hanya menilai item yang punya referensi harga.
- Item tanpa referensi harga tidak boleh dicampur ke price compliance.
- Item tanpa referensi masuk ke `Kesiapan master data`.
- LOS berdiri sendiri karena bukan price validation.

---

## 9. Result viewer contract

File: `src/app/dashboard/clinical-pathway/components/PathwayResultViewer.tsx`

### AI Outcome & Validation Summary

Harus menampilkan:

- Overall score
- Status
- Score breakdown dari `result.scoreBreakdown.items` jika tersedia
- Fallback score breakdown untuk result lama
- Validasi obat & tindakan pass rate
- LOS row
- Dokumen row
- Catatan varians/outcome

### Fees & Drugs

Total claim harus fallback ke input payload bila output validator tidak lengkap.

Procedure claim fallback:

```ts
claimedTotal ?? claimedPrice ?? totalPrice ?? inputPayload.procedures[].totalPrice ?? unitPrice * quantity
```

Drug claim fallback:

```ts
claimedTotal ?? totalPrice ?? inputPayload.medications[].totalPrice ?? unitPrice * quantity
```

### Procedure title display

- Tampilkan nama tindakan (`description`, `name`, `procedureName`).
- Jangan tampilkan code sebagai title utama.
- Code boleh dipakai hanya untuk matching/fallback internal, bukan label utama jika nama tersedia.

---

## 10. API key & client contract

### Client vs Provider

- `Client` = customer/tenant SnapPath yang memakai API service.
- `Provider` = provider klaim/tarif/asuransi/master data di bawah client.
- 1 client bisa punya banyak provider.
- 1 client bisa punya banyak API key/secret per environment.

### API credential storage

- `keyHash` dan `secretHash` untuk validasi.
- `keyCipher` dan `secretCipher` untuk controlled dashboard copy.
- Key lama yang dibuat sebelum cipher tersedia tidak bisa ditampilkan ulang.

---

## 11. AI usage logs contract

File: `src/app/dashboard/settings/ai-usage-logs/page.tsx`

- Hanya tampilkan `requestType: "AI"`.
- Tujuan utama: estimasi biaya per AI request/workflow.
- Jangan campur dengan request API biasa seperti polling status, list tariff, dll.
- Token yang dicatat:
  - `inputTokens`
  - `outputTokens`
  - `totalTokens`
  - `aiModel`
  - `aiProvider`
  - `jobId`
  - `clientId`

---

## 12. Safe-change checklist untuk agent

Sebelum mengubah clinical pathway/validation:

1. Baca dokumen ini penuh.
2. Identifikasi producer dan consumer field.
3. Jangan rename field tanpa update semua consumer.
4. Jalankan minimal:

```bash
npx tsc --noEmit --pretty false
npm run build
```

5. Untuk perubahan Swagger:

```bash
python -m json.tool public/swagger.json > /tmp/swagger.valid.json
```

6. Test negative cases:
   - price > threshold => `OVER_THRESHOLD`
   - price < -20% reference => `UNDER_PRICED`
   - procedure/drug missing reference => `NOT_FOUND` and scoring `Kesiapan master data`
   - LOS actual missing with AI LOS available => scoring `LOS compliance` minus
   - estimatedLos 7 with grouped phases => final dayRange covers Day 7
