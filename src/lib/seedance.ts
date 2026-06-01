const TASK_PATH = "/api/v3/contents/generations/tasks";
const POLL_INTERVAL_MS = 5000;
const MAX_POLLS = 72;

type SeedanceJson = {
  id?: string;
  status?: string;
  error?: string | { code?: string; message?: string };
  message?: string;
  content?: {
    video_url?: string;
    url?: string;
    last_frame_url?: string;
    last_frame?: string;
  };
  data?: {
    id?: string;
    status?: string;
    content?: {
      video_url?: string;
      url?: string;
      last_frame_url?: string;
      last_frame?: string;
    };
  };
};

type SeedanceContentItem =
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

export type SeedanceVideoResult = {
  taskId: string;
  taskStatus: string;
  videoUrl: string;
  lastFrameUrl?: string;
  latencyMs: number;
};

export class SeedanceApiError extends Error {
  status?: number | string;
  errorCode?: string;
  rawResponse?: string;

  constructor(params: { message: string; status?: number | string; errorCode?: string; rawResponse?: string }) {
    super(params.message);
    this.name = "SeedanceApiError";
    this.status = params.status;
    this.errorCode = params.errorCode;
    this.rawResponse = params.rawResponse;
  }
}

function getConfig() {
  const apiKey = (process.env.SEEDANCE_API_KEY || process.env.ARK_API_KEY)?.trim();
  const apiBase = process.env.SEEDANCE_API_BASE?.trim() || "https://ark.cn-beijing.volces.com";
  const model = process.env.SEEDANCE_MODEL?.trim() || "doubao-seedance-2-0-260128";

  if (!apiKey) {
    throw new SeedanceApiError({
      message: "缺少 ARK_API_KEY 或 SEEDANCE_API_KEY，请先在 .env.local 中配置火山方舟 API Key。",
      status: "config_error",
    });
  }

  return {
    apiKey,
    apiBase: apiBase.replace(/\/$/, ""),
    model,
  };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function redact(raw: string, apiKey: string) {
  return raw.split(apiKey).join("<ARK_API_KEY>");
}

function errorMessage(json: SeedanceJson | undefined) {
  if (!json) {
    return "Seedance response is not JSON";
  }

  if (typeof json.error === "string") {
    return json.error;
  }

  return json.error?.message || json.error?.code || json.message || "Seedance request failed";
}

function errorCode(json: SeedanceJson | undefined) {
  if (!json || typeof json.error === "string") {
    return undefined;
  }

  return json.error?.code;
}

async function seedanceRequest(params: {
  method: "GET" | "POST";
  path: string;
  body?: unknown;
}): Promise<{ httpStatus: number; json: SeedanceJson; rawText: string }> {
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
  let json: SeedanceJson;

  try {
    json = JSON.parse(rawText) as SeedanceJson;
  } catch {
    throw new SeedanceApiError({
      message: "Seedance response is not JSON",
      status: response.status,
      rawResponse: redact(rawText, config.apiKey),
    });
  }

  if (!response.ok) {
    throw new SeedanceApiError({
      message: errorMessage(json),
      status: response.status,
      errorCode: errorCode(json),
      rawResponse: redact(rawText, config.apiKey),
    });
  }

  return {
    httpStatus: response.status,
    json,
    rawText: redact(rawText, config.apiKey),
  };
}

function getTaskId(json: SeedanceJson) {
  return json.id || json.data?.id;
}

function getTaskStatus(json: SeedanceJson) {
  return json.status || json.data?.status || "unknown";
}

function getVideoUrl(json: SeedanceJson) {
  return json.content?.video_url || json.content?.url || json.data?.content?.video_url || json.data?.content?.url;
}

function getLastFrameUrl(json: SeedanceJson) {
  return (
    json.content?.last_frame_url ||
    json.content?.last_frame ||
    json.data?.content?.last_frame_url ||
    json.data?.content?.last_frame
  );
}

function isFailureStatus(status: string) {
  return ["failed", "expired", "cancelled", "canceled"].includes(status.toLowerCase());
}

export async function generateSeedanceHairVideoAndWait(params: {
  prompt: string;
  personReferenceImageUrl?: string;
  referenceAssetUri?: string;
  hairstyleReferenceImageUrl?: string;
  referenceImageConfirmed?: boolean;
  resolution?: string;
  ratio?: string;
  duration?: number;
}): Promise<SeedanceVideoResult> {
  const config = getConfig();
  const startedAt = Date.now();
  const content: SeedanceContentItem[] = [
    {
      type: "text",
      text: params.prompt,
    },
  ];

  const hasReference = Boolean(params.referenceAssetUri || params.personReferenceImageUrl || params.hairstyleReferenceImageUrl);
  if (hasReference) {
    if (!params.referenceImageConfirmed) {
      throw new SeedanceApiError({
        message: "使用参考素材前需要先确认素材已授权，并符合 Seedance 对真人素材的输入要求。",
        status: "input_confirm_required",
      });
    }
  }

  if (params.referenceAssetUri) {
    content.push({
      type: "image_url",
      image_url: {
        url: params.referenceAssetUri,
      },
      role: "reference_image",
    });
  }

  if (params.personReferenceImageUrl) {
    content.push({
      type: "image_url",
      image_url: {
        url: params.personReferenceImageUrl,
      },
      role: "reference_image",
      subject_type: "person",
    });
  }

  if (params.hairstyleReferenceImageUrl) {
    content.push({
      type: "image_url",
      image_url: {
        url: params.hairstyleReferenceImageUrl,
      },
      role: "reference_image",
    });
  }

  const submit = await seedanceRequest({
    method: "POST",
    path: TASK_PATH,
    body: {
      model: config.model,
      content,
      resolution: params.resolution || "720p",
      ratio: params.ratio || "9:16",
      duration: params.duration || 4,
      generate_audio: false,
      watermark: false,
      return_last_frame: true,
      execution_expires_after: 3600,
      safety_identifier: "hair-tryon-demo",
      priority: 0,
    },
  });
  const taskId = getTaskId(submit.json);

  if (!taskId) {
    throw new SeedanceApiError({
      message: "Seedance submit succeeded but task id is missing",
      status: submit.httpStatus,
      rawResponse: submit.rawText,
    });
  }

  for (let pollIndex = 1; pollIndex <= MAX_POLLS; pollIndex += 1) {
    await sleep(POLL_INTERVAL_MS);

    const poll = await seedanceRequest({
      method: "GET",
      path: `${TASK_PATH}/${encodeURIComponent(taskId)}`,
    });
    const taskStatus = getTaskStatus(poll.json);
    const videoUrl = getVideoUrl(poll.json);
    const lastFrameUrl = getLastFrameUrl(poll.json);

    if (taskStatus === "succeeded" && videoUrl) {
      return {
        taskId,
        taskStatus,
        videoUrl,
        lastFrameUrl,
        latencyMs: Date.now() - startedAt,
      };
    }

    if (isFailureStatus(taskStatus)) {
      throw new SeedanceApiError({
        message: errorMessage(poll.json),
        status: taskStatus,
        errorCode: errorCode(poll.json),
        rawResponse: poll.rawText,
      });
    }
  }

  throw new SeedanceApiError({
    message: `Seedance task timed out after ${MAX_POLLS} polls`,
    status: "timeout",
  });
}
