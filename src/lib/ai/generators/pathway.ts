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
      phaseName: /discharge|pulang/i.test(phase.phaseName || '') ? phase.phaseName : `${phase.phaseName || 'Treatment Plan'} & Discharge`,
    };
  });
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
    const { data } = await gateway.generateClinicalPathway(
      diagnosisCode, 
      diagnosisName || "Unknown Diagnosis"
    );

    // Save the generated pathway to DB so it can be reviewed and used as template next time
    const newPathway = await prisma.clinicalPathway.create({
      data: {
        diagnosisCode,
        diagnosisName: diagnosisName || "Unknown Diagnosis",
        providerType: providerType || null,
        pathwayVersion: "1.0-ai",
        phases: ensurePhasesCoverLos(data.phases as ClinicalPathwayPhase[], data.estimatedLos) as unknown as Prisma.InputJsonValue,
        estimatedLos: data.estimatedLos,
        generatedBy: "AI",
        isActive: false // Keep it inactive until a human medical reviewer approves it
      }
    });

    return {
      jobId,
      diagnosisCode: newPathway.diagnosisCode,
      diagnosisName: newPathway.diagnosisName,
      pathwayVersion: newPathway.pathwayVersion,
      estimatedLos: newPathway.estimatedLos || 0,
      phases: ensurePhasesCoverLos(newPathway.phases as unknown as ClinicalPathwayPhase[], newPathway.estimatedLos || 0),
      totalEstimatedCost: newPathway.totalEstCost,
      generatedBy: "AI",
      confidence: 0.85 // AI generated confidence
    };

  } catch (error) {
    // Log the real underlying cause (Zod validation error, network error, model error, etc.)
    const cause = error instanceof Error ? error : new Error(String(error));
    console.error(`[generateClinicalPathway] Failed to generate pathway for ${diagnosisCode}. Cause:`, cause.message, cause);
    // Return null — the workflow step will handle this gracefully
    return null;
  }
}
