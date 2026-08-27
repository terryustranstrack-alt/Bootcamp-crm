"use client";

import { useActionState } from "react";
import { signIn } from "./actions";

// Halaman login. proxy.ts otomatis redirect ke sini kalau belum login,
// dan redirect balik ke "/" kalau sudah login tapi buka halaman ini lagi.
export default function LoginPage() {
  const [state, action, pending] = useActionState(signIn, undefined);

  return (
    <main className="flex flex-1 items-center justify-center p-8">
      <form
        action={action}
        className="flex w-full max-w-sm flex-col gap-4 border rounded p-6"
      >
        <h1 className="text-xl font-semibold">Sign In to CRM</h1>

        <div className="flex flex-col gap-1">
          <label htmlFor="email" className="text-sm font-medium">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            className="border rounded px-3 py-2"
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
            className="border rounded px-3 py-2"
          />
        </div>

        <button
          type="submit"
          disabled={pending}
          className="bg-black text-white rounded px-4 py-2 disabled:opacity-50"
        >
          {pending ? "Signing in..." : "Sign In"}
        </button>

        {state?.error && (
          <p className="text-red-600 text-sm">{state.error}</p>
        )}
      </form>
    </main>
  );
}
