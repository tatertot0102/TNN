// components/NewSegmentModal.js
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabase/client'

const SEATS = [
  { key: 'script_editor',      label: 'Script Editor (Gate)' },
  { key: 'content_strategist', label: 'Content Strategist (Gate)' },
  { key: 'director',           label: 'Director (Prod Gate)' },
  { key: 'post_supervisor',    label: 'Post Supervisor (Gate)' },
  { key: 'producer',           label: 'Producer (Optional)' },
  { key: 'publisher',          label: 'Publisher (Optional)' }, // shown only if publish is enabled
]

export default function NewSegmentModal({ onClose, onCreated }) {
  const [profile, setProfile] = useState(null)
  const [people, setPeople] = useState([])
  const [pools, setPools] = useState([])

  // basics
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [owner, setOwner] = useState('')

  // options
  const [needsDesign, setNeedsDesign] = useState(false)
  const [needsPublish, setNeedsPublish] = useState(false)

  // production/post optional assignees
  const [anchor, setAnchor] = useState('')
  const [editor, setEditor] = useState('')

  // hybrid seats: { [role_key]: { userId, poolId } }
  const [seatState, setSeatState] = useState({})

  const [saving, setSaving] = useState(false)
  const isExec = useMemo(() => ['executive','associate'].includes(profile?.role), [profile])

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: me } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      setProfile(me || null)
      const [{ data: ppl }, { data: pls }] = await Promise.all([
        supabase.from('profiles').select('id, name, role, email').order('name',{ascending:true}),
        supabase.from('role_pools').select('id, name, role_key').order('name',{ascending:true}),
      ])
      setPeople(ppl || [])
      setPools(pls || [])
    })()
  }, [])

  if (!isExec) {
    return (
      <>
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40" />
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="min-h-full flex items-center justify-center p-4">
            <div className="w-full max-w-lg rounded-lg bg-white p-6 text-gray-800 shadow-xl">
              <h2 className="text-lg font-semibold mb-2">Permission required</h2>
              <p>Only executives or associates can create segments.</p>
              <div className="mt-4 text-right">
                <button onClick={onClose} className="px-3 py-1.5 rounded bg-gray-800 text-white">Close</button>
              </div>
            </div>
          </div>
        </div>
      </>
    )
  }

  const displayName = (p) => p?.name || p?.email || (p?.id || '').slice(0,8)
  const rolePools = (roleKey) => pools.filter(pl => pl.role_key === roleKey)

  function setSeat(roleKey, next) {
    setSeatState(prev => ({ ...prev, [roleKey]: { userId: next.userId || '', poolId: next.poolId || '' } }))
  }

  async function submit(e) {
    e.preventDefault()
    const se = seatState['script_editor'] || {}
    const cs = seatState['content_strategist'] || {}
    const dr = seatState['director'] || {}
    const ps = seatState['post_supervisor'] || {}

    if (!title.trim() || !owner) return alert('Title and Owner are required.')
    if (!se.userId && !se.poolId) return alert('Assign a Script Editor (person or pool).')
    if (!cs.userId && !cs.poolId) return alert('Assign a Content Strategist (person or pool).')
    if (!dr.userId && !dr.poolId) return alert('Assign a Director (person or pool).')
    if (!ps.userId && !ps.poolId) return alert('Assign a Post Supervisor (person or pool).')

    setSaving(true)
    const { error, data } = await supabase.rpc('create_segment_full', {
      p_title: title.trim(),
      p_description: description || '',
      p_owner: owner,

      p_script_editor: se.userId || null,
      p_content_strategist: cs.userId || null,
      p_director: dr.userId || null,
      p_post_supervisor: ps.userId || null,

      p_producer: (seatState['producer']?.userId) || null,
      p_editor: editor || null,
      p_anchor: anchor || null,
      p_needs_design: needsDesign,
      p_needs_publish: needsPublish,

      p_script_editor_pool: se.poolId || null,
      p_content_strategist_pool: cs.poolId || null,
      p_director_pool: dr.poolId || null,
      p_post_supervisor_pool: ps.poolId || null,
      p_producer_pool: (seatState['producer']?.poolId) || null,

      p_publisher_user: needsPublish ? (seatState['publisher']?.userId || null) : null,
      p_publisher_pool: needsPublish ? (seatState['publisher']?.poolId || null) : null
    })
    setSaving(false)

    if (error) return alert(error.message || 'Failed to create segment')
    onClose?.()
    onCreated?.(data)
  }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40" />
      {/* Scrollable overlay */}
      <div className="fixed inset-0 z-50 overflow-y-auto">
        <div className="min-h-full flex items-center justify-center p-4">
          {/* Panel: flex column with sticky header/footer and scrollable body */}
          <div className="w-full sm:max-w-3xl bg-[#1c2541] text-gray-100 rounded-lg shadow-xl border border-gray-700 max-h-[90vh] flex flex-col">
            {/* Header (sticky) */}
            <div className="px-5 py-4 border-b border-gray-700 sticky top-0 bg-[#1c2541] z-10">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">New Segment</h2>
                <button onClick={onClose} className="text-sm text-gray-300 hover:text-white">✕</button>
              </div>
            </div>

            {/* Body (scrollable) */}
            <form onSubmit={submit} className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
              {/* Basics */}
              <div className="grid sm:grid-cols-2 gap-3">
                <input
                  className="rounded border border-gray-600 bg-[#0b132b] px-3 py-2"
                  placeholder="Title (required)"
                  value={title}
                  onChange={(e)=>setTitle(e.target.value)}
                />
                <input
                  className="rounded border border-gray-600 bg-[#0b132b] px-3 py-2"
                  placeholder="Short description"
                  value={description}
                  onChange={(e)=>setDescription(e.target.value)}
                />
              </div>

              {/* Owner */}
              <div>
                <div className="text-sm text-gray-300 mb-1">Owner (required)</div>
                <select
                  className="w-full rounded border border-gray-600 bg-[#0b132b] text-gray-100 px-3 py-2"
                  value={owner || ''}
                  onChange={(e)=>setOwner(e.target.value || '')}
                >
                  <option value="">— Select owner —</option>
                  {people.map(p => <option key={p.id} value={p.id}>{displayName(p)} ({p.role})</option>)}
                </select>
              </div>

              {/* Decision Seats */}
              <div className="rounded-lg bg-[#142041] border border-gray-700 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-white">Decision Seats</h3>
                  <a href="/admin/pools" className="text-xs text-[#6fffe9] hover:underline">Manage Pools</a>
                </div>

                <div className="grid lg:grid-cols-2 gap-3">
                  {SEATS.filter(s => s.key !== 'publisher' || needsPublish).map(seat => (
                    <SeatPicker
                      key={seat.key}
                      seat={seat}
                      value={seatState[seat.key] || { userId: '', poolId: '' }}
                      onChange={(next)=>setSeat(seat.key, next)}
                      people={people}
                      pools={rolePools(seat.key)}
                    />
                  ))}
                </div>
              </div>

              {/* Production / Post optional assignees */}
              <div className="grid sm:grid-cols-2 gap-3">
                <LabeledSelect
                  label="Anchor (optional)"
                  value={anchor || ''}
                  onChange={setAnchor}
                  options={people}
                />
                <LabeledSelect
                  label="Editor (optional)"
                  value={editor || ''}
                  onChange={setEditor}
                  options={people}
                />
              </div>

              {/* Options */}
              <div className="grid sm:grid-cols-2 gap-3">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={needsDesign} onChange={(e)=>setNeedsDesign(e.target.checked)} />
                  Include Design / Graphics phase
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={needsPublish} onChange={(e)=>setNeedsPublish(e.target.checked)} />
                  Include Publish gate
                </label>
              </div>

              {/* Footer (sticky) */}
              <div className="sticky bottom-0 bg-[#1c2541] -mx-5 px-5 pt-3 border-t border-gray-700 flex items-center justify-end gap-2">
                <button type="button" onClick={onClose} className="px-3 py-2 rounded bg-gray-700 hover:bg-gray-600">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 rounded bg-[#5bc0be] text-black hover:bg-[#6fffe9] disabled:opacity-60"
                >
                  {saving ? 'Creating…' : 'Create Segment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </>
  )
}

function LabeledSelect({ label, value, onChange, options }) {
  const displayName = (p) => p?.name || p?.email || (p?.id || '').slice(0,8)
  return (
    <div>
      <div className="text-sm text-gray-300 mb-1">{label}</div>
      <select
        className="w-full rounded border border-gray-600 bg-[#0b132b] text-gray-100 px-3 py-2"
        value={value}
        onChange={(e)=>onChange(e.target.value || '')}
      >
        <option value="">—</option>
        {options.map(p => (
          <option key={p.id} value={p.id}>{displayName(p)} ({p.role})</option>
        ))}
      </select>
    </div>
  )
}

function SeatPicker({ seat, value, onChange, people, pools }) {
  const mode = value.userId ? 'person' : (value.poolId ? 'pool' : 'person') // default to Person

  return (
    <div className="rounded-lg bg-[#0f1a33] border border-gray-700 p-3 space-y-2">
      <div className="text-sm text-gray-200 font-medium">{seat.label}</div>

      {/* Mode toggle */}
      <div className="inline-flex rounded-md overflow-hidden border border-gray-700">
        <button
          type="button"
          onClick={() => onChange({ userId: value.userId || '', poolId: '' })}
          className={`px-2 py-1 text-xs ${mode==='person' ? 'bg-[#5bc0be] text-black' : 'bg-[#0b132b] text-gray-200 hover:bg-[#142041]'}`}
        >
          Person
        </button>
        <button
          type="button"
          onClick={() => onChange({ userId: '', poolId: value.poolId || '' })}
          className={`px-2 py-1 text-xs ${mode==='pool' ? 'bg-[#5bc0be] text-black' : 'bg-[#0b132b] text-gray-200 hover:bg-[#142041]'}`}
        >
          Pool
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {/* Person select */}
        <select
          className="rounded border border-gray-700 bg-[#0b132b] text-gray-100 px-2 py-2"
          value={value.userId || ''}
          onChange={(e)=>onChange({ userId: e.target.value || '', poolId: '' })}
        >
          <option value="">— Select person —</option>
          {people.map(p => (
            <option key={p.id} value={p.id}>
              {(p.name || p.email)} ({p.role})
            </option>
          ))}
        </select>

        {/* Pool select */}
        <select
          className="rounded border border-gray-700 bg-[#0b132b] text-gray-100 px-2 py-2"
          value={value.poolId || ''}
          onChange={(e)=>onChange({ userId: '', poolId: e.target.value || '' })}
        >
          <option value="">— Select pool —</option>
          {pools.map(pl => (
            <option key={pl.id} value={pl.id}>{pl.name}</option>
          ))}
        </select>
      </div>

      <div className="text-xs text-gray-400">Tip: If both are set, the <span className="font-semibold text-gray-200">person</span> takes precedence.</div>
    </div>
  )
}
