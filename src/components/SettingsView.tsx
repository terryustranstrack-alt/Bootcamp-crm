"use client";

import { useEffect, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { syncTemplates } from "@/app/inbox/actions";
import { useTemplates } from "@/lib/useTemplates";
import { useQuickReplies } from "@/lib/useQuickReplies";
import { useBrands } from "@/lib/useBrands";
import type { BotConfig } from "@/lib/types";

const supabase = createClient();

export default function SettingsView() {
  const { templates, loading: templatesLoading, reload: reloadTemplates } =
    useTemplates(false);
  const { quickReplies, reload: reloadQuickReplies } = useQuickReplies();

  const [isPending, startTransition] = useTransition();
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const [newTitle, setNewTitle] = useState("");
  const [newBody, setNewBody] = useState("");
  const [qrError, setQrError] = useState<string | null>(null);

  const brands = useBrands();
  const [selectedBrandId, setSelectedBrandId] = useState<string | null>(null);
  const [bot, setBot] = useState<BotConfig | null>(null);
  const [botSaving, setBotSaving] = useState(false);
  const [botMessage, setBotMessage] = useState<string | null>(null);

  // Begitu daftar brand datang, mulai dari brand default (nomor yang sudah
  // jalan). Admin bisa ganti lewat dropdown di bawah.
  useEffect(() => {
    if (selectedBrandId || brands.length === 0) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedBrandId((brands.find((b) => b.is_default) ?? brands[0]).id);
  }, [brands, selectedBrandId]);

  useEffect(() => {
    if (!selectedBrandId) return;
    async function loadBot() {
      setBot(null);
      const { data } = await supabase
        .from("bot_config")
        .select("*")
        .eq("brand_id", selectedBrandId)
        .single();
      if (data) setBot(data as BotConfig);
    }
    loadBot();
  }, [selectedBrandId]);

  async function handleSaveBot() {
    if (!bot) return;
    setBotSaving(true);
    setBotMessage(null);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("bot_config")
      .update({
        enabled: bot.enabled,
        system_prompt: bot.system_prompt,
        faq: bot.faq,
        welcome_message: bot.welcome_message,
        max_replies_per_conversation: bot.max_replies_per_conversation,
        updated_at: new Date().toISOString(),
        updated_by: user?.id ?? null,
      })
      .eq("brand_id", bot.brand_id);
    setBotSaving(false);
    setBotMessage(error ? error.message : "Chatbot settings saved.");
  }

  function handleSync() {
    setSyncMessage(null);
    startTransition(async () => {
      const result = await syncTemplates();
      if (result?.error) setSyncMessage(result.error);
      else {
        setSyncMessage("Templates synced.");
        reloadTemplates();
      }
    });
  }

  async function handleAddQuickReply() {
    if (!newTitle.trim() || !newBody.trim()) return;
    setQrError(null);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    // Dibuat dari Settings (admin) → quick reply milik bersama (owner_id null).
    const { error } = await supabase.from("quick_replies").insert({
      title: newTitle.trim(),
      body: newBody.trim(),
      owner_id: null,
      created_by: user?.id ?? null,
    });
    if (error) {
      setQrError(error.message);
      return;
    }
    setNewTitle("");
    setNewBody("");
    reloadQuickReplies();
  }

  async function handleDeleteQuickReply(id: string) {
    const { error } = await supabase.from("quick_replies").delete().eq("id", id);
    if (error) setQrError(error.message);
    else reloadQuickReplies();
  }

  return (
    <main className="p-8 flex flex-col gap-8 max-w-2xl">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">WhatsApp message templates</h2>
          <button
            type="button"
            onClick={handleSync}
            disabled={isPending}
            className="text-sm border border-[var(--color-border)] rounded-lg px-3 py-1.5 hover:bg-[var(--color-muted-bg)] disabled:opacity-50"
          >
            {isPending ? "Syncing…" : "Sync from Meta"}
          </button>
        </div>
        <p className="text-xs text-[var(--color-muted)]">
          Templates are created and approved in WhatsApp Manager, then synced
          here. Only approved templates can be sent from the inbox.
        </p>
        {syncMessage && <p className="text-sm text-[var(--color-muted)]">{syncMessage}</p>}

        {templatesLoading ? (
          <p className="text-sm text-[var(--color-muted)]">Loading…</p>
        ) : templates.length === 0 ? (
          <p className="text-sm text-[var(--color-muted)]">
            No templates synced yet.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-[var(--color-border)] border border-[var(--color-border)] rounded-lg">
            {templates.map((t) => (
              <li key={t.id} className="p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">
                    {t.name}{" "}
                    <span className="text-[var(--color-muted)] font-normal">
                      ({t.language})
                    </span>
                  </span>
                  <span
                    className={`text-xs ${
                      t.status === "APPROVED"
                        ? "text-[var(--color-success)]"
                        : "text-[var(--color-warning)]"
                    }`}
                  >
                    {t.status ?? "—"}
                  </span>
                </div>
                {t.body_text && (
                  <p className="text-xs text-[var(--color-muted)] mt-1 whitespace-pre-wrap">
                    {t.body_text}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-medium">Quick replies</h2>
        <p className="text-xs text-[var(--color-muted)]">
          Reusable snippets everyone can insert into a reply from the inbox.
        </p>

        <div className="flex flex-col gap-2 border border-[var(--color-border)] rounded-lg p-3">
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Title (e.g. Office address)"
            className="border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm"
          />
          <textarea
            value={newBody}
            onChange={(e) => setNewBody(e.target.value)}
            placeholder="Message text"
            rows={3}
            className="border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={handleAddQuickReply}
            disabled={!newTitle.trim() || !newBody.trim()}
            className="bg-brand text-on-brand hover:bg-[var(--color-brand-hover)] rounded-lg px-3 py-1.5 text-sm self-start font-medium transition-colors disabled:opacity-50"
          >
            Add quick reply
          </button>
          {qrError && (
            <p className="text-[var(--color-danger)] text-xs">{qrError}</p>
          )}
        </div>

        <ul className="flex flex-col divide-y divide-[var(--color-border)] border border-[var(--color-border)] rounded-lg">
          {quickReplies.length === 0 && (
            <li className="p-3 text-sm text-[var(--color-muted)]">No quick replies yet.</li>
          )}
          {quickReplies.map((qr) => (
            <li
              key={qr.id}
              className="p-3 text-sm flex items-start justify-between gap-3"
            >
              <div className="min-w-0">
                <span className="font-medium block">
                  {qr.title}{" "}
                  {qr.owner_id && (
                    <span className="text-xs text-[var(--color-muted)] font-normal">
                      (personal)
                    </span>
                  )}
                </span>
                <span className="text-xs text-[var(--color-muted)] whitespace-pre-wrap">
                  {qr.body}
                </span>
              </div>
              <button
                type="button"
                onClick={() => handleDeleteQuickReply(qr.id)}
                className="text-xs text-[var(--color-danger)] hover:underline shrink-0"
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-medium">AI chatbot</h2>
        <p className="text-xs text-[var(--color-muted)]">
          When enabled, unclaimed incoming WhatsApp messages get an automatic
          reply from an AI assistant. It stops as soon as a person claims the
          conversation, and hands off on anything it&apos;s unsure about. It
          also reads each chat and fills in the lead&apos;s details (name,
          email, company, job title, city, needs) when the customer mentions
          them, creating a new lead if the number isn&apos;t in the CRM yet.
          Every auto-filled value is written to the lead&apos;s activity log so
          your team can check and correct it. Test the prompt against real
          messages before turning it on.
        </p>

        {brands.length > 1 && (
          <label className="flex flex-col gap-1 max-w-xs">
            <span className="text-xs text-[var(--color-muted)]">Brand (WhatsApp number)</span>
            <select
              value={selectedBrandId ?? ""}
              onChange={(e) => setSelectedBrandId(e.target.value)}
              className="border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm"
            >
              {brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
        )}

        {!bot ? (
          <p className="text-sm text-[var(--color-muted)]">Loading…</p>
        ) : (
          <div className="flex flex-col gap-3 border border-[var(--color-border)] rounded-lg p-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={bot.enabled}
                onChange={(e) => setBot({ ...bot, enabled: e.target.checked })}
              />
              Enabled
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-xs text-[var(--color-muted)]">
                Welcome message — sent word-for-word the first time a new
                contact messages, before the AI takes over. Use it to greet
                and ask for the details you want (name, email, job title,
                company, city, needs). Leave blank to let the AI handle the
                first reply too.
              </span>
              <textarea
                value={bot.welcome_message}
                onChange={(e) =>
                  setBot({ ...bot, welcome_message: e.target.value })
                }
                rows={5}
                placeholder={
                  "Halo! 👋 Terima kasih sudah menghubungi TransTRACK. Saya Ratih. Supaya tim kami bisa membantu dengan tepat, boleh dibantu isi:\n1. Nama\n2. Email\n3. Jabatan\n4. Perusahaan\n5. Kota\n6. Kebutuhan Anda (mis. jumlah & jenis kendaraan)"
                }
                className="border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-xs text-[var(--color-muted)]">
                System prompt (who the bot is, how it should behave)
              </span>
              <textarea
                value={bot.system_prompt}
                onChange={(e) =>
                  setBot({ ...bot, system_prompt: e.target.value })
                }
                rows={4}
                placeholder="You are the assistant for TransTRACK, a fleet management company. Greet new leads warmly, answer basic questions, and offer to connect them with a sales rep."
                className="border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-xs text-[var(--color-muted)]">
                FAQ / reference info the bot may use to answer
              </span>
              <textarea
                value={bot.faq}
                onChange={(e) => setBot({ ...bot, faq: e.target.value })}
                rows={6}
                placeholder={
                  "Q: What does TransTRACK do?\nA: GPS fleet tracking, fuel monitoring, driver management.\n\nQ: Office hours?\nA: Mon–Fri 9am–6pm WIB."
                }
                className="border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm"
              />
            </label>

            <label className="flex flex-col gap-1 max-w-xs">
              <span className="text-xs text-[var(--color-muted)]">
                Max bot replies per conversation
              </span>
              <input
                type="number"
                min={1}
                value={bot.max_replies_per_conversation}
                onChange={(e) =>
                  setBot({
                    ...bot,
                    max_replies_per_conversation: Number(e.target.value) || 1,
                  })
                }
                className="border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm"
              />
            </label>

            <button
              type="button"
              onClick={handleSaveBot}
              disabled={botSaving}
              className="bg-brand text-on-brand hover:bg-[var(--color-brand-hover)] rounded-lg px-3 py-1.5 text-sm self-start font-medium transition-colors disabled:opacity-50"
            >
              {botSaving ? "Saving…" : "Save chatbot settings"}
            </button>
            {botMessage && (
              <p className="text-sm text-[var(--color-muted)]">{botMessage}</p>
            )}
          </div>
        )}
      </section>
    </main>
  );
}
