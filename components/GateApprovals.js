// components/GateApprovals.js
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabase/client'

const DECISION_PILL = {
  approved: 'bg-green-700/70 text-green-100 border border-green-600',
  rejected: 'bg-red-700/70 text-red-100 border border-red-600',
}

const LABELS = {
  script_editor: 'Script Editor',
  content_strategist: 'Content Strategist',
  director: 'Director',
  post_supervisor: 'Post Supervisor',
  publisher: 'Publisher',
}

export default function GateApprovals({ step, segmentId, approverSeats, me, myProfile, onChange }) {
  const [approvals, setApprovals] = useState([])
  const [myPools, setMyPools] = useState([])
  const [saving, setSaving] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  const gateRoles = useMemo(() => (step?.gate_roles || []).filter(Boolean), [step])

  useEffect(() => {
    loadApprovals()
    loadMyPools()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step?.id])

  async function loadApprovals() {
    const { data, error } = await supabase
      .from('approvals')
      .select('id, role_key, approver_id, decision, created_at, profiles:approver_id(name, email)')
      .eq('step_id', step.id)
      .order('created_at', { ascending: false })
    if (!error) setApprovals(data || [])
  }

  async function loadMyPools() {
    if (!me?.id) return
    const { data } = await supabase
      .from('role_pool_members')
      .select('pool_id')
      .eq('user_id', me.id)
    setMyPools((data || []).map(r => r.pool_id))
  }

  function isEligible(roleKey) {
    const seat = approverSeats?.[roleKey]
    if (!seat) return false
    if (seat.user_id && seat.user_id === me?.id) return true
    if (seat.pool_id && myPools.includes(seat.pool_id)) return true
    return false
  }

  function lastDecision(roleKey) {
    return approvals.find(a => a.role_key === roleKey) || null
  }

  async function decide(roleKey, decision) {
    setErrorMsg('')
    setSaving(true)

    const base = { step_id: Number(step.id), role_key: roleKey, approver_id: me.id }
    const nowIso = new Date().toISOString()

    // upsert with conflict on (step_id, role_key, approver_id)
    let { error } = await supabase
      .from('approvals')
      .upsert({ ...base, decision, created_at: nowIso }, { onConflict: 'step_id,role_key,approver_id' })
      .select()

    if (error) {
      // fallback update/insert
      const { data: existing } = await supabase
        .from('approvals')
        .select('id')
        .match(base)
        .maybeSingle()
      if (!existing) {
        await supabase.from('approvals').insert({ ...base, decision, created_at: nowIso })
      } else {
        await supabase.from('approvals').update({ decision, created_at: nowIso }).match(base)
      }
    }

    setSaving(false)
    await loadApprovals()
    await onChange?.()
  }

  if (!gateRoles.length) return null

  return (
    <div className="mt-3 rounded-lg bg-[#0f1a33] border border-gray-700 p-3">
      <div className="flex items-center justify-between mb-2">
        <h4 className="font-semibold text-white text-sm">Approvals Required</h4>
        {saving && <span className="text-xs text-gray-300">Saving…</span>}
      </div>

      <ul className="space-y-2">
        {gateRoles.map((rk) => {
          const seat = approverSeats?.[rk] || {}
          const decision = lastDecision(rk)
          const label = LABELS[rk] || rk
          const eligible = isEligible(rk)

          return (
            <li key={rk} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded-md bg-[#0b132b] border border-gray-700 p-2">
              <div>
                <div className="text-white text-sm font-medium">{label}</div>
                <div className="text-xs text-gray-400">
                  Seat: {seat.user_id ? 'Assigned to a person' : seat.pool_id ? 'Assigned to a pool' : 'Unassigned'}
                </div>

                {decision ? (
                  <div className="mt-1 inline-flex items-center gap-2">
                    <span className={`text-xs px-2 py-0.5 rounded ${DECISION_PILL[decision.decision] || 'bg-gray-700 text-gray-200'}`}>
                      {decision.decision}
                    </span>
                    <span className="text-xs text-gray-400">
                      by {decision.profiles?.name || decision.profiles?.email || decision.approver_id?.slice(0,8)}
                      {' · '}
                      {new Date(decision.created_at).toLocaleString()}
                    </span>
                  </div>
                ) : (
                  <div className="mt-1 text-xs text-gray-400">No decision yet</div>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => decide(rk, 'approved')}
                  className={`px-3 py-1.5 rounded text-sm transition
                    ${eligible ? 'bg-green-600 hover:bg-green-500 text-white' : 'bg-gray-700 text-gray-300 cursor-pointer hover:bg-gray-600'}
                  `}
                >
                  Approve
                </button>
                <button
                  onClick={() => decide(rk, 'rejected')}
                  className={`px-3 py-1.5 rounded text-sm transition
                    ${eligible ? 'bg-red-600 hover:bg-red-500 text-white' : 'bg-gray-700 text-gray-300 cursor-pointer hover:bg-gray-600'}
                  `}
                >
                  Reject
                </button>
              </div>
            </li>
          )
        })}
      </ul>

      {errorMsg && (
        <div className="mt-3 text-sm rounded border border-red-600 bg-red-900/60 text-red-100 px-3 py-2">
          {errorMsg}
        </div>
      )}
    </div>
  )
}