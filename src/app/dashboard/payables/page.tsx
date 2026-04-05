import { PayablesPanel } from "@/components/payables/payables-panel";

export default function PayablesPage() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Payables</h1>
        <p className="text-sm leading-relaxed text-[var(--muted)]">
          Unpaid items by supplier in a compact table. Optional note per row, then <span className="text-[var(--text)]">Paid</span>{" "}
          when confirmed. Use <span className="text-[var(--text)]">Detail</span> for the email and extraction.
        </p>
      </div>
      <PayablesPanel />
    </div>
  );
}
