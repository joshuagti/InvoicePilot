"use client";

import Image from "next/image";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
      credentials: "include",
    });
    setLoading(false);
    if (!res.ok) {
      setError("Invalid password");
      return;
    }
    const dest = searchParams.get("from") || "/dashboard/review";
    router.push(dest);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-2 text-sm">
        <span className="text-[var(--muted)]">App password</span>
        <input
          type="password"
          className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[var(--text)]"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
        />
      </label>
      {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {loading ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-6 py-16">
      <div className="flex flex-col gap-2">
        <Image
          src="/logo.svg"
          alt="InvoicePilot"
          width={176}
          height={36}
          className="h-9 w-auto"
          unoptimized
          priority
        />
        <h1 className="text-xl font-semibold">Sign in</h1>
      </div>
      <Suspense fallback={<p className="text-sm text-[var(--muted)]">Loading…</p>}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
