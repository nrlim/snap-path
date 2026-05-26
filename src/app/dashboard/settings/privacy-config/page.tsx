import { redirect } from 'next/navigation'
import prisma from '@/lib/db'
import { getCurrentUserPermission } from '@/lib/rbac'
import PrivacyConfigForm from './PrivacyConfigForm'

export default async function PrivacyConfigPage() {
  if (!(await getCurrentUserPermission('AI_ENGINE_CONFIG'))) {
    redirect('/dashboard')
  }

  const config = await prisma.systemConfig.findUnique({
    where: { id: "GLOBAL_CONFIG" }
  }) || {
    piiRedactPatterns: [],
    piiSafeContexts: []
  };

  return (
    <div className="w-full pb-10">
      <PrivacyConfigForm 
        initialRedactPatterns={config.piiRedactPatterns} 
        initialSafeContexts={config.piiSafeContexts} 
      />
    </div>
  )
}
