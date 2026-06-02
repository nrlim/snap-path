import { redirect } from 'next/navigation'
import prisma from '@/lib/db'
import { getCurrentUserPermission } from '@/lib/rbac'
import ThresholdForm from './ThresholdForm'

export default async function ThresholdPage() {
  if (!(await getCurrentUserPermission('CLINICAL_THRESHOLDS'))) {
    redirect('/dashboard')
  }

  const config = await prisma.systemConfig.findUnique({
    where: { id: "GLOBAL_CONFIG" }
  });

  const fallbackConfig = config || {
    aiProvider: "vercel-ai-gateway",
    aiGatewayUrl: "",
    aiModel: "gpt-4o-mini",
    aiMaxTokens: 1500,
    aiTemperature: 0.7,
    thresholdObatPct: 10.0,
    thresholdTindakanPct: 10.0,
    thresholdLosDays: 1
  };

  return (
    <div className="w-full pb-10">
      <ThresholdForm config={fallbackConfig} />
    </div>
  )
}
