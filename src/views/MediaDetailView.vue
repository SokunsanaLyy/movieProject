<template>
  <div v-if="media" class="media-detail">
    <!-- Backdrop hero -->
    <section class="hero position-relative">
      <img :src="media.backdrop" :alt="media.title" class="w-100 hero-img" />
      <div class="hero-gradient position-absolute top-0 start-0 w-100 h-100"></div>
    </section>

    <!-- Main info: poster + details -->
    <section class="info-section position-relative">
      <div class="container">
        <div class="row g-4 g-lg-5">
          <!-- Poster column -->
          <div class="col-12 col-md-5 col-lg-4">
            <div class="poster-wrap cl-border">
              <img :src="media.poster" :alt="media.title" class="poster-img w-100" />
            </div>

            <!-- Action buttons -->
            <div class="d-flex flex-column gap-2 mt-3">
              <template v-if="auth.isAuthenticated">
                <button
                  class="cl-btn cl-btn-primary w-100"
                  @click="mediaStore.toggleWatchlist(media.id, media.type)"
                >
                  {{ inWatchlist ? '✓ In Watchlist' : '+ Add to Watchlist' }}
                </button>
                <RouterLink
                  v-if="!hasUserReviewed"
                  :to="`/review/new/${media.id}?type=${media.type || 'movie'}`"
                  class="cl-btn cl-btn-ghost w-100"
                >✍ Write a Review</RouterLink>
                <RouterLink
                  v-else
                  :to="`/review/edit/${userReview.id}`"
                  class="cl-btn cl-btn-ghost w-100"
                >✍ Edit Your Review</RouterLink>
              </template>
              <template v-else>
                <RouterLink
                  :to="`/login?redirect=/media/${media.id}?type=${media.type || 'movie'}`"
                  class="cl-btn cl-btn-primary w-100"
                >Sign in to interact</RouterLink>
              </template>
            </div>
          </div>

          <!-- Details column -->
          <div class="col-12 col-md-7 col-lg-8">
            <div class="d-flex align-items-center gap-2 flex-wrap mb-2">
              <span class="cl-badge cl-badge-accent">
                {{ media.type === 'tv' ? 'TV Series' : 'Film' }}
              </span>
              <span class="cl-dim">·</span>
              <span class="cl-muted small">{{ media.year }}</span>
              <span v-if="media.duration" class="cl-dim">·</span>
              <span v-if="media.duration" class="cl-muted small">{{ media.duration }}</span>
            </div>

            <h1 class="cl-display detail-title mb-3">{{ media.title }}</h1>

            <div class="d-flex align-items-center gap-3 flex-wrap mb-3">
              <div class="d-flex align-items-baseline gap-1">
                <span class="cl-accent">★</span>
                <span class="rating-value cl-accent">{{ displayRating }}</span>
                <span class="cl-dim small">/10</span>
              </div>
              <span class="cl-muted small">
                {{ reviews.length }} {{ reviews.length === 1 ? 'review' : 'reviews' }}
              </span>
              <span v-if="apiRating || reviewAverage" class="cl-dim small">&nbsp;·&nbsp;
                <template v-if="apiRating">TMDB: {{ apiRating }}</template>
                <template v-if="apiRating && reviewAverage">&nbsp;·&nbsp;</template>
                <template v-if="reviewAverage">Reviews: {{ reviewAverage }}</template>
              </span>
              <span v-if="media.likes" class="cl-muted small">❤ {{ formatNum(media.likes) }}</span>
            </div>

            <div v-if="media.genre?.length" class="d-flex flex-wrap gap-2 mb-3">
              <span v-for="g in media.genre" :key="g" class="genre-tag">{{ g }}</span>
            </div>

            <p v-if="media.synopsis" class="synopsis mb-4">{{ media.synopsis }}</p>

            <div class="credits cl-border-t pt-3">
              <div v-if="media.director" class="row g-2 py-2 cl-border-b">
                <div class="col-4 col-md-3 cl-dim small credit-label">Director</div>
                <div class="col-8 col-md-9 cl-muted small">{{ media.director }}</div>
              </div>
              <div v-if="media.cast?.length" class="row g-2 py-2 cl-border-b">
                <div class="col-4 col-md-3 cl-dim small credit-label">Cast</div>
                <div class="col-8 col-md-9 cl-muted small">{{ media.cast.join(', ') }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Reviews section -->
    <section class="py-5">
      <div class="container">
        <div class="d-flex justify-content-between align-items-end flex-wrap gap-3 mb-4">
          <h2 class="cl-display section-title mb-0">
            Collective <span class="cl-accent">Reviews</span>
          </h2>
          <div v-if="reviews.length > 1" class="d-flex align-items-center gap-2">
            <label class="cl-dim small text-uppercase sort-label" for="sort-reviews">Sort by</label>
            <select id="sort-reviews" v-model="sortBy" class="cl-select cl-btn-sm">
              <option value="recent">Most Recent</option>
              <option value="oldest">Oldest First</option>
              <option value="top">Highest Rated</option>
              <option value="liked">Most Liked</option>
            </select>
          </div>
        </div>

        <!-- Loading state -->
        <div v-if="loadingReviews" class="text-center py-5 cl-muted">
          <p class="mb-0">Loading reviews…</p>
        </div>

        <!-- Empty state -->
        <div v-else-if="reviews.length === 0" class="empty-state cl-card p-5 text-center">
          <h3 class="cl-display h4 mb-2">No reviews yet</h3>
          <p class="cl-muted mb-4">Be the first to share your thoughts on {{ media.title }}.</p>
          <RouterLink
            v-if="auth.isAuthenticated"
            :to="`/review/new/${media.id}?type=${media.type || 'movie'}`"
            class="cl-btn cl-btn-primary"
          >Write the first review</RouterLink>
          <RouterLink
            v-else
            :to="`/login?redirect=/media/${media.id}?type=${media.type || 'movie'}`"
            class="cl-btn cl-btn-primary"
          >Sign in to review</RouterLink>
        </div>

        <!-- Review list (paginated) -->
        <div v-else>
          <div class="row g-3">
            <div v-for="r in pagedReviews" :key="r.id" class="col-12">
              <div class="cl-card p-3">
                <ReviewCard :review="r" @delete="handleDelete" @like="handleLike" />
              </div>
            </div>
          </div>

          <PaginationBar
            v-model:currentPage="currentPage"
            :totalPages="totalPages"
          />
        </div>
      </div>
    </section>
  </div>

  <!-- Loading state for the whole page (while TMDB detail is fetching) -->
  <div v-else-if="loadingMedia" class="container text-center py-5">
    <p class="cl-muted">Loading title…</p>
  </div>

  <!-- Not found state -->
  <div v-else class="container text-center py-5">
    <h1 class="cl-display nf-title cl-accent">404</h1>
    <p class="cl-muted mb-4">We couldn't find that title.</p>
    <RouterLink to="/" class="cl-btn cl-btn-primary">Back to Home</RouterLink>
  </div>
</template>

<script setup>
import { computed, ref, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useMediaStore } from '../stores/media'
import { useAuthStore } from '../stores/auth'
import ReviewCard from '../components/ReviewCard.vue'
import PaginationBar from '../components/PaginationBar.vue'

const API = import.meta.env.VITE_API_URL || 'http://localhost:3000/api'

const route = useRoute()
const router = useRouter()
const mediaStore = useMediaStore()
const auth = useAuthStore()

const PAGE_SIZE = 5

const sortBy = ref('recent')
const currentPage = ref(1)
const loadingReviews = ref(true)
const loadingMedia = ref(true)

// The route param is the TMDB id; the query param tells us movie vs tv.
const mediaId = computed(() => Number(route.params.id))
const mediaType = computed(() => route.query.type || 'movie')

// getMovieById checks detailCache first (populated by loadDetail), then movies.
// After loadMedia() runs, the title is in the cache.
const media = computed(() => mediaStore.getMovieById(mediaId.value, mediaType.value))

const inWatchlist = computed(() =>
  media.value ? mediaStore.isInWatchlist(media.value.id) : false
)

const reviews = computed(() => {
  if (!media.value) return []
  return mediaStore.getReviewsByMediaId(media.value.id)
})

const userReview = computed(() => {
  if (!auth.isAuthenticated) return null
  return reviews.value.find(r => r.userId === auth.user.id) || null
})
const hasUserReviewed = computed(() => userReview.value !== null)

const apiRating = computed(() => media.value?.rating ? Number(media.value.rating).toFixed(1) : null)
const reviewAverage = computed(() => {
  if (reviews.value.length === 0) return null
  const sum = reviews.value.reduce((acc, r) => acc + r.rating, 0)
  return (sum / reviews.value.length).toFixed(1)
})

// Compute a combined rating (70% TMDB API, 30% user reviews) when both exist.
const displayRating = computed(() => {
  const tmdb = Number(media.value?.rating ?? 0)
  const reviewCount = reviews.value.length
  const reviewAvg = reviewCount === 0 ? 0 : reviews.value.reduce((acc, r) => acc + r.rating, 0) / reviewCount

  if (reviewCount === 0) {
    return media.value?.rating ? media.value.rating.toFixed(1) : '–'
  }

  const combined = tmdb ? (tmdb * 0.7 + reviewAvg * 0.3) : reviewAvg
  return combined.toFixed(1)
})

const sortedReviews = computed(() => {
  const list = [...reviews.value]
  switch (sortBy.value) {
    case 'oldest':
      return list.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
    case 'top':
      return list.sort((a, b) => b.rating - a.rating)
    case 'liked':
      return list.sort((a, b) => (b.likes || 0) - (a.likes || 0))
    case 'recent':
    default:
      return list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  }
})

const totalPages = computed(() =>
  Math.max(1, Math.ceil(sortedReviews.value.length / PAGE_SIZE))
)

const pagedReviews = computed(() => {
  const start = (currentPage.value - 1) * PAGE_SIZE
  return sortedReviews.value.slice(start, start + PAGE_SIZE)
})

watch([sortBy, mediaId], () => { currentPage.value = 1 })
watch(totalPages, (newTotal) => {
  if (currentPage.value > newTotal) currentPage.value = newTotal
})

// ── Data loading ───
// Loads the TMDB detail for this title into the store's cache.
// Once loaded, the `media` computed above resolves to the movie object.
async function loadMedia() {
  loadingMedia.value = true
  try {
    let detail = await mediaStore.loadDetail(mediaId.value, mediaType.value)
    // TMDB reuses numeric ids across movie vs TV — retry the other type if needed.
    if (!detail) {
      const alt = mediaType.value === 'tv' ? 'movie' : 'tv'
      detail = await mediaStore.loadDetail(mediaId.value, alt)
      if (detail && detail.type !== mediaType.value) {
        await router.replace({
          name: 'MediaDetail',
          params: { id: String(mediaId.value) },
          query: { ...route.query, type: detail.type },
        })
      }
    }
  } catch (err) {
    console.error('Could not load title:', err)
  } finally {
    loadingMedia.value = false
  }
}

async function loadReviews() {
  loadingReviews.value = true
  try {
    await mediaStore.fetchReviewsByMediaId(mediaId.value)
  } catch (err) {
    console.error('Could not load reviews:', err)
  } finally {
    loadingReviews.value = false
  }
}

onMounted(async () => {
  await Promise.all([loadMedia(), loadReviews()])
})

// Reload when id or movie/tv type changes (e.g. /media/76479?type=movie → type=tv)
watch([mediaId, mediaType], async () => {
  if (mediaId.value) {
    await Promise.all([loadMedia(), loadReviews()])
  }
})

// ── Actions ──
// Note: the store no longer exposes deleteReview, so we call the backend
// directly here. Same pattern as toggleWatchlist or addReview internally.
function handleLike(reviewId) {
  if (!auth.isAuthenticated) return
  mediaStore.toggleReviewLike(reviewId)
}

async function handleDelete(reviewId) {
  if (!auth.user?.id) return
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

    // Refresh the reviews list so the deleted one disappears.
    await loadReviews()
  } catch (err) {
    console.error('Delete review failed:', err)
    alert('Could not reach the server. Please try again.')
  }
}

function formatNum(n) {
  return n >= 1000 ? (n / 1000).toFixed(1) + 'k' : n
}
</script>

<style scoped>
/* -- Hero -- */
.hero {
  height: 50vh;
  min-height: 320px;
  max-height: 520px;
  overflow: hidden;
}
.hero-img {
  height: 100%;
  object-fit: cover;
  opacity: 0.4;
}
.hero-gradient {
  background: linear-gradient(to top, var(--cl-bg) 0%, rgba(10,10,15,0.55) 50%, transparent 100%);
  pointer-events: none;
}

/* -- Info section -- */
.info-section {
  margin-top: -180px;
  z-index: 1;
  padding-bottom: 60px;
}

.poster-wrap {
  aspect-ratio: 2 / 3;
  overflow: hidden;
  border-radius: var(--cl-radius-lg);
  box-shadow: 0 30px 60px rgba(0,0,0,0.6);
}
.poster-img {
  height: 100%;
  object-fit: cover;
  display: block;
}

/* -- Detail meta -- */
.detail-title {
  font-size: clamp(2rem, 5vw, 3.6rem);
  letter-spacing: 0.03em;
  line-height: 1;
  color: var(--cl-text);
}

.rating-value {
  font-size: 1.6rem;
  font-weight: 600;
}

.genre-tag {
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  padding: 4px 10px;
  border-radius: 100px;
  background: var(--cl-surface);
  border: 1px solid var(--cl-border);
  color: var(--cl-text-muted);
}

.synopsis {
  font-size: 0.98rem;
  line-height: 1.75;
  color: var(--cl-text);
  max-width: 65ch;
}

.credit-label {
  letter-spacing: 0.08em;
  text-transform: uppercase;
  font-size: 0.72rem;
  padding-top: 2px;
}

/* -- Reviews section -- */
.section-title {
  font-size: clamp(1.6rem, 3.5vw, 2.4rem);
  color: var(--cl-text);
}

.sort-label {
  letter-spacing: 0.08em;
  font-size: 0.72rem;
}

.empty-state {
  border-style: dashed;
}

.nf-title {
  font-size: 6rem;
  letter-spacing: 0.05em;
}

/* -- Responsive -- */
@media (max-width: 991.98px) {
  .info-section { margin-top: -120px; }
}
@media (max-width: 767.98px) {
  .hero { height: 36vh; min-height: 220px; }
  .info-section { margin-top: -80px; }
}
@media (max-width: 575.98px) {
  .hero { height: 28vh; min-height: 180px; }
  .info-section { margin-top: -60px; padding-bottom: 40px; }
}
</style>