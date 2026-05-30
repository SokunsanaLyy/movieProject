<template>
  <div class="profile-page">
    <!-- Loading -->
    <div v-if="loading" class="container py-5 text-center cl-muted">
      <p class="mb-0">Loading profile…</p>
    </div>

    <!-- Not found -->
    <div v-else-if="!profile" class="container py-5 text-center">
      <h1 class="cl-display nf-title cl-accent">404</h1>
      <p class="cl-muted mb-4">We couldn't find a user called "{{ route.params.username }}".</p>
      <RouterLink to="/" class="cl-btn cl-btn-primary">Back to Home</RouterLink>
    </div>

    <template v-else>
      <!-- Header banner -->
      <header class="profile-header">
        <div class="header-gradient"></div>
        <div class="container py-5 position-relative">
          <div class="row g-4 align-items-end">
            <div class="col-auto">
              <div class="avatar-wrap">
                <img
                  :src="displayAvatar"
                  :alt="profile.user.displayName"
                  class="profile-avatar"
                />
                <button
                  v-if="profile.isSelf"
                  type="button"
                  class="avatar-edit-btn"
                  title="Upload profile photo"
                  aria-label="Upload profile photo"
                  :disabled="avatarUploading"
                  @click="pickAvatarFile"
                >{{ avatarUploading ? '…' : '+' }}</button>
                <input
                  ref="avatarFileInput"
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/*"
                  class="visually-hidden"
                  @change="onAvatarFileSelected"
                />
              </div>
            </div>
            <div class="col">
              <h1 class="cl-display profile-name mb-1">{{ profile.user.displayName }}</h1>
              <p class="cl-muted small mb-2">@{{ profile.user.username }} · joined {{ joinDate }}</p>
              <p v-if="profile.user.bio" class="profile-bio cl-text mb-0">{{ profile.user.bio }}</p>
              <p v-else-if="profile.canViewContent || profile.isSelf" class="cl-dim small fst-italic mb-0">No bio yet.</p>

              <!-- Owner: quick public / private toggle -->
              <div v-if="profile.isSelf" class="visibility-toggle mt-3">
                <span class="cl-dim small text-uppercase visibility-label">Profile visibility</span>
                <div class="filter-tabs visibility-tabs" role="group">
                  <button
                    type="button"
                    class="filter-tab"
                    :class="{ 'filter-tab-active': !profile.user.isPrivate }"
                    :disabled="visibilitySaving"
                    @click="setProfileVisibility(false)"
                  >Public</button>
                  <button
                    type="button"
                    class="filter-tab"
                    :class="{ 'filter-tab-active': profile.user.isPrivate }"
                    :disabled="visibilitySaving"
                    @click="setProfileVisibility(true)"
                  >Private</button>
                </div>
                <p class="cl-dim small mb-0 mt-1">
                  {{ profile.user.isPrivate
                      ? 'Only approved followers can see your reviews and watchlist.'
                      : 'Anyone can view your profile content.' }}
                </p>
              </div>
            </div>
            <div class="col-12 col-md-auto">
              <div class="d-flex gap-2 flex-wrap justify-content-md-end">
                <span
                  v-if="profile.user.isPrivate"
                  class="cl-badge align-self-center"
                >Private</span>
                <!-- Self: edit profile -->
                <button
                  v-if="profile.isSelf"
                  type="button"
                  class="cl-btn cl-btn-ghost"
                  @click="openEdit"
                >Edit profile</button>

                <!-- Visitor signed in: follow / unfollow / request -->
                <button
                  v-else-if="auth.isAuthenticated"
                  type="button"
                  class="cl-btn"
                  :class="profile.isFollowing ? 'cl-btn-ghost' : (profile.followRequestPending ? 'cl-btn-ghost' : 'cl-btn-primary')"
                  :disabled="followLoading"
                  @click="toggleFollow"
                >
                  <span v-if="followLoading">…</span>
                  <span v-else-if="profile.isFollowing">✓ Following</span>
                  <span v-else-if="profile.followRequestPending">Requested</span>
                  <span v-else>+ Follow</span>
                </button>

                <!-- Visitor signed out: prompt to sign in -->
                <RouterLink
                  v-else
                  :to="`/login?redirect=/profile/${profile.user.username}`"
                  class="cl-btn cl-btn-primary"
                >Sign in to follow</RouterLink>
              </div>
            </div>
          </div>

          <!-- Stats row (hidden counts for visitors on private profiles) -->
          <div v-if="profile.canViewContent" class="stats-row mt-4 d-flex flex-wrap gap-4">
            <button class="stat-item" type="button" @click="activeTab = 'reviews'">
              <span class="cl-display stat-val cl-accent">{{ profile.stats.reviews }}</span>
              <span class="cl-dim stat-label">Reviews</span>
            </button>
            <button class="stat-item" type="button" @click="activeTab = 'watchlist'">
              <span class="cl-display stat-val cl-accent">{{ watchlistCount }}</span>
              <span class="cl-dim stat-label">Watchlist</span>
            </button>
            <RouterLink
              :to="{ name: 'Connections', params: { username: profile.user.username }, query: { tab: 'followers' } }"
              class="stat-item"
            >
              <span class="cl-display stat-val cl-accent">{{ profile.stats.followers }}</span>
              <span class="cl-dim stat-label">Followers</span>
            </RouterLink>
            <RouterLink
              :to="{ name: 'Connections', params: { username: profile.user.username }, query: { tab: 'following' } }"
              class="stat-item"
            >
              <span class="cl-display stat-val cl-accent">{{ profile.stats.following }}</span>
              <span class="cl-dim stat-label">Following</span>
            </RouterLink>
          </div>
        </div>
      </header>

      <!-- Private profile notice for visitors -->
      <div v-if="!profile.canViewContent" class="container py-5">
        <div class="cl-card private-notice p-5 text-center mx-auto">
          <div class="empty-icon mb-3">🔒</div>
          <h2 class="cl-display h4 mb-2">This profile is private</h2>
          <p class="cl-muted mb-0">
            <template v-if="profile.followRequestPending">
              Your follow request is pending. You'll see {{ profile.user.displayName }}'s reviews and watchlist once they approve.
            </template>
            <template v-else-if="auth.isAuthenticated">
              Follow @{{ profile.user.username }} to request access to their reviews and watchlist.
            </template>
            <template v-else>
              Sign in and follow @{{ profile.user.username }} to request access to their profile.
            </template>
          </p>
        </div>
      </div>

      <!-- Pending follow requests (owner only) -->
      <div v-if="profile.canViewContent && profile.isSelf && pendingFollowRequests.length" class="container pt-3">
        <div class="cl-card follow-requests p-4 mb-2">
          <h2 class="cl-display h5 mb-3">Follow requests</h2>
          <div
            v-for="req in pendingFollowRequests"
            :key="req.id"
            class="follow-request-row d-flex align-items-center gap-3 py-2"
          >
            <img :src="avatarUrl(req, 48)" :alt="req.displayName" class="request-avatar" />
            <div class="flex-grow-1 min-w-0">
              <RouterLink :to="`/profile/${req.username}`" class="request-name">{{ req.displayName }}</RouterLink>
              <p class="cl-dim small mb-0">@{{ req.username }}</p>
            </div>
            <div class="d-flex gap-2 flex-shrink-0">
              <button
                type="button"
                class="cl-btn cl-btn-primary cl-btn-sm"
                :disabled="requestLoadingId === req.followerId"
                @click="respondFollowRequest(req.followerId, 'accept')"
              >Accept</button>
              <button
                type="button"
                class="cl-btn cl-btn-ghost cl-btn-sm"
                :disabled="requestLoadingId === req.followerId"
                @click="respondFollowRequest(req.followerId, 'reject')"
              >Decline</button>
            </div>
          </div>
        </div>
      </div>

      <!-- Tabs -->
      <div v-if="profile.canViewContent" class="container py-4">
        <div class="filter-tabs mb-4" role="tablist">
          <button
            type="button"
            class="filter-tab"
            :class="{ 'filter-tab-active': activeTab === 'reviews' }"
            @click="activeTab = 'reviews'"
          >
            Reviews
            <span class="filter-count">{{ profile.stats.reviews }}</span>
          </button>
          <button
            type="button"
            class="filter-tab"
            :class="{ 'filter-tab-active': activeTab === 'watchlist' }"
            @click="activeTab = 'watchlist'"
          >
            Watchlist
            <span class="filter-count">{{ watchlistCount }}</span>
          </button>
        </div>

        <!-- Reviews tab -->
        <section v-if="activeTab === 'reviews'">
          <div v-if="reviewsLoading" class="text-center py-5 cl-muted">
            <p class="mb-0">Loading reviews…</p>
          </div>
          <div v-else-if="reviews.length === 0" class="cl-card empty-state p-5 text-center">
            <div class="empty-icon mb-3">✍️</div>
            <h2 class="cl-display h5 mb-2">
              {{ profile.isSelf ? 'You haven\'t reviewed anything yet' : `${profile.user.displayName} hasn't written a review yet` }}
            </h2>
            <p class="cl-muted mb-4">
              {{ profile.isSelf
                  ? 'Find a title you love and tell the world what you think.'
                  : 'Check back later for fresh takes.' }}
            </p>
            <RouterLink v-if="profile.isSelf" to="/trending" class="cl-btn cl-btn-primary">
              Browse Trending
            </RouterLink>
          </div>
          <div v-else class="row g-3">
            <div v-for="r in reviews" :key="r.id" class="col-12 col-md-6">
              <div class="cl-card p-3 h-100">
                <ReviewCard :review="r" @delete="handleDeleteReview" @like="handleLikeReview" />
                <RouterLink
                  v-if="getMedia(r.mediaId, r.mediaType)"
                  :to="{ name: 'MediaDetail', params: { id: r.mediaId }, query: { type: getMedia(r.mediaId, r.mediaType)?.type || r.mediaType || 'movie' } }"
                  class="reviewed-media mt-3"
                >
                  <img :src="getMedia(r.mediaId, r.mediaType)?.poster" :alt="getMedia(r.mediaId, r.mediaType)?.title" />
                  <div>
                    <p class="reviewed-title mb-0">{{ getMedia(r.mediaId, r.mediaType)?.title }}</p>
                    <p class="cl-dim small mb-0">{{ getMedia(r.mediaId, r.mediaType)?.year }}</p>
                  </div>
                </RouterLink>
              </div>
            </div>
          </div>
        </section>

        <!-- Watchlist tab -->
        <section v-else>
          <div v-if="watchlistLoading" class="text-center py-5 cl-muted">
            <p class="mb-0">Loading watchlist…</p>
          </div>
          <div v-else-if="watchlistMedia.length === 0" class="cl-card empty-state p-5 text-center">
            <div class="empty-icon mb-3">🎬</div>
            <h2 class="cl-display h5 mb-2">
              {{ profile.isSelf ? 'Your watchlist is empty' : `${profile.user.displayName}'s watchlist is empty` }}
            </h2>
            <p class="cl-muted mb-4">
              {{ profile.isSelf
                  ? 'Save films and series you want to watch later.'
                  : 'When they save something, it\'ll show up here.' }}
            </p>
            <RouterLink v-if="profile.isSelf" to="/search" class="cl-btn cl-btn-primary">
              Search Titles
            </RouterLink>
          </div>
          <div v-else class="row g-3">
            <div
              v-for="m in watchlistMedia"
              :key="`${m.type}-${m.id}`"
              class="col-6 col-md-4 col-lg-3 col-xl-2"
            >
              <div class="profile-watchlist-card">
                <button
                  v-if="profile.isSelf"
                  type="button"
                  class="watchlist-remove-btn"
                  aria-label="Remove from watchlist"
                  @click="removeFromWatchlist(m)"
                >×</button>
                <MediaCard :media="m" :show-watchlist="false" />
              </div>
            </div>
          </div>
        </section>
      </div>
    </template>

    <!-- Edit profile modal -->
    <Teleport to="body">
      <Transition name="fade">
        <div v-if="editing" class="modal-backdrop-custom" @click.self="closeEdit">
          <div class="cl-card edit-modal p-4 p-md-5">
            <div class="d-flex justify-content-between align-items-start mb-3">
              <h2 class="cl-display h4 mb-0">Edit Profile</h2>
              <button type="button" class="close-btn" @click="closeEdit">×</button>
            </div>

            <form @submit.prevent="submitEdit" class="d-flex flex-column gap-3">
              <!-- Avatar preview in modal -->
              <div class="text-center mb-1">
                <img
                  :src="avatarUrl({ ...profile.user, avatar: editForm.avatar || null }, 120)"
                  :alt="editForm.displayName"
                  class="edit-avatar-preview"
                />
              </div>

              <div ref="avatarFieldRef" class="avatar-edit-section">
                <label class="form-label cl-muted small text-uppercase mb-1">Profile photo</label>
                <div class="d-flex flex-wrap gap-2 mb-2">
                  <button
                    type="button"
                    class="cl-btn cl-btn-primary cl-btn-sm"
                    :disabled="avatarUploading"
                    @click="pickAvatarFile"
                  >
                    {{ avatarUploading ? 'Uploading…' : 'Upload from device' }}
                  </button>
                  <button
                    v-if="editForm.avatar"
                    type="button"
                    class="cl-btn cl-btn-ghost cl-btn-sm"
                    :disabled="avatarUploading"
                    @click="clearAvatar"
                  >
                    Remove photo
                  </button>
                </div>
                <input
                  ref="avatarFileInputModal"
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/*"
                  class="visually-hidden"
                  @change="onAvatarFileSelected"
                />
                <label class="form-label cl-muted small text-uppercase mb-1 mt-2">Or paste image URL</label>
                <input
                  v-model="editForm.avatar"
                  type="url"
                  class="form-control bg-dark text-light border-secondary"
                  placeholder="https://… (optional)"
                />
                <p class="cl-dim small mt-1 mb-0">
                  JPG, PNG or WebP under 5 MB. Leave empty for the default initials avatar.
                </p>
              </div>

              <div>
                <label class="form-label cl-muted small text-uppercase mb-1">Display name</label>
                <input
                  v-model="editForm.displayName"
                  type="text"
                  class="form-control bg-dark text-light border-secondary"
                  maxlength="60"
                  required
                />
              </div>

              <div>
                <label class="form-label cl-muted small text-uppercase mb-1">
                  Bio <span class="cl-dim">({{ editForm.bio.length }}/300)</span>
                </label>
                <textarea
                  v-model="editForm.bio"
                  class="form-control bg-dark text-light border-secondary"
                  rows="3"
                  maxlength="300"
                  placeholder="A short sentence about you…"
                ></textarea>
              </div>

              <div>
                <label class="form-label cl-muted small text-uppercase mb-1">Profile visibility</label>
                <div class="filter-tabs visibility-tabs d-inline-flex" role="group">
                  <button
                    type="button"
                    class="filter-tab"
                    :class="{ 'filter-tab-active': !editForm.isPrivate }"
                    @click="editForm.isPrivate = false"
                  >Public</button>
                  <button
                    type="button"
                    class="filter-tab"
                    :class="{ 'filter-tab-active': editForm.isPrivate }"
                    @click="editForm.isPrivate = true"
                  >Private</button>
                </div>
                <p class="cl-dim small mt-1 mb-0">
                  Private profiles require follow approval before others can view your content.
                </p>
              </div>

              <p v-if="editError" class="text-danger small mb-0">{{ editError }}</p>

              <div class="d-flex gap-2 justify-content-end">
                <button type="button" class="cl-btn cl-btn-ghost" @click="closeEdit">Cancel</button>
                <button type="submit" class="cl-btn cl-btn-primary" :disabled="editSaving">
                  {{ editSaving ? 'Saving…' : 'Save changes' }}
                </button>
              </div>
            </form>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup>
import { computed, reactive, ref, watch, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { useMediaStore } from '../stores/media'
import { avatarUrl } from '../utils/avatar'
import { fileToAvatarDataUrl } from '../utils/imageFile'
import MediaCard from '../components/MediaCard.vue'
import ReviewCard from '../components/ReviewCard.vue'

const API = import.meta.env.VITE_API_URL || 'http://localhost:3000/api'

const route = useRoute()
const auth  = useAuthStore()
const mediaStore = useMediaStore()

function profileAuthHeaders() {
  return auth.token ? { Authorization: `Bearer ${auth.token}` } : {}
}

// ── State ───────────────────────────────────────────────────────────
// profile holds the response of GET /api/users/:username — user + stats
// + isFollowing/isSelf flags. Null while the page is fetching or 404.
const profile = ref(null)
const loading = ref(true)

const reviews          = ref([])
const reviewsLoading   = ref(false)
const watchlistItems   = ref([])
const watchlistLoading = ref(false)

const activeTab    = ref(route.query.tab === 'watchlist' ? 'watchlist' : 'reviews')
const followLoading = ref(false)
const pendingFollowRequests = ref([])
const requestLoadingId = ref(null)

// Edit-profile modal state
const editing    = ref(false)
const editSaving = ref(false)
const editError  = ref('')
const editForm   = reactive({ displayName: '', avatar: '', bio: '', isPrivate: false })
const visibilitySaving = ref(false)
const avatarFieldRef = ref(null)
const avatarFileInput = ref(null)
const avatarFileInputModal = ref(null)
const avatarUploading = ref(false)

// Live preview when editing or right after a device upload (before save).
const displayAvatar = computed(() => {
  if (!profile.value?.user) return ''
  const previewUser = {
    ...profile.value.user,
    avatar: editForm.avatar || profile.value.user.avatar || null,
  }
  if (editing.value || editForm.avatar) {
    return avatarUrl(previewUser, 240)
  }
  return avatarUrl(profile.value.user, 240)
})

// ── Computed ────────────────────────────────────────────────────────
// Format the createdAt timestamp into something readable (e.g. "May 2026")
const joinDate = computed(() => {
  if (!profile.value?.user?.createdAt) return ''
  return new Date(profile.value.user.createdAt).toLocaleDateString('en-AU', {
    month: 'long',
    year:  'numeric',
  })
})

// Resolve watchlist {mediaId, type} rows into full TMDB movie objects.
// Items whose TMDB detail couldn't be loaded are quietly dropped.
const watchlistMedia = computed(() =>
  watchlistItems.value
    .map(item => mediaStore.getMovieById(item.mediaId, item.type))
    .filter(Boolean)
)

const watchlistCount = computed(() => watchlistMedia.value.length)

// Used by reviews tab to show the poster of each reviewed title.
function getMedia(mediaId, type = 'movie') {
  return mediaStore.getMovieById(mediaId, type)
}

// ── Data loading ────────────────────────────────────────────────────
async function loadProfile() {
  loading.value = true
  try {
    const res = await fetch(`${API}/users/${route.params.username}`, {
      headers: profileAuthHeaders(),
    })

    if (!res.ok) {
      profile.value = null
      return
    }

    const data = await res.json()
    profile.value = data
    pendingFollowRequests.value = data.pendingFollowRequests || []
  } catch (err) {
    console.error('Profile load failed:', err)
    profile.value = null
  } finally {
    loading.value = false
  }
}

async function loadReviews() {
  if (!profile.value?.canViewContent) {
    reviews.value = []
    return
  }
  reviewsLoading.value = true
  try {
    const res = await fetch(`${API}/users/${profile.value.user.username}/reviews`, {
      headers: profileAuthHeaders(),
    })
    const data = await res.json()
    if (!res.ok) {
      reviews.value = []
      return
    }
    reviews.value = (data.reviews || []).map(r => ({
      ...r,
      likes: r.likeCount ?? r.likes ?? 0,
      liked: r.liked ?? false,
    }))

    // Hydrate TMDB detail for each reviewed title so we can show its poster.
    // Errors are caught per-item so one bad fetch doesn't kill the list.
    await Promise.all(
      reviews.value.map(r =>
        mediaStore.loadDetail(r.mediaId, r.mediaType || 'movie').catch(() => {})
      )
    )
  } catch (err) {
    console.error('Reviews load failed:', err)
    reviews.value = []
  } finally {
    reviewsLoading.value = false
  }
}

async function handleDeleteReview(reviewId) {
  if (!confirm('Delete this review? This cannot be undone.')) return
  try {
    const res = await fetch(`${API}/reviews/${reviewId}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        ...(auth.token ? { Authorization: `Bearer ${auth.token}` } : {}),
      },
    })
    const data = await res.json()
    if (!res.ok) {
      alert(data.error || 'Could not delete review.')
      return
    }
    reviews.value = reviews.value.filter(r => r.id !== reviewId)
  } catch (err) {
    console.error('Delete review error:', err)
    alert('Could not reach the server. Please try again.')
  }
}

function handleLikeReview(reviewId) {
  if (!auth.isAuthenticated) return
  const review = reviews.value.find(r => r.id === Number(reviewId))
  if (!review) return
  if (!review._likedBy) review._likedBy = []
  const alreadyLiked = review._likedBy.includes(auth.user.id)
  if (alreadyLiked) {
    review._likedBy = review._likedBy.filter(id => id !== auth.user.id)
    review.likes = Math.max(0, (review.likes || 0) - 1)
    review.liked = false
  } else {
    review._likedBy.push(auth.user.id)
    review.likes = (review.likes || 0) + 1
    review.liked = true
  }
}

async function loadWatchlist() {
  if (!profile.value?.canViewContent) {
    watchlistItems.value = []
    return
  }
  watchlistLoading.value = true
  try {
    const res = await fetch(`${API}/users/${profile.value.user.username}/watchlist`, {
      headers: profileAuthHeaders(),
    })
    const data = await res.json()
    if (!res.ok) {
      watchlistItems.value = []
      return
    }
    watchlistItems.value = (data.watchlist || []).map(item => ({
      mediaId: Number(item.mediaId),
      type:    item.type || 'movie',
    }))

    // Hydrate TMDB detail for each item so MediaCard has poster/title/etc.
    await Promise.all(
      watchlistItems.value.map(item =>
        mediaStore.loadDetail(item.mediaId, item.type).catch(() => {})
      )
    )
  } catch (err) {
    console.error('Watchlist load failed:', err)
    watchlistItems.value = []
  } finally {
    watchlistLoading.value = false
  }
}

async function removeFromWatchlist(media) {
  if (!profile.value?.isSelf || !auth.isAuthenticated) return
  await mediaStore.toggleWatchlist(media.id, media.type || 'movie')
  watchlistItems.value = watchlistItems.value.filter(item => item.mediaId !== media.id)
}

// ── Actions ─────────────────────────────────────────────────────────
async function toggleFollow() {
  if (!auth.isAuthenticated || !profile.value || profile.value.isSelf) return
  followLoading.value = true
  const wasFollowing = profile.value.isFollowing
  try {
    const res = await fetch(`${API}/users/${profile.value.user.username}/follow`, {
      method:  'POST',
      headers: { Authorization: `Bearer ${auth.token}` },
    })
    const data = await res.json()
    if (!res.ok) {
      alert(data.error || 'Could not update follow.')
      return
    }
    profile.value.isFollowing = !!data.isFollowing
    profile.value.followRequestPending = !!data.followRequestPending

    if (wasFollowing && !data.isFollowing) {
      profile.value.stats.followers = Math.max(0, profile.value.stats.followers - 1)
      if (profile.value.user.isPrivate) {
        profile.value.canViewContent = false
        reviews.value = []
        watchlistItems.value = []
      }
    } else if (!wasFollowing && data.isFollowing) {
      profile.value.stats.followers += 1
      profile.value.canViewContent = true
      await Promise.all([loadReviews(), loadWatchlist()])
    }
  } catch (err) {
    console.error('Follow toggle failed:', err)
  } finally {
    followLoading.value = false
  }
}

async function respondFollowRequest(followerId, action) {
  if (!profile.value?.isSelf || !auth.token) return
  requestLoadingId.value = followerId
  try {
    const res = await fetch(`${API}/users/me/follow-requests/${followerId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${auth.token}`,
      },
      body: JSON.stringify({ action }),
    })
    const data = await res.json()
    if (!res.ok) {
      alert(data.error || 'Could not update follow request.')
      return
    }
    pendingFollowRequests.value = pendingFollowRequests.value.filter(r => r.followerId !== followerId)
    if (action === 'accept') {
      profile.value.stats.followers += 1
    }
  } catch (err) {
    console.error('Follow request response failed:', err)
  } finally {
    requestLoadingId.value = null
  }
}

function openEdit() {
  if (!profile.value?.isSelf) return
  editForm.displayName = profile.value.user.displayName || ''
  editForm.avatar      = profile.value.user.avatar      || ''
  editForm.bio         = profile.value.user.bio         || ''
  editForm.isPrivate   = !!profile.value.user.isPrivate
  editError.value = ''
  editing.value = true
}

async function setProfileVisibility(isPrivate) {
  if (!profile.value?.isSelf || profile.value.user.isPrivate === isPrivate) return
  visibilitySaving.value = true
  const result = await auth.updateProfile({ isPrivate })
  visibilitySaving.value = false
  if (!result.success) {
    alert(result.error || 'Could not update visibility.')
    return
  }
  profile.value.user.isPrivate = !!result.user.isPrivate
  profile.value.canViewContent = true
  editForm.isPrivate = profile.value.user.isPrivate
}

function pickAvatarFile() {
  const input = editing.value
    ? avatarFileInputModal.value
    : avatarFileInput.value
  input?.click()
}

async function onAvatarFileSelected(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file || !profile.value?.isSelf) return

  avatarUploading.value = true
  editError.value = ''

  try {
    const dataUrl = await fileToAvatarDataUrl(file)
    if (!editing.value) openEdit()
    editForm.avatar = dataUrl
  } catch (err) {
    editError.value = err.message || 'Could not use that image.'
    if (!editing.value) editing.value = true
  } finally {
    avatarUploading.value = false
  }
}

function clearAvatar() {
  editForm.avatar = ''
}

function closeEdit() {
  editing.value = false
}

async function submitEdit() {
  editSaving.value = true
  editError.value = ''

  const result = await auth.updateProfile({
    displayName: editForm.displayName,
    avatar:      editForm.avatar,
    bio:         editForm.bio,
    isPrivate:   editForm.isPrivate,
  })

  editSaving.value = false

  if (!result.success) {
    editError.value = result.error || 'Could not update profile.'
    return
  }

  // Mirror the changes onto the local profile object so the header updates
  // immediately without another network round-trip.
  profile.value.user = { ...profile.value.user, ...result.user }
  profile.value.canViewContent = true
  editing.value = false
}

// ── Lifecycle ───────────────────────────────────────────────────────
onMounted(async () => {
  await loadProfile()
  if (profile.value) {
    await Promise.all([loadReviews(), loadWatchlist()])
  }
})

// Re-fetch everything when the route :username changes (e.g. from another
// profile in the followers list).
watch(
  () => route.params.username,
  async (newName, oldName) => {
    if (!newName || newName === oldName) return
    await loadProfile()
    if (profile.value) {
      await Promise.all([loadReviews(), loadWatchlist()])
    }
  }
)

// Sync tab to ?tab= query so deep links work.
watch(
  () => route.query.tab,
  (newTab) => {
    if (newTab === 'watchlist' || newTab === 'reviews') {
      activeTab.value = newTab
    }
  }
)
</script>

<style scoped>
.profile-page { min-height: 70vh; }

/* -- Header -- */
.profile-header {
  position: relative;
  background: var(--cl-bg-raised);
  border-bottom: 1px solid var(--cl-border);
}
.header-gradient {
  position: absolute; inset: 0;
  background: radial-gradient(
    ellipse at 50% 0%,
    rgba(232, 197, 71, 0.10) 0%,
    transparent 60%
  );
  pointer-events: none;
}
.avatar-wrap {
  position: relative;
  display: inline-block;
}
.profile-avatar {
  width: 120px; height: 120px;
  border-radius: 50%;
  object-fit: cover;
  border: 3px solid var(--cl-accent);
  box-shadow: 0 10px 30px rgba(0,0,0,0.4);
  display: block;
}
.avatar-edit-btn {
  position: absolute;
  left: 50%;
  bottom: -4px;
  transform: translateX(-50%);
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 2px solid var(--cl-bg);
  background: var(--cl-accent);
  color: var(--cl-bg);
  font-size: 1.1rem;
  font-weight: 600;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  padding: 0;
  box-shadow: 0 4px 12px rgba(0,0,0,0.35);
  transition: background var(--cl-transition), transform var(--cl-transition);
}
.avatar-edit-btn:hover {
  background: var(--cl-accent-hover);
  transform: translateX(-50%) scale(1.06);
}
.edit-avatar-preview {
  width: 88px;
  height: 88px;
  border-radius: 50%;
  object-fit: cover;
  border: 2px solid var(--cl-accent);
}
.profile-name {
  font-size: clamp(1.8rem, 4vw, 2.6rem);
  letter-spacing: 0.04em;
  line-height: 1;
  color: var(--cl-text);
}
.profile-bio {
  max-width: 65ch;
  line-height: 1.6;
}

/* -- Stats row -- */
.stats-row { row-gap: 1rem !important; }
.stat-item {
  display: flex; flex-direction: column;
  background: transparent; border: none;
  text-align: left; padding: 0;
  text-decoration: none;
  cursor: pointer;
  min-width: 80px;
  transition: opacity var(--cl-transition);
}
.stat-item:hover { opacity: 0.75; }
.stat-val {
  font-size: 1.5rem;
  letter-spacing: 0.04em;
  line-height: 1;
}
.stat-label {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin-top: 6px;
}

/* -- Filter pills (matches WatchlistView) -- */
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

/* -- Reviewed media chip on review cards -- */
.reviewed-media {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  border-top: 1px solid var(--cl-border);
  text-decoration: none;
  color: var(--cl-text-muted);
  transition: color var(--cl-transition);
}
.reviewed-media:hover { color: var(--cl-text); }
.reviewed-media img {
  width: 36px; height: 54px;
  object-fit: cover;
  border-radius: 4px;
  flex-shrink: 0;
}
.reviewed-title {
  font-size: 0.88rem;
  font-weight: 500;
  color: var(--cl-text);
}

/* -- Empty state -- */
.empty-state,
.private-notice {
  border-style: dashed;
  max-width: 560px;
  margin: 0 auto;
}
.visibility-label {
  letter-spacing: 0.08em;
  display: block;
  margin-bottom: 6px;
}
.visibility-tabs {
  display: inline-flex;
}
.empty-icon { font-size: 3rem; opacity: 0.6; }

.profile-watchlist-card {
  position: relative;
}
.watchlist-remove-btn {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 3;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: rgba(0, 0, 0, 0.75);
  color: var(--cl-text);
  font-size: 1.2rem;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  padding: 0;
  backdrop-filter: blur(4px);
  transition: background var(--cl-transition), color var(--cl-transition);
}
.watchlist-remove-btn:hover {
  background: #c0392b;
  color: #fff;
  border-color: #c0392b;
}

.follow-requests {
  border-style: solid;
}
.follow-request-row + .follow-request-row {
  border-top: 1px solid var(--cl-border);
}
.request-avatar {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  object-fit: cover;
  border: 2px solid var(--cl-border);
}
.request-name {
  color: var(--cl-text);
  text-decoration: none;
  font-weight: 500;
}
.request-name:hover {
  color: var(--cl-accent);
}

/* -- 404 -- */
.nf-title {
  font-size: 6rem;
  letter-spacing: 0.05em;
}

/* -- Edit modal -- */
.modal-backdrop-custom {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.6);
  backdrop-filter: blur(4px);
  z-index: 1050;
  display: flex; align-items: center; justify-content: center;
  padding: 16px;
}
.edit-modal {
  width: 100%;
  max-width: 480px;
  background: var(--cl-bg-raised);
}
.close-btn {
  background: transparent;
  border: none;
  color: var(--cl-text-muted);
  font-size: 1.6rem;
  line-height: 1;
  cursor: pointer;
  padding: 0 6px;
  transition: color var(--cl-transition);
}
.close-btn:hover { color: var(--cl-text); }

.fade-enter-active, .fade-leave-active { transition: opacity 0.18s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

@media (max-width: 575.98px) {
  .profile-avatar { width: 88px; height: 88px; }
  .filter-tab { padding: 6px 12px; font-size: 0.8rem; }
}
</style>