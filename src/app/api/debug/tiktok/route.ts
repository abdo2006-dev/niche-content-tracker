import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { serializeBigInt } from "@/lib/serialize";
import {
  fetchTikTokPostsWithDetails,
  fetchTikwmUserPostsRaw,
  parseTikwmPosts,
  parseTikwmPostsWithDetails,
} from "@/lib/platforms/tiktok";

export const dynamic = "force-dynamic";

function cleanUsername(value: string) {
  return value.trim().replace(/^@/, "");
}

export async function GET(req: NextRequest) {
  const username = cleanUsername(req.nextUrl.searchParams.get("username") ?? "corlgarden");

  try {
    let raw: any = null;
    let tikwmError: string | null = null;
    let parsedStubs: any[] = [];
    let parsedPosts: any[] = [];

    try {
      raw = await fetchTikwmUserPostsRaw(username, 5, "0");
      parsedStubs = parseTikwmPosts(raw, 5);
      parsedPosts = parseTikwmPostsWithDetails(raw, username, 5);
    } catch (err: any) {
      tikwmError = err.message ?? "tikwm debug fetch failed";
      parsedPosts = await fetchTikTokPostsWithDetails(username, 5);
      parsedStubs = parsedPosts.map((post) => ({
        platformId: post.platformId,
        publishedAt: post.publishedAt,
      }));
    }

    const creator = await prisma.creator.findFirst({
      where: {
        platform: "TIKTOK",
        OR: [
          { username: { equals: `@${username}`, mode: "insensitive" } },
          { username: { equals: username, mode: "insensitive" } },
          { platformMeta: { path: ["username"], equals: username } },
        ],
      },
      select: { id: true, username: true, displayName: true, platformMeta: true },
    });

    const dbPostCount = creator
      ? await prisma.post.count({ where: { creatorId: creator.id } })
      : 0;

    const matchingPlatformIds = parsedStubs.map((stub) => stub.platformId);
    const existingMatchingPosts = matchingPlatformIds.length
      ? await prisma.post.findMany({
          where: { platformId: { in: matchingPlatformIds } },
          select: { id: true, platformId: true, creatorId: true, source: true },
        })
      : [];

    return NextResponse.json(
      serializeBigInt({
        username,
        providers: {
          tikwm: tikwmError ? "failed" : "ok",
          tikwmError,
          apifyConfigured: Boolean(process.env.APIFY_TOKEN),
        },
        raw,
        parsedStubs,
        parsedPosts,
        db: {
          creator,
          postCountForCreator: dbPostCount,
          existingMatchingPosts,
        },
      })
    );
  } catch (err: any) {
    return NextResponse.json(
      { username, error: err.message ?? "TikTok debug failed." },
      { status: 500 }
    );
  }
}
