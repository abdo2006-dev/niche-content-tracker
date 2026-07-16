import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { serializeBigInt } from "@/lib/serialize";
import { sortByFreshVph, withFreshVph } from "@/lib/metrics";

export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  const range = new URL(req.url).searchParams.get("range") ?? "week";
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const week7 = new Date(now.getTime() - 7 * 86400000);
  const month30 = new Date(now.getTime() - 30 * 86400000);
  const rangeStart = { day: today, week: week7, month: month30, all: new Date(0) }[range] ?? week7;
  const [totalCreators, totalPosts, postedToday, postedThisWeek, topByViews, topByVphCandidates, fastestGrowing, recent] = await Promise.all([
    prisma.creator.count(),
    prisma.post.count(),
    prisma.post.count({ where: { publishedAt: { gte: today } } }),
    prisma.post.count({ where: { publishedAt: { gte: week7 } } }),
    prisma.post.findMany({ where: { publishedAt: { gte: rangeStart } }, orderBy: { viewCount: "desc" }, take: 10, include: { creator: { select: { displayName: true, avatarUrl: true, platform: true } }, tags: { include: { tag: true } } } }),
    prisma.post.findMany({ where: { publishedAt: { gte: rangeStart } }, orderBy: { publishedAt: "desc" }, take: 500, include: { creator: { select: { displayName: true, avatarUrl: true, platform: true } }, tags: { include: { tag: true } } } }),
    prisma.post.findMany({ where: { publishedAt: { gte: rangeStart }, viewsGained24h: { gt: 0 } }, orderBy: { viewsGained24h: "desc" }, take: 10, include: { creator: { select: { displayName: true, avatarUrl: true, platform: true } }, tags: { include: { tag: true } } } }),
    prisma.post.findMany({ orderBy: { publishedAt: "desc" }, take: 12, include: { creator: { select: { displayName: true, avatarUrl: true, platform: true } }, tags: { include: { tag: true } } } }),
  ]);
  const topByVph = sortByFreshVph(topByVphCandidates).slice(0, 10);
  return NextResponse.json(serializeBigInt({
    totalCreators,
    totalPosts,
    postedToday,
    postedThisWeek,
    topByViews: topByViews.map(withFreshVph),
    topByVph,
    fastestGrowing: fastestGrowing.map(withFreshVph),
    recent: recent.map(withFreshVph),
  }));
}
