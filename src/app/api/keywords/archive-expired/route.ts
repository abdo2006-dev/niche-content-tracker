import { NextResponse } from "next/server";
import { archiveExpiredTrackerPosts } from "@/lib/sync";
export async function POST() { return NextResponse.json(await archiveExpiredTrackerPosts()); }
