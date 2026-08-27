import LeadDetail from "@/components/LeadDetail";

// force-dynamic: data lead berubah-ubah, jangan di-cache statis oleh Next.js.
export const dynamic = "force-dynamic";

// Halaman detail lead di URL "/leads/<id>" — ambil id dari URL, teruskan
// ke komponen LeadDetail yang mengurus pengambilan datanya.
export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <LeadDetail leadId={id} />;
}
