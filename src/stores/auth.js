// stores/auth.js
// Handles login, register and logout by calling the backend API.
// On success, user data is saved to Pinia state AND localStorage so that
// the session survives a page refresh.

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

const API = import.meta.env.VITE_API_URL || 'http://localhost:3000/api'

export const useAuthStore = defineStore('auth', () => {

  // ── State
  const user = ref(JSON.parse(localStorage.getItem('cinelog_user')) || null)
  const token = ref(localStorage.getItem('cinelog_token') || '')

  // ── Getters 
  const isAuthenticated = computed(() => !!user.value && !!token.value)
  const authHeader = computed(() => token.value ? { Authorization: `Bearer ${token.value}` } : {})

  // ── Actions 

  // register() — creates a new account on the backend
  // Accepts the same form object your RegisterView sends
  async function register(formData) {
    try {
      const response = await fetch(`${API}/auth/register`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username:    formData.username,
          displayName: formData.displayName,
          email:       formData.email,
          password:    formData.password,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        // Backend returned a 4xx error — pass the message to the form
        return { success: false, error: data.error }
      }

      // Auto-login after successful registration
      user.value = data.user
      token.value = data.token
      localStorage.setItem('cinelog_user', JSON.stringify(data.user))
      localStorage.setItem('cinelog_token', data.token)
      return { success: true }

    } catch (err) {
      // Network error — backend is probably not running
      return { success: false, error: 'Cannot connect to server. Is the backend running?' }
    }
  }

  // login() — verifies credentials and loads user data
  async function login(username, password) {
    try {
      const response = await fetch(`${API}/auth/login`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })

      const data = await response.json()

      if (!response.ok) {
        return { success: false, error: data.error }
      }

      // Save user to Pinia state + localStorage
      user.value = data.user
      token.value = data.token
      localStorage.setItem('cinelog_user', JSON.stringify(data.user))
      localStorage.setItem('cinelog_token', data.token)
      return { success: true }

    } catch (err) {
      return { success: false, error: 'Cannot connect to server. Is the backend running?' }
    }
  }

  // logout() — clears the session everywhere
  function logout() {
    user.value = null
    token.value = ''
    localStorage.removeItem('cinelog_user')
    localStorage.removeItem('cinelog_token')
  }

  // updateProfile() — let the signed-in user change their displayName /
  // avatar / bio. Persists to backend, then mirrors the new fields onto
  // local state + localStorage so NavBar etc. update without a refresh.
  async function updateProfile(patch) {
    if (!token.value) return { success: false, error: 'Not signed in' }

    try {
      const response = await fetch(`${API}/users/me`, {
        method:  'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization:  `Bearer ${token.value}`,
        },
        body: JSON.stringify(patch),
      })

      const data = await response.json()
      if (!response.ok) {
        return { success: false, error: data.error || 'Could not update profile' }
      }

      user.value = { ...user.value, ...data.user }
      localStorage.setItem('cinelog_user', JSON.stringify(user.value))
      return { success: true, user: data.user }

    } catch (err) {
      return { success: false, error: 'Cannot connect to server.' }
    }
  }

  return { user, token, isAuthenticated, authHeader, login, register, logout, updateProfile }
})
