import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

type EnvMap = Record<string, string>;

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

const MAX_SUBMIT_ATTEMPTS = 3;
const POLL_INTERVAL_MS = 3000;
const MAX_POLLS = 20;
const COUNTER_PATH = path.join(process.cwd(), "data", "youcam-hair-transfer-test-count.json");

async function readEnvLocal(): Promise<EnvMap> {
  const envPath = path.join(process.cwd(), ".env.local");
  const text = await readFile(envPath, "utf8");
  const env: EnvMap = {};

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
    const value = line.slice(equalsIndex + 1).trim();
    env[key] = value.replace(/^["']|["']$/g, "");
  }

  return {
    ...env,
    YOUCAM_SRC_FILE_URL: process.env.YOUCAM_SRC_FILE_URL || env.YOUCAM_SRC_FILE_URL,
    YOUCAM_REF_FILE_URL: process.env.YOUCAM_REF_FILE_URL || env.YOUCAM_REF_FILE_URL,
  };
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
    throw new Error(`Local safety limit reached: ${count}/${MAX_SUBMIT_ATTEMPTS} YouCam submit attempts already used.`);
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

function redact(raw: string, apiKey: string) {
  return raw.split(apiKey).join("<YOUCAM_API_KEY>");
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

function findResultUrl(json: JsonValue | undefined) {
  const candidates = [
    ["data", "result_url"],
    ["data", "result_file_url"],
    ["data", "file_url"],
    ["data", "url"],
    ["data", "result", "url"],
    ["data", "result", "file_url"],
    ["data", "results", "url"],
    ["data", "results", "file_url"],
    ["data", "results", 0, "url"],
    ["data", "results", 0, "file_url"],
    ["result_url"],
  ] as const;

  for (const candidate of candidates) {
    const value = asString(readPath(json, [...candidate]));
    if (value) {
      return value;
    }
  }

  return undefined;
}

function getTaskStatus(json: JsonValue | undefined) {
  return (
    asString(readPath(json, ["data", "task_status"])) ||
    asString(readPath(json, ["data", "status"])) ||
    asString(readPath(json, ["task_status"])) ||
    asString(readPath(json, ["status"])) ||
    "unknown"
  );
}

function getErrorCode(json: JsonValue | undefined) {
  const value =
    readPath(json, ["error_code"]) ||
    readPath(json, ["data", "error_code"]) ||
    readPath(json, ["error", "code"]) ||
    readPath(json, ["data", "error", "code"]);
  return value === undefined ? undefined : String(value);
}

function getErrorMessage(json: JsonValue | undefined) {
  return (
    asString(readPath(json, ["error"])) ||
    asString(readPath(json, ["message"])) ||
    asString(readPath(json, ["data", "error"])) ||
    asString(readPath(json, ["data", "message"])) ||
    asString(readPath(json, ["error", "message"])) ||
    asString(readPath(json, ["data", "error", "message"]))
  );
}

function isSuccessStatus(taskStatus: string) {
  return ["success", "succeeded", "done", "completed", "finish", "finished"].includes(taskStatus.toLowerCase());
}

function isFailureStatus(taskStatus: string) {
  return ["error", "failed", "fail", "rejected", "timeout", "expired"].includes(taskStatus.toLowerCase());
}

function printFailure(params: {
  status: number | string;
  error?: string;
  errorCode?: string;
  rawResponse: string;
}) {
  console.log("status:", params.status);
  console.log("error:", params.error || "");
  console.log("error_code:", params.errorCode || "");
  console.log("raw response:", params.rawResponse);
}

async function main() {
  const env = await readEnvLocal();
  const apiKey = env.YOUCAM_API_KEY;
  const apiBase = env.YOUCAM_API_BASE || "https://yce-api-01.makeupar.com";
  const publicBaseUrl = env.PUBLIC_BASE_URL;

  if (!apiKey) {
    throw new Error("Missing YOUCAM_API_KEY in .env.local");
  }
  if (!publicBaseUrl) {
    throw new Error("Missing PUBLIC_BASE_URL in .env.local");
  }

  const srcFileUrl = env.YOUCAM_SRC_FILE_URL || new URL("/uploads/user.jpg", publicBaseUrl).toString();
  const refFileUrl = env.YOUCAM_REF_FILE_URL || new URL("/samples/wigs/wig-001.jpg", publicBaseUrl).toString();
  const startedAt = Date.now();

  const submitAttempt = await incrementSubmitCount();
  console.log(`submit attempt: ${submitAttempt}/${MAX_SUBMIT_ATTEMPTS}`);
  console.log("src_file_url:", srcFileUrl);
  console.log("ref_file_url:", refFileUrl);

  const submit = await requestJson({
    method: "POST",
    url: `${apiBase.replace(/\/$/, "")}/s2s/v2.1/task/hair-transfer`,
    apiKey,
    body: {
      src_file_url: srcFileUrl,
      ref_file_url: refFileUrl,
    },
  });

  const submitStatus = readPath(submit.json, ["status"]);
  const taskId = asString(readPath(submit.json, ["data", "task_id"])) || asString(readPath(submit.json, ["task_id"]));
  if (!submit.ok || submitStatus === 401 || !taskId) {
    printFailure({
      status: typeof submitStatus === "number" || typeof submitStatus === "string" ? submitStatus : submit.httpStatus,
      error: getErrorMessage(submit.json),
      errorCode: getErrorCode(submit.json),
      rawResponse: submit.rawText,
    });
    return;
  }

  console.log("task_id:", taskId);

  for (let pollIndex = 1; pollIndex <= MAX_POLLS; pollIndex += 1) {
    await sleep(POLL_INTERVAL_MS);

    const poll = await requestJson({
      method: "GET",
      url: `${apiBase.replace(/\/$/, "")}/s2s/v2.1/task/hair-transfer/${encodeURIComponent(taskId)}`,
      apiKey,
    });
    const taskStatus = getTaskStatus(poll.json);
    const resultUrl = findResultUrl(poll.json);
    const pollStatus = readPath(poll.json, ["status"]);

    if (!poll.ok || pollStatus === 401) {
      printFailure({
        status: typeof pollStatus === "number" || typeof pollStatus === "string" ? pollStatus : poll.httpStatus,
        error: getErrorMessage(poll.json),
        errorCode: getErrorCode(poll.json),
        rawResponse: poll.rawText,
      });
      return;
    }

    console.log(`poll ${pollIndex}/${MAX_POLLS}:`, taskStatus);

    if (isSuccessStatus(taskStatus) || resultUrl) {
      console.log("task_id:", taskId);
      console.log("task_status:", taskStatus);
      console.log("result url:", resultUrl || "");
      console.log("耗时:", `${Date.now() - startedAt} ms`);
      return;
    }

    if (isFailureStatus(taskStatus)) {
      printFailure({
        status: taskStatus,
        error: getErrorMessage(poll.json),
        errorCode: getErrorCode(poll.json),
        rawResponse: poll.rawText,
      });
      return;
    }
  }

  console.log("task_id:", taskId);
  console.log("task_status:", "timeout");
  console.log("result url:", "");
  console.log("耗时:", `${Date.now() - startedAt} ms`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
