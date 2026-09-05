import Link from "next/link";
import LeadForm from "@/components/LeadForm";

// force-dynamic: form ini butuh data live (opsi sumber/assignee terbaru), jangan di-cache.
export const dynamic = "force-dynamic";

// Halaman "Add New Lead" di URL "/leads/baru".
export default function TambahLeadPage() {
  return (
    <main className="p-8">
      <Link
        href="/"
        className="text-sm text-[var(--color-muted)] hover:text-foreground hover:underline inline-block mb-4"
      >
        ← Back to Board
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight mb-6">Add New Lead</h1>
      <LeadForm />
    </main>
  );
}
