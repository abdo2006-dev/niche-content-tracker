import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createIdeaNoteSchema } from "@/lib/validations";
export async function POST(req: NextRequest) {
  const parsed = createIdeaNoteSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  return NextResponse.json(await prisma.ideaNote.create({ data: parsed.data }), { status: 201 });
}
