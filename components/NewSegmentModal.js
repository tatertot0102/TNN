import { useState } from 'react'
import { supabase } from '../supabase/client'

export default function NewSegmentModal({ onClose, onCreated }) {
  const [segmentName, setSegmentName] = useState('')
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0])
  const [loading, setLoading] = useState(false)

  const handleCreate = async () => {
    if (!segmentName) {
      alert("Please enter a segment name")
      return
    }
    setLoading(true)

    const { error } = await supabase.rpc('create_segment_with_steps', {
      p_segment_name: segmentName,
      p_start_date: startDate
    })

    setLoading(false)

    if (error) {
      console.error(error)
      alert("Error creating segment")
    } else {
      alert("Segment created!")
      onCreated()
      onClose()
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center">
      <div className="bg-white rounded p-6 w-96">
        <h2 className="text-xl font-bold mb-4">New Segment</h2>
        <input
          type="text"
          placeholder="Segment name"
          value={segmentName}
          onChange={(e) => setSegmentName(e.target.value)}
          className="border p-2 w-full mb-4"
        />
        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className="border p-2 w-full mb-4"
        />
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="bg-gray-300 px-4 py-2 rounded">Cancel</button>
          <button
            onClick={handleCreate}
            className="bg-blue-600 text-white px-4 py-2 rounded"
            disabled={loading}
          >
            {loading ? "Creating..." : "Create"}
          </button>
        </div>
      </div>
    </div>
  )
}
