import prisma from '@/lib/db'

const DEFAULT_PRICING = { inputPerMillion: 0.15, outputPerMillion: 0.6 }
const MODEL_PRICING: Record<string, { inputPerMillion: number; outputPerMillion: number }> = {
  'gpt-4o-mini': { inputPerMillion: 0.15, outputPerMillion: 0.6 },
  'gpt-4o': { inputPerMillion: 2.5, outputPerMillion: 10 },
  'gpt-4.1-mini': { inputPerMillion: 0.4, outputPerMillion: 1.6 },
  'gpt-4.1': { inputPerMillion: 2, outputPerMillion: 8 },
}

function getPricing(model: string | null | undefined) {
  if (!model) return DEFAULT_PRICING
  return MODEL_PRICING[model] || DEFAULT_PRICING
}

export function estimateAIUsageCredit({
  aiModel,
  inputTokens,
  outputTokens,
}: {
  aiModel?: string | null
  inputTokens: number
  outputTokens: number
}) {
  const pricing = getPricing(aiModel)
  return ((inputTokens / 1_000_000) * pricing.inputPerMillion) + ((outputTokens / 1_000_000) * pricing.outputPerMillion)
}

export async function assertClientHasCredit(clientId: string | null | undefined) {
  if (!clientId) return { success: false as const, balance: 0 }

  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { isActive: true, creditBalance: true },
  })

  return {
    success: Boolean(client?.isActive && client.creditBalance > 0),
    balance: client?.creditBalance ?? 0,
  } as const
}

export async function assertClientHasRequestQuota(clientId: string | null | undefined) {
  if (!clientId) return { success: false as const, balance: 0 }

  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { isActive: true, requestBalance: true },
  })

  return {
    success: Boolean(client?.isActive && client.requestBalance > 0),
    balance: client?.requestBalance ?? 0,
  } as const
}

export async function debitClientRequestUsage({
  clientId,
  jobId,
  description = 'Clinical Pathway request usage',
}: {
  clientId: string | null | undefined
  jobId?: string | null
  description?: string
}) {
  if (!clientId) return { success: true as const, debited: 0, balanceAfter: null }

  return prisma.$transaction(async (tx) => {
    const debit = await tx.client.updateMany({
      where: { id: clientId, isActive: true, requestBalance: { gt: 0 } },
      data: { requestBalance: { decrement: 1 } },
    })

    if (debit.count === 0) {
      const client = await tx.client.findUnique({
        where: { id: clientId },
        select: { requestBalance: true },
      })
      return { success: false as const, debited: 0, balanceAfter: client?.requestBalance ?? 0 }
    }

    const updated = await tx.client.findUnique({
      where: { id: clientId },
      select: { requestBalance: true },
    })

    await tx.requestLedger.create({
      data: {
        clientId,
        amount: -1,
        balanceAfter: updated?.requestBalance ?? 0,
        type: 'USAGE',
        description,
        jobId: jobId || null,
      },
    })

    return { success: true as const, debited: 1, balanceAfter: updated?.requestBalance ?? 0 }
  })
}

export async function debitClientCreditUsage({
  clientId,
  amount,
  jobId,
  operation,
}: {
  clientId: string | null | undefined
  amount: number
  jobId?: string | null
  operation?: string | null
}) {
  if (!clientId || !Number.isFinite(amount) || amount <= 0) return { success: true as const, debited: 0, balanceAfter: null }

  return prisma.$transaction(async (tx) => {
    const client = await tx.client.findUnique({
      where: { id: clientId },
      select: { creditBalance: true, isActive: true },
    })

    if (!client?.isActive || client.creditBalance <= 0) {
      return { success: false as const, debited: 0, balanceAfter: client?.creditBalance ?? 0 }
    }

    // Prevent negative balance at DB level. If a request costs slightly more than the remaining
    // credit, consume the remaining balance and let the next request be blocked by preflight.
    const debitAmount = Math.min(client.creditBalance, amount)
    const updated = await tx.client.update({
      where: { id: clientId },
      data: { creditBalance: { decrement: debitAmount } },
      select: { creditBalance: true },
    })

    await tx.creditLedger.create({
      data: {
        clientId,
        amount: -debitAmount,
        balanceAfter: updated.creditBalance,
        type: 'USAGE',
        description: operation ? `AI usage: ${operation}` : 'AI usage',
        jobId: jobId || null,
      },
    })

    return { success: true as const, debited: debitAmount, balanceAfter: updated.creditBalance }
  })
}
