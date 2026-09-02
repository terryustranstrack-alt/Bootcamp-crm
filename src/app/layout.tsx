import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "./login/actions";
import NavMenu from "@/components/NavMenu";
import InboxUnreadProvider from "@/components/InboxUnreadProvider";
import InboxNotifier from "@/components/InboxNotifier";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "CRM Lead Tracker",
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
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {user ? (
          <InboxUnreadProvider>
            <header className="flex items-center justify-between border-b px-8 py-3 text-sm">
              <NavMenu isAdmin={isAdmin} />
              <div className="flex items-center gap-4">
                <InboxNotifier />
                <span className="text-gray-500">{user.email}</span>
                <form action={signOut}>
                  <button
                    type="submit"
                    className="text-gray-500 hover:underline"
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
