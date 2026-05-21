import { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import DashboardShell from '@/components/dashboard/DashboardShell'
import { getSession } from '@/lib/auth'

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const session = await getSession()

  if (!session) {
    redirect('/login')
  }

  return (
    <DashboardShell userEmail={typeof session.email === 'string' ? session.email : undefined}>
      {children}
    </DashboardShell>
  )
}
