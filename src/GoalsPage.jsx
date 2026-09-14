import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Target,
  Plus,
  Calendar,
  CheckCircle2,
  ChevronRight,
} from 'lucide-react'
import Sidebar from './Sidebar'
import { useAuth } from './AuthContext.jsx'
import { buzz } from './lib/heyFeedback'
import { springs } from './lib/heyMotion.js'
import { createRecord, listRecords } from './lib/heyRecords.js'

const CATEGORIES = ['All', 'Health', 'Wealth', 'Learning', 'Mindset']

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
}

const item = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: springs.gentle },
}

export default function GoalsPage() {
  const { user } = useAuth()
  const [category, setCategory] = useState('All')
  const [expanded, setExpanded] = useState(null)
  const [goals, setGoals] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [newGoalOpen, setNewGoalOpen] = useState(false)
  const [newGoalTitle, setNewGoalTitle] = useState('')
  const [newGoalCategory, setNewGoalCategory] = useState('Mindset')

  useEffect(() => {
    let cancelled = false

    async function loadGoals() {
      if (!user?.id) {
        setLoading(false)
        setGoals([])
        return
      }
      setLoading(true)
      setError('')

      try {
        const records = await listRecords(user.id, 'goal')
        if (cancelled) return
        const savedGoals = records.map((record) => ({
          id: record.id,
          title: record.title,
          category: record.metadata?.category || 'Mindset',
          progress: record.metadata?.progress || 0,
          due: record.due_at ? new Date(record.due_at).toLocaleDateString() : 'Ongoing',
          color: 'var(--gold, #F7C96F)',
          milestones: record.metadata?.milestones || [],
        }))
        setGoals(savedGoals)
      } catch (loadError) {
        if (!cancelled) setError(loadError.message || 'Could not load your goals.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadGoals()

    return () => {
      cancelled = true
    }
  }, [user?.id])

  async function addGoal(event) {
    event.preventDefault()
    const title = newGoalTitle.trim()
    if (!title) return

    const goal = {
      id: `local-${Date.now()}`,
      title,
      category: newGoalCategory,
      progress: 0,
      due: 'Ongoing',
      color: 'var(--gold, #F7C96F)',
      milestones: [],
    }

    try {
      if (user?.id) {
        const saved = await createRecord(user.id, 'goal', {
          title,
          metadata: { category: newGoalCategory, progress: 0, milestones: [] },
        })
        goal.id = saved.id
      }
      setGoals((current) => [goal, ...current])
      setNewGoalTitle('')
      setNewGoalOpen(false)
    } catch (saveError) {
      setError(saveError.message || 'Could not save that goal.')
    }
  }

  const filtered = goals.filter((g) => category === 'All' || g.category === category)

  return (
    <div className="page-with-sidebar">
      <Sidebar />
      <div className="page-content">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Target size={22} color="var(--coral, #FF9E7A)" />
            <h1 style={{ fontFamily: 'Poppins, sans-serif', fontWeight: 700, fontSize: 24 }}>
              Goals
            </h1>
          </div>
          <button onClick={() => setNewGoalOpen((current) => !current)} onPointerDown={() => buzz("light")} className="hey-btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px' }}>
            <Plus size={16} />
            New Goal
          </button>
        </motion.div>
<p style={{ fontSize: 14, color: 'rgba(247,247,247,0.5)', marginBottom: 24 }}>
          Discipline is the bridge between goals and accomplishment.
        </p>

        {error && <p style={{ color: 'var(--coral, #FF9E7A)', fontSize: 13, marginBottom: 16 }}>{error}</p>}

        {newGoalOpen && (
          <form onSubmit={addGoal} className="glass-card" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20, padding: 16 }}>
            <input value={newGoalTitle} onChange={(event) => setNewGoalTitle(event.target.value)} className="hey-input" placeholder="What do you want to accomplish?" aria-label="New goal title" autoFocus />
            <select value={newGoalCategory} onChange={(event) => setNewGoalCategory(event.target.value)} className="hey-input" aria-label="New goal category">
              {CATEGORIES.slice(1).map((value) => <option key={value}>{value}</option>)}
            </select>
            <button type="submit" className="hey-btn-primary">Save Goal</button>
          </form>
        )}

        <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
          {CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              onPointerDown={() => buzz("light")}
              className={category === c ? 'badge badge-coral' : 'badge'}
              style={{ cursor: 'pointer', border: 'none' }}
            >
              {c}
            </button>
          ))}
        </div>

        <motion.div
          variants={container}
          initial="hidden"
          animate="show"
          style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}
        >
          {loading ? (
            <p style={{ color: 'rgba(247,247,247,0.5)', fontSize: 14 }}>Loading your goals...</p>
          ) : filtered.length === 0 ? (
            <p style={{ color: 'rgba(247,247,247,0.5)', fontSize: 14 }}>
              {goals.length === 0
                ? 'No goals yet. Add your first goal to get started.'
                : 'No goals match this category.'}
            </p>
          ) : filtered.map((g) => {
            const isOpen = expanded === g.id
            return (
              <motion.div key={g.id} variants={item} layout className="glass-card" style={{ padding: 20 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>{g.title}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span className="badge">{g.category}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Calendar size={11} color="rgba(247,247,247,0.4)" />
                        <span style={{ fontSize: 11, color: 'rgba(247,247,247,0.4)' }}>{g.due}</span>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => setExpanded(isOpen ? null : g.id)}
                    aria-label={`${isOpen ? 'Collapse' : 'Expand'} goals for ${g.title}`}
                    aria-expanded={isOpen}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex' }}
                  >
                    <motion.div animate={{ rotate: isOpen ? 90 : 0 }} transition={springs.snappy}>
                      <ChevronRight size={18} color="rgba(247,247,247,0.4)" />
                    </motion.div>
                  </button>
                </div>

                <div style={{ marginBottom: 4 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 12, color: 'rgba(247,247,247,0.5)' }}>Progress</span>
                    <span style={{ fontSize: 12, color: g.color, fontWeight: 600 }}>{g.progress}%</span>
                  </div>
                  <div style={{ height: 8, borderRadius: 4, background: 'rgba(247,247,247,0.08)', overflow: 'hidden' }}>
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${g.progress}%` }}
                      transition={springs.gentle}
                      style={{ height: '100%', background: g.color, borderRadius: 4 }}
                    />
                  </div>
                </div>

                <AnimatePresence>
                  {isOpen && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                      style={{ overflow: 'hidden' }}
                    >
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 }}>
                        {g.milestones.map((m, i) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <CheckCircle2 size={14} color={m.done ? g.color : 'rgba(247,247,247,0.2)'} />
                            <span
                              style={{
                                fontSize: 12,
                                color: m.done ? 'rgba(247,247,247,0.6)' : 'rgba(247,247,247,0.4)',
                                textDecoration: m.done ? 'line-through' : 'none',
                              }}
                            >
                              {m.label}
                            </span>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )
          })}
        </motion.div>
      </div>
    </div>
  )
}
