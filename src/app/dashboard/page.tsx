import Dashboard from "@/components/Dashboard";
import ChatMetrics from "@/components/ChatMetrics";

// force-dynamic: data leads berubah-ubah, jangan di-cache statis oleh Next.js.
export const dynamic = "force-dynamic";

export default function DashboardPage() {
  return (
    <>
      <Dashboard />
      <ChatMetrics />
    </>
  );
}
