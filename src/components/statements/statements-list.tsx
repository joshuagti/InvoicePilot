"use client";

import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";

type Doc = {
  id: string;
  countDecision: string;
  status: string;
  documentType: string | null;
  amountDue: string | null;
  dueDate: string | null;
  supplier: { name: string } | null;
  email: { subject: string | null; fromEmail: string | null; receivedAt: string | null };
};

export function StatementsList() {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [pollMsg, setPollMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/statements?limit=100", { credentials: "include" });
    if (!res.ok) return;
    const data = (await res.json()) as { documents: Doc[] };
    setDocs(data.documents);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function poll() {
    setPollMsg(null);
    const res = await fetch("/api/mail/poll", { method: "POST", credentials: "include" });
    const data = (await res.json()) as { metrics?: Record<string, number> };
    if (res.ok && data.metrics) {
      setPollMsg(`Polled: ${JSON.stringify(data.metrics)}`);
    } else {
      setPollMsg("Poll failed");
    }
    await load();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white"
          onClick={() => void poll()}
        >
          Poll mail now
        </button>
        {pollMsg && <span className="text-sm text-[var(--muted)]">{pollMsg}</span>}
      </div>
      <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
        <table className="w-full min-w-[800px] text-left text-sm">
          <thead className="bg-[var(--surface)] text-[var(--muted)]">
            <tr>
              <th className="px-3 py-2">Received</th>
              <th className="px-3 py-2">Supplier</th>
              <th className="px-3 py-2">Subject</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">Amount</th>
              <th className="px-3 py-2">Decision</th>
              <th className="px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {docs.map((d) => (
              <tr key={d.id} className="border-t border-[var(--border)]">
                <td className="px-3 py-2 whitespace-nowrap">
                  {d.email.receivedAt
                    ? format(new Date(d.email.receivedAt), "yyyy-MM-dd HH:mm")
                    : "—"}
                </td>
                <td className="px-3 py-2">{d.supplier?.name ?? "—"}</td>
                <td className="px-3 py-2 max-w-[240px] truncate">{d.email.subject ?? "—"}</td>
                <td className="px-3 py-2">{d.documentType ?? "—"}</td>
                <td className="px-3 py-2">{d.amountDue ?? "—"}</td>
                <td className="px-3 py-2">{d.countDecision}</td>
                <td className="px-3 py-2">{d.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
