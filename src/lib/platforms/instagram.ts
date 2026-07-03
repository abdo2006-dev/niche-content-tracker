/**
 * Instagram scraper — no API key, no Facebook app, no business account needed.
 *
 * How it works:
 *  1. GET https://i.instagram.com/api/v1/users/web_profile_info/?username={username}
 *     This is Instagram's internal mobile API endpoint. It's the same endpoint
 *     the instagram.com website calls when you visit a profile page.
 *     Returns: user info + their last ~12 posts with stats, no login required
 *     for public accounts.
 *
 *  2. GET https://i.instagram.com/api/v1/feed/user/{userId}/?count=20
 *     Gets more posts for a known user ID (from step 1).
 *
 *  3. Hashtag search: GET https://i.instagram.com/api/v1/tags/{hashtag}/sections/
 *     Returns recent posts for a hashtag.
 *
 * Limitations:
 *  - Only works for PUBLIC accounts. Private accounts return nothing.
 *  - View counts for photos are not exposed (only Reels/Videos have views).
 *    Likes + comments are available for all post types.
 *  - Instagram may add rate limiting if you sync too many accounts too quickly.
 *    The default 6h cron interval keeps usage well below any practical limit.
 *  - If Instagram changes their internal API, update the headers or endpoints below.
 */
import { prisma } from "@/lib/prisma";
import type { ResolvedCreator, PostStub, ResolvedPost } from "@/lib/types";

// Instagram's internal API requires these headers to return data.
// x-ig-app-id is Instagram's public web app ID (not a secret — it's the same
// for everyone and visible in any browser's network requests to instagram.com).
const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1",
  Accept: "*/*",
  "Accept-Language": "en-US,en;q=0.9",
  "x-ig-app-id": "936619743392459",
  Referer: "https://www.instagram.com/",
  Origin: "https://www.instagram.com",
};

const BASE = "https://i.instagram.com/api/v1";
const RECENT_LOOKBACK_DAYS = 14;
const MAX_INSTAGRAM_PAGES = 6;
const instagramItemCache = new Map<string, any>();

async function log(endpoint: string) {
  try {
    await prisma.apiUsageLog.create({
      data: { platform: "INSTAGRAM", endpoint, units: 1 },
    });
  } catch {}
}

function cutoffDate(days = RECENT_LOOKBACK_DAYS) {
  return new Date(Date.now() - days * 86_400_000);
}

async function igGet(path: string, params?: Record<string, string>): Promise<any> {
  const url = new URL(`${BASE}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  }
  const res = await fetch(url.toString(), { headers: HEADERS });

  if (res.status === 404) throw new Error(`Instagram account not found.`);
  if (res.status === 429) throw new Error(`Instagram rate limit hit. Try again in a few minutes.`);
  if (!res.ok) {
    throw new Error(
      `Instagram API returned ${res.status}. The account may be private or temporarily unavailable.`
    );
  }
  return res.json();
}

function parseUsername(input: string): string {
  const t = input.trim();
  try {
    const url = new URL(
      t.startsWith("http") ? t : t.includes("instagram.com") ? `https://${t}` : ""
    );
    return url.pathname.split("/").filter(Boolean)[0]?.replace(/^@/, "") ?? t.replace(/^@/, "");
  } catch {}
  return t.replace(/^@/, "");
}

// Maps Instagram media_type to our MediaType enum
function mediaType(igType: string): "VIDEO" | "IMAGE" | "CAROUSEL" {
  if (igType === "CAROUSEL_ALBUM") return "CAROUSEL";
  if (igType === "VIDEO") return "VIDEO";
  return "IMAGE";
}

function instagramItemId(item: any): string | null {
  const id = item?.pk ?? item?.id;
  return id ? String(id) : null;
}

function instagramItemToStub(item: any): PostStub | null {
  const id = instagramItemId(item);
  if (!id || !item?.taken_at) return null;
  return {
    platformId: id,
    publishedAt: new Date(Number(item.taken_at) * 1000).toISOString(),
    raw: item,
  };
}

function profileEdgeToStub(edge: any): PostStub | null {
  const node = edge?.node;
  const id = node?.id ?? node?.shortcode;
  if (!id || !node?.taken_at_timestamp) return null;
  return {
    platformId: String(id),
    publishedAt: new Date(Number(node.taken_at_timestamp) * 1000).toISOString(),
    raw: node,
  };
}

function instagramItemToPost(item: any, fallbackId: string): ResolvedPost | null {
  if (!item) return null;
  const id = String(item.pk ?? item.id ?? fallbackId);
  const isVideo = item.media_type === 2 || item.media_type === "VIDEO";
  const isCarousel = item.media_type === 8 || item.media_type === "CAROUSEL_ALBUM";
  const shortcode = item.code ?? item.shortcode ?? item.short_code;
  const caption = item.caption?.text ?? item.edge_media_to_caption?.edges?.[0]?.node?.text ?? "";

  return {
    platform: "INSTAGRAM",
    platformId: id,
    title: caption.slice(0, 200) || null,
    description: caption.slice(0, 300) || null,
    publishedAt: new Date(Number(item.taken_at ?? item.taken_at_timestamp ?? 0) * 1000).toISOString(),
    thumbnailUrl:
      item.thumbnail_url ??
      item.display_url ??
      item.image_versions2?.candidates?.[0]?.url ??
      item.carousel_media?.[0]?.image_versions2?.candidates?.[0]?.url ??
      null,
    durationSeconds: Math.round(item.video_duration ?? 0),
    isShort: isVideo && (item.video_duration ?? 0) <= 90,
    url: `https://www.instagram.com/p/${shortcode ?? id}/`,
    mediaType: isCarousel ? "CAROUSEL" : isVideo ? "VIDEO" : "IMAGE",
    viewCount: BigInt(item.view_count ?? item.play_count ?? item.video_view_count ?? 0),
    likeCount: BigInt(item.like_count ?? item.edge_liked_by?.count ?? 0),
    commentCount: BigInt(item.comment_count ?? item.edge_media_to_comment?.count ?? 0),
    shareCount: BigInt(0),
    saveCount: BigInt(0),
  };
}

// --- Creator resolution -----------------------------------------------------

export async function resolveInstagramCreator(input: string): Promise<ResolvedCreator> {
  const username = parseUsername(input);

  const data = await igGet(`/users/web_profile_info/`, { username });
  await log("web_profile_info");

  const u = data?.data?.user;
  if (!u) {
    throw new Error(
      `@${username} not found on Instagram. Check the handle and make sure the account is public.`
    );
  }

  return {
    platform: "INSTAGRAM",
    platformId: u.id,
    username: `@${u.username}`,
    displayName: u.full_name ?? u.username,
    profileUrl: `https://www.instagram.com/${u.username}`,
    avatarUrl: u.profile_pic_url_hd ?? u.profile_pic_url ?? null,
    bio: u.biography ?? null,
    followerCount: u.edge_followed_by?.count != null ? BigInt(u.edge_followed_by.count) : null,
    platformMeta: { username: u.username, userId: u.id },
  };
}

// --- Recent posts -----------------------------------------------------------

export async function fetchInstagramRecentPosts(userId: string, max = 120): Promise<PostStub[]> {
  // First try the feed endpoint (gives more posts + cleaner data)
  try {
    const cutoff = cutoffDate();
    const results: PostStub[] = [];
    let maxId: string | undefined;

    for (let page = 0; page < MAX_INSTAGRAM_PAGES && results.length < max; page++) {
      const data = await igGet(`/feed/user/${userId}/`, {
        count: String(Math.min(max - results.length, 50)),
        ...(maxId ? { max_id: maxId } : {}),
      });
      await log("feed/user/{id}");
      const items: any[] = data?.items ?? [];
      if (!items.length) break;

      let reachedOlderPosts = false;
      for (const item of items) {
        const stub = instagramItemToStub(item);
        if (!stub) continue;
        instagramItemCache.set(stub.platformId, item);
        if (new Date(stub.publishedAt) < cutoff) {
          reachedOlderPosts = true;
          continue;
        }
        results.push(stub);
        if (results.length >= max) break;
      }

      maxId = data?.next_max_id;
      if (reachedOlderPosts || !maxId) break;
    }

    return results.slice(0, max);
  } catch {
    // Fall back to the profile info endpoint which includes last 12 posts in edge_owner_to_timeline_media
    const username = userId; // This fallback needs username not ID — handled in sync.ts
    throw new Error(`Could not fetch Instagram posts for user ${userId}`);
  }
}

/** Called by sync.ts which resolves username from platformMeta when needed. */
export async function fetchInstagramRecentPostsByUsername(username: string, max = 120): Promise<PostStub[]> {
  const data = await igGet(`/users/web_profile_info/`, { username });
  await log("web_profile_info");

  const edges =
    data?.data?.user?.edge_owner_to_timeline_media?.edges ?? [];

  const cutoff = cutoffDate();
  return edges
    .map(profileEdgeToStub)
    .filter((stub: PostStub | null): stub is PostStub => Boolean(stub))
    .filter((stub: PostStub) => new Date(stub.publishedAt) >= cutoff)
    .slice(0, max);
}

// --- Post details -----------------------------------------------------------

export async function fetchInstagramPostDetails(mediaIds: string[]): Promise<ResolvedPost[]> {
  const results: ResolvedPost[] = [];

  for (const id of mediaIds) {
    try {
      const cached = instagramItemToPost(instagramItemCache.get(id), id);
      if (cached) {
        results.push(cached);
        continue;
      }

      const data = await igGet(`/media/${id}/info/`);
      await log("media/{id}/info");
      const m = data?.items?.[0];
      if (!m) continue;

      const post = instagramItemToPost(m, id);
      if (post) results.push(post);
    } catch {
      // Individual post may be deleted/private — skip
    }
  }
  return results;
}

// --- Hashtag search ---------------------------------------------------------

export async function searchInstagram(hashtag: string, opts: { max?: number } = {}): Promise<string[]> {
  const tag = hashtag.replace(/^#/, "");

  try {
    const data = await igGet(`/tags/${encodeURIComponent(tag)}/sections/`, {
      count: String(Math.min(opts.max ?? 20, 20)),
      tab: "recent",
    });
    await log("tags/{hashtag}/sections");

    const mediaIds: string[] = [];
    for (const section of data?.sections ?? []) {
      for (const item of section?.layout_content?.medias ?? []) {
        if (item?.media?.pk) mediaIds.push(String(item.media.pk));
      }
    }
    return mediaIds.slice(0, opts.max ?? 20);
  } catch {
    // Hashtag endpoint may require login for some tags — return empty
    return [];
  }
}
