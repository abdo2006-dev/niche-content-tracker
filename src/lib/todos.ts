import { prisma } from "@/lib/prisma";
import type { Post } from "@prisma/client";

const GENERIC_WORDS = new Set([
  "roblox", "video", "shorts", "reels", "tiktok", "grow", "garden", "growagarden",
  "growagarden2", "fyp", "viral", "new", "best", "all", "the", "and", "for", "with",
]);

function cleanToken(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "").trim();
}

export function suggestTodoGroupTitle(post: Pick<Post, "title" | "platformMeta">) {
  const meta = (post.platformMeta ?? {}) as Record<string, unknown>;
  const hashtags = Array.isArray(meta.hashtags) ? meta.hashtags.map(String) : [];
  const usefulTags = hashtags.map(cleanToken).filter((tag) => tag.length > 2 && !GENERIC_WORDS.has(tag));
  if (usefulTags.length) return usefulTags.slice(0, 3).map((tag) => `#${tag}`).join(" ");

  const titleWords = (post.title ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .map(cleanToken)
    .filter((word) => word.length > 3 && !GENERIC_WORDS.has(word));

  return titleWords.slice(0, 5).join(" ") || "Ungrouped ideas";
}

export async function findOrCreateTodoGroup(title: string) {
  const normalized = title.trim();
  return prisma.todoGroup.upsert({
    where: { title: normalized },
    update: {},
    create: { title: normalized },
  });
}
