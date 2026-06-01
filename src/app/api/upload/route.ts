import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

function randomName() {
  const time = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 10);
  return `${time}-${random}.jpg`;
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const uploadKind = formData.get("uploadKind") === "merchant-wig" ? "merchant" : "mobile";

    if (!(file instanceof File)) {
      return NextResponse.json({ success: false, error: "没有收到照片文件。" }, { status: 400 });
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ success: false, error: "照片过大，请重新上传压缩后的 JPG。" }, { status: 400 });
    }

    if (file.type !== "image/jpeg") {
      return NextResponse.json({ success: false, error: "只支持 JPG 照片。" }, { status: 400 });
    }

    const uploadDir = path.join(process.cwd(), "public", "uploads", uploadKind);
    await mkdir(uploadDir, { recursive: true });

    const filename = randomName();
    const absolutePath = path.join(uploadDir, filename);
    const bytes = Buffer.from(await file.arrayBuffer());
    await writeFile(absolutePath, bytes);

    return NextResponse.json({
      success: true,
      imagePath: `/uploads/${uploadKind}/${filename}`,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "上传失败。",
      },
      { status: 500 },
    );
  }
}
