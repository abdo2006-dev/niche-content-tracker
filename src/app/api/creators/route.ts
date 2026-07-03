import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveCreator } from "@/lib/platforms/index";
import { syncCreatorPosts } from "@/lib/sync";
import { addCreatorSchema } from "@/lib/validations";
import { serializeBigInt } from "@/lib/serialize";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const sort = searchParams.get("sort") ?? "lastPost";
  const platform = searchParams.get("platform");
  const tagId = searchParams.get("tagId");
  const where: any = {};
  if (platform) where.platform = platform;
  if (tagId) where.tags = { some: { tagId } };
  const orderBy: any = sort === "followers" ? { followerCount: "desc" } : sort === "name" ? { displayName: "asc" } : { lastPostAt: "desc" };
  const creators = await prisma.creator.findMany({
    where, orderBy,
    include: { tags: { include: { tag: true } }, _count: { select: { posts: true } } },
  });
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const week7 = new Date(now.getTime() - 7 * 86_400_000);
  const month30 = new Date(now.getTime() - 30 * 86_400_000);
  const enriched = await Promise.all(creators.map(async (c) => {
    const [postsToday, postsWeek, postsMonth, totalViewsAgg] = await Promise.all([
      prisma.post.count({ where: { creatorId: c.id, publishedAt: { gte: today } } }),
      prisma.post.count({ where: { creatorId: c.id, publishedAt: { gte: week7 } } }),
      prisma.post.count({ where: { creatorId: c.id, publishedAt: { gte: month30 } } }),
      prisma.post.aggregate({ where: { creatorId: c.id }, _sum: { viewCount: true } }),
    ]);
    return { ...c, postsToday, postsWeek, postsMonth, totalTrackedViews: totalViewsAgg._sum.viewCount ?? BigInt(0) };
  }));
  return NextResponse.json(serializeBigInt(enriched));
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = addCreatorSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { platform, input, tagIds, fetchRecent } = parsed.data;
  try {
    const resolved = await resolveCreator(platform, input);
    const existing = await prisma.creator.findUnique({ where: { platform_platformId: { platform: resolved.platform, platformId: resolved.platformId } } });
    if (existing) return NextResponse.json({ error: "This creator is already tracked." }, { status: 409 });
    const creator = await prisma.creator.create({
      data: {
        platform: resolved.platform, platformId: resolved.platformId, username: resolved.username,
        displayName: resolved.displayName, profileUrl: resolved.profileUrl, avatarUrl: resolved.avatarUrl,
        bio: resolved.bio, followerCount: resolved.followerCount, platformMeta: resolved.platformMeta as any,
        tags: { create: tagIds.map((tagId) => ({ tagId })) },
      },
    });
    let postsCreated = 0;
    if (fetchRecent) { try { const r = await syncCreatorPosts(creator, 20); postsCreated = r.created; } catch {} }
    return NextResponse.json(serializeBigInt({ creator, postsCreated }), { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? "Failed to add creator." }, { status: 500 });
  }
}
