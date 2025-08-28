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
  const [showAdminExtras, setShowAdminExtras] = useState(false) // collapsible admin info
  const [showAllSteps, setShowAllSteps] = useState(false)
  const [myPoolIds, setMyPoolIds] = useState([])

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
      if (prof && (prof.role === 'executive' || prof.role === 'associate')) {
        setShowAllSteps(true)
      }
    })()
  }, [router])
  // Load pool memberships for current user
  useEffect(() => {
    (async () => {
      if (!me?.id) return
      const { data, error } = await supabase.from('role_pool_members').select('pool_id').eq('user_id', me.id)
      if (!error) setMyPoolIds((data || []).map(r => r.pool_id))
    })()
  }, [me])

  // Load segment context
  const reloadAll = useCallback(async () => {
    if (!id) return

    // Segment + owner label
    const { data: seg } = await supabase
      .from('segments').select('*').eq('id', id).single()

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

    // Steps ordered chronologically
    const { data: st } = await supabase
      .from('steps')
      .select('id, name, phase, due_date, status, assigned_to, is_gate, gate_roles')
      .eq('segment_id', id)
      .order('due_date', { ascending: true })
    const stepsArr = st || []
    setSteps(stepsArr)

    // Approver seats for this segment
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

  // ---------- data helpers ----------
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

  // ---------- approvals derivation ----------
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

  // ---------- derived status ----------
  function derivedStatus(step) {
    const total = (step.gate_roles || []).length
    const approved = approvedCount(step)
    const rejected = rejectedCount(step)

    // explicit states first
    if (step.status === 'Complete') return 'Complete'
    if (step.status === 'Rejected') return 'Rejected'
    if (step.status === 'Awaiting Approvals') return 'Awaiting Approvals'
    if (step.status === 'Changes Requested') return 'Changes Requested'
    if (step.status === 'In Progress') return 'In Progress'

    // gates derived
    if (rejected > 0) return 'Rejected'
    if (total > 0 && approved === total) return 'Complete'

    return 'Not Started'
  }

  // ---------- permissions ----------
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

  // ---------- mutations ----------
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

  // segment helpers
  async function updateSegment(patch) {
    setSaving(true)
    const { error } = await supabase.from('segments').update(patch).eq('id', segment.id)
    setSaving(false)
    if (error) { alert(error.message || 'Failed to update segment'); return }
    await reloadAll()
  }
  async function deleteSegment() {
    if (!window.confirm('Delete this segment? This cannot be undone.')) return
    setSaving(true)
    const { error } = await supabase.from('segments').delete().eq('id', segment.id)
    setSaving(false)
    if (error) { alert(error.message || 'Failed to delete segment'); return }
    router.push('/dashboard')
  }

  // ---------- UI ----------
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
            <div className="text-sm text-gray-300 mt-1 flex items-center gap-2">
              {segment?.ownerName && (<span>Owner: <span className="text-gray-100">{segment.ownerName}</span></span>)}
              <span className="hidden sm:inline">·</span>
              <button
                className="p-1 rounded hover:bg-gray-700 text-gray-300 focus:outline-none"
                onClick={() => setShowSettings(true)}
                title="Segment settings"
              >⚙️ Settings</button>
              {isLeader && (
                <button
                  className="p-1 rounded hover:bg-red-700/30 text-red-300 focus:outline-none"
                  onClick={deleteSegment}
                  title="Delete segment"
                >🗑 Delete</button>
              )}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-sm text-gray-300">Role: <span className="capitalize">{profile?.role}</span></div>
            {isLeader && (
              <label className="ml-4 inline-flex items-center gap-2 text-xs text-gray-300">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={showAllSteps}
                  onChange={e => setShowAllSteps(e.target.checked)}
                />
                Show all steps
              </label>
            )}
          </div>
        </div>
      </header>

      {/* Body */}
      <main className="max-w-5xl mx-auto px-6 py-6 space-y-8">
        {/* Admin extras toggle (shows IDs, raw statuses, etc.) */}
        {isLeader && (
          <div>
            <button
              onClick={() => setShowAdminExtras(v => !v)}
              className="text-xs px-2 py-1 rounded bg-[#0f1a33] border border-gray-700 hover:bg-[#13213d]"
            >{showAdminExtras ? 'Hide' : 'Show'} admin details</button>
          </div>
        )}

        // Build a filtered list of steps based on viewer role
        {(() => {
          let stepsToRender = steps
          if (!isLeader && !showAllSteps) {
            const includeIdx = new Set()
            steps.forEach((s, i) => {
              if (s.assigned_to && me?.id === s.assigned_to) includeIdx.add(i)
            })
            steps.forEach((s, i) => {
              if (!s.is_gate) return
              const seatMatchesMe = Object.values(approverSeats || {}).some(seat => {
                if (!seat) return false
                if (seat.user_id && me?.id && seat.user_id === me.id) return true
                if (seat.pool_id && myPoolIds.includes(seat.pool_id)) return true
                return false
              })
              if (seatMatchesMe) includeIdx.add(i)
            })
            const ctx = new Set()
            includeIdx.forEach(i => {
              ctx.add(i)
              if (i - 1 >= 0) ctx.add(i - 1)
              if (i + 1 < steps.length) ctx.add(i + 1)
            })
            stepsToRender = Array.from(ctx).sort((a,b)=>a-b).map(i => steps[i])
          }
          // Render steps
          return (
            <div className="space-y-8">
              {stepsToRender.map((step) => {
            const st = derivedStatus(step)
            const pct = approvalsProgress(step)
            // Relative due date if possible
            let dueStr = 'No due date'
            let overdue = false
            let dueRelative = null
            if (typeof step.due_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(step.due_date)) {
              const dueDate = new Date(step.due_date + 'T23:59:59')
              const now = new Date()
              overdue = dueDate < now && st !== 'Complete'
              const days = Math.ceil((dueDate - now) / (1000 * 60 * 60 * 24))
              if (days < 0) {
                dueRelative = `Overdue by ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'}`
              } else if (days === 0) {
                dueRelative = 'Due today'
              } else {
                dueRelative = `Due in ${days} day${days === 1 ? '' : 's'}`
              }
              dueStr = step.due_date
            }

            // If step is a gate, pull assets from the last non-gate step before it
            let assetStepId = step.id
            if (step.is_gate) {
              const idx = steps.findIndex(s => s.id === step.id)
              for (let i = idx - 1; i >= 0; i--) {
                if (!steps[i].is_gate) {
                  assetStepId = steps[i].id
                  break
                }
              }
            }

            const primaryAsset = (assetsMap[assetStepId] || [])[0]
            const moreAssets = (assetsMap[assetStepId] || []).slice(1)
            const showMore = !!expandedAssets[assetStepId]

            const isApprovalsLocked = step.is_gate && st !== 'Awaiting Approvals'
            const approvalsReadOnly = ['Complete','Rejected'].includes(st)

            return (
              <div key={step.id} className="rounded-2xl bg-[#181f38] shadow-lg p-0 overflow-hidden border border-[#232a45]">
                {/* Card Header */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 px-6 pt-6 pb-3 bg-[#222b4a] rounded-t-2xl border-b border-[#232a45]">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-2xl font-bold text-white tracking-tight">{step.name}</h3>
                      <span className={`text-xs px-3 py-1 rounded-full font-semibold ${BADGE[st] || BADGE['Not Started']}`}>{st}</span>
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      <span className={`text-sm ${overdue ? 'text-red-400 font-semibold' : 'text-gray-300'}`}>
                        {dueRelative ? dueRelative : `Due ${dueStr}`}
                      </span>
                      {showAdminExtras && (
                        <span className="text-xs text-gray-500">
                          · id: {step.id} · status: {step.status || '—'} · gate_roles: {(step.gate_roles||[]).join(', ') || '—'}
                        </span>
                      )}
                    </div>
                  </div>
                  {isLeader && (
                    <input
                      type="date"
                      className="ml-0 sm:ml-auto text-sm rounded border border-gray-600 bg-[#181f38] text-gray-200 px-2 py-1"
                      value={typeof step.due_date === 'string' ? step.due_date : ''}
                      onChange={(e) => updateStep(step.id, { due_date: e.target.value })}
                      title="Change due date"
                    />
                  )}
                </div>

                {/* Card Body */}
                <div className="px-6 py-6 space-y-6">
                  {/* Asset */}
                  <div>
                    <div className="text-xs text-gray-400 mb-1 font-medium">Primary Link / Asset</div>
                    {primaryAsset ? (
                      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                        <a
                          href={primaryAsset.file_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-block px-4 py-2 rounded-full bg-[#0b132b] hover:bg-[#232a45] text-[#6fffe9] font-semibold text-sm shadow transition"
                        >
                          {primaryAsset.description ||
                            primaryAsset.file_url.replace(/^https?:\/\//, '')}
                        </a>
                        <span className="text-xs text-gray-500">
                          {new Date(primaryAsset.uploaded_at).toLocaleString()}
                        </span>
                        {(isLeader || me?.id === step.assigned_to) && !step.is_gate && derivedStatus(step) !== 'Complete' && (
                          <button
                            className="ml-0 sm:ml-2 text-xs text-red-400 hover:text-red-600"
                            onClick={async () => {
                              if (!window.confirm('Remove this asset?')) return;
                              await supabase.from('assets').delete().eq('id', primaryAsset.id);
                              await loadAssetsForSteps(steps.map(s => s.id));
                            }}
                            title="Remove asset"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="text-sm text-gray-300">No links yet.</div>
                    )}
                    {/* Asset upload: Only for non-gate steps, and only if step is not Complete */}
                    {(isLeader || me?.id === step.assigned_to) && !step.is_gate && derivedStatus(step) !== 'Complete' && (
                      <div className="mt-3">
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
                          {showMore ? 'Hide other links/files' : `Show ${moreAssets.length} more`}
                        </button>
                        {showMore && (
                          <div className="mt-2 space-y-1">
                            {moreAssets.map(a => (
                              <div key={a.id} className="flex items-center gap-2">
                                <a
                                  href={a.file_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-block px-3 py-1 rounded-full bg-[#232a45] hover:bg-[#0b132b] text-[#6fffe9] font-semibold text-xs shadow transition break-all"
                                >
                                  {a.description ||
                                    a.file_url.replace(/^https?:\/\//, '')}
                                </a>
                                <span className="text-xs text-gray-500">
                                  {new Date(a.uploaded_at).toLocaleString()}
                                </span>
                                {(isLeader || me?.id === step.assigned_to) && !step.is_gate && derivedStatus(step) !== 'Complete' && (
                                  <button
                                    className="ml-2 text-xs text-red-400 hover:text-red-600"
                                    onClick={async () => {
                                      if (!window.confirm('Remove this asset?')) return;
                                      await supabase.from('assets').delete().eq('id', a.id);
                                      await loadAssetsForSteps(steps.map(s => s.id));
                                    }}
                                    title="Remove asset"
                                  >
                                    Remove
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Gate step: Approvals progress bar */}
                  {step.is_gate && (step.gate_roles || []).length > 0 && (
                    <div>
                      <div className="text-xs text-gray-400 mb-1 font-medium">Approvals Progress</div>
                      <div className="h-3 w-full bg-[#232a45] rounded-full overflow-hidden">
                        <div className="h-3 bg-[#6fffe9] rounded-full transition-all duration-300" style={{ width: `${pct}%` }} />
                      </div>
                      <div className="text-xs text-gray-300 mt-1">{pct}% approvals</div>
                    </div>
                  )}

                  {/* Comments thread */}
                  <div>
                    <div className="text-xs text-gray-400 mb-1 font-medium">{step.is_gate ? 'Feedback' : 'Comments'}</div>
                    <div className="rounded-xl bg-[#212a47] p-3">
                      <Comments stepId={step.id} me={me} isLeader={isLeader} />
                    </div>
                  </div>

                  {/* Gate step: Approvals UI */}
                  {step.is_gate && (
                    <div>
                      <div className="text-xs text-gray-400 mb-1 font-medium">Approvals</div>
                      <div className={isApprovalsLocked ? 'opacity-50 pointer-events-none select-none' : ''}>
                        <GateApprovals
                          step={step}
                          segmentId={segment.id}
                          approverSeats={approverSeats}
                          me={me}
                          myProfile={profile}
                          onChange={reloadAll}
                          locked={isApprovalsLocked}
                          readOnly={approvalsReadOnly}
                        />
                        {isApprovalsLocked && (
                          <div className="mt-2 text-[11px] text-gray-400">Approvals unlock after you press <span className="font-semibold text-gray-200">Send for Approvals</span>.</div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Card Footer: Actions */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-6 pb-6 pt-3 border-t border-[#232a45] bg-[#181f38] rounded-b-2xl">
                  <div className="flex flex-wrap items-center gap-2">
                    {canStart(step) && (
                      <button onClick={() => startStep(step)} className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold shadow transition">
                        Start
                      </button>
                    )}
                    {canSendApprovals(step) && (
                      <button onClick={() => sendApprovals(step)} className="px-4 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-semibold shadow transition">
                        Send for Approvals
                      </button>
                    )}
                    {canMarkComplete(step) && (
                      <button onClick={() => markComplete(step)} className="px-4 py-1.5 rounded-lg bg-green-600 hover:bg-green-500 text-white font-semibold shadow transition">
                        Mark Complete
                      </button>
                    )}
                    {canReopen(step) && (
                      <button onClick={() => reopenStep(step)} className="px-4 py-1.5 rounded-lg bg-gray-600 hover:bg-gray-500 text-white font-semibold shadow transition">
                        Reopen
                      </button>
                    )}
                    {canReset(step) && (
                      <button onClick={() => resetToNotStart(step)} className="px-4 py-1.5 rounded-lg bg-gray-700 hover:bg-gray-600 text-white font-semibold shadow transition">
                        Reset
                      </button>
                    )}
                  </div>
                  {/* Date picker already in header for leaders */}
                </div>
              </div>
            )
          })}
            </div>
          )
        })()}
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