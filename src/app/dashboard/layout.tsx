import { DashboardNav } from "@/components/dashboard/nav";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <DashboardNav />
      <div className="mx-auto w-full max-w-[min(100%,1920px)] px-4 py-6">{children}</div>
    </div>
  );
}
