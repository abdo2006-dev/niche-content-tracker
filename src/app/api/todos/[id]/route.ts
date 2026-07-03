import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { serializeBigInt } from "@/lib/serialize";
import { updateTodoVideoSchema } from "@/lib/validations";
import { findOrCreateTodoGroup } from "@/lib/todos";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const parsed = updateTodoVideoSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { groupTitle, ...data } = parsed.data;
  let groupId = data.groupId;
  if (groupTitle) groupId = (await findOrCreateTodoGroup(groupTitle)).id;

  const item = await prisma.todoVideo.update({
    where: { id: params.id },
    data: { ...data, groupId },
    include: {
      group: true,
      post: {
        include: {
          creator: { select: { id: true, displayName: true, avatarUrl: true, platform: true } },
          tags: { include: { tag: true } },
        },
      },
    },
  });

  return NextResponse.json(serializeBigInt(item));
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  await prisma.todoVideo.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
