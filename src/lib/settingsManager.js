import { supabase } from './supabase.js';

export async function getSettings(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('settings')
    .eq('id', userId)
    .single();

  if (error) {
    console.error('Failed to load settings:', error);
    return {};
  }

  return data?.settings || {};
}

export async function updateSettings(userId, settings) {
  const { error } = await supabase
    .from('profiles')
    .update({ settings, updated_at: new Date().toISOString() })
    .eq('id', userId);

  if (error) {
    console.error('Failed to update settings:', error);
    throw error;
  }

  return true;
}

export async function toggleSetting(userId, settingName) {
  const current = await getSettings(userId);
  const newValue = !current[settingName];
  const updated = { ...current, [settingName]: newValue };
  await updateSettings(userId, updated);
  return updated;
}
