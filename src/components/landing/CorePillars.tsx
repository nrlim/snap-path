import { Activity, CheckCircle2, Database, History, Lock, FileText } from "lucide-react";

// 6 capabilities — distinct from the 3 "pillars" abstraction, these are concrete feature areas
const capabilities = [
  {
    id: "01",
    title: "Clinical Pathway Generator",
    desc: "Menyusun pathway klinis lengkap: estimasi LOS, fase perawatan, asesmen, terapi, obat, edukasi, dan kriteria discharge — sesuai pedoman praktik klinis rumah sakit.",
    icon: Activity,
  },
  {
    id: "02",
    title: "Claim Validation Engine",
    desc: "Pengecekan otomatis diagnosis-tindakan, tarif vs referensi resmi, interaksi obat, kelengkapan dokumen, dan LOS. Setiap item diberi status eksplisit: over threshold, under priced, atau not found.",
    icon: CheckCircle2,
  },
  {
    id: "03",
    title: "Patient History Validation",
    desc: "Validasi mendalam terhadap riwayat klinis pasien untuk memastikan tidak ada anomali, data tertinggal, atau inkonsistensi antar episode perawatan.",
    icon: History,
  },
  {
    id: "04",
    title: "PII Sanitization Layer",
    desc: "Deteksi dan penyamaran otomatis identitas sensitif pasien sebelum diproses. Data mentah tidak pernah meninggalkan batas aman server lokal Anda.",
    icon: Lock,
  },
  {
    id: "05",
    title: "Deterministic Workflow",
    desc: "Alur kerja berbasis aturan yang dapat diprediksi, diulangi, dan diaudit. Tidak ada keputusan tersembunyi — setiap langkah komputasi terdokumentasi.",
    icon: Database,
  },
  {
    id: "06",
    title: "AI Usage Logs & Analytics",
    desc: "Visibilitas penuh terhadap penggunaan AI, log sistem, dan analitik token per-tenant. Transparansi biaya operasional tanpa ambiguitas.",
    icon: FileText,
  },
];

export default function CorePillars() {
  return (
    <section id="services" className="bg-background min-h-screen flex items-center py-20">
      <div className="mx-auto max-w-7xl px-6 lg:px-8 w-full">

        {/* Header */}
        <div className="max-w-xl mb-14">
          <p className="text-sm font-mono text-primary/60 tracking-[0.2em] uppercase mb-4">Kapabilitas Platform</p>
          <h2 className="text-3xl font-light tracking-tight text-foreground sm:text-4xl leading-snug">
            Semua yang Anda butuhkan<br />
            <span className="font-semibold text-primary">dalam satu sistem terpadu.</span>
          </h2>
        </div>

        {/* 6-item grid — 3 cols on desktop */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-px bg-border rounded-lg overflow-hidden">
          {capabilities.map((cap) => {
            const Icon = cap.icon;
            return (
              <div
                key={cap.id}
                className="bg-background p-7 group hover:bg-surface transition-colors duration-300"
              >
                <div className="flex items-start justify-between mb-5">
                  <div className="h-10 w-10 rounded-lg border border-border flex items-center justify-center group-hover:border-primary/30 group-hover:bg-primary/5 transition-colors duration-300">
                    <Icon className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors duration-300" />
                  </div>
                  <span className="text-sm font-mono text-muted-foreground/40">{cap.id}</span>
                </div>
                <h3 className="text-base font-semibold text-foreground mb-3">{cap.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed font-light">{cap.desc}</p>
              </div>
            );
          })}
        </div>

      </div>
    </section>
  );
}
