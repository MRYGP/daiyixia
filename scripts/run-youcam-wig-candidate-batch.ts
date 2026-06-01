import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

type EnvMap = Record<string, string>;

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

type ManifestItem = {
  id: string;
  title: string;
  path: string;
  sourcePage?: string;
};

type BatchResult = {
  id: string;
  title: string;
  refFileUrl: string;
  taskId?: string;
  taskStatus: string;
  latencyMs: number;
  resultUrl?: string;
  outputPath?: string;
  error?: string;
  errorCode?: string;
  rawResponse?: string;
};

const SRC_IMAGE_PATH = "/uploads/youcam-user-front-close-1024.jpg";
const MANIFEST_PATH = path.join(process.cwd(), "public", "samples", "wigs", "youcam-candidates", "manifest.json");
const OUTPUT_ROOT = path.join(process.cwd(), "public", "outputs", "youcam-wig-candidates");
const MAX_ITEMS = 10;
const POLL_INTERVAL_MS = 3000;
const MAX_POLLS = 20;

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

  return env;
}

function publicUrl(publicBaseUrl: string, publicPath: string) {
  return new URL(publicPath.startsWith("/") ? publicPath : `/${publicPath}`, publicBaseUrl).toString();
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
    readPath(json, ["data", "error", "code"]) ||
    readPath(json, ["data", "error"]);
  return value === undefined ? undefined : String(value);
}

function getErrorMessage(json: JsonValue | undefined) {
  return (
    asString(readPath(json, ["error"])) ||
    asString(readPath(json, ["message"])) ||
    asString(readPath(json, ["data", "error"])) ||
    asString(readPath(json, ["data", "message"])) ||
    asString(readPath(json, ["data", "error_message"])) ||
    asString(readPath(json, ["error", "message"])) ||
    asString(readPath(json, ["data", "error", "message"]))
  );
}

function findResultUrl(json: JsonValue | undefined) {
  const candidates = [
    ["data", "results", "url"],
    ["data", "results", "file_url"],
    ["data", "results", 0, "url"],
    ["data", "results", 0, "file_url"],
    ["data", "result_url"],
    ["data", "result_file_url"],
    ["data", "file_url"],
    ["data", "url"],
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

function isSuccessStatus(taskStatus: string) {
  return ["success", "succeeded", "done", "completed", "finish", "finished"].includes(taskStatus.toLowerCase());
}

function isFailureStatus(taskStatus: string) {
  return ["error", "failed", "fail", "rejected", "timeout", "expired"].includes(taskStatus.toLowerCase());
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

async function assertReachable(label: string, imageUrl: string) {
  const response = await fetch(imageUrl, {
    headers: { Range: "bytes=0-0" },
    cache: "no-store",
  });
  const contentType = response.headers.get("content-type") || "";

  if (!response.ok || !contentType.toLowerCase().startsWith("image/")) {
    throw new Error(`${label} is not reachable as an image: ${response.status} ${contentType} ${imageUrl}`);
  }
}

async function downloadImage(url: string, outputPath: string) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to download result image: ${response.status}`);
  }

  const input = Buffer.from(await response.arrayBuffer());
  await sharp(input).jpeg({ quality: 92 }).toFile(outputPath);
}

async function runOne(params: {
  apiBase: string;
  apiKey: string;
  srcFileUrl: string;
  item: ManifestItem;
  refFileUrl: string;
  outputDir: string;
  index: number;
}): Promise<BatchResult> {
  const startedAt = Date.now();
  const submit = await requestJson({
    method: "POST",
    url: `${params.apiBase}/s2s/v2.1/task/hair-transfer`,
    apiKey: params.apiKey,
    body: {
      src_file_url: params.srcFileUrl,
      ref_file_url: params.refFileUrl,
    },
  });
  const submitStatus = readPath(submit.json, ["status"]);
  const taskId = asString(readPath(submit.json, ["data", "task_id"])) || asString(readPath(submit.json, ["task_id"]));

  if (!submit.ok || !taskId) {
    return {
      id: params.item.id,
      title: params.item.title,
      refFileUrl: params.refFileUrl,
      taskStatus: "submit_failed",
      latencyMs: Date.now() - startedAt,
      error: getErrorMessage(submit.json) || `HTTP ${submit.httpStatus}`,
      errorCode: getErrorCode(submit.json),
      rawResponse: submit.rawText,
    };
  }

  for (let pollIndex = 1; pollIndex <= MAX_POLLS; pollIndex += 1) {
    await sleep(POLL_INTERVAL_MS);

    const poll = await requestJson({
      method: "GET",
      url: `${params.apiBase}/s2s/v2.1/task/hair-transfer/${encodeURIComponent(taskId)}`,
      apiKey: params.apiKey,
    });
    const taskStatus = getTaskStatus(poll.json);
    const resultUrl = findResultUrl(poll.json);

    if (!poll.ok) {
      return {
        id: params.item.id,
        title: params.item.title,
        refFileUrl: params.refFileUrl,
        taskId,
        taskStatus: "poll_failed",
        latencyMs: Date.now() - startedAt,
        error: getErrorMessage(poll.json) || `HTTP ${poll.httpStatus}`,
        errorCode: getErrorCode(poll.json),
        rawResponse: poll.rawText,
      };
    }

    if ((isSuccessStatus(taskStatus) && resultUrl) || resultUrl) {
      const outputPath = path.join(params.outputDir, `${String(params.index).padStart(2, "0")}-${params.item.id}.jpg`);
      await downloadImage(resultUrl, outputPath);
      return {
        id: params.item.id,
        title: params.item.title,
        refFileUrl: params.refFileUrl,
        taskId,
        taskStatus,
        latencyMs: Date.now() - startedAt,
        resultUrl,
        outputPath: outputPath.replaceAll("\\", "/"),
      };
    }

    if (isFailureStatus(taskStatus)) {
      return {
        id: params.item.id,
        title: params.item.title,
        refFileUrl: params.refFileUrl,
        taskId,
        taskStatus,
        latencyMs: Date.now() - startedAt,
        error: getErrorMessage(poll.json),
        errorCode: getErrorCode(poll.json),
        rawResponse: poll.rawText,
      };
    }
  }

  return {
    id: params.item.id,
    title: params.item.title,
    refFileUrl: params.refFileUrl,
    taskId,
    taskStatus: "timeout",
    latencyMs: Date.now() - startedAt,
  };
}

async function makeContactSheet(results: BatchResult[], outputDir: string) {
  const successResults = results.filter((result) => result.outputPath);
  const tiles = await Promise.all(
    successResults.map(async (result, index) => {
      const image = await sharp(result.outputPath)
        .resize(280, 280, { fit: "contain", background: "#ffffff" })
        .extend({
          top: 8,
          bottom: 72,
          left: 8,
          right: 8,
          background: "#ffffff",
        })
        .composite([
          {
            input: Buffer.from(
              `<svg width="296" height="72"><text x="8" y="22" font-size="15" fill="#111827">${String(index + 1).padStart(2, "0")} ${result.title.slice(0, 25)}</text><text x="8" y="48" font-size="12" fill="#4b5563">${result.taskStatus} / ${result.latencyMs}ms</text></svg>`,
            ),
            top: 288,
            left: 0,
          },
        ])
        .jpeg()
        .toBuffer();
      return image;
    }),
  );

  if (!tiles.length) {
    return undefined;
  }

  const metadata = await sharp(tiles[0]).metadata();
  const tileWidth = metadata.width || 276;
  const tileHeight = metadata.height || 322;
  const cols = 5;
  const rows = Math.ceil(tiles.length / cols);
  const contactSheetPath = path.join(outputDir, "contact-sheet.jpg");

  await sharp({
    create: {
      width: tileWidth * cols,
      height: tileHeight * rows,
      channels: 3,
      background: "#f8fafc",
    },
  })
    .composite(tiles.map((input, index) => ({ input, left: (index % cols) * tileWidth, top: Math.floor(index / cols) * tileHeight })))
    .jpeg({ quality: 90 })
    .toFile(contactSheetPath);

  return contactSheetPath.replaceAll("\\", "/");
}

async function main() {
  const env = await readEnvLocal();
  const apiKey = env.YOUCAM_API_KEY;
  const apiBase = (env.YOUCAM_API_BASE || "https://yce-api-01.makeupar.com").replace(/\/$/, "");
  const publicBaseUrl = env.PUBLIC_BASE_URL;

  if (!apiKey) {
    throw new Error("Missing YOUCAM_API_KEY in .env.local");
  }
  if (!publicBaseUrl) {
    throw new Error("Missing PUBLIC_BASE_URL in .env.local");
  }

  const manifest = (JSON.parse(await readFile(MANIFEST_PATH, "utf8")) as ManifestItem[]).slice(0, MAX_ITEMS);
  const runId = new Date().toISOString().replace(/[:.]/g, "-");
  const outputDir = path.join(OUTPUT_ROOT, runId);
  await mkdir(outputDir, { recursive: true });

  const srcFileUrl = publicUrl(publicBaseUrl, SRC_IMAGE_PATH);
  await assertReachable("src image", srcFileUrl);

  const results: BatchResult[] = [];
  console.log(`Batch output: ${outputDir}`);
  console.log(`Source: ${srcFileUrl}`);
  console.log(`Items: ${manifest.length}`);

  for (let index = 0; index < manifest.length; index += 1) {
    const item = manifest[index];
    const refFileUrl = publicUrl(publicBaseUrl, item.path);
    await assertReachable(`ref image ${item.id}`, refFileUrl);
    console.log(`\n[${index + 1}/${manifest.length}] ${item.title}`);

    const result = await runOne({
      apiBase,
      apiKey,
      srcFileUrl,
      item,
      refFileUrl,
      outputDir,
      index: index + 1,
    });
    results.push(result);

    if (result.outputPath) {
      console.log(`success: ${result.taskId} -> ${result.outputPath}`);
    } else {
      console.log(`failed: ${result.taskStatus} ${result.errorCode || ""} ${result.error || ""}`);
    }
  }

  const contactSheetPath = await makeContactSheet(results, outputDir);
  const summaryPath = path.join(outputDir, "summary.json");
  const markdownPath = path.join(outputDir, "summary.md");
  await writeFile(summaryPath, `${JSON.stringify({ runId, srcFileUrl, results, contactSheetPath }, null, 2)}\n`, "utf8");
  await writeFile(
    markdownPath,
    [
      `# YouCam Wig Candidate Batch ${runId}`,
      "",
      `Source: ${srcFileUrl}`,
      "",
      contactSheetPath ? `Contact sheet: ${contactSheetPath}` : "Contact sheet: none",
      "",
      "| # | ID | Status | Latency | Output | Error |",
      "| --- | --- | --- | ---: | --- | --- |",
      ...results.map((result, index) =>
        `| ${index + 1} | ${result.id} | ${result.taskStatus} | ${result.latencyMs} | ${result.outputPath || ""} | ${result.errorCode || result.error || ""} |`,
      ),
      "",
    ].join("\n"),
    "utf8",
  );

  const successCount = results.filter((result) => result.outputPath).length;
  console.log(`\nCompleted: ${successCount}/${results.length} succeeded`);
  console.log(`Summary: ${summaryPath}`);
  if (contactSheetPath) {
    console.log(`Contact sheet: ${contactSheetPath}`);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
