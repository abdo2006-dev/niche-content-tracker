/**
 * TikTok scraper — no API key, no account, no approval needed.
 *
 * How it works:
 *  1. GET https://www.tiktok.com/@{username}  — TikTok embeds the user's full
 *     profile data (including secUid) in a <script id="__UNIVERSAL_DATA_FOR_REHYDRATION__">
 *     tag in the HTML. We parse that JSON.
 *  2. GET https://m.tiktok.com/api/post/item_list/ — TikTok's internal mobile
 *     API that the web app itself uses to load the video grid. We pass the
 *     secUid from step 1 to get a paginated list of videos with their stats.
 *  3. For keyword search we use the hashtag challenge page:
 *     https://www.tiktok.com/tag/{hashtag}
 *
 * Limitations:
 *  - Private accounts return no videos.
 *  - TikTok rate-limits aggressive crawling — we stay well within safe limits
 *    by only syncing on the cron schedule (every 6h per creator).
 *  - If TikTok changes their HTML structure, parsing will fail gracefully with
 *    a clear error message. The workaround is to update the selector below.
 */
import { prisma } from "@/lib/prisma";
import type { ResolvedCreator, PostStub, ResolvedPost } from "@/lib/types";

// --- Shared browser-like headers -------------------------------------------
// TikTok blocks plain Node.js UA strings. Using a real Chrome UA is enough
// for a low-frequency personal tool.
const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  Referer: "https://www.tiktok.com/",
  "Cache-Control": "no-cache",
};

const API_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  Referer: "https://www.tiktok.com/",
};

const RECENT_LOOKBACK_DAYS = 14;
const MAX_TIKTOK_PAGES = 6;
const tiktokItemCache = new Map<string, any>();

async function log(endpoint: string) {
  try {
    await prisma.apiUsageLog.create({
      data: { platform: "TIKTOK", endpoint, units: 1 },
    });
  } catch {}
}

function cutoffDate(days = RECENT_LOOKBACK_DAYS) {
  return new Date(Date.now() - days * 86_400_000);
}

function toPostStub(item: any): PostStub | null {
  if (!item?.id || !item?.createTime) return null;
  return {
    platformId: String(item.id),
    publishedAt: new Date(Number(item.createTime) * 1000).toISOString(),
    raw: item,
  };
}

function tiktokItemToPost(item: any, fallbackId: string): ResolvedPost | null {
  if (!item) return null;
  const id = String(item.id ?? fallbackId);
  const video = item.video ?? {};
  const stats = item.stats ?? item.statsV2 ?? {};
  const author = item.author ?? {};
  const desc = (item.desc ?? "").slice(0, 300);
  const dur = Number(video.duration ?? 0);

  return {
    platform: "TIKTOK",
    platformId: id,
    title: desc.slice(0, 200) || null,
    description: desc || null,
    publishedAt: new Date(Number(item.createTime ?? 0) * 1000).toISOString(),
    thumbnailUrl: video.cover ?? video.dynamicCover ?? null,
    durationSeconds: dur,
    isShort: true,
    url: `https://www.tiktok.com/@${author.uniqueId ?? "unknown"}/video/${id}`,
    mediaType: "VIDEO",
    viewCount: BigInt(stats.playCount ?? stats.viewCount ?? 0),
    likeCount: BigInt(stats.diggCount ?? stats.likeCount ?? 0),
    commentCount: BigInt(stats.commentCount ?? 0),
    shareCount: BigInt(stats.shareCount ?? 0),
    saveCount: BigInt(stats.collectCount ?? 0),
    platformMeta: {
      hashtags: (item.textExtra ?? [])
        .filter((t: any) => t.hashtagName)
        .map((t: any) => t.hashtagName as string),
    },
  };
}

function stubsFromProfileData(data: any, max: number): PostStub[] {
  const scope = data["__DEFAULT_SCOPE__"] ?? {};
  const itemList =
    scope["webapp.user-detail"]?.itemList ??
    scope["webapp.user-detail"]?.userInfo?.itemList ??
    [];
  const cutoff = cutoffDate();
  const videoItems: PostStub[] = [];

  for (const item of itemList) {
    const stub = toPostStub(item);
    if (!stub || new Date(stub.publishedAt) < cutoff) continue;
    tiktokItemCache.set(stub.platformId, item);
    videoItems.push(stub);
  }

  return videoItems.slice(0, max);
}

function clean(username: string): string {
  // Accept: @username, username, https://tiktok.com/@username, tiktok.com/@username
  const t = username.trim();
  try {
    const url = new URL(t.startsWith("http") ? t : t.includes("tiktok.com") ? `https://${t}` : "");
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts[0]?.startsWith("@")) return parts[0].replace(/^@/, "");
  } catch {}
  return t.replace(/^@/, "");
}

/** Parses the __UNIVERSAL_DATA_FOR_REHYDRATION__ JSON from a TikTok page. */
async function parsePageData(url: string): Promise<any> {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`TikTok page fetch failed (${res.status}) for ${url}`);
  const html = await res.text();

  const match = html.match(
    /<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/
  );
  if (!match) {
    throw new Error(
      `Could not find TikTok embedded data on ${url}. ` +
        `The account may be private, or TikTok may have changed their HTML. ` +
        `Try adding the creator manually.`
    );
  }
  try {
    return JSON.parse(match[1]);
  } catch {
    throw new Error(`Failed to parse TikTok page data from ${url}`);
  }
}

// --- Creator resolution -----------------------------------------------------

export async function resolveTikTokCreator(input: string): Promise<ResolvedCreator> {
  const username = clean(input);
  const data = await parsePageData(`https://www.tiktok.com/@${username}`);
  await log("scrape/@username");

  const scope = data["__DEFAULT_SCOPE__"] ?? {};
  const userDetail = scope["webapp.user-detail"];
  const userInfo = userDetail?.userInfo;
  const user = userInfo?.user;
  const stats = userInfo?.stats;

  if (!user) {
    throw new Error(
      `@${username} not found on TikTok. Make sure the handle is correct and the account is public.`
    );
  }

  return {
    platform: "TIKTOK",
    platformId: user.id,
    username: `@${user.uniqueId ?? username}`,
    displayName: user.nickname ?? user.uniqueId ?? username,
    profileUrl: `https://www.tiktok.com/@${user.uniqueId ?? username}`,
    avatarUrl: user.avatarLarger ?? user.avatarMedium ?? null,
    bio: user.signature ?? null,
    followerCount: stats?.followerCount != null ? BigInt(stats.followerCount) : null,
    platformMeta: {
      username: user.uniqueId ?? username,
      secUid: user.secUid ?? null,
    },
  };
}

// --- Recent posts -----------------------------------------------------------

export async function fetchTikTokRecentPosts(username: string, max = 120): Promise<PostStub[]> {
  // First get secUid from the profile page (it's embedded in the HTML)
  const data = await parsePageData(`https://www.tiktok.com/@${username}`);
  await log("scrape/@username");

  const scope = data["__DEFAULT_SCOPE__"] ?? {};
  const user = scope["webapp.user-detail"]?.userInfo?.user;
  const secUid = user?.secUid;

  if (!secUid) {
    // Fall back: try to extract videos embedded in the page HTML.
    return stubsFromProfileData(data, max);
  }

  const cutoff = cutoffDate();
  const results: PostStub[] = [];
  let cursor = "0";

  for (let page = 0; page < MAX_TIKTOK_PAGES && results.length < max; page++) {
    const params = new URLSearchParams({
      aid: "1988",
      count: String(Math.min(35, max - results.length)),
      secUid,
      cursor,
      sourceType: "8",
      appId: "1233",
    });

    const res = await fetch(`https://m.tiktok.com/api/post/item_list/?${params}`, {
      headers: API_HEADERS,
    });
    await log("api/post/item_list");

    if (!res.ok) throw new Error(`TikTok video list failed (${res.status})`);
    const text = await res.text();
    if (!text.trim()) {
      if (results.length) break;
      return stubsFromProfileData(data, max);
    }

    let json: any;
    try {
      json = JSON.parse(text);
    } catch {
      if (results.length) break;
      return stubsFromProfileData(data, max);
    }
    const items: any[] = json.itemList ?? [];
    if (!items.length) break;

    let reachedOlderPosts = false;
    for (const item of items) {
      const stub = toPostStub(item);
      if (!stub) continue;
      tiktokItemCache.set(stub.platformId, item);
      if (new Date(stub.publishedAt) < cutoff) {
        reachedOlderPosts = true;
        continue;
      }
      results.push(stub);
      if (results.length >= max) break;
    }

    if (reachedOlderPosts || !json.hasMore) break;
    cursor = String(json.cursor ?? items[items.length - 1]?.createTime ?? cursor);
  }

  return results.slice(0, max);
}

// --- Video details ----------------------------------------------------------

export async function fetchTikTokPostDetails(videoIds: string[]): Promise<ResolvedPost[]> {
  if (!videoIds.length) return [];
  const results: ResolvedPost[] = [];

  for (const id of videoIds) {
    try {
      const cached = tiktokItemToPost(tiktokItemCache.get(id), id);
      if (cached) {
        results.push(cached);
        continue;
      }

      // Scrape the individual video page — stats are embedded in the HTML
      // We use a short URL which redirects to the full canonical URL
      const data = await parsePageData(`https://www.tiktok.com/video/${id}`);
      await log("scrape/video/{id}");

      const scope = data["__DEFAULT_SCOPE__"] ?? {};
      const videoDetail =
        scope["webapp.video-detail"]?.itemInfo?.itemStruct ??
        scope["seo.abtest"]?.canonical; // fallback key TikTok sometimes uses

      // Also try the item list if video detail page was embedded differently
      const item = videoDetail ?? scope["webapp.video-detail"]?.itemInfo;
      if (!item) continue;

      const post = tiktokItemToPost(item, id);
      if (post) results.push(post);
    } catch {
      // Individual video may be deleted/private — skip it
    }
  }
  return results;
}

// --- Keyword / hashtag search -----------------------------------------------

export async function searchTikTok(query: string, opts: { max?: number } = {}): Promise<string[]> {
  // For hashtag searches (#mm2), scrape the hashtag challenge page
  const tag = query.replace(/^#/, "");
  const data = await parsePageData(`https://www.tiktok.com/tag/${encodeURIComponent(tag)}`);
  await log("scrape/tag/{hashtag}");

  const scope = data["__DEFAULT_SCOPE__"] ?? {};
  // TikTok embeds the first page of challenge videos in the page data
  const items: any[] =
    scope["webapp.challenge-detail"]?.itemList ??
    scope["seo.abtest"]?.itemList ??
    [];

  return items
    .slice(0, opts.max ?? 20)
    .map((item: any) => String(item.id))
    .filter(Boolean);
}
