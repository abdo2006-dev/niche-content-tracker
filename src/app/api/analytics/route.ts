import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { serializeBigInt } from "@/lib/serialize";
import { withFreshVph } from "@/lib/metrics";
import type { Platform, Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

const RANGE_DAYS: Record<string, number> = { "7d": 7, "30d": 30, "90d": 90 };

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const platform = (searchParams.get("platform") ?? "YOUTUBE") as Platform | "ALL";
  const range = searchParams.get("range") ?? "30d";
  const days = RANGE_DAYS[range] ?? 30;
  const since = new Date(Date.now() - days * 86_400_000);

  const where: Prisma.PostWhereInput = { publishedAt: { gte: since }, creatorId: { not: null } };
  if (platform !== "ALL") where.platform = platform;

  const posts = (await prisma.post.findMany({
    where,
    include: {
      creator: {
        select: {
          id: true,
          platform: true,
          displayName: true,
          username: true,
          avatarUrl: true,
          followerCount: true,
        },
      },
    },
  })).map(withFreshVph);

  const byCreator = new Map<string, {
    id: string;
    platform: Platform;
    displayName: string;
    username: string;
    avatarUrl: string | null;
    followerCount: bigint | null;
    posts: number;
    views: bigint;
    likes: bigint;
    comments: bigint;
    shares: bigint;
    bestVph: number;
    bestPostTitle: string | null;
    latestPostAt: Date | null;
  }>();

  for (const post of posts) {
    if (!post.creator) continue;
    const row = byCreator.get(post.creator.id) ?? {
      id: post.creator.id,
      platform: post.creator.platform,
      displayName: post.creator.displayName,
      username: post.creator.username,
      avatarUrl: post.creator.avatarUrl,
      followerCount: post.creator.followerCount,
      posts: 0,
      views: BigInt(0),
      likes: BigInt(0),
      comments: BigInt(0),
      shares: BigInt(0),
      bestVph: 0,
      bestPostTitle: null,
      latestPostAt: null,
    };

    row.posts += 1;
    row.views += post.viewCount;
    row.likes += post.likeCount;
    row.comments += post.commentCount;
    row.shares += post.shareCount;
    if (post.vph && post.vph > row.bestVph) {
      row.bestVph = post.vph;
      row.bestPostTitle = post.title;
    }
    if (!row.latestPostAt || post.publishedAt > row.latestPostAt) row.latestPostAt = post.publishedAt;
    byCreator.set(post.creator.id, row);
  }

  const creators = [...byCreator.values()].map((row) => ({
    ...row,
    avgViews: row.posts ? Number(row.views) / row.posts : 0,
    avgLikes: row.posts ? Number(row.likes) / row.posts : 0,
    viewsPerFollower: row.followerCount && row.followerCount > BigInt(0)
      ? Number(row.views) / Number(row.followerCount)
      : null,
  }));

  const totals = creators.reduce((acc, row) => {
    acc.creators += 1;
    acc.posts += row.posts;
    acc.views += row.views;
    acc.likes += row.likes;
    return acc;
  }, { creators: 0, posts: 0, views: BigInt(0), likes: BigInt(0) });

  return NextResponse.json(serializeBigInt({
    platform,
    range,
    totals,
    mostActive: [...creators].sort((a, b) => b.posts - a.posts || Number(b.views - a.views)).slice(0, 25),
    topByViews: [...creators].sort((a, b) => Number(b.views - a.views)).slice(0, 25),
    topByAvgViews: [...creators].sort((a, b) => b.avgViews - a.avgViews).slice(0, 25),
    topByVph: [...creators].sort((a, b) => b.bestVph - a.bestVph).slice(0, 25),
  }));
}
