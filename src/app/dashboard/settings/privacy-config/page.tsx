import { redirect } from 'next/navigation'
import prisma from '@/lib/db'
import { getAuthenticatedUser, hasPermission, isSuperAdminRole } from '@/lib/rbac'
import PrivacyConfigForm from './PrivacyConfigForm'

export default async function PrivacyConfigPage() {
  const user = await getAuthenticatedUser()
  if (!user || (!hasPermission(user.role, 'AI_ENGINE_CONFIG') && !hasPermission(user.role, 'PRIVACY_CONFIG'))) {
    redirect('/dashboard')
  }

  const globalConfig = await prisma.systemConfig.findUnique({
    where: { id: "GLOBAL_CONFIG" }
  }) || {
    piiRedactPatterns: [],
    piiSafeContexts: []
  };

  const clientConfig = user.clientId && !isSuperAdminRole(user.role)
    ? await prisma.client.findUnique({
        where: { id: user.clientId },
        select: { name: true, piiRedactPatterns: true, piiSafeContexts: true },
      })
    : null;

  if (!isSuperAdminRole(user.role) && !clientConfig) redirect('/dashboard')

  return (
    <div className="w-full pb-10">
      <PrivacyConfigForm 
        initialRedactPatterns={clientConfig ? clientConfig.piiRedactPatterns : globalConfig.piiRedactPatterns} 
        initialSafeContexts={clientConfig ? clientConfig.piiSafeContexts : globalConfig.piiSafeContexts}
        scope={isSuperAdminRole(user.role) ? 'platform' : 'client'}
        scopeName={clientConfig?.name || 'Global SnapPath'}
      />
    </div>
  )
}
