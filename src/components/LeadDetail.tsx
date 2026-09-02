"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { logNote, logStatusChange } from "@/lib/activity";
import {
  buildLeadUpdate,
  leadToEditForm,
  type LeadEditForm,
} from "@/lib/leadEdit";
import { useSumberOptions } from "@/lib/useSumberOptions";
import { useProfiles, profileLabel } from "@/lib/useProfiles";
import { useCurrentProfile } from "@/lib/useCurrentProfile";
import SumberSelect from "@/components/SumberSelect";
import AssigneeSelect from "@/components/AssigneeSelect";
import CurrencyInput from "@/components/CurrencyInput";
import {
  LEAD_STATUSES,
  leadStatusLabel,
  type Lead,
  type LeadActivity,
  type LeadStatus,
} from "@/lib/types";

const supabase = createClient();

// Halaman detail satu lead: tampilkan datanya, izinkan edit/hapus/ganti
// status, dan tampilkan + tambah riwayat aktivitas (catatan & histori
// perubahan status).
export default function LeadDetail({ leadId }: { leadId: string }) {
  const router = useRouter();
  const [lead, setLead] = useState<Lead | null>(null);
  const [activities, setActivities] = useState<LeadActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [catatanBaru, setCatatanBaru] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<LeadEditForm>({
    nama: "",
    kontak: "",
    sumber: "",
    produk: "",
    estimasi_nilai: "",
    kota: "",
    perusahaan: "",
    jabatan: "",
    catatan: "",
    assigned_to: "",
  });
  const [saving, setSaving] = useState(false);
  const sumberOptions = useSumberOptions();
  const profiles = useProfiles();
  const { profile: currentProfile } = useCurrentProfile();
  const [hasWaConversation, setHasWaConversation] = useState(false);

  async function loadLead() {
    const { data, error } = await supabase
      .from("leads")
      .select("*")
      .eq("id", leadId)
      .single();

    if (error) {
      setError(error.message);
    } else {
      setLead(data as Lead);
      setError(null);
    }
    setLoading(false);
  }

  async function loadActivities() {
    const { data, error } = await supabase
      .from("lead_activities")
      .select("*")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false });

    if (!error) {
      setActivities(data as LeadActivity[]);
    }
  }

  // Cek apakah lead ini punya percakapan WhatsApp terhubung, supaya bisa
  // tampilkan link pintasan "View in Inbox".
  async function loadWaConversation() {
    const { data } = await supabase
      .from("conversations")
      .select("id")
      .eq("lead_id", leadId)
      .maybeSingle();
    setHasWaConversation(!!data);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadLead();
    loadActivities();
    loadWaConversation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadId]);

  // Ganti status lead (dropdown di halaman) — update datanya lalu catat
  // perubahan ke riwayat aktivitas supaya bisa dilihat kapan/oleh apa
  // statusnya berubah.
  async function handleStatusChange(status: LeadStatus) {
    if (!lead) return;
    const oldStatus = lead.status;

    const { error } = await supabase
      .from("leads")
      .update({ status, tanggal_update: new Date().toISOString() })
      .eq("id", leadId);

    if (error) {
      setError(error.message);
      return;
    }
    if (oldStatus !== status) {
      const activityError = await logStatusChange(
        supabase,
        leadId,
        oldStatus,
        status,
      );
      if (activityError) setError(activityError);
    }
    loadLead();
    loadActivities();
  }

  // Tambah catatan bebas ke riwayat aktivitas (form "Add Note").
  async function handleAddCatatan(e: FormEvent) {
    e.preventDefault();
    if (!lead || !catatanBaru.trim()) return;

    setSubmitting(true);
    const activityError = await logNote(
      supabase,
      leadId,
      catatanBaru.trim(),
    );
    if (activityError) {
      setError(activityError);
      setSubmitting(false);
      return;
    }

    const { error } = await supabase
      .from("leads")
      .update({ tanggal_update: new Date().toISOString() })
      .eq("id", leadId);

    setSubmitting(false);

    if (error) {
      setError(error.message);
      return;
    }
    setCatatanBaru("");
    loadLead();
    loadActivities();
  }

  // Isi form edit dengan data lead saat ini, lalu buka mode edit.
  function startEdit() {
    if (!lead) return;
    setEditForm(leadToEditForm(lead));
    setIsEditing(true);
  }

  // Simpan perubahan dari form edit. Payload update + daftar field yang
  // benar-benar berubah dibangun di buildLeadUpdate (dipakai bareng dengan
  // ProspekTable). Ringkasan perubahannya dicatat ke riwayat aktivitas
  // ("Lead data updated: name, product.") bukan cuma "diedit".
  async function handleSaveEdit(e: FormEvent) {
    e.preventDefault();
    if (!lead) return;
    setSaving(true);

    const { update, changedLabels } = buildLeadUpdate(
      editForm,
      lead,
      !!currentProfile?.is_admin,
    );

    const { error } = await supabase
      .from("leads")
      .update(update)
      .eq("id", leadId);

    if (error) {
      setError(error.message);
      setSaving(false);
      return;
    }

    if (changedLabels.length > 0) {
      const activityError = await logNote(
        supabase,
        leadId,
        `Lead data updated: ${changedLabels.join(", ")}.`,
      );
      if (activityError) setError(activityError);
    }

    setSaving(false);
    setIsEditing(false);
    loadLead();
    loadActivities();
  }

  // Hapus lead — pakai pola "klik dua kali untuk konfirmasi": klik pertama
  // cuma ubah teks tombol jadi "Confirm delete?", klik kedua baru benar-benar
  // menghapus. Kalau tombol kehilangan fokus (onBlur di JSX di bawah),
  // konfirmasi dibatalkan lagi supaya tidak ke-klik tidak sengaja nanti.
  async function handleDelete() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }

    setDeleting(true);
    const { error } = await supabase.from("leads").delete().eq("id", leadId);

    if (error) {
      setError(error.message);
      setDeleting(false);
      return;
    }
    router.push("/");
  }

  if (loading) return <p className="p-8">Loading lead...</p>;
  if (error) return <p className="p-8 text-red-600">Failed to load: {error}</p>;
  if (!lead) return <p className="p-8">Lead not found.</p>;

  return (
    <main className="p-8 max-w-2xl flex flex-col gap-6">
      <Link
        href="/"
        className="text-sm text-gray-500 hover:underline self-start"
      >
        ← Back to Board
      </Link>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">{lead.nama}</h1>
          <p className="text-sm text-gray-500">
            Added: {new Date(lead.tanggal_masuk).toLocaleString("id-ID")} ·
            Last updated:{" "}
            {new Date(lead.tanggal_update).toLocaleString("id-ID")}
          </p>
          {hasWaConversation && (
            <Link
              href="/inbox"
              className="text-sm text-green-700 hover:underline"
            >
              💬 Has a WhatsApp conversation — View in Inbox
            </Link>
          )}
        </div>
        <div className="flex shrink-0 gap-2">
          {!isEditing && (
            <button
              type="button"
              onClick={startEdit}
              className="text-sm border rounded px-3 py-1.5 hover:bg-gray-50"
            >
              Edit
            </button>
          )}
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            onBlur={() => setConfirmDelete(false)}
            className="text-sm text-red-600 border border-red-600 rounded px-3 py-1.5 hover:bg-red-50 disabled:opacity-50"
          >
            {deleting
              ? "Deleting..."
              : confirmDelete
                ? "Confirm delete?"
                : "Delete Lead"}
          </button>
        </div>
      </div>

      {isEditing ? (
        <form
          onSubmit={handleSaveEdit}
          className="flex flex-col gap-4 border rounded p-4"
        >
          <div className="flex flex-col gap-1">
            <label htmlFor="edit-nama" className="text-sm font-medium">
              Name
            </label>
            <input
              id="edit-nama"
              required
              value={editForm.nama}
              onChange={(e) =>
                setEditForm({ ...editForm, nama: e.target.value })
              }
              className="border rounded px-3 py-2"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="edit-kontak" className="text-sm font-medium">
              Contact (WhatsApp/phone number)
            </label>
            <input
              id="edit-kontak"
              required
              value={editForm.kontak}
              onChange={(e) =>
                setEditForm({ ...editForm, kontak: e.target.value })
              }
              className="border rounded px-3 py-2"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="edit-sumber" className="text-sm font-medium">
              Source
            </label>
            <SumberSelect
              id="edit-sumber"
              value={editForm.sumber}
              onChange={(sumber) => setEditForm({ ...editForm, sumber })}
              options={sumberOptions}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="edit-perusahaan" className="text-sm font-medium">
              Company
            </label>
            <input
              id="edit-perusahaan"
              value={editForm.perusahaan}
              onChange={(e) =>
                setEditForm({ ...editForm, perusahaan: e.target.value })
              }
              className="border rounded px-3 py-2"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="edit-jabatan" className="text-sm font-medium">
              Job title
            </label>
            <input
              id="edit-jabatan"
              value={editForm.jabatan}
              onChange={(e) =>
                setEditForm({ ...editForm, jabatan: e.target.value })
              }
              className="border rounded px-3 py-2"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="edit-kota" className="text-sm font-medium">
              City/region
            </label>
            <input
              id="edit-kota"
              value={editForm.kota}
              onChange={(e) =>
                setEditForm({ ...editForm, kota: e.target.value })
              }
              className="border rounded px-3 py-2"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="edit-produk" className="text-sm font-medium">
              Product/need
            </label>
            <input
              id="edit-produk"
              value={editForm.produk}
              onChange={(e) =>
                setEditForm({ ...editForm, produk: e.target.value })
              }
              className="border rounded px-3 py-2"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label
              htmlFor="edit-estimasi_nilai"
              className="text-sm font-medium"
            >
              Estimated deal value
            </label>
            <CurrencyInput
              id="edit-estimasi_nilai"
              value={editForm.estimasi_nilai}
              onChange={(estimasi_nilai) =>
                setEditForm({ ...editForm, estimasi_nilai })
              }
              className="border rounded px-3 py-2"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="edit-catatan" className="text-sm font-medium">
              Notes / requirements
            </label>
            <textarea
              id="edit-catatan"
              value={editForm.catatan}
              onChange={(e) =>
                setEditForm({ ...editForm, catatan: e.target.value })
              }
              rows={3}
              className="border rounded px-3 py-2"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="edit-assigned_to" className="text-sm font-medium">
              Assigned to
            </label>
            {currentProfile?.is_admin ? (
              <AssigneeSelect
                id="edit-assigned_to"
                value={editForm.assigned_to || null}
                onChange={(assigned_to) =>
                  setEditForm({ ...editForm, assigned_to: assigned_to ?? "" })
                }
                profiles={profiles}
              />
            ) : (
              <p className="text-sm text-gray-500 px-3 py-2 border rounded bg-gray-50">
                {currentProfile ? profileLabel(currentProfile) : "-"}
              </p>
            )}
          </div>

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="bg-black text-white rounded px-4 py-2 text-sm disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save Changes"}
            </button>
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              disabled={saving}
              className="border rounded px-4 py-2 text-sm hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <dt className="text-gray-500">Contact</dt>
          <dd>{lead.kontak}</dd>

          <dt className="text-gray-500">Source</dt>
          <dd>{lead.sumber || "-"}</dd>

          <dt className="text-gray-500">Company</dt>
          <dd>{lead.perusahaan || "-"}</dd>

          <dt className="text-gray-500">Job title</dt>
          <dd>{lead.jabatan || "-"}</dd>

          <dt className="text-gray-500">City/region</dt>
          <dd>{lead.kota || "-"}</dd>

          <dt className="text-gray-500">Product/need</dt>
          <dd>{lead.produk || "-"}</dd>

          <dt className="text-gray-500">Estimated value</dt>
          <dd>
            {lead.estimasi_nilai != null
              ? lead.estimasi_nilai.toLocaleString("id-ID")
              : "-"}
          </dd>

          <dt className="text-gray-500">Assigned to</dt>
          <dd>
            {profiles.find((p) => p.id === lead.assigned_to)
              ? profileLabel(profiles.find((p) => p.id === lead.assigned_to)!)
              : "Unassigned"}
          </dd>

          <dt className="text-gray-500">Status</dt>
          <dd>
            <select
              value={lead.status}
              onChange={(e) =>
                handleStatusChange(e.target.value as LeadStatus)
              }
              className="border rounded text-sm px-2 py-1"
            >
              {LEAD_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {leadStatusLabel(s)}
                </option>
              ))}
            </select>
          </dd>
        </dl>
      )}

      {!isEditing && lead.catatan && (
        <div>
          <h2 className="font-medium mb-2">Notes / requirements</h2>
          <pre className="whitespace-pre-wrap text-sm bg-gray-50 border rounded p-3">
            {lead.catatan}
          </pre>
        </div>
      )}

      <div>
        <h2 className="font-medium mb-2">Activity history</h2>
        <form onSubmit={handleAddCatatan} className="flex flex-col gap-2 mb-4">
          <textarea
            value={catatanBaru}
            onChange={(e) => setCatatanBaru(e.target.value)}
            placeholder="Add a new note..."
            className="border rounded px-3 py-2 text-sm"
            rows={3}
          />
          <button
            type="submit"
            disabled={submitting || !catatanBaru.trim()}
            className="self-start bg-black text-white rounded px-4 py-2 text-sm disabled:opacity-50"
          >
            {submitting ? "Saving..." : "Add Note"}
          </button>
        </form>

        <ul className="flex flex-col gap-3">
          {activities.length === 0 && (
            <li className="text-sm text-gray-500">No activity yet.</li>
          )}
          {activities.map((activity) => (
            <li
              key={activity.id}
              className="border rounded p-3 text-sm bg-white"
            >
              <p className="text-xs text-gray-500 mb-1">
                {new Date(activity.created_at).toLocaleString("id-ID")}
              </p>
              {activity.type === "status_change" ? (
                <p>
                  Status changed from{" "}
                  <span className="font-medium">
                    {activity.old_status ? leadStatusLabel(activity.old_status) : "-"}
                  </span>{" "}
                  to{" "}
                  <span className="font-medium">
                    {activity.new_status ? leadStatusLabel(activity.new_status) : "-"}
                  </span>
                </p>
              ) : (
                <p className="whitespace-pre-wrap">{activity.content}</p>
              )}
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
