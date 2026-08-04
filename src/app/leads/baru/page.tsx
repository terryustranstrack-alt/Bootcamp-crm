import LeadForm from "@/components/LeadForm";

export const dynamic = "force-dynamic";

export default function TambahLeadPage() {
  return (
    <main className="p-8">
      <h1 className="text-xl font-semibold mb-6">Tambah Lead Baru</h1>
      <LeadForm />
    </main>
  );
}
