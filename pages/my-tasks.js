// pages/my-tasks.js — Activity (minimal, fast, realtime + filters + quick actions)
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../supabase/client'

/* ---------- UI helpers ---------- */
const BADGE = {
  'Not Started': 'bg-gray-700 text-gray-100',
  'In Progress': 'bg-blue-600/90 text-blue-50',
  'Awaiting Approvals': 'bg-amber-600/90 text-amber-50',
  'Changes Requested': 'bg-purple-600/90 text-purple-50',
  'Complete': 'bg-green-600/90 text-green-50',
  'Rejected': 'bg-red-600/90 text-red-50',
}
const PHASE_LABEL = { pre: 'Pre-Production', prod: 'Production', post: 'Post-Production', publish: 'Publishing' }

function isISODate(s){ return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) }
function fmtDate(d){ try{ return new Date(d).toLocaleDateString() }catch{ return '—' } }
function daysFromToday(s){
  if (!isISODate(s)) return null
  const today = new Date(); today.setHours(0,0,0,0)
  const dd = new Date(s); dd.setHours(0,0,0,0)
  return Math.round((dd - today)/(1000*60*60*24))
}
function highlight(text, q){
  if (!q) return text
  const idx = (text || '').toLowerCase().indexOf(q.toLowerCase())
  if (idx === -1) return text
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-yellow-600/40 text-yellow-50 rounded px-0.5">{text.slice(idx, idx+q.length)}</mark>
      {text.slice(idx+q.length)}
    </>
  )
}

export default function Activity() {
  const router = useRouter()
  const [me, setMe] = useState(null)
  const [profile, setProfile] = useState(null)

  // data
  const [mySteps, setMySteps] = useState([])
  const [ownedSegments, setOwnedSegments] = useState([])
  const [approvals, setApprovals] = useState([])
  const [seatsMap, setSeatsMap] = useState({})
  const [myPoolIds, setMyPoolIds] = useState([])

  // ui
  const [loading, setLoading] = useState(true)
  const [actioning, setActioning] = useState(false)
  const [activeTab, setActiveTab] = useState('approvals') // 'approvals' | 'steps' | 'segments'
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [phaseFilter, setPhaseFilter] = useState('all') // all | pre | prod | post | publish
  const [statusFilter, setStatusFilter] = useState('all') // all or status value
  const isLeader = useMemo(() => ['executive','associate'].includes(profile?.role), [profile])

  // debounce query
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 200)
    return () => clearTimeout(t)
  }, [query])

  /* -------- Auth & profile -------- */
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/'); return }
      setMe(user)
      const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      setProfile(prof || null)
      setLoading(false)
    })()
  }, [router])

  /* -------- Pools -------- */
  useEffect(() => {
    (async () => {
      if (!me?.id) return
      const { data } = await supabase.from('role_pool_members').select('pool_id').eq('user_id', me.id)
      setMyPoolIds((data || []).map(r => r.pool_id))
    })()
  }, [me])

  const loadSeatsForSegments = async (segmentIds) => {
    if (!segmentIds?.length) return
    const { data: seatRows } = await supabase
      .from('segment_approvers')
      .select('segment_id, role_key, user_id, pool_id')
      .in('segment_id', segmentIds)
    const map = {}
    ;(seatRows || []).forEach(r => {
      map[r.segment_id] ||= {}
      map[r.segment_id][r.role_key] = { user_id: r.user_id || null, pool_id: r.pool_id || null }
    })
    setSeatsMap(map)
  }

  /* -------- My Steps -------- */
  useEffect(() => {
    (async () => {
      if (!me?.id) return
      const { data } = await supabase
        .from('steps')
        .select('id, name, phase, due_date, status, assigned_to, segment_id, is_gate, segments!inner(id, title)')
        .eq('assigned_to', me.id)
        .order('due_date', { ascending: true })
      setMySteps(data || [])
    })()
  }, [me])

  /* -------- Owned Segments -------- */
  useEffect(() => {
    (async () => {
      if (!me?.id) return
      const { data: segs } = await supabase
        .from('segments')
        .select('id, title, owner_id, created_at')
        .eq('owner_id', me.id)
        .order('created_at', { ascending: false })
      const ids = (segs || []).map(s => s.id)
      if (ids.length === 0) { setOwnedSegments([]); return }
      const { data: st } = await supabase
        .from('steps')
        .select('id, segment_id, status, due_date')
        .in('segment_id', ids)
      const grouped = {}
      ;(st || []).forEach(s => {
        grouped[s.segment_id] ||= []
        grouped[s.segment_id].push(s)
      })
      const withProgress = (segs || []).map(s => {
        const steps = grouped[s.id] || []
        const total = steps.length
        const complete = steps.filter(x => x.status === 'Complete').length
        const nextDue = steps
          .filter(x => x.status !== 'Complete' && isISODate(x.due_date))
          .sort((a,b) => a.due_date.localeCompare(b.due_date))[0]?.due_date || null
        return { ...s, total, complete, nextDue }
      })
      setOwnedSegments(withProgress)
    })()
  }, [me])

  /* -------- Approvals -------- */
  useEffect(() => {
    (async () => {
      if (!me?.id) return
      const { data: gated } = await supabase
        .from('steps')
        .select('id, name, phase, due_date, status, segment_id, gate_roles, segments!inner(id, title)')
        .eq('is_gate', true)
        .eq('status', 'Awaiting Approvals')
        .order('due_date', { ascending: true })

      const segIds = Array.from(new Set((gated || []).map(g => g.segment_id)))
      await loadSeatsForSegments(segIds)

      const map = {}
      ;(gated || []).forEach(g => { (map[g.segment_id] ||= []).push(g) })

      const eligible = []
      for (const segId of Object.keys(map)) {
        const segSeats = seatsMap[segId] || {}
        for (const g of map[segId]) {
          const roles = (g.gate_roles || [])
          const ok = roles.some(rk => {
            const seat = segSeats[rk]
            if (!seat) return false
            if (seat.user_id && seat.user_id === me.id) return true
            if (seat.pool_id && myPoolIds.includes(seat.pool_id)) return true
            return false
          })
          if (ok) eligible.push(g)
        }
      }
      setApprovals(eligible)
    })()
  }, [me, myPoolIds, seatsMap])

  // realtime: steps & approvals
  useEffect(() => {
    const ch = supabase
      .channel('activity-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'steps' }, () => {
        (async () => {
          if (me?.id) {
            const { data } = await supabase
              .from('steps')
              .select('id, name, phase, due_date, status, assigned_to, segment_id, is_gate, segments!inner(id, title)')
              .eq('assigned_to', me.id)
              .order('due_date', { ascending: true })
            setMySteps(data || [])
          }
        })()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'approvals' }, () => setActioning(a => !a))
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [me])

  async function takeDecision(stepId, roleKey, decision){
    try {
      setActioning(true)
      let { error } = await supabase.rpc('approve_gate', {
        p_step_id: stepId, p_role_key: roleKey, p_decision: decision
      })
      if (error) {
        const alt = await supabase.rpc('tnn_approve_gate', {
          p_step_id: stepId, p_role_key: roleKey, p_decision: decision
        })
        error = alt.error
      }
      if (error) throw error
      await router.replace(router.asPath)
    } catch (e) {
      console.error('takeDecision error', e)
      alert(e.message || 'Failed to record decision')
    } finally {
      setActioning(false)
    }
  }

  // quick actions for steps
  function derivedStatus(s){
    if (['Complete','Rejected','Awaiting Approvals','Changes Requested','In Progress'].includes(s.status)) return s.status
    return 'Not Started'
  }
  function canStart(s){ return derivedStatus(s) === 'Not Started' && me?.id === s.assigned_to }
  function canSendApprovals(s){ return s.is_gate && derivedStatus(s) === 'In Progress' && me?.id === s.assigned_to }
  function canComplete(s){ return !s.is_gate && derivedStatus(s) === 'In Progress' && me?.id === s.assigned_to }
  function canReopen(s){ return !s.is_gate && ['Complete','Rejected','Awaiting Approvals'].includes(derivedStatus(s)) && me?.id === s.assigned_to }

  async function updateStep(stepId, patch){
    const { error } = await supabase.from('steps').update(patch).eq('id', stepId)
    if (error) throw error
  }
  const startStep       = (s) => updateStep(s.id, { status: 'In Progress' })
  const sendApprovals   = (s) => updateStep(s.id, { status: 'Awaiting Approvals' })
  const markComplete    = (s) => updateStep(s.id, { status: 'Complete' })
  const reopenStep      = (s) => updateStep(s.id, { status: 'In Progress' })

  /* -------- Groupings & Filters -------- */
  const groupedSteps = useMemo(() => {
    const buckets = { overdue: [], today: [], upcoming: [], later: [] }
    ;(mySteps || []).forEach(s => {
      const d = daysFromToday(s.due_date)
      if (d === null) { buckets.later.push(s); return }
      if (d < 0) buckets.overdue.push(s)
      else if (d === 0) buckets.today.push(s)
      else if (d <= 3) buckets.upcoming.push(s)
      else buckets.later.push(s)
    })
    return buckets
  }, [mySteps])

  const filterFn = (title, name, phase) => {
    if (!debouncedQuery) return true
    const q = debouncedQuery.toLowerCase()
    return (
      (title || '').toLowerCase().includes(q) ||
      (name || '').toLowerCase().includes(q) ||
      (phase || '').toLowerCase().includes(q)
    )
  }

  const passPhaseStatus = (phase, status) => {
    const phaseOk = phaseFilter === 'all' || phase === phaseFilter
    const statusOk = statusFilter === 'all' || (status || 'Not Started') === statusFilter
    return phaseOk && statusOk
  }

  const filteredNeeds = useMemo(() => {
    const list = []
    for (const s of groupedSteps.overdue) {
      list.push({ kind:'step', severity:3, id:`s-${s.id}`, title:s.name, subtitle:`${s.segments?.title || ''} · ${PHASE_LABEL[s.phase] || s.phase || '—'}`, due:s.due_date, chip:'Overdue', href:`/segments/${s.segment_id}` })
    }
    for (const s of groupedSteps.today) {
      list.push({ kind:'step', severity:2, id:`t-${s.id}`, title:s.name, subtitle:`${s.segments?.title || ''} · ${PHASE_LABEL[s.phase] || s.phase || '—'}`, due:s.due_date, chip:'Due today', href:`/segments/${s.segment_id}` })
    }
    for (const a of approvals) {
      list.push({ kind:'approval', severity:2, id:`a-${a.id}`, title:`Approve · ${a.name}`, subtitle:a.segments?.title || '', due:a.due_date, chip:'Awaiting approval', href:`/segments/${a.segment_id}` })
    }
    for (const s of groupedSteps.upcoming) {
      list.push({ kind:'step', severity:1, id:`u-${s.id}`, title:s.name, subtitle:`${s.segments?.title || ''} · ${PHASE_LABEL[s.phase] || s.phase || '—'}`, due:s.due_date, chip:`Due ${fmtDate(s.due_date)}`, href:`/segments/${s.segment_id}` })
    }
    const sorted = list.sort((a,b) => {
      if (b.severity !== a.severity) return b.severity - a.severity
      const ad = isISODate(a.due) ? a.due : '9999-12-31'
      const bd = isISODate(b.due) ? b.due : '9999-12-31'
      return ad.localeCompare(bd)
    })
    return sorted.filter(i => filterFn(i.subtitle, i.title, ''))
  }, [groupedSteps, approvals, debouncedQuery])

  const filteredApprovals = useMemo(() =>
    (approvals || [])
      .filter(s => filterFn(s.segments?.title, s.name, s.phase))
      .filter(s => passPhaseStatus(s.phase, s.status))
  , [approvals, debouncedQuery, phaseFilter, statusFilter])

  const filteredMySteps = useMemo(() => ({
    overdue: (groupedSteps.overdue || []).filter(s => filterFn(s.segments?.title, s.name, s.phase) && passPhaseStatus(s.phase, s.status)),
    today:   (groupedSteps.today   || []).filter(s => filterFn(s.segments?.title, s.name, s.phase) && passPhaseStatus(s.phase, s.status)),
    upcoming:(groupedSteps.upcoming|| []).filter(s => filterFn(s.segments?.title, s.name, s.phase) && passPhaseStatus(s.phase, s.status)),
    later:   (groupedSteps.later   || []).filter(s => filterFn(s.segments?.title, s.name, s.phase) && passPhaseStatus(s.phase, s.status)),
  }), [groupedSteps, debouncedQuery, phaseFilter, statusFilter])

  const filteredOwned = useMemo(() =>
    (ownedSegments || []).filter(s => filterFn(s.title, '', ''))
  , [ownedSegments, debouncedQuery])

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-[#0b132b] text-gray-200">Loading…</div>
  }

  return (
    <div className="min-h-screen bg-[#0b132b] text-gray-200">
      {/* Minimal header */}
      <header className="sticky top-0 z-30 bg-[#0b132b]/85 backdrop-blur border-b border-gray-800">
        <div className="max-w-6xl mx-auto px-6 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <h1 className="text-xl font-semibold text-white">Activity</h1>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <input
              className="flex-1 sm:w-80 rounded bg-[#0f1a33] border border-gray-800 text-gray-100 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#5bc0be]"
              placeholder="Search segments, steps, phases…"
              value={query}
              onChange={(e)=>setQuery(e.target.value)}
            />
            <a href="/dashboard" className="px-3 py-2 rounded bg-[#13213d] hover:bg-[#1a2b50] text-sm">Dashboard</a>
          </div>
        </div>
        {/* Compact filters */}
        <div className="max-w-6xl mx-auto px-6 pb-3 flex items-center gap-2 text-xs text-gray-300">
          <span>Filters:</span>
          <select className="rounded bg-[#0f1a33] border border-gray-800 text-gray-100 px-2 py-1"
                  value={phaseFilter} onChange={e=>setPhaseFilter(e.target.value)}>
            <option value="all">All phases</option>
            <option value="pre">Pre-Production</option>
            <option value="prod">Production</option>
            <option value="post">Post-Production</option>
            <option value="publish">Publishing</option>
          </select>
          <select className="rounded bg-[#0f1a33] border border-gray-800 text-gray-100 px-2 py-1"
                  value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}>
            <option value="all">All statuses</option>
            <option>Not Started</option>
            <option>In Progress</option>
            <option>Awaiting Approvals</option>
            <option>Changes Requested</option>
            <option>Complete</option>
            <option>Rejected</option>
          </select>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-6 space-y-8">
        {/* Needs Attention (minimal list) */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-base font-semibold">Needs Attention</h2>
            <div className="text-xs text-gray-400">{filteredNeeds.length}</div>
          </div>

          {filteredNeeds.length === 0 ? (
            <div className="rounded-lg bg-[#0f1a33] border border-gray-800 p-4 text-gray-300">Nothing urgent.</div>
          ) : (
            <ul className="rounded-lg bg-[#0f1a33] border border-gray-800 divide-y divide-gray-800 overflow-hidden">
              {filteredNeeds.map(item => (
                <li key={item.id}>
                  <a href={item.href} className="block px-4 py-3 hover:bg-[#122246] transition">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-white font-medium truncate">{highlight(item.title, debouncedQuery)}</div>
                        <div className="text-xs text-gray-400 truncate">{highlight(item.subtitle || '', debouncedQuery)}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-[11px] px-2 py-0.5 rounded ${
                          item.chip === 'Overdue' ? 'bg-red-700 text-red-100'
                          : item.chip === 'Due today' ? 'bg-amber-700 text-amber-100'
                          : item.chip === 'Awaiting approval' ? 'bg-indigo-700 text-indigo-100'
                          : 'bg-gray-700 text-gray-200'}`}>{item.chip}</span>
                        {isISODate(item.due) && (
                          <span className="text-[11px] px-2 py-0.5 rounded bg-gray-800 text-gray-300">{fmtDate(item.due)}</span>
                        )}
                      </div>
                    </div>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Tabs (subtle) */}
        <section>
          <div className="flex gap-2 border-b border-gray-800 mb-3">
            {[
              { key:'approvals', label:`Approvals (${filteredApprovals.length})` },
              { key:'steps', label:`My Steps (${(filteredMySteps.overdue.length + filteredMySteps.today.length + filteredMySteps.upcoming.length + filteredMySteps.later.length)})` },
              { key:'segments', label:`Segments I Own (${filteredOwned.length})` }
            ].map(t => (
              <button
                key={t.key}
                onClick={()=>setActiveTab(t.key)}
                className={`px-3 py-2 text-sm rounded-t ${
                  activeTab===t.key ? 'bg-[#0f1a33] text-white border border-gray-800 border-b-0' : 'text-gray-300 hover:text-white'
                }`}
              >{t.label}</button>
            ))}
            <div className="flex-1" />
          </div>

          {/* Approvals */}
          {activeTab === 'approvals' && (
            <div className="rounded-lg bg-[#0f1a33] border border-gray-800">
              {filteredApprovals.length === 0 ? (
                <div className="p-4 text-gray-300">Nothing to approve.</div>
              ) : (
                <ul className="divide-y divide-gray-800">
                  {filteredApprovals.map(step => {
                    const segSeats = seatsMap[step.segment_id] || {}
                    const eligibleRoles = (step.gate_roles || []).filter(rk => {
                      const seat = segSeats[rk]
                      if (!seat) return false
                      if (seat.user_id && seat.user_id === me?.id) return true
                      if (seat.pool_id && myPoolIds.includes(seat.pool_id)) return true
                      return false
                    })
                    const d = daysFromToday(step.due_date)
                    const dueChip = d === null ? 'No due date' : d < 0 ? 'Overdue' : d === 0 ? 'Due today' : `Due ${fmtDate(step.due_date)}`
                    const chipCls = d === null ? 'bg-gray-700 text-gray-200' : d < 0 ? 'bg-red-700 text-red-100' : d === 0 ? 'bg-amber-700 text-amber-100' : 'bg-gray-700 text-gray-200'
                    return (
                      <li key={step.id} className="p-4 flex flex-wrap items-center gap-3 justify-between">
                        <div className="min-w-0">
                          <div className="text-white font-medium truncate"><a href={`/segments/${step.segment_id}`} className="hover:underline">{highlight(step.segments?.title || `Segment ${step.segment_id}`, debouncedQuery)}</a><span className="text-gray-400"> · </span>{highlight(step.name, debouncedQuery)}</div>
                          <div className="text-xs text-gray-400 mt-0.5">You can approve as: {(eligibleRoles || []).join(', ') || '—'}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-xs px-2 py-0.5 rounded ${chipCls}`}>{dueChip}</span>
                          {(eligibleRoles || []).map(rk => (
                            <div key={rk} className="flex gap-1">
                              <button disabled={actioning} onClick={() => takeDecision(step.id, rk, 'approved')} className="px-2.5 py-1.5 rounded bg-green-600 hover:bg-green-500 text-white text-xs">Approve ({rk})</button>
                              <button disabled={actioning} onClick={() => takeDecision(step.id, rk, 'rejected')} className="px-2.5 py-1.5 rounded bg-red-600 hover:bg-red-500 text-white text-xs">Reject ({rk})</button>
                            </div>
                          ))}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          )}

          {/* My Steps */}
          {activeTab === 'steps' && (
            <div className="space-y-4">
              {(['overdue','today','upcoming','later']).map(bucket => {
                const label = bucket === 'overdue' ? 'Overdue'
                  : bucket === 'today' ? 'Due Today'
                  : bucket === 'upcoming' ? 'Next 3 Days'
                  : 'Later / No date'
                const arr = filteredMySteps[bucket] || []
                if (arr.length === 0) return null
                return (
                  <div key={bucket} className="rounded-lg bg-[#0f1a33] border border-gray-800">
                    <div className="px-4 py-2 text-sm text-gray-300 border-b border-gray-800">{label}</div>
                    <ul className="divide-y divide-gray-800">
                      {arr.map(item => (
                        <li key={item.id} className="p-4 flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-white font-medium truncate">
                              <a href={`/segments/${item.segment_id}`} className="hover:underline">{highlight(item.segments?.title || `Segment ${item.segment_id}`, debouncedQuery)}</a>
                              <span className="text-gray-400"> · </span>
                              {highlight(item.name, debouncedQuery)}
                            </div>
                            <div className="text-xs text-gray-400">{(PHASE_LABEL[item.phase] || item.phase || '—')} · Due {item.due_date ? fmtDate(item.due_date) : '—'}</div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`text-xs px-2 py-1 rounded ${BADGE[item.status || 'Not Started']}`}>{item.status || 'Not Started'}</span>
                            {canStart(item) && (
                              <button className="text-xs px-2 py-1 rounded bg-blue-600 hover:bg-blue-500" onClick={async()=>{await startStep(item); await router.replace(router.asPath)}}>Start</button>
                            )}
                            {canSendApprovals(item) && (
                              <button className="text-xs px-2 py-1 rounded bg-amber-600 hover:bg-amber-500" onClick={async()=>{await sendApprovals(item); await router.replace(router.asPath)}}>Send</button>
                            )}
                            {canComplete(item) && (
                              <button className="text-xs px-2 py-1 rounded bg-green-600 hover:bg-green-500" onClick={async()=>{await markComplete(item); await router.replace(router.asPath)}}>Complete</button>
                            )}
                            {canReopen(item) && (
                              <button className="text-xs px-2 py-1 rounded bg-gray-700 hover:bg-gray-600" onClick={async()=>{await reopenStep(item); await router.replace(router.asPath)}}>Reopen</button>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )
              })}
              {(['overdue','today','upcoming','later'].every(b => (filteredMySteps[b] || []).length === 0)) && (
                <div className="rounded-lg bg-[#0f1a33] border border-gray-800 p-4 text-gray-300">You have no assigned steps.</div>
              )}
            </div>
          )}

          {/* Segments I Own */}
          {activeTab === 'segments' && (
            <div className="grid md:grid-cols-2 gap-4">
              {filteredOwned.map(s => {
                const pct = s.total ? Math.round((s.complete / s.total) * 100) : 0
                return (
                  <a key={s.id} href={`/segments/${s.id}`} className="rounded-lg bg-[#0f1a33] border border-gray-800 p-4 hover:bg-[#122246] transition">
                    <div className="flex items-center justify-between">
                      <div className="text-white font-semibold truncate">{highlight(s.title, debouncedQuery)}</div>
                      <span className="text-xs px-2 py-0.5 rounded bg-gray-700 text-gray-200">{pct}%</span>
                    </div>
                    <div className="mt-2 h-1.5 bg-[#0b132b] rounded overflow-hidden">
                      <div className="h-1.5 bg-[#6fffe9]" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="mt-2 text-xs text-gray-300">{s.complete} of {s.total} steps complete · Next due {s.nextDue ? fmtDate(s.nextDue) : '—'}</div>
                  </a>
                )
              })}
              {filteredOwned.length === 0 && (
                <div className="rounded-lg bg-[#0f1a33] border border-gray-800 p-4 text-gray-300 md:col-span-2">You don’t own any segments that match your search.</div>
              )}
            </div>
          )}
        </section>
      </main>
    </div>
  )
}