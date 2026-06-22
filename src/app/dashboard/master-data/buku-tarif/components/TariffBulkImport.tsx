"use client";

import { useState } from "react";
import { bulkInsertTariffEntries } from "../actions";

export default function TariffBulkImport({ providers }: { providers: any[] }) {
  const [isOpen, setIsOpen] = useState(false);
  const [jsonText, setJsonText] = useState("");
  const [previewData, setPreviewData] = useState<any[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleParse = () => {
    try {
      setError(null);
      const parsed = JSON.parse(jsonText);
      if (!Array.isArray(parsed)) {
        throw new Error("JSON must be an array of objects.");
      }
      setPreviewData(parsed);
    } catch (e: any) {
      setError("Invalid JSON: " + e.message);
    }
  };

  const handleSubmit = async () => {
    if (!previewData || previewData.length === 0) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const res = await bulkInsertTariffEntries(previewData);
      if (res.success) {
        alert(`Successfully imported ${res.inserted} fee records.`);
        setIsOpen(false);
        setJsonText("");
        setPreviewData(null);
      } else {
        setError(res.error || "Failed to import data");
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setIsOpen(false);
    setJsonText("");
    setPreviewData(null);
    setError(null);
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center justify-center rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-text shadow-sm transition-colors hover:bg-surface-elevated focus:outline-none focus:ring-2 focus:ring-primary/40 focus:ring-offset-2"
      >
        <svg className="w-4 h-4 mr-2 text-text-subtle" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
        Import JSON
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 sm:p-6 backdrop-blur-sm">
          <div className="relative flex w-full max-w-4xl max-h-[90vh] flex-col rounded-lg bg-surface shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between border-b border-border/80 px-6 py-4">
              <h2 className="text-lg font-medium text-text">Bulk Import Fee Schedules</h2>
              <button onClick={handleClose} className="p-2 text-text-subtle hover:text-text rounded-full hover:bg-surface-elevated transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {!previewData ? (
                <div className="space-y-4">
                  <p className="text-sm text-text-subtle">
                    Paste JSON data as an array of objects. Format fields: <code>providerId, procedureCode, procedureName, category, basePrice, maxPrice, currency, effectiveFrom</code>.
                  </p>
                  {error && (
                    <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-600">
                      {error}
                    </div>
                  )}
                  <textarea
                    value={jsonText}
                    onChange={(e) => setJsonText(e.target.value)}
                    className="w-full h-64 rounded-xl border border-border bg-surface-elevated/50 p-4 font-mono text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                    placeholder="[ { ... } ]"
                  ></textarea>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-text">
                      Preview Data ({previewData.length} entries)
                    </p>
                    <button onClick={() => setPreviewData(null)} className="text-sm text-primary hover:underline">
                      Edit JSON
                    </button>
                  </div>
                  {error && (
                    <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-600">
                      {error}
                    </div>
                  )}
                  <div className="overflow-x-auto rounded-xl border border-border">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-surface-elevated/80 text-text-subtle">
                        <tr>
                          <th className="p-2 border-b border-border/60">Procedure Name</th>
                          <th className="p-2 border-b border-border/60">Code</th>
                          <th className="p-2 border-b border-border/60">Category</th>
                          <th className="p-2 border-b border-border/60">Provider ID</th>
                          <th className="p-2 border-b border-border/60 text-right">Base Price</th>
                        </tr>
                      </thead>
                      <tbody>
                        {previewData.slice(0, 50).map((row, idx) => (
                          <tr key={idx} className="border-b border-border/60 last:border-0 hover:bg-surface-elevated/30">
                            <td className="p-2 text-text truncate max-w-[220px]">{row.procedureName}</td>
                            <td className="p-2 font-mono text-text-subtle">{row.procedureCode}</td>
                            <td className="p-2 text-text">{row.category}</td>
                            <td className="p-2 text-text-subtle truncate max-w-[100px]">{row.providerId}</td>
                            <td className="p-2 text-text text-right">{row.basePrice}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {previewData.length > 50 && (
                      <div className="p-3 text-center text-xs text-text-subtle bg-surface-elevated/50">
                        ...and {previewData.length - 50} other records
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="border-t border-border/80 p-4 bg-surface-elevated/50 flex justify-end gap-3">
              <button onClick={handleClose} className="rounded-lg px-4 py-2 text-sm font-medium text-text-subtle hover:text-text hover:bg-surface transition-colors">
                Cancel
              </button>
              {!previewData ? (
                <button
                  onClick={handleParse}
                  disabled={!jsonText.trim()}
                  className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-primary-hover disabled:opacity-50 transition-colors"
                >
                  Preview Data
                </button>
              ) : (
                <button
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                  className="inline-flex items-center rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-green-700 disabled:opacity-50 transition-colors"
                >
                  {isSubmitting ? (
                    <>
                      <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                      Importing...
                    </>
                  ) : "Confirm Import"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
