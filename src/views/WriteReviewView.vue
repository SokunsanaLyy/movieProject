<template>
  <div class="write-review">
    <div class="container">
      <h1 class="page-title">{{ isEditing ? 'Edit' : 'Write a' }} <span>Review</span></h1>

      <div class="review-layout">
        <!-- Selected media info -->
        <aside class="media-sidebar" v-if="selectedMedia">
          <img :src="selectedMedia.poster" :alt="selectedMedia.title" class="media-poster" />
          <div class="media-info">
            <span class="badge badge-type">{{ selectedMedia.type === 'tv' ? 'TV Series' : 'Film' }}</span>
            <h3>{{ selectedMedia.title }}</h3>
            <p class="media-year">{{ selectedMedia.year }}</p>
          </div>
        </aside>

        <!-- Media picker (only when not editing) -->
        <aside class="media-sidebar" v-else>
          <p class="picker-label">Select a title to review</p>
          <input v-model="mediaSearch" type="text" placeholder="Search..." class="search-input small" />
          <div class="media-picker-list">
            <div
              v-for="m in filteredMedia"
              :key="m.id"
              class="picker-item"
              @click="selectedMedia = m"
            >
              <img :src="m.poster" :alt="m.title" />
              <span>{{ m.title }}</span>
            </div>
          </div>
        </aside>

        <!-- Review Form -->
        <form class="review-form" @submit.prevent="submitReview">

          <!-- Rating -->
          <div class="form-group">
            <label class="form-label">Your Rating</label>
            <div class="star-row">
              <button
                v-for="n in 10" :key="n" type="button"
                :class="['star', { active: n <= form.rating }]"
                @click="form.rating = n"
              >★</button>
              <span class="rating-text">{{ form.rating ? `${form.rating}/10` : 'Click to rate' }}</span>
            </div>
            <p v-if="errors.rating" class="error">{{ errors.rating }}</p>
          </div>

          <!-- Body -->
          <div class="form-group">
            <label class="form-label">Your Review</label>
            <textarea v-model="form.body" class="form-input form-textarea" placeholder="Write your thoughts..." rows="8" maxlength="5000"></textarea>
            <span class="char-count">{{ form.body.length }}/5000</span>
            <p v-if="errors.body" class="error">{{ errors.body }}</p>
          </div>

          <!-- Actions -->
          <div class="form-actions">
            <button v-if="isEditing" type="button" class="action-btn danger-btn" @click="deleteReview">Delete</button>
            <button type="submit" class="action-btn primary-btn" :disabled="!selectedMedia">
              {{ isEditing ? 'Update Review' : 'Publish Review' }}
            </button>
          </div>

        </form>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useMediaStore } from '../stores/media'
import { useAuthStore } from '../stores/auth'

const router = useRouter()
const route = useRoute()
const mediaStore = useMediaStore()
const auth = useAuthStore()

const isEditing = computed(() => !!route.params.reviewId)
const mediaSearch = ref('')
const selectedMedia = ref(null)

const form = reactive({ rating: 0, body: '' })
const errors = reactive({ rating: '', body: '' })

const filteredMedia = computed(() =>
  mediaStore.movies.filter(m => m.title.toLowerCase().includes(mediaSearch.value.toLowerCase())).slice(0, 6)
)

// Binh: load correct title via ?type= (TMDB reuses numeric ids for movie and tv).
async function resolveMedia(id, preferredType = 'movie') {
  return mediaStore.resolveDetail(id, preferredType)
}

onMounted(async () => {
  if (route.params.mediaId) {
    // Binh: honor ?type= from Media Detail links.
    const mediaType = route.query.type || 'movie'
    selectedMedia.value = await resolveMedia(Number(route.params.mediaId), mediaType)
    return
  }

  if (isEditing.value) {
    let existing = mediaStore.reviews.find(r => r.id === Number(route.params.reviewId))
    if (!existing) {
      // Not in store (e.g. navigated from profile page) — fetch directly
      try {
        const API = import.meta.env.VITE_API_URL || 'http://localhost:3000/api'
        const res = await fetch(`${API}/reviews/${route.params.reviewId}`, {
          headers: auth.token ? { Authorization: `Bearer ${auth.token}` } : {},
        })
        if (res.ok) existing = await res.json()
      } catch (e) { /* ignore */ }
    }
    if (!existing) return
    form.rating = existing.rating
    form.body = existing.content ?? ''
    const mediaType = existing.mediaType || route.query.type || 'movie'
    selectedMedia.value = await resolveMedia(existing.mediaId, mediaType)
  }
})

function validate() {
  errors.rating = form.rating === 0 ? 'Please give a rating.' : ''
  errors.body = form.body.trim().length < 20 ? 'Review must be at least 20 characters.' : ''
  return !errors.rating && !errors.body
}

async function submitReview() {
  if (!validate()) return
  const payload = {
    mediaId: selectedMedia.value.id,
    // Binh: store mediaType on review so backend can tell movie vs tv apart.
    mediaType: selectedMedia.value.type || 'movie',
    rating: parseInt(form.rating),
    content: form.body,
  }
  if (isEditing.value) {
    const result = await mediaStore.updateReview(route.params.reviewId, payload)
    if (!result.success) {
      errors.body = result.error || 'Failed to update review. Please try again.'
      return
    }
  } else {
    const result = await mediaStore.addReview(payload)
    if (!result.success) {
      errors.body = result.error || 'Failed to submit review. Please try again.'
      return
    }
  }
  router.push({
    name: 'MediaDetail',
    params: { id: selectedMedia.value.id },
    query: { type: selectedMedia.value.type || 'movie' },
  })
}

async function deleteReview() {
  if (!confirm('Delete this review? This cannot be undone.')) return
  const result = await mediaStore.deleteReview(route.params.reviewId)
  if (result.success) {
    router.push('/')
  } else {
    alert(result.error || 'Could not delete review.')
  }
}
</script>

<style scoped>
.write-review { padding: 48px 0 80px; }
.page-title { font-family: var(--font-display); font-size: clamp(2rem, 5vw, 3.5rem); letter-spacing: 0.04em; margin-bottom: 32px; }
.page-title span { color: var(--accent); }

.review-layout { display: grid; grid-template-columns: 220px 1fr; gap: 40px; align-items: start; }
@media (max-width: 700px) { .review-layout { grid-template-columns: 1fr; } }

.media-sidebar { display: flex; flex-direction: column; gap: 12px; }
.media-poster { width: 100%; border-radius: var(--radius); border: 1px solid var(--border); }
.media-info h3 { font-size: 1rem; font-weight: 600; margin: 6px 0 2px; }
.media-year { font-size: 0.82rem; color: var(--text-muted); }

.picker-label { font-size: 0.8rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.08em; }
.search-input.small { padding: 8px 12px; font-size: 0.88rem; }
.media-picker-list { display: flex; flex-direction: column; gap: 4px; }
.picker-item { display: flex; align-items: center; gap: 10px; padding: 6px 8px; border-radius: var(--radius); cursor: pointer; transition: background 0.15s; font-size: 0.85rem; }
.picker-item:hover { background: var(--card); }
.picker-item img { width: 32px; height: 48px; object-fit: cover; border-radius: 4px; flex-shrink: 0; }

.review-form { display: flex; flex-direction: column; gap: 22px; }
.form-group { display: flex; flex-direction: column; gap: 8px; }
.form-group.inline { flex-direction: row; align-items: center; gap: 12px; }
.form-label { font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-muted); }

.form-input {
  background: var(--card);
  border: 1.5px solid var(--border);
  border-radius: var(--radius);
  color: var(--text);
  font-size: 0.95rem;
  padding: 12px 14px;
  outline: none;
  transition: border-color 0.2s;
  font-family: inherit;
}
.form-input:focus { border-color: var(--accent); }
.form-input::placeholder { color: var(--text-dim); }
.form-textarea { resize: vertical; min-height: 180px; }

.search-input {
  width: 100%;
  background: var(--card);
  border: 1.5px solid var(--border);
  border-radius: var(--radius);
  color: var(--text);
  padding: 14px 18px;
  outline: none;
  transition: border-color 0.2s;
}
.search-input:focus { border-color: var(--accent); }

.star-row { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
.star { background: none; border: none; font-size: 1.5rem; color: var(--border); cursor: pointer; padding: 0; transition: color 0.15s; }
.star.active { color: var(--accent); }
.rating-text { font-size: 0.85rem; color: var(--accent); margin-left: 8px; font-weight: 600; }

.char-count { font-size: 0.72rem; color: var(--text-dim); text-align: right; }
.error { font-size: 0.78rem; color: #e05a6b; margin: 0; }

.form-actions { display: flex; gap: 10px; justify-content: flex-end; padding-top: 8px; }

.action-btn {
  padding: 10px 24px;
  border-radius: 6px;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  border: none;
}
.action-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.primary-btn {
  background: #e5a00d;
  color: #000;
}
.primary-btn:hover:not(:disabled) { background: #f0b429; }

.danger-btn {
  background: transparent;
  border: 1.5px solid #e05a6b;
  color: #e05a6b;
}
.danger-btn:hover { background: #e05a6b; color: #fff; }
</style>