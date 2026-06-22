import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { z } from 'zod';
import { getAuthenticatedUser } from '@/lib/rbac';

const policyRuleUpdateSchema = z.object({
  clientId: z.string().nullable().optional(),
  policyProductCode: z.string().nullable().optional(),
  ruleCode: z.string().optional(),
  ruleName: z.string().optional(),
  ruleType: z.string().optional(),
  targetType: z.string().nullable().optional(),
  targetCode: z.string().nullable().optional(),
  targetPattern: z.string().nullable().optional(),
  conditionJson: z.unknown().optional(),
  actionJson: z.unknown().optional(),
  severity: z.string().optional(),
  recommendation: z.string().nullable().optional(),
  effectiveFrom: z.string().datetime().optional().or(z.date()),
  effectiveTo: z.string().datetime().nullable().optional().or(z.date().nullable()),
  status: z.string().optional(),
});

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthenticatedUser();
    if (!user || (user.role !== 'SUPER_ADMIN' && user.role !== 'CLIENT_ADMIN')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;
    
    const existingRule = await prisma.policyRule.findUnique({ where: { id } });
    if (!existingRule) {
      return NextResponse.json({ error: 'Not Found' }, { status: 404 });
    }
    
    if (user.role === 'CLIENT_ADMIN' && existingRule.clientId !== user.clientId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const json = await request.json();
    const body = policyRuleUpdateSchema.parse(json);
    
    const updateData: any = { ...body };
    if (updateData.effectiveFrom) updateData.effectiveFrom = new Date(updateData.effectiveFrom);
    if (updateData.effectiveTo !== undefined) {
      updateData.effectiveTo = updateData.effectiveTo ? new Date(updateData.effectiveTo) : null;
    }
    
    if (user.role === 'CLIENT_ADMIN') {
      delete updateData.clientId;
    }
    
    if (updateData.conditionJson === null) updateData.conditionJson = undefined;
    if (updateData.actionJson === null) updateData.actionJson = undefined;
    
    const rule = await prisma.policyRule.update({
      where: { id },
      data: updateData
    });
    
    return NextResponse.json(rule);
  } catch (error) {
    console.error('[PUT /api/v1/policy-rules/[id]]', error);
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation Error', details: error.issues }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthenticatedUser();
    if (!user || (user.role !== 'SUPER_ADMIN' && user.role !== 'CLIENT_ADMIN')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;
    
    const existingRule = await prisma.policyRule.findUnique({ where: { id } });
    if (!existingRule) {
      return NextResponse.json({ error: 'Not Found' }, { status: 404 });
    }
    
    if (user.role === 'CLIENT_ADMIN' && existingRule.clientId !== user.clientId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await prisma.policyRule.delete({
      where: { id }
    });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error('[DELETE /api/v1/policy-rules/[id]]', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
