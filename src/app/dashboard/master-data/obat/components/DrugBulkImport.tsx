"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { importMedicalItems } from "../actions";

export default function DrugBulkImport() {
  const [isImporting, setIsImporting] = useState(false);
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.type !== "application/json" && !file.name.endsWith(".json")) {
      alert("Hanya file JSON yang diizinkan.");
      return;
    }

    try {
      setIsImporting(true);
      const text = await file.text();
      const data = JSON.parse(text);

      if (!Array.isArray(data)) {
        alert("Format JSON tidak valid. Harus berupa array.");
        return;
      }

      const result = await importMedicalItems(data);
      if (result.success) {
        alert(`Berhasil mengimpor ${result.importedCount} data obat/farmalkes.`);
        router.refresh();
      } else {
        alert(`Gagal mengimpor: ${result.error}`);
      }
    } catch (error: any) {
      alert(`Error membaca file: ${error.message}`);
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  return (
    <>
      <input
        type="file"
        accept="application/json"
        className="hidden"
        ref={fileInputRef}
        onChange={handleFileChange}
      />
      <button
        onClick={() => fileInputRef.current?.click()}
        disabled={isImporting}
        className="inline-flex min-h-11 items-center justify-center rounded-md border border-border bg-card px-4 py-2 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-muted focus:outline-none disabled:opacity-50"
      >
        <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
        {isImporting ? "Mengimpor..." : "Import JSON"}
      </button>
    </>
  );
}
