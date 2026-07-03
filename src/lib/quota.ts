import { getSetting } from "@/lib/settings";

const DEFAULTS = { creatorSync: 6, statsUpdate: 2, keywordRefresh: 12 };

export async function checkRefreshAllowed(kind: keyof typeof DEFAULTS, lastFetchedAt: Date | null) {
  const key = `refreshInterval_${kind}`;
  const val = await getSetting(key);
  const intervalHours = val ? Number(val) : DEFAULTS[kind];
  if (!lastFetchedAt) return { allowed: true, hoursRemaining: 0, intervalHours };
  const hoursSince = (Date.now() - lastFetchedAt.getTime()) / 3_600_000;
  const hoursRemaining = Math.max(0, intervalHours - hoursSince);
  return { allowed: hoursRemaining <= 0, hoursRemaining, intervalHours };
}
