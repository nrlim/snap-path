'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function RegisterPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const formData = new FormData(e.currentTarget)
    const name = formData.get('name') as string
    const email = formData.get('email') as string
    const password = formData.get('password') as string

    if (!email || !password || !name) {
      setError('Please complete all fields.')
      setLoading(false)
      return
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      setLoading(false)
      return
    }

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || ''}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Something went wrong.')
        setLoading(false)
        return
      }

      router.push('/login')
    } catch {
      setError('A system error occurred.')
      setLoading(false)
    }
  }

  return (
    <div>
      <div className="mb-8 text-center">
        <h1 className="mt-2 text-2xl font-bold tracking-tight bg-gradient-to-r from-primary via-secondary to-accent bg-clip-text text-transparent">
          Create a SnapPath account
        </h1>
        <p className="mt-3 text-sm leading-6 text-text-subtle">
          Register your professional profile for validated clinical pathway access.
        </p>
      </div>

      {error && (
        <div
          className="mb-5 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          role="alert"
        >
          {error}
        </div>
      )}

      <form className="space-y-5" onSubmit={handleSubmit}>
        <div>
          <label
            htmlFor="name"
            className="block text-sm font-medium text-text-subtle"
          >
            Full name
          </label>
          <div className="mt-1.5">
            <input
              id="name"
              name="name"
              type="text"
              autoComplete="name"
              required
              className="block min-h-11 w-full rounded-md border border-border bg-surface-elevated px-3 py-2 text-text placeholder-text-faint transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 text-base sm:text-sm"
              placeholder="Dr. Full Name"
            />
          </div>
        </div>

        <div>
          <label
            htmlFor="email"
            className="block text-sm font-medium text-text-subtle"
          >
            Email address
          </label>
          <div className="mt-1.5">
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              className="block min-h-11 w-full rounded-md border border-border bg-surface-elevated px-3 py-2 text-text placeholder-text-faint transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 text-base sm:text-sm"
              placeholder="name@institution.org"
            />
          </div>
        </div>

        <div>
          <label
            htmlFor="password"
            className="block text-sm font-medium text-text-subtle"
          >
            Password
          </label>
          <p className="mt-1 text-xs text-text-faint">
            Minimum 8 characters.
          </p>
          <div className="relative mt-1.5">
            <input
              id="password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              required
              className="block min-h-11 w-full rounded-md border border-border bg-surface-elevated pl-3 pr-10 py-2 text-text placeholder-text-faint transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 text-base sm:text-sm"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-text-faint hover:text-text-subtle focus:outline-none"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? (
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/>
                  <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/>
                  <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/>
                  <line x1="2" x2="22" y1="2" y2="22"/>
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/>
                  <circle cx="12" cy="12" r="3"/>
                </svg>
              )}
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="flex min-h-11 w-full justify-center rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? 'Creating account...' : 'Create account'}
        </button>
      </form>

      <div className="mt-6 border-t border-border pt-6 text-center text-sm">
        <span className="text-text-faint">Already have an account? </span>
        <Link
          href="/login"
          className="font-semibold text-text underline-offset-4 transition-colors hover:text-text-subtle hover:underline"
        >
          Sign in
        </Link>
      </div>
    </div>
  )
}
