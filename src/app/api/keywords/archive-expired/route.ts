import { NextResponse } from "next/server";
import { archiveExpiredTrackerPosts } from "@/lib/sync";

export const dynamic = "force-dynamic";
export async function POST() { return NextResponse.json(await archiveExpiredTrackerPosts()); }
