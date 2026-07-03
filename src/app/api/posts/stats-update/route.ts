import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { updatePostStats } from "@/lib/sync";
import { getSetting } from "@/lib/settings";

export const dynamic = "force-dynamic";

export async function POST() {
  const intervalHours = Number(await getSetting("refreshInterval_statsUpdate")) || 2;
  const cutoff = new Date(Date.now() - intervalHours * 3600000);
  const active = new Date(Date.now() - 30 * 86400000);
  const due = await prisma.post.findMany({
    where: { publishedAt: { gte: active }, OR: [{ lastStatsUpdateAt: null }, { lastStatsUpdateAt: { lte: cutoff } }] },
    select: { id: true }, take: 500,
  });
  return NextResponse.json(await updatePostStats(due.map((p) => p.id)));
}
