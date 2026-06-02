"use client";

import React from "react";
import { updateThresholdConfig } from "../actions";
import { useUI } from "@/components/providers/UIProvider";

export default function ThresholdForm({ config }: { config: any }) {
  const { showLoading, hideLoading, showNotification, showConfirm } = useUI();

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    showConfirm({
      title: "Simpan Threshold",
      message: "Simpan konfigurasi threshold global di SystemConfig?",
      confirmText: "Ya, Simpan",
      cancelText: "Batal",
      onConfirm: async () => {
        showLoading("Menyimpan konfigurasi...");
        try {
          const res = await updateThresholdConfig(formData);
          showNotification({
            type: res.success ? "success" : "error",
            title: res.success ? "Berhasil" : "Gagal",
            message: res.success ? "Threshold berhasil disimpan." : res.error || "Gagal menyimpan konfigurasi.",
          });
        } catch {
          showNotification({ type: "error", title: "Error", message: "Terjadi kesalahan tak terduga." });
        } finally {
          hideLoading();
        }
      },
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="bg-gradient-to-r from-primary via-secondary to-accent bg-clip-text text-2xl font-bold tracking-tight text-transparent">Threshold Clinical Pathway</h1>
          <p className="mt-1 max-w-3xl text-sm text-text-subtle">
            Atur global tolerance limit untuk validasi tarif tindakan, obat/farmalkes, dan LOS. Nilai ini disimpan di SystemConfig.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="w-full animate-in fade-in duration-300">
        <section className="overflow-hidden rounded-lg border border-border/80 bg-surface shadow-sm">
          <div className="border-b border-border/60 px-6 py-4">
            <h2 className="text-base font-bold text-text">Global Threshold</h2>
            <p className="mt-1 text-sm text-text-subtle">Dipakai oleh validator dan dikirim sebagai parameter threshold ke AI LOS estimator.</p>
          </div>
          <div className="grid gap-x-8 gap-y-6 px-6 py-6 sm:grid-cols-3 sm:p-8">
            <ThresholdInput id="thresholdObatPct" name="thresholdObatPct" label="Obat/Farmalkes (%)" suffix="%" defaultValue={config.thresholdObatPct ?? 10.0} description="Toleransi overcharge/undercharge item obat dan farmalkes." />
            <ThresholdInput id="thresholdTindakanPct" name="thresholdTindakanPct" label="Tindakan (%)" suffix="%" defaultValue={config.thresholdTindakanPct ?? 10.0} description="Toleransi overcharge/undercharge tindakan terhadap master buku tarif." />
            <ThresholdInput id="thresholdLosDays" name="thresholdLosDays" label="LOS" suffix="Hari" defaultValue={config.thresholdLosDays ?? 1} description="Toleransi overstay dan understay terhadap standar LOS." />
          </div>
        </section>

        <div className="flex items-center justify-end gap-4 pt-6">
          <button type="submit" className="inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white shadow-sm shadow-primary/30 transition-colors hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-primary/40 focus:ring-offset-2">
            Save Thresholds
          </button>
        </div>
      </form>
    </div>
  );
}

function ThresholdInput({ id, name, label, suffix, defaultValue, description }: { id: string; name: string; label: string; suffix: string; defaultValue: number; description: string }) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-text">{label}</label>
      <div className="relative mt-2">
        <input id={id} name={name} type="number" step="0.1" min="0" defaultValue={defaultValue} className="block w-full rounded-md border border-border bg-surface px-3 py-2.5 pr-16 text-base text-text transition-colors focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary sm:text-sm" />
        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-xs text-text-subtle">{suffix}</div>
      </div>
      <p className="mt-2 text-xs leading-5 text-text-faint">{description}</p>
    </div>
  );
}
