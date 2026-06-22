"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createMedicalItem, updateMedicalItem } from "../actions";

export default function DrugForm({ item }: { item?: any }) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [formData, setFormData] = useState({
    itemName: "",
    itemGenericName: "",
    itemTypeCode: "medicine",
    itemTypeName: "Medicine",
    itemGroup: "pharmacy",
    marketPriceMax: "",
    marketPriceAvg: "",
    currency: "IDR",
    expiresAt: "",
  });

  useEffect(() => {
    if (item) {
      setFormData({
        itemName: item.itemName || "",
        itemGenericName: item.itemGenericName || "",
        itemTypeCode: item.itemTypeCode || "medicine",
        itemTypeName: item.itemTypeName || "Medicine",
        itemGroup: item.itemGroup || "pharmacy",
        marketPriceMax: item.marketPriceMax?.toString() || "",
        marketPriceAvg: item.marketPriceAvg?.toString() || "",
        currency: item.currency || "IDR",
        expiresAt: item.expiresAt ? new Date(item.expiresAt).toISOString().split('T')[0] : "",
      });
    } else {
      const nextYear = new Date();
      nextYear.setFullYear(nextYear.getFullYear() + 1);
      setFormData(prev => ({
        ...prev,
        expiresAt: nextYear.toISOString().split('T')[0]
      }));
    }
  }, [item]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const payload = {
        ...formData,
        marketPriceMax: Number(formData.marketPriceMax),
        marketPriceAvg: formData.marketPriceAvg ? Number(formData.marketPriceAvg) : null,
        expiresAt: formData.expiresAt ? new Date(formData.expiresAt).toISOString() : undefined,
      };

      const result = item 
        ? await updateMedicalItem(item.id, payload)
        : await createMedicalItem(payload);

      if (result.success) {
        router.push("/dashboard/master-data/obat");
        router.refresh();
      } else {
        alert(`Gagal menyimpan data: ${result.error}`);
      }
    } catch (error) {
      alert("Terjadi kesalahan sistem saat menyimpan data.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 w-full">
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">Nama Item (Unik)</label>
          <input required type="text" className="w-full rounded-md border border-border px-3 py-2 text-sm font-light text-foreground focus:ring-1 focus:ring-primary outline-none bg-background" value={formData.itemName} onChange={(e) => setFormData({ ...formData, itemName: e.target.value })} disabled={!!item} />
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">Nama Generik</label>
          <input type="text" className="w-full rounded-md border border-border px-3 py-2 text-sm font-light text-foreground focus:ring-1 focus:ring-primary outline-none bg-background" value={formData.itemGenericName} onChange={(e) => setFormData({ ...formData, itemGenericName: e.target.value })} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-3 pt-4 border-t border-border">
        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">Tipe Item</label>
          <select className="w-full rounded-md border border-border px-3 py-2 text-sm font-light text-foreground focus:ring-1 focus:ring-primary outline-none bg-background" value={formData.itemTypeCode} onChange={(e) => {
            const types: Record<string, string> = { medicine: "Obat", device: "Alat Kesehatan", vaccine: "Vaksin", supplement: "Suplemen" };
            setFormData({ ...formData, itemTypeCode: e.target.value, itemTypeName: types[e.target.value] || e.target.value });
          }}>
            <option value="medicine">Obat</option>
            <option value="device">Alat Kesehatan</option>
            <option value="vaccine">Vaksin</option>
            <option value="supplement">Suplemen</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">Kelompok (Group)</label>
          <select className="w-full rounded-md border border-border px-3 py-2 text-sm font-light text-foreground focus:ring-1 focus:ring-primary outline-none bg-background" value={formData.itemGroup} onChange={(e) => setFormData({ ...formData, itemGroup: e.target.value })}>
            <option value="pharmacy">Farmasi</option>
            <option value="medical supply">Persediaan Medis</option>
          </select>
        </div>
        
        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">Masa Berlaku (Valid Until)</label>
          <input required type="date" className="w-full rounded-md border border-border px-3 py-2 text-sm font-light text-foreground focus:ring-1 focus:ring-primary outline-none bg-background" value={formData.expiresAt} onChange={(e) => setFormData({ ...formData, expiresAt: e.target.value })} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 pt-4 border-t border-border">
        <div className="p-5 border border-border rounded-lg bg-muted/20">
          <label className="block text-sm font-medium text-foreground mb-1.5">Harga Maksimal (Rp)</label>
          <input required type="number" className="w-full rounded-md border border-border px-3 py-2 text-sm font-light tabular-nums text-foreground outline-none focus:ring-1 focus:ring-primary bg-background" value={formData.marketPriceMax} onChange={(e) => setFormData({ ...formData, marketPriceMax: e.target.value })} />
        </div>

        <div className="p-5 border border-border rounded-lg bg-muted/20">
          <label className="block text-sm font-medium text-foreground mb-1.5">Harga Rata-Rata / HET (Rp)</label>
          <input type="number" className="w-full rounded-md border border-border px-3 py-2 text-sm font-light tabular-nums text-foreground outline-none focus:ring-1 focus:ring-primary bg-background" value={formData.marketPriceAvg} onChange={(e) => setFormData({ ...formData, marketPriceAvg: e.target.value })} />
        </div>
      </div>

      <div className="pt-6 border-t border-border flex justify-end gap-3">
        <Link href="/dashboard/master-data/obat" className="px-5 py-2.5 text-sm font-medium text-foreground hover:bg-muted border border-border rounded-md transition-colors">
          Batal
        </Link>
        <button type="submit" disabled={isSubmitting} className="px-5 py-2.5 text-sm font-medium text-white bg-primary rounded-md shadow-sm hover:bg-primary/90 transition-colors disabled:opacity-50">
          {isSubmitting ? "Menyimpan..." : "Simpan Data"}
        </button>
      </div>
    </form>
  );
}
