/**
 * Core sync logic — platform-agnostic.
 */
import { prisma } from "@/lib/prisma";
import { fetchPostDetails } from "@/lib/platforms/index";
import { fetchYouTubeRecentPosts, fetchYouTubePostDetails } from "@/lib/platforms/youtube";
import { fetchTikTokPostsWithDetails } from "@/lib/platforms/tiktok";
import { fetchInstagramRecentPosts, fetchInstagramRecentPostsByUsername, fetchInstagramPostDetails } from "@/lib/platforms/instagram";
import { calculateVph, calculateGrowthSince } from "@/lib/metrics";
import type { Creator, KeywordTracker } from "@prisma/client";
import { searchPlatform } from "./platforms/index";
import type { ResolvedPost } from "./types";

function chunks<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function saveNewPosts(posts: ResolvedPost[], creator: Creator): Promise<number> {
  if (!posts.length) return 0;

  // Find which platformIds we already have
  const existing = await prisma.post.findMany({
    where: { platformId: { in: posts.map(p => p.platformId) } },
    select: { id: true, platformId: true, creatorId: true },
  });
  const existingIds = new Set(existing.map(p => p.platformId));
  const postsByPlatformId = new Map(posts.map(p => [p.platformId, p]));

  for (const existingPost of existing) {
    if (existingPost.creatorId && existingPost.creatorId !== creator.id) continue;
    const d = postsByPlatformId.get(existingPost.platformId);
    if (!d) continue;
    await prisma.post.update({
      where: { id: existingPost.id },
      data: {
        creatorId: creator.id,
        viewCount: d.viewCount,
        likeCount: d.likeCount,
        commentCount: d.commentCount,
        shareCount: d.shareCount,
        saveCount: d.saveCount,
        vph: calculateVph(d.viewCount, new Date(d.publishedAt)),
        lastStatsUpdateAt: new Date(),
      },
    });
  }

  const newPosts = posts.filter(p => !existingIds.has(p.platformId));

  if (!newPosts.length) return 0;

  const creatorTags = await prisma.creatorTag.findMany({
    where: { creatorId: creator.id },
    select: { tagId: true },
  });

  let created = 0;
  for (const d of newPosts) {
    try {
      await prisma.post.upsert({
        where: { platformId: d.platformId },
        update: {
          // On conflict, update stats in case a post was created without a creatorId
          creatorId: creator.id,
          viewCount: d.viewCount,
          likeCount: d.likeCount,
          commentCount: d.commentCount,
          shareCount: d.shareCount,
          saveCount: d.saveCount,
          vph: calculateVph(d.viewCount, new Date(d.publishedAt)),
          lastStatsUpdateAt: new Date(),
        },
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
          vph: calculateVph(d.viewCount, new Date(d.publishedAt)),
          lastStatsUpdateAt: new Date(),
          source: "CREATOR_SYNC",
          platformMeta: d.platformMeta as any,
          tags: { create: creatorTags.map(ct => ({ tagId: ct.tagId })) },
          statsSnapshots: {
            create: {
              viewCount: d.viewCount,
              likeCount: d.likeCount,
              commentCount: d.commentCount,
              shareCount: d.shareCount,
              saveCount: d.saveCount,
            },
          },
        },
      });
      created++;
    } catch (err: any) {
      console.warn(`saveNewPosts: failed to save ${d.platformId}: ${err.message}`);
    }
  }
  return created;
}

/** Sync new posts for a single creator. Returns { checked, created }. */
export async function syncCreatorPosts(creator: Creator, max = 35) {
  const meta = (creator.platformMeta ?? {}) as Record<string, unknown>;
  let posts: ResolvedPost[] = [];

  // ── TikTok: single-pass via tikwm.com /user/posts ─────────────────────────
  // tikwm's /user/posts already includes full stats — no separate detail call
  // needed. This avoids rate-limit issues from per-video API requests.
  if (creator.platform === "TIKTOK") {
    const username = (meta.username as string | undefined)?.replace(/^@/, "") ?? creator.username.replace(/^@/, "");
    posts = await fetchTikTokPostsWithDetails(username, max);
  }

  // ── YouTube: playlist fetch → batch details ───────────────────────────────
  else if (creator.platform === "YOUTUBE") {
    const playlistId = meta.uploadsPlaylistId as string | undefined;
    if (!playlistId) throw new Error("YouTube creator has no uploads playlist ID in platformMeta.");
    const stubs = await fetchYouTubeRecentPosts(playlistId, max);
    for (const batch of chunks(stubs.map(s => s.platformId), 50)) {
      const details = await fetchYouTubePostDetails(batch);
      posts.push(...details);
    }
  }

  // ── Instagram: userId feed → details ─────────────────────────────────────
  else if (creator.platform === "INSTAGRAM") {
    let stubs;
    try {
      stubs = await fetchInstagramRecentPosts(creator.platformId, max);
    } catch {
      const username = (meta.username as string | undefined)?.replace(/^@/, "");
      if (!username) throw new Error("Instagram creator has no username in platformMeta.");
      stubs = await fetchInstagramRecentPostsByUsername(username, max);
    }
    for (const batch of chunks(stubs.map(s => s.platformId), 10)) {
      const details = await fetchInstagramPostDetails(batch);
      posts.push(...details);
    }
  }

  const created = await saveNewPosts(posts, creator);

  await prisma.creator.update({
    where: { id: creator.id },
    data: {
      lastSyncedAt: new Date(),
      lastPostAt: posts[0] ? new Date(posts[0].publishedAt) : creator.lastPostAt,
    },
  });

  return { checked: posts.length, created };
}

/** Re-fetch and update stats for a list of post DB IDs. */
export async function updatePostStats(postDbIds: string[]) {
  const posts = await prisma.post.findMany({ where: { id: { in: postDbIds } } });
  const byPlatform = new Map<string, typeof posts>();
  for (const p of posts) {
    const list = byPlatform.get(p.platform) ?? [];
    list.push(p);
    byPlatform.set(p.platform, list);
  }

  let updated = 0;
  for (const [platform, group] of byPlatform) {
    const batchSize = platform === "YOUTUBE" ? 50 : 10;
    for (const batch of chunks(group, batchSize)) {
      try {
        const details = await fetchPostDetails(platform as any, batch.map(p => p.platformId));
        const byPlatformId = new Map(details.map(d => [d.platformId, d]));

        for (const post of batch) {
          const d = byPlatformId.get(post.platformId);
          if (!d) continue;
          const snapshots = await prisma.postStatsSnapshot.findMany({
            where: { postId: post.id }, orderBy: { capturedAt: "asc" },
          });
          const vph = calculateVph(d.viewCount, post.publishedAt);
          const viewsGained24h = calculateGrowthSince(d.viewCount, snapshots, 24);
          const viewsGained7d = calculateGrowthSince(d.viewCount, snapshots, 168);
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
      } catch (err: any) {
        console.warn(`updatePostStats: batch failed for ${platform}: ${err.message}`);
      }
    }
  }
  return { updated };
}

/** Run a keyword tracker across its selected platforms. */
export async function refreshKeywordTracker(tracker: KeywordTracker & { platforms: any[] }, maxResults = 20) {
  const allPostIds: string[] = [];
  let created = 0;

  for (const platform of tracker.platforms as any[]) {
    let platformIds: string[] = [];
    try {
      platformIds = await searchPlatform(platform, tracker.query, { shortsOnly: tracker.shortsOnly, max: maxResults });
    } catch (e: any) {
      console.warn(`Keyword search on ${platform} failed: ${e.message}`);
      continue;
    }

    const existing = await prisma.post.findMany({
      where: { platformId: { in: platformIds } },
      select: { id: true, platformId: true },
    });
    const existingByPlatformId = new Map(existing.map(p => [p.platformId, p]));
    const missing = platformIds.filter(id => !existingByPlatformId.has(id));

    for (const batch of chunks(missing, platform === "YOUTUBE" ? 50 : 10)) {
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
    existing.forEach(p => allPostIds.push(p.id));
  }

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
