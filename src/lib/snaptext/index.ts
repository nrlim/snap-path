import snaptextSchema from "./schema.json";

export interface SnaptextJob {
  jobId: string;
  status: string;
}

export interface SnaptextJobStatus {
  status: string;
  result?: unknown;
}

function getApiKey(): string {
  const key = process.env.SNAPTEXT_API_KEY;
  if (!key) throw new Error("SNAPTEXT_API_KEY environment variable is not set.");
  return key;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" ? value : undefined;
}

function parseSnaptextJob(value: unknown): SnaptextJob {
  if (!isRecord(value)) {
    throw new Error("SnapText mengembalikan respons job yang tidak valid.");
  }

  const jobId = readString(value, "jobId") ?? readString(value, "id");
  const status = readString(value, "status") ?? "PENDING";

  if (!jobId) {
    throw new Error("SnapText tidak mengembalikan jobId.");
  }

  return { jobId, status };
}

function parseSnaptextJobStatus(value: unknown): SnaptextJobStatus {
  if (!isRecord(value)) {
    throw new Error("SnapText mengembalikan status job yang tidak valid.");
  }

  const rawStatus = readString(value, "status") ?? readString(value, "state") ?? "running";
  const normalizedStatus = rawStatus.toUpperCase();
  const status = normalizedStatus === "RUNNING" ? "RUNNING"
    : normalizedStatus === "PENDING" ? "PENDING"
      : normalizedStatus === "COMPLETED" ? "COMPLETED"
        : normalizedStatus === "FAILED" ? "FAILED"
          : normalizedStatus;
  const result = value.result ?? value.data ?? value.output ?? value.response;
  const completed = ["COMPLETED", "DONE", "SUCCESS", "SUCCEEDED"].includes(status);

  if (result !== undefined) return { status, result };
  return completed ? { status, result: value } : { status };
}

/** Create OCR job via hosted file URL. */
export async function createSnaptextJob(
  pdfUrl: string,
  filename: string,
  fileSize: number,
  fileHash: string,
): Promise<SnaptextJob> {
  const response = await fetch("https://snaptextid.vercel.app/api/v1/jobs", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      pdfUrl,
      filename,
      fileSize,
      fileHash,
      ocrModelId: process.env.SNAPTEXT_OCR_MODEL_ID ?? "consul-v1",
      jsonSchema: snaptextSchema,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to create SnapText job: ${response.status} ${text}`);
  }

  return parseSnaptextJob(await response.json());
}

/** Poll OCR job status. */
export async function pollSnaptextJob(jobId: string): Promise<SnaptextJobStatus> {
  const response = await fetch(`https://snaptextid.vercel.app/api/v1/jobs/${encodeURIComponent(jobId)}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to poll SnapText job: ${response.status} ${text}`);
  }

  return parseSnaptextJobStatus(await response.json());
}
