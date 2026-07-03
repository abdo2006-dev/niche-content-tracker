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

async function log(endpoint: string) {
  try {
    await prisma.apiUsageLog.create({
      data: { platform: "INSTAGRAM", endpoint, units: 1 },
    });
  } catch {}
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

export async function fetchInstagramRecentPosts(userId: string, max = 20): Promise<PostStub[]> {
  // First try the feed endpoint (gives more posts + cleaner data)
  try {
    const data = await igGet(`/feed/user/${userId}/`, { count: String(Math.min(max, 20)) });
    await log("feed/user/{id}");
    const items: any[] = data?.items ?? [];
    return items.map((m: any): PostStub => ({
      platformId: m.pk ?? m.id,
      publishedAt: new Date((m.taken_at ?? 0) * 1000).toISOString(),
    }));
  } catch {
    // Fall back to the profile info endpoint which includes last 12 posts in edge_owner_to_timeline_media
    const username = userId; // This fallback needs username not ID — handled in sync.ts
    throw new Error(`Could not fetch Instagram posts for user ${userId}`);
  }
}

/** Called by sync.ts which resolves username from platformMeta when needed. */
export async function fetchInstagramRecentPostsByUsername(username: string, max = 20): Promise<PostStub[]> {
  const data = await igGet(`/users/web_profile_info/`, { username });
  await log("web_profile_info");

  const edges =
    data?.data?.user?.edge_owner_to_timeline_media?.edges ?? [];

  return edges.slice(0, max).map((e: any): PostStub => ({
    platformId: e.node?.id ?? e.node?.shortcode,
    publishedAt: new Date((e.node?.taken_at_timestamp ?? 0) * 1000).toISOString(),
  }));
}

// --- Post details -----------------------------------------------------------

export async function fetchInstagramPostDetails(mediaIds: string[]): Promise<ResolvedPost[]> {
  const results: ResolvedPost[] = [];

  for (const id of mediaIds) {
    try {
      const data = await igGet(`/media/${id}/info/`);
      await log("media/{id}/info");
      const m = data?.items?.[0];
      if (!m) continue;

      const isVideo = m.media_type === 2; // 1=photo, 2=video, 8=carousel
      const isCarousel = m.media_type === 8;

      results.push({
        platform: "INSTAGRAM",
        platformId: String(m.pk ?? m.id),
        title: (m.caption?.text ?? "").slice(0, 200) || null,
        description: (m.caption?.text ?? "").slice(0, 300) || null,
        publishedAt: new Date((m.taken_at ?? 0) * 1000).toISOString(),
        thumbnailUrl:
          m.thumbnail_url ??
          m.image_versions2?.candidates?.[0]?.url ??
          m.carousel_media?.[0]?.image_versions2?.candidates?.[0]?.url ??
          null,
        durationSeconds: Math.round(m.video_duration ?? 0),
        isShort: isVideo && (m.video_duration ?? 0) <= 90, // Reels are ≤90s
        url: `https://www.instagram.com/p/${m.code ?? m.shortcode}/`,
        mediaType: isCarousel ? "CAROUSEL" : isVideo ? "VIDEO" : "IMAGE",
        viewCount: BigInt(m.view_count ?? m.play_count ?? 0),
        likeCount: BigInt(m.like_count ?? 0),
        commentCount: BigInt(m.comment_count ?? 0),
        shareCount: BigInt(0), // Instagram doesn't expose share counts publicly
        saveCount: BigInt(0),
      });
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
