import { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import DashboardShell from '@/components/dashboard/DashboardShell'
import { getAuthenticatedUser } from '@/lib/rbac'

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const user = await getAuthenticatedUser()

  if (!user) {
    redirect('/login')
  }

  return (
    <DashboardShell userEmail={user.email} userRole={user.role}>
      {children}
    </DashboardShell>
  )
}
