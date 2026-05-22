import prisma from '@/lib/db'
import AIProviderForm from './AIProviderForm'

export default async function AIProviderPage() {
  const config = await prisma.systemConfig.findUnique({
    where: { id: "GLOBAL_CONFIG" }
  }) || {
    aiProvider: "sumopod",
    aiGatewayUrl: "https://api.sumopod.com/v1",
    aiModel: "gpt-4o-mini",
    aiMaxTokens: 1500,
    aiTemperature: 0.7
  };

  return (
    <div className="w-full pb-10">
      <AIProviderForm config={config} />
    </div>
  )
}
