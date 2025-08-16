// components/AssigneeSelect.js
import { useEffect, useState } from 'react'
import { supabase } from '../supabase/client'

export default function AssigneeSelect({ value, onChange, disabled }) {
  const [people, setPeople] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, name, role')
        .order('role', { ascending: true })
      if (!error) setPeople(data || [])
      setLoading(false)
    })()
  }, [])

  if (loading) {
    return (
      <span className="text-xs text-gray-400">loading…</span>
    )
  }

  return (
    <select
      className="text-sm rounded border border-gray-600 bg-[#0b132b] text-gray-200 px-2 py-1"
      value={value || ''}
      onChange={(e) => onChange(e.target.value || null)}
      disabled={disabled}
    >
      <option value="">Unassigned</option>
      {people.map(p => (
        <option key={p.id} value={p.id}>
          {p.name ? `${p.name} (${p.role})` : `${p.id.slice(0,6)}… (${p.role})`}
        </option>
      ))}
    </select>
  )
}
