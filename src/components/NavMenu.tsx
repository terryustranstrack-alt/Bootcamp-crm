"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const MENU = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/", label: "Board" },
  { href: "/prospek", label: "Prospects" },
  { href: "/inbox", label: "Inbox" },
];

// Menu "Sales" cuma muncul untuk admin — sales biasa tidak punya akses
// untuk lihat/kelola akun sales lain.
const ADMIN_MENU = { href: "/sales", label: "Sales" };

// Navigasi bar di header, disembunyikan otomatis kalau belum login (lihat
// layout.tsx: NavMenu hanya dirender saat `user` ada).
export default function NavMenu({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const items = isAdmin ? [...MENU, ADMIN_MENU] : MENU;

  return (
    <nav className="flex gap-1">
      {items.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`px-3 py-1.5 rounded text-sm ${
              active
                ? "bg-black text-white"
                : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
