import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncCreatorPosts } from "@/lib/sync";
import { checkRefreshAllowed } from "@/lib/quota";

export const dynamic = "force-dynamic";
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const creator = await prisma.creator.findUnique({ where: { id: params.id } });
  if (!creator) return NextResponse.json({ error: "Creator not found." }, { status: 404 });
  const { allowed, hoursRemaining, intervalHours } = await checkRefreshAllowed("creatorSync", creator.lastSyncedAt);
  if (!allowed) return NextResponse.json({ error: `Synced recently — try again in ${hoursRemaining.toFixed(1)}h (interval: ${intervalHours}h).` }, { status: 429 });
  try { return NextResponse.json(await syncCreatorPosts(creator)); }
  catch (err: any) { return NextResponse.json({ error: err.message ?? "Sync failed." }, { status: 500 }); }
}
