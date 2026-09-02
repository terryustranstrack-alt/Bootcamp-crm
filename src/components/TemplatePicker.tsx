"use client";

import { useMemo, useState, useTransition } from "react";
import { sendTemplate } from "@/app/inbox/actions";
import { useTemplates } from "@/lib/useTemplates";
import type { WhatsappTemplateRow } from "@/lib/types";

// Isi placeholder {{1}}, {{2}}, ... di teks template dengan nilai yang diketik.
function renderTemplate(bodyText: string | null, params: string[]): string {
  if (!bodyText) return "";
  return bodyText.replace(/\{\{\s*(\d+)\s*\}\}/g, (_match, n) => {
    const value = params[Number(n) - 1];
    return value && value.trim() ? value : `{{${n}}}`;
  });
}

// Pemilih template untuk membalas di luar jendela 24 jam: pilih template,
// isi variabelnya, lihat pratinjau, kirim.
export default function TemplatePicker({
  conversationId,
  onSent,
}: {
  conversationId: string;
  onSent: () => void;
}) {
  const { templates, loading } = useTemplates(true);
  const [selectedId, setSelectedId] = useState("");
  const [params, setParams] = useState<string[]>([]);
  const [headerImageUrl, setHeaderImageUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const selected: WhatsappTemplateRow | null = useMemo(
    () => templates.find((t) => t.id === selectedId) ?? null,
    [templates, selectedId],
  );

  const needsHeaderImage = selected?.header_format === "IMAGE";

  function pickTemplate(id: string) {
    setSelectedId(id);
    const t = templates.find((x) => x.id === id);
    setParams(new Array(t?.variable_count ?? 0).fill(""));
    setHeaderImageUrl("");
    setError(null);
  }

  function handleSend() {
    if (!selected) return;
    if (needsHeaderImage && !headerImageUrl.trim()) {
      setError("This template needs a header image URL.");
      return;
    }
    if (params.some((p) => !p.trim())) {
      setError("Fill in every template value before sending.");
      return;
    }
    const rendered = renderTemplate(selected.body_text, params);
    setError(null);
    startTransition(async () => {
      const result = await sendTemplate(
        conversationId,
        selected.name,
        selected.language,
        params,
        rendered,
        needsHeaderImage ? headerImageUrl.trim() : undefined,
      );
      if (result?.error) setError(result.error);
      else onSent();
    });
  }

  if (loading) {
    return <p className="text-xs text-gray-500">Loading templates…</p>;
  }
  if (templates.length === 0) {
    return (
      <p className="text-xs text-gray-500">
        No approved templates yet. An admin can add them in WhatsApp Manager and
        sync from Settings.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <select
        value={selectedId}
        onChange={(e) => pickTemplate(e.target.value)}
        className="border rounded px-2 py-1.5 text-sm"
      >
        <option value="">Choose a template…</option>
        {templates.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name} ({t.language})
          </option>
        ))}
      </select>

      {selected && (
        <>
          {needsHeaderImage && (
            <input
              value={headerImageUrl}
              onChange={(e) => setHeaderImageUrl(e.target.value)}
              placeholder="Header image URL (public https link)"
              className="border rounded px-2 py-1 text-sm"
            />
          )}
          {params.map((value, i) => (
            <input
              key={i}
              value={value}
              onChange={(e) => {
                const next = [...params];
                next[i] = e.target.value;
                setParams(next);
              }}
              placeholder={`Value for {{${i + 1}}}`}
              className="border rounded px-2 py-1 text-sm"
            />
          ))}
          <p className="text-xs bg-gray-50 border rounded p-2 whitespace-pre-wrap">
            {renderTemplate(selected.body_text, params) || "(empty template)"}
          </p>
          <button
            type="button"
            onClick={handleSend}
            disabled={isPending}
            className="bg-black text-white rounded px-3 py-1.5 text-sm self-start disabled:opacity-50"
          >
            {isPending ? "Sending…" : "Send template"}
          </button>
        </>
      )}

      {error && <p className="text-red-600 text-xs">{error}</p>}
    </div>
  );
}
