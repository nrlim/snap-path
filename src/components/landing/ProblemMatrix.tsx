export default function ProblemMatrix() {
  return (
    <section id="features" className="py-24 sm:py-32 bg-slate-50 dark:bg-zinc-900/50">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center mb-16">
          <h2 className="text-sm font-semibold leading-7 text-slate-900 dark:text-zinc-400 tracking-wide uppercase">
            The Paradigm Shift
          </h2>
          <p className="mt-2 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl dark:text-zinc-50">
            Beyond Traditional Clinical Review
          </p>
        </div>

        <div className="mx-auto grid max-w-5xl grid-cols-1 gap-8 md:grid-cols-2">
          {/* Traditional View */}
          <div className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <h3 className="border-b border-slate-100 pb-4 text-xl font-semibold text-slate-900 dark:border-zinc-800/50 dark:text-zinc-50">
              Traditional Clinical Review
            </h3>
            <ul className="mt-6 space-y-5 text-sm leading-6 text-slate-600 dark:text-zinc-400">
              <li className="grid gap-1 sm:grid-cols-[9.5rem_1fr] sm:gap-4">
                <span className="font-semibold text-slate-900 dark:text-zinc-300">Manual Extraction</span>
                <span>Time-consuming chart reviews and fragmented data collection.</span>
              </li>
              <li className="grid gap-1 sm:grid-cols-[9.5rem_1fr] sm:gap-4">
                <span className="font-semibold text-slate-900 dark:text-zinc-300">Error-Prone</span>
                <span>High risk of overlooking critical patient history or interactions.</span>
              </li>
              <li className="grid gap-1 sm:grid-cols-[9.5rem_1fr] sm:gap-4">
                <span className="font-semibold text-slate-900 dark:text-zinc-300">Inconsistent</span>
                <span>Non-deterministic conclusions varying by individual reviewer.</span>
              </li>
            </ul>
          </div>

          {/* SnapPath View */}
          <div className="flex h-full flex-col rounded-2xl border-2 border-slate-900 bg-white p-8 shadow-sm dark:border-zinc-50 dark:bg-zinc-950">
            <h3 className="border-b border-slate-100 pb-4 text-xl font-semibold text-slate-900 dark:border-zinc-800/50 dark:text-zinc-50">
              SnapPath Orchestration
            </h3>
            <ul className="mt-6 space-y-5 text-sm leading-6 text-slate-600 dark:text-zinc-400">
              <li className="grid gap-1 sm:grid-cols-[9.5rem_1fr] sm:gap-4">
                <span className="font-semibold text-slate-900 dark:text-zinc-300">Automated Pipeline</span>
                <span>Instantaneous OCR and context-aware pathway generation.</span>
              </li>
              <li className="grid gap-1 sm:grid-cols-[9.5rem_1fr] sm:gap-4">
                <span className="font-semibold text-slate-900 dark:text-zinc-300">Validated</span>
                <span>Rigorous cross-validation against established clinical guidelines.</span>
              </li>
              <li className="grid gap-1 sm:grid-cols-[9.5rem_1fr] sm:gap-4">
                <span className="font-semibold text-slate-900 dark:text-zinc-300">Deterministic</span>
                <span>Reproducible, state-driven workflow orchestration via Upstash.</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
