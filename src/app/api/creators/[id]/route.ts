import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { updateCreatorTagsSchema } from "@/lib/validations";

export const dynamic = "force-dynamic";
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  const parsed = updateCreatorTagsSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  await prisma.creatorTag.deleteMany({ where: { creatorId: params.id } });
  await prisma.creatorTag.createMany({ data: parsed.data.tagIds.map((tagId) => ({ creatorId: params.id, tagId })) });
  const creator = await prisma.creator.findUnique({ where: { id: params.id }, include: { tags: { include: { tag: true } } } });
  return NextResponse.json(creator);
}
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  await prisma.creator.delete({ where: { id: params.id } });
  return NextResponse.json({ success: true });
}
