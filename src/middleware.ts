import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

function getSecret(): string {
  return process.env.SESSION_SECRET ?? "";
}

function base64UrlToBytes(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const base64 = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function timingSafeEqualBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a[i] ^ b[i];
  return out === 0;
}

async function hmacSha256Base64Url(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  const bytes = new Uint8Array(sig);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function verifySessionToken(token: string): Promise<boolean> {
  const idx = token.lastIndexOf(".");
  if (idx <= 0) return false;
  const payload = token.slice(0, idx);
  const sig = token.slice(idx + 1);
  const secret = getSecret();
  if (!secret || secret.length < 16) return false;
  try {
    const expected = await hmacSha256Base64Url(secret, payload);
    const a = base64UrlToBytes(sig);
    const b = base64UrlToBytes(expected);
    if (!timingSafeEqualBytes(a, b)) return false;
    const json = JSON.parse(new TextDecoder().decode(base64UrlToBytes(payload))) as { exp?: number };
    return !!json.exp && Date.now() <= json.exp;
  } catch {
    return false;
  }
}

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const protectedPrefix =
    path.startsWith("/dashboard") ||
    path.startsWith("/api/mail") ||
    path.startsWith("/api/statements") ||
    path.startsWith("/api/suppliers") ||
    path.startsWith("/api/mailboxes");

  if (!protectedPrefix) {
    return NextResponse.next();
  }

  const cron = process.env.CRON_SECRET;
  if (cron && path === "/api/mail/poll") {
    const auth = request.headers.get("authorization");
    if (auth === `Bearer ${cron}`) {
      return NextResponse.next();
    }
  }

  const token = request.cookies.get("ip_session")?.value;
  if (!token || !(await verifySessionToken(token))) {
    if (path.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const login = new URL("/login", request.url);
    login.searchParams.set("from", path);
    return NextResponse.redirect(login);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/api/mail/:path*", "/api/statements/:path*", "/api/suppliers/:path*", "/api/mailboxes/:path*"],
};
