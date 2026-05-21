import { serve } from "@upstash/workflow/nextjs";

export const { POST } = serve<string>(async (context) => {
  const requestPayload = context.requestPayload;

  // Langkah 1: Pre-processing Data Rekam Medis (misalnya OCR)
  const preProcessedData = await context.run("pre-process-ocr", async () => {
    // Simulasi atau panggilan eksternal
    return { status: "processed", rawText: requestPayload };
  });

  // Langkah 2: Validasi Medis deterministik (Post-processing)
  const validationResult = await context.run("medical-validation", async () => {
    // Pada produksi, ini akan memanggil AIGateway untuk memvalidasi
    // Kita simulasikan penggunaan preProcessedData:
    const dataRef = preProcessedData.status;
    return { status: "validated", pathway: "Simulated Deterministic Pathway", valid: true, ref: dataRef };
  });

  return validationResult;
});
