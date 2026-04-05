import { NextResponse } from "next/server";
import { pollMailboxes } from "@/lib/ingestion/poll-mail";

export async function POST() {
  try {
    const metrics = await pollMailboxes();
    return NextResponse.json({ ok: true, metrics });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "poll failed" },
      { status: 500 }
    );
  }
}
