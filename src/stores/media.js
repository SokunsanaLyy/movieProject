// stores/media.js

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useAuthStore } from '../stores/auth'
import {
  fetchTrending,
  fetchPopularMovies,
  fetchPopularTV,
  searchTMDB,
  discoverMedia,
  fetchDetail,
} from '../services/tmdb'

const API = import.meta.env.VITE_API_URL || 'http://localhost:3000/api'

export const useMediaStore = defineStore('media', () => {

  const auth = useAuthStore()

  //  STATE 
  const movies      = ref([])
  const detailCache = ref({})
  const reviews     = ref([])
  const loading     = ref(false)
  const error       = ref('')

  const likedMedia = ref(
    JSON.parse(localStorage.getItem('cinelog_liked')) || []
  )

  const watchlist = ref(
    JSON.parse(localStorage.getItem('cinelog_watchlist')) || []
  )

  //  COMPUTED 
  const trending = computed(() =>
    [...movies.value]
      .sort((a, b) => b.rating - a.rating)
      .slice(0, 6)
  )

  function authHeaders() {
    return auth.token
      ? { Authorization: `Bearer ${auth.token}` }
      : {}
  }

  //  LOADERS 
  async function loadTrending() {
    loading.value = true
    error.value = ''
    try {
      movies.value = await fetchTrending()
      const ids = [...new Set(movies.value.map(m => Number(m.id)))]
      if (ids.length) {
        await loadReviewStatsForMovies(ids)
      }
    } catch (e) {
      error.value = 'Failed to load trending titles.'
      console.error(e)
    } finally {
      loading.value = false
    }
  }

  async function loadPopular(type = 'all', page = 1) {
    loading.value = true
    error.value = ''
    try {
      if (type === 'movie') {
        const data = await fetchPopularMovies(page)
        movies.value = data.results
        const ids = [...new Set(movies.value.map(m => Number(m.id)))]
        if (ids.length) {
          await loadReviewStatsForMovies(ids)
        }
        return data.totalPages
      }

      if (type === 'tv') {
        const data = await fetchPopularTV(page)
        movies.value = data.results
        const ids = [...new Set(movies.value.map(m => Number(m.id)))]
        if (ids.length) {
          await loadReviewStatsForMovies(ids)
        }
        return data.totalPages
      }

      const [mv, tv] = await Promise.all([
        fetchPopularMovies(page),
        fetchPopularTV(page),
      ])

      movies.value = [...mv.results, ...tv.results]
        .sort((a, b) => b.rating - a.rating)

      const ids = [...new Set(movies.value.map(m => Number(m.id)))]
      if (ids.length) {
        await loadReviewStatsForMovies(ids)
      }

      return Math.max(mv.totalPages, tv.totalPages)

    } catch (e) {
      error.value = 'Failed to load titles.'
      console.error(e)
      return 0
    } finally {
      loading.value = false
    }
  }

  async function search(query = '', filters = {}, page = 1) {
    loading.value = true
    error.value = ''
    try {
      const data = query.trim()
        ? await searchTMDB(query, page)
        : await discoverMedia(filters, page)

      movies.value = data.results
      const ids = [...new Set(movies.value.map(m => Number(m.id)))]
      if (ids.length) {
        await loadReviewStatsForMovies(ids)
      }
      return data.totalPages
    } catch (e) {
      error.value = 'Search failed. Please try again.'
      console.error(e)
      return 0
    } finally {
      loading.value = false
    }
  }

  async function loadDetail(id, type = 'movie') {
    const key = `${type}-${id}`

    if (detailCache.value[key]) {
      return detailCache.value[key]
    }

    loading.value = true
    error.value = ''

    try {
      const detail = await fetchDetail(id, type)
      detailCache.value[key] = detail
      return detail
    } catch (e) {
      error.value = 'Failed to load title details.'
      console.error(e)
      return null
    } finally {
      loading.value = false
    }
  }

  async function resolveDetail(id, preferredType = 'movie') {
    let detail = await loadDetail(id, preferredType)
    if (!detail) {
      detail = await loadDetail(id, preferredType === 'tv' ? 'movie' : 'tv')
    }
    return detail
  }

  function getMovieById(id, type = 'movie') {
    const key = `${type}-${id}`
    if (detailCache.value[key]) return detailCache.value[key]

    const cached = Object.values(detailCache.value)
      .find(d => d.id === Number(id) && (!type || d.type === type))

    if (cached) return cached

    return movies.value.find(m => m.id === Number(id) && (!type || m.type === type))
  }

  //  REVIEWS 
  async function fetchReviewsByMediaId(mediaId) {
    try {
      const res = await fetch(`${API}/reviews?mediaId=${mediaId}`, {
        headers: { ...authHeaders() },
      })
      const data = await res.json()

      if (res.ok) {
        // Normalise: backend now returns likeCount/liked instead of likes array
        const shaped = data.reviews.map(r => ({
          ...r,
          likes: r.likeCount ?? r.likes ?? 0,
          liked: r.liked ?? false,
        }))
        reviews.value = [
          ...reviews.value.filter(r => r.mediaId !== Number(mediaId)),
          ...shaped,
        ]
      }
    } catch (err) {
      console.error(err)
    }
  }

  function getReviewsByMediaId(mediaId) {
    return reviews.value.filter(
      r => Number(r.mediaId) === Number(mediaId)
    )
  }

  async function addReview(reviewData) {
    try {
      const res = await fetch(`${API}/reviews`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders(),
        },
        body: JSON.stringify(reviewData),
      })

      const data = await res.json()

      if (!res.ok) {
        return { success: false, error: data.error }
      }

      reviews.value.unshift(data.review)

      // Refresh review stats for this media so lists and details update
      try {
        await loadReviewStatsForMovies([reviewData.mediaId])
      } catch (e) {
        // non-fatal
      }

      return { success: true, review: data.review }

    } catch (err) {
      return { success: false, error: 'Server error' }
    }
  }

  async function updateReview(reviewId, reviewData) {
    try {
      const res = await fetch(`${API}/reviews/${reviewId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders(),
        },
        body: JSON.stringify(reviewData),
      })

      const data = await res.json()

      if (!res.ok) {
        return { success: false, error: data.error }
      }

      const idx = reviews.value.findIndex(r => r.id === Number(reviewId))
      if (idx !== -1) reviews.value[idx] = data.review

      // Refresh stats for the media in case average/count changed
      try {
        await loadReviewStatsForMovies([reviewData.mediaId])
      } catch (e) {}

      return { success: true, review: data.review }
    } catch (err) {
      return { success: false, error: 'Server error' }
    }
  }

  async function deleteReview(reviewId) {
    try {
      const res = await fetch(`${API}/reviews/${reviewId}`, {
        method: 'DELETE',
        headers: { ...authHeaders() },
      })

      const data = await res.json()

      if (!res.ok) {
        return { success: false, error: data.error }
      }

      // Try to determine mediaId from removed review and refresh stats
      const removed = reviews.value.find(r => r.id === Number(reviewId))
      reviews.value = reviews.value.filter(r => r.id !== Number(reviewId))

      if (removed) {
        try {
          await loadReviewStatsForMovies([removed.mediaId])
        } catch (e) {}
      }

      return { success: true }
    } catch (err) {
      return { success: false, error: 'Server error' }
    }
  }

  // Load review stats from backend for a list of TMDB ids and merge into
  // `movies` and `detailCache` so lists and detail pages show correct counts
  async function loadReviewStatsForMovies(movieIds = []) {
    if (!Array.isArray(movieIds) || movieIds.length === 0) return

    const uniqueIds = [...new Set(movieIds.map(id => Number(id)))]

    try {
      const stats = await Promise.all(uniqueIds.map(async (id) => {
        try {
          const res = await fetch(`${API}/reviews/stats/${id}`)
          if (!res.ok) return null
          return await res.json()
        } catch (e) {
          return null
        }
      }))

      stats.forEach(stat => {
        if (!stat || typeof stat.mediaId === 'undefined') return
        const id = Number(stat.mediaId)
        const count = Number(stat.count ?? stat.reviewCount ?? 0)
        const avg = Number(stat.averageRating ?? stat.average ?? 0)

        // Update in movies list
        const mv = movies.value.find(m => Number(m.id) === id)
        if (mv) {
          mv.reviewCount = count
          mv.reviewAverage = avg
          mv.combinedRating = avg ? ((mv.rating || 0) * 0.7 + avg * 0.3) : (mv.rating || 0)
        }

        // Update in detailCache entries
        Object.keys(detailCache.value).forEach(key => {
          const d = detailCache.value[key]
          if (d && Number(d.id) === id) {
            d.reviewCount = count
            d.reviewAverage = avg
            d.combinedRating = avg ? ((d.rating || 0) * 0.7 + avg * 0.3) : (d.rating || 0)
          }
        })
      })

    } catch (err) {
      console.error('Could not load review stats:', err)
    }
  }

  //  WATCHLIST 

  function isInWatchlist(mediaId) {
    return watchlist.value.some(
      item => Number(item.mediaId) === Number(mediaId)
    )
  }

  async function fetchWatchlist(userId) {
    try {
      const res = await fetch(`${API}/watchlist/${userId}`, {
        headers: { ...authHeaders() }
      })

      const data = await res.json()

      if (res.ok && Array.isArray(data.watchlist)) {
        watchlist.value = data.watchlist.map(item => ({
          mediaId: Number(item.mediaId ?? item.id),
          type: item.type || 'movie'
        }))
      }

    } catch (err) {
      console.error(err)
    }
  }

  async function toggleWatchlist(mediaId, mediaType = 'movie') {
    try {
      const res = await fetch(`${API}/watchlist/toggle`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders()
        },
        body: JSON.stringify({ mediaId, type: mediaType })
      })

      const data = await res.json()

      if (data.saved) {
        if (!isInWatchlist(mediaId)) {
          watchlist.value.push({
            mediaId: Number(mediaId),
            type: mediaType
          })
        }
      } else {
        watchlist.value = watchlist.value.filter(
          item => Number(item.mediaId) !== Number(mediaId)
        )
      }

      localStorage.setItem(
        'cinelog_watchlist',
        JSON.stringify(watchlist.value)
      )

    } catch (err) {
      console.error(err)
    }
  }

  function getWatchlistItems() {
    return watchlist.value
  }

  //  LIKES 
  function isLiked(mediaId) {
    return likedMedia.value.includes(Number(mediaId))
  }

  function toggleLike(mediaId) {
    const id = Number(mediaId)
    const idx = likedMedia.value.indexOf(id)

    const movie = movies.value.find(m => m.id === id)

    if (idx === -1) {
      likedMedia.value.push(id)
      if (movie) movie.likes++
    } else {
      likedMedia.value.splice(idx, 1)
      if (movie) movie.likes--
    }

    localStorage.setItem(
      'cinelog_liked',
      JSON.stringify(likedMedia.value)
    )
  }

  async function toggleReviewLike(reviewId) {
    // Optimistic update first so UI feels instant
    const review = reviews.value.find(r => r.id === Number(reviewId))
    if (review) {
      review.liked = !review.liked
      review.likes = review.liked
        ? (review.likes || 0) + 1
        : Math.max(0, (review.likes || 0) - 1)
    }
    // Persist to backend
    try {
      const res = await fetch(`${API}/reviews/${reviewId}/like`, {
        method: 'POST',
        headers: { ...authHeaders() },
      })
      const data = await res.json()
      if (res.ok && review) {
        // Sync with server truth
        review.liked = data.liked
        review.likes = data.likeCount
      } else if (!res.ok && review) {
        // Roll back optimistic update
        review.liked = !review.liked
        review.likes = review.liked
          ? (review.likes || 0) + 1
          : Math.max(0, (review.likes || 0) - 1)
      }
    } catch (err) {
      console.error('toggleReviewLike error:', err)
      // Roll back on network error
      if (review) {
        review.liked = !review.liked
        review.likes = review.liked
          ? (review.likes || 0) + 1
          : Math.max(0, (review.likes || 0) - 1)
      }
    }
  }

  //  EXPOSE 
  return {
    movies,
    reviews,
    watchlist,
    likedMedia,
    trending,
    loading,
    error,

    loadTrending,
    loadPopular,
    search,
    loadDetail,
    resolveDetail,

    getMovieById,

    fetchReviewsByMediaId,
    addReview,
    updateReview,
    deleteReview,
    getReviewsByMediaId,
    loadReviewStatsForMovies,

    fetchWatchlist,
    toggleWatchlist,
    isInWatchlist,
    getWatchlistItems,

    isLiked,
    toggleLike,
    toggleReviewLike,
  }
})