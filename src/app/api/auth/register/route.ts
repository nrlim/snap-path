import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { hashPassword } from '@/lib/auth'
import { checkRateLimit, REGISTER_RATE_LIMIT } from '@/lib/rate-limit'

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const PASSWORD_MIN_LENGTH = 8
const PASSWORD_MAX_LENGTH = 128
// Require at least 1 letter and 1 number
const PASSWORD_COMPLEXITY = /^(?=.*[a-zA-Z])(?=.*\d)/

function validatePassword(password: string): string | null {
  if (!password || typeof password !== 'string') return 'Password is required.'
  if (password.length < PASSWORD_MIN_LENGTH) return `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`
  if (password.length > PASSWORD_MAX_LENGTH) return `Password must not exceed ${PASSWORD_MAX_LENGTH} characters.`
  if (!PASSWORD_COMPLEXITY.test(password)) return 'Password must contain at least one letter and one number.'
  return null
}

function sanitizeName(name: unknown): string | null {
  if (typeof name !== 'string') return null
  const trimmed = name.trim().replace(/[<>]/g, '')
  if (trimmed.length === 0 || trimmed.length > 100) return null
  return trimmed
}

export async function POST(request: NextRequest) {
  try {
    // Rate limiting per IP
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || request.headers.get('x-real-ip')
      || 'unknown'
    const rateCheck = checkRateLimit(`register:${ip}`, REGISTER_RATE_LIMIT)
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: 'Too many registration attempts. Please try again later.' },
        {
          status: 429,
          headers: { 'Retry-After': String(Math.ceil(rateCheck.retryAfterMs / 1000)) },
        },
      )
    }

    const body = await request.json()
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    const password = typeof body.password === 'string' ? body.password : ''
    const rawName = body.name

    if (!email || !EMAIL_REGEX.test(email)) {
      return NextResponse.json(
        { error: 'Invalid email format.' },
        { status: 400 },
      )
    }

    const passwordError = validatePassword(password)
    if (passwordError) {
      return NextResponse.json(
        { error: passwordError },
        { status: 400 },
      )
    }

    const sanitizedName = sanitizeName(rawName)

    const existingUser = await prisma.user.findUnique({
      where: { email },
    })

    if (existingUser) {
      // Generic message to prevent email enumeration
      return NextResponse.json(
        { error: 'An account with this email may already exist. If you cannot log in, contact support.' },
        { status: 409 },
      )
    }

    const hashedPassword = await hashPassword(password)

    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name: sanitizedName,
        role: 'VIEWER',
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
      },
    })

    return NextResponse.json({ success: true, user }, { status: 201 })
  } catch (error) {
    console.error('[auth/register]', {
      message: error instanceof Error ? error.message : 'Unknown error',
    })
    return NextResponse.json(
      { error: 'Unable to create an account at this time.' },
      { status: 500 },
    )
  }
}
