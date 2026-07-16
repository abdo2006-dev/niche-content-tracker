import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { serializeBigInt } from "@/lib/serialize";
import { sortByFreshVph, withFreshVph } from "@/lib/metrics";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const platform = searchParams.get("platform");
  const creatorId = searchParams.get("creatorId");
  const tagId = searchParams.get("tagId");
  const keyword = searchParams.get("q");
  const range = searchParams.get("range");
  const sort = searchParams.get("sort") ?? "newest";
  const shortsOnly = searchParams.get("shortsOnly");
  const page = Number(searchParams.get("page") ?? "1");
  const pageSize = Math.min(100, Number(searchParams.get("pageSize") ?? "30"));

  const where: Prisma.PostWhereInput = {};
  if (platform) where.platform = platform as any;
  if (creatorId) where.creatorId = creatorId;
  if (tagId) where.tags = { some: { tagId } };
  if (keyword) where.title = { contains: keyword, mode: "insensitive" };
  if (shortsOnly === "true") where.isShort = true;

  const now = new Date();
  if (range === "today") where.publishedAt = { gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()) };
  else if (range === "yesterday") { const s = new Date(now.getFullYear(), now.getMonth(), now.getDate()); where.publishedAt = { gte: new Date(s.getTime() - 86400000), lt: s }; }
  else if (range === "7d") where.publishedAt = { gte: new Date(now.getTime() - 7 * 86400000) };
  else if (range === "30d") where.publishedAt = { gte: new Date(now.getTime() - 30 * 86400000) };

  const orderBy: Prisma.PostOrderByWithRelationInput = ({
    views: { viewCount: "desc" }, likes: { likeCount: "desc" }, vph: { vph: "desc" },
    shares: { shareCount: "desc" }, gained24h: { viewsGained24h: "desc" },
    gained7d: { viewsGained7d: "desc" }, gained30d: { viewsGained30d: "desc" },
  } as any)[sort] ?? { publishedAt: "desc" };

  const include = { creator: { select: { id: true, displayName: true, avatarUrl: true, platform: true } }, tags: { include: { tag: true } } };
  const total = await prisma.post.count({ where });

  if (sort === "vph") {
    const candidates = await prisma.post.findMany({
      where,
      orderBy: { publishedAt: "desc" },
      take: Math.min(2000, total),
      include,
    });
    const posts = sortByFreshVph(candidates).slice((page - 1) * pageSize, page * pageSize);
    return NextResponse.json(serializeBigInt({ posts, total, page, pageSize }));
  }

  const posts = (await prisma.post.findMany({
    where, orderBy, skip: (page - 1) * pageSize, take: pageSize, include,
  })).map(withFreshVph);
  return NextResponse.json(serializeBigInt({ posts, total, page, pageSize }));
}
