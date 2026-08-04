"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { LEAD_STATUSES, type Lead, type LeadStatus } from "@/lib/types";

export default function LeadBoard() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
    const { error } = await supabase
      .from("leads")
      .update({ status, tanggal_update: new Date().toISOString() })
      .eq("id", leadId);

    if (error) {
      setError(error.message);
      return;
    }
    loadLeads();
  }

  if (loading) return <p className="p-8">Memuat leads...</p>;
  if (error) return <p className="p-8 text-red-600">Gagal memuat: {error}</p>;

  return (
    <div className="flex gap-4 overflow-x-auto p-8">
      {LEAD_STATUSES.map((status) => {
        const leadsInStatus = leads.filter((lead) => lead.status === status);
        return (
          <div key={status} className="flex-shrink-0 w-64">
            <h2 className="font-semibold mb-3">
              {status} ({leadsInStatus.length})
            </h2>
            <div className="flex flex-col gap-3">
              {leadsInStatus.map((lead) => (
                <div key={lead.id} className="border rounded p-3 bg-white shadow-sm">
                  <Link href={`/leads/${lead.id}`} className="font-medium hover:underline">
                    {lead.nama}
                  </Link>
                  <p className="text-xs text-gray-500 mb-2">
                    Update: {new Date(lead.tanggal_update).toLocaleString("id-ID")}
                  </p>
                  <select
                    value={lead.status}
                    onChange={(e) =>
                      handleStatusChange(lead.id, e.target.value as LeadStatus)
                    }
                    className="w-full border rounded text-sm px-2 py-1"
                  >
                    {LEAD_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
