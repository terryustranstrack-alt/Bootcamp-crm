"use client";

import Image from "next/image";
import { useActionState } from "react";
import { signIn } from "./actions";

// Halaman login. proxy.ts otomatis redirect ke sini kalau belum login,
// dan redirect balik ke "/" kalau sudah login tapi buka halaman ini lagi.
export default function LoginPage() {
  const [state, action, pending] = useActionState(signIn, undefined);

  return (
    <main className="flex flex-1 items-center justify-center p-8 bg-background">
      <div className="flex w-full max-w-sm flex-col items-center gap-8">
        <Image
          src="/logo-full.png"
          alt="TransTRACK CRM"
          width={360}
          height={168}
          priority
          className="w-full max-w-[280px] h-auto"
        />

        <form
          action={action}
          className="flex w-full flex-col gap-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm"
        >
          <h1 className="text-lg font-semibold">Sign in</h1>

          <div className="flex flex-col gap-1">
            <label htmlFor="email" className="text-sm font-medium">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              className="rounded-lg border border-[var(--color-border)] px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="password" className="text-sm font-medium">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              className="rounded-lg border border-[var(--color-border)] px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>

          <button
            type="submit"
            disabled={pending}
            className="bg-brand text-on-brand hover:bg-[var(--color-brand-hover)] rounded-lg px-4 py-2 font-medium transition-colors disabled:opacity-50"
          >
            {pending ? "Signing in..." : "Sign In"}
          </button>

          {state?.error && (
            <p className="text-[var(--color-danger)] text-sm">{state.error}</p>
          )}
        </form>
      </div>
    </main>
  );
}
