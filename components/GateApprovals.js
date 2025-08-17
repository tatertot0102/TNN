// components/GateApprovals.js
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabase/client'

// Decision pill styles
const DECISION_STYLES = {
  approved: 'bg-green-700/70 text-green-100 border border-green-600',
  rejected: 'bg-red-700/70 text-red-100 border border-red-600'
}

const STATUS_STYLES = {
  not_started: 'bg-gray-700 text-gray-200',
  in_progress: 'bg-blue-700/70 text-blue-100 border border-blue-600',
  completed: 'bg-green-700/70 text-green-100 border border-green-600',
  rejected: 'bg-red-700/70 text-red-100 border border-red-600',
}

// Display labels for canonical role keys
const GATE_LABELS = {
  script_editor: 'Script Editor',
  content_strategist: 'Content Strategist',
  director: 'Director',
  post_supervisor: 'Post Supervisor',
  publisher: 'Publisher',
}

function normalizeRoleKey(raw) {
  const k = String(raw || '').trim().toLowerCase()
  if (k === 'pitch_editor') return 'script_editor'
  if (k === 'final_reviewer') return 'post_supervisor'
  return k
}

export default function StepCard({
  step,              // { id, name, gate_roles: text[], status, due_date }
  segmentId,
  approverSeats,
  me,
  myProfile,
  onChange
}) {
  const [approvals, setApprovals] = useState([])
  const [myPoolIds, setMyPoolIds] = useState([])
  const [saving, setSaving] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  const gateRoles = useMemo(
    () => Array.from(new Set((step?.gate_roles || []).map(normalizeRoleKey))).filter(Boolean),
    [step]
  )

  useEffect(() => {
    loadApprovals()
    loadMyPools()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step?.id])

  async function loadApprovals() {
    if (!step?.id) return
    const { data, error } = await supabase
      .from('approvals')
      .select('id, role_key, approver_id, decision, created_at, profiles:approver_id(name, email)')
      .eq('step_id', step.id)
      .order('created_at', { ascending: false })
    if (!error) setApprovals(data || [])
  }

  async function loadMyPools() {
    if (!me?.id) return
    const { data, error } = await supabase
      .from('role_pool_members')
      .select('pool_id')
      .eq('user_id', me.id)
    if (!error) setMyPoolIds((data || []).map(r => r.pool_id))
  }

  function isLikelyEligible(roleKey) {
    const seat = approverSeats?.[roleKey]
    if (!seat) return false
    if (seat.user_id && me?.id && seat.user_id === me.id) return true
    if (seat.pool_id && myPoolIds.includes(seat.pool_id)) return true
    return false
  }

  function lastDecisionByRole(roleKey) {
    return approvals.find(a => a.role_key === roleKey) || null
  }

  // Determine status automatically based on approvals
  const computedStatus = useMemo(() => {
    if (gateRoles.length === 0) return 'not_started'
    if (approvals.length === 0) return 'not_started'
    // Check if any rejection
    if (approvals.some(a => a.decision === 'rejected')) return 'rejected'
    // Check if all approved
    const approvedSet = new Set(approvals.filter(a => a.decision === 'approved').map(a => a.role_key))
    const allApproved = gateRoles.every(rk => approvedSet.has(rk))
    if (allApproved) return 'completed'
    return 'in_progress'
  }, [approvals, gateRoles])

  async function takeDecision(roleKeyRaw, decision) {
    const roleKey = normalizeRoleKey(roleKeyRaw)
    setErrorMsg('')
    setSaving(true)

    const stepIdNum = Number(step.id)
    if (!Number.isFinite(stepIdNum)) {
      setSaving(false)
      setErrorMsg(`This step id ("${step.id}") is not a number. Check steps.id type.`)
      return
    }
    if (!me?.id) {
      setSaving(false)
      setErrorMsg('Not authenticated.')
      return
    }

    const rowBase = { step_id: stepIdNum, role_key: roleKey, approver_id: me.id }
    const nowIso = new Date().toISOString()

    let { error } = await supabase
      .from('approvals')
      .upsert({ ...rowBase, decision, created_at: nowIso }, { onConflict: 'step_id,role_key,approver_id' })
      .select()

    if (error) {
      console.warn('approvals upsert failed; fallback', error)
      const { data: existing } = await supabase
        .from('approvals')
        .select('id')
        .match(rowBase)
        .maybeSingle()

      if (!existing) {
        await supabase.from('approvals').insert({ ...rowBase, decision, created_at: nowIso })
      } else {
        await supabase.from('approvals').update({ decision, created_at: nowIso }).match(rowBase)
      }
    }

    setSaving(false)
    await loadApprovals()
    await onChange?.()
  }

  const status = computedStatus
  const statusLabel = status.replace('_', ' ')
  const dueDate = step?.due_date ? new Date(step.due_date) : null
  const isOverdue = dueDate && dueDate < new Date() && status !== 'completed'

  // Calculate approval progress for progress bar
  const totalRoles = gateRoles.length
  const approvedCount = approvals.filter(a => a.decision === 'approved').map(a => a.role_key)
    .filter((v, i, a) => a.indexOf(v) === i).length
  const progressPercent = totalRoles > 0 ? Math.round((approvedCount / totalRoles) * 100) : 0

  return (
    <div className="rounded-lg bg-[#0f1a33] border border-gray-700 p-4">
      {/* Header with name, status, due date */}
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold text-white">{step?.name || `Step ${step?.id}`}</h3>
        <div className="flex items-center gap-3">
          {dueDate && (
            <span className={`text-xs ${isOverdue ? 'text-red-400 font-semibold' : 'text-gray-300'}`}>
              Due {dueDate.toLocaleDateString()}
            </span>
          )}
          <span className={`text-xs px-2 py-0.5 rounded ${STATUS_STYLES[status] || STATUS_STYLES.not_started}`}>
            {statusLabel}
          </span>
          {saving && <div className="text-xs text-gray-300">Saving…</div>}
        </div>
      </div>

      {/* Progress bar */}
      {totalRoles > 0 && (
        <div className="w-full bg-gray-700 rounded h-2 mb-4 overflow-hidden">
          <div
            className={`h-2 rounded bg-green-600 transition-all duration-300`}
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      )}

      {gateRoles.length === 0 ? (
        <div className="text-sm text-gray-300">No gates required for this step.</div>
      ) : (
        <ul className="space-y-3">
          {gateRoles.map((rk) => {
            const label = GATE_LABELS[rk] || rk
            const seat = approverSeats?.[rk] || {}
            const decision = lastDecisionByRole(rk)
            const eligible = isLikelyEligible(rk)

            return (
              <li key={rk} className="rounded-md bg-[#0b132b] border border-gray-700 p-3">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-white font-medium">{label}</div>
                    <div className="text-xs text-gray-400">
                      Seat: {seat.user_id ? 'Assigned to a person' : seat.pool_id ? 'Assigned to a pool' : 'Unassigned'}
                    </div>

                    {decision ? (
                      <div className="mt-1 inline-flex items-center gap-2">
                        <span className={`text-xs px-2 py-0.5 rounded ${DECISION_STYLES[decision.decision] || 'bg-gray-700 text-gray-200'}`}>
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
                    {eligible && (
                      <>
                        <button
                          onClick={() => takeDecision(rk, 'approved')}
                          className="px-3 py-1.5 rounded text-sm bg-green-600 hover:bg-green-500 text-white transition"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => takeDecision(rk, 'rejected')}
                          className="px-3 py-1.5 rounded text-sm bg-red-600 hover:bg-red-500 text-white transition"
                        >
                          Reject
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}