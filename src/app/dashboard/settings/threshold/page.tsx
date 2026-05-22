import prisma from '@/lib/db'
import ThresholdForm from './ThresholdForm'

export default async function ThresholdPage() {
  const config = await prisma.systemConfig.findUnique({
    where: { id: "GLOBAL_CONFIG" }
  }) || {
    aiProvider: "sumopod",
    aiGatewayUrl: "https://api.sumopod.com/v1",
    aiModel: "gpt-4o-mini",
    aiMaxTokens: 1500,
    aiTemperature: 0.7,
    thresholdObatPct: 10.0,
    thresholdTindakanPct: 10.0,
    thresholdLosDays: 1
  };

  return (
    <div className="w-full pb-10">
      <ThresholdForm config={config} />
    </div>
  )
}
