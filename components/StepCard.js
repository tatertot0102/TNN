// components/StepCard.js
import { useState, useEffect } from 'react'
import { supabase } from '../supabase/client'

const STATUS_LABELS = {
  pending: 'Pending',
  in_review: 'In Review',
  complete: 'Complete',
  rejected: 'Rejected',
}

const STATUS_COLORS = {
  pending: 'bg-gray-600 text-gray-100',
  in_review: 'bg-blue-600 text-blue-100',
  complete: 'bg-green-600 text-green-100',
  rejected: 'bg-red-600 text-red-100',
}

export default function StepCard({ step, me, onChange }) {
  const [approvals, setApprovals] = useState([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadApprovals()
  }, [step?.id])

  async function loadApprovals() {
    if (!step?.id) return
    const { data, error } = await supabase
      .from('approvals')
      .select('id, role_key, decision, approver_id, profiles:approver_id(name)')
      .eq('step_id', step.id)
    if (!error) setApprovals(data || [])
  }

  async function takeDecision(decision) {
    setSaving(true)
    await supabase
      .from('approvals')
      .upsert({
        step_id: step.id,
        role_key: me.role,
        approver_id: me.id,
        decision,
        created_at: new Date().toISOString()
      }, { onConflict: 'step_id,role_key,approver_id' })
    setSaving(false)
    await loadApprovals()
    await onChange?.()
  }

  // unify status: if any rejection → rejected
  // else if approvals < gate_roles → in_review
  // else if all approved → complete
  const totalRoles = step.gate_roles?.length || 0
  const approved = approvals.filter(a => a.decision === 'approved').length
  const rejected = approvals.filter(a => a.decision === 'rejected').length

  let status = 'pending'
  if (rejected > 0) status = 'rejected'
  else if (approved === totalRoles && totalRoles > 0) status = 'complete'
  else if (approved > 0 || approvals.length > 0) status = 'in_review'

  const statusClass = STATUS_COLORS[status]

  return (
    <div className="rounded-lg bg-[#0f1a33] border border-gray-700 p-4">
      {/* Header */}
      <div className="flex justify-between items-center mb-2">
        <h3 className="font-semibold text-white">{step.name}</h3>
        <span className={`px-2 py-1 rounded text-xs ${statusClass}`}>
          {STATUS_LABELS[status]}
        </span>
      </div>

      {/* Due Date */}
      {step.due_date && (
        <div className="text-xs text-gray-400 mb-2">
          Due: {new Date(step.due_date).toLocaleDateString()}
        </div>
      )}

      {/* Approvals */}
      <div className="space-y-1">
        {step.gate_roles?.map(rk => {
          const found = approvals.find(a => a.role_key === rk)
          return (
            <div key={rk} className="flex items-center gap-2 text-sm">
              <span className="text-white font-medium">{rk}</span>
              {found ? (
                <span className={`px-2 py-0.5 rounded text-xs ${STATUS_COLORS[found.decision]}`}>
                  {found.decision} by {found.profiles?.name || found.approver_id?.slice(0, 8)}
                </span>
              ) : (
                <span className="text-gray-400 text-xs">No decision</span>
              )}
            </div>
          )
        })}
      </div>

      {/* Actions */}
      <div className="flex gap-2 mt-3">
        <button
          onClick={() => takeDecision('approved')}
          disabled={saving}
          className="px-3 py-1.5 bg-green-600 hover:bg-green-500 rounded text-white text-sm"
        >
          Approve
        </button>
        <button
          onClick={() => takeDecision('rejected')}
          disabled={saving}
          className="px-3 py-1.5 bg-red-600 hover:bg-red-500 rounded text-white text-sm"
        >
          Reject
        </button>
      </div>
    </div>
  )
}