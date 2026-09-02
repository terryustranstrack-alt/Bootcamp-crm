"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createClient } from "@/lib/supabase/client";
import { playBeep } from "@/lib/notificationSound";

const supabase = createClient();
const MUTE_KEY = "inbox-notifications-muted";

type NotificationPermissionState = NotificationPermission | "unsupported";

type InboxUnreadValue = {
  totalUnread: number;
  muted: boolean;
  setMuted: (value: boolean) => void;
  notificationPermission: NotificationPermissionState;
  requestNotificationPermission: () => void;
};

const InboxUnreadContext = createContext<InboxUnreadValue | null>(null);

// Dipakai NavMenu (badge angka) & InboxNotifier (tombol izin + mute). Kalau
// dipanggil di luar provider (mis. halaman login), balikin nilai default aman.
export function useInboxUnread(): InboxUnreadValue {
  return (
    useContext(InboxUnreadContext) ?? {
      totalUnread: 0,
      muted: true,
      setMuted: () => {},
      notificationPermission: "unsupported",
      requestNotificationPermission: () => {},
    }
  );
}

type UnreadRow = {
  id: string;
  unread_count: number;
  display_name: string | null;
  external_contact_id: string;
  last_message_preview: string | null;
};

// Satu langganan realtime "conversations" untuk seluruh aplikasi: hitung total
// pesan belum dibaca, dan tiap kali angka belum-dibaca sebuah percakapan naik,
// bunyikan beep + tampilkan notifikasi desktop (kalau diizinkan & tab tidak
// sedang aktif).
export default function InboxUnreadProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [totalUnread, setTotalUnread] = useState(0);
  const [muted, setMutedState] = useState(true);
  const [notificationPermission, setNotificationPermission] =
    useState<NotificationPermissionState>("unsupported");

  const mutedRef = useRef(true);
  const prevUnreadByConversation = useRef<Map<string, number>>(new Map());
  const firstLoadDone = useRef(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(MUTE_KEY) === "1";
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMutedState(stored);
      mutedRef.current = stored;
    } catch {
      // localStorage bisa diblokir — anggap tidak di-mute.
    }
    if (typeof Notification !== "undefined") {
      setNotificationPermission(Notification.permission);
    }
  }, []);

  function setMuted(value: boolean) {
    setMutedState(value);
    mutedRef.current = value;
    try {
      localStorage.setItem(MUTE_KEY, value ? "1" : "0");
    } catch {
      // abaikan
    }
  }

  function requestNotificationPermission() {
    if (typeof Notification === "undefined") return;
    Notification.requestPermission().then((permission) =>
      setNotificationPermission(permission),
    );
  }

  useEffect(() => {
    function notifyDesktop(row: UnreadRow) {
      if (
        typeof Notification === "undefined" ||
        Notification.permission !== "granted" ||
        !document.hidden
      ) {
        return;
      }
      const title = row.display_name || `+${row.external_contact_id}`;
      new Notification(`New WhatsApp message — ${title}`, {
        body: row.last_message_preview ?? "",
      });
    }

    async function load() {
      const { data } = await supabase
        .from("conversations")
        .select(
          "id, unread_count, display_name, external_contact_id, last_message_preview",
        );
      if (!data) return;
      const rows = data as UnreadRow[];

      let total = 0;
      let bumpedRow: UnreadRow | null = null;
      for (const row of rows) {
        total += row.unread_count;
        const previous = prevUnreadByConversation.current.get(row.id) ?? 0;
        if (firstLoadDone.current && row.unread_count > previous) {
          bumpedRow = row;
        }
        prevUnreadByConversation.current.set(row.id, row.unread_count);
      }
      setTotalUnread(total);

      // Jangan bunyikan apa pun di load pertama (itu unread lama, bukan baru).
      if (bumpedRow) {
        if (!mutedRef.current) playBeep();
        notifyDesktop(bumpedRow);
      }
      firstLoadDone.current = true;
    }

    load();
    const channel = supabase
      .channel("inbox-unread")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conversations" },
        () => load(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return (
    <InboxUnreadContext.Provider
      value={{
        totalUnread,
        muted,
        setMuted,
        notificationPermission,
        requestNotificationPermission,
      }}
    >
      {children}
    </InboxUnreadContext.Provider>
  );
}
