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
import { watch, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useAuthStore } from '../stores/auth'
import { useConnectionsStore } from '../stores/connections'
import UserCard from '../components/UserCard.vue'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const connectionsStore = useConnectionsStore()

const {
  followers,
  following,
  loading,
  profilePrivate,
  pendingId,
  search,
  globalLoading,
  activeTab,
  trimmedSearch,
  usersForTab,
  filteredUsers,
  discoverUsers,
} = storeToRefs(connectionsStore)

const { toggleFollow } = connectionsStore

connectionsStore.syncTabFromQuery(
  route.query.tab === 'following' ? 'following' : 'followers'
)

function setTab(name) {
  connectionsStore.setActiveTab(name)
  router.replace({ query: { ...route.query, tab: name } })
}

watch(trimmedSearch, (q) => connectionsStore.onSearchChange(q))

onMounted(() => connectionsStore.loadConnections(route.params.username))

onUnmounted(() => connectionsStore.clearSearchTimer())

watch(
  () => route.params.username,
  (newName, oldName) => {
    if (newName && newName !== oldName) {
      connectionsStore.loadConnections(newName)
    }
  }
)

watch(
  () => route.query.tab,
  (newTab) => connectionsStore.syncTabFromQuery(newTab)
)
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
