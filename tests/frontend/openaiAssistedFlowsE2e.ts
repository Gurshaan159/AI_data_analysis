/**
 * Live OpenAI E2E prompt checks (uses `.env`: set VITE_OPENAI_API_KEY and optional VITE_AI_PROVIDER=openai).
 * Must import loadDotenv first: plain `tsx` does not read `.env` (Vite/Tauri dev does).
 * Does not print secrets.
 */
import "../loadDotenv";
import { getPipelineRegistry } from "@/registry/pipelineRegistry";
import { recommendWorkflow } from "@/services/ai/recommendationService";
import { buildApprovedAiWorkflowHandoff } from "@/domain/ai/approvalHandoff";

const scenarios: { id: string; prompt: string }[] = [
  { id: "A", prompt: "I have a gene expression matrix and metadata and want PCA plus a summary." },
  { id: "B", prompt: "I want to compare treated vs control and find differentially expressed genes." },
  { id: "C", prompt: "I have a count matrix and I am not sure what analysis I should run." },
  { id: "D", prompt: "I have FASTQ files and want a full RNA-seq pipeline." },
  { id: "E", prompt: "I want single-cell clustering." },
];

async function run(): Promise<void> {
  const pipelines = getPipelineRegistry();
  for (const s of scenarios) {
    const t0 = Date.now();
    const rec = await recommendWorkflow({ availablePipelines: pipelines, userPrompt: s.prompt });
    const ms = Date.now() - t0;
    if (!rec) {
      // eslint-disable-next-line no-console
      console.log(`${s.id} | null | ${ms}ms`);
      continue;
    }
    if (rec.kind === "supported") {
      const handoff = buildApprovedAiWorkflowHandoff(rec);
      // eslint-disable-next-line no-console
      console.log(
        `${s.id} | supported | pipeline=${rec.chosenPipelineId} | handoffOk=${handoff.ok} | ${ms}ms`,
      );
    } else {
      // eslint-disable-next-line no-console
      console.log(
        `${s.id} | unsupported | code=${rec.unsupportedReasonCode} | summary=${rec.summary.slice(0, 80)}… | ${ms}ms`,
      );
    }
  }
}

void run();
