import { Check, X } from "lucide-react";

// Before/After content — unique to this section (not repeated in Hero or elsewhere)
const beforeItems = [
  { label: "Ekstraksi manual tiap file", sub: "Data tersebar, proses lambat" },
  { label: "Inkonsistensi antar reviewer", sub: "Risiko perbedaan interpretasi" },
  { label: "Audit tanpa jejak standar", sub: "Sulit dipertanggungjawabkan" },
];

const afterItems = [
  { label: "Pipeline otomatis terpadu", sub: "Import JSON, normalisasi instan" },
  { label: "Validasi berlapis konsisten", sub: "Diagnosis, tarif, LOS, dokumen" },
  { label: "Setiap keputusan terekam", sub: "Siap audit kapan saja" },
];

export default function ProblemMatrix() {
  return (
    <section id="features" className="bg-surface min-h-screen flex items-center py-20">
      <div className="mx-auto max-w-7xl px-6 lg:px-8 w-full">

        {/* Header */}
        <div className="max-w-xl mb-14">
          <p className="text-sm font-mono text-primary/60 tracking-[0.2em] uppercase mb-4">Konteks Masalah</p>
          <h2 className="text-3xl font-light tracking-tight text-foreground sm:text-4xl leading-snug">
            Dari review manual<br />
            <span className="font-semibold text-primary">menjadi workflow yang terstruktur.</span>
          </h2>
        </div>

        {/* Comparison grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 border border-border rounded-lg overflow-hidden divide-y lg:divide-y-0 lg:divide-x divide-border">

          {/* Before */}
          <div className="p-8 lg:p-10 bg-background">
            <p className="text-sm font-mono text-muted-foreground uppercase tracking-widest mb-8 pb-5 border-b border-border/50">
              Tanpa CONSUL — Review Manual
            </p>
            <ul className="space-y-6">
              {beforeItems.map((item, i) => (
                <li key={i} className="flex items-start gap-4">
                  <div className="mt-0.5 flex-shrink-0 h-6 w-6 rounded flex items-center justify-center bg-muted">
                    <X className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                  <div>
                    <span className="block text-base font-medium text-foreground mb-1">{item.label}</span>
                    <span className="text-base text-muted-foreground font-light">{item.sub}</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {/* After */}
          <div className="p-8 lg:p-10 bg-surface">
            <p className="text-sm font-mono text-primary uppercase tracking-widest mb-8 pb-5 border-b border-primary/15">
              Dengan CONSUL — Workflow Terstruktur
            </p>
            <ul className="space-y-6">
              {afterItems.map((item, i) => (
                <li key={i} className="flex items-start gap-4">
                  <div className="mt-0.5 flex-shrink-0 h-6 w-6 rounded flex items-center justify-center bg-primary/10">
                    <Check className="h-3.5 w-3.5 text-primary" />
                  </div>
                  <div>
                    <span className="block text-base font-semibold text-foreground mb-1">{item.label}</span>
                    <span className="text-base text-muted-foreground font-light">{item.sub}</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>

        </div>

      </div>
    </section>
  );
}
