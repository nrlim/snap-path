import { Shield, Settings, Zap } from "lucide-react";
import Link from "next/link";

// This section is uniquely about privacy architecture + CTA — nothing repeated from other sections
const features = [
  {
    icon: Shield,
    title: "Keamanan Tingkat Klinis",
    desc: "Data sensitif pasien tetap di server lokal Anda. Hanya metadata esensial yang diekstraksi untuk kalkulasi. Tidak ada raw PII yang keluar dari perimeter jaringan.",
  },
  {
    icon: Settings,
    title: "Filter Dinamis per Institusi",
    desc: "Kendalikan penuh parameter apa yang disensor atau dilewatkan — konfigurasi per-tenant sesuai regulasi compliance spesifik rumah sakit atau klinik.",
  },
  {
    icon: Zap,
    title: "Deterministik, Bukan Generatif",
    desc: "Tidak ada \"black box\" AI untuk keputusan medis akhir. Setiap output pathway dihasilkan dari rule-engine terukur — hasilnya sama untuk input yang sama.",
  },
];

export default function AIArchitecture() {
  return (
    <section id="technology" className="bg-background min-h-screen flex items-center py-20">
      <div className="mx-auto max-w-7xl px-6 lg:px-8 w-full">

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 lg:gap-24 items-center">

          {/* Left — Text */}
          <div>
            <p className="text-sm font-mono text-primary/60 tracking-[0.2em] uppercase mb-4">Arsitektur & Privasi</p>
            <h2 className="text-3xl font-light tracking-tight text-foreground sm:text-4xl leading-snug mb-6">
              Data rekam medis<br />
              <span className="font-semibold text-primary">tidak pernah keluar</span>{" "}
              <span className="font-light text-muted-foreground">dari sistem Anda.</span>
            </h2>
            <p className="text-lg text-muted-foreground font-light leading-relaxed mb-10 max-w-lg">
              CONSUL dirancang dengan prinsip <em>privacy-by-architecture</em>. Sanitasi PII terjadi di lapisan pertama, sebelum data apapun menyentuh mesin komputasi.
            </p>

            <div className="space-y-8">
              {features.map((f) => {
                const Icon = f.icon;
                return (
                  <div key={f.title} className="flex gap-5 items-start">
                    <div className="flex-shrink-0 mt-0.5 h-9 w-9 rounded-lg border border-border flex items-center justify-center">
                      <Icon className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <h3 className="text-base font-semibold text-foreground mb-2">{f.title}</h3>
                      <p className="text-base text-muted-foreground font-light leading-relaxed">{f.desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right — Data Flow (pure CSS, no images) */}
          <div className="relative">
            <div className="border border-border rounded-lg overflow-hidden divide-y divide-border">
              {[
                {
                  step: "01",
                  label: "Data Masuk (Raw)",
                  code: `{ "nama": "Budi S.", "rm": "RM10293", "dx": "I21.9" }`,
                  note: "Data pasien lengkap termasuk PII",
                  accent: false,
                },
                {
                  step: "02",
                  label: "Setelah PII Sanitization",
                  code: `{ "nama": "[REDACTED]", "rm": "[REDACTED]", "dx": "I21.9" }`,
                  note: "Identitas disensor, metadata klinis dipertahankan",
                  accent: true,
                },
                {
                  step: "03",
                  label: "Input ke Rule-Engine",
                  code: `{ "dx": "I21.9", "tindakan": "36.06", "los": 4 }`,
                  note: "Hanya data medis relevan yang dikomputasi",
                  accent: false,
                },
              ].map((row) => (
                <div key={row.step} className={`p-6 ${row.accent ? "bg-primary/[0.03]" : "bg-background"}`}>
                  <div className="flex items-center gap-3 mb-3">
                    <span className="text-sm font-mono text-muted-foreground/50">{row.step}</span>
                    <span className="text-sm font-medium text-foreground">{row.label}</span>
                  </div>
                  <pre className="text-xs font-mono text-muted-foreground bg-muted/30 rounded px-4 py-3 overflow-x-auto whitespace-pre-wrap break-words">{row.code}</pre>
                  <p className="text-xs text-muted-foreground/70 mt-3 font-light">{row.note}</p>
                </div>
              ))}
            </div>

            {/* CTA below the visual */}
            <div className="mt-8 flex items-center gap-6">
              <Link
                href="/login"
                className="inline-flex h-11 items-center justify-center rounded-lg bg-foreground px-7 text-sm font-medium text-background transition-transform hover:-translate-y-0.5 focus:outline-none"
              >
                Mulai Sekarang
              </Link>
              <Link
                href="/docs"
                className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                Baca dokumentasi →
              </Link>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}
