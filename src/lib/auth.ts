import { SignJWT, jwtVerify, type JWTPayload } from 'jose'
import { cookies } from 'next/headers'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'

function getJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('JWT_SECRET environment variable is required in production')
    }
    console.warn('[auth] JWT_SECRET not set — using dev-only derived key. Set JWT_SECRET for production.')
    return crypto.createHash('sha256').update('snap-path-dev-only-key-do-not-use-in-prod').digest()
  }
  return new TextEncoder().encode(secret)
}

const SECRET_KEY = getJwtSecret()

export async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(10)
  return bcrypt.hash(password, salt)
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

export async function createSession(payload: JWTPayload) {
  const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 1 week
  // Only store minimal non-sensitive identifiers in JWT claims
  const minimalPayload: JWTPayload = {
    sub: typeof payload.userId === 'string' ? payload.userId : undefined,
    iat: Math.floor(Date.now() / 1000),
  }
  const session = await new SignJWT(minimalPayload)
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('7d')
    .sign(SECRET_KEY)

  const cookieStore = await cookies()
  cookieStore.set('__Host-session', session, {
    httpOnly: true,
    secure: true,
    expires: expires,
    sameSite: 'lax',
    path: '/',
  })
}

export async function getSession() {
  const cookieStore = await cookies()
  // Support both __Host-session (new) and session (legacy) cookies
  const session = cookieStore.get('__Host-session')?.value || cookieStore.get('session')?.value
  if (!session) return null

  try {
    const { payload } = await jwtVerify(session, SECRET_KEY, {
      algorithms: ['HS256'],
    })
    return payload
  } catch {
    return null
  }
}

export async function clearSession() {
  const cookieStore = await cookies()
  cookieStore.delete('__Host-session')
  cookieStore.delete('session') // Clean up legacy cookie
}
