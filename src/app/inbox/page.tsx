import InboxView from "@/components/InboxView";

// force-dynamic: percakapan/pesan WhatsApp masuk real-time, jangan di-cache statis.
export const dynamic = "force-dynamic";

export default function InboxPage() {
  return <InboxView />;
}
