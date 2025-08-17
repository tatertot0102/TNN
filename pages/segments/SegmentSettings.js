// pages/segments/SegmentSettings.js
import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../../supabase/client'
import AssigneeSelect from '../../components/AssigneeSelect'
import AssignApprovers from '../../components/AssignApprovers'

export default function SegmentSettings({ segment, profile, onClose, onSaved }) {
  const router = useRouter()
  const [title, setTitle] = useState(segment?.title || '')
  const [ownerId, setOwnerId] = useState(segment?.owner_id || null)
  const [saving, setSaving] = useState(false)
  const isLeader = ['executive', 'associate'].includes(profile?.role)

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    setTitle(segment?.title || '')
    setOwnerId(segment?.owner_id || null)
  }, [segment?.id])

  async function saveTitle() {
    if (!isLeader) return
    setSaving(true)
    const { error } = await supabase.from('segments').update({ title }).eq('id', segment.id)
    setSaving(false)
    if (error) return alert(error.message || 'Failed to update title')
    onSaved?.()
  }

  async function saveOwner(newOwnerId) {
    if (!isLeader) return
    setOwnerId(newOwnerId || null)
    setSaving(true)
    const { error } = await supabase.from('segments').update({ owner_id: newOwnerId || null }).eq('id', segment.id)
    setSaving(false)
    if (error) return alert(error.message || 'Failed to update owner')
    onSaved?.()
  }

  async function deleteSegment() {
    if (!isLeader) return
    if (!window.confirm('Delete this segment? This cannot be undone.')) return
    setSaving(true)
    const { error } = await supabase.from('segments').delete().eq('id', segment.id)
    setSaving(false)
    if (error) return alert(error.message || 'Failed to delete segment')
    onClose?.()
    router.push('/dashboard')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start md:items-center justify-center overflow-y-auto">
      <div className="w-full px-4">
        {/* Backdrop */}
        <div className="absolute inset-0 bg-black/60" onClick={onClose} />

        {/* Panel */}
        <div
          className="relative w-full max-w-2xl my-8 rounded-lg bg-[#1c2541] text-gray-100 shadow-lg max-h-[90vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
        >
        <div className="px-5 py-4 border-b border-gray-700 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Segment Settings</h2>
          <button
            className="px-2 py-1 rounded bg-gray-700 hover:bg-gray-600"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        <div className="p-5 space-y-6">
          {/* General */}
          <section>
            <h3 className="text-sm font-semibold text-gray-200 mb-2">General</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-center">
              <label className="text-sm text-gray-300">Title</label>
              <input
                className="sm:col-span-2 rounded bg-[#0b132b] border border-gray-600 px-3 py-2 text-sm"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Segment title"
              />
              <div className="sm:col-start-2 sm:col-span-2">
                <button
                  onClick={saveTitle}
                  disabled={!isLeader || saving}
                  className="px-3 py-2 rounded bg-[#3a506b] hover:bg-[#5bc0be] text-white text-sm disabled:opacity-50"
                >
                  Save Title
                </button>
              </div>
            </div>
          </section>

          {/* Owner */}
          <section>
            <h3 className="text-sm font-semibold text-gray-200 mb-2">Owner</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-center">
              <label className="text-sm text-gray-300">Segment Owner</label>
              <div className="sm:col-span-2">
                <AssigneeSelect value={ownerId} onChange={saveOwner} />
              </div>
            </div>
          </section>

          {/* Decision Seats (moved from main view) */}
          <section>
            <h3 className="text-sm font-semibold text-gray-200 mb-2">Decision Seats</h3>
            <div className="rounded border border-gray-700">
              <AssignApprovers segmentId={segment.id} myProfile={profile} />
            </div>
          </section>

          {/* Danger Zone */}
          <section>
            <h3 className="text-sm font-semibold text-red-200 mb-2">Danger Zone</h3>
            <button
              onClick={deleteSegment}
              disabled={!isLeader || saving}
              className="px-3 py-2 rounded bg-red-700 hover:bg-red-600 text-white text-sm disabled:opacity-50"
            >
              Delete Segment
            </button>
          </section>
        </div>
        </div>
      </div>
    </div>
  )
}