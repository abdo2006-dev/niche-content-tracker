import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const TAGS = [
  { name:"MM2", color:"#f87171" },{ name:"GAG2", color:"#34d399" },
  { name:"Steal a Brainrot", color:"#a78bfa" },{ name:"Kick a Lucky Block", color:"#f59e0b" },
  { name:"Shorts / Reels / TikToks", color:"#38bdf8" },{ name:"Competitor", color:"#fb923c" },
  { name:"Big Creator", color:"#60a5fa" },{ name:"Small Creator", color:"#4ade80" },
];
async function main() {
  console.log("Seeding tags…");
  for (const tag of TAGS) {
    await prisma.tag.upsert({ where: { name: tag.name }, update: { color: tag.color }, create: tag });
  }
  console.log(`Done — ${TAGS.length} tags seeded.`);
}
main().catch(console.error).finally(() => prisma.$disconnect());
