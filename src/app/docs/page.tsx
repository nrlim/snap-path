import type { Metadata } from "next";
import Link from "next/link";
import Navbar from "@/components/landing/Navbar";
import Footer from "@/components/landing/Footer";

export const metadata: Metadata = {
  title: "Dokumentasi API | SnapPath",
  description: "Panduan integrasi API SnapPath untuk clinical pathway dan validasi klaim. Autentikasi, endpoint, dan contoh request.",
};

// Public API documentation - read-only overview, no interactive "try it" feature
// Full interactive docs (Scalar) is only available to authenticated users at /api-docs

export default function PublicApiDocsPage() {
  return (
    <div className="flex flex-col min-h-screen bg-surface font-sans text-text">
      <Navbar />
      <main className="flex-1 pt-24">
        {/* Header */}
        <div className="border-b border-border/50 bg-surface-elevated py-12 sm:py-16">
          <div className="mx-auto max-w-5xl px-6 lg:px-8">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-text-faint mb-3">Referensi Teknis</p>
                <h1 className="text-3xl font-bold tracking-tight text-text sm:text-4xl">
                  Dokumentasi API
                </h1>
                <p className="mt-4 text-lg text-text-subtle leading-relaxed max-w-2xl">
                  Integrasikan kecerdasan klinis SnapPath ke dalam sistem informasi rumah sakit Anda menggunakan REST API yang aman dan terstruktur.
                </p>
              </div>
              <div className="flex-shrink-0">
                <Link
                  href="/login?next=/api-docs"
                  className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-6 py-3 text-sm font-semibold text-white shadow-sm shadow-primary/25 transition-colors hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
                >
                  Buka Docs Interaktif
                </Link>
              </div>
            </div>
          </div>
        </div>

        <div className="mx-auto max-w-5xl px-6 lg:px-8 py-12 sm:py-16">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">

            {/* Sidebar */}
            <aside className="lg:col-span-1">
              <div className="sticky top-28 space-y-6">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.15em] text-text-faint mb-3">Navigasi</p>
                  <nav className="space-y-1">
                    {[
                      { href: "#overview", label: "Gambaran Umum" },
                      { href: "#authentication", label: "Autentikasi" },
                      { href: "#endpoints", label: "Endpoint Utama" },
                      { href: "#claim-validation", label: "Validasi Klaim" },
                      { href: "#clinical-pathway", label: "Clinical Pathway" },
                      { href: "#async-jobs", label: "Asynchronous Jobs" },
                      { href: "#errors", label: "Kode Error" },
                      { href: "#rate-limits", label: "Rate Limits" },
                    ].map((item) => (
                      <a
                        key={item.href}
                        href={item.href}
                        className="block rounded-md px-3 py-2 text-sm text-text-subtle hover:bg-surface-elevated hover:text-text transition-colors"
                      >
                        {item.label}
                      </a>
                    ))}
                  </nav>
                </div>

                <div className="rounded-xl border border-primary/20 bg-primary-soft/10 p-4">
                  <p className="text-sm font-semibold text-text mb-2">Docs Interaktif</p>
                  <p className="text-xs text-text-subtle mb-3">
                    Akses dokumentasi lengkap dengan fitur Try It dan contoh response nyata. Khusus klien terdaftar.
                  </p>
                  <Link
                    href="/login?next=/api-docs"
                    className="inline-flex w-full items-center justify-center rounded-md bg-primary px-3 py-2 text-xs font-semibold text-white hover:bg-primary-hover transition-colors"
                  >
                    Masuk untuk Akses
                  </Link>
                </div>
              </div>
            </aside>

            {/* Main content */}
            <div className="lg:col-span-2 space-y-12">

              {/* Overview */}
              <section id="overview">
                <h2 className="text-2xl font-bold text-text mb-4">Gambaran Umum</h2>
                <p className="text-sm text-text-subtle leading-relaxed mb-4">
                  SnapPath menyediakan REST API berbasis JSON untuk mengintegrasikan fitur validasi klaim dan pembuatan clinical pathway ke dalam sistem internal institusi Anda.
                </p>
                <div className="rounded-lg bg-code border border-border/50 p-4 text-sm font-mono">
                  <p className="text-text-faint text-xs mb-2">Base URL</p>
                  <p className="text-surface-muted">https://api.snappath.id/api/v1</p>
                </div>
                <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {[
                    { label: "Format", value: "JSON" },
                    { label: "Versi API", value: "v1" },
                    { label: "Protokol", value: "HTTPS only" },
                  ].map((item) => (
                    <div key={item.label} className="rounded-lg border border-border/50 bg-surface-elevated p-3 text-center">
                      <p className="text-xs text-text-faint mb-1">{item.label}</p>
                      <p className="text-sm font-semibold text-text">{item.value}</p>
                    </div>
                  ))}
                </div>
              </section>

              {/* Authentication */}
              <section id="authentication">
                <h2 className="text-2xl font-bold text-text mb-4">Autentikasi</h2>
                <p className="text-sm text-text-subtle leading-relaxed mb-6">
                  Semua request ke API SnapPath harus disertai kredensial yang valid. Tersedia dua metode autentikasi:
                </p>

                <div className="space-y-4">
                  <div className="rounded-xl border border-border/50 bg-surface-elevated overflow-hidden">
                    <div className="border-b border-border/50 bg-surface px-5 py-3">
                      <p className="text-sm font-semibold text-text">Metode 1 — API Key + Secret (Direkomendasikan)</p>
                    </div>
                    <div className="p-5">
                      <p className="text-sm text-text-subtle mb-3">Sertakan dua header berikut pada setiap request:</p>
                      <div className="rounded-lg bg-code p-4 text-xs font-mono space-y-1 text-surface-muted">
                        <p><span className="text-blue-400">x-api-key</span>: sp_xxxxxxxxxxxxxxxx</p>
                        <p><span className="text-blue-400">x-api-secret</span>: sps_xxxxxxxxxxxxxxxx</p>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl border border-border/50 bg-surface-elevated overflow-hidden">
                    <div className="border-b border-border/50 bg-surface px-5 py-3">
                      <p className="text-sm font-semibold text-text">Metode 2 — HTTP Basic Auth</p>
                    </div>
                    <div className="p-5">
                      <p className="text-sm text-text-subtle mb-3">Encode <code className="text-xs bg-surface px-1 py-0.5 rounded">apiKey:apiSecret</code> dalam Base64 dan sertakan sebagai header Authorization:</p>
                      <div className="rounded-lg bg-code p-4 text-xs font-mono text-surface-muted">
                        <p><span className="text-blue-400">Authorization</span>: Basic {"{"}base64(apiKey:apiSecret){"}"}</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-text-subtle">
                  <span className="font-semibold text-text">Keamanan:</span> Jangan pernah menyertakan API key atau secret dalam kode sumber yang bersifat publik (frontend, repositori publik). Selalu gunakan environment variables di sisi server.
                </div>
              </section>

              {/* Endpoints */}
              <section id="endpoints">
                <h2 className="text-2xl font-bold text-text mb-4">Endpoint Utama</h2>
                <p className="text-sm text-text-subtle mb-6">Ringkasan kelompok endpoint yang tersedia di SnapPath API:</p>

                <div className="space-y-3">
                  {[
                    {
                      method: "POST",
                      path: "/api/v1/claims/validate",
                      desc: "Validasi klaim pasien secara komprehensif — diagnosis, tarif, obat, dan dokumen",
                      color: "bg-blue-500/15 text-blue-400 border-blue-500/20",
                    },
                    {
                      method: "POST",
                      path: "/api/v1/pathways/generate",
                      desc: "Generate clinical pathway berbasis ICD-10 dan jenis kunjungan",
                      color: "bg-blue-500/15 text-blue-400 border-blue-500/20",
                    },
                    {
                      method: "GET",
                      path: "/api/v1/jobs/{jobId}/status",
                      desc: "Polling status job asynchronous (validasi atau pathway)",
                      color: "bg-green-500/15 text-green-400 border-green-500/20",
                    },
                    {
                      method: "GET",
                      path: "/api/v1/jobs/{jobId}/result",
                      desc: "Ambil hasil lengkap setelah job selesai",
                      color: "bg-green-500/15 text-green-400 border-green-500/20",
                    },
                    {
                      method: "GET",
                      path: "/api/v1/tariffs",
                      desc: "Daftar master tarif tindakan berdasarkan provider",
                      color: "bg-green-500/15 text-green-400 border-green-500/20",
                    },
                    {
                      method: "GET",
                      path: "/api/v1/providers",
                      desc: "Daftar provider klaim/asuransi yang terdaftar untuk tenant",
                      color: "bg-green-500/15 text-green-400 border-green-500/20",
                    },
                  ].map((ep) => (
                    <div
                      key={ep.path}
                      className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-lg border border-border/50 bg-surface-elevated p-4"
                    >
                      <span className={`inline-flex flex-shrink-0 items-center rounded border px-2 py-0.5 text-xs font-bold ${ep.color}`}>
                        {ep.method}
                      </span>
                      <code className="text-xs text-text font-mono flex-shrink-0">{ep.path}</code>
                      <p className="text-xs text-text-subtle sm:ml-auto sm:text-right">{ep.desc}</p>
                    </div>
                  ))}
                </div>
              </section>

              {/* Claim Validation */}
              <section id="claim-validation">
                <h2 className="text-2xl font-bold text-text mb-4">Validasi Klaim</h2>
                <p className="text-sm text-text-subtle leading-relaxed mb-4">
                  Endpoint <code className="text-xs bg-surface-elevated px-1.5 py-0.5 rounded border border-border/50">POST /api/v1/claims/validate</code> menerima data klaim dan mengembalikan hasil validasi multi-dimensi.
                </p>

                <div className="space-y-4">
                  <div className="rounded-xl border border-border/50 bg-surface-elevated overflow-hidden">
                    <div className="border-b border-border/50 bg-surface px-5 py-3 flex items-center gap-2">
                      <span className="text-xs font-bold text-blue-400 bg-blue-500/10 border border-blue-500/20 rounded px-2 py-0.5">POST</span>
                      <code className="text-xs text-text font-mono">/api/v1/claims/validate</code>
                    </div>
                    <div className="p-5">
                      <p className="text-xs text-text-faint uppercase tracking-wider mb-3">Field yang diperlukan:</p>
                      <div className="space-y-2">
                        {[
                          { field: "providerId", type: "uuid", desc: "ID provider klaim (BPJS, asuransi swasta, dll)" },
                          { field: "patient", type: "object", desc: "Data pasien (id, nama, tanggal lahir, jenis kelamin)" },
                          { field: "encounter", type: "object", desc: "Data kunjungan (tipe, tanggal masuk/keluar, fasilitas)" },
                          { field: "diagnoses", type: "array", desc: "Daftar diagnosis ICD-10 (primer, sekunder, komplikasi)" },
                          { field: "procedures", type: "array", desc: "Tindakan medis beserta kode, harga, dan tanggal" },
                          { field: "medications", type: "array", desc: "Obat-obatan beserta nama generik, dosis, dan harga" },
                          { field: "totalClaimAmount", type: "number", desc: "Total tagihan klaim dalam IDR" },
                        ].map((f) => (
                          <div key={f.field} className="flex gap-3 text-xs border-b border-border/30 pb-2 last:border-0 last:pb-0">
                            <code className="text-primary flex-shrink-0 w-36">{f.field}</code>
                            <span className="text-text-faint flex-shrink-0">{f.type}</span>
                            <span className="text-text-subtle">{f.desc}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="rounded-lg border border-border/50 bg-surface-elevated p-4">
                    <p className="text-xs text-text-faint uppercase tracking-wider mb-3">Struktur Response (async):</p>
                    <div className="rounded-lg bg-code p-4 text-xs font-mono text-surface-muted">
                      <pre>{`{
  "success": true,
  "jobId": "uuid",
  "statusUrl": "/api/v1/jobs/{jobId}/status"
}`}</pre>
                    </div>
                    <p className="mt-3 text-xs text-text-subtle">
                      Validasi klaim bersifat asynchronous. Gunakan <code className="bg-surface px-1 rounded">/jobs/{"{jobId}"}/result</code> untuk mengambil hasil setelah status <code className="bg-surface px-1 rounded">COMPLETED</code>.
                    </p>
                  </div>
                </div>
              </section>

              {/* Clinical Pathway */}
              <section id="clinical-pathway">
                <h2 className="text-2xl font-bold text-text mb-4">Clinical Pathway</h2>
                <p className="text-sm text-text-subtle leading-relaxed mb-4">
                  Endpoint <code className="text-xs bg-surface-elevated px-1.5 py-0.5 rounded border border-border/50">POST /api/v1/pathways/generate</code> menghasilkan clinical pathway klinis berbasis kode ICD-10.
                </p>
                <div className="rounded-xl border border-border/50 bg-surface-elevated overflow-hidden">
                  <div className="border-b border-border/50 bg-surface px-5 py-3">
                    <p className="text-xs text-text-faint uppercase tracking-wider">Field yang diperlukan:</p>
                  </div>
                  <div className="p-5 space-y-2">
                    {[
                      { field: "diagnosisCode", type: "string", desc: "Kode ICD-10, contoh: J18.9" },
                      { field: "encounterType", type: "enum", desc: "RAWAT_INAP | RAWAT_JALAN | IGD" },
                      { field: "diagnosisName", type: "string", desc: "(opsional) Nama diagnosis untuk konteks AI" },
                      { field: "patientProfile", type: "object", desc: "(opsional) Usia, jenis kelamin, dan komorbiditas" },
                    ].map((f) => (
                      <div key={f.field} className="flex gap-3 text-xs border-b border-border/30 pb-2 last:border-0 last:pb-0">
                        <code className="text-primary flex-shrink-0 w-36">{f.field}</code>
                        <span className="text-text-faint flex-shrink-0">{f.type}</span>
                        <span className="text-text-subtle">{f.desc}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <p className="mt-3 text-sm text-text-subtle">
                  Output mencakup estimasi Length of Stay (LOS), fase perawatan per hari, asesmen, terapi, obat, edukasi pasien, dan kriteria discharge.
                </p>
              </section>

              {/* Async Jobs */}
              <section id="async-jobs">
                <h2 className="text-2xl font-bold text-text mb-4">Asynchronous Jobs</h2>
                <p className="text-sm text-text-subtle leading-relaxed mb-4">
                  Semua proses berat (validasi klaim, pembuatan pathway) berjalan secara asynchronous. Gunakan polling untuk memantau status:
                </p>
                <div className="space-y-3">
                  {[
                    { status: "QUEUED", color: "text-text-faint bg-surface", desc: "Job diterima, menunggu diproses" },
                    { status: "PROCESSING", color: "text-blue-400 bg-blue-500/10", desc: "Job sedang diproses oleh workflow engine" },
                    { status: "COMPLETED", color: "text-green-400 bg-green-500/10", desc: "Job selesai, result tersedia" },
                    { status: "FAILED", color: "text-red-400 bg-red-500/10", desc: "Job gagal, periksa field error di response" },
                  ].map((s) => (
                    <div key={s.status} className="flex items-center gap-4 rounded-lg border border-border/50 bg-surface-elevated p-3">
                      <span className={`text-xs font-bold px-2 py-1 rounded ${s.color}`}>{s.status}</span>
                      <p className="text-xs text-text-subtle">{s.desc}</p>
                    </div>
                  ))}
                </div>
              </section>

              {/* Error codes */}
              <section id="errors">
                <h2 className="text-2xl font-bold text-text mb-4">Kode Error</h2>
                <div className="space-y-2">
                  {[
                    { code: "400", label: "Bad Request", desc: "Input tidak valid atau field yang diperlukan tidak ada" },
                    { code: "401", label: "Unauthorized", desc: "Kredensial API tidak valid atau tidak disertakan" },
                    { code: "403", label: "Forbidden", desc: "Akun tidak memiliki akses ke resource yang diminta" },
                    { code: "404", label: "Not Found", desc: "Resource (job, provider, dll) tidak ditemukan" },
                    { code: "429", label: "Too Many Requests", desc: "Rate limit tercapai, coba lagi setelah beberapa saat" },
                    { code: "500", label: "Internal Error", desc: "Kesalahan server, hubungi tim SnapPath jika berlanjut" },
                  ].map((e) => (
                    <div key={e.code} className="flex gap-4 items-start rounded-lg border border-border/50 bg-surface-elevated p-3">
                      <span className="text-xs font-bold text-text w-10 flex-shrink-0">{e.code}</span>
                      <span className="text-xs text-text-subtle w-36 flex-shrink-0">{e.label}</span>
                      <p className="text-xs text-text-subtle">{e.desc}</p>
                    </div>
                  ))}
                </div>
              </section>

              {/* Rate limits */}
              <section id="rate-limits">
                <h2 className="text-2xl font-bold text-text mb-4">Rate Limits</h2>
                <p className="text-sm text-text-subtle leading-relaxed mb-4">
                  Rate limit diterapkan per API key untuk menjaga stabilitas platform. Batasan spesifik per tier ditentukan dalam perjanjian layanan institusi Anda.
                </p>
                <div className="rounded-lg border border-border/50 bg-surface-elevated p-4 text-sm text-text-subtle">
                  Jika request melebihi batas, API akan merespons dengan HTTP <code className="text-xs bg-surface px-1 rounded">429 Too Many Requests</code>. Implementasikan exponential backoff pada integrasi Anda.
                </div>
              </section>

              {/* CTA */}
              <div className="rounded-2xl border border-primary/20 bg-primary-soft/10 p-8 text-center">
                <h3 className="text-xl font-bold text-text mb-2">Siap Mengintegrasikan?</h3>
                <p className="text-sm text-text-subtle mb-6">
                  Daftar sebagai mitra institusi untuk mendapatkan API key dan akses ke dokumentasi interaktif lengkap dengan fitur Try It.
                </p>
                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                  <Link
                    href="/login?next=/api-docs"
                    className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-6 py-3 text-sm font-semibold text-white hover:bg-primary-hover transition-colors"
                  >
                    Buka Docs Interaktif
                  </Link>
                  <Link
                    href="/#features"
                    className="inline-flex min-h-11 items-center justify-center rounded-md border border-secondary/25 bg-secondary-soft/70 px-6 py-3 text-sm font-semibold text-secondary hover:bg-secondary-soft transition-colors"
                  >
                    Pelajari Fitur SnapPath
                  </Link>
                </div>
              </div>

            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
