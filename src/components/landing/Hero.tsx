import Link from "next/link";
import { ArrowRight, ArrowUpRight, Database, Cpu, CheckCircle2 } from "lucide-react";

// Metrics — unique data point, shown once here, removed from MetricsStrip
const metrics = [
  { value: "5", label: "Lapisan Validasi" },
  { value: "100%", label: "Sanitasi PII" },
  { value: "< 30d", label: "Proses per Klaim" },
  { value: "Penuh", label: "Jejak Audit" },
];

export default function Hero() {
  return (
    <section className="relative w-full bg-background min-h-screen flex items-center pt-28 pb-16 overflow-hidden">
      {/* Thin top accent line */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/25 to-transparent" />

      <div className="mx-auto max-w-screen-2xl px-6 lg:px-12 w-full">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 lg:gap-20 items-center">
          
          {/* === Left Side: Text & CTAs === */}
          <div className="animate-fade-in-up">

            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-light tracking-tight text-foreground leading-[1.1] mb-6">
              Klaim bersih.<br />
              <span className="font-semibold text-primary">Cair lebih cepat.</span>
            </h1>
            <p className="text-lg text-muted-foreground font-light mb-10 max-w-md">
              Tinggalkan audit manual yang rentan error. Otomasi pencocokan diagnosis, tarif, dan LOS dalam hitungan detik.
            </p>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row items-start gap-4 mb-16">
              <Link
                href="/login"
                className="inline-flex h-12 items-center justify-center rounded-lg bg-foreground px-8 text-sm font-medium text-background transition-transform hover:-translate-y-0.5 focus:outline-none"
              >
                Mulai Integrasi
              </Link>
              <Link
                href="#workflow"
                className="inline-flex h-12 items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors group"
              >
                Lihat Cara Kerja
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Link>
            </div>

            {/* Metrics inline — horizontal */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
              {metrics.map((m) => (
                <div key={m.label} className="flex flex-col border-l-2 border-border pl-4">
                  <span className="text-2xl font-mono font-semibold text-foreground tracking-tight">{m.value}</span>
                  <span className="text-xs text-muted-foreground mt-1">{m.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* === Right Side: Data Flow Timeline === */}
          <div className="animate-fade-in-up w-full max-w-[460px] ml-auto relative" style={{ animationDelay: "200ms" }}>
            <div className="relative border border-border rounded-2xl bg-surface/50 p-8 shadow-elegant backdrop-blur-sm">
              
              {/* Connecting Line */}
              <div className="absolute left-[39px] top-[48px] bottom-[48px] w-px bg-gradient-to-b from-primary/30 via-primary/10 to-transparent"></div>

              <div className="space-y-10 relative">
                
                {/* Step 1 */}
                <div className="relative flex gap-5 group">
                  <div className="relative z-10 flex-shrink-0 flex items-center justify-center w-[30px] h-[30px] rounded-full bg-background border border-primary/30 text-primary group-hover:scale-110 group-hover:bg-primary group-hover:text-primary-foreground transition-all duration-300 shadow-sm">
                    <Database className="w-3.5 h-3.5" />
                  </div>
                  <div className="pt-1">
                    <p className="text-xs font-mono text-primary/70 tracking-widest uppercase mb-1">Fase 01</p>
                    <h3 className="text-base font-medium text-foreground mb-1.5">Tarik Data Medis</h3>
                    <p className="text-sm text-muted-foreground font-light leading-relaxed">
                      Hubungkan EMR Anda dalam hitungan menit. Kami ekstrak data pasien, diagnosis, dan tindakan secara aman tanpa hambatan.
                    </p>
                  </div>
                </div>

                {/* Step 2 */}
                <div className="relative flex gap-5 group">
                  <div className="relative z-10 flex-shrink-0 flex items-center justify-center w-[30px] h-[30px] rounded-full bg-background border border-primary/30 text-primary group-hover:scale-110 group-hover:bg-primary group-hover:text-primary-foreground transition-all duration-300 shadow-sm">
                    <Cpu className="w-3.5 h-3.5" />
                  </div>
                  <div className="pt-1">
                    <p className="text-xs font-mono text-primary/70 tracking-widest uppercase mb-1">Fase 02</p>
                    <h3 className="text-base font-medium text-foreground mb-1.5">Validasi Deterministik</h3>
                    <p className="text-sm text-muted-foreground font-light leading-relaxed">
                      Mesin kami memproses jutaan aturan: mencocokkan tarif, memeriksa anomali LOS, dan mengaudit interaksi obat tanpa tebakan.
                    </p>
                  </div>
                </div>

                {/* Step 3 */}
                <div className="relative flex gap-5 group">
                  <div className="relative z-10 flex-shrink-0 flex items-center justify-center w-[30px] h-[30px] rounded-full bg-background border border-primary/30 text-primary group-hover:scale-110 group-hover:bg-primary group-hover:text-primary-foreground transition-all duration-300 shadow-sm">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  </div>
                  <div className="pt-1">
                    <p className="text-xs font-mono text-primary/70 tracking-widest uppercase mb-1">Fase 03</p>
                    <h3 className="text-base font-medium text-foreground mb-1.5">Klaim Lolos Audit</h3>
                    <p className="text-sm text-muted-foreground font-light leading-relaxed">
                      Dapatkan laporan audit instan. Klaim bebas error yang siap diajukan ke BPJS atau asuransi dengan tingkat persetujuan maksimal.
                    </p>
                  </div>
                </div>

              </div>
            </div>

            {/* Bottom link */}
            <div className="mt-4 flex justify-end">
              <Link
                href="#features"
                className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors group"
              >
                Lihat detail alur kerja
                <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </Link>
            </div>
            
            {/* Subtle glow underneath right panel */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full bg-primary/5 blur-3xl -z-10 rounded-full pointer-events-none"></div>
          </div>

        </div>
      </div>

      {/* Bottom divider */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-border/50" />
    </section>
  );
}
