"use client";

import { updatePathwayLimitConfig } from "../actions";
import { useUI } from "@/components/providers/UIProvider";

type PathwayLimitsConfig = {
  pathwayDailyLimitViewer: number;
  pathwayDailyLimitClientUser: number;
  pathwayDailyLimitClientAdmin: number;
  pathwayDailyLimitAdmin: number;
  pathwayDailyLimitSuperAdmin: number;
};

type RoleLimitRow = {
  key: keyof PathwayLimitsConfig;
  role: string;
  description: string;
};

const rows: RoleLimitRow[] = [
  { key: "pathwayDailyLimitViewer", role: "VIEWER", description: "User baru/default. Direkomendasikan ketat untuk mencegah spam request." },
  { key: "pathwayDailyLimitClientUser", role: "CLIENT_USER", description: "User operasional client dengan kebutuhan validasi rutin." },
  { key: "pathwayDailyLimitClientAdmin", role: "CLIENT_ADMIN", description: "Admin client dengan volume lebih tinggi." },
  { key: "pathwayDailyLimitAdmin", role: "ADMIN", description: "Admin internal. Isi 0 untuk unlimited." },
  { key: "pathwayDailyLimitSuperAdmin", role: "SUPER_ADMIN", description: "Super admin internal. Isi 0 untuk unlimited." },
];

export default function PathwayLimitsForm({ config }: { config: PathwayLimitsConfig }) {
  const { showLoading, hideLoading, showNotification, showConfirm } = useUI();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    showConfirm({
      title: "Simpan Limit Clinical Pathway",
      message: "Perubahan limit akan langsung berlaku untuk request generate Clinical Pathway berikutnya.",
      confirmText: "Simpan",
      cancelText: "Batal",
      onConfirm: async () => {
        showLoading("Menyimpan konfigurasi limit...");
        try {
          const result = await updatePathwayLimitConfig(formData);
          if (result.success) {
            showNotification({ type: "success", title: "Berhasil", message: "Limit Clinical Pathway berhasil diperbarui." });
          } else {
            showNotification({ type: "error", title: "Gagal", message: result.error || "Gagal menyimpan konfigurasi." });
          }
        } catch {
          showNotification({ type: "error", title: "Gagal", message: "Terjadi kesalahan saat menyimpan konfigurasi." });
        } finally {
          hideLoading();
        }
      },
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="bg-gradient-to-r from-primary via-secondary to-accent bg-clip-text text-2xl font-bold tracking-tight text-transparent">Clinical Pathway Request Limits</h1>
        <p className="mt-1 max-w-3xl text-sm text-text-subtle">
          Atur batas generate Clinical Pathway per user per hari berdasarkan role. Nilai 0 berarti unlimited.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="overflow-hidden rounded-lg border border-border/80 bg-surface shadow-sm">
        <div className="border-b border-border bg-surface-elevated/70 px-4 py-3 sm:px-6">
          <p className="text-sm font-semibold text-text">Daily limit per role</p>
          <p className="mt-1 text-xs text-text-subtle">Default: VIEWER 3x/hari, CLIENT_USER 10x/hari.</p>
        </div>

        <div className="divide-y divide-border/70">
          {rows.map((row) => (
            <div key={row.key} className="grid gap-3 px-4 py-4 sm:grid-cols-[1fr_180px] sm:items-center sm:px-6">
              <div>
                <p className="text-sm font-bold text-text">{row.role}</p>
                <p className="mt-1 text-xs leading-relaxed text-text-subtle">{row.description}</p>
              </div>
              <div>
                <label htmlFor={row.key} className="sr-only">Limit {row.role}</label>
                <input
                  id={row.key}
                  name={row.key}
                  type="number"
                  min="0"
                  defaultValue={config[row.key]}
                  className="block min-h-11 w-full rounded-md border border-border bg-surface px-3 text-base text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary sm:text-sm"
                />
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-end border-t border-border bg-surface-elevated/50 px-4 py-4 sm:px-6">
          <button type="submit" className="inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-5 text-sm font-semibold text-white transition-colors hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2">
            Simpan Limit
          </button>
        </div>
      </form>
    </div>
  );
}
