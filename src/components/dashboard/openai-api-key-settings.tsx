"use client";

import { useCallback, useEffect, useState } from "react";

export function OpenAiApiKeySettings() {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/settings/ai", { credentials: "include" });
      const data = (await res.json()) as { configured?: boolean; error?: string };
      if (!res.ok) {
        setConfigured(null);
        setError(data.error ?? "Could not load settings");
        return;
      }
      setConfigured(!!data.configured);
      setError(null);
    } catch {
      setConfigured(null);
      setError("Network error");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/settings/ai", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        configured?: boolean;
        error?: string | { formErrors?: string[] };
      };
      if (!res.ok || !data.ok) {
        const err =
          typeof data.error === "string"
            ? data.error
            : "Could not save API key";
        setError(err);
        return;
      }
      setConfigured(!!data.configured);
      setApiKey("");
      setMessage(
        data.configured
          ? "API key saved. It is encrypted before storage."
          : "Saved key removed."
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={(e) => void save(e)} className="mt-4 flex flex-col gap-3">
      <p className="text-sm text-[var(--muted)]">
        Status:{" "}
        {configured === null ? (
          "…"
        ) : configured ? (
          <span className="text-[var(--text)]">A key is saved</span>
        ) : (
          <span className="text-amber-700 dark:text-amber-400">No key saved</span>
        )}
      </p>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-[var(--text)]">OpenAI API key</span>
        <input
          type="password"
          autoComplete="off"
          value={apiKey}
          onChange={(ev) => setApiKey(ev.target.value)}
          placeholder={configured ? "Enter a new key to replace the saved one" : "sk-…"}
          className="rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-[var(--text)]"
        />
        <span className="text-xs text-[var(--muted)]">
          Leave blank and save to remove the stored key. Requires{" "}
          <code className="text-[var(--text)]">ENCRYPTION_KEY</code> in the environment so secrets can be
          encrypted at rest.
        </span>
      </label>
      <button
        type="submit"
        disabled={loading}
        className="inline-flex w-fit items-center justify-center rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm font-medium text-[var(--text)] disabled:opacity-50"
      >
        {loading ? "Saving…" : "Save API key"}
      </button>
      {message ? <p className="text-sm text-[var(--muted)]">{message}</p> : null}
      {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
    </form>
  );
}
