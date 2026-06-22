import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { z } from 'zod';
import { getAuthenticatedUser } from '@/lib/rbac';

const policyRuleSchema = z.object({
  clientId: z.string().nullable().optional(),
  policyProductCode: z.string().nullable().optional(),
  ruleCode: z.string().min(1, 'Rule code is required'),
  ruleName: z.string().min(1, 'Rule name is required'),
  ruleType: z.string().min(1, 'Rule type is required'),
  targetType: z.string().nullable().optional(),
  targetCode: z.string().nullable().optional(),
  targetPattern: z.string().nullable().optional(),
  conditionJson: z.unknown().optional(),
  actionJson: z.unknown().optional(),
  severity: z.string().default('WARNING'),
  recommendation: z.string().nullable().optional(),
  effectiveFrom: z.string().datetime().optional().or(z.date()),
  effectiveTo: z.string().datetime().nullable().optional().or(z.date().nullable()),
  status: z.string().default('ACTIVE'),
});

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    let clientId = searchParams.get('clientId');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');
    const search = searchParams.get('search') || '';
    
    if (user.role === 'CLIENT_ADMIN' || user.role === 'CLIENT_USER') {
      clientId = user.clientId;
    }
    
    const where: any = {};
    if (clientId) {
      where.clientId = clientId;
    }
    
    if (search) {
      where.OR = [
        { ruleCode: { contains: search, mode: 'insensitive' } },
        { ruleName: { contains: search, mode: 'insensitive' } },
      ];
    }
    
    const [total, rules] = await Promise.all([
      prisma.policyRule.count({ where }),
      prisma.policyRule.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { client: { select: { name: true, code: true } } }
      })
    ]);
    
    return NextResponse.json({
      entries: rules,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    });
  } catch (error) {
    console.error('[GET /api/v1/policy-rules]', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    if (!user || (user.role !== 'SUPER_ADMIN' && user.role !== 'CLIENT_ADMIN')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const json = await request.json();
    const body = policyRuleSchema.parse(json);
    
    let finalClientId = body.clientId ?? null;
    if (user.role === 'CLIENT_ADMIN') {
      finalClientId = user.clientId;
    }

    const rule = await prisma.policyRule.create({
      data: {
        clientId: finalClientId,
        policyProductCode: body.policyProductCode ?? null,
        ruleCode: body.ruleCode,
        ruleName: body.ruleName,
        ruleType: body.ruleType,
        targetType: body.targetType ?? null,
        targetCode: body.targetCode ?? null,
        targetPattern: body.targetPattern ?? null,
        conditionJson: body.conditionJson ? body.conditionJson as any : undefined,
        actionJson: body.actionJson ? body.actionJson as any : undefined,
        severity: body.severity,
        recommendation: body.recommendation ?? null,
        effectiveFrom: body.effectiveFrom ? new Date(body.effectiveFrom) : new Date(),
        effectiveTo: body.effectiveTo ? new Date(body.effectiveTo) : null,
        status: body.status,
      }
    });
    
    return NextResponse.json(rule, { status: 201 });
  } catch (error) {
    console.error('[POST /api/v1/policy-rules]', error);
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation Error', details: error.issues }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
