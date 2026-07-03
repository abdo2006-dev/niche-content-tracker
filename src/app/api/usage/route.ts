import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
export async function GET() {
  const since24h = new Date(Date.now() - 86400000);
  const [logs, total] = await Promise.all([
    prisma.apiUsageLog.groupBy({ by: ["platform", "endpoint"], where: { createdAt: { gte: since24h } }, _sum: { units: true }, _count: { _all: true } }),
    prisma.apiUsageLog.aggregate({ where: { createdAt: { gte: since24h } }, _sum: { units: true } }),
  ]);
  return NextResponse.json({ last24h: { byEndpoint: logs.map((l) => ({ platform: l.platform, endpoint: l.endpoint, calls: l._count._all, units: l._sum.units ?? 0 })), totalUnits: total._sum.units ?? 0 } });
}
