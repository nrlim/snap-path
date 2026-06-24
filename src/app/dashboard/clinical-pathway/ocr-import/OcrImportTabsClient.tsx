"use client";

import { useState } from "react";

import OcrUploadWizard from "../components/OcrUploadWizard";
import OcrJobsList from "./OcrJobsList";

type Tab = "UPLOAD" | "HISTORY";

export default function OcrImportTabsClient() {
  const [activeTab, setActiveTab] = useState<Tab>("UPLOAD");

  return (
    <div className="space-y-6">
      <div className="border-b border-slate-200">
        <nav className="-mb-px flex space-x-8" aria-label="Tabs">
          <button
            onClick={() => setActiveTab("UPLOAD")}
            className={`whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium ${
              activeTab === "UPLOAD"
                ? "border-sky-700 text-sky-700"
                : "border-transparent text-muted-foreground hover:border-slate-300 hover:text-foreground"
            }`}
          >
            Unggah Baru
          </button>
          <button
            onClick={() => setActiveTab("HISTORY")}
            className={`whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium ${
              activeTab === "HISTORY"
                ? "border-sky-700 text-sky-700"
                : "border-transparent text-muted-foreground hover:border-slate-300 hover:text-foreground"
            }`}
          >
            Riwayat OCR
          </button>
        </nav>
      </div>

      <div>
        {activeTab === "UPLOAD" ? <OcrUploadWizard /> : null}
        {activeTab === "HISTORY" ? <OcrJobsList /> : null}
      </div>
    </div>
  );
}
