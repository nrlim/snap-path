export default function WorkflowDiagram() {
  const steps = [
    {
      id: "01",
      title: "Input Data",
      desc: "Kirim data rekam medis, diagnosis, tindakan, dan dokumen dalam format JSON standar via API atau upload langsung.",
      detail: "REST API · JSON upload · Multi-format",
    },
    {
      id: "02",
      title: "Sanitasi & Normalisasi",
      desc: "PII pasien otomatis disensor. Data dinormalisasi ke struktur klaim CONSUL tanpa ekspos ke sistem eksternal.",
      detail: "PII layer · Local processing · Normalized schema",
    },
    {
      id: "03",
      title: "Eksekusi Rule-Engine",
      desc: "Setiap baris klaim diuji terhadap 5 lapisan aturan: diagnosis, tarif, obat, LOS, dan dokumen — secara deterministik.",
      detail: "5-layer rules · Deterministic · No AI guessing",
    },
    {
      id: "04",
      title: "Enkripsi AES-256",
      desc: "Hasil komputasi klinis dienkripsi menggunakan standar militer AES-256 sebelum disimpan, menjamin keamanan data rekam medis saat at-rest.",
      detail: "AES-256 · At-rest · Zero Trust",
    },
    {
      id: "05",
      title: "Output Auditabel",
      desc: "Laporan klaim lengkap, skor audit, status per-item, dan log langkah disajikan siap untuk verifikasi dan pengajuan.",
      detail: "Audit trail · Score report · Claim-ready doc",
    },
  ];

  return (
    <section id="workflow" className="bg-surface min-h-screen flex items-center py-20">
      <div className="mx-auto max-w-7xl px-6 lg:px-8 w-full">

        {/* Header */}
        <div className="max-w-xl mb-14">
          <p className="text-sm font-mono text-primary/60 tracking-[0.2em] uppercase mb-4">Alur Kerja</p>
          <h2 className="text-3xl font-light tracking-tight text-foreground sm:text-4xl leading-snug">
            Bagaimana <span className="font-semibold text-primary font-logo tracking-tighter">CONSUL</span> bekerja
          </h2>
          <p className="mt-4 text-lg text-muted-foreground font-light leading-relaxed">
            Lima tahap deterministik dari data mentah hingga klaim siap audit.
          </p>
        </div>

        {/* 5 Steps — horizontal on desktop */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-0 border border-border rounded-lg overflow-hidden divide-y md:divide-y-0 md:divide-x divide-border">
          {steps.map((step, i) => (
            <div key={step.id} className="relative p-7 bg-background hover:bg-surface transition-colors duration-300 group">
              {/* Number */}
              <div className="flex items-center justify-between mb-6">
                <span className="text-3xl font-mono font-light text-muted/40 select-none leading-none">{step.id}</span>
                {/* Progress dot */}
                <div className="h-2 w-2 rounded-full bg-border group-hover:bg-primary transition-colors duration-300" />
              </div>

              <h3 className="text-base font-semibold text-foreground mb-3">{step.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed font-light mb-5">{step.desc}</p>

              {/* Detail tags */}
              <div className="flex flex-wrap gap-1">
                {step.detail.split(" · ").map((tag) => (
                  <span key={tag} className="text-xs font-mono text-muted-foreground/70 bg-muted/50 px-2 py-1 rounded">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>

      </div>
    </section>
  );
}
