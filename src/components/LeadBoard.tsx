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
import { LEAD_STATUSES, type Lead, type LeadStatus, type Profile } from "@/lib/types";

const supabase = createClient();
const SEMUA_SUMBER = "Semua sumber";
const SEMUA_ASSIGNEE = "Semua assignee";

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
      className={`border rounded p-3 bg-white shadow-sm ${
        isDragging ? "opacity-50" : ""
      } ${overdue ? "border-amber-400 border-2" : ""}`}
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
        <p className="text-xs text-gray-500 mb-2">
          Update: {new Date(lead.tanggal_update).toLocaleString("id-ID")}
        </p>
        {overdue && (
          <p className="text-xs text-amber-600 font-medium mb-2">
            Perlu follow-up
          </p>
        )}
        <p className="text-xs text-gray-500 mb-2">
          {assignee ? profileLabel(assignee) : "Belum ditugaskan"}
        </p>
      </div>
      <select
        value={lead.status}
        onChange={(e) => onStatusChange(lead.id, e.target.value as LeadStatus)}
        className="w-full border rounded text-sm px-2 py-1"
      >
        {LEAD_STATUSES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
    </div>
  );
}

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
      className={`flex-shrink-0 w-64 rounded ${isOver ? "bg-blue-50" : ""}`}
    >
      <h2 className="font-semibold mb-3">
        {status} ({leads.length})
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

export default function LeadBoard() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sumberFilter, setSumberFilter] = useState(SEMUA_SUMBER);
  const [assigneeFilter, setAssigneeFilter] = useState(SEMUA_ASSIGNEE);
  const profiles = useProfiles();

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

  const daftarSumber = useMemo(() => {
    const unik = new Set(
      leads.map((lead) => lead.sumber).filter((s): s is string => !!s),
    );
    return [SEMUA_SUMBER, ...Array.from(unik).sort()];
  }, [leads]);

  const filteredLeads = useMemo(() => {
    const q = search.trim().toLowerCase();
    return leads.filter((lead) => {
      const cocokPencarian =
        !q ||
        lead.nama.toLowerCase().includes(q) ||
        lead.kontak.toLowerCase().includes(q);
      const cocokSumber =
        sumberFilter === SEMUA_SUMBER || lead.sumber === sumberFilter;
      const cocokAssignee =
        assigneeFilter === SEMUA_ASSIGNEE || lead.assigned_to === assigneeFilter;
      return cocokPencarian && cocokSumber && cocokAssignee;
    });
  }, [leads, search, sumberFilter, assigneeFilter]);

  if (loading) return <p className="p-8">Memuat leads...</p>;
  if (error) return <p className="p-8 text-red-600">Gagal memuat: {error}</p>;

  return (
    <div className="flex flex-col gap-4 p-8">
      <div className="flex flex-wrap gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari nama atau kontak..."
          className="border rounded px-3 py-2 text-sm w-64"
        />
        <select
          value={sumberFilter}
          onChange={(e) => setSumberFilter(e.target.value)}
          className="border rounded px-3 py-2 text-sm"
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
          className="border rounded px-3 py-2 text-sm"
        >
          <option value={SEMUA_ASSIGNEE}>{SEMUA_ASSIGNEE}</option>
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>
              {profileLabel(p)}
            </option>
          ))}
        </select>
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
