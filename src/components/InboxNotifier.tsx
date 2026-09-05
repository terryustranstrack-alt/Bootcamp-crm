"use client";

import { useInboxUnread } from "@/components/InboxUnreadProvider";

// Kontrol kecil di header: minta izin notifikasi desktop (sekali) & toggle
// bisukan suara. Angka belum-dibaca sendiri tampil di NavMenu.
export default function InboxNotifier() {
  const {
    muted,
    setMuted,
    notificationPermission,
    requestNotificationPermission,
  } = useInboxUnread();

  return (
    <div className="flex items-center gap-3 text-xs text-[var(--color-muted)]">
      {notificationPermission === "default" && (
        <button
          type="button"
          onClick={requestNotificationPermission}
          className="hover:underline"
        >
          Enable desktop notifications
        </button>
      )}
      <label className="flex items-center gap-1">
        <input
          type="checkbox"
          checked={muted}
          onChange={(e) => setMuted(e.target.checked)}
        />
        Mute sound
      </label>
    </div>
  );
}
