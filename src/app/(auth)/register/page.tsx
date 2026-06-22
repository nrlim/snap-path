'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Eye, EyeOff } from 'lucide-react'

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
      setError('Mohon lengkapi semua kolom.')
      setLoading(false)
      return
    }

    if (password.length < 8) {
      setError('Kata sandi minimal 8 karakter.')
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
        setError(data.error || 'Terjadi kesalahan sistem.')
        setLoading(false)
        return
      }

      router.push('/login')
    } catch {
      setError('Gagal terhubung ke server.')
      setLoading(false)
    }
  }

  return (
    <div>
      <div className="mb-6 text-left">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Pendaftaran <span className="font-logo tracking-tighter">CONSUL</span>
        </h1>
        <p className="mt-2 text-sm text-muted-foreground font-light">
          Buat profil profesional Anda untuk akses validasi klinis.
        </p>
      </div>

      {error && (
        <div
          className="mb-6 rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive font-medium"
          role="alert"
        >
          {error}
        </div>
      )}

      <form className="space-y-4" onSubmit={handleSubmit}>
        <div className="space-y-1.5">
          <label
            htmlFor="name"
            className="block text-sm font-medium text-foreground"
          >
            Nama Lengkap
          </label>
          <input
            id="name"
            name="name"
            type="text"
            autoComplete="name"
            required
            className="block h-10 w-full rounded-md border border-border bg-surface px-3 py-2 text-foreground placeholder:text-muted-foreground/50 transition-colors focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary text-sm"
            placeholder="Dr. Nama Lengkap"
          />
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="email"
            className="block text-sm font-medium text-foreground"
          >
            Alamat Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            className="block h-10 w-full rounded-md border border-border bg-surface px-3 py-2 text-foreground placeholder:text-muted-foreground/50 transition-colors focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary text-sm"
            placeholder="nama@institusi.org"
          />
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="password"
            className="block text-sm font-medium text-foreground"
          >
            Kata Sandi
          </label>
          <div className="relative">
            <input
              id="password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              required
              className="block h-10 w-full rounded-md border border-border bg-surface pl-3 pr-10 py-2 text-foreground placeholder:text-muted-foreground/50 transition-colors focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary text-sm"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground focus:outline-none transition-colors"
              aria-label={showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
            >
              {showPassword ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          </div>
          <p className="mt-1 text-xs text-muted-foreground/70 font-light">
            Minimal 8 karakter.
          </p>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="flex h-10 w-full items-center justify-center rounded-md bg-foreground px-4 text-sm font-medium text-background transition-transform hover:-translate-y-0.5 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
        >
          {loading ? 'Memproses...' : 'Buat Akun'}
        </button>
      </form>

      <div className="mt-6 border-t border-border pt-5 text-left text-sm">
        <span className="text-muted-foreground font-light">Sudah memiliki akun? </span>
        <Link
          href="/login"
          className="font-medium text-foreground transition-colors hover:text-primary"
        >
          Masuk sistem
        </Link>
      </div>
    </div>
  )
}
