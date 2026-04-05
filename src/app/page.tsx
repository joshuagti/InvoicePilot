import Image from "next/image";
import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-16">
      <h1 className="m-0">
        <Image
          src="/logo.svg"
          alt="InvoicePilot"
          width={200}
          height={40}
          className="h-10 w-auto"
          unoptimized
          priority
        />
      </h1>
      <p className="text-[var(--muted)]">
        Human-in-the-loop triage for supplier statements and invoices. Sign in to open the dashboard.
      </p>
      <div className="flex gap-4">
        <Link
          className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white"
          href="/login"
        >
          Sign in
        </Link>
        <Link className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm" href="/dashboard/review">
          Dashboard
        </Link>
      </div>
    </main>
  );
}
