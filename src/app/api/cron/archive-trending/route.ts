import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { archiveExpiredTrackerPosts, pruneOldPosts, refreshKeywordTracker } from "@/lib/sync";
import { checkRefreshAllowed } from "@/lib/quota";
import { verifyCronRequest } from "@/lib/cronAuth";
import { getSetting } from "@/lib/settings";

export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  const u = verifyCronRequest(req); if (u) return u;
  if ((await getSetting("cronEnabled")) === "false") return NextResponse.json({ skipped: true });
  const { archived } = await archiveExpiredTrackerPosts();
  const retentionDays = Number(await getSetting("postRetentionDays")) || 30;
  const pruned = await pruneOldPosts(retentionDays);
  const trackers = await prisma.keywordTracker.findMany({ where: { active: true } });
  const max = Number(await getSetting("maxPostsPerKeyword")) || 20;
  let refreshed = 0;
  for (const t of trackers) {
    const { allowed } = await checkRefreshAllowed("keywordRefresh", t.lastFetchedAt);
    if (!allowed) continue;
    try { await refreshKeywordTracker(t as any, max); refreshed++; } catch {}
  }
  return NextResponse.json({ archived, pruned, refreshed, total: trackers.length });
}
