export default function AIArchitecture() {
  return (
    <section id="technology" className="border-y border-secondary/15 bg-[linear-gradient(135deg,var(--color-secondary-soft)_0%,var(--color-surface-elevated)_48%,var(--color-primary-soft)_100%)] py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-16 lg:grid-cols-2 lg:items-center">
          <div>
            <h2 className="text-3xl font-bold tracking-tight text-text sm:text-4xl">
              Decoupled AI Gateway
            </h2>
            <p className="mt-6 text-lg text-text-subtle leading-relaxed">
              Built on a foundation of absolute flexibility. SnapPath&#39;s architecture strictly separates core business logic from AI inference providers. We maintain token-efficient state across agnostic drivers.
            </p>
            <ul className="mt-8 space-y-4 text-sm text-text-subtle">
              <li className="flex gap-x-3 items-center">
                <div className="h-2 w-2 rounded-full bg-primary"></div>
                Native support for Vercel AI SDK and Sumopod.
              </li>
              <li className="flex gap-x-3 items-center">
                <div className="h-2 w-2 rounded-full bg-secondary"></div>
                Optimized latency routing via 9router integration.
              </li>
              <li className="flex gap-x-3 items-center">
                <div className="h-2 w-2 rounded-full bg-accent"></div>
                Type-safe strict validation ensuring zero hallucination propagation.
              </li>
            </ul>
          </div>

          <div className="relative">
            <div className="rounded-xl bg-code p-8 shadow-xl shadow-surface-accent/50 border border-primary-hover/40">
              <pre className="text-sm leading-6 text-surface-muted overflow-x-auto">
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
            <div className="absolute -inset-y-px -left-4 -z-10 w-full rounded-2xl bg-secondary/20 sm:-left-8 sm:w-auto sm:right-4"></div>
          </div>
        </div>
      </div>
    </section>
  );
}
