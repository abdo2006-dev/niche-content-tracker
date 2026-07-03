import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { renameTagSchema } from "@/lib/validations";
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const parsed = renameTagSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  return NextResponse.json(await prisma.tag.update({ where: { id: params.id }, data: parsed.data }));
}
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  await prisma.tag.delete({ where: { id: params.id } });
  return NextResponse.json({ success: true });
}
