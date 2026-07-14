/**
 * TikTok — powered by tikwm.com (free, no registration, no API key).
 *
 * WHY tikwm.com instead of direct scraping?
 * ─────────────────────────────────────────
 * Vercel runs on AWS datacenter IP ranges. TikTok maintains a blocklist of
 * these ranges — direct HTML scraping always returns empty data from Vercel,
 * which is exactly the "no post list available" error you were seeing.
 *
 * tikwm.com is a free third-party proxy API that routes TikTok requests through
 * residential IPs, bypassing the block. No registration or API key required.
 * Used by thousands of indie developers for personal/research projects.
 *
 * Endpoints:
 *   GET https://www.tikwm.com/api/user/info/?unique_id={username}  → profile
 *   GET https://www.tikwm.com/api/user/posts?unique_id={username}  → video list
 *   GET https://www.tikwm.com/api/?id={video_id}                   → single video stats
 *   GET https://www.tikwm.com/api/feed/search?keywords={keyword}   → search
 */
import { prisma } from "@/lib/prisma";
import type { ResolvedCreator, PostStub, ResolvedPost } from "@/lib/types";

const BASE = "https://www.tikwm.com/api";
const APIFY_TIKTOK_ACTOR = "clockworks/tiktok-scraper";
const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  Accept: "application/json",
  Referer: "https://www.tikwm.com/",
};

const RECENT_LOOKBACK_DAYS = 14;
let lastTikwmRequestAt = 0;

async function log(endpoint: string) {
  try { await prisma.apiUsageLog.create({ data: { platform: "TIKTOK", endpoint, units: 1 } }); } catch {}
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function tikwmRaw(path: string, params: Record<string, string>, attempt = 0): Promise<any> {
  const waitMs = 1_100 - (Date.now() - lastTikwmRequestAt);
  if (waitMs > 0) await sleep(waitMs);
  lastTikwmRequestAt = Date.now();

  const url = new URL(`${BASE}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString(), { headers: HEADERS });
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {}

  if (!res.ok) {
    const challenged = text.includes("cf-mitigated") || text.includes("challenge-platform");
    throw new Error(
      challenged
        ? `tikwm.com is blocked by Cloudflare for ${path} (HTTP ${res.status}).`
        : `tikwm.com request failed (HTTP ${res.status}). It may be temporarily down — try again shortly.`
    );
  }
  if (!json) throw new Error(`tikwm.com returned non-JSON for ${path}.`);

  if (json?.code === -1 && typeof json?.msg === "string" && json.msg.includes("1 request/second")) {
    if (attempt >= 1) throw new Error(`tikwm.com error: ${json.msg}`);
    await sleep(1_200);
    return tikwmRaw(path, params, attempt + 1);
  }

  if (json.code !== 0) throw new Error(`tikwm.com error: ${json.msg ?? JSON.stringify(json)}`);
  return json;
}

async function tikwm(path: string, params: Record<string, string>): Promise<any> {
  const json = await tikwmRaw(path, params);
  return json.data;
}

function parseUsername(input: string): string {
  const t = input.trim();
  try {
    const url = new URL(t.startsWith("http") ? t : t.includes("tiktok.com") ? `https://${t}` : "");
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts[0]?.startsWith("@")) return parts[0].slice(1);
  } catch {}
  return t.replace(/^@/, "");
}

function cutoffDate(days = RECENT_LOOKBACK_DAYS) {
  return new Date(Date.now() - days * 86_400_000);
}

function tikwmVideos(raw: any): any[] {
  return Array.isArray(raw?.data?.videos) ? raw.data.videos : [];
}

function countBigInt(value: unknown, fallback: unknown = 0) {
  const count = Number(value ?? fallback ?? 0);
  return BigInt(Number.isFinite(count) ? Math.trunc(count) : 0);
}

function tikwmVideoToPost(v: any, username: string): ResolvedPost {
  const authorHandle = v.author?.unique_id ?? v.author?.uniqueId ?? username;
  const title = (v.title ?? v.desc ?? "").slice(0, 300);
  return {
    platform: "TIKTOK",
    platformId: String(v.video_id ?? v.id),
    title: title.slice(0, 200) || null,
    description: title || null,
    publishedAt: new Date((v.create_time ?? 0) * 1000).toISOString(),
    thumbnailUrl: v.cover ?? v.ai_dynamic_cover ?? v.origin_cover ?? null,
    durationSeconds: Number(v.duration ?? 0),
    isShort: true,
    url: `https://www.tiktok.com/@${authorHandle}/video/${v.video_id ?? v.id}`,
    mediaType: "VIDEO",
    viewCount: countBigInt(v.play_count),
    likeCount: countBigInt(v.digg_count, v.like_count),
    commentCount: countBigInt(v.comment_count),
    shareCount: countBigInt(v.share_count),
    saveCount: countBigInt(v.collect_count),
    platformMeta: {
      musicTitle: v.music_info?.title ?? null,
      region: v.region ?? null,
      isAd: v.is_ad ?? null,
    },
  };
}

export async function fetchTikwmUserPostsRaw(username: string, count = 5, cursor = "0") {
  return tikwmRaw("/user/posts", {
    unique_id: parseUsername(username),
    count: String(Math.min(Math.max(count, 1), 35)),
    cursor,
  });
}

export function parseTikwmPosts(raw: any, max = 35): PostStub[] {
  const cutoff = cutoffDate();
  return tikwmVideos(raw)
    .map((v: any): PostStub => ({
      platformId: String(v.video_id ?? v.id),
      publishedAt: new Date((v.create_time ?? 0) * 1000).toISOString(),
      raw: v,
    }))
    .filter((stub: PostStub) => stub.platformId && new Date(stub.publishedAt) >= cutoff)
    .slice(0, max);
}

export function parseTikwmPostsWithDetails(raw: any, username: string, max = 35): ResolvedPost[] {
  const validIds = new Set(parseTikwmPosts(raw, max).map(stub => stub.platformId));
  return tikwmVideos(raw)
    .filter((v: any) => validIds.has(String(v.video_id ?? v.id)))
    .slice(0, max)
    .map((v: any) => tikwmVideoToPost(v, parseUsername(username)));
}

function apifyItemToPost(item: any, username: string): ResolvedPost | null {
  const id = item.id ?? item.videoId ?? item.videoMeta?.id;
  if (!id) return null;
  const authorHandle = item.authorMeta?.name ?? username;
  const title = String(item.text ?? item.description ?? "").slice(0, 300);
  const publishedAt =
    item.createTimeISO ??
    (item.createTime ? new Date(Number(item.createTime) * 1000).toISOString() : new Date().toISOString());

  return {
    platform: "TIKTOK",
    platformId: String(id),
    title: title.slice(0, 200) || null,
    description: title || null,
    publishedAt,
    thumbnailUrl:
      item.videoMeta?.coverUrl ??
      item.videoMeta?.originalCoverUrl ??
      item.covers?.default ??
      item.covers?.origin ??
      null,
    durationSeconds: Number(item.videoMeta?.duration ?? item.duration ?? 0),
    isShort: true,
    url: item.webVideoUrl ?? `https://www.tiktok.com/@${authorHandle}/video/${id}`,
    mediaType: "VIDEO",
    viewCount: countBigInt(item.playCount),
    likeCount: countBigInt(item.diggCount),
    commentCount: countBigInt(item.commentCount),
    shareCount: countBigInt(item.shareCount),
    saveCount: countBigInt(item.collectCount),
    platformMeta: {
      musicTitle: item.musicMeta?.musicName ?? null,
      region: item.locationCreated ?? null,
      isAd: item.isAd ?? null,
      provider: "apify",
    },
  };
}

async function fetchApifyTikTokPostsWithDetails(username: string, max = 35): Promise<ResolvedPost[]> {
  const token = process.env.APIFY_TOKEN;
  if (!token) {
    throw new Error(
      "TikTok post sync is blocked: tikwm.com is Cloudflare-challenging video-list requests, and APIFY_TOKEN is not configured."
    );
  }

  const actorId = process.env.APIFY_TIKTOK_ACTOR ?? APIFY_TIKTOK_ACTOR;
  const actorPath = actorId.replace("/", "~");
  const url = new URL(`https://api.apify.com/v2/acts/${actorPath}/run-sync-get-dataset-items`);
  url.searchParams.set("token", token);
  url.searchParams.set("memory", "1024");
  url.searchParams.set("timeout", "120");
  url.searchParams.set("clean", "true");

  const profileUrl = `https://www.tiktok.com/@${parseUsername(username)}`;
  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      excludePinnedPosts: false,
      profiles: [profileUrl],
      proxyCountryCode: "None",
      resultsPerPage: Math.min(Math.max(max, 1), 35),
      scrapeRelatedVideos: false,
      shouldDownloadAvatars: false,
      shouldDownloadCovers: false,
      shouldDownloadMusicCovers: false,
      shouldDownloadSlideshowImages: false,
      shouldDownloadSubtitles: false,
      shouldDownloadVideos: false,
      profileScrapeSections: ["videos"],
      profileSorting: "latest",
      maxProfilesPerQuery: 1,
    }),
  });
  await log("apify/tiktok-scraper");

  const text = await res.text();
  let json: any;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`Apify TikTok fallback returned non-JSON response (${res.status}).`);
  }

  if (!res.ok) {
    const message = json?.error?.message ?? json?.message ?? text.slice(0, 200);
    throw new Error(`Apify TikTok fallback failed (${res.status}): ${message}`);
  }

  const items = Array.isArray(json) ? json : [];
  return items
    .map((item) => apifyItemToPost(item, username))
    .filter((post): post is ResolvedPost => Boolean(post))
    .filter((post) => new Date(post.publishedAt) >= cutoffDate())
    .slice(0, max);
}

export async function resolveTikTokCreator(input: string): Promise<ResolvedCreator> {
  const username = parseUsername(input);
  const data = await tikwm("/user/info/", { unique_id: username });
  await log("user/info");
  const user = data?.user;
  const stats = data?.stats;
  if (!user) throw new Error(`TikTok user @${username} not found. Make sure the handle is correct and the account is public.`);
  return {
    platform: "TIKTOK",
    platformId: user.id ?? username,
    username: `@${user.uniqueId ?? username}`,
    displayName: user.nickname ?? user.uniqueId ?? username,
    profileUrl: `https://www.tiktok.com/@${user.uniqueId ?? username}`,
    avatarUrl: user.avatarLarger ?? user.avatarMedium ?? null,
    bio: user.signature ?? null,
    followerCount: stats?.followerCount != null ? BigInt(stats.followerCount) : null,
    platformMeta: { username: user.uniqueId ?? username, secUid: user.secUid ?? null },
  };
}

export async function fetchTikTokRecentPosts(username: string, max = 30): Promise<PostStub[]> {
  const raw = await fetchTikwmUserPostsRaw(username, max, "0");
  await log("user/posts");
  return parseTikwmPosts(raw, max);
}

export async function fetchTikTokPostDetails(videoIds: string[]): Promise<ResolvedPost[]> {
  if (!videoIds.length) return [];
  const results: ResolvedPost[] = [];
  for (const id of videoIds) {
    try {
      const v = await tikwm("/", { id });
      await log("video/info");
      if (!v) continue;
      const authorHandle = v.author?.unique_id ?? v.author?.uniqueId ?? "unknown";
      results.push({
        platform: "TIKTOK",
        platformId: String(v.id ?? id),
        title: (v.title ?? v.desc ?? "").slice(0, 200) || null,
        description: (v.title ?? v.desc ?? "").slice(0, 300) || null,
        publishedAt: new Date((v.create_time ?? 0) * 1000).toISOString(),
        thumbnailUrl: v.cover ?? v.origin_cover ?? null,
        durationSeconds: Number(v.duration ?? 0),
        isShort: true,
        url: `https://www.tiktok.com/@${authorHandle}/video/${v.id ?? id}`,
        mediaType: "VIDEO",
        viewCount: countBigInt(v.play_count),
        likeCount: countBigInt(v.digg_count, v.like_count),
        commentCount: countBigInt(v.comment_count),
        shareCount: countBigInt(v.share_count),
        saveCount: countBigInt(v.collect_count),
        platformMeta: {},
      });
      // Small pause — polite to the free service
      if (videoIds.length > 1) await new Promise(r => setTimeout(r, 300));
    } catch (err: any) {
      console.warn(`fetchTikTokPostDetails: skipping ${id}: ${err.message}`);
    }
  }
  return results;
}

export async function searchTikTok(query: string, opts: { max?: number } = {}): Promise<string[]> {
  const keyword = query.replace(/^#/, "");
  try {
    const data = await tikwm("/feed/search", {
      keywords: keyword,
      count: String(Math.min(opts.max ?? 20, 20)),
      cursor: "0",
    });
    await log("feed/search");
    return (data?.videos ?? []).map((v: any) => String(v.video_id ?? v.id)).filter(Boolean);
  } catch (err: any) {
    console.warn(`TikTok keyword search for "${keyword}" failed: ${err.message}`);
    return [];
  }
}

// ─── Single-pass full sync (used by syncCreatorPosts) ─────────────────────
/**
 * Returns full ResolvedPost[] directly from /user/posts — the response already
 * contains all stats (play count, likes, comments, shares, thumbnails) so we
 * avoid a second per-video API call that would hit rate limits.
 */
export async function fetchTikTokPostsWithDetails(username: string, max = 35): Promise<ResolvedPost[]> {
  try {
    const raw = await fetchTikwmUserPostsRaw(username, max, "0");
    await log("user/posts");
    return parseTikwmPostsWithDetails(raw, username, max);
  } catch (err: any) {
    const message = String(err?.message ?? err);
    const canFallback =
      message.includes("Cloudflare") ||
      message.includes("HTTP 403") ||
      message.includes("non-JSON");
    if (!canFallback) throw err;
    return fetchApifyTikTokPostsWithDetails(username, max);
  }
}
