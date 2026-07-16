import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { serializeBigInt } from "@/lib/serialize";
import { sortByFreshVph, withFreshVph } from "@/lib/metrics";

export const dynamic = "force-dynamic";
export async function GET() {
  const since30d = new Date(Date.now() - 30 * 86400000);
  const since7d = new Date(Date.now() - 7 * 86400000);
  const inc = { creator: { select: { id: true, displayName: true, avatarUrl: true, platform: true } }, tags: { include: { tag: true } }, ideaNotes: true };
  const [fastestGrowing, topByVphCandidates, recent50] = await Promise.all([
    prisma.post.findMany({ where: { publishedAt: { gte: since30d }, viewsGained24h: { gt: 0 } }, orderBy: { viewsGained24h: "desc" }, take: 10, include: inc }),
    prisma.post.findMany({ where: { publishedAt: { gte: since7d } }, orderBy: { publishedAt: "desc" }, take: 500, include: inc }),
    prisma.post.findMany({ where: { publishedAt: { gte: since30d } }, orderBy: { viewCount: "desc" }, take: 50, include: inc }),
  ]);
  const topByVph = sortByFreshVph(topByVphCandidates).slice(0, 10);
  const creatorIds = [...new Set(recent50.map((p) => p.creatorId).filter(Boolean))];
  const avgs = new Map<string, number>();
  for (const cid of creatorIds) {
    const a = await prisma.post.aggregate({ where: { creatorId: cid }, _avg: { viewCount: true } });
    if (cid && a._avg.viewCount) avgs.set(cid, Number(a._avg.viewCount));
  }
  const outliers = recent50.filter((p) => { const avg = p.creatorId ? (avgs.get(p.creatorId) ?? 0) : 0; return avg > 1000 && Number(p.viewCount) > avg * 3; }).slice(0, 10);
  const stopWords = new Set(["the","a","an","and","or","in","on","to","for","of","with","is","my","your","this","that","roblox","video","new","how","get","vs","what","let","put"]);
  const wordCounts = new Map<string, number>();
  const allTitles = await prisma.post.findMany({ where: { publishedAt: { gte: since30d }, title: { not: null } }, select: { title: true } });
  for (const { title } of allTitles) {
    if (!title) continue;
    for (const w of title.toLowerCase().replace(/[^a-z0-9 ]/g," ").split(/\s+/).filter((w) => w.length > 3 && !stopWords.has(w)))
      wordCounts.set(w, (wordCounts.get(w) ?? 0) + 1);
  }
  const topKeywords = [...wordCounts.entries()].sort((a,b)=>b[1]-a[1]).slice(0,20).map(([word,count])=>({word,count}));
  const creators = await prisma.creator.findMany({ where: { posts: { some: { publishedAt: { gte: since30d } } } }, include: { _count: { select: { posts: true } }, tags: { include: { tag: true } } }, take: 20 });
  const creatorsWithAvg = await Promise.all(creators.map(async (c) => {
    const posts = await prisma.post.findMany({ where: { creatorId: c.id, publishedAt: { gte: since30d } }, select: { viewCount: true, publishedAt: true } });
    const fresh = posts.map(withFreshVph);
    const avgVph = fresh.length ? fresh.reduce((sum, p) => sum + p.vph, 0) / fresh.length : 0;
    return { ...c, avgVph, recentPosts: posts.length };
  }));
  const topCreatorsByVph = creatorsWithAvg.sort((a,b)=>b.avgVph-a.avgVph).slice(0,8);
  return NextResponse.json(serializeBigInt({
    fastestGrowing: fastestGrowing.map(withFreshVph),
    topByVph,
    outliers: outliers.map(withFreshVph),
    topCreatorsByVph,
    topKeywords,
  }));
}
