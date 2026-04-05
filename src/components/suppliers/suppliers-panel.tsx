"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useState } from "react";

type Rule = {
  id: string;
  ruleType: string;
  shouldCount: boolean | null;
  documentType: string | null;
  isActive: boolean;
  isUserConfirmed: boolean;
};

type Supplier = {
  id: string;
  name: string;
  paymentModel: string | null;
  domains: { domain: string }[];
  rules: Rule[];
  _count: { documents: number; reviewDecisions: number };
};

type Mailbox = {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  tls: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

const emptyForm = {
  name: "",
  host: "",
  port: "993",
  username: "",
  password: "",
  tls: true,
};

export function SuppliersPanel() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [mailboxes, setMailboxes] = useState<Mailbox[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [note, setNote] = useState<string | null>(null);
  const [noteTone, setNoteTone] = useState<"ok" | "danger">("ok");
  const [mailboxBusy, setMailboxBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedSupplierId, setExpandedSupplierId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    host: "",
    port: "993",
    username: "",
    password: "",
    tls: true,
    isActive: true,
  });

  const load = useCallback(async () => {
    const res = await fetch("/api/suppliers", { credentials: "include" });
    if (!res.ok) return;
    const data = (await res.json()) as { suppliers: Supplier[] };
    setSuppliers(data.suppliers);
  }, []);

  const loadMailboxes = useCallback(async () => {
    const res = await fetch("/api/mailboxes", { credentials: "include" });
    if (!res.ok) return;
    const data = (await res.json()) as { mailboxes: Mailbox[] };
    setMailboxes(data.mailboxes);
  }, []);

  useEffect(() => {
    void load();
    void loadMailboxes();
  }, [load, loadMailboxes]);

  function setMailboxMessage(text: string, tone: "ok" | "danger") {
    setNote(text);
    setNoteTone(tone);
  }

  async function addMailbox(e: React.FormEvent) {
    e.preventDefault();
    setMailboxBusy(true);
    setNote(null);
    const res = await fetch("/api/mailboxes", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        host: form.host,
        port: Number(form.port),
        username: form.username,
        password: form.password,
        tls: form.tls,
      }),
    });
    const body = (await res.json().catch(() => ({}))) as {
      error?: string;
      detail?: string;
    };
    setMailboxBusy(false);
    if (!res.ok) {
      const msg =
        res.status === 422 && body.detail
          ? `${body.error ?? "Error"}: ${body.detail}`
          : body.error ?? "Failed to save mailbox (check ENCRYPTION_KEY and fields)";
      setMailboxMessage(msg, "danger");
      return;
    }
    setMailboxMessage("Mailbox saved", "ok");
    setForm({ ...emptyForm });
    await loadMailboxes();
  }

  function startEdit(mb: Mailbox) {
    setEditingId(mb.id);
    setEditForm({
      name: mb.name,
      host: mb.host,
      port: String(mb.port),
      username: mb.username,
      password: "",
      tls: mb.tls,
      isActive: mb.isActive,
    });
    setNote(null);
  }

  function cancelEdit() {
    setEditingId(null);
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingId) return;
    setMailboxBusy(true);
    setNote(null);
    const payload: Record<string, unknown> = {
      name: editForm.name,
      host: editForm.host,
      port: Number(editForm.port),
      username: editForm.username,
      tls: editForm.tls,
      isActive: editForm.isActive,
    };
    if (editForm.password.length > 0) {
      payload.password = editForm.password;
    }
    const res = await fetch(`/api/mailboxes/${editingId}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = (await res.json().catch(() => ({}))) as {
      error?: string;
      detail?: string;
    };
    setMailboxBusy(false);
    if (!res.ok) {
      const msg =
        res.status === 422 && body.detail
          ? `${body.error ?? "Error"}: ${body.detail}`
          : typeof body.error === "string"
            ? body.error
            : "Failed to update mailbox";
      setMailboxMessage(msg, "danger");
      return;
    }
    setMailboxMessage("Mailbox updated", "ok");
    setEditingId(null);
    await loadMailboxes();
  }

  async function removeMailbox(id: string) {
    if (!window.confirm("Remove this email account? If it already has ingested mail, it will be disabled instead of deleted.")) {
      return;
    }
    setMailboxBusy(true);
    setNote(null);
    const res = await fetch(`/api/mailboxes/${id}`, {
      method: "DELETE",
      credentials: "include",
    });
    const body = (await res.json().catch(() => ({}))) as {
      error?: string;
      mode?: "deleted" | "deactivated";
    };
    setMailboxBusy(false);
    if (!res.ok) {
      setMailboxMessage(body.error ?? "Failed to remove mailbox", "danger");
      return;
    }
    if (body.mode === "deactivated") {
      setMailboxMessage("Account was disabled (it has ingested email). You can restore it by editing and enabling.", "ok");
    } else {
      setMailboxMessage("Mailbox removed", "ok");
    }
    if (editingId === id) setEditingId(null);
    await loadMailboxes();
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        {note && (
          <p
            className={`rounded border px-2 py-1.5 text-xs ${
              noteTone === "ok"
                ? "border-[var(--ok)]/40 bg-[var(--ok)]/10 text-[var(--ok)]"
                : "border-[var(--danger)]/40 bg-[var(--danger)]/10 text-[var(--danger)]"
            }`}
          >
            {note}
          </p>
        )}
        <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
        <h2 className="text-lg font-medium">Email accounts</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          IMAP mailboxes used to ingest messages. Inactive accounts are not polled.
        </p>
        {mailboxes.length === 0 ? (
          <p className="mt-4 text-sm text-[var(--muted)]">No email accounts yet.</p>
        ) : (
          <ul className="mt-4 flex flex-col gap-3">
            {mailboxes.map((mb) => (
              <li
                key={mb.id}
                className="rounded border border-[var(--border)] bg-[var(--bg)] p-3 text-sm"
              >
                {editingId === mb.id ? (
                  <form onSubmit={saveEdit} className="grid max-w-lg grid-cols-1 gap-3">
                    <label className="flex flex-col gap-1">
                      <span className="text-[var(--muted)]">Name</span>
                      <input
                        className="rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1"
                        value={editForm.name}
                        onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                        required
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-[var(--muted)]">Host</span>
                      <input
                        className="rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1"
                        value={editForm.host}
                        onChange={(e) => setEditForm({ ...editForm, host: e.target.value })}
                        required
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-[var(--muted)]">Port</span>
                      <input
                        className="rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1"
                        value={editForm.port}
                        onChange={(e) => setEditForm({ ...editForm, port: e.target.value })}
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-[var(--muted)]">Username</span>
                      <input
                        className="rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1"
                        value={editForm.username}
                        onChange={(e) => setEditForm({ ...editForm, username: e.target.value })}
                        required
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-[var(--muted)]">Password (leave blank to keep current)</span>
                      <input
                        type="password"
                        className="rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1"
                        value={editForm.password}
                        onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
                        autoComplete="new-password"
                      />
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={editForm.tls}
                        onChange={(e) => setEditForm({ ...editForm, tls: e.target.checked })}
                      />
                      TLS
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={editForm.isActive}
                        onChange={(e) => setEditForm({ ...editForm, isActive: e.target.checked })}
                      />
                      Active (poll this mailbox)
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="submit"
                        disabled={mailboxBusy}
                        className="rounded bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                      >
                        Save changes
                      </button>
                      <button
                        type="button"
                        disabled={mailboxBusy}
                        onClick={cancelEdit}
                        className="rounded border border-[var(--border)] px-3 py-2 text-sm"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{mb.name}</span>
                        {!mb.isActive && (
                          <span className="rounded bg-[var(--border)] px-2 py-0.5 text-xs">Inactive</span>
                        )}
                      </div>
                      <p className="mt-1 text-[var(--muted)]">
                        {mb.username} @ {mb.host}:{mb.port} · TLS: {mb.tls ? "yes" : "no"}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <button
                        type="button"
                        disabled={mailboxBusy}
                        onClick={() => startEdit(mb)}
                        className="rounded border border-[var(--border)] px-3 py-1.5 text-sm disabled:opacity-50"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        disabled={mailboxBusy}
                        onClick={() => void removeMailbox(mb.id)}
                        className="rounded border border-[var(--danger)] px-3 py-1.5 text-sm text-[var(--danger)] disabled:opacity-50"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        </section>

        <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
        <h2 className="text-lg font-medium">Add IMAP mailbox</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Credentials are tested before save. Passwords are stored encrypted. Requires ENCRYPTION_KEY in the environment.
        </p>
        <form onSubmit={addMailbox} className="mt-4 grid max-w-lg grid-cols-1 gap-3 text-sm">
          <label className="flex flex-col gap-1">
            <span className="text-[var(--muted)]">Name</span>
            <input
              className="rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[var(--muted)]">Host</span>
            <input
              className="rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1"
              value={form.host}
              onChange={(e) => setForm({ ...form, host: e.target.value })}
              required
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[var(--muted)]">Port</span>
            <input
              className="rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1"
              value={form.port}
              onChange={(e) => setForm({ ...form, port: e.target.value })}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[var(--muted)]">Username</span>
            <input
              className="rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1"
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              required
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[var(--muted)]">Password</span>
            <input
              type="password"
              className="rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required
            />
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.tls}
              onChange={(e) => setForm({ ...form, tls: e.target.checked })}
            />
            TLS
          </label>
          <button
            type="submit"
            disabled={mailboxBusy}
            className="rounded bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            Test connection & save
          </button>
        </form>
        </section>
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">Suppliers</h2>
        {suppliers.length === 0 ? (
          <p className="rounded border border-dashed border-[var(--border)] bg-[var(--surface)]/40 px-3 py-6 text-center text-sm text-[var(--muted)]">
            No suppliers yet. They appear as mail is ingested and matched.
          </p>
        ) : (
          <div className="rounded-lg border border-[var(--border)]">
            <table className="w-full table-fixed text-left text-xs">
              <colgroup>
                <col className="w-[18%]" />
                <col className="w-[14%]" />
                <col className="w-[8%]" />
                <col className="w-[32%]" />
                <col className="w-[18%]" />
                <col className="w-[10%]" />
              </colgroup>
              <thead className="bg-[var(--surface)] text-[var(--muted)]">
                <tr className="border-b border-[var(--border)]">
                  <th className="px-2 py-1.5 font-medium">Supplier</th>
                  <th className="px-2 py-1.5 font-medium">Payment</th>
                  <th className="px-2 py-1.5 font-medium">Docs</th>
                  <th className="px-2 py-1.5 font-medium">Domains</th>
                  <th className="px-2 py-1.5 font-medium">Rules</th>
                  <th className="px-2 py-1.5 text-right font-medium">Spend</th>
                </tr>
              </thead>
              <tbody>
                {suppliers.map((s) => {
                  const domainsLine = s.domains.map((d) => d.domain).join(", ") || "—";
                  return (
                    <Fragment key={s.id}>
                      <tr className="border-t border-[var(--border)] hover:bg-[var(--surface)]/50">
                        <td className="px-2 py-1 align-middle font-medium">{s.name}</td>
                        <td className="px-2 py-1 align-middle text-[var(--muted)]">
                          {s.paymentModel ?? "—"}
                        </td>
                        <td className="px-2 py-1 align-middle tabular-nums text-[var(--muted)]">
                          {s._count.documents}
                        </td>
                        <td className="max-w-0 px-2 py-1 align-middle">
                          <span className="block truncate" title={domainsLine !== "—" ? domainsLine : undefined}>
                            {domainsLine}
                          </span>
                        </td>
                        <td className="px-2 py-1 align-middle">
                          <div className="flex flex-wrap items-center justify-between gap-1">
                            <span className="text-[var(--muted)]">
                              {s.rules.length === 0 ? "—" : `${s.rules.length}`}
                            </span>
                            {s.rules.length > 0 ? (
                              <button
                                type="button"
                                className="rounded px-1.5 py-1 text-[11px] text-[var(--accent)] hover:underline"
                                onClick={() =>
                                  setExpandedSupplierId((id) => (id === s.id ? null : s.id))
                                }
                              >
                                {expandedSupplierId === s.id ? "Hide" : "Detail"}
                              </button>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-2 py-1 align-middle text-right whitespace-nowrap">
                          <Link
                            href={`/dashboard/suppliers/${s.id}/spend`}
                            className="font-medium text-[var(--accent)] hover:underline"
                          >
                            Spend
                          </Link>
                        </td>
                      </tr>
                      {expandedSupplierId === s.id && s.rules.length > 0 ? (
                        <tr>
                          <td
                            colSpan={6}
                            className="border-t border-[var(--border)] bg-[var(--surface)]/80 px-2 py-3"
                          >
                            <ul className="list-inside list-disc text-sm text-[var(--text)]">
                              {s.rules.map((r) => (
                                <li key={r.id}>
                                  {r.ruleType}
                                  {r.documentType ? ` · ${r.documentType}` : ""} · shouldCount:{" "}
                                  {r.shouldCount === null ? "—" : String(r.shouldCount)} · confirmed:{" "}
                                  {r.isUserConfirmed ? "yes" : "no"}
                                </li>
                              ))}
                            </ul>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
