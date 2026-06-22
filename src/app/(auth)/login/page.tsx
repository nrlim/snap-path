'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Eye, EyeOff } from 'lucide-react'
import { ConsulLogoIcon } from "@/components/ui/ConsulLogoIcon"

export default function LoginPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const formData = new FormData(e.currentTarget)
    const email = formData.get('email') as string
    const password = formData.get('password') as string

    if (!email || !password) {
      setError('Mohon lengkapi semua kolom.')
      setLoading(false)
      return
    }

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || ''}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Terjadi kesalahan sistem.')
        setLoading(false)
        return
      }

      router.push('/dashboard')
      router.refresh()
    } catch {
      setError('Gagal terhubung ke server.')
      setLoading(false)
    }
  }

  return (
    <div>
      <div className="mb-6 text-left">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Akses Sistem <span className="inline-flex items-center gap-[1px] align-baseline">
            <ConsulLogoIcon className="h-[0.85em] w-auto inline relative -top-[1px]" />
            <span className="font-logo tracking-tighter pt-[2px]">ONSUL</span>
          </span>
        </h1>
        <p className="mt-2 text-sm text-muted-foreground font-light">
          Gunakan akun institusi untuk melanjutkan validasi.
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
              autoComplete="current-password"
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
        </div>

        <button
          type="submit"
          disabled={loading}
          className="flex h-10 w-full items-center justify-center rounded-md bg-foreground px-4 text-sm font-medium text-background transition-transform hover:-translate-y-0.5 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
        >
          {loading ? 'Memproses...' : 'Masuk ke Dasbor'}
        </button>
      </form>

      <div className="mt-6 border-t border-border pt-6 text-left text-sm">
        <span className="text-muted-foreground font-light">Belum memiliki akses? </span>
        <Link
          href="/register"
          className="font-medium text-foreground transition-colors hover:text-primary"
        >
          Pendaftaran institusi
        </Link>
      </div>
    </div>
  )
}
