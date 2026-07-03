import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { serializeBigInt } from "@/lib/serialize";

export const dynamic = "force-dynamic";
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const sort = new URL(req.url).searchParams.get("sort") ?? "vph";
  const orderMap: Record<string, any> = {
    views: { post: { viewCount: "desc" } }, vph: { post: { vph: "desc" } },
    gained24h: { post: { viewsGained24h: "desc" } }, gained7d: { post: { viewsGained7d: "desc" } },
    newest: { post: { publishedAt: "desc" } }, shares: { post: { shareCount: "desc" } },
  };
  const rows = await prisma.keywordTrackerPost.findMany({
    where: { keywordTrackerId: params.id, expired: false },
    orderBy: orderMap[sort] ?? { post: { vph: "desc" } }, take: 20,
    include: { post: { include: { creator: { select: { id: true, displayName: true, avatarUrl: true, platform: true } }, tags: { include: { tag: true } } } } },
  });
  return NextResponse.json(serializeBigInt(rows.map((r) => r.post)));
}
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  await prisma.keywordTracker.update({ where: { id: params.id }, data: { active: false } });
  return NextResponse.json({ success: true });
}
