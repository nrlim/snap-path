import OcrImportTabsClient from "./OcrImportTabsClient";

export const metadata = {
  title: "Import OCR | CONSUL",
};

export default function OcrImportPage() {
  return (
    <div className="w-full space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Impor Invoice via OCR</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Unggah PDF invoice beserta TXT header/detail. CONSUL membandingkan hasil OCR PDF dengan TXT header, sekaligus memverifikasi nomor klaim header dan detail jika detail ikut diunggah.
        </p>
      </div>

      <OcrImportTabsClient />
    </div>
  );
}
