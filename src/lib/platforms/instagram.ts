/**
 * Instagram — scrapes Instagram's internal mobile API.
 *
 * Request flow:
 *  1. Try direct request to i.instagram.com (works locally and on some IPs)
 *  2. On 401/403/429, retry through ScraperAPI residential proxy (if key set)
 *
 * ScraperAPI setup (free, 1000 req/month, no credit card):
 *  1. https://www.scraperapi.com → Sign up
 *  2. Copy API key from dashboard
 *  3. Add SCRAPER_API_KEY to Vercel environment variables → Redeploy
 */
import { prisma } from "@/lib/prisma";
import type { ResolvedCreator, PostStub, ResolvedPost } from "@/lib/types";

const IG_BASE = "https://i.instagram.com/api/v1";
const IG_HEADERS: Record<string, string> = {
  "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1",
  Accept: "*/*",
  "Accept-Language": "en-US,en;q=0.9",
  "x-ig-app-id": "936619743392459",
  Referer: "https://www.instagram.com/",
  Origin: "https://www.instagram.com",
};

async function log(endpoint: string) {
  try { await prisma.apiUsageLog.create({ data: { platform: "INSTAGRAM", endpoint, units: 1 } }); } catch {}
}

async function igGet(path: string, params?: Record<string, string>): Promise<any> {
  const buildUrl = (base: string) => {
    const url = new URL(`${base}${path}`);
    if (params) for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    return url.toString();
  };

  // Attempt 1: direct request
  try {
    const res = await fetch(buildUrl(IG_BASE), { headers: IG_HEADERS });
    if (res.ok) return res.json();
    if (res.status === 404) throw new Error("Instagram account not found.");
    if (res.status !== 401 && res.status !== 403 && res.status !== 429) {
      throw new Error(`Instagram API error ${res.status}.`);
    }
  } catch (err: any) {
    if (err.message.includes("not found")) throw err;
  }

  // Attempt 2: ScraperAPI residential proxy fallback
  const scraperKey = process.env.SCRAPER_API_KEY;
  if (!scraperKey) {
    throw new Error(
      "Instagram request was blocked (Vercel datacenter IP). " +
      "Add SCRAPER_API_KEY to your Vercel env vars to enable proxy routing. " +
      "Get a free key at https://www.scraperapi.com (1000 req/month, no credit card)."
    );
  }
  const proxyUrl = new URL("https://api.scraperapi.com/");
  proxyUrl.searchParams.set("api_key", scraperKey);
  proxyUrl.searchParams.set("url", buildUrl(IG_BASE));
  proxyUrl.searchParams.set("keep_headers", "true");

  const res = await fetch(proxyUrl.toString(), { headers: IG_HEADERS });
  if (res.status === 404) throw new Error("Instagram account not found.");
  if (!res.ok) throw new Error(`Instagram via ScraperAPI failed (${res.status}). Check key and quota.`);
  return res.json();
}

function parseUsername(input: string): string {
  const t = input.trim();
  try {
    const url = new URL(t.startsWith("http") ? t : t.includes("instagram.com") ? `https://${t}` : "");
    return url.pathname.split("/").filter(Boolean)[0]?.replace(/^@/, "") ?? t.replace(/^@/, "");
  } catch {}
  return t.replace(/^@/, "");
}

export async function resolveInstagramCreator(input: string): Promise<ResolvedCreator> {
  const username = parseUsername(input);
  const data = await igGet("/users/web_profile_info/", { username });
  await log("web_profile_info");
  const u = data?.data?.user;
  if (!u) throw new Error(`@${username} not found on Instagram. Make sure the handle is correct and the account is public.`);
  return {
    platform: "INSTAGRAM",
    platformId: u.id,
    username: `@${u.username}`,
    displayName: u.full_name || u.username,
    profileUrl: `https://www.instagram.com/${u.username}/`,
    avatarUrl: u.profile_pic_url_hd ?? u.profile_pic_url ?? null,
    bio: u.biography ?? null,
    followerCount: u.edge_followed_by?.count != null ? BigInt(u.edge_followed_by.count) : null,
    platformMeta: { username: u.username, userId: u.id },
  };
}

export async function fetchInstagramRecentPosts(userId: string, max = 20): Promise<PostStub[]> {
  const data = await igGet(`/feed/user/${userId}/`, { count: String(Math.min(max, 20)) });
  await log("feed/user");
  return (data?.items ?? []).map((m: any): PostStub => ({
    platformId: String(m.pk ?? m.id),
    publishedAt: new Date((m.taken_at ?? 0) * 1000).toISOString(),
  }));
}

export async function fetchInstagramRecentPostsByUsername(username: string, max = 20): Promise<PostStub[]> {
  const data = await igGet("/users/web_profile_info/", { username });
  await log("web_profile_info");
  const edges = data?.data?.user?.edge_owner_to_timeline_media?.edges ?? [];
  return edges.slice(0, max).map((e: any): PostStub => ({
    platformId: e.node?.id ?? e.node?.shortcode,
    publishedAt: new Date((e.node?.taken_at_timestamp ?? 0) * 1000).toISOString(),
  }));
}

export async function fetchInstagramPostDetails(mediaIds: string[]): Promise<ResolvedPost[]> {
  const results: ResolvedPost[] = [];
  for (const id of mediaIds) {
    try {
      const data = await igGet(`/media/${id}/info/`);
      await log("media/info");
      const m = data?.items?.[0];
      if (!m) continue;
      const isVideo = m.media_type === 2;
      const isCarousel = m.media_type === 8;
      results.push({
        platform: "INSTAGRAM",
        platformId: String(m.pk ?? m.id),
        title: (m.caption?.text ?? "").slice(0, 200) || null,
        description: (m.caption?.text ?? "").slice(0, 300) || null,
        publishedAt: new Date((m.taken_at ?? 0) * 1000).toISOString(),
        thumbnailUrl: m.thumbnail_url ?? m.image_versions2?.candidates?.[0]?.url ?? null,
        durationSeconds: Math.round(m.video_duration ?? 0),
        isShort: isVideo && (m.video_duration ?? 0) <= 90,
        url: `https://www.instagram.com/p/${m.code ?? m.shortcode}/`,
        mediaType: isCarousel ? "CAROUSEL" : isVideo ? "VIDEO" : "IMAGE",
        viewCount: BigInt(m.view_count ?? m.play_count ?? 0),
        likeCount: BigInt(m.like_count ?? 0),
        commentCount: BigInt(m.comment_count ?? 0),
        shareCount: BigInt(0),
        saveCount: BigInt(0),
      });
    } catch {}
  }
  return results;
}

export async function searchInstagram(hashtag: string, opts: { max?: number } = {}): Promise<string[]> {
  const tag = hashtag.replace(/^#/, "");
  try {
    const data = await igGet(`/tags/${encodeURIComponent(tag)}/sections/`, { count: String(Math.min(opts.max ?? 20, 20)), tab: "recent" });
    await log("tags/sections");
    const ids: string[] = [];
    for (const section of data?.sections ?? []) {
      for (const item of section?.layout_content?.medias ?? []) {
        if (item?.media?.pk) ids.push(String(item.media.pk));
      }
    }
    return ids.slice(0, opts.max ?? 20);
  } catch { return []; }
}
