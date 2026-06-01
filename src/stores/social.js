import { API, authHeaders } from './api'

export async function postFollow(username, token) {
  const res = await fetch(`${API}/users/${username}/follow`, {
    method: 'POST',
    headers: authHeaders(token),
  })
  const data = await res.json()
  return { ok: res.ok, data, error: data.error }
}
