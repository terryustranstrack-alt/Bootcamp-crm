"use client";

import { useState } from "react";
import { useQuickReplies } from "@/lib/useQuickReplies";

// Dropdown kecil di atas kotak balasan: klik sebuah quick reply untuk
// menyisipkan teksnya ke kotak balasan (lewat onPick).
export default function QuickReplyPicker({
  onPick,
}: {
  onPick: (text: string) => void;
}) {
  const { quickReplies } = useQuickReplies();
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="border rounded px-3 py-2 text-sm hover:bg-gray-50"
        title="Quick replies"
      >
        ⚡
      </button>
      {open && (
        <div className="absolute bottom-full mb-1 left-0 w-64 max-h-60 overflow-y-auto border rounded bg-white shadow z-10">
          {quickReplies.length === 0 && (
            <p className="p-2 text-xs text-gray-500">
              No quick replies. Add some in Settings.
            </p>
          )}
          {quickReplies.map((qr) => (
            <button
              key={qr.id}
              type="button"
              onClick={() => {
                onPick(qr.body);
                setOpen(false);
              }}
              className="block w-full text-left px-3 py-2 text-sm hover:bg-gray-50 border-b last:border-b-0"
            >
              <span className="font-medium block truncate">{qr.title}</span>
              <span className="text-xs text-gray-500 block truncate">
                {qr.body}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
