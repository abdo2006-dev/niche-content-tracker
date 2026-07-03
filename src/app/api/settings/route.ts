import { NextRequest, NextResponse } from "next/server";
import { getAllSettings, setSetting } from "@/lib/settings";
import { updateSettingSchema } from "@/lib/validations";

export const dynamic = "force-dynamic";
export async function GET() {
  return NextResponse.json({
    ...(await getAllSettings()),
    youtubeConfigured: Boolean(process.env.YOUTUBE_API_KEY),
    tiktokConfigured: Boolean(process.env.TIKTOK_CLIENT_KEY && process.env.TIKTOK_CLIENT_SECRET),
    instagramConfigured: Boolean(process.env.INSTAGRAM_ACCESS_TOKEN),
  });
}
export async function POST(req: NextRequest) {
  const parsed = updateSettingSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  await setSetting(parsed.data.key, parsed.data.value);
  return NextResponse.json({ success: true });
}
