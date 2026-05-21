export default function AIArchitecture() {
  return (
    <section id="technology" className="py-24 sm:py-32 bg-slate-50 border-y border-slate-200/50 dark:bg-zinc-900/50 dark:border-zinc-800/50">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-16 lg:grid-cols-2 lg:items-center">
          <div>
            <h2 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl dark:text-zinc-50">
              Decoupled AI Gateway
            </h2>
            <p className="mt-6 text-lg text-slate-600 dark:text-zinc-400 leading-relaxed">
              Built on a foundation of absolute flexibility. SnapPath&#39;s architecture strictly separates core business logic from AI inference providers. We maintain token-efficient state across agnostic drivers.
            </p>
            <ul className="mt-8 space-y-4 text-sm text-slate-600 dark:text-zinc-400">
              <li className="flex gap-x-3 items-center">
                <div className="h-1.5 w-1.5 rounded-full bg-slate-900 dark:bg-zinc-50"></div>
                Native support for Vercel AI SDK and Sumopod.
              </li>
              <li className="flex gap-x-3 items-center">
                <div className="h-1.5 w-1.5 rounded-full bg-slate-900 dark:bg-zinc-50"></div>
                Optimized latency routing via 9router integration.
              </li>
              <li className="flex gap-x-3 items-center">
                <div className="h-1.5 w-1.5 rounded-full bg-slate-900 dark:bg-zinc-50"></div>
                Type-safe strict validation ensuring zero hallucination propagation.
              </li>
            </ul>
          </div>

          <div className="relative">
            <div className="rounded-xl bg-slate-900 p-8 shadow-xl dark:bg-black border border-slate-800 dark:border-zinc-800">
              <pre className="text-sm leading-6 text-slate-300 dark:text-zinc-400 overflow-x-auto">
                <code>{`// src/lib/ai/gateway.ts
export class AIGateway {
  private driver: AIGatewayDriver;

  constructor(driver: AIGatewayDriver) {
    this.driver = driver;
  }

  async summarizePathway(data: ClinicalData) {
    // 1. Token-efficient pre-processing
    const optimizedContext = sanitize(data);
    
    // 2. Agnostic inference routing
    return await this.driver.generateText(
      PATHWAY_PROMPT, 
      optimizedContext
    );
  }
}`}</code>
              </pre>
            </div>
            <div className="absolute -inset-y-px -left-4 -z-10 w-full rounded-2xl bg-slate-100/50 dark:bg-zinc-900/50 sm:-left-8 sm:w-auto sm:right-4"></div>
          </div>
        </div>
      </div>
    </section>
  );
}
