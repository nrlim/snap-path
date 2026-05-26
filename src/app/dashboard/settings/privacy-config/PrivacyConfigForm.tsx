"use client";

import React, { useState } from 'react';
import { updatePrivacyConfig } from '../actions';
import { useUI } from '@/components/providers/UIProvider';

export default function PrivacyConfigForm({ 
  initialRedactPatterns, 
  initialSafeContexts 
}: { 
  initialRedactPatterns: string[], 
  initialSafeContexts: string[] 
}) {
  const { showLoading, hideLoading, showNotification, showConfirm } = useUI();
  
  const [redactPatterns, setRedactPatterns] = useState<string[]>(initialRedactPatterns);
  const [safeContexts, setSafeContexts] = useState<string[]>(initialSafeContexts);
  
  const [newRedact, setNewRedact] = useState('');
  const [newSafe, setNewSafe] = useState('');

  const handleAddPattern = (e: React.KeyboardEvent<HTMLInputElement> | React.MouseEvent<HTMLButtonElement>, type: 'redact' | 'safe') => {
    if ('key' in e && e.key !== 'Enter') return;
    e.preventDefault();

    if (type === 'redact') {
      const val = newRedact.trim();
      if (val && !redactPatterns.includes(val)) setRedactPatterns([...redactPatterns, val]);
      setNewRedact('');
    } else {
      const val = newSafe.trim();
      if (val && !safeContexts.includes(val)) setSafeContexts([...safeContexts, val]);
      setNewSafe('');
    }
  };

  const handleRemove = (item: string, type: 'redact' | 'safe') => {
    if (type === 'redact') setRedactPatterns(redactPatterns.filter(p => p !== item));
    else setSafeContexts(safeContexts.filter(p => p !== item));
  };

  const handleSubmit = async () => {
    showConfirm({
      title: "Simpan Konfigurasi Privasi",
      message: "Perubahan pola ini akan langsung mempengaruhi data apa saja yang disensor saat dikirim ke AI. Lanjutkan?",
      confirmText: "Ya, Simpan",
      cancelText: "Batal",
      onConfirm: async () => {
        showLoading("Menyimpan...");
        try {
          const res = await updatePrivacyConfig(redactPatterns, safeContexts);
          if (res.success) {
            showNotification({ type: 'success', title: 'Berhasil', message: 'Konfigurasi privasi berhasil disimpan.' });
          } else {
            showNotification({ type: 'error', title: 'Gagal', message: res.error || 'Terjadi kesalahan.' });
          }
        } catch (error) {
          showNotification({ type: 'error', title: 'Error', message: 'Error server tidak terduga.' });
        } finally {
          hideLoading();
        }
      }
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-primary via-secondary to-accent bg-clip-text text-transparent">
          Konfigurasi Privasi & PII AI
        </h1>
        <p className="text-sm text-text-subtle mt-1">
          Kelola kata kunci (patterns) yang harus disensor (redacted) dan konteks medis yang aman (whitelist) untuk diteruskan ke AI.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* REDACT PATTERNS */}
        <div className="rounded-lg border border-border/80 bg-surface shadow-sm overflow-hidden flex flex-col">
          <div className="px-5 py-4 border-b border-border/50 bg-surface-elevated/20">
            <h2 className="text-base font-semibold text-text">Data Disensor (Redacted)</h2>
            <p className="text-xs text-text-subtle mt-1">
              Field JSON yang mengandung kata-kata ini akan nilainya diganti dengan [REDACTED].
            </p>
          </div>
          <div className="p-5 flex-1 space-y-4">
            <div className="flex gap-2">
              <input
                type="text"
                value={newRedact}
                onChange={e => setNewRedact(e.target.value)}
                onKeyDown={e => handleAddPattern(e, 'redact')}
                placeholder="Contoh: kodepos"
                className="flex-1 rounded-md border border-border bg-surface px-3 py-2 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <button 
                type="button" 
                onClick={e => handleAddPattern(e, 'redact')}
                className="rounded-md bg-secondary px-3 py-2 text-sm font-medium text-white hover:bg-secondary-hover"
              >
                Tambah
              </button>
            </div>
            
            <div className="flex flex-wrap gap-2">
              {redactPatterns.map(pattern => (
                <div key={pattern} className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2.5 py-1 text-xs font-medium text-red-600 border border-red-500/20">
                  {pattern}
                  <button type="button" onClick={() => handleRemove(pattern, 'redact')} className="text-red-500 hover:text-red-700">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg>
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* SAFE CONTEXTS */}
        <div className="rounded-lg border border-border/80 bg-surface shadow-sm overflow-hidden flex flex-col">
          <div className="px-5 py-4 border-b border-border/50 bg-surface-elevated/20">
            <h2 className="text-base font-semibold text-text">Konteks Aman (Whitelist)</h2>
            <p className="text-xs text-text-subtle mt-1">
              Bypass aturan sensor di atas jika nama field mengandung konteks medis ini (contoh: diagnosisName).
            </p>
          </div>
          <div className="p-5 flex-1 space-y-4">
            <div className="flex gap-2">
              <input
                type="text"
                value={newSafe}
                onChange={e => setNewSafe(e.target.value)}
                onKeyDown={e => handleAddPattern(e, 'safe')}
                placeholder="Contoh: labResult"
                className="flex-1 rounded-md border border-border bg-surface px-3 py-2 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <button 
                type="button" 
                onClick={e => handleAddPattern(e, 'safe')}
                className="rounded-md bg-secondary px-3 py-2 text-sm font-medium text-white hover:bg-secondary-hover"
              >
                Tambah
              </button>
            </div>
            
            <div className="flex flex-wrap gap-2">
              {safeContexts.map(pattern => (
                <div key={pattern} className="inline-flex items-center gap-1 rounded-full bg-green-500/10 px-2.5 py-1 text-xs font-medium text-green-600 border border-green-500/20">
                  {pattern}
                  <button type="button" onClick={() => handleRemove(pattern, 'safe')} className="text-green-500 hover:text-green-700">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg>
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end pt-4">
        <button 
          onClick={handleSubmit} 
          className="inline-flex items-center justify-center rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-white shadow-sm shadow-primary/30 transition-colors hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-primary/40 focus:ring-offset-2"
        >
          Simpan Konfigurasi Privasi
        </button>
      </div>
    </div>
  );
}
