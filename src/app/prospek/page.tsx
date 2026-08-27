import ProspekTable from "@/components/ProspekTable";

// force-dynamic: data leads berubah-ubah, jangan di-cache statis oleh Next.js.
export const dynamic = "force-dynamic";

export default function ProspekPage() {
  return <ProspekTable />;
}
