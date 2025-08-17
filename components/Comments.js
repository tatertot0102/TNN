// components/Comments.js
import { useEffect, useState, useRef } from 'react'
import { supabase } from '../supabase/client'

export default function Comments({ stepId, me, isLeader }) {
  const [items, setItems] = useState([])
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)
  const listRef = useRef(null)

  useEffect(() => {
    if (!stepId) return
    load()
    // Optionally: realtime
    const ch = supabase
      .channel(`step-comments-${stepId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'step_comments', filter: `step_id=eq.${stepId}` },
        () => load()
      )
      .subscribe()
    return () => { supabase.removeChannel(ch) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepId])

  async function load() {
    const { data } = await supabase
      .from('step_comments')
      .select('id, author_id, body, created_at, profiles:author_id(name, email)')
      .eq('step_id', stepId)
      .order('created_at', { ascending: true })
    setItems(data || [])
    // scroll to bottom on load for convenience
    setTimeout(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' }) }, 50)
  }

  async function submit(e) {
    e.preventDefault()
    if (!text.trim() || !me?.id) return
    setSaving(true)
    await supabase.from('step_comments').insert({
      step_id: stepId,
      author_id: me.id,
      body: text.trim(),
    })
    setSaving(false)
    setText('')
    await load()
  }

  async function remove(id, author_id) {
    if (!(isLeader || me?.id === author_id)) return
    await supabase.from('step_comments').delete().eq('id', id)
    await load()
  }

  return (
    <div className="mt-4 rounded-lg border border-gray-700 bg-[#0f1a33]">
      <div className="px-3 py-2 text-sm text-gray-200 border-b border-gray-700">Comments</div>

      <div ref={listRef} className="max-h-60 overflow-auto px-3 py-2 space-y-3">
        {items.length === 0 && (
          <div className="text-sm text-gray-400">No comments yet.</div>
        )}
        {items.map(c => (
          <div key={c.id} className="group">
            <div className="text-xs text-gray-400">
              {c.profiles?.name || c.profiles?.email || c.author_id?.slice(0,8)} · {new Date(c.created_at).toLocaleString()}
            </div>
            <div className="text-sm text-gray-100 whitespace-pre-wrap">{c.body}</div>
            {(isLeader || me?.id === c.author_id) && (
              <button
                onClick={() => remove(c.id, c.author_id)}
                className="opacity-0 group-hover:opacity-100 text-xs text-red-300 hover:text-red-200"
              >
                Delete
              </button>
            )}
          </div>
        ))}
      </div>

      <form onSubmit={submit} className="flex items-center gap-2 px-3 py-2 border-t border-gray-700">
        <input
          className="flex-1 rounded bg-[#0b132b] border border-gray-600 px-3 py-2 text-sm text-gray-100"
          placeholder="Write a comment…"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button
          className="px-3 py-2 rounded bg-[#3a506b] hover:bg-[#5bc0be] text-white text-sm disabled:opacity-50"
          disabled={!text.trim() || saving}
        >
          {saving ? 'Posting…' : 'Post'}
        </button>
      </form>
    </div>
  )
}