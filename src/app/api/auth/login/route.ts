import { NextResponse } from "next/server";
import { createSessionCookie, verifyLoginPassword } from "@/lib/auth/session";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { password?: string };
    const ok = body.password && (await verifyLoginPassword(body.password));
    if (!ok) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }
    await createSessionCookie();
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}
