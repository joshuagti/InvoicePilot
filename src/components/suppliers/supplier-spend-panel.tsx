"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { StatementDocumentDetail } from "@/components/statements/statement-document-detail";

type DocRow = {
  id: string;
  documentType: string | null;
  documentDate: string | null;
  dueDate: string | null;
  currency: string | null;
  amountDue: string | null;
  paidAt: string | null;
  paidNote: string | null;
  email: { subject: string | null; receivedAt: string | null };
};

type Monthly = { month: string; total: string; currency: string | null };

function formatMoney(amount: string | null, currency: string | null) {
  if (amount == null) return "—";
  const c = currency?.trim();
  return c ? `${c} ${amount}` : amount;
}

export function SupplierSpendPanel({ supplierId }: { supplierId: string }) {
  const [supplierName, setSupplierName] = useState<string>("");
  const [documents, setDocuments] = useState<DocRow[]>([]);
  const [monthlyTotals, setMonthlyTotals] = useState<Monthly[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    const res = await fetch(`/api/suppliers/${supplierId}/documents`, { credentials: "include" });
    if (!res.ok) {
      setErr(res.status === 404 ? "Supplier not found" : "Could not load spend data");
      return;
    }
    const data = (await res.json()) as {
      supplier: { name: string };
      documents: DocRow[];
      monthlyTotals: Monthly[];
    };
    setSupplierName(data.supplier.name);
    setDocuments(data.documents);
    setMonthlyTotals(data.monthlyTotals);
  }, [supplierId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function unmark(documentId: string) {
    setBusyId(documentId);
    const res = await fetch("/api/statements/unmark-paid", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentId }),
    });
    setBusyId(null);
    if (!res.ok) return;
    if (expandedId === documentId) setExpandedId(null);
    await load();
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-baseline gap-3">
        <Link href="/dashboard/suppliers" className="text-sm text-[var(--accent)]">
          ← Suppliers
        </Link>
      </div>
      {err && <p className="text-sm text-[var(--danger)]">{err}</p>}
      {!err && (
        <>
          <div>
            <h1 className="text-2xl font-semibold">{supplierName || "Spend"}</h1>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Counted documents with amounts over time. Monthly totals group by currency when it differs.
            </p>
          </div>

          <section>
            <h2 className="text-lg font-medium">Monthly totals</h2>
            {monthlyTotals.length === 0 ? (
              <p className="mt-2 text-sm text-[var(--muted)]">No dated amounts yet.</p>
            ) : (
              <div className="mt-2 overflow-x-auto rounded-lg border border-[var(--border)]">
                <table className="w-full min-w-[360px] text-left text-sm">
                  <thead className="bg-[var(--surface)] text-[var(--muted)]">
                    <tr>
                      <th className="px-3 py-2">Month</th>
                      <th className="px-3 py-2">Currency</th>
                      <th className="px-3 py-2">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthlyTotals.map((m, i) => (
                      <tr key={`${m.month}-${m.currency ?? "x"}-${i}`} className="border-t border-[var(--border)]">
                        <td className="px-3 py-2">{m.month}</td>
                        <td className="px-3 py-2">{m.currency ?? "—"}</td>
                        <td className="px-3 py-2">{m.total}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section>
            <h2 className="text-lg font-medium">Documents</h2>
            {documents.length === 0 ? (
              <p className="mt-2 text-sm text-[var(--muted)]">No counted documents with amounts.</p>
            ) : (
              <div className="mt-2 overflow-x-auto rounded-lg border border-[var(--border)]">
                <table className="w-full min-w-[800px] text-left text-sm">
                  <thead className="bg-[var(--surface)] text-[var(--muted)]">
                    <tr>
                      <th className="px-3 py-2">Date</th>
                      <th className="px-3 py-2">Type</th>
                      <th className="px-3 py-2">Amount</th>
                      <th className="px-3 py-2">Paid</th>
                      <th className="px-3 py-2">Subject</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {documents.map((d) => (
                      <Fragment key={d.id}>
                        <tr className="border-t border-[var(--border)]">
                          <td className="px-3 py-2 whitespace-nowrap">
                            {d.documentDate
                              ? format(new Date(d.documentDate), "yyyy-MM-dd")
                              : d.email.receivedAt
                                ? format(new Date(d.email.receivedAt), "yyyy-MM-dd")
                                : "—"}
                          </td>
                          <td className="px-3 py-2">{d.documentType ?? "—"}</td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            {formatMoney(d.amountDue, d.currency)}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap text-xs">
                            {d.paidAt ? (
                              <span>
                                {format(new Date(d.paidAt), "yyyy-MM-dd HH:mm")}
                                {d.paidNote ? ` · ${d.paidNote}` : ""}
                              </span>
                            ) : (
                              <span className="text-[var(--muted)]">Unpaid</span>
                            )}
                          </td>
                          <td className="px-3 py-2 max-w-[200px] truncate">{d.email.subject ?? "—"}</td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            <div className="flex flex-wrap gap-2">
                              {d.paidAt ? (
                                <button
                                  type="button"
                                  className="rounded border border-[var(--border)] px-2 py-1 text-xs disabled:opacity-50"
                                  disabled={busyId === d.id}
                                  onClick={() => void unmark(d.id)}
                                >
                                  Unmark paid
                                </button>
                              ) : null}
                              <button
                                type="button"
                                className="text-xs text-[var(--accent)]"
                                onClick={() => setExpandedId((id) => (id === d.id ? null : d.id))}
                              >
                                {expandedId === d.id ? "Hide" : "Detail"}
                              </button>
                            </div>
                          </td>
                        </tr>
                        {expandedId === d.id ? (
                          <tr>
                            <td colSpan={6} className="bg-[var(--surface)] px-3 py-4">
                              <StatementDocumentDetail documentId={d.id} />
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
