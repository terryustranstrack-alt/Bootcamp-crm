import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { JetBrains_Mono, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "./login/actions";
import NavMenu from "@/components/NavMenu";
import InboxUnreadProvider from "@/components/InboxUnreadProvider";
import InboxNotifier from "@/components/InboxNotifier";

// UI/body face: a step away from the Inter-everywhere look most SaaS
// dashboards default to, while staying just as legible for forms and tables.
const uiFont = Plus_Jakarta_Sans({
  variable: "--font-ui",
  subsets: ["latin"],
});

// Data face: tracked/measured/timestamped values (see .font-data in
// globals.css) — a fleet-tracking CRM's numbers should read as precise.
const dataFont = JetBrains_Mono({
  variable: "--font-data",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "TransTRACK CRM",
  description: "Track sales lead progress.",
};

// Layout dasar semua halaman: header dengan menu navigasi + info user +
// tombol keluar (hanya muncul kalau sudah login), lalu isi halamannya.
export default async function RootLayout({ children }: LayoutProps<"/">) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Perlu tahu status admin di sini supaya NavMenu bisa memunculkan/
  // menyembunyikan menu "Sales" (khusus admin).
  let isAdmin = false;
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("is_admin")
      .eq("id", user.id)
      .single();
    isAdmin = profile?.is_admin ?? false;
  }

  return (
    <html
      lang="en"
      className={`${uiFont.variable} ${dataFont.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        {user ? (
          <InboxUnreadProvider>
            <header className="flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-2.5 text-sm">
              <div className="flex items-center gap-5">
                <Link href="/dashboard" className="flex items-center shrink-0">
                  <Image
                    src="/logo.png"
                    alt="TransTRACK"
                    width={32}
                    height={32}
                    className="rounded"
                    priority
                  />
                </Link>
                <NavMenu isAdmin={isAdmin} />
              </div>
              <div className="flex items-center gap-4">
                <InboxNotifier />
                <span className="font-data text-xs text-[var(--color-muted)]">
                  {user.email}
                </span>
                <form action={signOut}>
                  <button
                    type="submit"
                    className="text-[var(--color-muted)] hover:text-foreground hover:underline"
                  >
                    Log Out
                  </button>
                </form>
              </div>
            </header>
            {children}
          </InboxUnreadProvider>
        ) : (
          children
        )}
      </body>
    </html>
  );
}
