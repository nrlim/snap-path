import { sleep } from "workflow";

import { markOcrPollingTimeoutStep, pollSnaptextOcrStep, type OcrProcessingPayload } from "./steps";

const MAX_POLL_ATTEMPTS = 60;
const POLL_INTERVAL = "10s";

export async function ocrProcessingWorkflow(input: OcrProcessingPayload): Promise<void> {
  "use workflow";

  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt += 1) {
    const result = await pollSnaptextOcrStep(input);
    if (result.terminal) return;

    await sleep(POLL_INTERVAL);
  }

  await markOcrPollingTimeoutStep(input);
}
