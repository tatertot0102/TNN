// components/GateApprovals.js
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabase/client'

const LABELS = {
  script_editor: 'Script Editor',
  content_strategist: 'Content Strategist',
  director: 'Director',
  post_supervisor: 'Post Supervisor',
  producer: 'Producer',
  publisher: 'Publisher',
  pitch_editor: 'Pitch Editor',
  final_reviewer: 'Final Reviewer'
}

export default function GateApprovals({ step, segmentId, approverSeats, me, myProfile, onChange }) {
  const required = step.gate_roles || []
  const [log, setLog] = useState([])
  const [peopleById, setPeopleById] = useState({})
  const [comment, setComment] = useState('')
  const [myPools, setMyPools] = useState([]) // [{pool_id, role_key}]
  const isExecOrAssoc = myProfile?.role === 'executive' || myProfile?.role === 'associate'

  useEffect(() => {
    ;(async () => {
      const [{ data: a }, { data: ppl }] = await Promise.all([
        supabase.from('approvals').select('id, role_key, approver_id, decision, comment, created_at').eq('step_id', step.id).order('created_at', { ascending: true }),
        supabase.from('profiles').select('id, name, email')
      ])
      setLog(a || [])
      const map = {}
      ;(ppl || []).forEach(p => { map[p.id] = p })
      setPeopleById(map)
    })()
  }, [step.id])

  useEffect(() => {
    ;(async () => {
      // Find pools I’m in (so we can show "You can approve via pool")
      const { data: pools } = await supabase
        .from('role_pool_members')
        .select('pool_id')
        .eq('user_id', myProfile?.id || me?.id || '')
      setMyPools(pools || [])
    })()
  }, [me, myProfile])

  const statusByRole = useMemo(() => {
    const out = {}
    required.forEach(r => { out[r] = null })
    for (const a of log) {
      if (!required.includes(a.role_key)) continue
      out[a.role_key] = a.decision === 'approved' ? a : { ...a, rejected: true }
    }
    return out
  }, [log, required])

  const approvedCount = Object.values(statusByRole).filter(v => v && !v.rejected).length
  const anyRejected   = Object.values(statusByRole).some(v => v?.rejected)

  const canApprove = useMemo(() => {
    if (!myProfile) return false
    if (isExecOrAssoc) return true
    // explicit seat
    const isExplicit = required.some(r => approverSeats?.[r]?.user_id === myProfile.id)
    if (isExplicit) return true
    // via pool (only if that seat uses a pool and I’m in it)
    const myPoolIds = new Set(myPools.map(x => x.pool_id))
    return required.some(r => {
      const poolId = approverSeats?.[r]?.pool_id
      return poolId && myPoolIds.has(poolId)
    })
  }, [myProfile, approverSeats, required, myPools, isExecOrAssoc])

  async function act(decision) {
    if (!canApprove) return

    // Prefer explicit seat for me; else the first role where I’m eligible
    const myPoolIds = new Set(myPools.map(x => x.pool_id))
    let useRole = required.find(r => approverSeats?.[r]?.user_id === myProfile.id)
    if (!useRole) {
      useRole = required.find(r => {
        const poolId = approverSeats?.[r]?.pool_id
        return poolId && myPoolIds.has(poolId)
      })
    }
    if (!useRole) useRole = required[0] // fallback for exec override

    const payload = {
      step_id: step.id,
      role_key: useRole,
      approver_id: myProfile.id,
      decision,
      comment: comment || null
    }
    const { error } = await supabase.from('approvals').insert(payload)
    if (error) { alert(error.message || 'Failed to record decision'); return }
    setComment('')
    const { data: a } = await supabase
      .from('approvals')
      .select('id, role_key, approver_id, decision, comment, created_at')
      .eq('step_id', step.id).order('created_at', { ascending: true })
    setLog(a || [])
    onChange?.()
  }

  function SeatRow({ roleKey }) {
    const seat = approverSeats?.[roleKey] || {}
    const res  = statusByRole[roleKey]
    const name = seat.user_id
      ? (peopleById[seat.user_id]?.name || peopleById[seat.user_id]?.email || (seat.user_id || '').slice(0,8))
      : (seat.pool_id ? `Pool: ${seat.pool_id}` : 'Unassigned')

    const poolHint = seat.pool_id
      ? <span className="ml-2 text-xs text-[#6fffe9]">({myPools.some(p=>p.pool_id===seat.pool_id) ? 'You’re eligible via pool' : 'Pool assigned'})</span>
      : null

    const chip = res
      ? res.rejected
        ? <span className="text-xs px-2 py-0.5 rounded bg-red-700 text-red-100">Needs changes</span>
        : <span className="text-xs px-2 py-0.5 rounded bg-green-700 text-green-100">Approved</span>
      : <span className="text-xs px-2 py-0.5 rounded bg-gray-700 text-gray-200">Pending</span>

    const overrideNote = res && res.approver_id && seat.user_id && seat.user_id !== res.approver_id
      ? ` · Approved by ${peopleById[res.approver_id]?.name || (res.approver_id || '').slice(0,8)} (not assigned)`
      : ''

    return (
      <div className="flex items-center justify-between">
        <div className="text-sm">
          <span className="text-gray-300">{LABELS[roleKey] || roleKey}:</span>{' '}
          <span className="text-white font-medium">{name}</span>
          {poolHint}
          <span className="text-gray-400">{overrideNote}</span>
        </div>
        {chip}
      </div>
    )
  }

  return (
    <div className="rounded-lg bg-[#0f1a33] border border-gray-700 p-4 space-y-3">
      <div className="text-sm text-gray-300">
        Gate requires <span className="font-semibold text-white">{required.length}</span> approval(s) ·{' '}
        <span className="font-semibold text-white">{approvedCount}</span>/<span className="font-semibold text-white">{required.length}</span> complete
        {anyRejected && <span className="ml-2 text-red-400">(revisions required)</span>}
      </div>

      <div className="space-y-2">
        {required.map(r => <SeatRow key={r} roleKey={r} />)}
      </div>

      <div className="flex items-center gap-2">
        <input
          className="flex-1 text-sm rounded border border-gray-600 bg-[#0b132b] text-gray-200 px-2 py-1"
          placeholder="Optional note"
          value={comment}
          onChange={(e)=>setComment(e.target.value)}
          disabled={!canApprove}
        />
        <button
          className={`px-3 py-1 text-sm rounded ${canApprove ? 'bg-green-700 hover:bg-green-600 text-white' : 'bg-gray-700 text-gray-400 cursor-not-allowed'}`}
          onClick={() => canApprove && act('approved')}
          disabled={!canApprove}
        >
          Approve
        </button>
        <button
          className={`px-3 py-1 text-sm rounded ${canApprove ? 'bg-red-700 hover:bg-red-600 text-white' : 'bg-gray-700 text-gray-400 cursor-not-allowed'}`}
          onClick={() => canApprove && act('rejected')}
          disabled={!canApprove}
        >
          Needs changes
        </button>
      </div>
    </div>
  )
}
