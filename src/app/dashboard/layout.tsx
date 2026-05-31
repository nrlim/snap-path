import { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import DashboardShell from '@/components/dashboard/DashboardShell'
import prisma from '@/lib/db'
import { getAuthenticatedUser, isPlatformAdminRole } from '@/lib/rbac'

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const user = await getAuthenticatedUser()

  if (!user) {
    redirect('/login')
  }

  const isSuperAdmin = user.role === 'SUPER_ADMIN'
  const requestBalance = isSuperAdmin
    ? 0
    : isPlatformAdminRole(user.role)
      ? (await prisma.client.aggregate({ _sum: { requestBalance: true } }))._sum.requestBalance ?? 0
      : user.clientId
        ? (await prisma.client.findUnique({ where: { id: user.clientId }, select: { requestBalance: true } }))?.requestBalance ?? 0
        : 0

  return (
    <DashboardShell userEmail={user.email} userRole={user.role} requestBalance={requestBalance} requestQuotaLabel={isSuperAdmin ? '∞' : undefined}>
      {children}
    </DashboardShell>
  )
}
