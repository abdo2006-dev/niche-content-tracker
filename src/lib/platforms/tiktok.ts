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
const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  Accept: "application/json",
  Referer: "https://www.tikwm.com/",
};

async function log(endpoint: string) {
  try { await prisma.apiUsageLog.create({ data: { platform: "TIKTOK", endpoint, units: 1 } }); } catch {}
}

async function tikwm(path: string, params: Record<string, string>): Promise<any> {
  const url = new URL(`${BASE}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString(), { headers: HEADERS });
  if (!res.ok) throw new Error(`tikwm.com request failed (HTTP ${res.status}). It may be temporarily down — try again shortly.`);
  const json = await res.json();
  if (json.code !== 0) throw new Error(`tikwm.com error: ${json.msg ?? JSON.stringify(json)}`);
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
  const data = await tikwm("/user/posts", {
    unique_id: username,
    count: String(Math.min(max, 35)),
    cursor: "0",
  });
  await log("user/posts");
  return (data?.videos ?? []).map((v: any): PostStub => ({
    platformId: String(v.video_id),
    publishedAt: new Date((v.create_time ?? 0) * 1000).toISOString(),
  }));
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
        viewCount: BigInt(v.play ?? v.play_count ?? 0),
        likeCount: BigInt(v.digg_count ?? v.like_count ?? 0),
        commentCount: BigInt(v.comment_count ?? 0),
        shareCount: BigInt(v.share_count ?? 0),
        saveCount: BigInt(v.collect_count ?? 0),
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
