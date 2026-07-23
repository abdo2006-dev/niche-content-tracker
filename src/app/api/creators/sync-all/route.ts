import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncCreatorPosts } from "@/lib/sync";
import { checkRefreshAllowed } from "@/lib/quota";

export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  const force = new URL(req.url).searchParams.get("force") === "true";
  const creators = await prisma.creator.findMany();
  const results = [];
  for (const c of creators) {
    if (!force) {
      const { allowed } = await checkRefreshAllowed("creatorSync", c.lastSyncedAt);
      if (!allowed) { results.push({ id: c.id, skipped: true }); continue; }
    }
    try { results.push({ id: c.id, platform: c.platform, displayName: c.displayName, ...(await syncCreatorPosts(c)) }); }
    catch (e: any) { results.push({ id: c.id, error: e.message }); }
  }
  return NextResponse.json({ results });
}
