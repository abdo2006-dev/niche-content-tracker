/**
 * Core sync logic — platform-agnostic.
 * Dispatches to platform wrappers via src/lib/platforms/index.ts.
 */
import { prisma } from "@/lib/prisma";
import { fetchRecentPosts, fetchPostDetails } from "@/lib/platforms/index";
import { fetchInstagramRecentPosts } from "@/lib/platforms/instagram";
import { calculateVph, calculateGrowthSince } from "@/lib/metrics";
import type { Creator, KeywordTracker } from "@prisma/client";
import { searchPlatform } from "./platforms/index";

function chunks<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** Sync new posts for a single creator. */
export async function syncCreatorPosts(creator: Creator, max = 20) {
  const meta = (creator.platformMeta ?? {}) as Record<string, unknown>;

  // Fetch recent post stubs from the platform
  let stubs;
  if (creator.platform === "INSTAGRAM") {
    stubs = await fetchInstagramRecentPosts(creator.platformId, max);
  } else {
    stubs = await fetchRecentPosts(creator.platform, meta, max);
  }

  // Find which ones we don't have yet
  const existing = await prisma.post.findMany({
    where: { platformId: { in: stubs.map((s) => s.platformId) } },
    select: { platformId: true },
  });
  const existingIds = new Set(existing.map((p) => p.platformId));
  const newIds = stubs.filter((s) => !existingIds.has(s.platformId)).map((s) => s.platformId);

  let created = 0;
  if (newIds.length > 0) {
    const creatorTags = await prisma.creatorTag.findMany({ where: { creatorId: creator.id }, select: { tagId: true } });

    // Batch by 50 for YouTube, 20 for TikTok/IG
    const batchSize = creator.platform === "YOUTUBE" ? 50 : 20;
    for (const batch of chunks(newIds, batchSize)) {
      const details = await fetchPostDetails(creator.platform, batch);
      for (const d of details) {
        const vph = calculateVph(d.viewCount, new Date(d.publishedAt));
        await prisma.post.upsert({
          where: { platformId: d.platformId },
          update: {},
          create: {
            platform: d.platform,
            platformId: d.platformId,
            title: d.title,
            description: d.description,
            publishedAt: new Date(d.publishedAt),
            thumbnailUrl: d.thumbnailUrl,
            durationSeconds: d.durationSeconds,
            isShort: d.isShort,
            url: d.url,
            mediaType: d.mediaType,
            creatorId: creator.id,
            viewCount: d.viewCount,
            likeCount: d.likeCount,
            commentCount: d.commentCount,
            shareCount: d.shareCount,
            saveCount: d.saveCount,
            vph,
            lastStatsUpdateAt: new Date(),
            source: "CREATOR_SYNC",
            platformMeta: d.platformMeta as any,
            tags: { create: creatorTags.map((ct) => ({ tagId: ct.tagId })) },
            statsSnapshots: {
              create: {
                viewCount: d.viewCount, likeCount: d.likeCount,
                commentCount: d.commentCount, shareCount: d.shareCount, saveCount: d.saveCount,
              },
            },
          },
        });
        created++;
      }
    }
  }

  const latestStub = stubs[0];
  await prisma.creator.update({
    where: { id: creator.id },
    data: {
      lastSyncedAt: new Date(),
      lastPostAt: latestStub ? new Date(latestStub.publishedAt) : creator.lastPostAt,
    },
  });

  return { checked: stubs.length, created };
}

/** Re-fetch stats for a list of post DB IDs and update snapshots + growth metrics. */
export async function updatePostStats(postDbIds: string[]) {
  const posts = await prisma.post.findMany({ where: { id: { in: postDbIds } } });
  // Group by platform so we can batch efficiently
  const byPlatform = new Map<string, typeof posts>();
  for (const p of posts) {
    const list = byPlatform.get(p.platform) ?? [];
    list.push(p);
    byPlatform.set(p.platform, list);
  }

  let updated = 0;
  for (const [platform, group] of byPlatform) {
    const batchSize = platform === "YOUTUBE" ? 50 : 20;
    for (const batch of chunks(group, batchSize)) {
      const details = await fetchPostDetails(platform as any, batch.map((p) => p.platformId));
      const byPlatformId = new Map(details.map((d) => [d.platformId, d]));

      for (const post of batch) {
        const d = byPlatformId.get(post.platformId);
        if (!d) continue;

        const snapshots = await prisma.postStatsSnapshot.findMany({
          where: { postId: post.id },
          orderBy: { capturedAt: "asc" },
        });

        const vph = calculateVph(d.viewCount, post.publishedAt);
        const viewsGained24h = calculateGrowthSince(d.viewCount, snapshots, 24);
        const viewsGained7d  = calculateGrowthSince(d.viewCount, snapshots, 168);
        const viewsGained30d = calculateGrowthSince(d.viewCount, snapshots, 720);

        await prisma.post.update({
          where: { id: post.id },
          data: {
            viewCount: d.viewCount, likeCount: d.likeCount,
            commentCount: d.commentCount, shareCount: d.shareCount, saveCount: d.saveCount,
            vph, viewsGained24h, viewsGained7d, viewsGained30d,
            lastStatsUpdateAt: new Date(),
            statsSnapshots: {
              create: {
                viewCount: d.viewCount, likeCount: d.likeCount,
                commentCount: d.commentCount, shareCount: d.shareCount, saveCount: d.saveCount,
              },
            },
          },
        });
        updated++;
      }
    }
  }
  return { updated };
}

/** Run or re-run a keyword tracker across its selected platforms. */
export async function refreshKeywordTracker(tracker: KeywordTracker & { platforms: any[] }, maxResults = 20) {
  const allPostIds: string[] = [];
  let created = 0;

  for (const platform of tracker.platforms as any[]) {
    let platformIds: string[] = [];
    try {
      platformIds = await searchPlatform(platform, tracker.query, { shortsOnly: tracker.shortsOnly, max: maxResults });
    } catch (e: any) {
      // If a platform isn't configured, skip it gracefully
      console.warn(`Keyword search on ${platform} failed: ${e.message}`);
      continue;
    }

    const existing = await prisma.post.findMany({
      where: { platformId: { in: platformIds } },
      select: { id: true, platformId: true },
    });
    const existingByPlatformId = new Map(existing.map((p) => [p.platformId, p]));
    const missing = platformIds.filter((id) => !existingByPlatformId.has(id));

    const batchSize = platform === "YOUTUBE" ? 50 : 20;
    for (const batch of chunks(missing, batchSize)) {
      const details = await fetchPostDetails(platform, batch);
      for (const d of details) {
        const matchedCreator = await prisma.creator.findUnique({
          where: { platform_platformId: { platform: d.platform, platformId: d.platformId.slice(0, 50) } },
        }).catch(() => null);

        const saved = await prisma.post.upsert({
          where: { platformId: d.platformId },
          update: {},
          create: {
            platform: d.platform, platformId: d.platformId, title: d.title,
            description: d.description, publishedAt: new Date(d.publishedAt),
            thumbnailUrl: d.thumbnailUrl, durationSeconds: d.durationSeconds,
            isShort: d.isShort, url: d.url, mediaType: d.mediaType,
            creatorId: matchedCreator?.id ?? null,
            viewCount: d.viewCount, likeCount: d.likeCount,
            commentCount: d.commentCount, shareCount: d.shareCount, saveCount: d.saveCount,
            vph: calculateVph(d.viewCount, new Date(d.publishedAt)),
            lastStatsUpdateAt: new Date(), source: "KEYWORD_SEARCH",
            statsSnapshots: {
              create: {
                viewCount: d.viewCount, likeCount: d.likeCount,
                commentCount: d.commentCount, shareCount: d.shareCount, saveCount: d.saveCount,
              },
            },
          },
        });
        allPostIds.push(saved.id);
        created++;
      }
    }
    existing.forEach((p) => allPostIds.push(p.id));
  }

  // Link all found posts to this tracker
  for (const postId of [...new Set(allPostIds)]) {
    await prisma.keywordTrackerPost.upsert({
      where: { keywordTrackerId_postId: { keywordTrackerId: tracker.id, postId } },
      update: { expired: false },
      create: { keywordTrackerId: tracker.id, postId },
    });
  }

  await prisma.keywordTracker.update({ where: { id: tracker.id }, data: { lastFetchedAt: new Date() } });
  return { found: allPostIds.length, created };
}

/** Mark tracker-post links older than maxAgeDays as expired. */
export async function archiveExpiredTrackerPosts() {
  const trackers = await prisma.keywordTracker.findMany({ where: { active: true } });
  let archived = 0;
  for (const t of trackers) {
    const cutoff = new Date(Date.now() - t.maxAgeDays * 86_400_000);
    const r = await prisma.keywordTrackerPost.updateMany({
      where: { keywordTrackerId: t.id, addedAt: { lt: cutoff }, expired: false },
      data: { expired: true },
    });
    archived += r.count;
  }
  return { archived };
}
