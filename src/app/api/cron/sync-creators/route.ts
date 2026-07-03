import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncCreatorPosts } from "@/lib/sync";
import { checkRefreshAllowed } from "@/lib/quota";
import { verifyCronRequest } from "@/lib/cronAuth";
import { getSetting } from "@/lib/settings";
export async function GET(req: NextRequest) {
  const u = verifyCronRequest(req); if (u) return u;
  if ((await getSetting("cronEnabled")) === "false") return NextResponse.json({ skipped: true });
  const creators = await prisma.creator.findMany();
  let synced = 0, created = 0;
  for (const c of creators) {
    const { allowed } = await checkRefreshAllowed("creatorSync", c.lastSyncedAt);
    if (!allowed) continue;
    try { const r = await syncCreatorPosts(c); created += r.created; synced++; } catch {}
  }
  return NextResponse.json({ synced, created, total: creators.length });
}
