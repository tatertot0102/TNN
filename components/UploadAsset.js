// components/UploadAsset.js
import { useState } from 'react'
import { supabase } from '../supabase/client'

export default function UploadAsset({ segmentId, stepId, onUploaded }) {
  const [link, setLink] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!link.trim()) return

    let url = link.trim()
    if (!/^https?:\/\//i.test(url)) {
      url = 'https://' + url
    }

    // use hostname as label if no better description
    const label = url.replace(/^https?:\/\//, '').split(/[/?#]/)[0]

    setSaving(true)
    const { error: insertError } = await supabase.from('assets').insert({
      segment_id: segmentId,
      step_id: stepId,
      file_url: url,
      name: label
    })
    setSaving(false)

    if (insertError) {
      setError(insertError.message)
      return
    }

    setLink('')
    onUploaded?.()
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2">
      <input
        type="text"
        placeholder="Paste link (Google Doc, Drive, YouTube...)"
        value={link}
        onChange={(e) => setLink(e.target.value)}
        className="flex-1 rounded border border-gray-600 bg-[#0b132b] text-gray-100 px-3 py-2 text-sm"
      />
      <button
        type="submit"
        disabled={saving}
        className="px-3 py-2 text-sm rounded bg-[#5bc0be] text-black hover:bg-[#6fffe9] disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Add Link'}
      </button>
      {error && <span className="text-xs text-red-400">{error}</span>}
    </form>
  )
}