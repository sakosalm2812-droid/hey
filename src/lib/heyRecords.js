import { supabase } from "./supabase.js";

export async function listRecords(userId, kind, search = "") {
  let query = supabase
    .from("hey_records")
    .select("*")
    .eq("user_id", userId)
    .eq("kind", kind)
    .order("created_at", { ascending: false });

  if (search.trim()) {
    const term = search.trim().replace(/[%_]/g, "");
    query = query.or(`title.ilike.%${term}%,content.ilike.%${term}%`);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function createRecord(userId, kind, record) {
  const { data, error } = await supabase
    .from("hey_records")
    .insert({
      user_id: userId,
      kind,
      title: record.title || "Untitled",
      content: record.content || "",
      status: record.status || "active",
      metadata: record.metadata || {},
      due_at: record.dueAt || null,
    })
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

export async function updateRecord(id, changes) {
  const { data, error } = await supabase
    .from("hey_records")
    .update({
      ...changes,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

export async function deleteRecord(id) {
  const { error } = await supabase
    .from("hey_records")
    .delete()
    .eq("id", id);

  if (error) throw error;
}
