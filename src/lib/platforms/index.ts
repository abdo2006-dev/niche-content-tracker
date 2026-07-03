/**
 * Platform router — dispatches to the right API wrapper based on Platform enum.
 * Import from here rather than individual platform files to keep call sites clean.
 */
import type { Platform } from "@prisma/client";
import type { ResolvedCreator, PostStub, ResolvedPost } from "@/lib/types";
import { resolveYouTubeCreator, fetchYouTubeRecentPosts, fetchYouTubePostDetails, searchYouTube } from "./youtube";
import { resolveTikTokCreator, fetchTikTokRecentPosts, fetchTikTokPostDetails, searchTikTok } from "./tiktok";
import { resolveInstagramCreator, fetchInstagramRecentPosts, fetchInstagramPostDetails, searchInstagram } from "./instagram";

/** Detects which platform a URL/handle belongs to, falling back to the supplied default. */
export function detectPlatform(input: string, defaultPlatform?: Platform): Platform {
  const t = input.toLowerCase();
  if (t.includes("tiktok.com") || (t.startsWith("@") && defaultPlatform === "TIKTOK")) return "TIKTOK";
  if (t.includes("instagram.com") || t.includes("instagr.am")) return "INSTAGRAM";
  if (t.includes("youtube.com") || t.includes("youtu.be") || /^UC[0-9A-Za-z_-]{22}$/.test(input.trim())) return "YOUTUBE";
  return defaultPlatform ?? "YOUTUBE";
}

export async function resolveCreator(platform: Platform, input: string): Promise<ResolvedCreator> {
  switch (platform) {
    case "YOUTUBE":   return resolveYouTubeCreator(input);
    case "TIKTOK":    return resolveTikTokCreator(input);
    case "INSTAGRAM": return resolveInstagramCreator(input);
  }
}

export async function fetchRecentPosts(platform: Platform, meta: Record<string, unknown>, max = 25): Promise<PostStub[]> {
  switch (platform) {
    case "YOUTUBE":
      if (!meta.uploadsPlaylistId) return [];
      return fetchYouTubeRecentPosts(meta.uploadsPlaylistId as string, max);
    case "TIKTOK":
      if (!meta.username) return [];
      return fetchTikTokRecentPosts((meta.username as string).replace(/^@/, ""), max);
    case "INSTAGRAM":
      // meta.platformId is the IG user ID (not username)
      return []; // posts are fetched differently — see sync.ts
  }
}

export async function fetchPostDetails(platform: Platform, ids: string[]): Promise<ResolvedPost[]> {
  switch (platform) {
    case "YOUTUBE":   return fetchYouTubePostDetails(ids);
    case "TIKTOK":    return fetchTikTokPostDetails(ids);
    case "INSTAGRAM": return fetchInstagramPostDetails(ids);
  }
}

export async function searchPlatform(platform: Platform, query: string, opts: { shortsOnly?: boolean; max?: number } = {}): Promise<string[]> {
  switch (platform) {
    case "YOUTUBE":   return searchYouTube(query, opts);
    case "TIKTOK":    return searchTikTok(query, opts);
    case "INSTAGRAM": return searchInstagram(query, opts);
  }
}

export const PLATFORM_LABELS: Record<Platform, string> = {
  YOUTUBE: "YouTube",
  TIKTOK: "TikTok",
  INSTAGRAM: "Instagram",
};

export const PLATFORM_COLORS: Record<Platform, string> = {
  YOUTUBE: "#ff0000",
  TIKTOK: "#69c9d0",
  INSTAGRAM: "#e1306c",
};
