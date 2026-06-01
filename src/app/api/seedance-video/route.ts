import { NextRequest, NextResponse } from "next/server";
import { SEEDANCE_WIGS } from "@/data/seedance-wigs";
import { USER_SAMPLES } from "@/data/users";
import { WIGS } from "@/data/wigs";
import { generateSeedanceHairVideoAndWait, SeedanceApiError } from "@/lib/seedance";

export const runtime = "nodejs";

type SeedanceVideoRequestBody = {
  prompt?: string;
  userImagePath?: string;
  wigImagePath?: string;
  assetId?: string;
  useAssetReference?: boolean;
  useUserReference?: boolean;
  useReferenceImage?: boolean;
  referenceImageConfirmed?: boolean;
  resolution?: string;
  ratio?: string;
  duration?: number;
};

const DEFAULT_PROMPT =
  "A realistic short vertical hairstyle showcase video. A virtual model presents a neat black side-part layered hairstyle, natural hair movement, clean studio lighting, stable face identity, no exaggerated motion, commercial try-on style.";

function isHttpUrl(value: string) {
  return value.startsWith("http://") || value.startsWith("https://");
}

function toPublicImageUrl(imagePath: string) {
  if (isHttpUrl(imagePath)) {
    return imagePath;
  }

  const publicBaseUrl = process.env.PUBLIC_BASE_URL?.trim();
  if (!publicBaseUrl) {
    throw new Error("PUBLIC_BASE_URL 不能为空。Seedance 使用参考图时需要可公网访问的图片地址。");
  }

  const normalizedPath = imagePath.startsWith("/") ? imagePath : `/${imagePath}`;
  return new URL(normalizedPath, publicBaseUrl).toString();
}

function normalizeDuration(value: unknown) {
  const duration = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(duration)) {
    return 4;
  }

  return Math.max(4, Math.min(15, Math.round(duration)));
}

function normalizeAssetUri(value: string | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }

  if (trimmed.startsWith("asset://")) {
    return trimmed;
  }

  if (trimmed.startsWith("asset-")) {
    return `asset://${trimmed}`;
  }

  throw new Error("Asset ID 格式不正确。请填写 asset- 开头的 ID，或完整 asset://asset-... 地址。");
}

function apiErrorMessage(error: unknown) {
  if (error instanceof SeedanceApiError) {
    const friendlyMessage =
      error.errorCode === "InputImageSensitiveContentDetected.PrivacyInformation"
        ? "Seedance 拒绝了当前输入图：检测到图片可能包含真人。该模型不能直接用普通真人照片作为参考输入，需要走火山方舟的已授权真人素材方案或开通对应权限。"
        : error.message;
    return [
      friendlyMessage,
      error.status ? `status=${error.status}` : "",
      error.errorCode ? `error_code=${error.errorCode}` : "",
      error.rawResponse ? `raw=${error.rawResponse}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown error";
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as SeedanceVideoRequestBody;
    const basePrompt = body.prompt?.trim() || DEFAULT_PROMPT;
    const userSample = body.userImagePath ? USER_SAMPLES.find((sample) => sample.imagePath === body.userImagePath) : USER_SAMPLES[0];
    const selectedWig = body.wigImagePath
      ? SEEDANCE_WIGS.find((wig) => wig.imagePath === body.wigImagePath) || WIGS.find((wig) => wig.imagePath === body.wigImagePath)
      : undefined;
    const hairstylePrompt = selectedWig
      ? ` Target hairstyle reference: ${selectedWig.name}, ${selectedWig.color}, ${selectedWig.bangType}. ${selectedWig.promptHint}`
      : "";
    const prompt = `${basePrompt}${hairstylePrompt}`;

    if (body.useUserReference && !userSample) {
      return NextResponse.json(
        {
          success: false,
          error: "当前用户图不在可用配置中。",
        },
        { status: 400 },
      );
    }

    if (body.wigImagePath && !selectedWig) {
      return NextResponse.json(
        {
          success: false,
          error: "当前发型图不在可用配置中。",
        },
        { status: 400 },
      );
    }

    const referenceAssetUri = body.useAssetReference ? normalizeAssetUri(body.assetId) : undefined;
    let personReferenceImageUrl: string | undefined;
    let hairstyleReferenceImageUrl: string | undefined;
    if (!referenceAssetUri && body.useUserReference && userSample) {
      personReferenceImageUrl = toPublicImageUrl(userSample.youcamImagePath || userSample.imagePath);
    }

    if (body.useReferenceImage && selectedWig) {
      hairstyleReferenceImageUrl = toPublicImageUrl(selectedWig.imagePath);
    }

    const result = await generateSeedanceHairVideoAndWait({
      prompt,
      personReferenceImageUrl,
      referenceAssetUri,
      hairstyleReferenceImageUrl,
      referenceImageConfirmed: Boolean(body.referenceImageConfirmed),
      resolution: body.resolution || "720p",
      ratio: body.ratio || "9:16",
      duration: normalizeDuration(body.duration),
    });

    return NextResponse.json({
      success: true,
      provider: "seedance",
      videoUrl: result.videoUrl,
      lastFrameUrl: result.lastFrameUrl,
      taskId: result.taskId,
      taskStatus: result.taskStatus,
      latencyMs: result.latencyMs,
      referenceImageUrl: [referenceAssetUri, personReferenceImageUrl, hairstyleReferenceImageUrl].filter(Boolean).join(", "),
    });
  } catch (error) {
    const status = error instanceof SeedanceApiError ? 422 : 500;
    return NextResponse.json(
      {
        success: false,
        error: apiErrorMessage(error),
      },
      { status },
    );
  }
}
