// pages/dashboard.js
import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../supabase/client'
import NewSegmentModal from '../components/NewSegmentModal'

export default function Dashboard() {
  const router = useRouter()
  const [me, setMe] = useState(null)
  const [profile, setProfile] = useState(null)
  const [segments, setSegments] = useState([])
  const [showNew, setShowNew] = useState(false)
  const [loading, setLoading] = useState(true)

  const canEdit = useMemo(() => ['executive','associate'].includes(profile?.role), [profile])

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return router.push('/')
      setMe(user)
      const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      setProfile(prof || null)
      setLoading(false)
    })()
  }, [router])

  async function fetchSegments() {
    const { data, error } = await supabase
      .from('segments')
      .select('id, title, description, status, created_at')
      .order('created_at', { ascending: false })
    if (!error) setSegments(data || [])
  }

  useEffect(() => { fetchSegments() }, [])

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-[#0b132b] text-gray-200">Loading…</div>
  }

  return (
    <div className="min-h-screen bg-[#0b132b] text-gray-200">
   <header className="bg-[#1c2541] text-white shadow">
  <div className="max-w-6xl mx-auto px-6 py-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
    {/* Left: title + role */}
    <div>
      <h1 className="text-2xl font-semibold">TNN Production</h1>
      <p className="text-sm text-gray-300">
        {me?.email} · Role: <span className="capitalize">{profile?.role}</span>
      </p>
    </div>

    {/* Right: unified action bar */}
    <nav className="flex flex-wrap items-center gap-2 sm:gap-3">
      <a
        href="/my-tasks"
        className="inline-flex h-9 items-center justify-center px-3 rounded-md bg-[#3a506b] text-white
                   hover:bg-[#5bc0be] hover:text-black transition-colors shadow-sm
                   focus:outline-none focus:ring-2 focus:ring-[#5bc0be] focus:ring-offset-2 focus:ring-offset-[#1c2541]"
      >
        My Tasks
      </a>

      {canEdit && (
        <a
          href="/approvals"
          className="inline-flex h-9 items-center justify-center px-3 rounded-md bg-[#3a506b] text-white
                     hover:bg-[#5bc0be] hover:text-black transition-colors shadow-sm
                     focus:outline-none focus:ring-2 focus:ring-[#5bc0be] focus:ring-offset-2 focus:ring-offset-[#1c2541]"
        >
          Approvals
        </a>
      )}

      {canEdit && (
        <a
          href="/admin"
          title="User management"
          className="inline-flex h-9 items-center justify-center px-3 rounded-md bg-transparent border border-gray-500 text-gray-100
                     hover:bg-[#0b132b] transition-colors shadow-sm
                     focus:outline-none focus:ring-2 focus:ring-[#5bc0be] focus:ring-offset-2 focus:ring-offset-[#1c2541]"
        >
          Admin Console
        </a>
      )}

      {canEdit && (
        <button
          onClick={() => setShowNew(true)}
          className="inline-flex h-9 items-center justify-center px-3 rounded-md bg-[#5bc0be] text-black
                     hover:bg-[#6fffe9] transition-colors shadow-sm
                     focus:outline-none focus:ring-2 focus:ring-[#6fffe9] focus:ring-offset-2 focus:ring-offset-[#1c2541]"
        >
          + New Segment
        </button>
      )}

      <button
        onClick={async () => { await supabase.auth.signOut(); router.push('/') }}
        className="inline-flex h-9 items-center justify-center px-3 rounded-md bg-gray-800 text-white
                   hover:bg-gray-700 transition-colors shadow-sm
                   focus:outline-none focus:ring-2 focus:ring-[#5bc0be] focus:ring-offset-2 focus:ring-offset-[#1c2541]"
      >
        Sign out
      </button>
    </nav>
  </div>
</header>

 

      <main className="max-w-6xl mx-auto px-6 py-6 space-y-4">
        {segments.length === 0 ? (
          <div className="rounded-lg bg-[#1c2541] shadow p-6 text-gray-200">
            No segments yet. {canEdit ? 'Click “New Segment” to get started.' : 'Check back later.'}
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-4">
            {segments.map(seg => (
              <button
                key={seg.id}
                className="text-left rounded-lg bg-[#1c2541] shadow hover:bg-[#0b132b] transition-colors p-4"
                onClick={() => router.push(`/segments/${seg.id}`)}
              >
                <div className="text-lg font-semibold text-white">{seg.title}</div>
                <div className="text-sm text-gray-300 mt-1">
                  {seg.description || '—'} · Created {new Date(seg.created_at).toLocaleDateString()}
                </div>
              </button>
            ))}
          </div>
        )}
      </main>

      {showNew && (
  <NewSegmentModal
    onClose={() => setShowNew(false)}
    onCreated={(newId) => {
      setShowNew(false)
      router.push(`/segments/${newId}`)
    }}
  />
)}

    </div>
  )
}
