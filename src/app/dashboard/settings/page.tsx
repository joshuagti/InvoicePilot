import { ReprocessAiButton } from "@/components/dashboard/reprocess-ai-button";

export default function SettingsPage() {
  return (
    <div className="flex max-w-xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Tools that affect how stored data is interpreted. Reprocessing uses the same AI step as mail
          ingestion, using the email body and any extracted attachment text already saved in the database.
        </p>
      </div>

      <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
        <h2 className="text-sm font-medium text-[var(--text)]">AI extraction</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Re-run classification and field extraction for stored emails. Useful after changing models,
          prompts, or supplier rules. Processes up to 100 of the most recent emails per run (one API call
          per email that passes the candidate filter). If an email no longer passes the candidate filter,
          its documents are removed. Existing paid flags on a document are kept when the row is updated.
        </p>
        <div className="mt-4">
          <ReprocessAiButton />
        </div>
      </section>
    </div>
  );
}
