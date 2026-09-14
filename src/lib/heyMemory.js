import { supabase } from './supabase.js'
import { saveMemoryNode } from './intelligenceRecords.js'
import { recordAudit } from '../core/auditLog.js'

export async function getMemory(userId) {
  const { data, error } = await supabase
    .from('memory')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error(error)
    return []
  }

  return data
}

export async function addMemory(userId, memory, category = 'general') {
  const { error } = await supabase
    .from('memory')
    .insert({
      user_id: userId,
      memory,
      category
    })

  if (error) {
    console.error(error)
    return false
  }

  saveMemoryNode({ id: `${userId}:${memory}`, value: memory, type: category, confidence: category === 'pinned' ? 1 : 0.7 }).catch((error) => {
    recordAudit({ action: "memory.node_failed", status: "failed", metadata: { reason: error.message } });
  })

  return true
}

export async function deleteMemory(id) {
  const { error } = await supabase
    .from('memory')
    .delete()
    .eq('id', id)

  if (error) {
    console.error(error)
    return false
  }

  return true
}

export async function searchMemory(userId, query) {
  const { data, error } = await supabase
    .from('memory')
    .select('*')
    .eq('user_id', userId)
    .ilike('memory', `%${query}%`)

  if (error) {
    console.error(error)
    return []
  }

  return data
}
