import prisma from '@/lib/db';
import { ClinicalPathwayInput, ClinicalPathwayOutput, ClinicalPathwayPhase } from '../types';
import { getAIGateway } from '../gateway';
import type { Prisma } from '@/generated/prisma/client';

function getLastDayFromRange(dayRange?: string | null): number | null {
  if (!dayRange) return null;
  const matches = String(dayRange).match(/\d+/g);
  if (!matches || matches.length === 0) return null;
  return Number(matches[matches.length - 1]);
}

function ensurePhasesCoverLos(phases: ClinicalPathwayPhase[], estimatedLos: number): ClinicalPathwayPhase[] {
  if (!estimatedLos || estimatedLos <= 0 || phases.length === 0) return phases;

  const normalized = phases.map((phase, index) => ({
    ...phase,
    dayRange: phase.dayRange || `Day ${index + 1}`,
  }));

  const lastPhase = normalized[normalized.length - 1];
  const lastCoveredDay = getLastDayFromRange(lastPhase.dayRange);
  if (lastCoveredDay && lastCoveredDay >= estimatedLos) return normalized;

  return normalized.map((phase, index) => {
    if (index !== normalized.length - 1) return phase;
    return {
      ...phase,
      dayRange: normalized.length === 1 ? `Day 1-${estimatedLos}` : `Day ${lastCoveredDay || index + 1}-${estimatedLos}`,
      phaseName: /discharge|pulang/i.test(phase.phaseName || '') ? phase.phaseName : `${phase.phaseName || 'Rencana Terapi'} & Pulang`,
    };
  });
}

async function persistPathwayResult(
  pathway: ClinicalPathwayOutput,
  providerType?: string | null,
  isActive = false,
): Promise<ClinicalPathwayOutput> {
  const normalizedPhases = ensurePhasesCoverLos(pathway.phases, pathway.estimatedLos);
  const savedPathway = await prisma.clinicalPathway.create({
    data: {
      diagnosisCode: pathway.diagnosisCode,
      diagnosisName: pathway.diagnosisName,
      providerType: providerType || null,
      pathwayVersion: pathway.pathwayVersion,
      phases: normalizedPhases as unknown as Prisma.InputJsonValue,
      estimatedLos: pathway.estimatedLos,
      totalEstCost: pathway.totalEstimatedCost,
      generatedBy: pathway.generatedBy,
      isActive,
    },
  });

  return {
    ...pathway,
    diagnosisCode: savedPathway.diagnosisCode,
    diagnosisName: savedPathway.diagnosisName,
    pathwayVersion: savedPathway.pathwayVersion,
    estimatedLos: savedPathway.estimatedLos || pathway.estimatedLos,
    phases: ensurePhasesCoverLos(savedPathway.phases as unknown as ClinicalPathwayPhase[], savedPathway.estimatedLos || pathway.estimatedLos),
    totalEstimatedCost: savedPathway.totalEstCost,
  };
}

function buildFallbackPathway(input: ClinicalPathwayInput, jobId: string): ClinicalPathwayOutput {
  const diagnosisName = input.diagnosisName || 'Diagnosis tidak diketahui';
  const isOutpatient = input.encounterType === 'RAWAT_JALAN';
  const estimatedLos = isOutpatient ? 1 : 3;

  const phases: ClinicalPathwayPhase[] = estimatedLos === 1
    ? [{
      phaseId: 'fallback-day-1',
      phaseName: 'Asesmen, Terapi, dan Rencana Pulang',
      dayRange: 'Day 1',
      objectives: [
        `Konfirmasi kondisi klinis utama terkait ${diagnosisName}.`,
        'Stabilisasi gejala, pemberian terapi awal, dan penentuan kebutuhan kontrol atau rawat lanjut.',
      ],
      assessments: [
        { name: 'Anamnesis dan pemeriksaan fisik terarah', frequency: 'Saat kunjungan', mandatory: true },
        { name: 'Pemantauan tanda vital', frequency: 'Sesuai kondisi klinis', mandatory: true },
      ],
      treatments: [
        { name: 'Terapi suportif sesuai diagnosis dan kondisi pasien', mandatory: true },
        { name: 'Rencana tindak lanjut atau rujukan bila ada tanda bahaya', mandatory: true },
      ],
      medications: [],
      nursing: [{ activity: 'Edukasi tanda bahaya dan kepatuhan terapi', frequency: 'Sebelum pulang' }],
      nutrition: { diet: 'Diet sesuai kondisi klinis', restrictions: [] },
      education: ['Jelaskan diagnosis kerja, rencana terapi, tanda bahaya, dan jadwal kontrol.'],
      dischargeGate: { criteria: ['Kondisi stabil', 'Instruksi pulang dan kontrol dipahami pasien/keluarga'], mustMeetAll: true },
    }]
    : [
      {
        phaseId: 'fallback-admission',
        phaseName: 'Admisi dan Stabilisasi',
        dayRange: 'Day 1',
        objectives: [`Konfirmasi diagnosis ${diagnosisName}.`, 'Stabilisasi kondisi awal dan tetapkan rencana terapi.'],
        assessments: [
          { name: 'Anamnesis, pemeriksaan fisik, dan review faktor risiko', frequency: 'Saat admisi', mandatory: true },
          { name: 'Pemantauan tanda vital', frequency: 'Minimal tiap shift atau sesuai kondisi', mandatory: true },
        ],
        treatments: [{ name: 'Tatalaksana awal sesuai pathway klinis dan kondisi pasien', mandatory: true }],
        medications: [],
        nursing: [{ activity: 'Pemantauan kondisi umum dan respons terapi', frequency: 'Tiap shift' }],
        nutrition: { diet: 'Diet rumah sakit sesuai kondisi klinis', restrictions: [] },
        education: ['Jelaskan rencana perawatan dan target stabilisasi kepada pasien/keluarga.'],
      },
      {
        phaseId: 'fallback-treatment',
        phaseName: 'Terapi dan Monitoring',
        dayRange: `Day 2-${estimatedLos - 1}`,
        objectives: ['Optimalkan terapi, monitoring respons, dan cegah komplikasi.'],
        assessments: [{ name: 'Evaluasi klinis harian dan respons terapi', frequency: 'Harian', mandatory: true }],
        treatments: [{ name: 'Lanjutkan terapi definitif dan suportif sesuai evaluasi dokter', mandatory: true }],
        medications: [],
        nursing: [{ activity: 'Dokumentasi respons terapi dan keluhan pasien', frequency: 'Tiap shift' }],
        nutrition: { diet: 'Diet sesuai kebutuhan klinis', restrictions: [] },
        education: ['Perkuat edukasi kepatuhan terapi dan persiapan pulang.'],
      },
      {
        phaseId: 'fallback-discharge',
        phaseName: 'Evaluasi Pulang',
        dayRange: `Day ${estimatedLos}`,
        objectives: ['Pastikan pasien stabil dan siap melanjutkan perawatan rawat jalan.'],
        assessments: [{ name: 'Evaluasi kriteria pulang', frequency: 'Sebelum pulang', mandatory: true }],
        treatments: [{ name: 'Finalisasi rencana pulang dan kontrol', mandatory: true }],
        medications: [],
        nursing: [{ activity: 'Edukasi pulang dan verifikasi pemahaman pasien/keluarga', frequency: 'Sebelum pulang' }],
        nutrition: { diet: 'Diet sesuai anjuran pulang', restrictions: [] },
        education: ['Jelaskan obat pulang, kontrol, tanda bahaya, dan kapan harus kembali ke fasilitas kesehatan.'],
        dischargeGate: { criteria: ['Tanda vital stabil', 'Keluhan membaik atau terkendali', 'Rencana kontrol tersedia'], mustMeetAll: true },
      },
    ];

  return {
    jobId,
    diagnosisCode: input.diagnosisCode,
    diagnosisName,
    pathwayVersion: '1.0-fallback',
    estimatedLos,
    phases: ensurePhasesCoverLos(phases, estimatedLos),
    totalEstimatedCost: null,
    generatedBy: 'HYBRID',
    confidence: 0.45,
  };
}

export async function generateClinicalPathway(input: ClinicalPathwayInput, jobId: string): Promise<ClinicalPathwayOutput | null> {
  const { diagnosisCode, diagnosisName, providerType } = input;

  // 1. Check for existing template in DB
  const existingPathways = await prisma.clinicalPathway.findMany({
    where: {
      diagnosisCode: diagnosisCode,
      isActive: true,
      OR: [
        { providerType: providerType || null },
        { providerType: null } // fallback to universal
      ]
    },
    orderBy: {
      providerType: 'asc' // prioritize specific over universal if array is sorted this way (nulls last depends on DB)
    }
  });

  // Simple selection: pick specific providerType if exists, else universal
  let selectedTemplate = existingPathways.find(p => p.providerType === providerType);
  if (!selectedTemplate && existingPathways.length > 0) {
    selectedTemplate = existingPathways[0];
  }

  if (selectedTemplate) {
    return {
      jobId,
      diagnosisCode: selectedTemplate.diagnosisCode,
      diagnosisName: selectedTemplate.diagnosisName,
      pathwayVersion: selectedTemplate.pathwayVersion,
      estimatedLos: selectedTemplate.estimatedLos || 0,
      phases: ensurePhasesCoverLos(selectedTemplate.phases as unknown as ClinicalPathwayPhase[], selectedTemplate.estimatedLos || 0),
      totalEstimatedCost: selectedTemplate.totalEstCost,
      generatedBy: "TEMPLATE",
      confidence: 1.0
    };
  }

  // 2. Fallback to AI generation
  const gateway = await getAIGateway({ clientId: input.clientId, providerId: input.providerId, jobId });
  
  try {
    const aiTimeoutMs = 30_000;
    const aiResultPromise = gateway.generateClinicalPathway(
      diagnosisCode,
      diagnosisName || "Unknown Diagnosis"
    );

    const { data } = await Promise.race([
      aiResultPromise,
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error(`AI clinical pathway generation timed out after ${aiTimeoutMs}ms`)), aiTimeoutMs);
      }),
    ]);

    // Save the generated pathway to DB so it can be reviewed and used as template next time
    return await persistPathwayResult({
      jobId,
      diagnosisCode,
      diagnosisName: diagnosisName || "Unknown Diagnosis",
      pathwayVersion: "1.0-ai",
      estimatedLos: data.estimatedLos,
      phases: ensurePhasesCoverLos(data.phases as ClinicalPathwayPhase[], data.estimatedLos),
      totalEstimatedCost: null,
      generatedBy: "AI",
      confidence: 0.85,
    }, providerType, false);

  } catch (error) {
    const fallback = buildFallbackPathway(input, jobId);
    try {
      return await persistPathwayResult(fallback, providerType, false);
    } catch {
      return fallback;
    }
  }
}
