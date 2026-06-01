const POLL_INTERVAL_MS = 3000;
const MAX_POLLS = 20;

type YouCamJson = {
  status?: number;
  error?: string | null;
  error_code?: string;
  data?: {
    task_id?: string;
    task_status?: string;
    status?: string;
    error?: string | null;
    error_code?: string;
    results?: {
      url?: string;
    };
  };
};

export type YouCamHairTransferResult = {
  resultImageUrl: string;
  taskId: string;
  latencyMs: number;
  taskStatus: string;
};

export class YouCamApiError extends Error {
  status?: number | string;
  errorCode?: string;
  rawResponse?: string;

  constructor(params: { message: string; status?: number | string; errorCode?: string; rawResponse?: string }) {
    super(params.message);
    this.name = "YouCamApiError";
    this.status = params.status;
    this.errorCode = params.errorCode;
    this.rawResponse = params.rawResponse;
  }
}

function getConfig() {
  const apiKey = process.env.YOUCAM_API_KEY?.trim();
  const apiBase = process.env.YOUCAM_API_BASE?.trim() || "https://yce-api-01.makeupar.com";

  if (!apiKey) {
    throw new Error("试戴服务暂未完成配置");
  }

  return {
    apiKey,
    apiBase: apiBase.replace(/\/$/, ""),
  };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function youcamRequest(params: {
  method: "GET" | "POST";
  path: string;
  body?: unknown;
}): Promise<{ httpStatus: number; json: YouCamJson; rawText: string }> {
  const config = getConfig();
  const response = await fetch(`${config.apiBase}${params.path}`, {
    method: params.method,
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: params.body === undefined ? undefined : JSON.stringify(params.body),
  });
  const rawText = await response.text();
  let json: YouCamJson;

  try {
    json = JSON.parse(rawText) as YouCamJson;
  } catch {
    throw new YouCamApiError({
      message: "试戴服务返回了无法识别的响应",
      status: response.status,
      rawResponse: rawText,
    });
  }

  if (!response.ok || (json.status !== undefined && json.status >= 400)) {
    throw new YouCamApiError({
      message: json.error || json.data?.error || `试戴服务请求失败：HTTP ${response.status}`,
      status: json.status ?? response.status,
      errorCode: json.error_code || json.data?.error_code,
      rawResponse: rawText,
    });
  }

  return {
    httpStatus: response.status,
    json,
    rawText,
  };
}

function isSuccessStatus(status: string) {
  return ["success", "succeeded", "done", "completed", "finish", "finished"].includes(status.toLowerCase());
}

function isFailureStatus(status: string) {
  return ["error", "failed", "fail", "rejected", "timeout", "expired"].includes(status.toLowerCase());
}

export async function generateYouCamHairTransferAndWait(params: {
  srcFileUrl: string;
  refFileUrl: string;
}): Promise<YouCamHairTransferResult> {
  const startedAt = Date.now();
  const submit = await youcamRequest({
    method: "POST",
    path: "/s2s/v2.1/task/hair-transfer",
    body: {
      src_file_url: params.srcFileUrl,
      ref_file_url: params.refFileUrl,
    },
  });

  const taskId = submit.json.data?.task_id;
  if (!taskId) {
    throw new YouCamApiError({
      message: "试戴任务提交成功，但缺少任务编号",
      status: submit.json.status ?? submit.httpStatus,
      rawResponse: submit.rawText,
    });
  }

  for (let pollIndex = 1; pollIndex <= MAX_POLLS; pollIndex += 1) {
    await sleep(POLL_INTERVAL_MS);

    const poll = await youcamRequest({
      method: "GET",
      path: `/s2s/v2.1/task/hair-transfer/${encodeURIComponent(taskId)}`,
    });
    const taskStatus = poll.json.data?.task_status || poll.json.data?.status || "unknown";
    const resultImageUrl = poll.json.data?.results?.url;

    if (isSuccessStatus(taskStatus) && resultImageUrl) {
      return {
        resultImageUrl,
        taskId,
        latencyMs: Date.now() - startedAt,
        taskStatus,
      };
    }

    if (isFailureStatus(taskStatus)) {
      const errorCode = poll.json.data?.error_code || poll.json.error_code || poll.json.data?.error || poll.json.error;
      throw new YouCamApiError({
        message: poll.json.data?.error || poll.json.error || `试戴任务失败：${taskStatus}`,
        status: taskStatus,
        errorCode: errorCode || undefined,
        rawResponse: poll.rawText,
      });
    }
  }

  throw new YouCamApiError({
    message: `试戴任务等待超时，已查询 ${MAX_POLLS} 次`,
    status: "timeout",
  });
}
