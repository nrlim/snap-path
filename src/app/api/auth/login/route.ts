import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { verifyPassword, createSession } from '@/lib/auth'
import { checkRateLimit, AUTH_RATE_LIMIT } from '@/lib/rate-limit'

export async function POST(request: NextRequest) {
  try {
    // Rate limiting per IP
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || request.headers.get('x-real-ip')
      || 'unknown'
    const rateCheck = checkRateLimit(`login:${ip}`, AUTH_RATE_LIMIT)
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: 'Too many login attempts. Please try again later.' },
        {
          status: 429,
          headers: { 'Retry-After': String(Math.ceil(rateCheck.retryAfterMs / 1000)) },
        },
      )
    }

    const body = await request.json()
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    const password = typeof body.password === 'string' ? body.password : ''

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Invalid credentials.' },
        { status: 401 },
      )
    }

    const user = await prisma.user.findUnique({
      where: { email },
    })

    // Always verify a password even if user doesn't exist to prevent timing-based enumeration
    if (!user) {
      await verifyPassword(password, '$2a$10$dummyHashForConstantTimeComparison00000000000000000000000000')
      return NextResponse.json(
        { error: 'Invalid credentials.' },
        { status: 401 },
      )
    }

    const isPasswordValid = await verifyPassword(password, user.password)

    if (!isPasswordValid) {
      return NextResponse.json(
        { error: 'Invalid credentials.' },
        { status: 401 },
      )
    }

    await createSession({
      userId: user.id,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    // Log structured error internally, return generic message
    console.error('[auth/login]', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    })
    return NextResponse.json(
      { error: 'Unable to sign in at this time.' },
      { status: 500 },
    )
  }
}
