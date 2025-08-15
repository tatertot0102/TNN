import { supabase } from './client'

export async function getUserWithRole() {
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError) throw userError
  if (!user) return null

  // Fetch role from our custom 'users' table
  const { data, error } = await supabase
    .from('users')
    .select('role_id')
    .eq('id', user.id)
    .single()

  if (error) throw error

  return { ...user, role_id: data.role_id }
}
