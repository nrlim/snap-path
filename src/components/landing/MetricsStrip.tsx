export default function MetricsStrip() {
  return (
    <section className="border-y border-border/40 bg-background relative z-10">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-8 py-10 sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex flex-col gap-y-2">
            <dt className="text-sm font-medium text-muted-foreground">Proses per klaim</dt>
            <dd className="text-3xl font-mono font-semibold tracking-tight text-foreground">&lt; 30d</dd>
          </div>
          <div className="flex flex-col gap-y-2">
            <dt className="text-sm font-medium text-muted-foreground">Validasi berlapis</dt>
            <dd className="text-3xl font-mono font-semibold tracking-tight text-foreground">5 Langkah</dd>
          </div>
          <div className="flex flex-col gap-y-2">
            <dt className="text-sm font-medium text-muted-foreground">Sanitasi Data</dt>
            <dd className="text-3xl font-mono font-semibold tracking-tight text-foreground">100%</dd>
          </div>
          <div className="flex flex-col gap-y-2">
            <dt className="text-sm font-medium text-muted-foreground">Kepatuhan Audit</dt>
            <dd className="text-3xl font-mono font-semibold tracking-tight text-foreground">Penuh</dd>
          </div>
        </div>
      </div>
    </section>
  );
}
