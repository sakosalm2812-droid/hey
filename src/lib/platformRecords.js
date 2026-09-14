import { supabase } from "./supabase.js";

export async function listPermissions(userId) {
  const { data, error } = await supabase
    .from("hey_permissions")
    .select("*")
    .eq("user_id", userId)
    .order("permission");
  if (error) throw error;
  return data || [];
}

export async function setPermission(userId, permission, status, scope = "account") {
  const { data, error } = await supabase
    .from("hey_permissions")
    .upsert({ user_id: userId, permission, scope, status, updated_at: new Date().toISOString() }, { onConflict: "user_id,permission,scope" })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function listDevices(userId) {
  const { data, error } = await supabase
    .from("hey_devices")
    .select("id, platform, name, status, capabilities, last_seen_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}
