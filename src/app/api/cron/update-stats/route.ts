import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { updatePostStats } from "@/lib/sync";
import { getSetting } from "@/lib/settings";
import { verifyCronRequest } from "@/lib/cronAuth";
export async function GET(req: NextRequest) {
  const u = verifyCronRequest(req); if (u) return u;
  if ((await getSetting("cronEnabled")) === "false") return NextResponse.json({ skipped: true });
  const intervalHours = Number(await getSetting("refreshInterval_statsUpdate")) || 2;
  const due = await prisma.post.findMany({
    where: { publishedAt: { gte: new Date(Date.now() - 30 * 86400000) }, OR: [{ lastStatsUpdateAt: null }, { lastStatsUpdateAt: { lte: new Date(Date.now() - intervalHours * 3600000) } }] },
    select: { id: true }, take: 500,
  });
  return NextResponse.json(await updatePostStats(due.map((p) => p.id)));
}
