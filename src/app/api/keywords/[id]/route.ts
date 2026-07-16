import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { serializeBigInt } from "@/lib/serialize";
import { sortByFreshVph, withFreshVph } from "@/lib/metrics";

export const dynamic = "force-dynamic";
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const sort = new URL(req.url).searchParams.get("sort") ?? "vph";
  const orderMap: Record<string, any> = {
    views: { post: { viewCount: "desc" } },
    gained24h: { post: { viewsGained24h: "desc" } }, gained7d: { post: { viewsGained7d: "desc" } },
    newest: { post: { publishedAt: "desc" } }, shares: { post: { shareCount: "desc" } },
  };
  const rows = await prisma.keywordTrackerPost.findMany({
    where: { keywordTrackerId: params.id, expired: false },
    orderBy: orderMap[sort] ?? { post: { publishedAt: "desc" } },
    take: sort === "vph" ? 500 : 20,
    include: { post: { include: { creator: { select: { id: true, displayName: true, avatarUrl: true, platform: true } }, tags: { include: { tag: true } } } } },
  });
  const posts = rows.map((r) => r.post);
  return NextResponse.json(serializeBigInt(sort === "vph" ? sortByFreshVph(posts).slice(0, 20) : posts.map(withFreshVph)));
}
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  await prisma.keywordTracker.update({ where: { id: params.id }, data: { active: false } });
  return NextResponse.json({ success: true });
}
