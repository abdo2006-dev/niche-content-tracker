/**
 * TikTok Research API wrapper.
 *
 * Setup:
 *  1. Apply for TikTok Research API access at https://developers.tiktok.com/products/research-api
 *  2. Once approved, create an app and get TIKTOK_CLIENT_KEY + TIKTOK_CLIENT_SECRET.
 *  3. The Research API gives access to PUBLIC video data for research purposes.
 *
 * Endpoints used:
 *  - POST /v2/oauth/token/                → get an app-level token (client_credentials)
 *  - POST /v2/research/video/query/       → search videos by keyword or username
 *  - POST /v2/research/user/info/         → get a user's public profile
 *
 * Rate limits: ~1000 requests/day on the Research API (varies by approval tier).
 * We log every call to ApiUsageLog (1 unit each) so you can monitor usage.
 *
 * NOTE: If you don't have Research API access yet, the app still works for
 * YouTube and Instagram — TikTok creators will show as "not configured" with
 * a clear error message.
 */
import { prisma } from "@/lib/prisma";
import type { ResolvedCreator, PostStub, ResolvedPost } from "@/lib/types";

const BASE = "https://open.tiktokapis.com";

// Token cache — app-level tokens last ~2h, cache in memory between requests.
let cachedToken: { value: string; expiresAt: number } | null = null;

async function log(endpoint: string) {
  try { await prisma.apiUsageLog.create({ data: { platform: "TIKTOK", endpoint, units: 1 } }); } catch {}
}

function creds() {
  const k = process.env.TIKTOK_CLIENT_KEY;
  const s = process.env.TIKTOK_CLIENT_SECRET;
  if (!k || !s) throw new Error("TIKTOK_CLIENT_KEY and TIKTOK_CLIENT_SECRET are not configured. See src/lib/platforms/tiktok.ts for setup instructions.");
  return { clientKey: k, clientSecret: s };
}

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;
  const { clientKey, clientSecret } = creds();
  const res = await fetch(`${BASE}/v2/oauth/token/`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_key: clientKey,
      client_secret: clientSecret,
      grant_type: "client_credentials",
    }),
  });
  if (!res.ok) throw new Error(`TikTok OAuth failed (${res.status}): ${await res.text()}`);
  const data = await res.json();
  cachedToken = { value: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return cachedToken.value;
}

async function post(path: string, body: unknown) {
  const token = await getAccessToken();
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`TikTok API ${path} (${res.status}): ${await res.text()}`);
  return res.json();
}

// ─── Creator resolution ───────────────────────────────────────────────────────

function parseUsername(input: string): string {
  // Accept: @username, username, https://tiktok.com/@username, tiktok.com/@username
  const t = input.trim();
  try {
    const url = new URL(t.startsWith("http") ? t : t.includes("tiktok.com") ? `https://${t}` : "");
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts[0]?.startsWith("@")) return parts[0].replace(/^@/, "");
  } catch {}
  return t.replace(/^@/, "");
}

export async function resolveTikTokCreator(input: string): Promise<ResolvedCreator> {
  const username = parseUsername(input);
  // Research API: get user info by username
  const data = await post("/v2/research/user/info/", {
    username,
    fields: ["display_name", "bio_description", "avatar_url", "follower_count", "video_count"],
  });
  await log("research/user/info");

  const u = data.data?.user_info;
  if (!u) throw new Error(`TikTok user "@${username}" not found.`);

  return {
    platform: "TIKTOK",
    platformId: u.open_id ?? username, // open_id is the stable ID
    username: `@${username}`,
    displayName: u.display_name ?? username,
    profileUrl: `https://www.tiktok.com/@${username}`,
    avatarUrl: u.avatar_url ?? null,
    bio: u.bio_description ?? null,
    followerCount: u.follower_count != null ? BigInt(u.follower_count) : null,
    platformMeta: { username, secUid: u.secure_user_id ?? null },
  };
}

// ─── Recent posts ─────────────────────────────────────────────────────────────

export async function fetchTikTokRecentPosts(username: string, max = 20): Promise<PostStub[]> {
  // Research API: query videos by username
  const data = await post("/v2/research/video/query/", {
    query: { and: [{ operation: "EQ", field_name: "username", field_values: [username] }] },
    start_date: formatDate(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)),
    end_date: formatDate(new Date()),
    max_count: Math.min(max, 100),
    fields: ["id", "create_time"],
    sort_type: "0", // 0 = by time desc
  });
  await log("research/video/query");

  return (data.data?.videos ?? []).map((v: any): PostStub => ({
    platformId: String(v.id),
    publishedAt: new Date(v.create_time * 1000).toISOString(),
  }));
}

// ─── Video details ────────────────────────────────────────────────────────────

export async function fetchTikTokPostDetails(videoIds: string[]): Promise<ResolvedPost[]> {
  if (!videoIds.length) return [];
  const results: ResolvedPost[] = [];

  // Research API allows querying by video_id — fetch in batches of 20
  for (let i = 0; i < videoIds.length; i += 20) {
    const batch = videoIds.slice(i, i + 20);
    const data = await post("/v2/research/video/query/", {
      query: {
        and: [{ operation: "IN", field_name: "video_id", field_values: batch }],
      },
      start_date: "20200101",
      end_date: formatDate(new Date()),
      max_count: 20,
      fields: [
        "id", "create_time", "cover_image_url", "share_url", "video_description",
        "duration", "like_count", "comment_count", "share_count", "view_count",
        "music_id", "hashtag_names",
      ],
    });
    await log("research/video/query");

    for (const v of data.data?.videos ?? []) {
      const dur = Number(v.duration ?? 0);
      results.push({
        platform: "TIKTOK",
        platformId: String(v.id),
        title: v.video_description?.slice(0, 200) ?? null,
        description: v.video_description?.slice(0, 300) ?? null,
        publishedAt: new Date(v.create_time * 1000).toISOString(),
        thumbnailUrl: v.cover_image_url ?? null,
        durationSeconds: dur,
        isShort: true, // TikToks are always short-form
        url: v.share_url ?? `https://www.tiktok.com/video/${v.id}`,
        mediaType: "VIDEO",
        viewCount: BigInt(v.view_count ?? 0),
        likeCount: BigInt(v.like_count ?? 0),
        commentCount: BigInt(v.comment_count ?? 0),
        shareCount: BigInt(v.share_count ?? 0),
        saveCount: BigInt(0),
        platformMeta: { hashtags: v.hashtag_names ?? [] },
      });
    }
  }
  return results;
}

// ─── Keyword/hashtag search ───────────────────────────────────────────────────

export async function searchTikTok(query: string, opts: { max?: number } = {}): Promise<string[]> {
  // Strip # for hashtag searches — the Research API uses the keyword without #
  const keyword = query.replace(/^#/, "");
  const data = await post("/v2/research/video/query/", {
    query: { and: [{ operation: "IN", field_name: "hashtag_name", field_values: [keyword] }] },
    start_date: formatDate(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)),
    end_date: formatDate(new Date()),
    max_count: Math.min(opts.max ?? 20, 100),
    fields: ["id"],
    sort_type: "1", // 1 = by popularity
  });
  await log("research/video/query");
  return (data.data?.videos ?? []).map((v: any) => String(v.id));
}

function formatDate(d: Date): string {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}
