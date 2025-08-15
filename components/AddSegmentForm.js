import { useState } from 'react';
import { supabase } from '../supabase/client';

export default function AddSegmentForm({ onSegmentAdded }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();

    const { error } = await supabase.from('segments').insert([
      { title, description, due_date: dueDate }
    ]);

    if (error) {
      alert(error.message);
    } else {
      setTitle('');
      setDescription('');
      setDueDate('');
      onSegmentAdded();
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-white p-4 rounded shadow mb-6 space-y-4"
    >
      <h2 className="text-xl font-bold">Add New Segment</h2>
      <input
        type="text"
        placeholder="Title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="w-full border p-2 rounded"
      />
      <textarea
        placeholder="Description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        className="w-full border p-2 rounded"
      />
      <input
        type="date"
        value={dueDate}
        onChange={(e) => setDueDate(e.target.value)}
        className="w-full border p-2 rounded"
      />
      <button
        type="submit"
        className="px-4 py-2 bg-blue-600 text-white rounded"
      >
        Add Segment
      </button>
    </form>
  );
}
