import { getSession } from '@/lib/auth'
import { PasswordInput } from '@/components/PasswordInput'

export default async function SettingsPage() {
  const session = await getSession()
  const email = typeof session?.email === 'string' ? session.email : 'Not available'

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white/90 p-6 backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-950/90">
        <p className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-zinc-500">
          Settings
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900 dark:text-zinc-50">
          Operational configuration
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600 dark:text-zinc-400">
          Update account metadata, AI gateway routing, and workflow concurrency limits before enabling clinical pathway processing.
        </p>
      </div>

      <form className="space-y-6">


        <section className="rounded-2xl border border-slate-200 bg-white/90 p-6 backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-950/90">
          <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-zinc-50">AI Gateway</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-zinc-400">
                Configure routing and fallback behavior for AI inference providers.
              </p>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label htmlFor="primaryProvider" className="block text-sm font-medium text-slate-700 dark:text-zinc-300">
                  Primary provider
                </label>
                <select
                  id="primaryProvider"
                  name="primaryProvider"
                  defaultValue="vercel-ai-sdk"
                  className="mt-1.5 block min-h-11 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 transition-colors focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-500/20 dark:border-zinc-700 dark:bg-black dark:text-zinc-50 dark:focus:border-zinc-400 dark:focus:ring-zinc-400/20"
                >
                  <option value="vercel-ai-sdk">Vercel AI SDK</option>
                  <option value="sumopod">Sumopod</option>
                  <option value="custom">Custom Gateway</option>
                </select>
              </div>
              <div>
                <label htmlFor="fallbackProvider" className="block text-sm font-medium text-slate-700 dark:text-zinc-300">
                  Fallback provider
                </label>
                <select
                  id="fallbackProvider"
                  name="fallbackProvider"
                  defaultValue="sumopod"
                  className="mt-1.5 block min-h-11 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 transition-colors focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-500/20 dark:border-zinc-700 dark:bg-black dark:text-zinc-50 dark:focus:border-zinc-400 dark:focus:ring-zinc-400/20"
                >
                  <option value="sumopod">Sumopod</option>
                  <option value="vercel-ai-sdk">Vercel AI SDK</option>
                  <option value="disabled">Disabled</option>
                </select>
              </div>
              <div>
                <label htmlFor="latencyRouter" className="block text-sm font-medium text-slate-700 dark:text-zinc-300">
                  Latency router
                </label>
                <select
                  id="latencyRouter"
                  name="latencyRouter"
                  defaultValue="9router"
                  className="mt-1.5 block min-h-11 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 transition-colors focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-500/20 dark:border-zinc-700 dark:bg-black dark:text-zinc-50 dark:focus:border-zinc-400 dark:focus:ring-zinc-400/20"
                >
                  <option value="9router">9router</option>
                  <option value="provider-default">Provider Default</option>
                  <option value="disabled">Disabled</option>
                </select>
              </div>
              <div>
                <label htmlFor="timeout" className="block text-sm font-medium text-slate-700 dark:text-zinc-300">
                  Request timeout
                </label>
                <div className="mt-1.5 flex rounded-md border border-slate-300 bg-white focus-within:border-slate-500 focus-within:ring-2 focus-within:ring-slate-500/20 dark:border-zinc-700 dark:bg-black dark:focus-within:border-zinc-400 dark:focus-within:ring-zinc-400/20">
                  <input
                    id="timeout"
                    name="timeout"
                    type="number"
                    min="5"
                    defaultValue="30"
                    className="min-h-11 min-w-0 flex-1 rounded-md bg-transparent px-3 py-2 text-sm text-slate-900 focus:outline-none dark:text-zinc-50"
                  />
                  <span className="inline-flex items-center border-l border-slate-200 px-3 text-sm text-slate-500 dark:border-zinc-800 dark:text-zinc-500">
                    seconds
                  </span>
                </div>
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="gatewayKey" className="block text-sm font-medium text-slate-700 dark:text-zinc-300">
                  Gateway API key reference
                </label>
                <PasswordInput
                  id="gatewayKey"
                  name="gatewayKey"
                  placeholder="Stored secret reference or environment key"
                />
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white/90 p-6 backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-950/90">
          <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-zinc-50">Concurrent Workflows</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-zinc-400">
                Set deterministic execution boundaries for summarization and validation jobs.
              </p>
            </div>

            <div className="grid gap-5 sm:grid-cols-3">
              <div>
                <label htmlFor="maxConcurrent" className="block text-sm font-medium text-slate-700 dark:text-zinc-300">
                  Maximum concurrent jobs
                </label>
                <input
                  id="maxConcurrent"
                  name="maxConcurrent"
                  type="number"
                  min="1"
                  max="20"
                  defaultValue="3"
                  className="mt-1.5 block min-h-11 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 transition-colors focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-500/20 dark:border-zinc-700 dark:bg-black dark:text-zinc-50 dark:focus:border-zinc-400 dark:focus:ring-zinc-400/20"
                />
              </div>
              <div>
                <label htmlFor="retryLimit" className="block text-sm font-medium text-slate-700 dark:text-zinc-300">
                  Retry limit
                </label>
                <input
                  id="retryLimit"
                  name="retryLimit"
                  type="number"
                  min="0"
                  max="5"
                  defaultValue="2"
                  className="mt-1.5 block min-h-11 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 transition-colors focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-500/20 dark:border-zinc-700 dark:bg-black dark:text-zinc-50 dark:focus:border-zinc-400 dark:focus:ring-zinc-400/20"
                />
              </div>
              <div>
                <label htmlFor="queuePriority" className="block text-sm font-medium text-slate-700 dark:text-zinc-300">
                  Queue priority
                </label>
                <select
                  id="queuePriority"
                  name="queuePriority"
                  defaultValue="balanced"
                  className="mt-1.5 block min-h-11 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 transition-colors focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-500/20 dark:border-zinc-700 dark:bg-black dark:text-zinc-50 dark:focus:border-zinc-400 dark:focus:ring-zinc-400/20"
                >
                  <option value="balanced">Balanced</option>
                  <option value="throughput">Throughput</option>
                  <option value="conservative">Conservative</option>
                </select>
              </div>
            </div>
          </div>
        </section>

        <div className="flex justify-end gap-3">
          <button
            type="reset"
            className="inline-flex min-h-11 items-center justify-center rounded-md border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900 dark:focus:ring-zinc-300 dark:focus:ring-offset-black"
          >
            Reset
          </button>
          <button
            type="submit"
            className="inline-flex min-h-11 items-center justify-center rounded-md bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200 dark:focus:ring-zinc-300 dark:focus:ring-offset-zinc-950"
          >
            Save configuration
          </button>
        </div>
      </form>
    </div>
  )
}
