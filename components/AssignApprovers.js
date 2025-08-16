// components/AssignApprovers.js
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabase/client'

const SEATS = [
  { key: 'script_editor',      label: 'Script Editor (Gate)' },
  { key: 'content_strategist', label: 'Content Strategist (Gate)' },
  { key: 'director',           label: 'Director (Prod Gate)' },
  { key: 'post_supervisor',    label: 'Post Supervisor (Gate)' },
  { key: 'producer',           label: 'Producer (Optional)' },
  { key: 'publisher',          label: 'Publisher (Optional)' }
]

export default function AssignApprovers({ segmentId, myProfile }) {
  const [people, setPeople] = useState([])
  const [pools, setPools] = useState([]) // [{id, name, role_key}]
  const [seats, setSeats] = useState({}) // role_key -> { user_id, pool_id }
  const isExec = useMemo(() => myProfile?.role === 'executive' || myProfile?.role === 'associate', [myProfile])

  useEffect(() => {
    (async () => {
      const [{ data: ppl }, { data: pls }, { data: sa }] = await Promise.all([
        supabase.from('profiles').select('id, name, email, role').order('name', { ascending: true }),
        supabase.from('role_pools').select('id, name, role_key').order('name', { ascending: true }),
        supabase.from('segment_approvers').select('role_key, user_id, pool_id').eq('segment_id', segmentId)
      ])
      setPeople(ppl || [])
      setPools(pls || [])
      const map = {}
      ;(sa || []).forEach(r => { map[r.role_key] = { user_id: r.user_id, pool_id: r.pool_id } })
      setSeats(map)
    })()
  }, [segmentId])

  const displayName = (p) => p?.name || p?.email || (p?.id || '').slice(0,8)
  const poolName    = (id) => pools.find(pl => pl.id === id)?.name || '—'

  async function saveSeat(roleKey, { user_id = null, pool_id = null }) {
    const payload = { segment_id: segmentId, role_key: roleKey, user_id, pool_id }
    const { error } = await supabase.from('segment_approvers').upsert(payload, { onConflict: 'segment_id,role_key' })
    if (error) { alert(error.message || 'Failed to assign'); return }
    setSeats(prev => ({ ...prev, [roleKey]: { user_id, pool_id } }))
  }

  function SeatCard({ seat }) {
    const current = seats[seat.key] || {}
    const mode = current.user_id ? 'person' : (current.pool_id ? 'pool' : 'none')
    const seatPools = pools.filter(pl => pl.role_key === seat.key)

    return (
      <div className="rounded-lg bg-[#0f1a33] border border-gray-700 p-3 space-y-2">
        <div className="text-sm text-gray-200 font-medium">{seat.label}</div>

        {!isExec ? (
          <div className="text-sm text-white">
            {current.user_id ? (
              <>Person: <span className="font-semibold">{displayName(people.find(p=>p.id===current.user_id))}</span></>
            ) : current.pool_id ? (
              <>Pool: <span className="font-semibold">{poolName(current.pool_id)}</span></>
            ) : (
              <span className="text-gray-400">Unassigned</span>
            )}
          </div>
        ) : (
          <>
            {/* Mode toggle */}
            <div className="inline-flex rounded-md overflow-hidden border border-gray-700">
              <button
                type="button"
                onClick={() => saveSeat(seat.key, { user_id: current.user_id, pool_id: null })}
                className={`px-2 py-1 text-xs ${mode==='person' ? 'bg-[#5bc0be] text-black' : 'bg-[#0b132b] text-gray-200 hover:bg-[#142041]'}`}
                title="Approve/act must be done by a specific person"
              >Person</button>
              <button
                type="button"
                onClick={() => saveSeat(seat.key, { user_id: null, pool_id: current.pool_id })}
                className={`px-2 py-1 text-xs ${mode==='pool' ? 'bg-[#5bc0be] text-black' : 'bg-[#0b132b] text-gray-200 hover:bg-[#142041]'}`}
                title="Any member of the selected pool can approve/act"
              >Pool</button>
            </div>

            {/* Person picker */}
            <div className="grid sm:grid-cols-2 gap-2">
              <select
                className="rounded border border-gray-700 bg-[#0b132b] text-gray-100 px-2 py-2"
                value={current.user_id || ''}
                onChange={(e)=>saveSeat(seat.key, { user_id: e.target.value || null, pool_id: null })}
              >
                <option value="">— Select person —</option>
                {people.map(p => (
                  <option key={p.id} value={p.id}>
                    {displayName(p)} ({p.role})
                  </option>
                ))}
              </select>

              {/* Pool picker (only pools matching this role_key) */}
              <select
                className="rounded border border-gray-700 bg-[#0b132b] text-gray-100 px-2 py-2"
                value={current.pool_id || ''}
                onChange={(e)=>saveSeat(seat.key, { user_id: null, pool_id: e.target.value || null })}
              >
                <option value="">— Select pool —</option>
                {seatPools.map(pl => (
                  <option key={pl.id} value={pl.id}>{pl.name}</option>
                ))}
              </select>
            </div>

            <div className="text-xs text-gray-400">
              Tip: If both are set, the **person** takes precedence; otherwise the **pool** applies.
            </div>
          </>
        )}
      </div>
    )
  }

  return (
    <div className="rounded-lg bg-[#1c2541] border border-gray-700 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-white">Decision Seats</h3>
        {isExec && (
          <a href="/admin/pools" className="text-xs text-[#6fffe9] hover:underline">Manage Pools</a>
        )}
      </div>
      <div className="grid lg:grid-cols-2 gap-3">
        {SEATS.map(s => <SeatCard key={s.key} seat={s} />)}
      </div>
    </div>
  )
}
