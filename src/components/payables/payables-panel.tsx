"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { StatementDocumentDetail } from "@/components/statements/statement-document-detail";

const noteInputClass =
  "min-w-0 w-full rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-xs text-[var(--text)] outline-none placeholder:text-[var(--muted)] focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]/30 disabled:opacity-50";

const gbpFormat = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
});

function formatGbp(amount: number): string {
  return gbpFormat.format(amount);
}

type Doc = {
  id: string;
  countDecision: string;
  documentType: string | null;
  amountDue: string | null;
  currency: string | null;
  dueDate: string | null;
  supplier: { id: string; name: string } | null;
  email: { subject: string | null; fromEmail: string | null; receivedAt: string | null };
};

function sumByCurrency(docs: Doc[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const d of docs) {
    if (d.amountDue == null) continue;
    const ccy = d.currency ?? "";
    const n = Number(d.amountDue);
    m.set(ccy, (m.get(ccy) ?? 0) + n);
  }
  return m;
}

function formatMoney(amount: number, currency: string | null) {
  const c = currency?.trim() || "";
  return c ? `${c} ${amount.toFixed(2)}` : amount.toFixed(2);
}

export function PayablesPanel() {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(
      "/api/statements?unpaid=true&countDecision=count&limit=200&sort=dueDate",
      { credentials: "include" }
    );
    if (!res.ok) return;
    const data = (await res.json()) as { documents: Doc[] };
    setDocs(data.documents);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const grouped = useMemo(() => {
    const map = new Map<string, Doc[]>();
    for (const d of docs) {
      const sid = d.supplier?.id ?? "_none";
      if (!map.has(sid)) map.set(sid, []);
      map.get(sid)!.push(d);
    }
    const entries = [...map.entries()].sort((a, b) => {
      const nameA = a[1][0]?.supplier?.name ?? "";
      const nameB = b[1][0]?.supplier?.name ?? "";
      return nameA.localeCompare(nameB);
    });
    return entries;
  }, [docs]);

  async function markPaid(documentId: string) {
    setBusyId(documentId);
    setMsg(null);
    const note = notes[documentId]?.trim();
    const res = await fetch("/api/statements/mark-paid", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentId, note: note || undefined }),
    });
    setBusyId(null);
    if (!res.ok) {
      setMsg("Could not mark as paid");
      return;
    }
    setNotes((prev) => {
      const next = { ...prev };
      delete next[documentId];
      return next;
    });
    if (expandedId === documentId) setExpandedId(null);
    await load();
  }

  function dueCell(due: string | null) {
    if (!due) return "—";
    try {
      return format(new Date(due), "yyyy-MM-dd");
    } catch {
      return due;
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {msg && (
        <p className="rounded border border-[var(--danger)]/40 bg-[var(--danger)]/10 px-2 py-1.5 text-xs text-[var(--danger)]">
          {msg}
        </p>
      )}
      {docs.length === 0 ? (
        <p className="rounded border border-dashed border-[var(--border)] bg-[var(--surface)]/40 px-3 py-6 text-center text-sm text-[var(--muted)]">
          No unpaid items. Counted documents with an amount and supplier show here; use Review if something
          is missing.
        </p>
      ) : (
        <div className="flex flex-col gap-6">
          {grouped.map(([supplierKey, list]) => {
            const supplierName = list[0]?.supplier?.name ?? "Unknown supplier";
            const totals = sumByCurrency(list);
            const totalParts = [...totals.entries()].map(([ccy, sum]) => {
              const c = ccy.trim().toUpperCase();
              if (c === "" || c === "GBP" || c === "£") return formatGbp(sum);
              return formatMoney(sum, ccy || null);
            });

            return (
              <section key={supplierKey} className="flex flex-col gap-2">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 border-b border-[var(--border)] pb-1.5">
                  <h2 className="text-sm font-semibold">{supplierName}</h2>
                  <span className="text-xs tabular-nums text-[var(--muted)]">
                    Outstanding: <span className="text-[var(--text)]">{totalParts.join(" · ") || "—"}</span>
                  </span>
                </div>
                <div className="rounded-lg border border-[var(--border)]">
                  <table className="w-full table-fixed text-left text-xs">
                    <colgroup>
                      <col className="w-[10%]" />
                      <col className="w-[14%]" />
                      <col className="w-[36%]" />
                      <col className="w-[22%]" />
                      <col className="w-[18%]" />
                    </colgroup>
                    <thead className="bg-[var(--surface)] text-[var(--muted)]">
                      <tr className="border-b border-[var(--border)]">
                        <th className="px-2 py-1.5 font-medium">Due</th>
                        <th className="px-2 py-1.5 font-medium">Amount</th>
                        <th className="px-2 py-1.5 font-medium">Subject</th>
                        <th className="px-2 py-1.5 font-medium">Note</th>
                        <th className="px-2 py-1.5 font-medium" />
                      </tr>
                    </thead>
                    <tbody>
                      {list.map((d) => {
                        const noteId = `payable-note-${d.id}`;
                        return (
                          <Fragment key={d.id}>
                            <tr className="border-t border-[var(--border)] hover:bg-[var(--surface)]/50">
                              <td className="px-2 py-1 align-middle whitespace-nowrap tabular-nums text-[var(--muted)]">
                                {dueCell(d.dueDate)}
                              </td>
                              <td className="px-2 py-1 align-middle whitespace-nowrap font-medium tabular-nums">
                                {d.amountDue != null ? formatGbp(Number(d.amountDue)) : "—"}
                              </td>
                              <td className="max-w-0 px-2 py-1 align-middle">
                                <span className="block truncate" title={d.email.subject ?? undefined}>
                                  {d.email.subject ?? "—"}
                                </span>
                              </td>
                              <td className="px-2 py-1 align-middle">
                                <label htmlFor={noteId} className="sr-only">
                                  Payment note (optional)
                                </label>
                                <input
                                  id={noteId}
                                  type="text"
                                  className={noteInputClass}
                                  placeholder="Optional"
                                  autoComplete="off"
                                  value={notes[d.id] ?? ""}
                                  onChange={(e) =>
                                    setNotes((prev) => ({ ...prev, [d.id]: e.target.value }))
                                  }
                                  disabled={busyId === d.id}
                                />
                              </td>
                              <td className="px-2 py-1 align-middle whitespace-nowrap">
                                <div className="flex flex-wrap items-center justify-end gap-1.5">
                                  <button
                                    type="button"
                                    className="rounded bg-[var(--ok)] px-2 py-1 text-[11px] font-semibold text-[var(--bg)] disabled:opacity-50"
                                    disabled={busyId === d.id}
                                    onClick={() => void markPaid(d.id)}
                                  >
                                    {busyId === d.id ? "…" : "Paid"}
                                  </button>
                                  <button
                                    type="button"
                                    className="rounded px-1.5 py-1 text-[11px] text-[var(--accent)] hover:underline"
                                    onClick={() =>
                                      setExpandedId((id) => (id === d.id ? null : d.id))
                                    }
                                  >
                                    {expandedId === d.id ? "Hide" : "Detail"}
                                  </button>
                                </div>
                              </td>
                            </tr>
                            {expandedId === d.id ? (
                              <tr>
                                <td colSpan={5} className="border-t border-[var(--border)] bg-[var(--surface)]/80 px-2 py-3">
                                  <StatementDocumentDetail documentId={d.id} />
                                </td>
                              </tr>
                            ) : null}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
