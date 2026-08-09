"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const MENU = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/", label: "CRM" },
  { href: "/prospek", label: "Data Prospek" },
];

export default function NavMenu() {
  const pathname = usePathname();

  return (
    <nav className="flex gap-1">
      {MENU.map((item) => {
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
