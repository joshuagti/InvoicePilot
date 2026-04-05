import { StatementsList } from "@/components/statements/statements-list";

export default function StatementsPage() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Statements & documents</h1>
        <p className="text-sm text-[var(--muted)]">
          All ingested documents. Use “Poll mail now” to fetch new messages from configured mailboxes.
        </p>
      </div>
      <StatementsList />
    </div>
  );
}
