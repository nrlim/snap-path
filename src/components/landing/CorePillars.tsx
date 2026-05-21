export default function CorePillars() {
  return (
    <section id="core-engine" className="py-24 sm:py-32 bg-white dark:bg-black">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center mb-16">
          <h2 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl dark:text-zinc-50">
            Three Pillars of Certainty
          </h2>
          <p className="mt-4 text-lg text-slate-600 dark:text-zinc-400">
            The foundation of our medical data processing engine.
          </p>
        </div>

        <div className="mx-auto grid max-w-5xl grid-cols-1 gap-8 md:grid-cols-3 text-center">
          {/* Pillar 1 */}
          <div className="flex flex-col items-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 dark:bg-zinc-900 mb-6 border border-slate-200 dark:border-zinc-800">
              <span className="text-2xl font-bold text-slate-900 dark:text-zinc-50">1</span>
            </div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-zinc-50 mb-3">
              Intelligent Summarization
            </h3>
            <p className="text-sm text-slate-600 dark:text-zinc-400 leading-relaxed">
              Condenses dense medical records into highly scannable, standardized clinical pathways optimized for physician review.
            </p>
          </div>

          {/* Pillar 2 */}
          <div className="flex flex-col items-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 dark:bg-zinc-900 mb-6 border border-slate-200 dark:border-zinc-800">
              <span className="text-2xl font-bold text-slate-900 dark:text-zinc-50">2</span>
            </div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-zinc-50 mb-3">
              Cross-Validation Engine
            </h3>
            <p className="text-sm text-slate-600 dark:text-zinc-400 leading-relaxed">
              Continuously verifies consistency between historical patient comorbidities and active treatment trajectories.
            </p>
          </div>

          {/* Pillar 3 */}
          <div className="flex flex-col items-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 dark:bg-zinc-900 mb-6 border border-slate-200 dark:border-zinc-800">
              <span className="text-2xl font-bold text-slate-900 dark:text-zinc-50">3</span>
            </div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-zinc-50 mb-3">
              Deterministic Workflows
            </h3>
            <p className="text-sm text-slate-600 dark:text-zinc-400 leading-relaxed">
              Guarantees strict data compliance across all pre-processing and post-processing stages via isolated state management.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
