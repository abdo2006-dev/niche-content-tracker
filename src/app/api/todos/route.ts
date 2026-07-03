import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { serializeBigInt } from "@/lib/serialize";
import { createTodoVideoSchema } from "@/lib/validations";
import { findOrCreateTodoGroup, suggestTodoGroupTitle } from "@/lib/todos";

export const dynamic = "force-dynamic";

const postInclude = {
  creator: { select: { id: true, displayName: true, avatarUrl: true, platform: true } },
  tags: { include: { tag: true } },
};

export async function GET() {
  const [groups, ungrouped] = await Promise.all([
    prisma.todoGroup.findMany({
      orderBy: { updatedAt: "desc" },
      include: {
        videos: {
          orderBy: [{ done: "asc" }, { createdAt: "desc" }],
          include: { post: { include: postInclude } },
        },
      },
    }),
    prisma.todoVideo.findMany({
      where: { groupId: null },
      orderBy: [{ done: "asc" }, { createdAt: "desc" }],
      include: { post: { include: postInclude } },
    }),
  ]);

  return NextResponse.json(serializeBigInt({ groups, ungrouped }));
}

export async function POST(req: NextRequest) {
  const parsed = createTodoVideoSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { postId, groupId, groupTitle, title, url, notes } = parsed.data;

  const post = postId
    ? await prisma.post.findUnique({ where: { id: postId }, include: postInclude })
    : null;
  if (postId && !post) return NextResponse.json({ error: "Post not found." }, { status: 404 });

  let resolvedGroupId = groupId ?? null;
  if (!resolvedGroupId) {
    const suggestedTitle = groupTitle ?? (post ? suggestTodoGroupTitle(post) : title);
    if (suggestedTitle) resolvedGroupId = (await findOrCreateTodoGroup(suggestedTitle)).id;
  }

  const item = postId
    ? await prisma.todoVideo.upsert({
        where: { postId },
        update: { groupId: resolvedGroupId, notes },
        create: { postId, groupId: resolvedGroupId, title: title ?? post?.title, url: url ?? post?.url, notes },
        include: { post: { include: postInclude }, group: true },
      })
    : await prisma.todoVideo.create({
        data: { groupId: resolvedGroupId, title, url, notes },
        include: { post: { include: postInclude }, group: true },
      });

  return NextResponse.json(serializeBigInt(item), { status: 201 });
}
