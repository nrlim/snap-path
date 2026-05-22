"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createTariffEntry, updateTariffEntry } from "../actions";

export default function TariffForm({ initialData, providers }: { initialData?: any, providers: any[] }) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEdit = !!initialData;

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const data = Object.fromEntries(formData.entries()) as any;
    
    // Add missing booleans and formatting
    data.isActive = formData.get("isActive") === "on";

    try {
      const res = isEdit 
        ? await updateTariffEntry(initialData.id, data)
        : await createTariffEntry(data);

      if (res.success) {
        router.push("/dashboard/master-data/buku-tarif");
        router.refresh();
      } else {
        setError(res.error || "Failed to save data.");
        setIsSubmitting(false);
      }
    } catch (err: any) {
      setError(err.message);
      setIsSubmitting(false);
    }
  };

  // Convert Date to YYYY-MM-DD for input type="date"
  const formatDate = (dateString?: string) => {
    if (!dateString) return "";
    const d = new Date(dateString);
    return isNaN(d.getTime()) ? "" : d.toISOString().split("T")[0];
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="rounded-lg bg-red-50 p-4 text-sm text-red-600 border border-red-200">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2 md:col-span-2">
          <label className="text-sm font-medium text-text">Insurance Provider</label>
          <select 
            name="providerId" 
            defaultValue={initialData?.providerId || ""}
            required
            className="w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="" disabled>Select Provider...</option>
            {providers.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-text">Procedure Code (CPT / INA-CBG)</label>
          <input 
            type="text" 
            name="procedureCode" 
            defaultValue={initialData?.procedureCode || ""}
            required
            className="w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            placeholder="e.g., 87.44"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-text">Procedure Name</label>
          <input 
            type="text" 
            name="procedureName" 
            defaultValue={initialData?.procedureName || ""}
            required
            className="w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            placeholder="e.g., Routine chest x-ray"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-text">Category</label>
          <select 
            name="category" 
            defaultValue={initialData?.category || "RAWAT_JALAN"}
            required
            className="w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="RAWAT_INAP">Inpatient</option>
            <option value="RAWAT_JALAN">Outpatient</option>
            <option value="IGD">ER</option>
            <option value="OBAT">Pharmacy</option>
            <option value="LAB">Laboratory</option>
          </select>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-text">Region Code (Optional)</label>
          <input 
            type="text" 
            name="regionCode" 
            defaultValue={initialData?.regionCode || ""}
            className="w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            placeholder="e.g., JKT"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-text">Base Price</label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-text-subtle">Rp</span>
            <input 
              type="number" 
              name="basePrice" 
              defaultValue={initialData?.basePrice || ""}
              required
              min="0"
              className="w-full rounded-xl border border-border bg-surface pl-10 pr-4 py-2.5 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="0"
            />
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-text">Max Price</label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-text-subtle">Rp</span>
            <input 
              type="number" 
              name="maxPrice" 
              defaultValue={initialData?.maxPrice || ""}
              required
              min="0"
              className="w-full rounded-xl border border-border bg-surface pl-10 pr-4 py-2.5 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="0"
            />
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-text">Effective Start Date</label>
          <input 
            type="date" 
            name="effectiveFrom" 
            defaultValue={formatDate(initialData?.effectiveFrom)}
            required
            className="w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-text">Effective End Date (Optional)</label>
          <input 
            type="date" 
            name="effectiveTo" 
            defaultValue={formatDate(initialData?.effectiveTo)}
            className="w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        <div className="space-y-2 md:col-span-2 pt-4">
          <label className="flex items-center gap-3">
            <input 
              type="checkbox" 
              name="isActive" 
              defaultChecked={initialData ? initialData.isActive : true}
              className="h-5 w-5 rounded border-border text-primary focus:ring-primary"
            />
            <span className="text-sm font-medium text-text">Active Status</span>
          </label>
        </div>
      </div>

      <div className="pt-6 border-t border-border/80 flex items-center justify-end gap-4">
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-lg px-5 py-2.5 text-sm font-medium text-text-subtle hover:bg-surface-elevated hover:text-text transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-lg bg-primary px-6 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-primary-hover focus:ring-2 focus:ring-primary/40 focus:ring-offset-2 disabled:opacity-50 transition-all"
        >
          {isSubmitting ? 'Saving...' : 'Save Data'}
        </button>
      </div>
    </form>
  );
}
