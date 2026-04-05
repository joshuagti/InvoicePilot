"use client";

import { useState } from "react";

export function ReprocessAiButton() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/mail/reprocess", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({}),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        metrics?: { emails: number; gptCalls: number; errors: number };
      };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Request failed");
        return;
      }
      const m = data.metrics;
      if (m) {
        setMessage(
          `Processed ${m.emails} email(s), ${m.gptCalls} AI call(s)${m.errors ? `, ${m.errors} error(s)` : ""}.`
        );
      } else {
        setMessage("Done.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        disabled={loading}
        onClick={() => void run()}
        className="inline-flex w-fit items-center justify-center rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {loading ? "Reprocessing…" : "Reprocess emails with AI"}
      </button>
      {message ? <p className="text-sm text-[var(--muted)]">{message}</p> : null}
      {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
    </div>
  );
}
