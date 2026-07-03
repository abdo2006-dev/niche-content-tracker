"use client";
import Image from "next/image";
import TagPill from "./TagPill";
import PlatformBadge from "./PlatformBadge";
import { formatNumber, formatRelativeTime, formatDuration } from "@/lib/format";
import { ListPlus } from "lucide-react";
import type { Platform } from "@prisma/client";

export interface PostCardData {
  id: string; platformId: string; title?: string | null; url: string;
  thumbnailUrl?: string | null; publishedAt: string; durationSeconds?: number | null;
  platform: Platform; viewCount: string | number; likeCount: string | number;
  shareCount?: string | number; saveCount?: string | number;
  vph?: number | null; viewsGained24h?: string | number | null; viewsGained7d?: string | number | null;
  creator?: { displayName: string; avatarUrl?: string | null; platform: Platform } | null;
  tags?: { tag: { id: string; name: string; color: string | null } }[];
}

async function addTodo(postId: string) {
  const res = await fetch("/api/todos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ postId }),
  });
  if (!res.ok) {
    const text = await res.text();
    let error = "Could not add to to-do.";
    try { error = JSON.parse(text).error ?? error; } catch {}
    throw new Error(error);
  }
}

export default function PostCard({ post }: { post: PostCardData }) {
  const views = Number(post.viewCount);
  const hasViews = views > 0;
  async function onAddTodo() {
    try {
      await addTodo(post.id);
      alert("Added to To-Do Videos.");
    } catch (err: any) {
      alert(err.message ?? "Could not add to to-do.");
    }
  }

  return (
    <div className="card flex gap-3 hover:border-accent-blue/50 transition-colors group">
      {/* Thumbnail */}
      <a href={post.url} target="_blank" rel="noopener noreferrer" className="relative w-36 h-20 shrink-0 rounded-lg overflow-hidden bg-surface2">
        {post.thumbnailUrl && <Image src={post.thumbnailUrl} alt={post.title ?? "Post"} fill className="object-cover" unoptimized />}
        {post.durationSeconds ? (
          <span className="absolute bottom-1 right-1 bg-black/80 text-[10px] px-1 rounded text-white">{formatDuration(post.durationSeconds)}</span>
        ) : null}
      </a>
      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            <PlatformBadge platform={post.platform} />
            {post.tags?.slice(0,3).map(vt => <TagPill key={vt.tag.id} name={vt.tag.name} color={vt.tag.color} />)}
          </div>
          <button onClick={onAddTodo} className="btn-secondary text-xs px-2 py-1 shrink-0" title="Add to To-Do Videos">
            <ListPlus size={13} />
          </button>
        </div>
        <a href={post.url} target="_blank" rel="noopener noreferrer" className="block text-sm font-medium text-white line-clamp-2 mt-1 group-hover:text-accent-blue transition-colors">
          {post.title ?? "(no title)"}
        </a>
        <p className="text-xs text-muted mt-0.5">
          {post.creator?.displayName ?? "Unknown"} · {formatRelativeTime(post.publishedAt)}
        </p>
        <div className="flex items-center gap-3 mt-1.5 text-xs text-muted flex-wrap">
          {hasViews && <span>{formatNumber(post.viewCount)} views</span>}
          <span>{formatNumber(post.likeCount)} likes</span>
          {post.shareCount && Number(post.shareCount) > 0 && <span>{formatNumber(post.shareCount)} shares</span>}
          {post.vph != null && post.vph > 0 && <span className="text-accent-green">{formatNumber(post.vph)} VPH</span>}
        </div>
        {(post.viewsGained24h || post.viewsGained7d) && (
          <div className="flex gap-3 mt-0.5 text-xs text-accent-purple">
            {post.viewsGained24h && Number(post.viewsGained24h) > 0 && <span>+{formatNumber(post.viewsGained24h)} (24h)</span>}
            {post.viewsGained7d && Number(post.viewsGained7d) > 0 && <span>+{formatNumber(post.viewsGained7d)} (7d)</span>}
          </div>
        )}
      </div>
    </div>
  );
}
