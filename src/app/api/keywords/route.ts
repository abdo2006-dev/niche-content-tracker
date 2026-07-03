import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createKeywordTrackerSchema } from "@/lib/validations";
import { refreshKeywordTracker } from "@/lib/sync";
import { getSetting } from "@/lib/settings";
import { serializeBigInt } from "@/lib/serialize";

export const dynamic = "force-dynamic";
export async function GET() {
  const trackers = await prisma.keywordTracker.findMany({
    where: { active: true }, orderBy: { createdAt: "desc" },
    include: { tags: { include: { tag: true } }, _count: { select: { posts: true } } },
  });
  return NextResponse.json(trackers);
}
export async function POST(req: NextRequest) {
  const parsed = createKeywordTrackerSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { query, platforms, shortsOnly, maxAgeDays, tagIds } = parsed.data;
  const existing = await prisma.keywordTracker.findUnique({ where: { query_shortsOnly: { query, shortsOnly } } });
  if (existing) return NextResponse.json({ error: "A tracker for this keyword already exists." }, { status: 409 });
  const tracker = await prisma.keywordTracker.create({ data: { query, platforms, shortsOnly, maxAgeDays, tags: { create: tagIds.map((tagId) => ({ tagId })) } } });
  try {
    const max = Number(await getSetting("maxPostsPerKeyword")) || 20;
    const result = await refreshKeywordTracker(tracker as any, max);
    return NextResponse.json(serializeBigInt({ tracker, ...result }), { status: 201 });
  } catch (err: any) {
    return NextResponse.json(serializeBigInt({ tracker, error: err.message }), { status: 201 });
  }
}
