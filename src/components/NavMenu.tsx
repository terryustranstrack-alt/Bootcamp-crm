"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useInboxUnread } from "@/components/InboxUnreadProvider";

const MENU = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/", label: "Board" },
  { href: "/prospek", label: "Prospects" },
  { href: "/inbox", label: "Inbox" },
];

// Menu khusus admin — sales biasa tidak punya akses ke halaman-halaman ini.
const ADMIN_MENU = [
  { href: "/sales", label: "Sales" },
  { href: "/settings", label: "Settings" },
];

// Navigasi bar di header, disembunyikan otomatis kalau belum login (lihat
// layout.tsx: NavMenu hanya dirender saat `user` ada).
export default function NavMenu({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const { totalUnread } = useInboxUnread();
  const items = isAdmin ? [...MENU, ...ADMIN_MENU] : MENU;

  return (
    <nav className="flex gap-1">
      {items.map((item) => {
        const active = pathname === item.href;
        const showBadge = item.href === "/inbox" && totalUnread > 0;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`px-3 py-1.5 rounded text-sm flex items-center gap-1.5 ${
              active
                ? "bg-black text-white"
                : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            {item.label}
            {showBadge && (
              <span className="bg-red-600 text-white text-xs rounded-full px-1.5 min-w-5 text-center">
                {totalUnread}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
