import { useState, useEffect } from 'react'
import { supabase } from '../supabase/client'
import NewSegmentModal from '../components/NewSegmentModal'

export default function Dashboard() {
  const [segments, setSegments] = useState([])
  const [expandedSegment, setExpandedSegment] = useState(null)
  const [showModal, setShowModal] = useState(false)

  const fetchSegments = async () => {
    const { data: segs, error: segErr } = await supabase
      .from('segments')
      .select('*')
      .order('created_at', { ascending: false })

    if (segErr) {
      console.error(segErr)
      return
    }

    // Fetch steps for each segment
    const segmentsWithSteps = await Promise.all(
      segs.map(async (seg) => {
        const { data: steps, error: stepsErr } = await supabase
          .from('steps')
          .select('id, name, due_date, status, assigned_to')
          .eq('segment_id', seg.id)
          .order('due_date', { ascending: true })

        if (stepsErr) console.error(stepsErr)
        return { ...seg, steps: steps || [] }
      })
    )

    setSegments(segmentsWithSteps)
  }

  useEffect(() => {
    fetchSegments()
  }, [])

  return (
    <div className="p-6 bg-gray-100 min-h-screen">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-gray-800">Production Dashboard</h1>
        <button
          onClick={() => setShowModal(true)}
          className="bg-green-600 text-white px-4 py-2 rounded shadow hover:bg-green-700"
        >
          + New Segment
        </button>
      </div>

      {segments.length === 0 ? (
        <p className="text-gray-500">No segments yet. Create one to get started.</p>
      ) : (
        segments.map((seg) => (
          <div key={seg.id} className="bg-white rounded shadow mb-4">
            {/* Segment header */}
            <div
              className="p-4 flex justify-between items-center cursor-pointer hover:bg-gray-50"
              onClick={() =>
                setExpandedSegment(expandedSegment === seg.id ? null : seg.id)
              }
            >
              <div>
                <h2 className="text-xl font-semibold">{seg.name}</h2>
                <p className="text-sm text-gray-500">
                  Start Date: {seg.start_date}
                </p>
              </div>
              <span className="text-gray-400">
                {expandedSegment === seg.id ? '▲' : '▼'}
              </span>
            </div>

            {/* Steps list */}
            {expandedSegment === seg.id && (
              <div className="p-4 border-t">
                {seg.steps.length === 0 ? (
                  <p className="text-gray-400">No steps assigned yet.</p>
                ) : (
                  <ul>
                    {seg.steps.map((step) => (
                      <li
                        key={step.id}
                        className="flex justify-between items-center p-2 border-b last:border-none"
                      >
                        <div>
                          <p className="font-medium">{step.name}</p>
                          <p className="text-sm text-gray-500">
                            Due: {step.due_date || 'Not set'}
                          </p>
                        </div>
                        <div className="flex items-center gap-4">
                          <span
                            className={`px-2 py-1 rounded text-sm ${
                              step.status === 'Complete'
                                ? 'bg-green-200 text-green-800'
                                : step.status === 'In Progress'
                                ? 'bg-blue-200 text-blue-800'
                                : 'bg-gray-200 text-gray-800'
                            }`}
                          >
                            {step.status || 'Not Started'}
                          </span>
                          <span className="text-gray-500 text-sm">
                            {step.assigned_to || 'Unassigned'}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        ))
      )}

      {showModal && (
        <NewSegmentModal
          onClose={() => setShowModal(false)}
          onCreated={fetchSegments}
        />
      )}
    </div>
  )
}
