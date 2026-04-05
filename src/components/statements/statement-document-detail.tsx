"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";

type EmailDetail = {
  id: string;
  subject: string | null;
  fromName: string | null;
  fromEmail: string | null;
  senderDomain: string | null;
  sentAt: string | null;
  receivedAt: string | null;
  textBody: string | null;
  htmlBody: string | null;
  normalizedText: string | null;
  hasAttachments: boolean;
};

type DocumentDetail = {
  id: string;
  documentType: string | null;
  supplierNameRaw: string | null;
  accountReference: string | null;
  documentDate: string | null;
  dueDate: string | null;
  currency: string | null;
  amountDue: string | null;
  extractionJson: unknown;
  paidAt: string | null;
  paidNote: string | null;
  email: EmailDetail;
  primaryAttachment: {
    id: string;
    filename: string | null;
    contentType: string | null;
    extractedText: string | null;
  } | null;
};

function ExtractionView({ json }: { json: unknown }) {
  if (json === null || json === undefined) {
    return <p className="text-sm text-[var(--muted)]">No extraction JSON stored.</p>;
  }
  const o = json as Record<string, unknown>;
  const keys = [
    "supplierName",
    "documentType",
    "paymentModelGuess",
    "shouldCount",
    "accountReference",
    "documentDate",
    "dueDate",
    "amountDue",
    "currency",
    "confidence",
    "reason",
    "unsureReason",
    "needsReview",
  ];
  return (
    <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
      {keys.map((k) =>
        o[k] !== undefined && o[k] !== null && o[k] !== "" ? (
          <div key={k} className="flex flex-col gap-0.5">
            <dt className="text-[var(--muted)]">{k}</dt>
            <dd className="break-words font-mono text-xs text-[var(--text)]">
              {typeof o[k] === "object" ? JSON.stringify(o[k]) : String(o[k])}
            </dd>
          </div>
        ) : null
      )}
    </dl>
  );
}

export function StatementDocumentDetail({ documentId }: { documentId: string }) {
  const [doc, setDoc] = useState<DocumentDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setDoc(null);
    setErr(null);
    void (async () => {
      const res = await fetch(`/api/statements/${documentId}`, { credentials: "include" });
      if (!res.ok) {
        if (!cancelled) setErr("Could not load document");
        return;
      }
      const data = (await res.json()) as { document: DocumentDetail };
      if (!cancelled) setDoc(data.document);
    })();
    return () => {
      cancelled = true;
    };
  }, [documentId]);

  if (err) {
    return <p className="text-sm text-[var(--danger)]">{err}</p>;
  }
  if (!doc) {
    return <p className="text-sm text-[var(--muted)]">Loading…</p>;
  }

  const bodyPreview = doc.email.textBody ?? doc.email.normalizedText ?? "";
  const truncated =
    bodyPreview.length > 12000 ? `${bodyPreview.slice(0, 12000)}\n\n… (truncated for display)` : bodyPreview;

  return (
    <div className="flex flex-col gap-4 border-t border-[var(--border)] pt-4 text-sm">
      <div>
        <h4 className="font-medium text-[var(--text)]">Extracted data</h4>
        <div className="mt-2 rounded border border-[var(--border)] bg-[var(--bg)] p-3">
          <ExtractionView json={doc.extractionJson} />
        </div>
      </div>

      <div>
        <h4 className="font-medium text-[var(--text)]">Email</h4>
        <dl className="mt-2 grid gap-1 text-xs text-[var(--muted)]">
          <div>
            <span className="text-[var(--muted)]">Subject: </span>
            {doc.email.subject ?? "—"}
          </div>
          <div>
            <span className="text-[var(--muted)]">From: </span>
            {doc.email.fromName ?? ""} {doc.email.fromEmail ? `<${doc.email.fromEmail}>` : ""}
          </div>
          <div>
            <span className="text-[var(--muted)]">Received: </span>
            {doc.email.receivedAt
              ? format(new Date(doc.email.receivedAt), "yyyy-MM-dd HH:mm")
              : "—"}
          </div>
          {doc.paidAt && (
            <div>
              <span className="text-[var(--muted)]">Marked paid: </span>
              {format(new Date(doc.paidAt), "yyyy-MM-dd HH:mm")}
              {doc.paidNote ? ` · ${doc.paidNote}` : ""}
            </div>
          )}
        </dl>
        <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded border border-[var(--border)] bg-[var(--bg)] p-3 text-xs text-[var(--text)]">
          {truncated || "— (no plain text body)"}
        </pre>
      </div>

      {doc.primaryAttachment?.extractedText ? (
        <div>
          <h4 className="font-medium text-[var(--text)]">
            Primary attachment: {doc.primaryAttachment.filename ?? "file"}
          </h4>
          <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded border border-[var(--border)] bg-[var(--bg)] p-3 text-xs">
            {doc.primaryAttachment.extractedText.slice(0, 8000)}
            {doc.primaryAttachment.extractedText.length > 8000 ? "\n…" : ""}
          </pre>
        </div>
      ) : null}
    </div>
  );
}
