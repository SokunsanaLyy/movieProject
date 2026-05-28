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

const API = 'http://localhost:3000/api'

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
  async function loadReviewStatsForMovies(movieIds = []) {
    if (!movieIds?.length) return

    const stats = await Promise.all(
      movieIds.map(async id => {
        try {
          const res = await fetch(`${API}/reviews/stats/${id}`)
          if (!res.ok) return null
          return await res.json()
        } catch (err) {
          console.error('Failed to load review stats for media', id, err)
          return null
        }
      })
    )

    stats.forEach(stat => {
      if (!stat) return

      const movie = movies.value.find(m => Number(m.id) === Number(stat.mediaId))
      if (movie) {
        movie.reviewCount = stat.count
        movie.reviewAverage = stat.averageRating
      }

      Object.values(detailCache.value).forEach(cached => {
        if (Number(cached.id) === Number(stat.mediaId)) {
          cached.reviewCount = stat.count
          cached.reviewAverage = stat.averageRating
        }
      })
    })
  }

  async function loadTrending() {
    loading.value = true
    error.value = ''
    try {
      movies.value = await fetchTrending()
      await loadReviewStatsForMovies(movies.value.map(m => m.id))
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
        await loadReviewStatsForMovies(movies.value.map(m => m.id))
        return data.totalPages
      }

      if (type === 'tv') {
        const data = await fetchPopularTV(page)
        movies.value = data.results
        await loadReviewStatsForMovies(movies.value.map(m => m.id))
        return data.totalPages
      }

      const [mv, tv] = await Promise.all([
        fetchPopularMovies(page),
        fetchPopularTV(page),
      ])

      movies.value = [...mv.results, ...tv.results]
        .sort((a, b) => b.rating - a.rating)

      await loadReviewStatsForMovies(movies.value.map(m => m.id))
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
      await loadReviewStatsForMovies(movies.value.map(m => m.id))
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
  async function fetchReviewsByMediaId(mediaId, mediaType = null) {
    try {
      const params = new URLSearchParams({ mediaId: String(mediaId) })
      if (mediaType) params.set('mediaType', mediaType)
      const res = await fetch(`${API}/reviews?${params}`)
      const data = await res.json()

      if (res.ok) {
        reviews.value = [
          ...reviews.value.filter(r => {
            if (Number(r.mediaId) !== Number(mediaId)) return true
            if (!mediaType || !r.mediaType) return false
            return r.mediaType !== mediaType
          }),
          ...data.reviews,
        ]
      }
    } catch (err) {
      console.error(err)
    }
  }

  function getReviewsByMediaId(mediaId, mediaType = null) {
    return reviews.value.filter(r => {
      if (Number(r.mediaId) !== Number(mediaId)) return false
      if (mediaType && r.mediaType && r.mediaType !== mediaType) return false
      return true
    })
  }

  async function addReview(reviewData) {
    try {
      const res = await fetch(`${API}/reviews`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders(),
        },
        body: JSON.stringify({
          mediaId: reviewData.mediaId,
          mediaType: reviewData.mediaType || 'movie',
          rating: reviewData.rating,
          content: reviewData.content,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        return { success: false, error: data.error }
      }

      reviews.value.unshift(data.review)

      const movie = movies.value.find(
        m => m.id === Number(reviewData.mediaId)
          && m.type === (reviewData.mediaType || 'movie')
      )

      if (movie) {
        const oldCount = Number(movie.reviewCount || 0)
        movie.reviewCount = oldCount + 1
        if (typeof movie.reviewAverage === 'number' && oldCount > 0) {
          movie.reviewAverage = (
            (movie.reviewAverage * oldCount) + Number(reviewData.rating)
          ) / (oldCount + 1)
        } else {
          movie.reviewAverage = Number(reviewData.rating)
        }
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

      reviews.value = reviews.value.filter(r => r.id !== Number(reviewId))

      return { success: true }
    } catch (err) {
      return { success: false, error: 'Server error' }
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

  function toggleReviewLike(reviewId, userId) {
    const review = reviews.value.find(r => r.id === Number(reviewId))
    if (!review) return
    if (!review._likedBy) review._likedBy = []
    const alreadyLiked = review._likedBy.includes(userId)
    if (alreadyLiked) {
      review._likedBy = review._likedBy.filter(id => id !== userId)
      review.likes = Math.max(0, (review.likes || 0) - 1)
      review.liked = false
    } else {
      review._likedBy.push(userId)
      review.likes = (review.likes || 0) + 1
      review.liked = true
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
    loadReviewStatsForMovies,
    resolveDetail,

    getMovieById,

    fetchReviewsByMediaId,
    addReview,
    updateReview,
    deleteReview,
    getReviewsByMediaId,

    fetchWatchlist,
    toggleWatchlist,
    isInWatchlist,
    getWatchlistItems,

    isLiked,
    toggleLike,
    toggleReviewLike,
  }
})
