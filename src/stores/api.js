export const API = import.meta.env.VITE_API_URL || 'http://localhost:3000/api'

export function authHeaders(token) {
  return token ? { Authorization: `Bearer ${token}` } : {}
}
