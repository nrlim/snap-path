export default function ProblemMatrix() {
  return (
    <section id="features" className="bg-[linear-gradient(180deg,var(--color-primary-soft)_0%,var(--color-surface-muted)_100%)] py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center mb-16">
          <h2 className="text-sm font-semibold leading-7 text-primary tracking-wide uppercase">
            The Paradigm Shift
          </h2>
          <p className="mt-2 text-3xl font-bold tracking-tight text-text sm:text-4xl">
            Beyond Traditional Clinical Review
          </p>
        </div>

        <div className="mx-auto grid max-w-5xl grid-cols-1 gap-8 md:grid-cols-2">
          {/* Traditional View */}
          <div className="flex h-full flex-col rounded-2xl border border-accent/35 bg-surface-elevated p-8 shadow-sm shadow-accent-soft/60">
            <h3 className="border-b border-border/60 pb-4 text-xl font-semibold text-text">
              <span className="text-accent">Traditional</span> Clinical Review
            </h3>
            <ul className="mt-6 space-y-5 text-sm leading-6 text-text-subtle">
              <li className="grid gap-1 sm:grid-cols-[9.5rem_1fr] sm:gap-4">
                <span className="font-semibold text-text">Manual Extraction</span>
                <span>Time-consuming chart reviews and fragmented data collection.</span>
              </li>
              <li className="grid gap-1 sm:grid-cols-[9.5rem_1fr] sm:gap-4">
                <span className="font-semibold text-text">Error-Prone</span>
                <span>High risk of overlooking critical patient history or interactions.</span>
              </li>
              <li className="grid gap-1 sm:grid-cols-[9.5rem_1fr] sm:gap-4">
                <span className="font-semibold text-text">Inconsistent</span>
                <span>Non-deterministic conclusions varying by individual reviewer.</span>
              </li>
            </ul>
          </div>

          {/* SnapPath View */}
          <div className="flex h-full flex-col rounded-2xl border-2 border-primary bg-gradient-to-br from-surface-elevated via-primary-soft/55 to-secondary-soft/45 p-8 shadow-sm shadow-primary/20">
            <h3 className="border-b border-border/60 pb-4 text-xl font-semibold text-text">
              <span className="text-primary">SnapPath</span> Orchestration
            </h3>
            <ul className="mt-6 space-y-5 text-sm leading-6 text-text-subtle">
              <li className="grid gap-1 sm:grid-cols-[9.5rem_1fr] sm:gap-4">
                <span className="font-semibold text-text">Automated Pipeline</span>
                <span>Instantaneous OCR and context-aware pathway generation.</span>
              </li>
              <li className="grid gap-1 sm:grid-cols-[9.5rem_1fr] sm:gap-4">
                <span className="font-semibold text-text">Validated</span>
                <span>Rigorous cross-validation against established clinical guidelines.</span>
              </li>
              <li className="grid gap-1 sm:grid-cols-[9.5rem_1fr] sm:gap-4">
                <span className="font-semibold text-text">Deterministic</span>
                <span>Reproducible, state-driven workflow orchestration via Local Engine.</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
