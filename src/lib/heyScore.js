import { supabase } from './supabase.js'

export async function getHEYScore(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('hey_score')
    .eq('id', userId)
    .single()

  if (error) {
    console.error(error)
    return 0
  }

  return data?.hey_score ?? 0
}

export async function setHEYScore(userId, score) {
  const { error } = await supabase
    .from('profiles')
    .update({
      hey_score: score
    })
    .eq('id', userId)

  if (error) {
    console.error(error)
    return false
  }

  return true
}

export async function increaseHEYScore(userId, amount = 1) {
  const current = await getHEYScore(userId)

  const next = current + amount

  await setHEYScore(userId, next)

  return next
}

export async function decreaseHEYScore(userId, amount = 1) {
  const current = await getHEYScore(userId)

  const next = Math.max(0, current - amount)

  await setHEYScore(userId, next)

  return next
}
