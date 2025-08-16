// components/NewSegmentModal.js
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabase/client'

export default function NewSegmentModal({ onClose, onCreated }) {
  const [me, setMe] = useState(null)
  const [profile, setProfile] = useState(null)
  const [people, setPeople] = useState([])

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')

  // required
  const [owner, setOwner] = useState('')
  const [scriptEditor, setScriptEditor] = useState('')
  const [contentStrategist, setContentStrategist] = useState('')
  const [director, setDirector] = useState('')
  const [postSupervisor, setPostSupervisor] = useState('')

  // optional
  const [producer, setProducer] = useState('')
  const [anchor, setAnchor] = useState('')
  const [editor, setEditor] = useState('')
  const [needsDesign, setNeedsDesign] = useState(false)
  const [needsPublish, setNeedsPublish] = useState(false)

  const [saving, setSaving] = useState(false)
  const isExec = useMemo(() => ['executive', 'associate'].includes(profile?.role), [profile])

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setMe(user || null)
      if (!user) return
      const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      setProfile(prof || null)
      const { data: ppl } = await supabase.from('profiles').select('id, name, role, email').order('name', { ascending: true })
      setPeople(ppl || [])
    })()
  }, [])

  if (!isExec) {
    return (
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4">
        <div className="w-full max-w-lg rounded-lg bg-white p-6 text-gray-800">
          <h2 className="text-lg font-semibold mb-2">Permission required</h2>
          <p>Only executives or associates can create new segments.</p>
          <div className="mt-4 text-right">
            <button onClick={onClose} className="px-3 py-1.5 rounded bg-gray-800 text-white">Close</button>
          </div>
        </div>
      </div>
    )
  }

  const displayName = (p) => p?.name || p?.email || (p?.id || '').slice(0,8)

  async function submit(e) {
    e.preventDefault()
    if (!title.trim() || !owner || !scriptEditor || !contentStrategist || !director || !postSupervisor) {
      alert('Title, Owner, Script Editor, Content Strategist, Director, and Post Supervisor are required.')
      return
    }
    setSaving(true)

    const { data, error } = await supabase.rpc('create_segment_full', {
      p_title: title.trim(),
      p_description: description || '',
      p_owner: owner || null,
      p_producer: producer || null,
      p_script_editor: scriptEditor || null,
      p_content_strategist: contentStrategist || null,
      p_director: director || null,
      p_post_supervisor: postSupervisor || null,
      p_editor: editor || null,
      p_anchor: anchor || null,
      p_needs_design: needsDesign,
      p_needs_publish: needsPublish
    })

    setSaving(false)
    if (error) {
      alert(error.message || 'Failed to create segment')
      return
    }
    onClose?.()
    // navigate to the new segment if parent provided callback
    onCreated?.(data)
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
      <div className="w-full max-w-2xl rounded-lg bg-[#1c2541] text-gray-100 shadow-xl">
        <div className="px-5 py-4 border-b border-gray-700 flex items-center justify-between">
          <h2 className="text-lg font-semibold">New Segment</h2>
          <button onClick={onClose} className="text-sm text-gray-300 hover:text-white">✕</button>
        </div>

        <form onSubmit={submit} className="p-5 space-y-4">
          <div className="grid sm:grid-cols-2 gap-3">
            <input className="rounded border border-gray-600 bg-[#0b132b] px-3 py-2" placeholder="Title"
                   value={title} onChange={(e)=>setTitle(e.target.value)} />
            <input className="rounded border border-gray-600 bg-[#0b132b] px-3 py-2" placeholder="Short description"
                   value={description} onChange={(e)=>setDescription(e.target.value)} />
          </div>

          <h3 className="font-semibold text-white">People</h3>
          <div className="grid sm:grid-cols-2 gap-3">
            <SelectPerson label="Owner (required)" value={owner} setValue={setOwner} people={people} />
            <SelectPerson label="Producer (optional)" value={producer} setValue={setProducer} people={people} />
            <SelectPerson label="Script Editor (required)" value={scriptEditor} setValue={setScriptEditor} people={people} />
            <SelectPerson label="Content Strategist (required)" value={contentStrategist} setValue={setContentStrategist} people={people} />
            <SelectPerson label="Director (required)" value={director} setValue={setDirector} people={people} />
            <SelectPerson label="Post Supervisor (required)" value={postSupervisor} setValue={setPostSupervisor} people={people} />
            <SelectPerson label="Anchor (optional)" value={anchor} setValue={setAnchor} people={people} />
            <SelectPerson label="Editor (optional)" value={editor} setValue={setEditor} people={people} />
          </div>

          <h3 className="font-semibold text-white">Options</h3>
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={needsDesign} onChange={(e)=>setNeedsDesign(e.target.checked)} />
              Needs Design / Graphics phase
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={needsPublish} onChange={(e)=>setNeedsPublish(e.target.checked)} />
              Include Publish gate
            </label>
          </div>

          <div className="pt-2 flex items-center justify-end gap-2">
            <button type="button" onClick={onClose} className="px-3 py-2 rounded bg-gray-700 hover:bg-gray-600">Cancel</button>
            <button type="submit" disabled={saving}
              className="px-4 py-2 rounded bg-[#5bc0be] text-black hover:bg-[#6fffe9] disabled:opacity-60">
              {saving ? 'Creating…' : 'Create Segment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function SelectPerson({ label, value, setValue, people }) {
  const displayName = (p) => p?.name || p?.email || (p?.id || '').slice(0,8)
  return (
    <div>
      <div className="text-sm text-gray-300 mb-1">{label}</div>
      <select
        className="w-full rounded border border-gray-600 bg-[#0b132b] text-gray-100 px-3 py-2"
        value={value || ''}
        onChange={(e)=>setValue(e.target.value || '')}
      >
        <option value="">—</option>
        {people.map(p => (
          <option key={p.id} value={p.id}>{displayName(p)} ({p.role})</option>
        ))}
      </select>
    </div>
  )
}
