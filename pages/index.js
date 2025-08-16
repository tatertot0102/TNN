// pages/index.js
import { useState } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../supabase/client'

export default function Login() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authError, setAuthError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSignIn(e) {
    e.preventDefault()
    setAuthError('')
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (error) {
      setAuthError(error.message || 'Sign-in failed')
      return
    }
    router.push('/dashboard')
  }

  return (
    <div className="min-h-screen bg-[#0b132b] text-gray-200 flex items-center justify-center p-6">
      <div className="w-full max-w-sm bg-[#1c2541] rounded-xl shadow-lg overflow-hidden">
        {/* Header */}
        <div className="px-6 pt-6 pb-4">
          <h1 className="text-2xl font-bold text-white">TNN Sign In</h1>
          <p className="text-sm text-gray-300 mt-1">
            Use the account created for you by an Executive.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSignIn} className="px-6 pb-6 space-y-3">
          <div>
            <label className="block text-sm text-gray-300 mb-1">Email</label>
            <input
              type="email"
              className="w-full rounded border border-gray-600 bg-[#0b132b] text-gray-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#5bc0be]"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@school.org"
              required
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm text-gray-300 mb-1">Password</label>
            <input
              type="password"
              className="w-full rounded border border-gray-600 bg-[#0b132b] text-gray-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#5bc0be]"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>

          {authError && (
            <div className="text-sm rounded border border-red-500 bg-red-900/40 text-red-200 px-3 py-2">
              {authError}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-1 bg-[#3a506b] hover:bg-[#5bc0be] hover:text-black text-white font-medium px-4 py-2 rounded transition-colors disabled:opacity-60"
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        {/* Footer */}
        <div className="px-6 pb-6 -mt-3">
          <p className="text-xs text-gray-400">
            No self-signups. Ask an Executive to create your account.
          </p>
        </div>
      </div>
    </div>
  )
}
