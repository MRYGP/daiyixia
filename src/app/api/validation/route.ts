import { NextRequest, NextResponse } from "next/server";
import { appendValidationLog, type ValidationLogInput } from "@/lib/run-log";

export const runtime = "nodejs";

function errorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown error";
}

function isScore(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 5;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as ValidationLogInput;

    if (
      !isScore(body.hairlineScore) ||
      !isScore(body.edgeBlendScore) ||
      !isScore(body.lightingScore) ||
      !isScore(body.overallScore)
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "hairlineScore, edgeBlendScore, lightingScore and overallScore must be integers from 1 to 5",
        },
        { status: 400 },
      );
    }

    const record = await appendValidationLog({
      runId: body.runId,
      taskId: body.taskId,
      userImagePath: body.userImagePath,
      wigImagePath: body.wigImagePath,
      generationStatus: body.generationStatus || "success",
      errorMessage: body.errorMessage?.trim() || "",
      faceChanged: body.faceChanged || "unknown",
      hairlineScore: body.hairlineScore,
      edgeBlendScore: body.edgeBlendScore,
      stickerLike: body.stickerLike || "unknown",
      lightingScore: body.lightingScore,
      overallScore: body.overallScore,
      canContinue: body.canContinue || "unknown",
      note: body.note?.trim() || "",
    });

    return NextResponse.json({
      success: true,
      validationId: record.validationId,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: errorMessage(error),
      },
      { status: 500 },
    );
  }
}
