import type { Platform, MediaType } from "@prisma/client";

/** Resolved creator profile returned by any platform's resolveCreator function. */
export interface ResolvedCreator {
  platform: Platform;
  platformId: string;
  username: string;
  displayName: string;
  profileUrl: string;
  avatarUrl: string | null;
  bio: string | null;
  followerCount: bigint | null;
  platformMeta: Record<string, unknown>; // e.g. { uploadsPlaylistId } for YouTube, { secUid } for TikTok
}

/** A post stub returned by "list recent posts" functions — just enough to detect what's new. */
export interface PostStub {
  platformId: string;
  publishedAt: string; // ISO 8601
  raw?: unknown;
}

/** Full post details returned after fetching a batch of posts. */
export interface ResolvedPost {
  platform: Platform;
  platformId: string;
  title: string | null;
  description: string | null;
  publishedAt: string;
  thumbnailUrl: string | null;
  durationSeconds: number;
  isShort: boolean;
  url: string;
  mediaType: MediaType;
  viewCount: bigint;
  likeCount: bigint;
  commentCount: bigint;
  shareCount: bigint;
  saveCount: bigint;
  platformMeta?: Record<string, unknown>;
}
