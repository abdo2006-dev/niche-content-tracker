import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
const schema = z.object({ content: z.string().min(1).max(2000) });
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  return NextResponse.json(await prisma.ideaNote.update({ where: { id: params.id }, data: parsed.data }));
}
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  await prisma.ideaNote.delete({ where: { id: params.id } });
  return NextResponse.json({ success: true });
}
