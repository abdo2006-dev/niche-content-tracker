import { prisma } from "@/lib/prisma";

export const DEFAULTS: Record<string, string> = {
  refreshInterval_creatorSync: "6",
  refreshInterval_statsUpdate: "2",
  refreshInterval_keywordRefresh: "12",
  maxPostsPerKeyword: "20",
  maxTrendingDays: "30",
  postRetentionDays: "30",
  cronEnabled: "true",
};

export async function getSetting(key: string): Promise<string | null> {
  const r = await prisma.appSetting.findUnique({ where: { key } });
  return r?.value ?? DEFAULTS[key] ?? null;
}

export async function getAllSettings(): Promise<Record<string, string>> {
  const rows = await prisma.appSetting.findMany();
  const map = { ...DEFAULTS };
  for (const r of rows) map[r.key] = r.value;
  return map;
}

export async function setSetting(key: string, value: string) {
  return prisma.appSetting.upsert({ where: { key }, update: { value }, create: { key, value } });
}
