import { NextRequest, NextResponse } from "next/server";
import { WIGS } from "@/data/wigs";
import { USER_SAMPLES } from "@/data/users";
import { appendRunLog } from "@/lib/run-log";
import { generateYouCamHairTransferAndWait, YouCamApiError } from "@/lib/youcam";

export const runtime = "nodejs";

type TryOnRequestBody = {
  userImagePath?: string;
  wigImagePath?: string;
};

function isHttpUrl(value: string) {
  return value.startsWith("http://") || value.startsWith("https://");
}

function isUploadedUserImagePath(value: string) {
  return value.startsWith("/uploads/mobile/") && value.endsWith(".jpg");
}

function isUploadedWigImagePath(value: string) {
  return value.startsWith("/uploads/merchant/") && value.endsWith(".jpg");
}

function toPublicImageUrl(imagePath: string) {
  if (isHttpUrl(imagePath)) {
    return imagePath;
  }

  const publicBaseUrl = process.env.PUBLIC_BASE_URL?.trim();
  if (!publicBaseUrl) {
    throw new Error("PUBLIC_BASE_URL 不能为空。试戴服务需要通过公网 URL 下载输入图片。");
  }

  const normalizedPath = imagePath.startsWith("/") ? imagePath : `/${imagePath}`;
  return new URL(normalizedPath, publicBaseUrl).toString();
}

async function assertPublicImageReachable(label: string, imageUrl: string) {
  let response: Response;

  try {
    response = await fetch(imageUrl, {
      method: "GET",
      headers: { Range: "bytes=0-0" },
      cache: "no-store",
    });
  } catch (error) {
    throw new Error(
      [
        `${label}公网地址访问失败。`,
        `地址：${imageUrl}`,
        "请确认 PUBLIC_BASE_URL 对外可访问，并且 Cloudflare/ngrok 隧道正在运行。",
        `原始错误：${error instanceof Error ? error.message : "Unknown error"}`,
      ].join("\n"),
    );
  }

  const contentType = response.headers.get("content-type") || "";
  if (!response.ok || !contentType.toLowerCase().startsWith("image/")) {
    const bodyText = await response.text().catch(() => "");
    throw new Error(
      [
        `${label}公网地址无法作为图片下载。`,
        `地址：${imageUrl}`,
        `HTTP 状态：${response.status}`,
        `Content-Type：${contentType || "空"}`,
        bodyText ? `响应内容：${bodyText.slice(0, 300)}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }
}

function errorMessage(error: unknown) {
  if (error instanceof YouCamApiError) {
    const code = error.errorCode || error.message;
    const friendlyMessage =
      code === "error_no_face"
        ? "未检测到可用人脸。请换成正脸、单人、完整脸部、肩膀可见的 JPG 图片。"
        : code === "error_no_shoulder"
          ? "没有检测到肩膀。请使用包含头部、完整脸部和肩膀的半身正面图。"
          : code === "error_large_face_angle" || code === "error_face_pose"
            ? "人脸角度过大。请使用更接近正面的照片。"
            : code === "error_insufficient_landmarks"
              ? "没有检测到足够的人脸或身体关键点。请换成清晰、无遮挡、光线稳定的单人正面图。"
              : error.message;
    const details = [
      friendlyMessage,
      error.status ? `status=${error.status}` : "",
      error.errorCode ? `error_code=${error.errorCode}` : "",
      error.rawResponse ? `raw=${error.rawResponse}` : "",
    ].filter(Boolean);
    return details.join("\n");
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown error";
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as TryOnRequestBody;

    if (!body.userImagePath || !body.wigImagePath) {
      return NextResponse.json(
        {
          success: false,
          error: "userImagePath and wigImagePath are required",
        },
        { status: 400 },
      );
    }

    const userSample = USER_SAMPLES.find((sample) => sample.imagePath === body.userImagePath);
    const isUploadedUserImage = isUploadedUserImagePath(body.userImagePath);
    const wigSample = WIGS.find((sample) => sample.imagePath === body.wigImagePath);
    const isUploadedWigImage = isUploadedWigImagePath(body.wigImagePath);

    if ((!userSample && !isUploadedUserImage) || (!wigSample && !isUploadedWigImage)) {
      return NextResponse.json(
        {
          success: false,
          error: "当前用户图或发型图不在可用配置中。",
        },
        { status: 400 },
      );
    }

    if (userSample?.suitability === "unsupported" || wigSample?.suitability === "unsupported") {
      return NextResponse.json(
        {
          success: false,
          error: "当前用户图或发型图暂不支持生成试戴效果。",
        },
        { status: 400 },
      );
    }

    const userInputPath = userSample?.youcamImagePath || body.userImagePath;
    const wigInputPath = wigSample?.youcamImagePath || body.wigImagePath;
    const userImageUrl = toPublicImageUrl(userInputPath);
    const wigImageUrl = toPublicImageUrl(wigInputPath);
    await assertPublicImageReachable("用户图", userImageUrl);
    await assertPublicImageReachable("发型图", wigImageUrl);

    const result = await generateYouCamHairTransferAndWait({
      srcFileUrl: userImageUrl,
      refFileUrl: wigImageUrl,
    });

    const runLog = await appendRunLog({
      provider: "youcam",
      model: "hair-transfer-v2.1",
      userImagePath: userInputPath,
      wigImagePath: wigInputPath,
      userImageUrl,
      wigImageUrl,
      resultImageUrl: result.resultImageUrl,
      taskId: result.taskId,
      latencyMs: result.latencyMs,
    });

    return NextResponse.json({
      success: true,
      provider: "youcam",
      runId: runLog.runId,
      resultImageUrl: result.resultImageUrl,
      taskId: result.taskId,
      taskStatus: result.taskStatus,
      latencyMs: result.latencyMs,
      userImageUrl,
      wigImageUrl,
    });
  } catch (error) {
    const status = error instanceof YouCamApiError ? 422 : 500;
    return NextResponse.json(
      {
        success: false,
        error: errorMessage(error),
      },
      { status },
    );
  }
}
