// components/UploadAsset.js
import { useState } from 'react'
import { supabase } from '../supabase/client'

export default function UploadAsset({ segmentId, stepId, onUploaded }) {
  const [file, setFile] = useState(null)
  const [desc, setDesc] = useState('')
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')

  async function handleUpload(e) {
    e.preventDefault()
    setErr('')
    if (!file) { setErr('Choose a file'); return }

    setLoading(true)

    try {
      // 1) Upload to storage
      const path = `${segmentId}/${stepId}/${Date.now()}-${file.name}`
      const { error: upErr } = await supabase.storage
        .from('tnn-assets')
        .upload(path, file, { cacheControl: '3600', upsert: false })
      if (upErr) throw upErr

      const { data: urlData } = await supabase.storage
        .from('tnn-assets')
        .getPublicUrl(path)

      const publicUrl = urlData?.publicUrl
      if (!publicUrl) throw new Error('No public URL returned')

      // 2) Insert into assets table
      const { data: session } = await supabase.auth.getSession()
      const uid = session?.session?.user?.id || null

      const { error: dbErr } = await supabase.from('assets').insert({
        segment_id: segmentId,
        step_id: stepId,
        file_url: publicUrl,
        description: desc || null,
        uploaded_by: uid
      })
      if (dbErr) throw dbErr

      setFile(null); setDesc('')
      onUploaded?.(publicUrl)
    } catch (e) {
      setErr(e.message || 'Upload failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleUpload} className="flex items-center gap-2">
      <input
        type="file"
        onChange={(e)=>setFile(e.target.files?.[0] || null)}
        className="text-sm text-gray-200 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-sm file:font-medium file:bg-[#3a506b] file:text-white hover:file:bg-[#5bc0be]"
      />
      <input
        type="text"
        placeholder="Description (optional)"
        value={desc}
        onChange={(e)=>setDesc(e.target.value)}
        className="text-sm rounded border border-gray-600 bg-[#0b132b] text-gray-200 px-2 py-1"
      />
      <button
        className="px-3 py-1 bg-[#3a506b] hover:bg-[#5bc0be] text-white rounded text-sm transition-colors"
        disabled={loading}
      >
        {loading ? 'Uploading…' : 'Upload'}
      </button>
      {err && <span className="text-xs text-red-300">{err}</span>}
    </form>
  )
}
