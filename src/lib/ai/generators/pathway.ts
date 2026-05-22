import prisma from '@/lib/db';
import { ClinicalPathwayInput, ClinicalPathwayOutput, ClinicalPathwayPhase } from '../types';
import { getAIGateway } from '../gateway';

export async function generateClinicalPathway(input: ClinicalPathwayInput, jobId: string): Promise<ClinicalPathwayOutput> {
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
      phases: selectedTemplate.phases as unknown as ClinicalPathwayPhase[],
      totalEstimatedCost: selectedTemplate.totalEstCost,
      generatedBy: "TEMPLATE",
      confidence: 1.0
    };
  }

  // 2. Fallback to AI generation
  const gateway = await getAIGateway();
  
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
        phases: data.phases,
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
      phases: newPathway.phases as unknown as ClinicalPathwayPhase[],
      totalEstimatedCost: newPathway.totalEstCost,
      generatedBy: "AI",
      confidence: 0.85 // AI generated confidence
    };

  } catch (error) {
    console.error(`Failed to generate clinical pathway for ${diagnosisCode}:`, error);
    throw new Error(`Unable to generate clinical pathway for diagnosis: ${diagnosisCode}`);
  }
}
