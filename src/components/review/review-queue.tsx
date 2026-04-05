"use client";

import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";

type Row = {
  id: string;
  countDecision: string;
  reviewState: string;
  documentType: string | null;
  paymentModelGuess: string | null;
  supplierNameRaw: string | null;
  amountDue: string | null;
  dueDate: string | null;
  aiConfidence: string | null;
  unsureReason: string | null;
  aiReason: string | null;
  extractionJson: unknown;
  email: {
    subject: string | null;
    fromEmail: string | null;
    receivedAt: string | null;
    textBody: string | null;
    normalizedText: string | null;
  };
  supplier: { id: string; name: string; paymentModel: string | null } | null;
  attachments: Array<{
    id: string;
    filename: string | null;
    extractedText: string | null;
  }>;
};

export function ReviewQueue() {
  const [rows, setRows] = useState<Row[]>([]);
  const [selected, setSelected] = useState<Row | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [decisionScope, setDecisionScope] = useState<"email_only" | "pattern_rule" | "supplier_rule">(
    "email_only"
  );
  const [note, setNote] = useState("");
  const [paymentModel, setPaymentModel] = useState<string>("");
  const [neverInv, setNeverInv] = useState(false);
  const [alwaysStmt, setAlwaysStmt] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/statements/review", { credentials: "include" });
    if (!res.ok) {
      setError("Failed to load queue");
      setLoading(false);
      return;
    }
    const data = (await res.json()) as { documents: Row[] };
    setRows(data.documents);
    setSelected((s) => data.documents.find((d) => d.id === s?.id) ?? data.documents[0] ?? null);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function submit(action: "count" | "do_not_count" | "ignore" | "mark_reviewed") {
    if (!selected) return;
    setMsg(null);
    const body: Record<string, unknown> = {
      documentId: selected.id,
      action,
      decisionScope,
      userNote: note || undefined,
    };
    if (paymentModel) {
      body.setPaymentModel = paymentModel;
    }
    if (neverInv) body.neverCountInvoices = true;
    if (alwaysStmt) body.alwaysCountMonthlyStatements = true;

    const res = await fetch("/api/statements/review", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      setMsg("Save failed");
      return;
    }
    const out = (await res.json()) as { suggestion?: { message: string | null } };
    if (out.suggestion?.message) setMsg(out.suggestion.message);
    setNote("");
    setNeverInv(false);
    setAlwaysStmt(false);
    await load();
  }

  function fmtDate(s: string | null | undefined) {
    if (!s) return "—";
    try {
      return format(new Date(s), "yyyy-MM-dd HH:mm");
    } catch {
      return s;
    }
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_36rem]">
      <div className="min-w-0 overflow-x-auto rounded-lg border border-[var(--border)]">
        <table className="w-full table-fixed text-left text-sm">
          <colgroup>
            <col className="w-[12%]" />
            <col className="w-[18%]" />
            <col className="w-[18%]" />
            <col className="w-[22%]" />
            <col className="w-[10%]" />
            <col className="w-[10%]" />
            <col className="w-[10%]" />
          </colgroup>
          <thead className="bg-[var(--surface)] text-[var(--muted)]">
            <tr>
              <th className="px-3 py-2">Received</th>
              <th className="px-3 py-2">Supplier</th>
              <th className="px-3 py-2">Sender</th>
              <th className="px-3 py-2">Subject</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">Amount</th>
              <th className="px-3 py-2">Decision</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-[var(--muted)]">
                  Loading…
                </td>
              </tr>
            )}
            {error && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-[var(--danger)]">
                  {error}
                </td>
              </tr>
            )}
            {!loading &&
              rows.map((r) => (
                <tr
                  key={r.id}
                  className={
                    "cursor-pointer border-t border-[var(--border)] hover:bg-[var(--surface)] " +
                    (selected?.id === r.id ? "bg-[var(--surface)]" : "")
                  }
                  onClick={() => setSelected(r)}
                >
                  <td className="px-3 py-2 whitespace-nowrap">{fmtDate(r.email.receivedAt)}</td>
                  <td className="max-w-0 truncate px-3 py-2">
                    {r.supplier?.name ?? r.supplierNameRaw ?? "—"}
                  </td>
                  <td className="max-w-0 truncate px-3 py-2">{r.email.fromEmail ?? "—"}</td>
                  <td className="max-w-0 truncate px-3 py-2">{r.email.subject ?? "—"}</td>
                  <td className="max-w-0 truncate px-3 py-2">{r.documentType ?? "—"}</td>
                  <td className="max-w-0 truncate px-3 py-2">{r.amountDue ?? "—"}</td>
                  <td className="max-w-0 truncate px-3 py-2">{r.countDecision}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col gap-4 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
        {!selected && <p className="text-sm text-[var(--muted)]">Select a row</p>}
        {selected && (
          <>
            <div>
              <h2 className="text-lg font-medium">Detail</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">
                {selected.email.subject ?? "(no subject)"}
              </p>
              <p className="text-sm">
                From: {selected.email.fromEmail ?? "—"} · Received: {fmtDate(selected.email.receivedAt)}
              </p>
            </div>
            <div className="text-sm">
              <p>
                <span className="text-[var(--muted)]">Document type:</span> {selected.documentType ?? "—"}
              </p>
              <p>
                <span className="text-[var(--muted)]">Payment model (guess):</span>{" "}
                {selected.paymentModelGuess ?? "—"}
              </p>
              <p>
                <span className="text-[var(--muted)]">Confidence:</span> {selected.aiConfidence ?? "—"}
              </p>
              <p className="mt-2 text-[var(--muted)]">Reason</p>
              <p>{selected.aiReason ?? "—"}</p>
              <p className="mt-2 text-[var(--muted)]">Unsure</p>
              <p>{selected.unsureReason ?? "—"}</p>
            </div>
            <div>
              <p className="text-sm text-[var(--muted)]">Attachments</p>
              <ul className="list-inside list-disc text-sm">
                {selected.attachments.map((a) => (
                  <li key={a.id}>{a.filename ?? a.id}</li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-sm text-[var(--muted)]">Body excerpt</p>
              <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded bg-[var(--bg)] p-2 text-xs">
                {(selected.email.textBody ?? selected.email.normalizedText ?? "").slice(0, 4000)}
              </pre>
            </div>
            <div>
              <p className="text-sm text-[var(--muted)]">Extraction JSON</p>
              <pre className="max-h-48 overflow-auto rounded bg-[var(--bg)] p-2 text-xs">
                {JSON.stringify(selected.extractionJson, null, 2)}
              </pre>
            </div>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-[var(--muted)]">Decision scope</span>
              <select
                className="rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1"
                value={decisionScope}
                onChange={(e) =>
                  setDecisionScope(e.target.value as "email_only" | "pattern_rule" | "supplier_rule")
                }
              >
                <option value="email_only">This email only</option>
                <option value="pattern_rule">Pattern rule</option>
                <option value="supplier_rule">Supplier rule</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-[var(--muted)]">Set supplier payment model (optional)</span>
              <select
                className="rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1"
                value={paymentModel}
                onChange={(e) => setPaymentModel(e.target.value)}
              >
                <option value="">—</option>
                <option value="monthly_account">Monthly account</option>
                <option value="pay_per_order">Pay per order</option>
                <option value="mixed">Mixed</option>
                <option value="unknown">Unknown</option>
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={neverInv} onChange={(e) => setNeverInv(e.target.checked)} />
              Never count invoices from this supplier
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={alwaysStmt} onChange={(e) => setAlwaysStmt(e.target.checked)} />
              Always count monthly statements from this supplier
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-[var(--muted)]">Note (optional)</span>
              <textarea
                className="min-h-[60px] rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </label>
            {msg && <p className="text-sm text-[var(--ok)]">{msg}</p>}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded bg-[var(--ok)] px-3 py-1.5 text-sm font-medium text-black"
                onClick={() => void submit("count")}
              >
                Count this
              </button>
              <button
                type="button"
                className="rounded bg-[var(--danger)] px-3 py-1.5 text-sm font-medium text-white"
                onClick={() => void submit("do_not_count")}
              >
                Do not count
              </button>
              <button
                type="button"
                className="rounded border border-[var(--border)] px-3 py-1.5 text-sm"
                onClick={() => void submit("ignore")}
              >
                Ignore
              </button>
              <button
                type="button"
                className="rounded border border-[var(--border)] px-3 py-1.5 text-sm"
                onClick={() => void submit("mark_reviewed")}
              >
                Mark reviewed
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
