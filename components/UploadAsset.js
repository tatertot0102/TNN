// components/UploadAsset.js
import { useState } from 'react'
import { supabase } from '../supabase/client'

export default function UploadAsset({ segmentId, stepId, onUploaded }) {
  const [file, setFile] = useState(null)
  const [saving, setSaving] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  async function handleUpload(e) {
    e.preventDefault()
    setErrorMsg('')
    if (!file) return

    try {
      setSaving(true)
      // store in 'assets' bucket
      const path = `${segmentId}/${stepId}/${Date.now()}_${file.name}`
      const { data: up, error: upErr } = await supabase.storage.from('assets').upload(path, file)
      if (upErr) throw upErr

      const { data: { publicUrl } } = supabase.storage.from('assets').getPublicUrl(up.path)

      // Save to DB (no description field at all)
      const { error: dbErr } = await supabase.from('assets').insert({
        segment_id: segmentId,
        step_id: stepId,
        file_url: publicUrl,
        description: null
      })
      if (dbErr) throw dbErr

      setFile(null)
      onUploaded?.()
    } catch (err) {
      setErrorMsg(err.message || 'Upload failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleUpload} className="flex items-center gap-2">
      <input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} className="text-sm" />
      <button
        className="px-3 py-1.5 rounded bg-[#3a506b] hover:bg-[#5bc0be] text-white text-sm disabled:opacity-50"
        disabled={!file || saving}
      >
        {saving ? 'Uploading…' : 'Upload'}
      </button>
      {errorMsg && <span className="text-xs text-red-300">{errorMsg}</span>}
    </form>
  )
}