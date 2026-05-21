import Link from "next/link";

export default function Hero() {
  return (
    <section className="relative overflow-hidden pt-24 pb-32 sm:pt-32 sm:pb-40 border-b border-slate-200/60 dark:border-zinc-800/60">
      {/* Subtle Background Pattern - Grid */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]"></div>

      <div className="relative mx-auto max-w-7xl px-6 lg:px-8 text-center">
        <div className="mx-auto max-w-4xl">
          <h1 className="text-5xl font-bold tracking-tight text-slate-900 sm:text-7xl dark:text-zinc-50">
            Transform Raw Patient Data into Structured, Validated Clinical Pathways.
          </h1>
          <p className="mt-8 text-lg leading-8 text-slate-600 sm:text-xl dark:text-zinc-400 max-w-2xl mx-auto">
            Our summarization engine and multi-gateway AI architecture intelligently orchestrates medical records into actionable deterministic pathways.
          </p>

          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-x-4">
            <Link
              href="#features"
              className="inline-flex min-h-11 items-center justify-center rounded-md bg-slate-900 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200 dark:focus:ring-zinc-300 dark:focus:ring-offset-black"
            >
Explore Capabilities
            </Link>
            <Link
              href="#technology"
              className="inline-flex min-h-11 items-center justify-center rounded-md border border-slate-300 bg-white/70 px-6 py-3 text-sm font-semibold text-slate-900 transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2 dark:border-zinc-700 dark:bg-black/40 dark:text-zinc-50 dark:hover:bg-zinc-900 dark:focus:ring-zinc-300 dark:focus:ring-offset-black"
            >
Review Architecture
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
