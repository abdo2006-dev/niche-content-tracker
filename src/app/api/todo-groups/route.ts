import { NextRequest, NextResponse } from "next/server";
import { createTodoGroupSchema } from "@/lib/validations";
import { findOrCreateTodoGroup } from "@/lib/todos";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const parsed = createTodoGroupSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const group = await findOrCreateTodoGroup(parsed.data.title);
  return NextResponse.json(group, { status: 201 });
}
