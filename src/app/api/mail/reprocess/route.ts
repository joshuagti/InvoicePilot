import { NextResponse } from "next/server";
import { reprocessEmailsBatch, reprocessEmailWithAi } from "@/lib/ingestion/reprocess-email";

/** Re-run AI extraction on stored emails (same pipeline as ingestion, using saved body + attachment text). */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const emailId = typeof body.emailId === "string" ? body.emailId : undefined;
    const limit =
      typeof body.limit === "number" && body.limit > 0 && body.limit <= 500
        ? Math.floor(body.limit)
        : 100;

    if (emailId) {
      const r = await reprocessEmailWithAi(emailId);
      if (!r.ok) {
        return NextResponse.json({ ok: false, error: r.error }, { status: r.error === "email_not_found" ? 404 : 400 });
      }
      return NextResponse.json({
        ok: true,
        mode: "single",
        candidate: r.candidate,
        gptCalls: r.gptCalls,
      });
    }

    const metrics = await reprocessEmailsBatch({ limit });
    return NextResponse.json({ ok: true, mode: "batch", metrics });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "reprocess failed" },
      { status: 500 }
    );
  }
}
