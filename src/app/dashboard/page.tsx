import Dashboard from "@/components/Dashboard";

// force-dynamic: data leads berubah-ubah, jangan di-cache statis oleh Next.js.
export const dynamic = "force-dynamic";

export default function DashboardPage() {
  return <Dashboard />;
}
