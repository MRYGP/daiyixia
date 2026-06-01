import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const publicBaseUrl = process.env.PUBLIC_BASE_URL?.trim();
  const origin = publicBaseUrl || request.nextUrl.origin;

  return NextResponse.json({
    success: true,
    mobileUrl: new URL("/mobile", origin).toString(),
  });
}
