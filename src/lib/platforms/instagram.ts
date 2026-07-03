/**
 * Instagram Graph API wrapper.
 *
 * Setup (two options — pick one):
 *
 * OPTION A — Track your own account's posts (easiest):
 *  1. Create a Facebook App at https://developers.facebook.com
 *  2. Add the "Instagram Basic Display" product
 *  3. Generate a long-lived User Access Token for your Instagram account
 *  4. Set INSTAGRAM_ACCESS_TOKEN in your env vars
 *  5. This lets you sync posts from YOUR OWN account only.
 *
 * OPTION B — Track any public account (requires Business verification):
 *  1. Create a Facebook App and add "Instagram Graph API"
 *  2. Your Instagram account must be a Professional account
 *  3. Connect it as a Business page
 *  4. Use the Instagram Graph API's Business Discovery endpoint to look up
 *     other PUBLIC professional accounts by username.
 *  5. Set INSTAGRAM_ACCESS_TOKEN and INSTAGRAM_BUSINESS_ACCOUNT_ID in env vars
 *
 * NOTE: Instagram's API is intentionally restrictive. Tracking competitor accounts
 * that haven't authorized your app is only possible via Business Discovery (Option B),
 * and only for other PUBLIC professional accounts.
 *
 * IMPORTANT: Long-lived tokens expire after 60 days. Refresh them before they expire
 * using the /refresh_access_token endpoint. The /settings page shows token status.
 *
 * Endpoints used:
 *  - GET /me/media                                    → own recent posts
 *  - GET /{ig-user-id}?fields=business_discovery...  → competitor lookup (Business Discovery)
 *  - GET /{media-id}?fields=...                       → post details
 */
import { prisma } from "@/lib/prisma";
import type { ResolvedCreator, PostStub, ResolvedPost } from "@/lib/types";

const BASE = "https://graph.instagram.com/v21.0";
const FB_BASE = "https://graph.facebook.com/v21.0";

async function log(endpoint: string) {
  try { await prisma.apiUsageLog.create({ data: { platform: "INSTAGRAM", endpoint, units: 1 } }); } catch {}
}

function token() {
  const t = process.env.INSTAGRAM_ACCESS_TOKEN;
  if (!t) throw new Error("INSTAGRAM_ACCESS_TOKEN is not configured. See src/lib/platforms/instagram.ts for setup instructions.");
  return t;
}

function businessAccountId() {
  return process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID ?? null;
}

async function igGet(path: string, params: Record<string, string> = {}) {
  const url = new URL(`${BASE}${path}`);
  url.searchParams.set("access_token", token());
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Instagram API ${path} (${res.status}): ${await res.text()}`);
  return res.json();
}

async function fbGet(path: string, params: Record<string, string> = {}) {
  const url = new URL(`${FB_BASE}${path}`);
  url.searchParams.set("access_token", token());
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Facebook/Instagram API ${path} (${res.status}): ${await res.text()}`);
  return res.json();
}

// ─── Creator resolution ───────────────────────────────────────────────────────

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
  const bizId = businessAccountId();

  // Option B: Business Discovery — can look up any public professional account.
  if (bizId) {
    const data = await fbGet(`/${bizId}`, {
      fields: `business_discovery.fields(id,username,name,biography,followers_count,profile_picture_url,website)@{username:"${username}"}`,
    });
    await log("business_discovery");
    const u = data.business_discovery;
    if (u) {
      return {
        platform: "INSTAGRAM",
        platformId: u.id,
        username: `@${u.username}`,
        displayName: u.name ?? u.username,
        profileUrl: `https://www.instagram.com/${u.username}`,
        avatarUrl: u.profile_picture_url ?? null,
        bio: u.biography ?? null,
        followerCount: u.followers_count != null ? BigInt(u.followers_count) : null,
        platformMeta: { username: u.username, businessAccountId: bizId },
      };
    }
  }

  // Option A: /me — only works for the account that generated the token.
  const meUsername = username.toLowerCase();
  const me = await igGet("/me", { fields: "id,username,name,biography,followers_count,profile_picture_url" });
  await log("me");
  if (me.username?.toLowerCase() !== meUsername) {
    throw new Error(
      `Instagram Business Discovery is not configured (INSTAGRAM_BUSINESS_ACCOUNT_ID missing). ` +
      `You can only add your own account (@${me.username}) without it. ` +
      `See src/lib/platforms/instagram.ts for Business Discovery setup.`
    );
  }
  return {
    platform: "INSTAGRAM",
    platformId: me.id,
    username: `@${me.username}`,
    displayName: me.name ?? me.username,
    profileUrl: `https://www.instagram.com/${me.username}`,
    avatarUrl: me.profile_picture_url ?? null,
    bio: me.biography ?? null,
    followerCount: me.followers_count != null ? BigInt(me.followers_count) : null,
    platformMeta: { username: me.username },
  };
}

// ─── Recent posts ─────────────────────────────────────────────────────────────

export async function fetchInstagramRecentPosts(igUserId: string, max = 25): Promise<PostStub[]> {
  const data = await igGet(`/${igUserId}/media`, {
    fields: "id,timestamp",
    limit: String(Math.min(max, 100)),
  });
  await log("media");
  return (data.data ?? []).map((m: any): PostStub => ({
    platformId: m.id,
    publishedAt: m.timestamp,
  }));
}

// ─── Post details ─────────────────────────────────────────────────────────────

const MEDIA_FIELDS = "id,caption,media_type,media_url,thumbnail_url,timestamp,permalink,like_count,comments_count";

export async function fetchInstagramPostDetails(mediaIds: string[]): Promise<ResolvedPost[]> {
  const results: ResolvedPost[] = [];
  for (const id of mediaIds) {
    try {
      const m = await igGet(`/${id}`, { fields: MEDIA_FIELDS });
      await log("media/{id}");
      const isVideo = m.media_type === "VIDEO" || m.media_type === "REELS";
      results.push({
        platform: "INSTAGRAM",
        platformId: m.id,
        title: (m.caption ?? "").slice(0, 200) || null,
        description: (m.caption ?? "").slice(0, 300) || null,
        publishedAt: m.timestamp,
        thumbnailUrl: m.thumbnail_url ?? m.media_url ?? null,
        durationSeconds: 0, // IG API doesn't expose duration on basic/display endpoints
        isShort: isVideo, // Reels are short-form
        url: m.permalink,
        mediaType: m.media_type === "CAROUSEL_ALBUM" ? "CAROUSEL" : isVideo ? "VIDEO" : "IMAGE",
        viewCount: BigInt(0), // Impressions/reach require Insights API (business accounts only)
        likeCount: BigInt(m.like_count ?? 0),
        commentCount: BigInt(m.comments_count ?? 0),
        shareCount: BigInt(0),
        saveCount: BigInt(0),
      });
    } catch {
      // Individual post may be deleted/private — skip it
    }
  }
  return results;
}

// ─── Hashtag search (Business accounts only) ──────────────────────────────────

export async function searchInstagram(hashtag: string, opts: { max?: number } = {}): Promise<string[]> {
  const bizId = businessAccountId();
  if (!bizId) throw new Error("INSTAGRAM_BUSINESS_ACCOUNT_ID is required for Instagram hashtag search.");

  const tag = hashtag.replace(/^#/, "");
  // Step 1: get hashtag ID
  const tagData = await fbGet(`/ig_hashtag_search`, {
    user_id: bizId,
    q: tag,
  });
  await log("ig_hashtag_search");
  const tagId = tagData.data?.[0]?.id;
  if (!tagId) throw new Error(`Instagram hashtag "#${tag}" not found.`);

  // Step 2: get recent media for that hashtag
  const mediaData = await fbGet(`/${tagId}/recent_media`, {
    user_id: bizId,
    fields: "id",
    limit: String(Math.min(opts.max ?? 20, 50)),
  });
  await log("hashtag/recent_media");
  return (mediaData.data ?? []).map((m: any) => m.id as string);
}
