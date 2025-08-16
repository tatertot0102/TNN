// pages/segments/[id].js
import { useRouter } from 'next/router'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../supabase/client'
import AssigneeSelect from '../../components/AssigneeSelect'
import UploadAsset from '../../components/UploadAsset'
import GateApprovals from '../../components/GateApprovals'
import AssignApprovers from '../../components/AssignApprovers'

const STATUS_COLORS = {
  'Not Started': 'bg-gray-700 text-gray-200',
  'In Progress': 'bg-blue-700 text-blue-100',
  'Under Review': 'bg-amber-700 text-amber-100',
  'Complete': 'bg-green-700 text-green-100'
}

export default function SegmentDetail() {
  const router = useRouter()
  const { id } = router.query

  const [me, setMe] = useState(null)
  const [profile, setProfile] = useState(null)
  const [segment, setSegment] = useState(null)
  const [steps, setSteps] = useState([])
  const [assetsMap, setAssetsMap] = useState({})
  const [approverSeats, setApproverSeats] = useState({})
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

  // Load segment, steps, approvers, assets
  useEffect(() => {
    if (!id) return
    ;(async () => {
      const { data: seg } = await supabase
        .from('segments')
        .select('*')
        .eq('id', id)
        .single()
      setSegment(seg || null)

      const { data: st } = await supabase
        .from('steps')
        .select('id, name, phase, due_date, status, assigned_to, is_gate, gate_roles')
        .eq('segment_id', id)
        .order('due_date', { ascending: true })
      setSteps(st || [])

      const { data: seatRows } = await supabase
        .from('segment_approvers')
        .select('role_key, user_id')
        .eq('segment_id', id)
      const seats = {}
      ;(seatRows || []).forEach(r => { seats[r.role_key] = { user_id: r.user_id } })
      setApproverSeats(seats)

      setLoading(false)
      await loadAssetsForSteps((st || []).map(s => s.id))
    })()
  }, [id])

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

          {steps.map((step, idx) => (
            <div key={step.id} className="relative mb-10">
              {/* Timeline dot */}
              <div className="absolute left-0 top-4 w-3 h-3 rounded-full bg-[#6fffe9] border-2 border-[#0b132b]"></div>

              {/* Step card */}
              <div className="ml-6 p-5 rounded-lg bg-[#1c2541] shadow space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-white font-semibold">{step.name}</h3>
                  {canEdit ? (
                    <select
                      className="text-sm rounded border border-gray-600 bg-[#0b132b] text-gray-200 px-2 py-1"
                      value={step.status || 'Not Started'}
                      onChange={(e) => updateStep(step.id, { status: e.target.value })}
                    >
                      <option>Not Started</option>
                      <option>In Progress</option>
                      <option>Under Review</option>
                      <option>Complete</option>
                    </select>
                  ) : (
                    <span className={`text-xs px-2 py-1 rounded ${STATUS_COLORS[step.status || 'Not Started']}`}>
                      {step.status || 'Not Started'}
                    </span>
                  )}
                </div>

                {/* Due date + assignee */}
                <div className="flex items-center gap-4 text-sm text-gray-300">
                  <div>
                    Due: {step.due_date ? new Date(step.due_date).toLocaleDateString() : 'Not set'}
                  </div>
                  <div>
                    Assigned:{" "}
                    {canEdit ? (
                      <AssigneeSelect
                        value={step.assigned_to}
                        onChange={(val) => updateStep(step.id, { assigned_to: val || null })}
                      />
                    ) : (
                      step.assigned_to || 'Unassigned'
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

                {/* Gate approvals */}
                {step.is_gate && (
                  <GateApprovals
                    step={step}
                    segmentId={segment.id}
                    approverSeats={approverSeats}
                    me={me}
                    myProfile={profile}
                    onChange={() => {}}
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
          ))}
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
