import { useEffect, useState } from 'react';
import { supabase } from '../supabase/client';

export default function SegmentsList({ role, userId }) {
  const [segments, setSegments] = useState([]);

  const fetchSegments = async () => {
    let query = supabase.from('segments').select('*');

    if (role !== 'executive') {
      query = query.eq('assigned_to', userId);
    }

    const { data, error } = await query;
    if (!error) {
      setSegments(data);
    }
  };

  useEffect(() => {
    fetchSegments();
  }, [role, userId]);

  return (
    <div className="bg-white p-4 rounded shadow">
      <h2 className="text-xl font-bold mb-4">Segments</h2>
      {segments.length === 0 ? (
        <p>No segments found.</p>
      ) : (
        <ul className="space-y-2">
          {segments.map((seg) => (
            <li key={seg.id} className="p-3 border rounded">
              <h3 className="font-semibold">{seg.title}</h3>
              <p className="text-sm text-gray-600">{seg.description}</p>
              <p className="text-sm">Status: {seg.status}</p>
              {seg.due_date && (
                <p className="text-sm">
                  Due: {new Date(seg.due_date).toLocaleDateString()}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
