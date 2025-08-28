// components/TimelinePlanner.js
import { useEffect, useMemo, useState } from 'react'

/* ------------ date utils ------------ */
function ymd(d) {
  if (!d) return ''
  const dt = new Date(d)
  if (isNaN(dt.getTime())) return ''
  return dt.toISOString().slice(0, 10)
}
function addDays(d, n) {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}
function daysDiff(a, b) {
  const d1 = new Date(a); d1.setHours(0,0,0,0)
  const d2 = new Date(b); d2.setHours(0,0,0,0)
  return Math.round((d1 - d2) / (1000*60*60*24))
}

// Compact mm-dd label for axis
function md(d){
  if(!d) return ''
  const dt=new Date(d); if(isNaN(dt.getTime())) return ''
  const m=String(dt.getMonth()+1).padStart(2,'0')
  const day=String(dt.getDate()).padStart(2,'0')
  return `${m}-${day}`
}

/* ------------ constants ------------ */
const PX_PER_DAY = 56
// left padding for labels
const X0 = 200
const RIGHT_PAD = 140
const ROW_H = 56
const BAR_H = 28
const TOP_PAD = 54

// Default durations if none specified
const DEFAULT_DURATIONS = {
  'Idea Drafting': 2,
  'Script Approval': 2,
  'Content Strategy Review': 1,
  'Production: Recording': 1,
  'Post-Production Editing': 3,
  'Post Final Approval': 1,
}

// A safe default pipeline (pre → production → post)
const DEFAULT_SEQUENCE = [
  { key: 'idea',        name: 'Idea Drafting',            type: 'pre' },
  { key: 'scriptGate',  name: 'Script Approval',          type: 'pre' },
  { key: 'csGate',      name: 'Content Strategy Review',  type: 'pre' },
  { key: 'prod',        name: 'Production: Recording',    type: 'production' },
  { key: 'postEdit',    name: 'Post-Production Editing',  type: 'post' },
  { key: 'postGate',    name: 'Post Final Approval',      type: 'post' },
]

/* ------------ helpers to normalize incoming steps ------------ */
function coerceType(t) {
  if (t === 'pre' || t === 'production' || t === 'post') return t
  return 'pre'
}

function hydrateSteps(rawSteps) {
  if (!Array.isArray(rawSteps) || rawSteps.length === 0) {
    return DEFAULT_SEQUENCE
  }
  return rawSteps.map((s, i) => ({
    key: String(s.key ?? s.id ?? i),
    name: String(s.name ?? `Step ${i+1}`),
    type: coerceType(s.type),
  }))
}

// Build an editable planning model for pre/post steps
function normalizePlan(stepsStd) {
  return stepsStd
    .filter(s => s.type !== 'production')
    .map((s) => ({
      key: s.key,
      name: s.name,
      duration: DEFAULT_DURATIONS[s.name] || 1,
      strict: false,
      anchorDate: '',
    }))
}

/* ------------ component ------------ */
export default function TimelinePlanner({ produceDate, steps, onSchedule }) {
  // Hydrate steps up-front and whenever prop changes
  const stepsStd = useMemo(() => hydrateSteps(steps), [JSON.stringify(steps ?? [])])

  const [plan, setPlan] = useState(normalizePlan(stepsStd))
  const [datesMap, setDatesMap] = useState({})
  const [warnings, setWarnings] = useState([])
  const [timelineStart, setTimelineStart] = useState(null)
  const [confirmed, setConfirmed] = useState(false)
  const [selectedKey, setSelectedKey] = useState(null) // bar selection (pre/post only)
  const [positions, setPositions] = useState({})       // key -> {x,y,w}

  const today = useMemo(() => ymd(new Date()), [])

  // Keep plan in sync if steps change
  useEffect(() => {
    setPlan(normalizePlan(stepsStd))
  }, [JSON.stringify(stepsStd)])

  // Core scheduling calculation (runs after confirmation)
  useEffect(() => {
    if (!produceDate || !confirmed) return

    const prodDateObj = new Date(produceDate)
    if (isNaN(prodDateObj.getTime())) return

    const prodDate = ymd(prodDateObj)
    const dates = {}
    const warns = []

    // Ensure we have a production step
    const productionStep = stepsStd.find(s => s.type === 'production')
    if (!productionStep) {
      warns.push('No production step found in steps.')
      setWarnings(warns)
      return
    }

    // Anchor production to produceDate
    dates[productionStep.key] = prodDate

    // Build a map of plan settings (durations/strict/anchor)
    const planMap = Object.fromEntries(plan.map(p => [p.key, p]))

    // PRE: schedule backwards from production
    const pre = stepsStd.filter(s => s.type === 'pre')
    let cursor = prodDateObj
    for (let i = pre.length - 1; i >= 0; i--) {
      const step = pre[i]
      const p = planMap[step.key] || {}
      const dur = Number.isFinite(Number(p.duration)) && Number(p.duration) > 0
        ? Number(p.duration)
        : (DEFAULT_DURATIONS[step.name] || 1)

      if (p.strict && p.anchorDate) {
        dates[step.key] = ymd(new Date(p.anchorDate))
        cursor = new Date(p.anchorDate)
      } else {
        cursor = addDays(cursor, -dur)
        dates[step.key] = ymd(cursor)
      }
    }

    // POST: schedule forwards from production (no gaps)
    const post = stepsStd.filter(s => s.type === 'post')
    cursor = prodDateObj
    for (let i = 0; i < post.length; i++) {
      const step = post[i]
      const p = planMap[step.key] || {}
      const dur = Number.isFinite(Number(p.duration)) && Number(p.duration) > 0
        ? Number(p.duration)
        : (DEFAULT_DURATIONS[step.name] || 1)

      if (p.strict && p.anchorDate) {
        // respect anchored date; move cursor to the end of this anchored block
        const start = new Date(p.anchorDate)
        dates[step.key] = ymd(start)
        // cursor becomes last day of this step
        cursor = addDays(start, dur - 1)
      } else {
        // start the day after the current cursor and make the next step butt up against it
        const start = addDays(cursor, 1)
        dates[step.key] = ymd(start)
        cursor = addDays(start, dur - 1)
      }
    }

    // Compute earliest date for the timeline
    const allDates = Object.values(dates).filter(Boolean)
    const earliest = allDates.reduce((min, d) =>
      (!min || new Date(d) < new Date(min)) ? d : min, null)
    setTimelineStart(earliest || today)

    // Sanity warnings (time before production)
    const totalPreDays = pre.reduce((acc, s) => {
      const p = planMap[s.key] || {}
      const dur = Number.isFinite(Number(p.duration)) && Number(p.duration) > 0
        ? Number(p.duration)
        : (DEFAULT_DURATIONS[s.name] || 1)
      return acc + dur
    }, 0)
    const available = Math.max(0, daysDiff(prodDateObj, new Date(today)) - 1)
    if (available < totalPreDays) {
      warns.push(`Not enough time: need ${totalPreDays} days, but only ${available} left before production.`)
    }

    setWarnings(warns)
    setDatesMap(dates)
    onSchedule?.({ datesMap: dates, plan, warnings: warns })
  }, [produceDate, confirmed, stepsStd, plan, today, onSchedule])

  /* ------------ plan controls ------------ */
  const bump = (byKey, delta) => {
    setPlan(prev => prev.map(p => p.key === byKey ? { ...p, duration: Math.max(1, (Number(p.duration)||1) + delta) } : p))
  }
  const toggleStrict = (byKey) => {
    setPlan(prev => prev.map(p => p.key === byKey ? { ...p, strict: !p.strict, anchorDate: p.strict ? '' : p.anchorDate } : p))
  }
  const setAnchorDate = (byKey, date) => {
    setPlan(prev => prev.map(p => p.key === byKey ? { ...p, anchorDate: date || '' } : p))
  }
  // Click label to pin/unpin at the shown (scheduled) date
  const toggleAnchorToCurrent = (byKey) => {
    setPlan(prev => prev.map(p => {
      if (p.key !== byKey) return p
      const currentDate = datesMap[byKey] || p.anchorDate || ''
      const isOn = !!(p.strict && p.anchorDate)
      return isOn
        ? { ...p, strict: false, anchorDate: '' }
        : { ...p, strict: true, anchorDate: currentDate }
    }))
    setSelectedKey(byKey)
  }

  /* ------------ timeline math & bars (hooks must come before early returns) ------------ */
  const safeStartISO = timelineStart || produceDate || today
  const startDate = useMemo(() => {
    const d = new Date(safeStartISO || today)
    d.setHours(0,0,0,0)
    return d
  }, [safeStartISO, today])

  const totalDays = useMemo(() => {
    if (timelineStart) {
      const start = new Date(startDate); start.setHours(0,0,0,0)
      let end = produceDate ? new Date(produceDate) : new Date(start)
      end.setHours(0,0,0,0)
      const allDates = Object.values(datesMap || {}).filter(Boolean)
      for (const d of allDates) {
        const dt = new Date(d); dt.setHours(0,0,0,0)
        if (isFinite(dt.getTime()) && dt > end) end = dt
      }
      return Math.max(daysDiff(end, start) + 2, 7)
    }
    return 7
  }, [timelineStart, produceDate, startDate, JSON.stringify(datesMap)])

  // Build positioned bars; safe to compute even when some pieces are missing
  const stepsWithPos = useMemo(() => {
    if (!stepsStd || stepsStd.length === 0) return []
    return stepsStd.map((s, i) => {
      const start = datesMap[s.key]
      if (!start) return null
      let dur = 1
      if (s.type === 'production') {
        dur = 1
      } else {
        const p = plan.find(pl => pl.key === s.key)
        dur = p ? Number(p.duration) || 1 : (DEFAULT_DURATIONS[s.name] || 1)
      }
      const startOffset = daysDiff(new Date(start), startDate)
      return { ...s, startOffset, dur, index: i }
    }).filter(Boolean)
  }, [JSON.stringify(stepsStd), JSON.stringify(datesMap), JSON.stringify(plan), startDate.getTime()])

  const todayOffset = useMemo(() => daysDiff(new Date(today), startDate), [today, startDate])
  const production = useMemo(() => stepsStd.find(s => s.type === 'production'), [JSON.stringify(stepsStd)])
  const productionOffset = useMemo(() => (
    production && datesMap[production.key] ? daysDiff(new Date(datesMap[production.key]), startDate) : -1
  ), [production, JSON.stringify(datesMap), startDate.getTime()])

  // Compute floating panel anchor positions after bars are laid out
  useEffect(() => {
    const pos = {}
    stepsWithPos.forEach((s, i) => {
      const x = s.startOffset * PX_PER_DAY + X0
      const y = TOP_PAD + i * ROW_H + (ROW_H - BAR_H) / 2
      const w = s.dur * PX_PER_DAY
      pos[s.key] = { x, y, w }
    })
    setPositions(pos)
  }, [JSON.stringify(stepsWithPos)])

  /* ------------ rendering guards (AFTER hooks to keep hook order stable) ------------ */
  if (!produceDate) {
    return (
      <div className="rounded-lg border border-gray-700 p-4 bg-[#0f1a33] text-gray-200">
        Pick a <span className="text-[#6fffe9] font-medium">Production date</span> to visualize the schedule.
      </div>
    )
  }

  if (!confirmed) {
    return (
      <div className="rounded-lg border border-gray-700 p-4 bg-[#0f1a33] text-gray-200 space-y-3">
        <div>
          Production date chosen: <span className="text-[#6fffe9] font-medium">{produceDate}</span>
        </div>
        <button
          onClick={() => setConfirmed(true)}
          className="px-4 py-2 bg-green-600 hover:bg-green-500 rounded text-white"
        >
          Confirm Production Date
        </button>
      </div>
    )
  }

  if (!stepsStd || stepsStd.length === 0) {
    return (
      <div className="rounded-lg border border-gray-700 p-4 bg-[#0f1a33] text-gray-200">
        No steps available to display in timeline.
      </div>
    )
  }

  if (!timelineStart) {
    return (
      <div className="rounded-lg border border-gray-700 p-4 bg-[#0f1a33] text-gray-200">
        Preparing timeline…
      </div>
    )
  }

  return (
    <div className="space-y-4 font-sans text-gray-200 select-none">
      {/* Legend */}
      <div className="text-xs text-gray-300 flex items-center gap-4">
        <span><span className="inline-block w-3 h-3 rounded-sm align-middle" style={{background:'#4f79b7'}} /> Pre steps</span>
        <span><span className="inline-block w-3 h-3 rounded-sm align-middle" style={{background:'#2a9d8f'}} /> Production</span>
        <span><span className="inline-block w-3 h-3 rounded-sm align-middle" style={{background:'#6bbf59'}} /> Post steps</span>
        <span className="ml-4">Click a name to 📌 pin to shown date. Click bar to edit.</span>
      </div>
      <div className="relative overflow-x-auto">
        <svg
          width={totalDays * PX_PER_DAY + (X0 + RIGHT_PAD)}
          height={stepsWithPos.length * ROW_H + TOP_PAD + 40}
        >
          <defs>
            <filter id="barShadow" x="-10%" y="-10%" width="130%" height="140%">
              <feDropShadow dx="0" dy="1" stdDeviation="1.5" floodColor="#000" floodOpacity="0.35" />
            </filter>
          </defs>

          {/* alternating row lanes */}
          {stepsWithPos.map((s, i) => {
            const y = TOP_PAD + i * ROW_H
            return (
              <rect
                key={`lane-${s.key}`}
                x={0}
                y={y}
                width={totalDays * PX_PER_DAY + (X0 + RIGHT_PAD)}
                height={ROW_H}
                fill={i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent'}
              />
            )
          })}

          {/* day grid */}
          {Array.from({ length: totalDays }).map((_, i) => {
            const x = i * PX_PER_DAY + X0
            const dateISO = ymd(addDays(startDate, i))
            return (
              <g key={dateISO}>
                <text x={x + PX_PER_DAY / 2} y={20} textAnchor="middle" fontSize="11" fill="#aab3c5">
                  {md(dateISO)}
                </text>
                <line x1={x} y1={TOP_PAD - 6} x2={x} y2={stepsWithPos.length * ROW_H + TOP_PAD} stroke="#2a344d" />
              </g>
            )
          })}

          {/* bars */}
          {stepsWithPos.map((s, i) => {
            const x = s.startOffset * PX_PER_DAY + X0
            const y = TOP_PAD + i * ROW_H + (ROW_H - BAR_H) / 2
            const w = s.dur * PX_PER_DAY
            const isProduction = s.type === 'production'
            const isPost = s.type === 'post'
            const planRow = plan.find(p => p.key === s.key)
            const fill = isProduction
              ? '#2a9d8f'
              : (isPost ? '#6bbf59' : (planRow?.strict ? '#e0a800' : '#4f79b7'))
            const canEdit = s.type !== 'production'

            return (
              <g key={s.key}>
                {/* Row label (no click to pin/unpin, no pin indicator prefix) */}
                <text
                  x={16}
                  y={TOP_PAD + i * ROW_H + ROW_H / 2 + 4}
                  fontSize="12"
                  fill="#cdd3df"
                  style={{ cursor: canEdit ? 'default' : 'default' }}
                  title={s.name}
                >
                  {s.name}
                </text>

                <rect
                  x={x}
                  y={y}
                  width={w}
                  height={BAR_H}
                  fill={fill}
                  stroke={selectedKey === s.key ? '#ffffff' : '#0b132b'}
                  strokeWidth={selectedKey === s.key ? 1.5 : 1}
                  rx={6}
                  filter="url(#barShadow)"
                  style={{ cursor: 'pointer' }}
                  onClick={() => setSelectedKey(s.key)}
                />
                {/* Explicit pin button for non-production steps */}
                {canEdit && (
                  <g
                    onClick={() => { setSelectedKey(s.key); toggleAnchorToCurrent(s.key) }}
                    style={{ cursor: 'pointer' }}
                    title={planRow?.strict ? 'Unpin from date' : 'Pin to shown date'}
                  >
                    <rect x={x - 24} y={y + (BAR_H-20)/2} width={20} height={20} rx={10} fill="#1f2940" stroke="#3a4661" />
                    <text x={x - 14} y={y + BAR_H/2 + 4} fontSize="12" textAnchor="middle" fill={planRow?.strict ? '#ffd166' : '#cdd3df'}>📌</text>
                  </g>
                )}
                {/* subtle light outline overlay */}
                <rect x={x} y={y} width={w} height={BAR_H} fill="transparent" stroke="rgba(255,255,255,0.08)" rx={6} />
                {/* small inline +/- for quick tweak on pre/post steps */}
                {canEdit && (
                  <>
                    <g onClick={() => bump(s.key, -1)} style={{cursor:'pointer'}} title="Shorten by 1 day">
                      <rect x={x + 4} y={y + (BAR_H-20)/2} width={20} height={20} fill="transparent" />
                      <text x={x + 14} y={y + BAR_H/2 + 4} fontSize="13" fontWeight="600" textAnchor="middle" fill="#fff">−</text>
                    </g>
                    <g onClick={() => bump(s.key, 1)} style={{cursor:'pointer'}} title="Extend by 1 day">
                      <rect x={x + w - 24} y={y + (BAR_H-20)/2} width={20} height={20} fill="transparent" />
                      <text x={x + w - 14} y={y + BAR_H/2 + 4} fontSize="13" fontWeight="600" textAnchor="middle" fill="#fff">＋</text>
                    </g>
                  </>
                )}
                <text x={x + w/2} y={y + BAR_H/2 + 4} textAnchor="middle" fontSize="11" fill="#fff">{s.dur}d</text>
              </g>
            )
          })}

          {/* today & production lines */}
          {todayOffset >= 0 && todayOffset <= totalDays - 1 && (
            <line
              x1={todayOffset * PX_PER_DAY + X0}
              y1={TOP_PAD - 6}
              x2={todayOffset * PX_PER_DAY + X0}
              y2={stepsWithPos.length * ROW_H + TOP_PAD}
              stroke="#ff5e5e"
              strokeWidth={2}
            />
          )}
          {productionOffset >= 0 && productionOffset <= totalDays - 1 && (
            <line
              x1={productionOffset * PX_PER_DAY + X0}
              y1={TOP_PAD - 6}
              x2={productionOffset * PX_PER_DAY + X0}
              y2={stepsWithPos.length * ROW_H + TOP_PAD}
              stroke="#3ddc72"
              strokeWidth={2}
            />
          )}
        </svg>

        {/* Floating edit panel for selected step */}
        {selectedKey && positions[selectedKey] && (() => {
          const { x, y, w } = positions[selectedKey]
          const p = plan.find(pp => pp.key === selectedKey)
          const stepObj = stepsStd.find(s => s.key === selectedKey)
          const stepName = stepObj?.name || 'Step'
          const isProd = stepObj?.type === 'production'
          return (
            <div
              className="absolute bg-[#0b132b] border border-gray-700 rounded-md shadow-lg px-3 py-2 space-y-2"
              style={{ left: Math.max(10, x + w + 12), top: Math.max(10, y - 6), minWidth: 220 }}
            >
              <div className="text-xs text-gray-300">{stepName}</div>
              {isProd ? (
                <div className="text-[12px] text-gray-200">Scheduled on <span className="text-[#6fffe9]">{datesMap[stepObj.key] || produceDate}</span>. This is locked to the production day.</div>
              ) : (
                <>
                  {stepObj?.type==='post' && (
                    <div className="text-[11px] text-gray-400">Post step — scheduled after production</div>
                  )}
                  <div className="flex items-center gap-2">
                    <button onClick={() => bump(selectedKey, -1)} className="px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded" title="Shorten by 1 day">-</button>
                    <span className="text-sm">{p?.duration ?? 1}d</span>
                    <button onClick={() => bump(selectedKey, 1)} className="px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded" title="Extend by 1 day">+</button>
                  </div>
                  <label className="flex items-center gap-2 text-xs">
                    <input type="checkbox" checked={!!p?.strict} onChange={() => toggleStrict(selectedKey)} />
                    strict anchor
                  </label>
                  {p?.strict && (
                    <input
                      type="date"
                      value={p?.anchorDate || ''}
                      onChange={(e) => setAnchorDate(selectedKey, e.target.value)}
                      className="text-xs rounded border border-gray-600 bg-[#0b132b] text-gray-100 px-2 py-1"
                    />
                  )}
                  {!p?.strict && (
                    <button
                      onClick={() => toggleAnchorToCurrent(selectedKey)}
                      className="mt-1 px-2 py-1 bg-amber-600/80 hover:bg-amber-500 rounded text-xs"
                      title="Pin this step to the currently shown date"
                    >📌 Pin to shown date</button>
                  )}
                </>
              )}
              <div className="pt-1 flex justify-end">
                <button onClick={() => setSelectedKey(null)} className="text-xs text-gray-300 hover:text-gray-100">Close</button>
              </div>
            </div>
          )
        })()}
      </div>

      {warnings.length > 0 && (
        <div className="rounded-md border border-yellow-600/40 bg-yellow-900/20 text-yellow-300 text-sm px-3 py-2">
          <div className="font-medium mb-1">⚠ {warnings.length} issue{warnings.length !== 1 ? 's' : ''}</div>
          <ul className="list-disc pl-5 space-y-1">
            {warnings.map((w,i)=> (<li key={i}>{w}</li>))}
          </ul>
        </div>
      )}
    </div>
  )
}