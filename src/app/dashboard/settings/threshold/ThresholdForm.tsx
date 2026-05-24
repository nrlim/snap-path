"use client";

import React from 'react';
import { updateThresholdConfig } from '../actions';
import { useUI } from '@/components/providers/UIProvider';

export default function ThresholdForm({ config }: { config: any }) {
  const { showLoading, hideLoading, showNotification, showConfirm } = useUI();

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    
    showConfirm({
      title: "Save Configuration",
      message: "Are you sure you want to update the Threshold configuration?",
      confirmText: "Yes, Save",
      cancelText: "Cancel",
      onConfirm: async () => {
        showLoading("Saving configuration...");
        try {
          const res = await updateThresholdConfig(formData);
          if (res.success) {
            showNotification({ type: 'success', title: 'Success', message: 'Configuration updated successfully.' });
          } else {
            showNotification({ type: 'error', title: 'Error', message: res.error || 'Failed to update configuration.' });
          }
        } catch (error) {
          showNotification({ type: 'error', title: 'Error', message: 'An unexpected error occurred.' });
        } finally {
          hideLoading();
        }
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-primary via-secondary to-accent bg-clip-text text-transparent">Threshold Clinical Pathway</h1>
          <p className="text-sm text-text-subtle mt-1">
            Set global tolerance limits for Clinical Pathway validations.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="w-full animate-in fade-in duration-300">
        <div className="rounded-lg border border-border/80 bg-surface shadow-sm overflow-hidden">
          <div className="px-6 py-6 sm:p-8">
          <div className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
            
            {/* Obat Threshold */}
            <div>
              <label htmlFor="thresholdObatPct" className="block text-sm font-medium text-text">Toleransi Obat (%)</label>
              <div className="mt-2 relative">
                <input id="thresholdObatPct" name="thresholdObatPct" type="number" step="0.1" min="0" defaultValue={config.thresholdObatPct || 10.0} className="block w-full rounded-md border border-border bg-surface px-3 py-2.5 text-base sm:text-sm text-text transition-colors focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary" />
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-text-subtle">%</div>
              </div>
              <p className="mt-2 text-xs leading-5 text-text-faint">Batas persentase selisih harga/jumlah obat yang masih dianggap wajar.</p>
            </div>

            {/* Tindakan Threshold */}
            <div>
              <label htmlFor="thresholdTindakanPct" className="block text-sm font-medium text-text">Toleransi Tindakan (%)</label>
              <div className="mt-2 relative">
                <input id="thresholdTindakanPct" name="thresholdTindakanPct" type="number" step="0.1" min="0" defaultValue={config.thresholdTindakanPct || 10.0} className="block w-full rounded-md border border-border bg-surface px-3 py-2.5 text-base sm:text-sm text-text transition-colors focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary" />
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-text-subtle">%</div>
              </div>
              <p className="mt-2 text-xs leading-5 text-text-faint">Batas persentase selisih biaya tindakan dari harga master data.</p>
            </div>

            {/* LOS Threshold */}
            <div>
              <label htmlFor="thresholdLosDays" className="block text-sm font-medium text-text">Toleransi LOS (Hari)</label>
              <div className="mt-2 relative">
                <input id="thresholdLosDays" name="thresholdLosDays" type="number" min="0" defaultValue={config.thresholdLosDays || 1} className="block w-full rounded-md border border-border bg-surface px-3 py-2.5 text-base sm:text-sm text-text transition-colors focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary" />
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-text-subtle">Hari</div>
              </div>
              <p className="mt-2 text-xs leading-5 text-text-faint">Batas maksimal kelebihan hari rawat inap dari standar.</p>
            </div>

          </div>
        </div>
      </div>
        <div className="flex items-center justify-end gap-4 pt-6">
          <button type="submit" className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white shadow-sm shadow-primary/30 transition-colors hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-primary/40 focus:ring-offset-2">
            Save Thresholds
          </button>
        </div>
      </form>
    </div>
  );
}
