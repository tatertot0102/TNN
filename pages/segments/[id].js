// pages/segments/[id].js
import { useRouter } from 'next/router'
import { useEffect, useMemo, useState, useCallback } from 'react'
import { supabase } from '../../supabase/client'
import AssigneeSelect from '../../components/AssigneeSelect'
import UploadAsset from '../../components/UploadAsset'
import GateApprovals from '../../components/GateApprovals' // now renders unified StepCard-style approvals section
import AssignApprovers from '../../components/AssignApprovers'

const BADGE_STYLES = {
  NotStarted: 'bg-gray-700 text-gray-200',
  InProgress: 'bg-blue-700 text-blue-100',
  Complete: 'bg-green-700 text-green-100',
  Rejected: 'bg-red-700 text-red-100',
}

export default function SegmentDetail() {
  const router = useRouter()
  const { id } = router.query

  const [me, setMe] = useState(null)
  const [profile, setProfile] = useState(null)
  const [segment, setSegment] = useState(null)
  const [steps, setSteps] = useState([])
  const [assetsMap, setAssetsMap] = useState({})
  const [approvalsMap, setApprovalsMap] = useState({}) // stepId -> approvals[]
  const [approverSeats, setApproverSeats] = useState({}) // role_key -> { user_id, pool_id }
  const [profilesMap, setProfilesMap] = useState({}) // user_id -> display name/email
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const canEdit = useMemo(
    () => ['executive', 'associate'].includes(profile?.role),
    [profile]
  )

  // Load auth + profile
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/'); return }
      setMe(user)
      const { data: prof } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()
      setProfile(prof || null)
    })()
  }, [router])

  // Helper to load everything for this segment
  const reloadAll = useCallback(async () => {
    if (!id) return

    // Segment
    const { data: seg } = await supabase
      .from('segments')
      .select('*')
      .eq('id', id)
      .single()
    setSegment(seg || null)

    // Steps ordered by due date
    const { data: st } = await supabase
      .from('steps')
      .select('id, name, phase, due_date, status, assigned_to, is_gate, gate_roles')
      .eq('segment_id', id)
      .order('due_date', { ascending: true })
    const stepsArr = st || []
    setSteps(stepsArr)

    // Approver seats for this segment (include pool_id)
    const { data: seatRows } = await supabase
      .from('segment_approvers')
      .select('role_key, user_id, pool_id')
      .eq('segment_id', id)

    const seats = {}
    ;(seatRows || []).forEach(r => {
      seats[r.role_key] = { user_id: r.user_id || null, pool_id: r.pool_id || null }
    })
    setApproverSeats(seats)

    // Assets for all steps
    await loadAssetsForSteps(stepsArr.map(s => s.id))

    // Approvals for all steps
    await loadApprovalsForSteps(stepsArr.map(s => s.id))

    // Profiles for assignee display
    await loadProfilesForAssigned(stepsArr.map(s => s.assigned_to).filter(Boolean))
  }, [id])

  // Initial load
  useEffect(() => {
    if (!id) return
    setLoading(true)
    reloadAll().finally(() => setLoading(false))
  }, [id, reloadAll])

  async function loadAssetsForSteps(stepIds) {
    if (!stepIds?.length) return
    const { data } = await supabase
      .from('assets')
      .select('id, step_id, file_url, description, uploaded_at')
      .in('step_id', stepIds)
      .order('uploaded_at', { ascending: false })
    const map = {}
    ;(data || []).forEach(a => {
      if (!map[a.step_id]) map[a.step_id] = []
      map[a.step_id].push(a)
    })
    setAssetsMap(map)
  }

  async function loadApprovalsForSteps(stepIds) {
    if (!stepIds?.length) return
    const { data } = await supabase
      .from('approvals')
      .select('id, step_id, role_key, decision, approver_id, created_at')
      .in('step_id', stepIds)
      .order('created_at', { ascending: false })
    const map = {}
    ;(data || []).forEach(a => {
      if (!map[a.step_id]) map[a.step_id] = []
      map[a.step_id].push(a)
    })
    setApprovalsMap(map)
  }

  async function loadProfilesForAssigned(userIds) {
    const ids = Array.from(new Set(userIds))
    if (!ids.length) { setProfilesMap({}); return }
    const { data } = await supabase
      .from('profiles')
      .select('id, name, email')
      .in('id', ids)
    const map = {}
    ;(data || []).forEach(p => {
      map[p.id] = p.name || p.email || p.id
    })
    setProfilesMap(map)
  }

  async function updateStep(stepId, patch) {
    setSaving(true)
    const { error } = await supabase
      .from('steps')
      .update(patch)
      .eq('id', stepId)
    setSaving(false)
    if (error) { alert(error.message || 'Failed to update'); return }
    setSteps(prev => prev.map(s => s.id === stepId ? { ...s, ...patch } : s))
  }

  // Derived status from approvals (unifies the view)
  function derivedStatus(step) {
    const approvals = approvalsMap[step.id] || []
    const totalRoles = (step.gate_roles || []).length

    // latest decision per role
    const latestByRole = {}
    for (const a of approvals) {
      if (!latestByRole[a.role_key]) latestByRole[a.role_key] = a
    }
    const decisions = Object.values(latestByRole)
    const approved = decisions.filter(d => d.decision === 'approved').length
    const rejected = decisions.filter(d => d.decision === 'rejected').length

    if (rejected > 0) return 'Rejected'
    if (totalRoles > 0 && approved === totalRoles) return 'Complete'
    if (decisions.length > 0 || step.status === 'In Progress' || step.status === 'Under Review') return 'In Progress'
    return 'Not Started'
  }

  function progressPercent(step) {
    const total = (step.gate_roles || []).length
    if (!total) return 0
    const approvals = approvalsMap[step.id] || []
    const seen = new Set()
    let approved = 0
    for (const a of approvals) {
      if (seen.has(a.role_key)) continue
      seen.add(a.role_key)
      if (a.decision === 'approved') approved += 1
    }
    return Math.round((approved / total) * 100)
  }

  function assigneeLabel(uid) {
    if (!uid) return 'Unassigned'
    return profilesMap[uid] || uid
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0b132b] text-gray-200">
        Loading…
      </div>
    )
  }

  if (!segment) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0b132b] text-gray-200">
        Not found
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0b132b] text-gray-200">
      {/* Header */}
      <header className="bg-[#1c2541] text-white shadow">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <button
              onClick={() => router.push('/dashboard')}
              className="text-[#6fffe9] hover:underline text-sm"
            >
              ← Back
            </button>
            <h1 className="text-2xl font-semibold text-white mt-1">{segment.title}</h1>
            <p className="text-sm text-gray-300">{segment.description || '—'}</p>
          </div>
          <div className="text-sm text-gray-300">
            Role: <span className="capitalize">{profile?.role}</span>
          </div>
        </div>
      </header>

      {/* Main timeline */}
      <main className="max-w-5xl mx-auto px-6 py-6 space-y-8">
        {/* Approver seat assignment */}
        <AssignApprovers segmentId={segment.id} myProfile={profile} />

        {/* Timeline */}
        <div className="relative pl-8">
          {/* Vertical line */}
          <div className="absolute left-3 top-0 bottom-0 w-0.5 bg-slate-700"></div>

          {steps.map((step) => {
            const status = derivedStatus(step)
            const pct = progressPercent(step)
            const due = step.due_date ? new Date(step.due_date) : null
            const overdue = due && due < new Date() && status !== 'Complete'

            return (
              <div key={step.id} className="relative mb-10">
                {/* Timeline dot */}
                <div className="absolute left-0 top-4 w-3 h-3 rounded-full bg-[#6fffe9] border-2 border-[#0b132b]"></div>

                {/* Step card */}
                <div className="ml-6 p-5 rounded-lg bg-[#1c2541] shadow space-y-4">
                  {/* Header row */}
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-white font-semibold">{step.name}</h3>
                      <div className="text-xs text-gray-300">
                        {due ? (
                          <span className={overdue ? 'text-red-400 font-semibold' : ''}>
                            Due {due.toLocaleDateString()}
                          </span>
                        ) : 'No due date'}
                      </div>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded ${BADGE_STYLES[status] || BADGE_STYLES.NotStarted}`}>
                      {status.replace(/([A-Z])/g, ' $1').trim()}
                    </span>
                  </div>

                  {/* Progress bar */}
                  {(step.gate_roles || []).length > 0 && (
                    <div>
                      <div className="h-2 w-full bg-[#0b132b] rounded overflow-hidden">
                        <div
                          className="h-2 bg-[#6fffe9]"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <div className="text-xs text-gray-300 mt-1">{pct}% approvals</div>
                    </div>
                  )}

                  {/* Due date + assignee controls */}
                  <div className="flex flex-wrap items-center gap-4 text-sm text-gray-300">
                    <div className="flex items-center gap-2">
                      <span className="opacity-80">Assigned:</span>
                      {canEdit ? (
                        <AssigneeSelect
                          value={step.assigned_to}
                          onChange={(val) => updateStep(step.id, { assigned_to: val || null })}
                        />
                      ) : (
                        <span>{assigneeLabel(step.assigned_to)}</span>
                      )}
                    </div>
                    {canEdit && (
                      <input
                        type="date"
                        className="text-sm rounded border border-gray-600 bg-[#0b132b] text-gray-200 px-2 py-1"
                        value={step.due_date || ''}
                        onChange={(e) => updateStep(step.id, { due_date: e.target.value })}
                      />
                    )}
                  </div>

                  {/* Gate approvals integrated */}
                  {step.is_gate && (
                    <GateApprovals
                      step={step}
                      segmentId={segment.id}
                      approverSeats={approverSeats}
                      me={me}
                      myProfile={profile}
                      onChange={reloadAll}    // refresh everything after Approve/Reject
                    />
                  )}

                  {/* Assets */}
                  <div>
                    <div className="text-xs text-gray-400 mb-1">Assets</div>
                    <div className="space-y-1">
                      {(assetsMap[step.id] || []).map(a => (
                        <div key={a.id} className="flex items-center justify-between">
                          <a
                            href={a.file_url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-sm text-[#6fffe9] hover:underline break-all"
                          >
                            {a.description || a.file_url}
                          </a>
                          <span className="text-xs text-gray-500">
                            {new Date(a.uploaded_at).toLocaleString()}
                          </span>
                        </div>
                      ))}
                      {canEdit && (
                        <UploadAsset
                          segmentId={segment.id}
                          stepId={step.id}
                          onUploaded={() => loadAssetsForSteps(steps.map(s => s.id))}
                        />
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </main>

      {saving && (
        <div className="fixed bottom-4 right-4 bg-gray-900 text-white text-sm px-3 py-2 rounded shadow">
          Saving…
        </div>
      )}
    </div>
  )
}
