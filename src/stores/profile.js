import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useAuthStore } from './auth'
import { useMediaStore } from './media'
import { API, authHeaders } from './api'
import { postFollow } from './social'

export const useProfileStore = defineStore('profile', () => {
  const auth = useAuthStore()
  const mediaStore = useMediaStore()

  const profile = ref(null)
  const loading = ref(true)
  const reviews = ref([])
  const reviewsLoading = ref(false)
  const watchlistItems = ref([])
  const watchlistLoading = ref(false)
  const followLoading = ref(false)
  const pendingFollowRequests = ref([])
  const requestLoadingId = ref(null)

  const watchlistMedia = computed(() =>
    watchlistItems.value
      .map(item => mediaStore.getMovieById(item.mediaId, item.type))
      .filter(Boolean)
  )

  const watchlistCount = computed(() => watchlistMedia.value.length)

  function getMedia(mediaId, type = 'movie') {
    return mediaStore.getMovieById(mediaId, type)
  }

  async function loadProfile(username) {
    loading.value = true
    try {
      const res = await fetch(`${API}/users/${username}`, {
        headers: authHeaders(auth.token),
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
        headers: authHeaders(auth.token),
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

  async function loadWatchlist() {
    if (!profile.value?.canViewContent) {
      watchlistItems.value = []
      return
    }
    watchlistLoading.value = true
    try {
      const res = await fetch(`${API}/users/${profile.value.user.username}/watchlist`, {
        headers: authHeaders(auth.token),
      })
      const data = await res.json()
      if (!res.ok) {
        watchlistItems.value = []
        return
      }
      watchlistItems.value = (data.watchlist || []).map(item => ({
        mediaId: Number(item.mediaId),
        type: item.type || 'movie',
      }))

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

  async function loadAll(username) {
    await loadProfile(username)
    if (profile.value) {
      await Promise.all([loadReviews(), loadWatchlist()])
    }
  }

  async function deleteReview(reviewId) {
    try {
      const res = await fetch(`${API}/reviews/${reviewId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders(auth.token),
        },
      })
      const data = await res.json()
      if (!res.ok) {
        return { success: false, error: data.error || 'Could not delete review.' }
      }
      reviews.value = reviews.value.filter(r => r.id !== reviewId)
      return { success: true }
    } catch (err) {
      console.error('Delete review error:', err)
      return { success: false, error: 'Could not reach the server. Please try again.' }
    }
  }

  function likeReview(reviewId) {
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

  async function removeFromWatchlist(media) {
    if (!profile.value?.isSelf || !auth.isAuthenticated) return
    await mediaStore.toggleWatchlist(media.id, media.type || 'movie')
    watchlistItems.value = watchlistItems.value.filter(item => item.mediaId !== media.id)
  }

  async function toggleFollow() {
    if (!auth.isAuthenticated || !profile.value || profile.value.isSelf) return
    followLoading.value = true
    const wasFollowing = profile.value.isFollowing
    try {
      const { ok, data, error } = await postFollow(profile.value.user.username, auth.token)
      if (!ok) {
        alert(error || 'Could not update follow.')
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
      pendingFollowRequests.value = pendingFollowRequests.value.filter(
        r => r.followerId !== followerId
      )
      if (action === 'accept') {
        profile.value.stats.followers += 1
      }
    } catch (err) {
      console.error('Follow request response failed:', err)
    } finally {
      requestLoadingId.value = null
    }
  }

  function applyUserUpdate(user) {
    if (!profile.value) return
    profile.value.user = { ...profile.value.user, ...user }
    profile.value.canViewContent = true
  }

  return {
    profile,
    loading,
    reviews,
    reviewsLoading,
    watchlistItems,
    watchlistLoading,
    followLoading,
    pendingFollowRequests,
    requestLoadingId,
    watchlistMedia,
    watchlistCount,
    getMedia,
    loadProfile,
    loadReviews,
    loadWatchlist,
    loadAll,
    deleteReview,
    likeReview,
    removeFromWatchlist,
    toggleFollow,
    respondFollowRequest,
    applyUserUpdate,
  }
})
