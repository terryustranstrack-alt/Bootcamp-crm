import type { createClient } from "@/lib/supabase/client";
import type { LeadStatus } from "@/lib/types";

type SupabaseBrowserClient = ReturnType<typeof createClient>;

export async function logStatusChange(
  supabase: SupabaseBrowserClient,
  leadId: string,
  oldStatus: LeadStatus,
  newStatus: LeadStatus,
): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from("lead_activities").insert({
    lead_id: leadId,
    type: "status_change",
    old_status: oldStatus,
    new_status: newStatus,
    created_by: user?.id ?? null,
  });

  return error?.message ?? null;
}

export async function logNote(
  supabase: SupabaseBrowserClient,
  leadId: string,
  content: string,
): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from("lead_activities").insert({
    lead_id: leadId,
    type: "note",
    content,
    created_by: user?.id ?? null,
  });

  return error?.message ?? null;
}
