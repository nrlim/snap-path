"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function PolicyRuleForm({ rule }: { rule?: any }) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    ruleCode: "",
    ruleName: "",
    ruleType: "EXCLUSION",
    targetType: "",
    targetCode: "",
    targetPattern: "",
    severity: "WARNING",
    status: "ACTIVE",
    recommendation: "",
  });
  const [jsonFields, setJsonFields] = useState<{
    limitAmount?: number;
    deductibleAmount?: number;
    copayPercent?: number;
    entitledClass?: string;
  }>({});

  useEffect(() => {
    if (rule) {
      setFormData({
        ruleCode: rule.ruleCode || "",
        ruleName: rule.ruleName || "",
        ruleType: rule.ruleType || "EXCLUSION",
        targetType: rule.targetType || "",
        targetCode: rule.targetCode || "",
        targetPattern: rule.targetPattern || "",
        severity: rule.severity || "WARNING",
        status: rule.status || "ACTIVE",
        recommendation: rule.recommendation || "",
      });
      setJsonFields({
        limitAmount: rule.actionJson?.limitAmount,
        deductibleAmount: rule.actionJson?.deductibleAmount,
        copayPercent: rule.actionJson?.copayPercent,
        entitledClass: rule.conditionJson?.entitledClass,
      });
    }
  }, [rule]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);

    let actionJson: any = undefined;
    let conditionJson: any = undefined;

    if (formData.ruleType === "LIMIT" && jsonFields.limitAmount) {
      actionJson = { limitAmount: Number(jsonFields.limitAmount) };
    } else if (formData.ruleType === "DEDUCTIBLE" && jsonFields.deductibleAmount) {
      actionJson = { deductibleAmount: Number(jsonFields.deductibleAmount) };
    } else if (formData.ruleType === "COPAY" && jsonFields.copayPercent) {
      actionJson = { copayPercent: Number(jsonFields.copayPercent) };
    } else if (formData.ruleType === "ROOM_ENTITLEMENT" && jsonFields.entitledClass) {
      conditionJson = { entitledClass: jsonFields.entitledClass };
    }

    const payload = {
      ...formData,
      actionJson,
      conditionJson,
    };

    try {
      const url = rule ? `/api/v1/policy-rules/${rule.id}` : "/api/v1/policy-rules";
      const method = rule ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errorData = await res.json();
        alert(`Error: ${errorData.error || res.statusText}`);
      } else {
        router.push("/dashboard/master-data/policy-rules");
        router.refresh();
      }
    } catch (error) {
      alert("Failed to save policy rule");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 w-full">
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">Kode Rule</label>
          <input required type="text" className="w-full rounded-md border border-border px-3 py-2 text-sm font-light text-foreground focus:ring-1 focus:ring-primary outline-none bg-background" value={formData.ruleCode} onChange={(e) => setFormData({ ...formData, ruleCode: e.target.value })} disabled={!!rule} />
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">Nama Rule</label>
          <input required type="text" className="w-full rounded-md border border-border px-3 py-2 text-sm font-light text-foreground focus:ring-1 focus:ring-primary outline-none bg-background" value={formData.ruleName} onChange={(e) => setFormData({ ...formData, ruleName: e.target.value })} />
        </div>
      </div>

      <div className="pt-4 border-t border-border">
        <label className="block text-sm font-medium text-foreground mb-1.5">Tipe Rule</label>
        <select className="w-full rounded-md border border-border px-3 py-2 text-sm font-light text-foreground focus:ring-1 focus:ring-primary outline-none bg-background" value={formData.ruleType} onChange={(e) => setFormData({ ...formData, ruleType: e.target.value })}>
          <option value="EXCLUSION">Pengecualian (Exclusion)</option>
          <option value="LIMIT">Batas Manfaat (Limit)</option>
          <option value="DEDUCTIBLE">Deductible</option>
          <option value="COPAY">Co-Pay</option>
          <option value="ROOM_ENTITLEMENT">Hak Kamar</option>
        </select>
      </div>

      {formData.ruleType === "EXCLUSION" && (
        <div className="space-y-4 p-5 border border-border rounded-lg bg-muted/20">
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Target Type</label>
              <select className="w-full rounded-md border border-border px-3 py-2 text-sm font-light text-foreground bg-background outline-none focus:ring-1 focus:ring-primary" value={formData.targetType} onChange={(e) => setFormData({ ...formData, targetType: e.target.value })}>
                <option value="">-- Pilih --</option>
                <option value="DIAGNOSIS">Diagnosis</option>
                <option value="MEDICATION_TYPE">Kategori Obat</option>
                <option value="MEDICATION_NAME">Nama Obat</option>
                <option value="PROCEDURE">Tindakan</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Target Code / Keyword</label>
              <input type="text" placeholder="misal: A09 atau vitamin" className="w-full rounded-md border border-border px-3 py-2 text-sm font-light text-foreground outline-none focus:ring-1 focus:ring-primary bg-background" value={formData.targetCode || formData.targetPattern} onChange={(e) => setFormData({ ...formData, targetCode: e.target.value, targetPattern: e.target.value })} />
            </div>
          </div>
        </div>
      )}

      {formData.ruleType === "LIMIT" && (
        <div className="p-5 border border-border rounded-lg bg-muted/20">
          <label className="block text-sm font-medium text-foreground mb-1.5">Limit Maksimal (Rp)</label>
          <input required type="number" className="w-full rounded-md border border-border px-3 py-2 text-sm font-light tabular-nums text-foreground outline-none focus:ring-1 focus:ring-primary bg-background" value={jsonFields.limitAmount || ""} onChange={(e) => setJsonFields({ ...jsonFields, limitAmount: Number(e.target.value) })} />
        </div>
      )}

      {formData.ruleType === "DEDUCTIBLE" && (
        <div className="p-5 border border-border rounded-lg bg-muted/20">
          <label className="block text-sm font-medium text-foreground mb-1.5">Nilai Deductible (Rp)</label>
          <input required type="number" className="w-full rounded-md border border-border px-3 py-2 text-sm font-light tabular-nums text-foreground outline-none focus:ring-1 focus:ring-primary bg-background" value={jsonFields.deductibleAmount || ""} onChange={(e) => setJsonFields({ ...jsonFields, deductibleAmount: Number(e.target.value) })} />
        </div>
      )}

      {formData.ruleType === "COPAY" && (
        <div className="p-5 border border-border rounded-lg bg-muted/20">
          <label className="block text-sm font-medium text-foreground mb-1.5">Persentase Co-Pay (%)</label>
          <input required type="number" min="1" max="100" className="w-full rounded-md border border-border px-3 py-2 text-sm font-light tabular-nums text-foreground outline-none focus:ring-1 focus:ring-primary bg-background" value={jsonFields.copayPercent || ""} onChange={(e) => setJsonFields({ ...jsonFields, copayPercent: Number(e.target.value) })} />
        </div>
      )}

      {formData.ruleType === "ROOM_ENTITLEMENT" && (
        <div className="p-5 border border-border rounded-lg bg-muted/20">
          <label className="block text-sm font-medium text-foreground mb-1.5">Kelas Hak Kamar</label>
          <input required type="text" placeholder="misal: vip, kelas 1" className="w-full rounded-md border border-border px-3 py-2 text-sm font-light text-foreground outline-none focus:ring-1 focus:ring-primary bg-background" value={jsonFields.entitledClass || ""} onChange={(e) => setJsonFields({ ...jsonFields, entitledClass: e.target.value })} />
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 pt-4 border-t border-border">
        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">Severity</label>
          <select className="w-full rounded-md border border-border px-3 py-2 text-sm font-light text-foreground bg-background outline-none focus:ring-1 focus:ring-primary" value={formData.severity} onChange={(e) => setFormData({ ...formData, severity: e.target.value })}>
            <option value="INFO">Info</option>
            <option value="WARNING">Warning</option>
            <option value="REVIEW_NEEDED">Review Needed</option>
            <option value="REJECT_RECOMMENDED">Reject Recommended</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">Status</label>
          <select className="w-full rounded-md border border-border px-3 py-2 text-sm font-light text-foreground bg-background outline-none focus:ring-1 focus:ring-primary" value={formData.status} onChange={(e) => setFormData({ ...formData, status: e.target.value })}>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
            <option value="ARCHIVED">Archived</option>
          </select>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-1.5">Rekomendasi / Pesan Khusus</label>
        <textarea className="w-full rounded-md border border-border px-3 py-2 text-sm font-light text-foreground outline-none focus:ring-1 focus:ring-primary bg-background resize-none h-24" value={formData.recommendation} onChange={(e) => setFormData({ ...formData, recommendation: e.target.value })} placeholder="Keterangan tindakan bila rule ini dilanggar..."></textarea>
      </div>

      <div className="pt-6 border-t border-border flex justify-end gap-3">
        <Link href="/dashboard/master-data/policy-rules" className="px-5 py-2.5 text-sm font-medium text-foreground hover:bg-muted border border-border rounded-md transition-colors">
          Batal
        </Link>
        <button type="submit" disabled={isSubmitting} className="px-5 py-2.5 text-sm font-medium text-white bg-primary rounded-md shadow-sm hover:bg-primary/90 transition-colors disabled:opacity-50">
          {isSubmitting ? "Menyimpan..." : "Simpan Rule"}
        </button>
      </div>
    </form>
  );
}
