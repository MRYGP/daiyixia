import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

type EnvMap = Record<string, string | undefined>;
type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

type ContentItem =
  | {
      type: "text";
      text: string;
    }
  | {
      type: "image_url";
      image_url: {
        url: string;
      };
      role: string;
      subject_type?: string;
    };

const DEFAULT_API_BASE = "https://ark.cn-beijing.volces.com";
const DEFAULT_MODEL = "doubao-seedance-2-0-260128";
const DEFAULT_PROMPT =
  "A realistic short vertical hairstyle showcase video. A virtual model presents a neat black side-part layered hairstyle, natural hair movement, clean studio lighting, stable face identity, no exaggerated motion, commercial try-on style.";
const TASK_PATH = "/api/v3/contents/generations/tasks";
const POLL_INTERVAL_MS = 5000;
const MAX_POLLS = 72;
const MAX_SUBMIT_ATTEMPTS = 3;
const COUNTER_PATH = path.join(process.cwd(), "data", "seedance-video-test-count.json");

async function readEnvLocal(): Promise<EnvMap> {
  const envPath = path.join(process.cwd(), ".env.local");
  let text = "";

  try {
    text = await readFile(envPath, "utf8");
  } catch {
    return { ...process.env };
  }

  const env: EnvMap = { ...process.env };

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const equalsIndex = line.indexOf("=");
    if (equalsIndex === -1) {
      continue;
    }

    const key = line.slice(0, equalsIndex).trim();
    const value = line.slice(equalsIndex + 1).trim().replace(/^["']|["']$/g, "");
    env[key] = process.env[key] || value;
  }

  return env;
}

async function readSubmitCount() {
  try {
    const text = await readFile(COUNTER_PATH, "utf8");
    const data = JSON.parse(text) as { submitAttempts?: number };
    return Number(data.submitAttempts || 0);
  } catch {
    return 0;
  }
}

async function incrementSubmitCount() {
  const count = await readSubmitCount();
  if (count >= MAX_SUBMIT_ATTEMPTS) {
    throw new Error(`Local safety limit reached: ${count}/${MAX_SUBMIT_ATTEMPTS} Seedance submit attempts already used.`);
  }

  await mkdir(path.dirname(COUNTER_PATH), { recursive: true });
  await writeFile(
    COUNTER_PATH,
    `${JSON.stringify(
      {
        submitAttempts: count + 1,
        updatedAt: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  return count + 1;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTruthy(value: string | undefined) {
  return ["1", "true", "yes", "y"].includes((value || "").trim().toLowerCase());
}

function readInteger(value: string | undefined, fallback: number) {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function redact(raw: string, apiKey: string) {
  return raw.split(apiKey).join("<ARK_API_KEY>");
}

function readPath(value: JsonValue | undefined, pathParts: Array<string | number>): JsonValue | undefined {
  let current = value;

  for (const part of pathParts) {
    if (Array.isArray(current) && typeof part === "number") {
      current = current[part];
      continue;
    }

    if (current && typeof current === "object" && !Array.isArray(current) && typeof part === "string") {
      current = current[part];
      continue;
    }

    return undefined;
  }

  return current;
}

function asString(value: JsonValue | undefined) {
  return typeof value === "string" ? value : undefined;
}

async function requestJson(params: {
  method: "GET" | "POST";
  url: string;
  apiKey: string;
  body?: unknown;
}) {
  const response = await fetch(params.url, {
    method: params.method,
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      "Content-Type": "application/json",
    },
    body: params.body === undefined ? undefined : JSON.stringify(params.body),
  });
  const rawText = await response.text();
  let json: JsonValue | undefined;

  try {
    json = JSON.parse(rawText) as JsonValue;
  } catch {
    json = undefined;
  }

  return {
    httpStatus: response.status,
    ok: response.ok,
    rawText: redact(rawText, params.apiKey),
    json,
  };
}

function buildContent(env: EnvMap): ContentItem[] {
  const prompt = env.SEEDANCE_PROMPT || DEFAULT_PROMPT;
  const content: ContentItem[] = [
    {
      type: "text",
      text: prompt,
    },
  ];

  const imageUrl = env.SEEDANCE_IMAGE_URL;
  if (!imageUrl) {
    return content;
  }

  const imageRole = env.SEEDANCE_IMAGE_ROLE || "reference_image";
  const subjectType = env.SEEDANCE_IMAGE_SUBJECT_TYPE;

  if (subjectType === "person" && !isTruthy(env.SEEDANCE_PERSON_INPUT_CONFIRMED)) {
    throw new Error(
      "SEEDANCE_IMAGE_SUBJECT_TYPE=person requires SEEDANCE_PERSON_INPUT_CONFIRMED=true. Only use authorized real-person materials.",
    );
  }

  content.push({
    type: "image_url",
    image_url: {
      url: imageUrl,
    },
    role: imageRole,
    ...(subjectType ? { subject_type: subjectType } : {}),
  });

  return content;
}

function buildPayload(env: EnvMap) {
  return {
    model: env.SEEDANCE_MODEL || DEFAULT_MODEL,
    content: buildContent(env),
    resolution: env.SEEDANCE_RESOLUTION || "720p",
    ratio: env.SEEDANCE_RATIO || "9:16",
    duration: readInteger(env.SEEDANCE_DURATION_SECONDS, 4),
    generate_audio: isTruthy(env.SEEDANCE_GENERATE_AUDIO),
    watermark: isTruthy(env.SEEDANCE_WATERMARK),
    return_last_frame: isTruthy(env.SEEDANCE_RETURN_LAST_FRAME || "true"),
    execution_expires_after: readInteger(env.SEEDANCE_EXECUTION_EXPIRES_AFTER, 3600),
    safety_identifier: env.SEEDANCE_SAFETY_IDENTIFIER || "hair-tryon-demo",
    priority: readInteger(env.SEEDANCE_PRIORITY, 0),
  };
}

function getErrorMessage(json: JsonValue | undefined) {
  return (
    asString(readPath(json, ["error", "message"])) ||
    asString(readPath(json, ["error", "code"])) ||
    asString(readPath(json, ["message"])) ||
    asString(readPath(json, ["error"])) ||
    "unknown"
  );
}

function getTaskStatus(json: JsonValue | undefined) {
  return asString(readPath(json, ["status"])) || "unknown";
}

function getVideoUrl(json: JsonValue | undefined) {
  return asString(readPath(json, ["content", "video_url"])) || asString(readPath(json, ["content", "url"]));
}

function getLastFrameUrl(json: JsonValue | undefined) {
  return asString(readPath(json, ["content", "last_frame_url"])) || asString(readPath(json, ["content", "last_frame"]));
}

function getTaskId(json: JsonValue | undefined) {
  return asString(readPath(json, ["id"])) || asString(readPath(json, ["data", "id"])) || asString(readPath(json, ["task_id"]));
}

function printFailure(params: { status: number | string; error?: string; rawResponse: string }) {
  console.log("status:", params.status);
  console.log("error:", params.error || "");
  console.log("raw response:", params.rawResponse);
}

async function main() {
  const env = await readEnvLocal();
  const isDryRun = process.argv.includes("--dry-run") || isTruthy(env.SEEDANCE_DRY_RUN);
  const apiKey = env.SEEDANCE_API_KEY || env.ARK_API_KEY;
  const apiBase = (env.SEEDANCE_API_BASE || DEFAULT_API_BASE).replace(/\/$/, "");
  const payload = buildPayload(env);
  const startedAt = Date.now();

  if (isDryRun) {
    console.log("dry run: true");
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  if (!apiKey) {
    throw new Error("Missing ARK_API_KEY or SEEDANCE_API_KEY in .env.local");
  }

  const currentSubmitCount = await readSubmitCount();
  if (currentSubmitCount >= MAX_SUBMIT_ATTEMPTS) {
    throw new Error(
      `Local safety limit reached: ${currentSubmitCount}/${MAX_SUBMIT_ATTEMPTS} Seedance task creations already used.`,
    );
  }
  console.log(`task creation limit: ${currentSubmitCount}/${MAX_SUBMIT_ATTEMPTS} used`);
  console.log("model:", payload.model);
  console.log("resolution:", payload.resolution);
  console.log("ratio:", payload.ratio);
  console.log("duration:", payload.duration);

  const submit = await requestJson({
    method: "POST",
    url: `${apiBase}${TASK_PATH}`,
    apiKey,
    body: payload,
  });
  const taskId = getTaskId(submit.json);

  if (!submit.ok || !taskId) {
    printFailure({
      status: submit.httpStatus,
      error: getErrorMessage(submit.json),
      rawResponse: submit.rawText,
    });
    return;
  }

  const submitAttempt = await incrementSubmitCount();
  console.log(`task created: ${submitAttempt}/${MAX_SUBMIT_ATTEMPTS}`);
  console.log("task_id:", taskId);

  for (let pollIndex = 1; pollIndex <= MAX_POLLS; pollIndex += 1) {
    await sleep(POLL_INTERVAL_MS);

    const poll = await requestJson({
      method: "GET",
      url: `${apiBase}${TASK_PATH}/${encodeURIComponent(taskId)}`,
      apiKey,
    });
    const taskStatus = getTaskStatus(poll.json);
    const videoUrl = getVideoUrl(poll.json);
    const lastFrameUrl = getLastFrameUrl(poll.json);

    if (!poll.ok) {
      printFailure({
        status: poll.httpStatus,
        error: getErrorMessage(poll.json),
        rawResponse: poll.rawText,
      });
      return;
    }

    console.log(`poll ${pollIndex}/${MAX_POLLS}:`, taskStatus);

    if (taskStatus === "succeeded" && videoUrl) {
      console.log("task_id:", taskId);
      console.log("task_status:", taskStatus);
      console.log("video url:", videoUrl);
      console.log("last frame url:", lastFrameUrl || "");
      console.log("elapsed:", `${Date.now() - startedAt} ms`);
      return;
    }

    if (["failed", "expired", "cancelled"].includes(taskStatus)) {
      printFailure({
        status: taskStatus,
        error: getErrorMessage(poll.json),
        rawResponse: poll.rawText,
      });
      return;
    }
  }

  console.log("task_id:", taskId);
  console.log("task_status:", "timeout");
  console.log("video url:", "");
  console.log("elapsed:", `${Date.now() - startedAt} ms`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
