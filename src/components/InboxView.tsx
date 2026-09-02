"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useConversations, useMessages } from "@/lib/useConversations";
import {
  claimConversation,
  linkConversationToLead,
  markConversationRead,
  retryMessage,
  sendMediaAttachment,
  sendMessage,
  setConversationStatus,
  transferConversation,
} from "@/app/inbox/actions";
import LeadForm from "@/components/LeadForm";
import { useProfiles, profileLabel } from "@/lib/useProfiles";
import { useCurrentProfile } from "@/lib/useCurrentProfile";
import { searchMessages, type MessageSearchHit } from "@/lib/searchInbox";
import type { Conversation, Lead, Message } from "@/lib/types";

// Tab filter untuk daftar percakapan. "all" menyembunyikan yang sudah resolved.
const FILTERS = [
  { key: "all", label: "All" },
  { key: "unread", label: "Unread" },
  { key: "unclaimed", label: "Unclaimed" },
  { key: "mine", label: "Mine" },
  { key: "resolved", label: "Resolved" },
] as const;

type FilterKey = (typeof FILTERS)[number]["key"];

const supabase = createClient();

// Batas ukuran lampiran yang dikirim dari inbox (WhatsApp sendiri membatasi
// ~16 MB untuk gambar/audio/video).
const MAX_ATTACHMENT_BYTES = 16 * 1024 * 1024;

// Nama kontak yang ditampilkan: pakai nama profil WhatsApp kalau ada,
// kalau tidak fallback ke nomor telepon.
function contactLabel(conversation: Conversation) {
  return conversation.display_name || `+${conversation.external_contact_id}`;
}

// Waktu tampil sebuah pesan: pakai waktu asli WhatsApp kalau ada.
function messageTime(m: Message): string {
  return new Date(m.wa_timestamp ?? m.created_at).toLocaleString("id-ID");
}

// Isi sebuah gelembung pesan: teks biasa, atau media (gambar tampil langsung,
// audio/video pakai player, dokumen jadi link unduh). Media yang belum selesai
// diunduh ke Storage ditampilkan sebagai label sementara.
function MessageBody({ m }: { m: Message }) {
  const mediaUrl = `/api/whatsapp/media/${m.id}`;
  const caption = m.text_body ? (
    <p className="whitespace-pre-wrap mt-1">{m.text_body}</p>
  ) : null;

  if (m.type === "text") {
    return <p className="whitespace-pre-wrap">{m.text_body}</p>;
  }
  if (m.type === "location") return <p className="italic opacity-80">📍 Location</p>;
  if (m.type === "unsupported") {
    return <p className="italic opacity-80">Unsupported message</p>;
  }

  if (m.media_status === "pending") {
    return <p className="italic opacity-80">[{m.type}] downloading…</p>;
  }
  if (m.media_status !== "stored") {
    return (
      <p className="italic opacity-80">
        [{m.type}] — open WhatsApp to view
      </p>
    );
  }

  if (m.type === "image" || m.type === "sticker") {
    return (
      <>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={mediaUrl}
          alt={m.type}
          className="rounded max-w-full max-h-64 object-contain"
        />
        {caption}
      </>
    );
  }
  if (m.type === "audio") {
    return <audio controls src={mediaUrl} className="max-w-full" />;
  }
  if (m.type === "video") {
    return (
      <>
        <video controls src={mediaUrl} className="rounded max-w-full max-h-64" />
        {caption}
      </>
    );
  }
  // document
  return (
    <a
      href={mediaUrl}
      target="_blank"
      rel="noreferrer"
      className="underline break-all"
    >
      📄 {m.media_filename || "Document"}
    </a>
  );
}

export default function InboxView() {
  const conversations = useConversations();
  const [selectedConversationId, setSelectedConversationId] = useState<
    string | null
  >(null);
  const messages = useMessages(selectedConversationId);
  const [leads, setLeads] = useState<Lead[]>([]);
  const profiles = useProfiles();
  const { profile: currentProfile } = useCurrentProfile();
  const [leadSearchQuery, setLeadSearchQuery] = useState("");
  const [showLinkSearch, setShowLinkSearch] = useState(false);
  const [showNewLeadForm, setShowNewLeadForm] = useState(false);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [search, setSearch] = useState("");
  const [messageHits, setMessageHits] = useState<MessageSearchHit[] | null>(null);
  const [draftText, setDraftText] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();

  async function loadLeads() {
    const { data } = await supabase.from("leads").select("*");
    if (data) setLeads(data as Lead[]);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadLeads();
  }, []);

  const selectedConversation =
    conversations.find((c) => c.id === selectedConversationId) ?? null;

  // Daftar percakapan setelah tab filter + pencarian kontak diterapkan.
  const filteredConversations = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return conversations.filter((c) => {
      const mine = c.assigned_to === currentProfile?.id;
      if (filter === "resolved" && c.status !== "resolved") return false;
      if (filter !== "resolved" && c.status === "resolved") return false;
      if (filter === "unread" && c.unread_count === 0) return false;
      if (filter === "unclaimed" && c.assigned_to) return false;
      if (filter === "mine" && !mine) return false;
      if (keyword) {
        const haystack = `${c.display_name ?? ""} ${c.external_contact_id} ${
          c.last_message_preview ?? ""
        }`.toLowerCase();
        if (!haystack.includes(keyword)) return false;
      }
      return true;
    });
  }, [conversations, filter, search, currentProfile?.id]);

  // Cari di dalam isi pesan (server) — debounce 300ms saat mengetik.
  useEffect(() => {
    const keyword = search.trim();
    if (keyword.length < 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMessageHits(null);
      return;
    }
    const timer = setTimeout(async () => {
      setMessageHits(await searchMessages(keyword));
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Setiap kali user buka sebuah percakapan yang masih ada pesan belum
  // dibaca: reset unread_count DAN kirim tanda "dibaca" (centang biru) ke
  // WhatsApp untuk pesan masuk terakhir.
  useEffect(() => {
    if (!selectedConversation || selectedConversation.unread_count === 0) return;
    markConversationRead(selectedConversation.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedConversationId]);

  const linkedLead = selectedConversation?.lead_id
    ? (leads.find((l) => l.id === selectedConversation.lead_id) ?? null)
    : null;

  const assigneeProfile =
    profiles.find((p) => p.id === selectedConversation?.assigned_to) ?? null;

  // Boleh ganti assignee kalau: admin, atau percakapan ini memang dipegang
  // sendiri, atau percakapan belum dipegang siapa-siapa (masih di pool).
  const canAssign =
    !!currentProfile?.is_admin ||
    !selectedConversation?.assigned_to ||
    selectedConversation.assigned_to === currentProfile?.id;

  // WhatsApp cuma izinkan balas teks bebas dalam 24 jam sejak pesan
  // terakhir DARI kontak ("customer service window"). Di luar itu, harus
  // pakai message template resmi — fitur itu belum dibuat di versi ini,
  // jadi cukup ditampilkan sebagai peringatan.
  const windowClosed = useMemo(() => {
    const lastInboundMessage = [...messages]
      .reverse()
      .find((m) => m.direction === "inbound");
    if (!lastInboundMessage) return true;
    const lastInboundAt =
      lastInboundMessage.wa_timestamp ?? lastInboundMessage.created_at;
    const millisSinceLastInbound =
      // eslint-disable-next-line react-hooks/purity -- window check is inherently time-relative
      Date.now() - new Date(lastInboundAt).getTime();
    return millisSinceLastInbound > 24 * 60 * 60 * 1000;
  }, [messages]);

  // Hasil pencarian lead saat user mengetik di kotak "Link ke Lead",
  // dibatasi 8 hasil teratas biar dropdown tidak kepanjangan.
  const leadSearchResults = useMemo(() => {
    const keyword = leadSearchQuery.trim().toLowerCase();
    if (!keyword) return [];
    return leads
      .filter(
        (l) =>
          l.nama.toLowerCase().includes(keyword) || l.kontak.includes(keyword),
      )
      .slice(0, 8);
  }, [leadSearchQuery, leads]);

  function handleSend() {
    if (!selectedConversationId || !draftText.trim()) return;
    const messageToSend = draftText.trim();
    setDraftText("");
    setActionError(null);
    startTransition(async () => {
      const result = await sendMessage(selectedConversationId, messageToSend);
      if (result?.error) setActionError(result.error);
    });
  }

  function handleRetry(messageId: string) {
    setActionError(null);
    startTransition(async () => {
      const result = await retryMessage(messageId);
      if (result?.error) setActionError(result.error);
    });
  }

  // Kirim file lampiran: serahkan ke server (upload ke Storage + kirim ke
  // WhatsApp) lewat satu server action.
  function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !selectedConversationId) return;

    if (file.size > MAX_ATTACHMENT_BYTES) {
      setActionError("File is too large (max 16 MB).");
      return;
    }

    setActionError(null);
    setUploading(true);

    const conversationId = selectedConversationId;
    const formData = new FormData();
    formData.append("file", file);

    startTransition(async () => {
      const result = await sendMediaAttachment(conversationId, formData);
      setUploading(false);
      if (result?.error) setActionError(result.error);
    });
  }

  function handleClaim() {
    if (!selectedConversationId) return;
    setActionError(null);
    startTransition(async () => {
      const result = await claimConversation(selectedConversationId);
      if (result?.error) setActionError(result.error);
    });
  }

  // Tandai percakapan selesai / buka lagi.
  function handleSetStatus(status: "open" | "resolved") {
    if (!selectedConversationId) return;
    setActionError(null);
    startTransition(async () => {
      const result = await setConversationStatus(selectedConversationId, status);
      if (result?.error) setActionError(result.error);
    });
  }

  // Ganti sales penanggung jawab percakapan (atau lepas ke pool = null).
  function handleAssign(toProfileId: string | null) {
    if (!selectedConversationId) return;
    setActionError(null);
    startTransition(async () => {
      const result = await transferConversation(
        selectedConversationId,
        toProfileId,
      );
      if (result?.error) setActionError(result.error);
    });
  }

  function handleLink(leadId: string) {
    if (!selectedConversationId) return;
    setActionError(null);
    startTransition(async () => {
      const result = await linkConversationToLead(
        selectedConversationId,
        leadId,
      );
      if (result?.error) {
        setActionError(result.error);
      } else {
        setShowLinkSearch(false);
        setLeadSearchQuery("");
        loadLeads();
      }
    });
  }

  // Dipanggil setelah LeadForm di panel Inbox berhasil membuat lead baru —
  // langsung hubungkan lead itu ke percakapan yang sedang dibuka.
  function handleNewLeadSaved(leadId: string) {
    if (!selectedConversationId) return;
    setActionError(null);
    startTransition(async () => {
      const result = await linkConversationToLead(
        selectedConversationId,
        leadId,
      );
      if (result?.error) {
        setActionError(result.error);
      } else {
        setShowNewLeadForm(false);
        setShowLinkSearch(false);
        loadLeads();
      }
    });
  }

  return (
    <main className="flex flex-1 h-[calc(100vh-56px)]">
      <aside className="w-80 shrink-0 border-r flex flex-col min-h-0">
        <div className="border-b shrink-0">
          <h1 className="px-4 pt-3 text-lg font-semibold">WhatsApp Inbox</h1>
          <div className="px-3 py-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, number, message…"
              className="w-full border rounded px-3 py-1.5 text-sm"
            />
          </div>
          <div className="px-2 pb-2 flex flex-wrap gap-1">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                className={`text-xs rounded px-2 py-1 ${
                  filter === f.key
                    ? "bg-black text-white"
                    : "text-gray-600 hover:bg-gray-100"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0">
          {messageHits && messageHits.length > 0 && (
            <div className="border-b bg-gray-50">
              <p className="px-4 py-1 text-xs font-medium text-gray-400">
                Message matches
              </p>
              {messageHits.map((hit) => {
                const c = conversations.find(
                  (x) => x.id === hit.conversationId,
                );
                return (
                  <button
                    key={hit.messageId}
                    type="button"
                    onClick={() => {
                      setSelectedConversationId(hit.conversationId);
                      setShowLinkSearch(false);
                      setShowNewLeadForm(false);
                    }}
                    className="text-left w-full px-4 py-2 border-b hover:bg-white"
                  >
                    <span className="text-xs font-medium truncate block">
                      {c ? contactLabel(c) : "Conversation"}
                    </span>
                    <span className="text-xs text-gray-500 truncate block">
                      {hit.direction === "outbound" ? "→ " : ""}
                      {hit.snippet}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {filteredConversations.length === 0 && (
            <p className="p-4 text-sm text-gray-500">
              {conversations.length === 0
                ? "No conversations yet."
                : "Nothing here."}
            </p>
          )}
          {filteredConversations.map((conversation) => {
            const lead = conversation.lead_id
              ? leads.find((l) => l.id === conversation.lead_id)
              : null;
            return (
              <button
                key={conversation.id}
                type="button"
                onClick={() => {
                  setSelectedConversationId(conversation.id);
                  setShowLinkSearch(false);
                  setShowNewLeadForm(false);
                }}
                className={`text-left w-full px-4 py-3 border-b hover:bg-gray-50 ${
                  selectedConversationId === conversation.id ? "bg-gray-100" : ""
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-sm truncate">
                    {contactLabel(conversation)}
                  </span>
                  {conversation.unread_count > 0 && (
                    <span className="bg-black text-white text-xs rounded-full px-1.5 py-0.5 shrink-0">
                      {conversation.unread_count}
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500 truncate">
                  {conversation.last_message_preview || "-"}
                </p>
                {lead && (
                  <p className="text-xs text-gray-400 mt-1 truncate">
                    Lead: {lead.nama}
                  </p>
                )}
                <div className="flex gap-2 mt-1">
                  {!conversation.assigned_to && (
                    <span className="text-xs text-amber-600">Unclaimed</span>
                  )}
                  {conversation.status === "resolved" && (
                    <span className="text-xs text-green-600">Resolved</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      <section className="flex-1 flex flex-col min-h-0">
        {!selectedConversation ? (
          <p className="p-8 text-gray-500 text-sm">
            Select a conversation on the left.
          </p>
        ) : (
          <>
            <div className="border-b px-4 py-3 flex items-center justify-between gap-4 shrink-0">
              <div className="min-w-0">
                <p className="font-medium">{contactLabel(selectedConversation)}</p>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
                  <span>
                    {linkedLead ? (
                      <Link
                        href={`/leads/${linkedLead.id}`}
                        className="hover:underline"
                      >
                        Lead: {linkedLead.nama}
                      </Link>
                    ) : (
                      "Not linked to a lead"
                    )}
                  </span>
                  <span className="flex items-center gap-1">
                    Assigned to:
                    {canAssign ? (
                      <select
                        value={selectedConversation.assigned_to ?? ""}
                        onChange={(e) => handleAssign(e.target.value || null)}
                        disabled={isPending}
                        className="border rounded px-1 py-0.5 text-xs disabled:opacity-50"
                      >
                        <option value="">Unclaimed</option>
                        {profiles.map((profile) => (
                          <option key={profile.id} value={profile.id}>
                            {profileLabel(profile)}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-gray-700">
                        {assigneeProfile
                          ? profileLabel(assigneeProfile)
                          : "Unclaimed"}
                      </span>
                    )}
                  </span>
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                {!selectedConversation.assigned_to && (
                  <button
                    type="button"
                    onClick={handleClaim}
                    disabled={isPending}
                    className="text-sm border rounded px-3 py-1.5 hover:bg-gray-50 disabled:opacity-50"
                  >
                    Claim
                  </button>
                )}
                {selectedConversation.status === "resolved" ? (
                  <button
                    type="button"
                    onClick={() => handleSetStatus("open")}
                    disabled={isPending}
                    className="text-sm border rounded px-3 py-1.5 hover:bg-gray-50 disabled:opacity-50"
                  >
                    Reopen
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleSetStatus("resolved")}
                    disabled={isPending}
                    className="text-sm border rounded px-3 py-1.5 hover:bg-gray-50 disabled:opacity-50"
                  >
                    Mark resolved
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setShowLinkSearch((v) => !v);
                    setShowNewLeadForm(false);
                  }}
                  className="text-sm border rounded px-3 py-1.5 hover:bg-gray-50"
                >
                  {linkedLead ? "Change Lead" : "Link to Lead"}
                </button>
              </div>
            </div>

            {showLinkSearch && (
              <div className="border-b px-4 py-3 bg-gray-50 shrink-0 max-h-[60vh] overflow-y-auto">
                <div className="flex gap-2 mb-2">
                  <input
                    value={leadSearchQuery}
                    onChange={(e) => setLeadSearchQuery(e.target.value)}
                    placeholder="Search lead name/number..."
                    disabled={showNewLeadForm}
                    className="border rounded px-3 py-2 text-sm flex-1 disabled:opacity-50"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewLeadForm((v) => !v)}
                    disabled={isPending}
                    className="text-sm border rounded px-3 py-1.5 hover:bg-gray-50 disabled:opacity-50 whitespace-nowrap"
                  >
                    {showNewLeadForm ? "Cancel" : "+ New Lead"}
                  </button>
                </div>

                {showNewLeadForm ? (
                  // Form lengkap: nomor kontak & sumber "WhatsApp" sudah diisi
                  // dari percakapan; sisanya diketik sales. Setelah tersimpan,
                  // lead otomatis di-link ke percakapan ini (handleNewLeadSaved).
                  <LeadForm
                    initialValues={{
                      kontak: selectedConversation.external_contact_id,
                      nama: selectedConversation.display_name ?? "",
                      sumber: "WhatsApp",
                    }}
                    onSaved={handleNewLeadSaved}
                  />
                ) : (
                  leadSearchResults.length > 0 && (
                    <ul className="flex flex-col gap-1 max-h-40 overflow-y-auto">
                      {leadSearchResults.map((l) => (
                        <li key={l.id}>
                          <button
                            type="button"
                            onClick={() => handleLink(l.id)}
                            className="text-sm text-left w-full px-2 py-1 rounded hover:bg-white"
                          >
                            {l.nama} · {l.kontak}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )
                )}
              </div>
            )}

            {windowClosed && (
              <p className="bg-amber-50 text-amber-700 text-xs px-4 py-2 border-b shrink-0">
                It&apos;s been more than 24 hours since this contact&apos;s
                last message — WhatsApp restricts free-text replies outside
                this window (requires an official message template, not
                supported in this version).
              </p>
            )}

            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2 min-h-0">
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`max-w-md rounded px-3 py-2 text-sm ${
                    m.direction === "outbound"
                      ? "self-end bg-black text-white"
                      : "self-start bg-gray-100"
                  }`}
                >
                  <MessageBody m={m} />
                  <p
                    className={`text-[10px] mt-1 ${
                      m.direction === "outbound"
                        ? "text-gray-300"
                        : "text-gray-400"
                    }`}
                  >
                    {messageTime(m)}
                    {m.direction === "outbound" && ` · ${m.status}`}
                  </p>
                  {m.direction === "outbound" &&
                    m.status === "failed" &&
                    m.type === "text" && (
                      <button
                        type="button"
                        onClick={() => handleRetry(m.id)}
                        disabled={isPending}
                        className="mt-1 text-[10px] underline text-gray-200 disabled:opacity-50"
                      >
                        Retry
                      </button>
                    )}
                </div>
              ))}
            </div>

            {actionError && (
              <p className="text-red-600 text-sm px-4 shrink-0">{actionError}</p>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSend();
              }}
              className="border-t p-4 flex gap-2 shrink-0"
            >
              <input
                ref={fileInputRef}
                type="file"
                onChange={handleFileSelected}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isPending || uploading}
                title="Attach a file"
                className="border rounded px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
              >
                {uploading ? "…" : "📎"}
              </button>
              <input
                value={draftText}
                onChange={(e) => setDraftText(e.target.value)}
                placeholder="Type a message..."
                className="flex-1 border rounded px-3 py-2 text-sm"
              />
              <button
                type="submit"
                disabled={isPending || !draftText.trim()}
                className="bg-black text-white rounded px-4 py-2 text-sm disabled:opacity-50"
              >
                Send
              </button>
            </form>
          </>
        )}
      </section>
    </main>
  );
}
