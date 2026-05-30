<template>
  <div class="connections-page py-5">
    <div class="container">
      <!-- Header -->
      <header class="d-flex justify-content-between align-items-end flex-wrap gap-3 pb-3 mb-4 cl-border-b">
        <div>
          <RouterLink
            :to="`/profile/${route.params.username}`"
            class="back-link cl-muted small text-decoration-none d-inline-flex align-items-center gap-1 mb-2"
          >
            ← Back to profile
          </RouterLink>
          <h1 class="cl-display page-title mb-1">
            <span>@{{ route.params.username }}</span>'s
            <span class="cl-accent">connections</span>
          </h1>
          <p class="cl-muted small mb-0">
            {{ usersForTab.length }}
            {{ activeTab === 'followers'
                ? (usersForTab.length === 1 ? 'follower' : 'followers')
                : 'following' }}
          </p>
        </div>

        <!-- Search: filters this tab AND searches all platform users -->
        <div class="search-wrap">
          <input
            v-model="search"
            type="text"
            class="form-control bg-dark text-light border-secondary"
            placeholder="Search any user by name or @handle…"
          />
          <p class="cl-dim small mt-1 mb-0">
            Searches followers, following, and everyone on CineLog.
          </p>
        </div>
      </header>

      <!-- Tabs -->
      <div class="filter-tabs mb-4" role="tablist">
        <button
          type="button"
          class="filter-tab"
          :class="{ 'filter-tab-active': activeTab === 'followers' }"
          @click="setTab('followers')"
        >
          Followers
          <span class="filter-count">{{ followers.length }}</span>
        </button>
        <button
          type="button"
          class="filter-tab"
          :class="{ 'filter-tab-active': activeTab === 'following' }"
          @click="setTab('following')"
        >
          Following
          <span class="filter-count">{{ following.length }}</span>
        </button>
      </div>

      <!-- Loading -->
      <div v-if="loading" class="text-center py-5 cl-muted">
        <p class="mb-0">Loading…</p>
      </div>

      <!-- Private profile -->
      <div
        v-else-if="profilePrivate"
        class="cl-card empty-state p-5 text-center mx-auto"
      >
        <div class="empty-icon mb-3">🔒</div>
        <h2 class="cl-display h5 mb-2">This profile is private</h2>
        <p class="cl-muted mb-0">
          @{{ route.params.username }}'s followers and following lists are only visible to them.
        </p>
      </div>

      <!-- Empty -->
      <div
        v-else-if="filteredUsers.length === 0"
        class="cl-card empty-state p-5 text-center mx-auto"
      >
        <div class="empty-icon mb-3">{{ activeTab === 'followers' ? '👥' : '🔭' }}</div>
        <h2 class="cl-display h5 mb-2">
          <template v-if="search">No matches for "{{ search }}"</template>
          <template v-else-if="activeTab === 'followers'">
            No followers yet
          </template>
          <template v-else>
            Not following anyone yet
          </template>
        </h2>
        <p v-if="!search" class="cl-muted mb-0">
          <template v-if="activeTab === 'followers'">
            When someone follows @{{ route.params.username }}, they'll show up here.
          </template>
          <template v-else>
            @{{ route.params.username }} hasn't followed anyone yet.
          </template>
        </p>
      </div>

      <!-- User cards grid (current tab) -->
      <div v-else class="row g-3">
        <div
          v-for="u in filteredUsers"
          :key="u.id"
          class="col-12 col-md-6 col-lg-4"
        >
          <UserCard
            :user="u"
            :pending="pendingId === u.id"
            :is-self="auth.isAuthenticated && u.id === auth.user?.id"
            :can-follow="auth.isAuthenticated"
            @toggle="toggleFollow"
          />
        </div>
      </div>

      <!-- Platform-wide search results -->
      <section v-if="trimmedSearch" class="discover-section mt-5 pt-4 cl-border-t">
        <div class="d-flex justify-content-between align-items-end flex-wrap gap-2 mb-3">
          <div>
            <h2 class="cl-display section-title mb-1">
              Discover <span class="cl-accent">other users</span>
            </h2>
            <p class="cl-muted small mb-0">
              People on CineLog matching "{{ trimmedSearch }}"
            </p>
          </div>
        </div>

        <div v-if="globalLoading" class="text-center py-4 cl-muted">
          <p class="mb-0">Searching…</p>
        </div>

        <div
          v-else-if="discoverUsers.length === 0"
          class="cl-card empty-state-sm p-4 text-center mx-auto"
        >
          <p class="cl-muted mb-0">
            No other users match "{{ trimmedSearch }}".
          </p>
        </div>

        <div v-else class="row g-3">
          <div
            v-for="u in discoverUsers"
            :key="u.id"
            class="col-12 col-md-6 col-lg-4"
          >
            <UserCard
              :user="u"
              :pending="pendingId === u.id"
              :is-self="auth.isAuthenticated && u.id === auth.user?.id"
              :can-follow="auth.isAuthenticated"
              @toggle="toggleFollow"
            />
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import UserCard from '../components/UserCard.vue'

const API = import.meta.env.VITE_API_URL || 'http://localhost:3000/api'

const route  = useRoute()
const router = useRouter()
const auth   = useAuthStore()

// ── State ───────────────────────────────────────────────────────────
const followers = ref([])
const following = ref([])
const loading   = ref(true)
const profilePrivate = ref(false)
const pendingId = ref(null) // user id whose follow toggle is in-flight
const search    = ref('')

// Global search across all platform users (Discover section)
const globalResults = ref([])
const globalLoading = ref(false)

// `activeTab` mirrors the `?tab=` query string so deep links work and
// users can switch tabs by URL too.
const activeTab = ref(route.query.tab === 'following' ? 'following' : 'followers')

// ── Computed ────────────────────────────────────────────────────────
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

// "Discover" only shows users not already in the current tab so the page
// doesn't duplicate cards above and below the divider.
const discoverUsers = computed(() => {
  if (!trimmedSearch.value) return []
  const visibleIds = new Set(filteredUsers.value.map(u => u.id))
  return globalResults.value.filter(u => !visibleIds.has(u.id))
})

// ── Data loading ────────────────────────────────────────────────────
// Both lists are loaded up-front so flipping tabs is instant and the
// "Followers (N) | Following (N)" counts always render correctly.
async function loadConnections() {
  loading.value = true
  profilePrivate.value = false
  try {
    const headers = auth.token ? { Authorization: `Bearer ${auth.token}` } : {}

    const [followersRes, followingRes] = await Promise.all([
      fetch(`${API}/users/${route.params.username}/followers`, { headers }),
      fetch(`${API}/users/${route.params.username}/following`, { headers }),
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

// Platform-wide user search.
// Debounced so we don't fire a request on every keystroke. Cancellable via
// the `requestId` token so a slow earlier response can't overwrite a faster
// later one.
let searchTimer = null
let requestId   = 0

function runGlobalSearch(q) {
  const myId = ++requestId
  globalLoading.value = true

  const url = `${API}/users?q=${encodeURIComponent(q)}&limit=12`
  const headers = auth.token ? { Authorization: `Bearer ${auth.token}` } : {}

  fetch(url, { headers })
    .then(res => res.ok ? res.json() : { users: [] })
    .then(data => {
      if (myId !== requestId) return // a newer search has superseded us
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

watch(trimmedSearch, (q) => {
  if (searchTimer) clearTimeout(searchTimer)

  if (!q) {
    // Empty box → drop any in-flight result; nothing to show in Discover.
    requestId++
    globalResults.value = []
    globalLoading.value = false
    return
  }

  // 250ms debounce feels responsive without spamming the backend.
  searchTimer = setTimeout(() => runGlobalSearch(q), 250)
})

onUnmounted(() => {
  if (searchTimer) clearTimeout(searchTimer)
})

// ── Actions ─────────────────────────────────────────────────────────
function setTab(name) {
  activeTab.value = name
  // Update the URL so refreshing keeps the same tab and shareable links work.
  router.replace({
    query: { ...route.query, tab: name },
  })
}

// Toggle follow on a user shown in either list. The user object is the
// same reference in followers/following arrays, so flipping `isFollowing`
// updates both views without a refetch.
async function toggleFollow(user) {
  if (!auth.isAuthenticated || user.id === auth.user?.id) return
  pendingId.value = user.id
  try {
    const res = await fetch(`${API}/users/${user.username}/follow`, {
      method:  'POST',
      headers: { Authorization: `Bearer ${auth.token}` },
    })
    const data = await res.json()
    if (!res.ok) {
      alert(data.error || 'Could not update follow.')
      return
    }

    // Flip the flag everywhere this user appears.
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

function updateUserEverywhere(userId, patch) {
  // Also update the Discover list so a user followed from there flips state
  // without needing a refetch.
  for (const list of [followers.value, following.value, globalResults.value]) {
    const found = list.find(u => u.id === userId)
    if (found) Object.assign(found, patch)
  }
}

// ── Lifecycle ───────────────────────────────────────────────────────
onMounted(loadConnections)

watch(() => route.params.username, (newName, oldName) => {
  if (newName && newName !== oldName) loadConnections()
})

watch(() => route.query.tab, (newTab) => {
  if (newTab === 'followers' || newTab === 'following') {
    activeTab.value = newTab
  }
})
</script>

<style scoped>
.connections-page { min-height: 70vh; }

.page-title {
  font-size: clamp(1.8rem, 4vw, 2.6rem);
  letter-spacing: 0.04em;
  line-height: 1.1;
  color: var(--cl-text);
}
.page-title span:first-child { color: var(--cl-text); }
.back-link { transition: color var(--cl-transition); }
.back-link:hover { color: var(--cl-accent) !important; }

.search-wrap { width: 100%; max-width: 320px; }
.section-title {
  font-size: clamp(1.3rem, 3vw, 1.8rem);
  letter-spacing: 0.04em;
  color: var(--cl-text);
}
.discover-section { /* spacing handled by utility classes on the element */ }

/* -- Filter pills (matches WatchlistView/ProfileView) -- */
.filter-tabs {
  display: inline-flex;
  gap: 4px;
  background: var(--cl-surface);
  border: 1px solid var(--cl-border);
  border-radius: 100px;
  padding: 4px;
}
.filter-tab {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 7px 16px;
  border-radius: 100px;
  background: transparent;
  border: none;
  font-size: 0.85rem;
  color: var(--cl-text-muted);
  font-family: var(--cl-font-body);
  cursor: pointer;
  transition: all var(--cl-transition);
}
.filter-tab:hover { color: var(--cl-text); }
.filter-tab-active {
  background: var(--cl-accent);
  color: var(--cl-bg);
  font-weight: 500;
}
.filter-count {
  font-size: 0.72rem;
  padding: 1px 7px;
  border-radius: 100px;
  background: rgba(255,255,255,0.08);
}
.filter-tab-active .filter-count {
  background: rgba(0,0,0,0.18);
  color: var(--cl-bg);
}

/* User card styles live in UserCard.vue (scoped to that component). */

/* -- Empty states -- */
.empty-state {
  border-style: dashed;
  max-width: 560px;
}
.empty-state-sm {
  border-style: dashed;
  max-width: 480px;
}
.empty-icon { font-size: 3rem; opacity: 0.6; }

@media (max-width: 575.98px) {
  .filter-tab { padding: 6px 12px; font-size: 0.8rem; }
}
</style>
