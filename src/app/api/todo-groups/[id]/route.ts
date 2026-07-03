import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { updateTodoGroupSchema } from "@/lib/validations";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const parsed = updateTodoGroupSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const group = await prisma.todoGroup.update({ where: { id: params.id }, data: parsed.data });
  return NextResponse.json(group);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  await prisma.todoVideo.updateMany({ where: { groupId: params.id }, data: { groupId: null } });
  await prisma.todoGroup.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
