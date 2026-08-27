import Link from "next/link";
import LeadBoard from "@/components/LeadBoard";

export const dynamic = "force-dynamic";

// Halaman utama ("/"): papan Kanban leads (LeadBoard) + tombol tambah lead.
export default function Home() {
  return (
    <main className="flex flex-col flex-1">
      <div className="flex items-center justify-between px-8 pt-8">
        <h1 className="text-xl font-semibold">Lead Pipeline</h1>
        <Link
          href="/leads/baru"
          className="bg-black text-white rounded px-4 py-2 text-sm"
        >
          + Add Lead
        </Link>
      </div>
      <LeadBoard />
    </main>
  );
}
