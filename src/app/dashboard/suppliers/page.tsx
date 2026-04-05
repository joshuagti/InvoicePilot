import { SuppliersPanel } from "@/components/suppliers/suppliers-panel";

export default function SuppliersPage() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Suppliers & mailboxes</h1>
        <p className="text-sm leading-relaxed text-[var(--muted)]">
          Supplier profiles, domains, and rules learned from your confirmations. Email accounts below are used
          to ingest mail. Open <span className="text-[var(--text)]">Spend</span> for amounts over time.
        </p>
      </div>
      <SuppliersPanel />
    </div>
  );
}
