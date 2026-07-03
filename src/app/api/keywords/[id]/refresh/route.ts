import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { refreshKeywordTracker } from "@/lib/sync";
import { checkRefreshAllowed } from "@/lib/quota";
import { getSetting } from "@/lib/settings";
import { serializeBigInt } from "@/lib/serialize";

export const dynamic = "force-dynamic";
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const tracker = await prisma.keywordTracker.findUnique({ where: { id: params.id } });
  if (!tracker) return NextResponse.json({ error: "Tracker not found." }, { status: 404 });
  const { allowed, hoursRemaining, intervalHours } = await checkRefreshAllowed("keywordRefresh", tracker.lastFetchedAt);
  if (!allowed) return NextResponse.json({ error: `Refreshed recently (costs quota). Try again in ${hoursRemaining.toFixed(1)}h (interval: ${intervalHours}h).` }, { status: 429 });
  try {
    const max = Number(await getSetting("maxPostsPerKeyword")) || 20;
    return NextResponse.json(serializeBigInt(await refreshKeywordTracker(tracker as any, max)));
  } catch (err: any) { return NextResponse.json({ error: err.message }, { status: 500 }); }
}
