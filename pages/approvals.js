// pages/approvals.js
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../supabase/client'

export default function Approvals() {
  const router = useRouter()
  const [me, setMe] = useState(null)
  const [profile, setProfile] = useState(null)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const isExec = profile?.role === 'executive'
  const isAssoc = profile?.role === 'associate'

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/'); return }
      setMe(user)
      const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      setProfile(prof || null)
      setLoading(false)
    })()
  }, [router])

  useEffect(() => {
    if (!me) return
    ;(async () => {
      // Load gate steps with their segments and seats
      const { data: gates } = await supabase
        .from('steps')
        .select('id, name, segment_id, due_date, gate_roles, is_gate, segments!inner(id, title, created_at)')
        .eq('is_gate', true)
        .order('due_date', { ascending: true })

      // Load seats for all segments in one go
      const segIds = [...new Set((gates || []).map(g => g.segment_id))]
      const { data: seats } = await supabase
        .from('segment_approvers')
        .select('segment_id, role_key, user_id')
        .in('segment_id', segIds)

      // Load approvals log for all gate steps
      const stepIds = (gates || []).map(g => g.id)
      const { data: logs } = await supabase
        .from('approvals')
        .select('id, step_id, role_key, approver_id, decision, created_at')
        .in('step_id', stepIds)

      // Index helpers
      const seatsBySeg = {}
      ;(seats || []).forEach(s => {
        seatsBySeg[s.segment_id] ||= {}
        seatsBySeg[s.segment_id][s.role_key] = s.user_id
      })
      const approvalsByStep = {}
      ;(logs || []).forEach(a => {
        approvalsByStep[a.step_id] ||= []
        approvalsByStep[a.step_id].push(a)
      })

      // Decide which gates are relevant to *me*
      const mine = (gates || []).filter(g => {
        const required = g.gate_roles || []
        const seatMap = seatsBySeg[g.segment_id] || {}
        const amAssigned = required.some(r => seatMap[r] === me.id)
        const amFallback = isExec || isAssoc
        if (!amAssigned && !amFallback) return false

        // If already approved by all required roles, skip
        const log = approvalsByStep[g.id] || []
        const hasFor = roleKey => log.some(a => a.role_key === roleKey && a.decision === 'approved')
        const complete = required.every(hasFor)
        return !complete
      })

      setItems(mine)
    })()
  }, [me, isExec, isAssoc])

  async function act(stepId, preferRoleKeys, decision, comment) {
    // Prefer to approve as an assigned seat if possible, else first unfulfilled required role
    // Load seats + logs for this step
    const { data: step } = await supabase.from('steps').select('segment_id, gate_roles').eq('id', stepId).single()
    const required = step?.gate_roles || []
    const { data: seats } = await supabase
      .from('segment_approvers')
      .select('role_key, user_id')
      .eq('segment_id', step.segment_id)
    const seatMap = {}
    ;(seats || []).forEach(s => seatMap[s.role_key] = s.user_id)
    const { data: logs } = await supabase
      .from('approvals')
      .select('role_key, decision')
      .eq('step_id', stepId)

    let useRole = required.find(r => seatMap[r] === (profile?.id || me?.id))
    if (!useRole) {
      const done = new Set((logs || []).filter(a => a.decision === 'approved').map(a => a.role_key))
      useRole = required.find(r => !done.has(r))
    }
    if (!useRole) return

    const payload = {
      step_id: stepId,
      role_key: useRole,
      approver_id: profile?.id || me.id,
      decision,
      comment: comment || null
    }
    const { error } = await supabase.from('approvals').insert(payload)
    if (error) { alert(error.message || 'Failed to record decision'); return }
    // Refresh list
    router.replace(router.asPath)
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-[#0b132b] text-gray-200">Loading…</div>
  }

  return (
    <div className="min-h-screen bg-[#0b132b] text-gray-200">
      <header className="bg-[#1c2541] text-white shadow">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Approvals</h1>
          <div className="flex gap-2">
            <a href="/dashboard" className="px-3 py-2 rounded bg-[#3a506b] hover:bg-[#5bc0be] text-sm">Dashboard</a>
            <a href="/my-tasks" className="px-3 py-2 rounded bg-[#3a506b] hover:bg-[#5bc0be] text-sm">My Tasks</a>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-6 space-y-4">
        {items.length === 0 ? (
          <div className="rounded-lg bg-[#1c2541] shadow p-6">No approvals waiting on you.</div>
        ) : (
          <div className="rounded-lg bg-[#1c2541] shadow divide-y divide-gray-700">
            {items.map(g => (
              <GateRow key={g.id} gate={g} onAct={act} />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}

function GateRow({ gate, onAct }) {
  const [comment, setComment] = useState('')
  return (
    <div className="p-4">
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <div className="text-white font-semibold">{gate.segments?.title || `Segment ${gate.segment_id}`}</div>
          <div className="text-sm text-gray-300">{gate.name} · Due {gate.due_date ? new Date(gate.due_date).toLocaleDateString() : '—'}</div>
        </div>
        <a href={`/segments/${gate.segment_id}`} className="text-xs text-[#6fffe9] hover:underline">Open</a>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <input
          className="flex-1 text-sm rounded border border-gray-600 bg-[#0b132b] text-gray-200 px-2 py-1"
          placeholder="Optional comment"
          value={comment}
          onChange={(e)=>setComment(e.target.value)}
        />
        <button
          onClick={()=>onAct(gate.id, gate.gate_roles, 'approved', comment)}
          className="px-3 py-1 rounded bg-green-700 hover:bg-green-600 text-white text-sm"
        >
          Approve
        </button>
        <button
          onClick={()=>onAct(gate.id, gate.gate_roles, 'rejected', comment)}
          className="px-3 py-1 rounded bg-red-700 hover:bg-red-600 text-white text-sm"
        >
          Reject
        </button>
      </div>
    </div>
  )
}
