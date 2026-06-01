import { mkdir, appendFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

type RunLogInput = {
  provider: "youcam";
  model: string;
  userImagePath: string;
  wigImagePath: string;
  userImageUrl: string;
  wigImageUrl: string;
  resultImageUrl: string;
  taskId: string;
  latencyMs: number;
};

export type ValidationLogInput = {
  runId?: string;
  taskId?: string;
  userImagePath?: string;
  wigImagePath?: string;
  generationStatus?: "success" | "failed";
  errorMessage?: string;
  faceChanged: "yes" | "no" | "unknown";
  hairlineScore: number;
  edgeBlendScore: number;
  stickerLike: "yes" | "no" | "unknown";
  lightingScore: number;
  overallScore: number;
  canContinue: "yes" | "no" | "unknown";
  note?: string;
};

function dataPath(fileName: string) {
  return path.join(process.cwd(), "data", fileName);
}

async function appendJsonLine(fileName: string, record: unknown) {
  const dataDir = path.join(process.cwd(), "data");
  await mkdir(dataDir, { recursive: true });
  await appendFile(dataPath(fileName), `${JSON.stringify(record)}\n`, "utf8");
}

export async function appendRunLog(input: RunLogInput) {
  const record = {
    runId: randomUUID(),
    createdAt: new Date().toISOString(),
    provider: input.provider,
    model: input.model,
    userImagePath: input.userImagePath,
    wigImagePath: input.wigImagePath,
    userImageUrl: input.userImageUrl,
    wigImageUrl: input.wigImageUrl,
    resultImageUrl: input.resultImageUrl,
    taskId: input.taskId,
    latencyMs: input.latencyMs,
  };

  await appendJsonLine("runs.jsonl", record);

  return record;
}

export async function appendValidationLog(input: ValidationLogInput) {
  const record = {
    validationId: randomUUID(),
    createdAt: new Date().toISOString(),
    ...input,
  };

  await appendJsonLine("validations.jsonl", record);

  return record;
}
