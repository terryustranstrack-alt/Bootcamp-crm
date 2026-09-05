"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { createClient } from "@/lib/supabase/client";
import { logStatusChange } from "@/lib/activity";
import { needsFollowUp } from "@/lib/reminders";
import { useProfiles, profileLabel } from "@/lib/useProfiles";
import { useCurrentProfile } from "@/lib/useCurrentProfile";
import { useBrands } from "@/lib/useBrands";
import {
  LEAD_STATUSES,
  leadStatusLabel,
  type Lead,
  type LeadStatus,
  type Profile,
} from "@/lib/types";

const supabase = createClient();
const SEMUA_SUMBER = "All sources";
const SEMUA_ASSIGNEE = "All assignees";

// Satu kartu lead di dalam kolom Kanban — bisa di-drag ke kolom status lain.
function LeadCard({
  lead,
  profiles,
  onStatusChange,
}: {
  lead: Lead;
  profiles: Profile[];
  onStatusChange: (leadId: string, status: LeadStatus) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: lead.id });

  const overdue = needsFollowUp(lead.status, lead.tanggal_update);
  const assignee = profiles.find((p) => p.id === lead.assigned_to);

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        zIndex: 10,
      }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`border border-[var(--color-border)] rounded-lg p-3 bg-[var(--color-surface)] shadow-sm ${
        isDragging ? "opacity-50" : ""
      } ${overdue ? "border-[var(--color-warning)] border-2" : ""}`}
    >
      <div
        {...listeners}
        {...attributes}
        className="cursor-grab active:cursor-grabbing"
      >
        <Link
          href={`/leads/${lead.id}`}
          className="font-medium hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          {lead.nama}
        </Link>
        <p className="text-xs text-[var(--color-muted)] mb-2">
          Updated: {new Date(lead.tanggal_update).toLocaleString("id-ID")}
        </p>
        {overdue && (
          <p className="text-xs text-[var(--color-warning)] font-medium mb-2">
            Needs follow-up
          </p>
        )}
        <p className="text-xs text-[var(--color-muted)] mb-2">
          {assignee ? profileLabel(assignee) : "Unassigned"}
        </p>
      </div>
      <select
        value={lead.status}
        onChange={(e) => onStatusChange(lead.id, e.target.value as LeadStatus)}
        className="w-full border border-[var(--color-border)] rounded-lg text-sm px-2 py-1"
      >
        {LEAD_STATUSES.map((s) => (
          <option key={s} value={s}>
            {leadStatusLabel(s)}
          </option>
        ))}
      </select>
    </div>
  );
}

// Satu kolom status (mis. "Baru", "Nego") di papan Kanban, berisi semua
// kartu lead yang statusnya sama. Jadi target drop saat drag-and-drop.
function LeadColumn({
  status,
  leads,
  profiles,
  onStatusChange,
}: {
  status: LeadStatus;
  leads: Lead[];
  profiles: Profile[];
  onStatusChange: (leadId: string, status: LeadStatus) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });

  return (
    <div
      ref={setNodeRef}
      className={`flex-shrink-0 w-64 rounded-lg ${isOver ? "bg-[var(--color-muted-bg)]" : ""}`}
    >
      <h2 className="font-semibold mb-3">
        {leadStatusLabel(status)} ({leads.length})
      </h2>
      <div className="flex flex-col gap-3 min-h-8">
        {leads.map((lead) => (
          <LeadCard
            key={lead.id}
            lead={lead}
            profiles={profiles}
            onStatusChange={onStatusChange}
          />
        ))}
      </div>
    </div>
  );
}

// Papan Kanban di halaman utama ("/"): leads dikelompokkan per kolom
// status, bisa di-drag antar kolom untuk ganti status, dengan pencarian +
// filter sumber/assignee/follow-up di atasnya.
export default function LeadBoard() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sumberFilter, setSumberFilter] = useState(SEMUA_SUMBER);
  const [assigneeFilter, setAssigneeFilter] = useState(SEMUA_ASSIGNEE);
  const [followUpOnly, setFollowUpOnly] = useState(false);
  const [brandFilter, setBrandFilter] = useState<string>("all");
  const profiles = useProfiles();
  const brands = useBrands();
  const { profile: currentProfile } = useCurrentProfile();

  async function loadLeads() {
    const { data, error } = await supabase
      .from("leads")
      .select("*")
      .order("tanggal_update", { ascending: false });

    if (error) {
      setError(error.message);
    } else {
      setLeads(data as Lead[]);
      setError(null);
    }
    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadLeads();
  }, []);

  async function handleStatusChange(leadId: string, status: LeadStatus) {
    const oldStatus = leads.find((l) => l.id === leadId)?.status;
    if (oldStatus === status) return;

    const { error } = await supabase
      .from("leads")
      .update({ status, tanggal_update: new Date().toISOString() })
      .eq("id", leadId);

    if (error) {
      setError(error.message);
      return;
    }
    if (oldStatus) {
      const activityError = await logStatusChange(
        supabase,
        leadId,
        oldStatus,
        status,
      );
      if (activityError) setError(activityError);
    }
    loadLeads();
  }

  // Dipanggil dnd-kit saat drag selesai. `active` = kartu lead yang
  // di-drag, `over` = kolom status tempat kartu itu dilepas (atau
  // undefined kalau dilepas di luar area kolom manapun).
  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    handleStatusChange(String(active.id), over.id as LeadStatus);
  }

  // Jarak minimum sebelum drag dianggap mulai, supaya klik singkat ke link
  // nama lead (buka detail) tidak ke-intercept jadi drag.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  // Daftar pilihan filter "Sumber", diambil dari nilai unik yang ada di
  // leads saat ini (bukan daftar tetap) supaya selalu sesuai data nyata.
  const daftarSumber = useMemo(() => {
    const sumberUnik = new Set(
      leads.map((lead) => lead.sumber).filter((s): s is string => !!s),
    );
    return [SEMUA_SUMBER, ...Array.from(sumberUnik).sort()];
  }, [leads]);

  // Terapkan semua filter aktif (pencarian, sumber, assignee, follow-up)
  // sekaligus ke daftar lead sebelum dibagi ke kolom-kolom status.
  const filteredLeads = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return leads.filter((lead) => {
      const cocokPencarian =
        !keyword ||
        lead.nama.toLowerCase().includes(keyword) ||
        lead.kontak.toLowerCase().includes(keyword);
      const cocokSumber =
        sumberFilter === SEMUA_SUMBER || lead.sumber === sumberFilter;
      const cocokAssignee =
        assigneeFilter === SEMUA_ASSIGNEE || lead.assigned_to === assigneeFilter;
      const cocokFollowUp =
        !followUpOnly || needsFollowUp(lead.status, lead.tanggal_update);
      const cocokBrand = brandFilter === "all" || lead.brand_id === brandFilter;
      return (
        cocokPencarian && cocokSumber && cocokAssignee && cocokFollowUp && cocokBrand
      );
    });
  }, [leads, search, sumberFilter, assigneeFilter, followUpOnly, brandFilter]);

  if (loading) {
    return <p className="p-8 text-sm text-[var(--color-muted)]">Loading leads...</p>;
  }
  if (error) {
    return <p className="p-8 text-sm text-[var(--color-danger)]">Failed to load: {error}</p>;
  }

  return (
    <div className="flex flex-col gap-4 p-8">
      <div className="flex flex-wrap gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name or contact..."
          className="border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm w-64"
        />
        <select
          value={sumberFilter}
          onChange={(e) => setSumberFilter(e.target.value)}
          className="border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm"
        >
          {daftarSumber.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          value={assigneeFilter}
          onChange={(e) => setAssigneeFilter(e.target.value)}
          className="border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm"
        >
          <option value={SEMUA_ASSIGNEE}>{SEMUA_ASSIGNEE}</option>
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>
              {profileLabel(p)}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm">
          <input
            type="checkbox"
            checked={followUpOnly}
            onChange={(e) => setFollowUpOnly(e.target.checked)}
          />
          Needs follow-up
        </label>
        {currentProfile?.is_admin && brands.length > 1 && (
          <select
            value={brandFilter}
            onChange={(e) => setBrandFilter(e.target.value)}
            className="border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm"
          >
            <option value="all">All brands</option>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        )}
      </div>
      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div className="flex gap-4 overflow-x-auto">
          {LEAD_STATUSES.map((status) => (
            <LeadColumn
              key={status}
              status={status}
              leads={filteredLeads.filter((lead) => lead.status === status)}
              profiles={profiles}
              onStatusChange={handleStatusChange}
            />
          ))}
        </div>
      </DndContext>
    </div>
  );
}
