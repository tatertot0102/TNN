// pages/segments/[id].js
import { useRouter } from 'next/router'
import { useEffect, useMemo, useState, useCallback } from 'react'
import { supabase } from '../../supabase/client'
import UploadAsset from '../../components/UploadAsset'
import GateApprovals from '../../components/GateApprovals'
import Comments from '../../components/Comments'
import SegmentSettings from './SegmentSettings'

const BADGE = {
  'Not Started': 'bg-gray-700 text-gray-100',
  'In Progress': 'bg-blue-700 text-blue-100',
  'Awaiting Approvals': 'bg-amber-700 text-amber-100',
  'Changes Requested': 'bg-purple-700 text-purple-100',
  'Complete': 'bg-green-700 text-green-100',
  'Rejected': 'bg-red-700 text-red-100',
}

export default function SegmentDetail() {
  const router = useRouter()
  const { id } = router.query

  const [me, setMe] = useState(null)
  const [profile, setProfile] = useState(null)
  const [segment, setSegment] = useState(null)
  const [steps, setSteps] = useState([])
  const [assetsMap, setAssetsMap] = useState({})          // stepId -> assets[]
  const [approvalsMap, setApprovalsMap] = useState({})    // stepId -> approvals[]
  const [approverSeats, setApproverSeats] = useState({})  // role_key -> { user_id, pool_id }
  const [profilesMap, setProfilesMap] = useState({})      // user_id -> display
  const [expandedAssets, setExpandedAssets] = useState({})// stepId -> bool
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showSettings, setShowSettings] = useState(false) // segment settings modal

  const isLeader = useMemo(
    () => ['executive','associate'].includes(profile?.role),
    [profile]
  )

  // Auth & my profile
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/'); return }
      setMe(user)
      const { data: prof } = await supabase
        .from('profiles').select('*').eq('id', user.id).single()
      setProfile(prof || null)
    })()
  }, [router])

  // Load segment context
  const reloadAll = useCallback(async () => {
    if (!id) return

    // Fetch the segment
    const { data: seg } = await supabase
      .from('segments').select('*').eq('id', id).single()

    // Fetch segment owner profile if exists
    let ownerName = ''
    if (seg?.owner_id) {
      const { data: ownerProfile } = await supabase
        .from('profiles')
        .select('name,email')
        .eq('id', seg.owner_id)
        .single()
      ownerName = ownerProfile?.name || ownerProfile?.email || seg.owner_id
    }
    setSegment(seg ? { ...seg, ownerName } : null)

    const { data: st } = await supabase
      .from('steps')
      .select('id, name, phase, due_date, status, assigned_to, is_gate, gate_roles')
      .eq('segment_id', id)
      .order('due_date', { ascending: true })
    const stepsArr = st || []
    setSteps(stepsArr)

    const { data: seatRows } = await supabase
      .from('segment_approvers')
      .select('role_key, user_id, pool_id')
      .eq('segment_id', id)

    const seats = {}
    ;(seatRows || []).forEach(r => {
      seats[r.role_key] = { user_id: r.user_id || null, pool_id: r.pool_id || null }
    })
    setApproverSeats(seats)

    await loadAssetsForSteps(stepsArr.map(s => s.id))
    await loadApprovalsForSteps(stepsArr.map(s => s.id))
    await loadProfilesForAssigned(stepsArr.map(s => s.assigned_to).filter(Boolean))
  }, [id])

  useEffect(() => {
    if (!id) return
    setLoading(true)
    reloadAll().finally(() => setLoading(false))
  }, [id, reloadAll])

  // Data helpers
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

  // Derived approvals info
  function latestPerRole(stepId) {
    const arr = approvalsMap[stepId] || []
    const byRole = {}
    for (const a of arr) {
      if (!byRole[a.role_key]) byRole[a.role_key] = a
    }
    return Object.values(byRole)
  }
  function approvedCount(step) {
    return latestPerRole(step.id).filter(d => d.decision === 'approved').length
  }
  function rejectedCount(step) {
    return latestPerRole(step.id).filter(d => d.decision === 'rejected').length
  }
  function approvalsProgress(step) {
    const total = (step.gate_roles || []).length
    if (!total) return 0
    return Math.round((approvedCount(step) / total) * 100)
  }

  // Lifecycle derivation (explicit status takes precedence, then gates logic)
  function derivedStatus(step) {
    const total = (step.gate_roles || []).length
    const approved = approvedCount(step)
    const rejected = rejectedCount(step)

    // Always respect explicit statuses first
    if (step.status === 'Complete') return 'Complete'
    if (step.status === 'Rejected') return 'Rejected'
    if (step.status === 'Awaiting Approvals') return 'Awaiting Approvals'
    if (step.status === 'Changes Requested') return 'Changes Requested'
    if (step.status === 'In Progress') return 'In Progress'

    // Gates-derived states
    if (rejected > 0) return 'Rejected'
    if (total > 0 && approved === total) return 'Complete'

    return 'Not Started'
  }

  // Display helpers
  function formatDue(d) {
    // If it's a DATE string ('YYYY-MM-DD'), render as-is (avoids tz issues).
    if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) return d
    if (!d) return 'No due date'
    const dt = new Date(d)
    if (Number.isNaN(dt.getTime())) return 'No due date'
    return dt.toLocaleDateString()
  }

  // Permissions for action buttons
  function canStart(step) {
    const isAssignee = step.assigned_to && me?.id === step.assigned_to
    return derivedStatus(step) === 'Not Started' && (isLeader || isAssignee)
  }
  function canSendApprovals(step) {
    const st = derivedStatus(step)
    const isAssignee = step.assigned_to && me?.id === step.assigned_to
    return step.is_gate && st === 'In Progress' && (isLeader || isAssignee)
  }
  function canMarkComplete(step) {
    // For non-gated steps, allow owner/leader to complete while in progress
    if (step.is_gate) return false
    const st = derivedStatus(step)
    return st === 'In Progress' && (isLeader || me?.id === step.assigned_to)
  }
  function canReopen(step) {
    if (step.is_gate) return false
    return ['Rejected', 'Complete', 'Awaiting Approvals'].includes(derivedStatus(step)) && isLeader
  }
  function canReset(step) {
    if (step.is_gate) return false
    return derivedStatus(step) !== 'Not Started' && isLeader
  }

  // Mutations
  async function updateStep(stepId, patch) {
    setSaving(true)
    const { error } = await supabase.from('steps').update(patch).eq('id', stepId)
    setSaving(false)
    if (error) { alert(error.message || 'Failed to update'); return }
    setSteps(prev => prev.map(s => s.id === stepId ? { ...s, ...patch } : s))
  }
  const startStep       = (step) => updateStep(step.id, { status: 'In Progress' })
  const sendApprovals   = (step) => updateStep(step.id, { status: 'Awaiting Approvals' })
  const markComplete    = (step) => updateStep(step.id, { status: 'Complete' })
  const reopenStep      = (step) => updateStep(step.id, { status: 'In Progress' })
  const resetToNotStart = (step) => updateStep(step.id, { status: 'Not Started' })

  // Helper to update segment
  async function updateSegment(patch) {
    setSaving(true)
    const { error } = await supabase.from('segments').update(patch).eq('id', segment.id)
    setSaving(false)
    if (error) { alert(error.message || 'Failed to update segment'); return }
    await reloadAll()
  }

  // Delete segment
  async function deleteSegment() {
    if (!window.confirm('Are you sure you want to delete this segment? This action cannot be undone.')) return
    setSaving(true)
    const { error } = await supabase.from('segments').delete().eq('id', segment.id)
    setSaving(false)
    if (error) { alert(error.message || 'Failed to delete segment'); return }
    router.push('/dashboard')
  }

  // UI
  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-[#0b132b] text-gray-200">Loading…</div>
  }
  if (!segment) {
    return <div className="min-h-screen flex items-center justify-center bg-[#0b132b] text-gray-200">Not found</div>
  }

  return (
    <div className="min-h-screen bg-[#0b132b] text-gray-200">
      {/* Header */}
      <header className="bg-[#1c2541] text-white shadow">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <button onClick={() => router.push('/dashboard')} className="text-[#6fffe9] hover:underline text-sm">← Back</button>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold text-white mt-1">{segment.title}</h1>
            </div>
            {segment?.ownerName && (
              <div className="text-sm text-gray-300 mt-1">
                Owner: <span className="text-gray-100">{segment.ownerName}</span>
                <button
                  className="ml-2 p-1 rounded hover:bg-gray-700 text-gray-300 focus:outline-none"
                  onClick={() => setShowSettings(true)}
                  title="Segment settings"
                >
                  ⚙️ Settings
                </button>
              </div>
            )}
          </div>
          <div className="flex items-center gap-4">
            <div className="text-sm text-gray-300">Role: <span className="capitalize">{profile?.role}</span></div>
          </div>
        </div>
      </header>

      {/* Body */}
      <main className="max-w-5xl mx-auto px-6 py-6 space-y-8">
        {/* Decision seats removed from main view; they live in settings modal now */}

        <div className="relative pl-8">
          <div className="absolute left-3 top-0 bottom-0 w-0.5 bg-slate-700" />

          {steps.map((step) => {
            const st = derivedStatus(step)
            const pct = approvalsProgress(step)
            const dueStr = formatDue(step.due_date)
            const overdue = (typeof step.due_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(step.due_date))
              ? (new Date(step.due_date + 'T23:59:59') < new Date() && st !== 'Complete')
              : false

            const primaryAsset = (assetsMap[step.id] || [])[0]
            const moreAssets = (assetsMap[step.id] || []).slice(1)
            const showMore = !!expandedAssets[step.id]

            return (
              <div key={step.id} className="relative mb-10">
                {/* Timeline dot */}
                <div className="absolute left-0 top-4 w-3 h-3 rounded-full bg-[#6fffe9] border-2 border-[#0b132b]" />

                <div className="ml-6 p-5 rounded-lg bg-[#1c2541] shadow space-y-4">
                  {/* Header */}
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-white font-semibold">{step.name}</h3>
                      <div className={`text-xs ${overdue ? 'text-red-400 font-semibold' : 'text-gray-300'}`}>
                        Due {dueStr}
                      </div>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded ${BADGE[st] || BADGE['Not Started']}`}>{st}</span>
                  </div>

                  {/* Approvals progress (only for gated steps) */}
                  {step.is_gate && (step.gate_roles || []).length > 0 && (
                    <div>
                      <div className="h-2 w-full bg-[#0b132b] rounded overflow-hidden">
                        <div className="h-2 bg-[#6fffe9]" style={{ width: `${pct}%` }} />
                      </div>
                      <div className="text-xs text-gray-300 mt-1">{pct}% approvals</div>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    {canStart(step) && (
                      <button onClick={() => startStep(step)} className="px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white">
                        Start Step
                      </button>
                    )}
                    {canSendApprovals(step) && (
                      <button onClick={() => sendApprovals(step)} className="px-3 py-1.5 rounded bg-amber-600 hover:bg-amber-500 text-white">
                        Send for Approvals
                      </button>
                    )}
                    {canMarkComplete(step) && (
                      <button onClick={() => markComplete(step)} className="px-3 py-1.5 rounded bg-green-600 hover:bg-green-500 text-white">
                        Mark Complete
                      </button>
                    )}
                    {canReopen(step) && (
                      <button onClick={() => reopenStep(step)} className="px-3 py-1.5 rounded bg-gray-600 hover:bg-gray-500 text-white">
                        Reopen
                      </button>
                    )}
                    {canReset(step) && (
                      <button onClick={() => resetToNotStart(step)} className="px-3 py-1.5 rounded bg-gray-700 hover:bg-gray-600 text-white">
                        Reset to Not Started
                      </button>
                    )}

                    {/* Date controls on the right */}
                    {isLeader && (
                      <input
                        type="date"
                        className="text-sm rounded border border-gray-600 bg-[#0b132b] text-gray-200 px-2 py-1"
                        value={typeof step.due_date === 'string' ? step.due_date : ''}
                        onChange={(e) => updateStep(step.id, { due_date: e.target.value })}
                        title="Change due date"
                      />
                    )}
                  </div>

                  {/* Primary Asset */}
                  <div className="border-t border-gray-700 pt-3">
                    <div className="text-xs text-gray-400 mb-1">Primary Asset</div>
                    {primaryAsset ? (
                      <div className="flex items-center justify-between">
                        <a
                          href={primaryAsset.file_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sm text-[#6fffe9] hover:underline break-all"
                        >
                          {primaryAsset.description || primaryAsset.file_url.split('/').pop()}
                        </a>
                        <span className="text-xs text-gray-500">
                          {new Date(primaryAsset.uploaded_at).toLocaleString()}
                        </span>
                      </div>
                    ) : (
                      <div className="text-sm text-gray-300">No files yet.</div>
                    )}
                    {(isLeader || me?.id === step.assigned_to) && (
                      <div className="mt-2">
                        <UploadAsset
                          segmentId={segment.id}
                          stepId={step.id}
                          onUploaded={() => loadAssetsForSteps(steps.map(s => s.id))}
                          hideDescription
                        />
                      </div>
                    )}

                    {/* More files toggle */}
                    {(moreAssets.length > 0) && (
                      <div className="mt-2">
                        <button
                          onClick={() => setExpandedAssets(prev => ({ ...prev, [step.id]: !prev[step.id] }))}
                          className="text-xs text-gray-300 underline"
                        >
                          {showMore ? 'Hide other files' : `Show ${moreAssets.length} more file(s)`}
                        </button>
                        {showMore && (
                          <div className="mt-2 space-y-1">
                            {moreAssets.map(a => (
                              <div key={a.id} className="flex items-center justify-between">
                                <a
                                  href={a.file_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-sm text-[#6fffe9] hover:underline break-all"
                                >
                                  {a.description || a.file_url.split('/').pop()}
                                </a>
                                <span className="text-xs text-gray-500">
                                  {new Date(a.uploaded_at).toLocaleString()}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Comments */}
                  <Comments stepId={step.id} me={me} isLeader={isLeader} />

                  {/* Approvals (only if this step has gates) */}
                  {step.is_gate && (
                    <GateApprovals
                      step={step}
                      segmentId={segment.id}
                      approverSeats={approverSeats}
                      me={me}
                      myProfile={profile}
                      onChange={reloadAll}
                    />
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </main>

      {/* Settings Modal */}
      {showSettings && (
        <SegmentSettings
          segment={segment}
          profile={profile}
          onClose={() => setShowSettings(false)}
          onSaved={reloadAll}
        />
      )}

      {saving && (
        <div className="fixed bottom-4 right-4 bg-gray-900 text-white text-sm px-3 py-2 rounded shadow">
          Saving…
        </div>
      )}
    </div>
  )
}