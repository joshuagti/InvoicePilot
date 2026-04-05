"use client";

export function SignOutButton() {
  return (
    <button
      type="button"
      className="text-sm text-[var(--muted)] hover:text-[var(--text)]"
      onClick={async () => {
        await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
        window.location.href = "/login";
      }}
    >
      Sign out
    </button>
  );
}
