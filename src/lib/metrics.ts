export function calculateVph(viewCount: bigint, publishedAt: Date): number {
  const hours = Math.max(1 / 60, (Date.now() - publishedAt.getTime()) / 3_600_000);
  return Number(viewCount) / hours;
}

function toBigIntCount(value: unknown): bigint {
  if (typeof value === "bigint") return value;
  const n = Number(value ?? 0);
  return BigInt(Number.isFinite(n) ? Math.trunc(n) : 0);
}

export function withFreshVph<T extends { viewCount: unknown; publishedAt: Date | string; vph?: number | null }>(post: T) {
  return {
    ...post,
    vph: calculateVph(toBigIntCount(post.viewCount), new Date(post.publishedAt)),
  };
}

export function sortByFreshVph<T extends { viewCount: unknown; publishedAt: Date | string; vph?: number | null }>(posts: T[]) {
  return posts.map(withFreshVph).sort((a, b) => b.vph - a.vph);
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
