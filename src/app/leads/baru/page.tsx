import Link from "next/link";
import LeadForm from "@/components/LeadForm";

export const dynamic = "force-dynamic";

export default function TambahLeadPage() {
  return (
    <main className="p-8">
      <Link
        href="/"
        className="text-sm text-gray-500 hover:underline inline-block mb-4"
      >
        ← Kembali ke Board
      </Link>
      <h1 className="text-xl font-semibold mb-6">Tambah Lead Baru</h1>
      <LeadForm />
    </main>
  );
}
