// components/GateApprovals.js
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabase/client'

const DECISION_PILL = {
  approved: 'bg-green-600 text-green-100',
  rejected: 'bg-red-600 text-red-100',
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
  const [seatProfiles, setSeatProfiles] = useState({})

  const gateRoles = useMemo(() => (step?.gate_roles || []).filter(Boolean), [step])

  useEffect(() => {
    loadApprovals()
    loadMyPools()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step?.id])

  useEffect(() => {
    async function loadSeatProfiles() {
      const userIds = Object.values(approverSeats || {})
        .map(seat => seat.user_id)
        .filter(Boolean)
      if (userIds.length === 0) {
        setSeatProfiles({})
        return
      }
      const { data, error } = await supabase
        .from('profiles')
        .select('id, name, email')
        .in('id', userIds)
      if (!error && data) {
        const profilesMap = {}
        data.forEach(profile => {
          profilesMap[profile.id] = profile
        })
        setSeatProfiles(profilesMap)
      }
    }
    loadSeatProfiles()
  }, [approverSeats])

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
    <div className="space-y-3">
      {gateRoles.map((rk) => {
        const seat = approverSeats?.[rk] || {}
        const decision = lastDecision(rk)
        const label = LABELS[rk] || rk
        const eligible = isEligible(rk)

        return (
          <div key={rk} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="flex items-center gap-3">
              <div className="font-semibold text-gray-100 text-sm">{label}</div>
              {decision ? (
                <span className={`text-xs font-medium px-2 py-0.5 rounded ${DECISION_PILL[decision.decision]}`}>
                  {decision.decision}
                </span>
              ) : null}
            </div>
            <div className="text-xs text-gray-400 sm:flex-1">
              Seat: {seat.user_id ? (seatProfiles[seat.user_id]?.name || seatProfiles[seat.user_id]?.email || seat.user_id.slice(0,8)) : seat.pool_id ? 'Assigned to a pool' : 'Unassigned'}
              {decision && (
                <div className="mt-0.5">
                  by {decision.profiles?.name || decision.profiles?.email || decision.approver_id?.slice(0,8)} ·{' '}
                  {new Date(decision.created_at).toLocaleString()}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => decide(rk, 'approved')}
                disabled={!eligible || saving}
                className={`rounded px-4 py-1.5 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-green-500
                  ${eligible && !saving ? 'bg-green-600 text-white hover:bg-green-700' : 'bg-gray-700 text-gray-400 cursor-not-allowed'}
                `}
              >
                Approve
              </button>
              <button
                onClick={() => decide(rk, 'rejected')}
                disabled={!eligible || saving}
                className={`rounded px-4 py-1.5 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-red-500
                  ${eligible && !saving ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-gray-700 text-gray-400 cursor-not-allowed'}
                `}
              >
                Reject
              </button>
            </div>
          </div>
        )
      })}
      {saving && (
        <div className="text-xs text-gray-400">Saving…</div>
      )}
      {errorMsg && (
        <div className="mt-2 text-sm rounded border border-red-600 bg-red-900/60 text-red-100 px-3 py-2">
          {errorMsg}
        </div>
      )}
    </div>
  )
}