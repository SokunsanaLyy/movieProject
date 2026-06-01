import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useAuthStore } from './auth'
import { API, authHeaders } from './api'
import { postFollow } from './social'

export const useConnectionsStore = defineStore('connections', () => {
  const auth = useAuthStore()

  const followers = ref([])
  const following = ref([])
  const loading = ref(true)
  const profilePrivate = ref(false)
  const pendingId = ref(null)
  const search = ref('')
  const globalResults = ref([])
  const globalLoading = ref(false)
  const activeTab = ref('followers')

  const trimmedSearch = computed(() => search.value.trim())

  const usersForTab = computed(() =>
    activeTab.value === 'followers' ? followers.value : following.value
  )

  const filteredUsers = computed(() => {
    if (!trimmedSearch.value) return usersForTab.value
    const q = trimmedSearch.value.toLowerCase()
    return usersForTab.value.filter(u =>
      u.displayName.toLowerCase().includes(q) ||
      u.username.toLowerCase().includes(q)
    )
  })

  const discoverUsers = computed(() => {
    if (!trimmedSearch.value) return []
    const visibleIds = new Set(filteredUsers.value.map(u => u.id))
    return globalResults.value.filter(u => !visibleIds.has(u.id))
  })

  async function loadConnections(username) {
    loading.value = true
    profilePrivate.value = false
    try {
      const headers = authHeaders(auth.token)

      const [followersRes, followingRes] = await Promise.all([
        fetch(`${API}/users/${username}/followers`, { headers }),
        fetch(`${API}/users/${username}/following`, { headers }),
      ])

      if (followersRes.status === 403 || followingRes.status === 403) {
        profilePrivate.value = true
        followers.value = []
        following.value = []
        return
      }

      if (!followersRes.ok || !followingRes.ok) {
        followers.value = []
        following.value = []
        return
      }

      const [fa, fb] = await Promise.all([followersRes.json(), followingRes.json()])
      followers.value = fa.users || []
      following.value = fb.users || []
    } catch (err) {
      console.error('Connections load failed:', err)
      followers.value = []
      following.value = []
    } finally {
      loading.value = false
    }
  }

  let searchTimer = null
  let requestId = 0

  function runGlobalSearch(q) {
    const myId = ++requestId
    globalLoading.value = true

    fetch(`${API}/users?q=${encodeURIComponent(q)}&limit=12`, {
      headers: authHeaders(auth.token),
    })
      .then(res => res.ok ? res.json() : { users: [] })
      .then(data => {
        if (myId !== requestId) return
        globalResults.value = data.users || []
      })
      .catch(err => {
        console.error('User search failed:', err)
        if (myId === requestId) globalResults.value = []
      })
      .finally(() => {
        if (myId === requestId) globalLoading.value = false
      })
  }

  function onSearchChange(q) {
    if (searchTimer) clearTimeout(searchTimer)

    if (!q) {
      requestId++
      globalResults.value = []
      globalLoading.value = false
      return
    }

    searchTimer = setTimeout(() => runGlobalSearch(q), 250)
  }

  function clearSearchTimer() {
    if (searchTimer) clearTimeout(searchTimer)
  }

  function setActiveTab(name) {
    activeTab.value = name
  }

  function syncTabFromQuery(tab) {
    if (tab === 'followers' || tab === 'following') {
      activeTab.value = tab
    }
  }

  function updateUserEverywhere(userId, patch) {
    for (const list of [followers.value, following.value, globalResults.value]) {
      const found = list.find(u => u.id === userId)
      if (found) Object.assign(found, patch)
    }
  }

  async function toggleFollow(user) {
    if (!auth.isAuthenticated || user.id === auth.user?.id) return
    pendingId.value = user.id
    try {
      const { ok, data, error } = await postFollow(user.username, auth.token)
      if (!ok) {
        alert(error || 'Could not update follow.')
        return
      }
      updateUserEverywhere(user.id, {
        isFollowing: !!data.isFollowing,
        followRequestPending: !!data.followRequestPending,
      })
    } catch (err) {
      console.error('Follow toggle failed:', err)
    } finally {
      pendingId.value = null
    }
  }

  return {
    followers,
    following,
    loading,
    profilePrivate,
    pendingId,
    search,
    globalResults,
    globalLoading,
    activeTab,
    trimmedSearch,
    usersForTab,
    filteredUsers,
    discoverUsers,
    loadConnections,
    onSearchChange,
    clearSearchTimer,
    setActiveTab,
    syncTabFromQuery,
    toggleFollow,
  }
})
