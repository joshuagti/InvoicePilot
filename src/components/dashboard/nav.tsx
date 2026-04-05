import Image from "next/image";
import Link from "next/link";
import { SignOutButton } from "@/components/dashboard/sign-out";

const links = [
  { href: "/dashboard/review", label: "Review queue" },
  { href: "/dashboard/payables", label: "Payables" },
  { href: "/dashboard/statements", label: "Statements" },
  { href: "/dashboard/suppliers", label: "Suppliers" },
  { href: "/dashboard/settings", label: "Settings" },
];

export function DashboardNav() {
  return (
    <header className="border-b border-[var(--border)] bg-[var(--surface)]">
      <div className="mx-auto flex w-full max-w-[min(100%,1920px)] flex-wrap items-center justify-between gap-4 px-4 py-3">
        <Link href="/dashboard/review" className="inline-flex items-center">
          <Image
            src="/logo.svg"
            alt="InvoicePilot"
            width={160}
            height={32}
            className="h-8 w-auto"
            unoptimized
            priority
          />
        </Link>
        <nav className="flex flex-wrap gap-4 text-sm">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="text-[var(--muted)] hover:text-[var(--text)]">
              {l.label}
            </Link>
          ))}
        </nav>
        <SignOutButton />
      </div>
    </header>
  );
}
