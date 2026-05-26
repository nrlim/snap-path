import { redirect } from 'next/navigation'
import prisma from '@/lib/db'
import { getCurrentUserPermission } from '@/lib/rbac'
import AIProviderForm from './AIProviderForm'

export default async function AIProviderPage() {
  if (!(await getCurrentUserPermission('AI_ENGINE_CONFIG'))) {
    redirect('/dashboard')
  }

  const config = await prisma.systemConfig.findUnique({
    where: { id: "GLOBAL_CONFIG" }
  }) || {
    aiProvider: "vercel-ai-gateway",
    aiGatewayUrl: "",
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
