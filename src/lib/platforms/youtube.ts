/**
 * YouTube Data API v3 wrapper.
 *
 * Quota costs (default 10,000 units/day):
 *  - channels.list      → 1 unit
 *  - playlistItems.list → 1 unit
 *  - videos.list        → 1 unit (up to 50 IDs per call — always batch!)
 *  - search.list        → 100 units  ← expensive, use sparingly
 *
 * All calls are logged to ApiUsageLog so usage is visible on /settings.
 * NEVER import this from client components.
 */
import { prisma } from "@/lib/prisma";
import type { ResolvedCreator, PostStub, ResolvedPost } from "@/lib/types";

const BASE = "https://www.googleapis.com/youtube/v3";

function key() {
  const k = process.env.YOUTUBE_API_KEY;
  if (!k) throw new Error("YOUTUBE_API_KEY is not configured.");
  return k;
}

async function log(endpoint: string, units: number) {
  try {
    await prisma.apiUsageLog.create({ data: { platform: "YOUTUBE", endpoint, units } });
  } catch {}
}

async function get(path: string, params: Record<string, string>) {
  const url = new URL(`${BASE}/${path}`);
  url.searchParams.set("key", key());
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`YouTube API ${path} ${res.status}: ${await res.text()}`);
  return res.json();
}

// ─── Channel resolution ───────────────────────────────────────────────────────

function parseInput(input: string): { type: "id" | "handle" | "legacy"; value: string } {
  const t = input.trim();
  if (/^UC[0-9A-Za-z_-]{22}$/.test(t)) return { type: "id", value: t };
  if (/^@[\w.-]+$/.test(t)) return { type: "handle", value: t };
  try {
    const url = new URL(t.startsWith("http") ? t : `https://${t}`);
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts[0] === "channel" && parts[1]) return { type: "id", value: parts[1] };
    if (parts[0]?.startsWith("@")) return { type: "handle", value: parts[0] };
    if (parts[0] === "c" && parts[1]) return { type: "legacy", value: parts[1] };
    if (parts[0] === "user" && parts[1]) return { type: "legacy", value: parts[1] };
    if (parts[0]) return { type: "handle", value: `@${parts[0].replace(/^@/, "")}` };
  } catch {}
  return { type: "handle", value: `@${t.replace(/^@/, "")}` };
}

export async function resolveYouTubeCreator(input: string): Promise<ResolvedCreator> {
  const parsed = parseInput(input);
  let data: any;

  if (parsed.type === "id") {
    data = await get("channels", { part: "snippet,statistics,contentDetails", id: parsed.value });
    await log("channels.list", 1);
  } else if (parsed.type === "handle") {
    data = await get("channels", { part: "snippet,statistics,contentDetails", forHandle: parsed.value });
    await log("channels.list", 1);
  } else {
    data = await get("channels", { part: "snippet,statistics,contentDetails", forUsername: parsed.value });
    await log("channels.list", 1);
    if (!data.items?.length) {
      data = await get("channels", { part: "snippet,statistics,contentDetails", forHandle: `@${parsed.value}` });
      await log("channels.list", 1);
    }
    if (!data.items?.length) {
      const s = await get("search", { part: "snippet", type: "channel", q: parsed.value, maxResults: "1" });
      await log("search.list", 100);
      if (s.items?.[0]) {
        data = await get("channels", { part: "snippet,statistics,contentDetails", id: s.items[0].snippet.channelId });
        await log("channels.list", 1);
      }
    }
  }

  const item = data?.items?.[0];
  if (!item) throw new Error(`Could not find YouTube channel: "${input}"`);

  return {
    platform: "YOUTUBE",
    platformId: item.id,
    username: item.snippet.customUrl ? `@${item.snippet.customUrl.replace(/^@/, "")}` : item.snippet.title,
    displayName: item.snippet.title,
    profileUrl: `https://www.youtube.com/channel/${item.id}`,
    avatarUrl: item.snippet.thumbnails?.high?.url ?? item.snippet.thumbnails?.default?.url ?? null,
    bio: item.snippet.description ?? null,
    followerCount: item.statistics?.hiddenSubscriberCount ? null : BigInt(item.statistics?.subscriberCount ?? 0),
    platformMeta: { uploadsPlaylistId: item.contentDetails.relatedPlaylists.uploads },
  };
}

// ─── Recent uploads ───────────────────────────────────────────────────────────

export async function fetchYouTubeRecentPosts(uploadsPlaylistId: string, max = 25): Promise<PostStub[]> {
  const results: PostStub[] = [];
  let pageToken: string | undefined;
  while (results.length < max) {
    const data = await get("playlistItems", {
      part: "contentDetails",
      playlistId: uploadsPlaylistId,
      maxResults: String(Math.min(50, max - results.length)),
      ...(pageToken ? { pageToken } : {}),
    });
    await log("playlistItems.list", 1);
    for (const item of data.items ?? []) {
      results.push({ platformId: item.contentDetails.videoId, publishedAt: item.contentDetails.videoPublishedAt });
    }
    pageToken = data.nextPageToken;
    if (!pageToken) break;
  }
  return results.slice(0, max);
}

// ─── Video details (batch up to 50) ──────────────────────────────────────────

function parseDuration(iso: string): number {
  const m = iso.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!m) return 0;
  return (Number(m[1]) || 0) * 3600 + (Number(m[2]) || 0) * 60 + (Number(m[3]) || 0);
}

export async function fetchYouTubePostDetails(videoIds: string[]): Promise<ResolvedPost[]> {
  if (!videoIds.length) return [];
  const data = await get("videos", { part: "snippet,statistics,contentDetails", id: videoIds.join(",") });
  await log("videos.list", 1);

  return (data.items ?? []).map((item: any): ResolvedPost => {
    const dur = parseDuration(item.contentDetails.duration);
    return {
      platform: "YOUTUBE",
      platformId: item.id,
      title: item.snippet.title,
      description: (item.snippet.description ?? "").slice(0, 300),
      publishedAt: item.snippet.publishedAt,
      thumbnailUrl: item.snippet.thumbnails?.high?.url ?? item.snippet.thumbnails?.default?.url ?? null,
      durationSeconds: dur,
      isShort: dur > 0 && dur <= 60,
      url: `https://www.youtube.com/watch?v=${item.id}`,
      mediaType: "VIDEO",
      viewCount: BigInt(item.statistics?.viewCount ?? 0),
      likeCount: BigInt(item.statistics?.likeCount ?? 0),
      commentCount: BigInt(item.statistics?.commentCount ?? 0),
      shareCount: BigInt(0),
      saveCount: BigInt(0),
    };
  });
}

// ─── Keyword search ───────────────────────────────────────────────────────────

export async function searchYouTube(query: string, opts: { shortsOnly?: boolean; max?: number } = {}): Promise<string[]> {
  const data = await get("search", {
    part: "snippet",
    type: "video",
    q: query,
    order: "viewCount",
    maxResults: String(opts.max ?? 20),
    ...(opts.shortsOnly ? { videoDuration: "short" } : {}),
  });
  await log("search.list", 100);
  return (data.items ?? []).map((i: any) => i.id.videoId as string);
}
