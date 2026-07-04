import fs from "node:fs";
import path from "node:path";

function loadEnvLocal() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;

  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq);
    const rawValue = trimmed.slice(eq + 1);
    process.env[key] ??= rawValue.replace(/^['"]|['"]$/g, "");
  }
}

function stringify(value: unknown) {
  return JSON.stringify(
    value,
    (_key, item) => (typeof item === "bigint" ? item.toString() : item),
    2
  );
}

function usernameFromCreator(creator: { username: string; platformMeta: unknown }) {
  const meta = (creator.platformMeta ?? {}) as Record<string, unknown>;
  return String(meta.username ?? creator.username).replace(/^@/, "");
}

let prismaClient: { $disconnect: () => Promise<void> } | null = null;

async function main() {
  loadEnvLocal();
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is missing. Add it to .env.local or the shell environment.");
  }

  const [{ prisma }, tiktok, sync] = await Promise.all([
    import("@/lib/prisma"),
    import("@/lib/platforms/tiktok"),
    import("@/lib/sync"),
  ]);
  prismaClient = prisma;
  const { fetchTikwmUserPostsRaw, parseTikwmPosts, parseTikwmPostsWithDetails } = tiktok;
  const { syncCreatorPosts } = sync;

  const creators = await prisma.creator.findMany({
    where: { platform: "TIKTOK" },
    include: { _count: { select: { posts: true } } },
    orderBy: { createdAt: "asc" },
  });
  const creator = creators.find((item) => item._count.posts === 0) ?? creators[0];
  if (!creator) throw new Error("No TikTok creators found in the database.");

  const username = usernameFromCreator(creator);
  const before = await prisma.post.count({ where: { creatorId: creator.id } });

  console.log("Creator selected:");
  console.log(stringify({ id: creator.id, username: creator.username, postCountBefore: before }));

  const raw = await fetchTikwmUserPostsRaw(username, 5, "0");
  console.log("Raw tikwm.com response:");
  console.log(stringify(raw));

  const parsedStubs = parseTikwmPosts(raw, 5);
  const parsed = parseTikwmPostsWithDetails(raw, username, 5);
  console.log("Parsed TikTok posts:");
  console.log(
    stringify(
      parsed.map((post) => ({
        platformId: post.platformId,
        title: post.title,
        publishedAt: post.publishedAt,
        viewCount: post.viewCount,
        url: post.url,
      }))
    )
  );

  const result = await syncCreatorPosts(creator, 5);
  const after = await prisma.post.count({ where: { creatorId: creator.id } });

  console.log("Sync result:");
  console.log(stringify({ ...result, before, after, delta: after - before }));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prismaClient?.$disconnect();
  });
