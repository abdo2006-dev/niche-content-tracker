import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createTagSchema } from "@/lib/validations";

export const dynamic = "force-dynamic";
export async function GET() {
  const tags = await prisma.tag.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { creatorTags: true, postTags: true, keywordTags: true } } } });
  return NextResponse.json(tags);
}
export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = createTagSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  try { return NextResponse.json(await prisma.tag.create({ data: parsed.data }), { status: 201 }); }
  catch { return NextResponse.json({ error: "A tag with that name already exists." }, { status: 409 }); }
}
