export function calculateVph(viewCount: bigint, publishedAt: Date): number {
  const hours = Math.max(1 / 60, (Date.now() - publishedAt.getTime()) / 3_600_000);
  return Number(viewCount) / hours;
}

interface Snapshot { viewCount: bigint; capturedAt: Date; }

export function calculateGrowthSince(current: bigint, snapshots: Snapshot[], targetHoursAgo: number): bigint {
  if (!snapshots.length) return BigInt(0);
  const targetTime = Date.now() - targetHoursAgo * 3_600_000;
  let closest = snapshots[0];
  let diff = Math.abs(closest.capturedAt.getTime() - targetTime);
  for (const s of snapshots) {
    const d = Math.abs(s.capturedAt.getTime() - targetTime);
    if (d < diff) { closest = s; diff = d; }
  }
  if (closest.capturedAt.getTime() > targetTime) return BigInt(0);
  const delta = current - closest.viewCount;
  return delta > BigInt(0) ? delta : BigInt(0);
}
