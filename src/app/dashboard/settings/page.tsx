import { redirect } from 'next/navigation'
import { getAuthenticatedUser, hasPermission } from '@/lib/rbac'

export default async function SettingsRedirect() {
  const user = await getAuthenticatedUser()

  if (!user) redirect('/dashboard')
  if (hasPermission(user.role, 'AI_ENGINE_CONFIG')) redirect('/dashboard/settings/ai-provider')
  if (hasPermission(user.role, 'CLIENT_API_KEYS')) redirect('/dashboard/settings/client-api-keys')
  if (hasPermission(user.role, 'CLIENT_CREDITS')) redirect('/dashboard/settings/credits')
  if (hasPermission(user.role, 'PRIVACY_CONFIG')) redirect('/dashboard/settings/privacy-config')
  if (hasPermission(user.role, 'CLINICAL_THRESHOLDS')) redirect('/dashboard/settings/threshold')

  redirect('/dashboard')
}
