"use client";

import { useState, useEffect, useRef } from "react";
import PathwayImportModal from "./PathwayImportModal";
import { getTariffEntries } from "../../master-data/buku-tarif/actions";
import { REQUIRED_CLAIM_DOCUMENTS } from "@/lib/claim-documents";

const STEPS = [
  { num: 1, label: "Identity", subLabel: "Patient Data" },
  { num: 2, label: "Encounter", subLabel: "Care Episode" },
  { num: 3, label: "Documents", subLabel: "Supporting Files" },
  { num: 4, label: "Diagnosis", subLabel: "ICD-10" },
  { num: 5, label: "Procedures", subLabel: "Procedures" },
  { num: 6, label: "Medications", subLabel: "Medications" },
  { num: 7, label: "Inpatient", subLabel: "Justification" },
  { num: 8, label: "Outcome", subLabel: "Clinical Notes" }
];

function AutocompleteInput({ 
  value, 
  onChange, 
  onSelect,
  options, 
  placeholder
}: {
  value: string;
  onChange: (val: string) => void;
  onSelect?: (option: any) => void;
  options: { label: string; value: string; subLabel?: string; data?: any }[];
  placeholder?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredOptions = options.filter(opt => 
    opt.label.toLowerCase().includes(value.toLowerCase()) || 
    (opt.subLabel && opt.subLabel.toLowerCase().includes(value.toLowerCase())) ||
    opt.value.toLowerCase().includes(value.toLowerCase())
  );

  return (
    <div className="relative w-full" ref={wrapperRef}>
      <input
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        className="w-full rounded-md border border-border bg-surface px-2 py-1 text-base sm:text-sm text-text focus:border-primary focus:ring-1 focus:ring-primary"
        placeholder={placeholder}
      />
      
      {isOpen && filteredOptions.length > 0 && (
        <ul className="absolute z-50 mt-1 max-h-48 w-full overflow-auto rounded-md border border-border bg-surface-elevated py-1 text-sm shadow-[0_4px_20px_-4px_rgba(0,0,0,0.3)]">
          {filteredOptions.map((opt, i) => (
            <li
              key={i}
              className="cursor-pointer px-3 py-1.5 hover:bg-primary/10 hover:text-primary transition-colors flex flex-col"
              onClick={() => {
                onChange(opt.label);
                if (onSelect) onSelect(opt);
                setIsOpen(false);
              }}
            >
              <div className="font-medium truncate">{opt.label}</div>
              {opt.subLabel && <div className="text-[10px] text-text-subtle truncate">{opt.subLabel}</div>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function PathwayWizard({ providers }: { providers: any[] }) {
  const [step, setStep] = useState(1);
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  // Submit handling
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadingDocuments, setUploadingDocuments] = useState<Record<number, boolean>>({});

  // Tariffs state for autocomplete
  const [providerTariffs, setProviderTariffs] = useState<any[]>([]);

  // Form State
  const [formData, setFormData] = useState<any>({
    patient: { name: "", identifier: [], birthDate: "", gender: "" },
    encounter: { class: { code: "" }, period: { start: "", end: "" } },
    diagnoses: [],
    procedures: [],
    medications: [],
    documents: [],
    // Form UI specific fields
    extra: {
      nik: "",
      phone: "",
      insuranceType: "",
      insuranceNumber: "",
      los: "",
      losJustification: "",
      outcomeNotes: "",
      providerId: providers.length > 0 ? providers[0].id : ""
    }
  });

  const handleImport = (parsed: any) => {
    // Try to extract extra fields if they exist in some custom way, otherwise keep defaults
    setFormData((prev: any) => ({
      ...prev,
      patient: parsed.patient || prev.patient,
      encounter: parsed.encounter || prev.encounter,
      diagnoses: parsed.diagnoses || [],
      procedures: parsed.procedures || [],
      medications: parsed.medications || [],
      documents: parsed.documents || [],
      extra: { ...prev.extra, ...(parsed.extra || {}) }
    }));
    setStep(8);
  };

  // Fetch tariffs when provider changes
  useEffect(() => {
    if (formData.extra.providerId) {
      getTariffEntries({ providerId: formData.extra.providerId, limit: 1000 }).then(res => {
        if (res.entries) setProviderTariffs(res.entries);
      }).catch(console.error);
    }
  }, [formData.extra.providerId]);

  const documentOptions = REQUIRED_CLAIM_DOCUMENTS.map((documentType) => ({
    label: documentType,
    value: documentType,
  }));

  const handleAddDocument = () => {
    setFormData((prev: any) => ({
      ...prev,
      documents: [...(prev.documents || []), { type: "", date: new Date().toISOString(), conclusion: "" }]
    }));
  };
  
  const handleAddDiagnosis = () => {
    setFormData((prev: any) => ({
      ...prev,
      diagnoses: [...(prev.diagnoses || []), { code: "", name: "", type: "secondary" }]
    }));
  };

  const handleAddProcedure = () => {
    setFormData((prev: any) => ({
      ...prev,
      procedures: [...(prev.procedures || []), { code: "", name: "", quantity: 1 }]
    }));
  };

  const handleAddMedication = () => {
    setFormData((prev: any) => ({
      ...prev,
      medications: [...(prev.medications || []), { name: "", quantity: 1 }]
    }));
  };

  const handleRemoveItem = (field: string, index: number) => {
    if (field === "documents" && formData.documents?.[index]?.storagePath) {
      fetch('/api/v1/documents/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storagePath: formData.documents[index].storagePath })
      }).catch(err => console.error("Failed to delete from storage", err));
    }

    setFormData((prev: any) => {
      const newArr = [...(prev[field] || [])];
      newArr.splice(index, 1);
      return { ...prev, [field]: newArr };
    });
  };

  const updateItem = (field: string, index: number, key: string, value: any) => {
    setFormData((prev: any) => {
      const newArr = [...(prev[field] || [])];
      newArr[index] = { ...newArr[index], [key]: value };
      return { ...prev, [field]: newArr };
    });
  };

  const handleDocumentUpload = async (index: number, file: File | null) => {
    if (!file) return;

    const document = formData.documents?.[index];
    if (!document?.type) {
      setError('Pilih tipe dokumen sebelum upload file.');
      return;
    }

    setError(null);
    setUploadingDocuments((prev) => ({ ...prev, [index]: true }));

    try {
      const uploadFormData = new FormData();
      uploadFormData.append('file', file);
      uploadFormData.append('documentType', document.type);
      uploadFormData.append('claimId', formData.extra?.claimId || formData.patient?.identifier?.[0]?.value || 'draft');

      const response = await fetch('/api/v1/documents/upload', {
        method: 'POST',
        body: uploadFormData,
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Upload dokumen gagal.');
      }

      setFormData((prev: any) => {
        const newDocuments = [...(prev.documents || [])];
        newDocuments[index] = {
          ...newDocuments[index],
          url: result.document.url,
          storageBucket: result.document.storageBucket,
          storagePath: result.document.storagePath,
          fileName: result.document.fileName,
          fileSize: result.document.fileSize,
          mimeType: result.document.mimeType,
          uploadedAt: result.document.uploadedAt,
        };
        return { ...prev, documents: newDocuments };
      });
    } catch (uploadError: any) {
      setError(uploadError.message || 'Upload dokumen gagal.');
    } finally {
      setUploadingDocuments((prev) => ({ ...prev, [index]: false }));
    }
  };

  const handleProcedureNameChange = (index: number, value: string, code?: string, price?: number) => {
    setFormData((prev: any) => {
      const newArr = [...(prev.procedures || [])];
      newArr[index] = { ...newArr[index], name: value };
      if (code) newArr[index].code = code;
      if (price !== undefined) newArr[index].price = price;
      return { ...prev, procedures: newArr };
    });
  };

  const handleMedicationNameChange = (index: number, value: string, price?: number) => {
    setFormData((prev: any) => {
      const newArr = [...(prev.medications || [])];
      newArr[index] = { ...newArr[index], name: value };
      if (price !== undefined) newArr[index].price = price;
      return { ...prev, medications: newArr };
    });
  };

  const handleNext = () => {
    if (step < 8) setStep(step + 1);
  };

  const handlePrev = () => {
    if (step > 1) setStep(step - 1);
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      // Reconstruct payload as expected by API
      const payload = {
        patient: formData.patient,
        encounter: formData.encounter,
        diagnoses: formData.diagnoses,
        procedures: (formData.procedures || []).map((proc: any) => ({
          ...proc,
          description: proc.description || proc.name || proc.procedureName || proc.code,
          unitPrice: proc.unitPrice ?? proc.price ?? 0,
          totalPrice: proc.totalPrice ?? ((proc.unitPrice ?? proc.price ?? 0) * (proc.quantity || 1)),
        })),
        medications: (formData.medications || []).map((med: any) => ({
          ...med,
          unitPrice: med.unitPrice ?? med.price ?? 0,
          totalPrice: med.totalPrice ?? ((med.unitPrice ?? med.price ?? 0) * (med.quantity || 1)),
        })),
        documents: formData.documents,
        providerId: formData.extra.providerId,
        extra: formData.extra,
      };

      window.dispatchEvent(new CustomEvent("snappath:start-claim-workflow", { detail: { payload } }));
      setIsSubmitting(false);
    } catch (e: any) {
      setError(e.message);
      setIsSubmitting(false);
    }
  };

  // --- Step Renderers ---

  const renderStep1 = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label className="block text-sm font-medium text-text mb-1">Full Name <span className="text-red-500">*</span></label>
          <input type="text" value={formData.patient?.name || ''} onChange={(e) => setFormData({...formData, patient: {...formData.patient, name: e.target.value}})} className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text focus:border-primary focus:ring-1 focus:ring-primary" placeholder="Name as in ID" />
        </div>
        <div>
          <label className="block text-sm font-medium text-text mb-1">NIK <span className="text-red-500">*</span></label>
          <input type="text" value={formData.extra.nik} onChange={(e) => setFormData({...formData, extra: {...formData.extra, nik: e.target.value}})} className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text focus:border-primary focus:ring-1 focus:ring-primary" placeholder="16 digit NIK" />
        </div>
        <div>
          <label className="block text-sm font-medium text-text mb-1">Date of Birth <span className="text-red-500">*</span></label>
          <input type="date" value={formData.patient?.birthDate || ''} onChange={(e) => setFormData({...formData, patient: {...formData.patient, birthDate: e.target.value}})} className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text focus:border-primary focus:ring-1 focus:ring-primary" />
        </div>
        <div>
          <label className="block text-sm font-medium text-text mb-1">Gender <span className="text-red-500">*</span></label>
          <select value={formData.patient?.gender || ''} onChange={(e) => setFormData({...formData, patient: {...formData.patient, gender: e.target.value}})} className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text focus:border-primary focus:ring-1 focus:ring-primary">
            <option value="">Select...</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-text mb-1">Medical Record No. (MRN)</label>
          <input type="text" value={formData.patient?.identifier?.[0]?.value || ''} onChange={(e) => {
            const newId = [...(formData.patient?.identifier || [])];
            if(newId.length === 0) newId.push({ value: '' });
            newId[0].value = e.target.value;
            setFormData({...formData, patient: {...formData.patient, identifier: newId}})
          }} className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text focus:border-primary focus:ring-1 focus:ring-primary" placeholder="Medical record number (MRN)" />
        </div>
        <div>
          <label className="block text-sm font-medium text-text mb-1">Phone Number</label>
          <input type="text" value={formData.extra.phone} onChange={(e) => setFormData({...formData, extra: {...formData.extra, phone: e.target.value}})} className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text focus:border-primary focus:ring-1 focus:ring-primary" placeholder="08xx-xxxx-xxxx" />
        </div>
        <div>
          <label className="block text-sm font-medium text-text mb-1">Target Provider <span className="text-red-500">*</span></label>
          <select value={formData.extra.providerId} onChange={(e) => setFormData({...formData, extra: {...formData.extra, providerId: e.target.value}})} className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text focus:border-primary focus:ring-1 focus:ring-primary">
            <option value="">Select provider...</option>
            {providers.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-text mb-1">Insurance Policy No.</label>
          <input type="text" value={formData.extra.insuranceNumber} onChange={(e) => setFormData({...formData, extra: {...formData.extra, insuranceNumber: e.target.value}})} className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text focus:border-primary focus:ring-1 focus:ring-primary" placeholder="BPJS card or policy number" />
        </div>
      </div>
    </div>
  );

  const renderStep2 = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label className="block text-sm font-medium text-text mb-1">Care Type (Class)</label>
          <input type="text" value={formData.encounter?.class?.code || ''} onChange={(e) => setFormData({...formData, encounter: {...formData.encounter, class: { code: e.target.value}}})} className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text focus:border-primary focus:ring-1 focus:ring-primary" placeholder="e.g. IMP (Inpatient)" />
        </div>
        <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-text mb-1">Admission Date (Start)</label>
            <input type="datetime-local" value={(formData.encounter?.period?.start || '').slice(0, 16)} onChange={(e) => setFormData({...formData, encounter: {...formData.encounter, period: {...formData.encounter?.period, start: new Date(e.target.value).toISOString()}}})} className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text focus:border-primary focus:ring-1 focus:ring-primary" />
          </div>
          <div>
            <label className="block text-sm font-medium text-text mb-1">Discharge Date (End)</label>
            <input type="datetime-local" value={(formData.encounter?.period?.end || '').slice(0, 16)} onChange={(e) => setFormData({...formData, encounter: {...formData.encounter, period: {...formData.encounter?.period, end: new Date(e.target.value).toISOString()}}})} className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text focus:border-primary focus:ring-1 focus:ring-primary" />
          </div>
        </div>
      </div>
    </div>
  );

  const renderStep3 = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-end">
        <button type="button" onClick={handleAddDocument} className="text-sm text-primary hover:text-primary-hover font-medium">+ Add Document</button>
      </div>
      <div className="border border-border/80 rounded-md bg-surface overflow-visible">
        <table className="w-full text-left text-sm">
          <thead className="bg-surface-elevated/50 text-xs font-semibold text-text-subtle">
            <tr>
              <th className="px-4 py-3 w-1/4">Document Type</th>
              <th className="px-4 py-3 w-1/6">Date</th>
              <th className="px-4 py-3">Conclusion / Result</th>
              <th className="px-4 py-3 w-1/4">Upload File</th>
              <th className="px-4 py-3 w-10"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {formData.documents?.map((doc: any, i: number) => (
              <tr key={i} className="align-top">
                <td className="px-4 py-2 pt-3">
                  <AutocompleteInput
                    value={doc.type || ''}
                    onChange={(value) => updateItem("documents", i, "type", value)}
                    options={documentOptions}
                    placeholder="Pilih dokumen wajib..."
                  />
                </td>
                <td className="px-4 py-2 pt-3">
                  <input type="date" value={doc.date ? doc.date.slice(0,10) : ''} onChange={e => updateItem("documents", i, "date", new Date(e.target.value).toISOString())} className="w-full rounded-md border border-border bg-surface px-2 py-1 text-base sm:text-sm text-text focus:border-primary focus:ring-1 focus:ring-primary" />
                </td>
                <td className="px-4 py-2 pt-3">
                  <input type="text" value={doc.conclusion || ''} onChange={e => updateItem("documents", i, "conclusion", e.target.value)} className="w-full rounded-md border border-border bg-surface px-2 py-1 text-base sm:text-sm text-text focus:border-primary focus:ring-1 focus:ring-primary" placeholder="Result..." />
                </td>
                <td className="px-4 py-2 pt-3">
                  <div className="flex flex-col gap-1.5">
                    <label className="inline-flex cursor-pointer items-center justify-center rounded-md border border-border bg-surface px-2 py-1 text-sm font-medium text-text hover:bg-surface-elevated transition-colors">
                      <svg className="mr-1.5 h-4 w-4 text-text-subtle" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                      {uploadingDocuments[i] ? 'Mengupload...' : doc.fileName ? 'Ganti file' : 'Upload file'}
                      <input
                        type="file"
                        accept="application/pdf,image/jpeg,image/png,image/webp"
                        disabled={uploadingDocuments[i]}
                        onChange={(event) => handleDocumentUpload(i, event.target.files?.[0] || null)}
                        className="sr-only"
                      />
                    </label>
                    {doc.fileName ? (
                      <div className="flex flex-col gap-1 rounded-md bg-surface-elevated p-2 border border-border/50">
                        <div className="flex items-center gap-1.5 overflow-hidden">
                          <svg className="h-3.5 w-3.5 flex-shrink-0 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" /></svg>
                          <p className="truncate text-xs font-medium text-text" title={doc.fileName}>{doc.fileName}</p>
                        </div>
                        {doc.url ? <a href={doc.url} target="_blank" rel="noreferrer" className="text-[11px] font-medium text-primary hover:text-primary-hover hover:underline pl-5 transition-all">Lihat dokumen ↗</a> : null}
                      </div>
                    ) : (
                      <p className="text-[10px] text-text-faint text-center leading-tight">PDF/JPG/PNG/WEBP, maks 10MB</p>
                    )}
                  </div>
                </td>
                <td className="px-4 py-2 text-right">
                  <button type="button" onClick={() => handleRemoveItem("documents", i)} className="text-text-faint hover:text-red-500 transition-colors"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg></button>
                </td>
              </tr>
            ))}
            {(!formData.documents || formData.documents.length === 0) && (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-text-subtle">Belum ada dokumen. Dokumen wajib: {REQUIRED_CLAIM_DOCUMENTS.join(', ')}.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderStep4 = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-end">
        <button type="button" onClick={handleAddDiagnosis} className="text-sm text-primary hover:text-primary-hover font-medium">+ Add Diagnosis</button>
      </div>
      <div className="border border-border/80 rounded-md bg-surface overflow-visible">
        <table className="w-full text-left text-sm">
          <thead className="bg-surface-elevated/50 text-xs font-semibold text-text-subtle">
            <tr>
              <th className="px-4 py-3 w-1/4">ICD-10 Code</th>
              <th className="px-4 py-3">Diagnosis Name</th>
              <th className="px-4 py-3 w-1/4">Type</th>
              <th className="px-4 py-3 w-10"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {formData.diagnoses?.map((diag: any, i: number) => (
              <tr key={i}>
                <td className="px-4 py-2 font-mono">
                  <input type="text" value={diag.code || ''} onChange={e => updateItem("diagnoses", i, "code", e.target.value)} className="w-full rounded-md border border-border bg-surface px-2 py-1 text-sm font-mono text-text focus:border-primary focus:ring-1 focus:ring-primary" placeholder="Code..." />
                </td>
                <td className="px-4 py-2">
                  <input type="text" value={diag.name || ''} onChange={e => updateItem("diagnoses", i, "name", e.target.value)} className="w-full rounded-md border border-border bg-surface px-2 py-1 text-sm text-text focus:border-primary focus:ring-1 focus:ring-primary" placeholder="Name..." />
                </td>
                <td className="px-4 py-2">
                  <select value={diag.type} onChange={e => updateItem("diagnoses", i, "type", e.target.value)} className="w-full rounded-md border border-border bg-surface px-2 py-1 text-sm text-text focus:border-primary focus:ring-1 focus:ring-primary">
                    <option value="primary">Primary</option>
                    <option value="secondary">Secondary</option>
                  </select>
                </td>
                <td className="px-4 py-2 text-right">
                  <button type="button" onClick={() => handleRemoveItem("diagnoses", i)} className="text-text-faint hover:text-red-500 transition-colors"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg></button>
                </td>
              </tr>
            ))}
            {(!formData.diagnoses || formData.diagnoses.length === 0) && (
              <tr><td colSpan={4} className="px-4 py-6 text-center text-text-subtle">No diagnoses imported yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderStep5 = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-end">
        <button type="button" onClick={handleAddProcedure} className="text-sm text-primary hover:text-primary-hover font-medium">+ Add Procedure</button>
      </div>
      <div className="border border-border/80 rounded-md bg-surface overflow-visible">
        <table className="w-full text-left text-sm">
          <thead className="bg-surface-elevated/50 text-xs font-semibold text-text-subtle">
            <tr>
              <th className="px-4 py-3 w-1/5">ICD-9 / Proc Code</th>
              <th className="px-4 py-3">Procedure Name</th>
              <th className="px-4 py-3 w-32">Price (IDR)</th>
              <th className="px-4 py-3 w-24">Quantity</th>
              <th className="px-4 py-3 w-10"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {formData.procedures?.map((proc: any, i: number) => (
              <tr key={i}>
                <td className="px-4 py-2 font-mono">
                  <input type="text" value={proc.code || ''} onChange={e => updateItem("procedures", i, "code", e.target.value)} className="w-full rounded-md border border-border bg-surface px-2 py-1 text-sm font-mono text-text focus:border-primary focus:ring-1 focus:ring-primary" placeholder="Code..." />
                </td>
                <td className="px-4 py-2">
                  <AutocompleteInput 
                    value={proc.name || ''} 
                    onChange={val => handleProcedureNameChange(i, val)}
                    onSelect={opt => handleProcedureNameChange(i, opt.label, opt.value, opt.data?.basePrice)}
                    options={providerTariffs.filter(t => t.category !== "OBAT").map(t => ({
                      label: t.procedureName,
                      value: t.procedureCode,
                      subLabel: `${t.procedureCode} - ${t.category}`,
                      data: t
                    }))}
                    placeholder="Type or select from fee schedule..." 
                  />
                </td>
                <td className="px-4 py-2">
                  <input type="number" value={proc.price || ''} onChange={e => updateItem("procedures", i, "price", parseInt(e.target.value) || 0)} className="w-full rounded-md border border-border bg-surface px-2 py-1 text-sm text-text focus:border-primary focus:ring-1 focus:ring-primary" placeholder="0" />
                </td>
                <td className="px-4 py-2">
                  <input type="number" value={proc.quantity || 1} onChange={e => updateItem("procedures", i, "quantity", parseInt(e.target.value) || 1)} className="w-full rounded-md border border-border bg-surface px-2 py-1 text-sm text-text focus:border-primary focus:ring-1 focus:ring-primary" />
                </td>
                <td className="px-4 py-2 text-right">
                  <button type="button" onClick={() => handleRemoveItem("procedures", i)} className="text-text-faint hover:text-red-500 transition-colors"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg></button>
                </td>
              </tr>
            ))}
            {(!formData.procedures || formData.procedures.length === 0) && (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-text-subtle">No procedures imported yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderStep6 = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-end">
        <button type="button" onClick={handleAddMedication} className="text-sm text-primary hover:text-primary-hover font-medium">+ Add Medication</button>
      </div>
      <div className="border border-border/80 rounded-md bg-surface overflow-visible">
        <table className="w-full text-left text-sm">
          <thead className="bg-surface-elevated/50 text-xs font-semibold text-text-subtle">
            <tr>
              <th className="px-4 py-3">Medication Name</th>
              <th className="px-4 py-3 w-32">Price (IDR)</th>
              <th className="px-4 py-3 w-24">Quantity</th>
              <th className="px-4 py-3 w-10"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {formData.medications?.map((med: any, i: number) => (
              <tr key={i}>
                <td className="px-4 py-2">
                  <AutocompleteInput 
                    value={med.name || ''} 
                    onChange={val => handleMedicationNameChange(i, val)}
                    onSelect={opt => handleMedicationNameChange(i, opt.label, opt.data?.basePrice)}
                    options={providerTariffs.filter(t => t.category === "OBAT").map(t => ({
                      label: t.procedureName,
                      value: t.procedureCode,
                      subLabel: t.procedureCode,
                      data: t
                    }))}
                    placeholder="Type or select drug..." 
                  />
                </td>
                <td className="px-4 py-2">
                  <input type="number" value={med.price || ''} onChange={e => updateItem("medications", i, "price", parseInt(e.target.value) || 0)} className="w-full rounded-md border border-border bg-surface px-2 py-1 text-sm text-text focus:border-primary focus:ring-1 focus:ring-primary" placeholder="0" />
                </td>
                <td className="px-4 py-2">
                  <input type="number" value={med.quantity || 1} onChange={e => updateItem("medications", i, "quantity", parseInt(e.target.value) || 1)} className="w-full rounded-md border border-border bg-surface px-2 py-1 text-sm text-text focus:border-primary focus:ring-1 focus:ring-primary" />
                </td>
                <td className="px-4 py-2 text-right">
                  <button type="button" onClick={() => handleRemoveItem("medications", i)} className="text-text-faint hover:text-red-500 transition-colors"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg></button>
                </td>
              </tr>
            ))}
            {(!formData.medications || formData.medications.length === 0) && (
              <tr><td colSpan={4} className="px-4 py-6 text-center text-text-subtle">No medications imported yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderStep7 = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label className="block text-sm font-medium text-text mb-1">Length of Stay (LOS)</label>
          <div className="flex items-center gap-2">
            <input type="number" value={formData.extra.los} onChange={(e) => setFormData({...formData, extra: {...formData.extra, los: e.target.value}})} className="w-24 rounded-md border border-border bg-surface px-3 py-2 text-sm text-text focus:border-primary focus:ring-1 focus:ring-primary" placeholder="Days" />
            <span className="text-sm text-text-subtle">Days</span>
          </div>
        </div>
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-text mb-1">Medical Justification for Inpatient Care</label>
          <textarea value={formData.extra.losJustification} onChange={(e) => setFormData({...formData, extra: {...formData.extra, losJustification: e.target.value}})} rows={4} className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text focus:border-primary focus:ring-1 focus:ring-primary resize-none" placeholder="Reason why the patient needed inpatient care for this duration..."></textarea>
        </div>
      </div>
    </div>
  );

  const renderStep8 = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6">
        <div>
          <label className="block text-sm font-medium text-text mb-1">Discharge Status</label>
          <select className="w-full md:w-1/2 rounded-md border border-border bg-surface px-3 py-2 text-sm text-text focus:border-primary focus:ring-1 focus:ring-primary">
            <option value="recovered">Recovered / Improved</option>
            <option value="referred">Referred</option>
            <option value="deceased">Deceased</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-text mb-1">Additional Notes (Optional)</label>
          <textarea value={formData.extra.outcomeNotes} onChange={(e) => setFormData({...formData, extra: {...formData.extra, outcomeNotes: e.target.value}})} rows={4} className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text focus:border-primary focus:ring-1 focus:ring-primary resize-none" placeholder="Optional notes for validation process..."></textarea>
        </div>
      </div>

      <div className="rounded-lg bg-primary-soft/30 border border-primary/20 p-5 mt-8">
        <h4 className="font-medium text-primary mb-2">Confirmation to Send to AI Brain</h4>
        <p className="text-sm text-text-subtle mb-4">Ensure all data in tabs 1 to 8 is correct. The AI Brain system will validate fees, drug prices, document completeness, and generate a standard clinical pathway.</p>
      </div>
    </div>
  );

  const renderActiveStepContent = () => {
    switch (step) {
      case 1: return renderStep1();
      case 2: return renderStep2();
      case 3: return renderStep3();
      case 4: return renderStep4();
      case 5: return renderStep5();
      case 6: return renderStep6();
      case 7: return renderStep7();
      case 8: return renderStep8();
      default: return renderStep1();
    }
  };

  return (
    <div className="flex flex-col h-full space-y-6">
      
      {/* Header Action */}
      <div className="flex justify-end pb-4 border-b border-border/80">
        <button
          onClick={() => setIsModalOpen(true)}
          className="inline-flex items-center rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-text shadow-sm transition-colors hover:bg-surface-elevated focus:outline-none focus:ring-2 focus:ring-primary/40"
        >
          <svg className="mr-2 h-4 w-4 text-text-subtle" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z"></path></svg>
          Import JSON
        </button>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 p-4 text-sm text-red-600 border border-red-200">
          {error}
        </div>
      )}

      {/* Stepper Timeline */}
      <div className="overflow-x-auto hide-scrollbar pb-4 border-b border-border/60">
        <div className="flex items-center min-w-max px-2 relative">
          <div className="absolute left-6 right-6 top-1/2 -translate-y-1/2 h-0.5 bg-border/60 z-0"></div>
          
          {STEPS.map((s, idx) => {
            const isActive = step === s.num;
            const isPassed = step > s.num;
            
            return (
              <div key={s.num} className="relative z-10 flex flex-col items-center flex-1 px-4 cursor-pointer group" onClick={() => setStep(s.num)}>
                <div className="flex flex-col items-center gap-2 bg-surface px-2">
                  <div className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                    isActive ? "bg-primary text-white shadow-md shadow-primary/30" : 
                    isPassed ? "bg-primary-soft text-primary border border-primary/20" : 
                    "bg-surface text-text-subtle border border-border/80 group-hover:border-border"
                  }`}>
                    {s.num}
                  </div>
                  <div className="text-center">
                    <span className={`block text-xs font-semibold ${isActive || isPassed ? "text-primary" : "text-text-subtle"}`}>{s.label}</span>
                    <span className="block text-[10px] text-text-faint">{s.subLabel}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 py-4">
        {renderActiveStepContent()}
      </div>

      {/* Footer Navigation */}
      <div className="flex items-center justify-between pt-6 border-t border-border/80 mt-auto">
        <button
          onClick={handlePrev}
          disabled={step === 1}
          className="inline-flex items-center rounded-lg border border-border bg-surface px-4 py-2.5 text-sm font-medium text-text-subtle shadow-sm transition-colors hover:bg-surface-elevated hover:text-text focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
        >
          &larr; Previous
        </button>
        
        <span className="text-sm font-medium text-text-subtle">
          Step {step} of 8
        </span>

        {step < 8 ? (
          <button
            onClick={handleNext}
            className="inline-flex items-center rounded-lg bg-primary px-6 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
          >
            Next
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={isSubmitting || !formData.extra.providerId}
            className="inline-flex items-center rounded-lg bg-primary px-6 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {isSubmitting ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                Saving...
              </span>
            ) : "Submit to AI Brain"}
          </button>
        )}
      </div>

      <PathwayImportModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        onImport={handleImport} 
      />
    </div>
  );
}
