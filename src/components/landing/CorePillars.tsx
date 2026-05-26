export default function CorePillars() {
  return (
    <section id="core-engine" className="bg-[linear-gradient(180deg,var(--color-surface-muted)_0%,var(--color-surface-elevated)_55%,var(--color-surface)_100%)] py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center mb-16">
          <h2 className="text-3xl font-bold tracking-tight text-text sm:text-4xl">
            Mesin inti SnapPath
          </h2>
          <p className="mt-4 text-lg text-text-subtle">
            Dibangun untuk kebutuhan operasional klaim dan pathway klinis di lingkungan healthcare Indonesia.
          </p>
        </div>

        <div className="mx-auto grid max-w-5xl grid-cols-1 gap-8 md:grid-cols-3 text-center">
          {/* Pillar 1 */}
          <div className="flex flex-col items-center">
            <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full border border-primary/20 bg-primary text-white shadow-sm shadow-primary/25">
              <span className="text-2xl font-bold">1</span>
            </div>
            <h3 className="text-lg font-semibold text-text mb-3">
              Clinical Pathway Generator
            </h3>
            <p className="text-sm text-text-subtle leading-relaxed">
              Menghasilkan pathway klinis dengan estimasi LOS, fase perawatan, asesmen, terapi, obat, edukasi, dan kriteria discharge.
            </p>
          </div>

          {/* Pillar 2 */}
          <div className="flex flex-col items-center">
            <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full border border-secondary/20 bg-secondary text-background shadow-sm shadow-secondary/25">
              <span className="text-2xl font-bold">2</span>
            </div>
            <h3 className="text-lg font-semibold text-text mb-3">
              Claim Validation Engine
            </h3>
            <p className="text-sm text-text-subtle leading-relaxed">
              Memvalidasi diagnosis-tindakan, tarif, obat, dokumen, dan LOS dengan status item yang eksplisit seperti over threshold, under priced, atau not found.
            </p>
          </div>

          {/* Pillar 3 */}
          <div className="flex flex-col items-center">
            <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full border border-accent/20 bg-accent text-white shadow-sm shadow-accent/25">
              <span className="text-2xl font-bold">3</span>
            </div>
            <h3 className="text-lg font-semibold text-text mb-3">
              Tenant-ready API & Usage Logs
            </h3>
            <p className="text-sm text-text-subtle leading-relaxed">
              Mendukung client/provider, API key per environment, workflow background, serta log token AI untuk kontrol biaya dan audit operasional.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
