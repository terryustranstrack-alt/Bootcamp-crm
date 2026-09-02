"use client";

import { useEffect, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { syncTemplates } from "@/app/inbox/actions";
import { useTemplates } from "@/lib/useTemplates";
import { useQuickReplies } from "@/lib/useQuickReplies";
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

  const [bot, setBot] = useState<BotConfig | null>(null);
  const [botSaving, setBotSaving] = useState(false);
  const [botMessage, setBotMessage] = useState<string | null>(null);

  useEffect(() => {
    async function loadBot() {
      const { data } = await supabase
        .from("bot_config")
        .select("*")
        .eq("id", 1)
        .single();
      if (data) setBot(data as BotConfig);
    }
    loadBot();
  }, []);

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
        max_replies_per_conversation: bot.max_replies_per_conversation,
        updated_at: new Date().toISOString(),
        updated_by: user?.id ?? null,
      })
      .eq("id", 1);
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
      <h1 className="text-xl font-semibold">Settings</h1>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">WhatsApp message templates</h2>
          <button
            type="button"
            onClick={handleSync}
            disabled={isPending}
            className="text-sm border rounded px-3 py-1.5 hover:bg-gray-50 disabled:opacity-50"
          >
            {isPending ? "Syncing…" : "Sync from Meta"}
          </button>
        </div>
        <p className="text-xs text-gray-500">
          Templates are created and approved in WhatsApp Manager, then synced
          here. Only approved templates can be sent from the inbox.
        </p>
        {syncMessage && <p className="text-sm text-gray-600">{syncMessage}</p>}

        {templatesLoading ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : templates.length === 0 ? (
          <p className="text-sm text-gray-500">
            No templates synced yet.
          </p>
        ) : (
          <ul className="flex flex-col divide-y border rounded">
            {templates.map((t) => (
              <li key={t.id} className="p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">
                    {t.name}{" "}
                    <span className="text-gray-400 font-normal">
                      ({t.language})
                    </span>
                  </span>
                  <span
                    className={`text-xs ${
                      t.status === "APPROVED"
                        ? "text-green-600"
                        : "text-amber-600"
                    }`}
                  >
                    {t.status ?? "—"}
                  </span>
                </div>
                {t.body_text && (
                  <p className="text-xs text-gray-500 mt-1 whitespace-pre-wrap">
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
        <p className="text-xs text-gray-500">
          Reusable snippets everyone can insert into a reply from the inbox.
        </p>

        <div className="flex flex-col gap-2 border rounded p-3">
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Title (e.g. Office address)"
            className="border rounded px-3 py-2 text-sm"
          />
          <textarea
            value={newBody}
            onChange={(e) => setNewBody(e.target.value)}
            placeholder="Message text"
            rows={3}
            className="border rounded px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={handleAddQuickReply}
            disabled={!newTitle.trim() || !newBody.trim()}
            className="bg-black text-white rounded px-3 py-1.5 text-sm self-start disabled:opacity-50"
          >
            Add quick reply
          </button>
          {qrError && <p className="text-red-600 text-xs">{qrError}</p>}
        </div>

        <ul className="flex flex-col divide-y border rounded">
          {quickReplies.length === 0 && (
            <li className="p-3 text-sm text-gray-500">No quick replies yet.</li>
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
                    <span className="text-xs text-gray-400 font-normal">
                      (personal)
                    </span>
                  )}
                </span>
                <span className="text-xs text-gray-500 whitespace-pre-wrap">
                  {qr.body}
                </span>
              </div>
              <button
                type="button"
                onClick={() => handleDeleteQuickReply(qr.id)}
                className="text-xs text-red-600 hover:underline shrink-0"
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-medium">AI chatbot</h2>
        <p className="text-xs text-gray-500">
          When enabled, unclaimed incoming WhatsApp messages get an automatic
          reply from Claude. It stops as soon as a person claims the
          conversation, and hands off on anything it&apos;s unsure about. Test
          the prompt against real messages before turning it on.
        </p>

        {!bot ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : (
          <div className="flex flex-col gap-3 border rounded p-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={bot.enabled}
                onChange={(e) => setBot({ ...bot, enabled: e.target.checked })}
              />
              Enabled
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-xs text-gray-500">
                System prompt (who the bot is, how it should behave)
              </span>
              <textarea
                value={bot.system_prompt}
                onChange={(e) =>
                  setBot({ ...bot, system_prompt: e.target.value })
                }
                rows={4}
                placeholder="You are the assistant for TransTRACK, a fleet management company. Greet new leads warmly, answer basic questions, and offer to connect them with a sales rep."
                className="border rounded px-3 py-2 text-sm"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-xs text-gray-500">
                FAQ / reference info the bot may use to answer
              </span>
              <textarea
                value={bot.faq}
                onChange={(e) => setBot({ ...bot, faq: e.target.value })}
                rows={6}
                placeholder={
                  "Q: What does TransTRACK do?\nA: GPS fleet tracking, fuel monitoring, driver management.\n\nQ: Office hours?\nA: Mon–Fri 9am–6pm WIB."
                }
                className="border rounded px-3 py-2 text-sm"
              />
            </label>

            <label className="flex flex-col gap-1 max-w-xs">
              <span className="text-xs text-gray-500">
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
                className="border rounded px-3 py-2 text-sm"
              />
            </label>

            <button
              type="button"
              onClick={handleSaveBot}
              disabled={botSaving}
              className="bg-black text-white rounded px-3 py-1.5 text-sm self-start disabled:opacity-50"
            >
              {botSaving ? "Saving…" : "Save chatbot settings"}
            </button>
            {botMessage && (
              <p className="text-sm text-gray-600">{botMessage}</p>
            )}
          </div>
        )}
      </section>
    </main>
  );
}
