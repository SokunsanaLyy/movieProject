import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { PrismaClient } from '@prisma/client'

dotenv.config()
const app = express()
const prisma = new PrismaClient()
const port = process.env.PORT || 3000
const jwtSecret = process.env.JWT_SECRET || 'secret'

app.use(cors({
  origin: [
    'http://localhost:5173',           // local dev (Vite default)
    'https://mercury.swin.edu.au',    // Mercury frontend URL
  ]
}))
app.use(express.json({ limit: '2mb' }))

function generateToken(user) {
  return jwt.sign({ userId: user.id }, jwtSecret, { expiresIn: '7d' })
}

function authenticate(req, res, next) {
  const header = req.headers.authorization
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing auth token' })
  }
  const token = header.split(' ')[1]
  try {
    const payload = jwt.verify(token, jwtSecret)
    req.userId = payload.userId
    next()
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' })
  }
}

function attachUser(req, res, next) {
  const header = req.headers.authorization
  if (header && header.startsWith('Bearer ')) {
    try {
      const payload = jwt.verify(header.split(' ')[1], jwtSecret)
      req.userId = payload.userId
    } catch (err) {
      // invalid token — treat as guest
    }
  }
  next()
}

function publicUser(u) {
  return {
    id:          u.id,
    username:    u.username,
    displayName: u.displayName,
    avatar:      u.avatar || null,
    bio:         u.bio    || null,
    isPrivate:   !!u.isPrivate,
  }
}

async function canViewProfileContent(profileUser, viewerId) {
  if (!profileUser.isPrivate) return true
  if (!viewerId) return false
  if (viewerId === profileUser.id) return true
  const edge = await prisma.follow.findUnique({
    where: {
      followerId_followingId: {
        followerId:  viewerId,
        followingId: profileUser.id,
      },
    },
  })
  return !!edge
}

async function getFollowState(viewerId, targetUserId) {
  if (!viewerId || viewerId === targetUserId) {
    return { isFollowing: false, followRequestPending: false }
  }
  const [edge, request] = await Promise.all([
    prisma.follow.findUnique({
      where: {
        followerId_followingId: {
          followerId:  viewerId,
          followingId: targetUserId,
        },
      },
    }),
    prisma.followRequest.findUnique({
      where: {
        followerId_followingId: {
          followerId:  viewerId,
          followingId: targetUserId,
        },
      },
    }),
  ])
  return { isFollowing: !!edge, followRequestPending: !!request && !edge }
}

async function findUserByUsername(username) {
  return prisma.user.findUnique({ where: { username } })
}

function normalizeAvatar(value) {
  const v = value.trim()
  if (!v) return null
  if (v.startsWith('http://') || v.startsWith('https://')) {
    return v.length <= 2000 ? v : false
  }
  if (/^data:image\/(jpeg|png|webp);base64,/.test(v)) {
    return v.length <= 600_000 ? v : false
  }
  return false
}

app.get('/', (req, res) => {
  res.json({ message: 'CineLOG backend is running' })
})

// ── Auth ───────────────────────────────────────────────────────────
app.post('/api/auth/register', async (req, res) => {
  const { username, email, displayName, password } = req.body
  if (!username || !email || !displayName || !password) {
    return res.status(400).json({ error: 'Missing required fields' })
  }
  try {
    const hashedPassword = await bcrypt.hash(password, 10)
    const user = await prisma.user.create({
      data: { username, email, displayName, password: hashedPassword },
    })
    const token = generateToken(user)
    return res.json({
      user: {
        id:          user.id,
        username:    user.username,
        displayName: user.displayName,
        email:       user.email,
        avatar:      user.avatar || null,
        bio:         user.bio    || null,
        isPrivate:   !!user.isPrivate,
      },
      token,
    })
  } catch (err) {
    const message = err.code === 'P2002' ? 'Username or email already exists' : 'Unable to create account'
    return res.status(400).json({ error: message })
  }
})

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body
  if (!username || !password) {
    return res.status(400).json({ error: 'Missing username or password' })
  }
  try {
    const user = await prisma.user.findFirst({
      where: { OR: [{ username }, { email: username }] },
    })
    if (!user) return res.status(401).json({ error: 'Invalid credentials' })

    const valid = await bcrypt.compare(password, user.password)
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' })

    const token = generateToken(user)
    return res.json({
      user: {
        id:          user.id,
        username:    user.username,
        displayName: user.displayName,
        email:       user.email,
        avatar:      user.avatar || null,
        bio:         user.bio    || null,
        isPrivate:   !!user.isPrivate,
      },
      token,
    })
  } catch (err) {
    console.error('Login error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

// ── Reviews ────────────────────────────────────────────────────────
app.get('/api/reviews', attachUser, async (req, res) => {
  try {
    const mediaId = req.query.mediaId ? Number(req.query.mediaId) : undefined
    const mediaType = req.query.mediaType ? String(req.query.mediaType) : undefined
    const where = {}
    if (mediaId) where.mediaId = mediaId
    if (mediaType) where.mediaType = mediaType
    const reviews = await prisma.review.findMany({
      where,
      include: {
        user: true,
        likes: { select: { userId: true } },
      },
      orderBy: { createdAt: 'desc' },
    })
    // Attach likeCount and liked (whether current user liked it)
    const shaped = reviews.map(r => ({
      ...r,
      likeCount: r.likes.length,
      liked: req.userId ? r.likes.some(l => l.userId === req.userId) : false,
      likes: undefined,
    }))
    res.json({ reviews: shaped })
  } catch (err) {
    console.error('GET /api/reviews error:', err)
    res.status(500).json({ error: 'Could not fetch reviews' })
  }
})

app.get('/api/reviews/:id', attachUser, async (req, res) => {
  try {
    const id = Number(req.params.id)
    const review = await prisma.review.findUnique({
      where: { id },
      include: {
        user: true,
        likes: { select: { userId: true } },
      },
    })
    if (!review) return res.status(404).json({ error: 'Review not found' })
    res.json({
      ...review,
      likeCount: review.likes.length,
      liked: req.userId ? review.likes.some(l => l.userId === req.userId) : false,
      likes: undefined,
    })
  } catch (err) {
    console.error('GET /api/reviews/:id error:', err)
    res.status(500).json({ error: 'Could not fetch review' })
  }
})

app.post('/api/reviews', authenticate, async (req, res) => {
  try {
    const { mediaId, mediaType, rating, content } = req.body
    if (!mediaId || !rating || !content) {
      return res.status(400).json({ error: 'Missing required fields' })
    }
    const review = await prisma.review.create({
      data: {
        mediaId: Number(mediaId),
        mediaType: mediaType === 'tv' ? 'tv' : 'movie',
        rating,
        content,
        userId: req.userId,
      },
      include: { user: true },
    })
    res.status(201).json({ review })
  } catch (err) {
    console.error('POST /api/reviews error:', err)
    res.status(500).json({ error: 'Could not create review' })
  }
})

app.put('/api/reviews/:id', authenticate, async (req, res) => {
  try {
    const id = Number(req.params.id)
    const { rating, content } = req.body

    if (!rating || !content) {
      return res.status(400).json({ error: 'Rating and content are required' })
    }

    const review = await prisma.review.findUnique({ where: { id } })
    if (!review) return res.status(404).json({ error: 'Review not found' })
    if (review.userId !== req.userId) {
      return res.status(403).json({ error: 'You can only edit your own reviews' })
    }

    const updated = await prisma.review.update({
      where: { id },
      data: {
        rating: parseInt(rating),
        content: String(content),
      },
      include: { user: true },
    })

    res.json({ review: updated })
  } catch (err) {
    console.error('PUT /api/reviews/:id error:', err.message)
    res.status(500).json({ error: 'Could not update review', detail: err.message })
  }
})

app.delete('/api/reviews/:id', authenticate, async (req, res) => {
  try {
    const id = Number(req.params.id)
    const review = await prisma.review.findUnique({ where: { id } })
    if (!review) return res.status(404).json({ error: 'Review not found' })
    if (review.userId !== req.userId) {
      return res.status(403).json({ error: 'You can only delete your own reviews' })
    }
    await prisma.review.delete({ where: { id } })
    res.json({ success: true })
  } catch (err) {
    console.error('DELETE /api/reviews/:id error:', err)
    res.status(500).json({ error: 'Could not delete review' })
  }
})

app.get('/api/reviews/stats/:mediaId', async (req, res) => {
  try {
    const mediaId = Number(req.params.mediaId)
    const reviews = await prisma.review.findMany({ where: { mediaId } })
    if (reviews.length === 0) {
      return res.json({ mediaId, count: 0, averageRating: 0 })
    }
    const sum = reviews.reduce((total, r) => total + r.rating, 0)
    const averageRating = Number((sum / reviews.length).toFixed(1))
    res.json({ mediaId, count: reviews.length, averageRating })
  } catch (err) {
    console.error('GET /api/reviews/stats error:', err)
    res.status(500).json({ error: 'Could not fetch review stats' })
  }
})


// ── Review Likes ───────────────────────────────────────────────────
app.post('/api/reviews/:id/like', authenticate, async (req, res) => {
  try {
    const reviewId = Number(req.params.id)
    const existing = await prisma.reviewLike.findUnique({
      where: { userId_reviewId: { userId: req.userId, reviewId } },
    })
    if (existing) {
      await prisma.reviewLike.delete({ where: { id: existing.id } })
      const count = await prisma.reviewLike.count({ where: { reviewId } })
      return res.json({ liked: false, likeCount: count })
    }
    await prisma.reviewLike.create({ data: { userId: req.userId, reviewId } })
    const count = await prisma.reviewLike.count({ where: { reviewId } })
    res.json({ liked: true, likeCount: count })
  } catch (err) {
    console.error('POST /api/reviews/:id/like error:', err)
    res.status(500).json({ error: 'Could not toggle like' })
  }
})

// ── Watchlist ───────────────────────────────────────────────────────
app.get('/api/watchlist/:userId', authenticate, async (req, res) => {
  try {
    const userId = Number(req.params.userId)
    if (req.userId !== userId) return res.status(403).json({ error: 'Unauthorized' })
    const items = await prisma.watchlist.findMany({ where: { userId } })
    res.json({ watchlist: items })
  } catch (err) {
    console.error('GET /api/watchlist error:', err)
    res.status(500).json({ error: 'Could not fetch watchlist' })
  }
})

app.post('/api/watchlist/toggle', authenticate, async (req, res) => {
  try {
    const { mediaId, type } = req.body
    if (!mediaId) return res.status(400).json({ error: 'Missing mediaId' })

    const mediaType = type || 'movie'
    const numericId = Number(mediaId)

    const existing = await prisma.watchlist.findFirst({
      where: { userId: req.userId, mediaId: numericId },
    })

    if (existing) {
      await prisma.watchlist.delete({ where: { id: existing.id } })
      return res.json({ saved: false })
    }

    await prisma.watchlist.create({
      data: { userId: req.userId, mediaId: numericId, type: mediaType },
    })
    return res.json({ saved: true })
  } catch (err) {
    console.error('POST /api/watchlist/toggle error:', err)
    return res.status(500).json({ error: 'Failed to update watchlist' })
  }
})

// ── Users / Profiles ────────────────────────────────────────────────
app.get('/api/users', attachUser, async (req, res) => {
  try {
    const q = String(req.query.q || '').trim()
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 50)
    if (!q) return res.json({ users: [] })

    const rows = await prisma.user.findMany({
      where: {
        AND: [
          req.userId ? { id: { not: req.userId } } : {},
          {
            OR: [
              { username:    { contains: q } },
              { displayName: { contains: q } },
            ],
          },
        ],
      },
      take:    limit,
      orderBy: { username: 'asc' },
    })
    res.json({ users: await decorateFollows(rows, req.userId) })
  } catch (err) {
    console.error('GET /api/users error:', err)
    res.status(500).json({ error: 'Could not fetch users' })
  }
})

app.get('/api/users/:username', attachUser, async (req, res) => {
  try {
    const user = await findUserByUsername(req.params.username)
    if (!user) return res.status(404).json({ error: 'User not found' })

    const isSelf = req.userId === user.id
    const canViewContent = await canViewProfileContent(user, req.userId)

    let stats = { reviews: 0, watchlist: 0, followers: 0, following: 0 }
    if (canViewContent) {
      const [reviewCount, watchlistCount, followersCount, followingCount] = await Promise.all([
        prisma.review.count({ where: { userId: user.id } }),
        prisma.watchlist.count({ where: { userId: user.id } }),
        prisma.follow.count({ where: { followingId: user.id } }),
        prisma.follow.count({ where: { followerId: user.id } }),
      ])
      stats = { reviews: reviewCount, watchlist: watchlistCount, followers: followersCount, following: followingCount }
    }

    const { isFollowing, followRequestPending } = await getFollowState(req.userId, user.id)

    let pendingFollowRequests = []
    if (isSelf) {
      const requests = await prisma.followRequest.findMany({
        where:   { followingId: user.id },
        include: { follower: true },
        orderBy: { createdAt: 'desc' },
      })
      pendingFollowRequests = requests.map(r => ({
        id:          r.id,
        followerId:  r.followerId,
        username:    r.follower.username,
        displayName: r.follower.displayName,
        avatar:      r.follower.avatar || null,
        createdAt:   r.createdAt,
      }))
    }

    res.json({
      user: {
        ...publicUser(user),
        createdAt: user.createdAt,
        bio: canViewContent ? (user.bio || null) : null,
      },
      stats,
      isFollowing,
      followRequestPending,
      pendingFollowRequests,
      isSelf,
      canViewContent,
    })
  } catch (err) {
    console.error('GET /api/users/:username error:', err)
    res.status(500).json({ error: 'Could not fetch user' })
  }
})

app.put('/api/users/me', authenticate, async (req, res) => {
  const { displayName, avatar, bio, isPrivate } = req.body
  const data = {}
  if (typeof displayName === 'string' && displayName.trim()) {
    data.displayName = displayName.trim().slice(0, 60)
  }
  if (typeof avatar === 'string') {
    const normalized = normalizeAvatar(avatar)
    if (normalized === false) {
      return res.status(400).json({ error: 'Invalid avatar. Use an image URL or a smaller photo.' })
    }
    data.avatar = normalized
  }
  if (typeof bio === 'string') data.bio = bio.slice(0, 300)
  if (typeof isPrivate === 'boolean') data.isPrivate = isPrivate

  if (Object.keys(data).length === 0) {
    return res.status(400).json({ error: 'Nothing to update' })
  }

  try {
    const updated = await prisma.user.update({ where: { id: req.userId }, data })
    res.json({
      user: {
        id:          updated.id,
        username:    updated.username,
        displayName: updated.displayName,
        email:       updated.email,
        avatar:      updated.avatar || null,
        bio:         updated.bio    || null,
        isPrivate:   !!updated.isPrivate,
      },
    })
  } catch (err) {
    console.error('PUT /api/users/me error:', err)
    res.status(500).json({ error: 'Could not update profile' })
  }
})

app.get('/api/users/:username/reviews', attachUser, async (req, res) => {
  try {
    const user = await findUserByUsername(req.params.username)
    if (!user) return res.status(404).json({ error: 'User not found' })
    if (!await canViewProfileContent(user, req.userId)) {
      return res.status(403).json({ error: 'This profile is private', private: true, reviews: [] })
    }
    const reviews = await prisma.review.findMany({
      where:   { userId: user.id },
      include: {
        user: true,
        likes: { select: { userId: true } },
      },
      orderBy: { createdAt: 'desc' },
    })
    const shaped = reviews.map(r => ({
      ...r,
      likeCount: r.likes.length,
      liked: req.userId ? r.likes.some(l => l.userId === req.userId) : false,
      likes: undefined,
    }))
    res.json({ reviews: shaped })
  } catch (err) {
    console.error('GET /api/users/:username/reviews error:', err)
    res.status(500).json({ error: 'Could not fetch reviews' })
  }
})

app.get('/api/users/:username/watchlist', attachUser, async (req, res) => {
  try {
    const user = await findUserByUsername(req.params.username)
    if (!user) return res.status(404).json({ error: 'User not found' })
    if (!await canViewProfileContent(user, req.userId)) {
      return res.status(403).json({ error: 'This profile is private', private: true, watchlist: [] })
    }
    const items = await prisma.watchlist.findMany({
      where:   { userId: user.id },
      orderBy: { id: 'desc' },
    })
    res.json({ watchlist: items })
  } catch (err) {
    console.error('GET /api/users/:username/watchlist error:', err)
    res.status(500).json({ error: 'Could not fetch watchlist' })
  }
})

async function decorateFollows(users, viewerId) {
  if (!viewerId) return users.map(u => ({ ...publicUser(u), isFollowing: false }))
  const viewerEdges = await prisma.follow.findMany({
    where:  { followerId: viewerId, followingId: { in: users.map(u => u.id) } },
    select: { followingId: true },
  })
  const followingSet = new Set(viewerEdges.map(e => e.followingId))
  return users.map(u => ({ ...publicUser(u), isFollowing: followingSet.has(u.id) }))
}

app.get('/api/users/:username/followers', attachUser, async (req, res) => {
  try {
    const user = await findUserByUsername(req.params.username)
    if (!user) return res.status(404).json({ error: 'User not found' })
    if (!await canViewProfileContent(user, req.userId)) {
      return res.status(403).json({ error: 'This profile is private', private: true, users: [] })
    }
    const edges = await prisma.follow.findMany({
      where:   { followingId: user.id },
      include: { follower: true },
      orderBy: { createdAt: 'desc' },
    })
    const followers = edges.map(e => e.follower)
    res.json({ users: await decorateFollows(followers, req.userId) })
  } catch (err) {
    console.error('GET /api/users/:username/followers error:', err)
    res.status(500).json({ error: 'Could not fetch followers' })
  }
})

app.get('/api/users/:username/following', attachUser, async (req, res) => {
  try {
    const user = await findUserByUsername(req.params.username)
    if (!user) return res.status(404).json({ error: 'User not found' })
    if (!await canViewProfileContent(user, req.userId)) {
      return res.status(403).json({ error: 'This profile is private', private: true, users: [] })
    }
    const edges = await prisma.follow.findMany({
      where:   { followerId: user.id },
      include: { following: true },
      orderBy: { createdAt: 'desc' },
    })
    const following = edges.map(e => e.following)
    res.json({ users: await decorateFollows(following, req.userId) })
  } catch (err) {
    console.error('GET /api/users/:username/following error:', err)
    res.status(500).json({ error: 'Could not fetch following' })
  }
})

app.post('/api/users/:username/follow', authenticate, async (req, res) => {
  try {
    const target = await prisma.user.findUnique({ where: { username: req.params.username } })
    if (!target) return res.status(404).json({ error: 'User not found' })
    if (target.id === req.userId) {
      return res.status(400).json({ error: "You can't follow yourself" })
    }

    const existingFollow = await prisma.follow.findUnique({
      where: {
        followerId_followingId: {
          followerId:  req.userId,
          followingId: target.id,
        },
      },
    })

    if (existingFollow) {
      await prisma.follow.delete({ where: { id: existingFollow.id } })
      return res.json({ isFollowing: false, followRequestPending: false })
    }

    const existingRequest = await prisma.followRequest.findUnique({
      where: {
        followerId_followingId: {
          followerId:  req.userId,
          followingId: target.id,
        },
      },
    })

    if (existingRequest) {
      await prisma.followRequest.delete({ where: { id: existingRequest.id } })
      return res.json({ isFollowing: false, followRequestPending: false })
    }

    if (target.isPrivate) {
      await prisma.followRequest.create({
        data: { followerId: req.userId, followingId: target.id },
      })
      return res.json({ isFollowing: false, followRequestPending: true })
    }

    await prisma.follow.create({
      data: { followerId: req.userId, followingId: target.id },
    })
    res.json({ isFollowing: true, followRequestPending: false })
  } catch (err) {
    console.error('POST /api/users/:username/follow error:', err)
    res.status(500).json({ error: 'Could not update follow status' })
  }
})

app.post('/api/users/me/follow-requests/:followerId', authenticate, async (req, res) => {
  const action = String(req.body?.action || '').toLowerCase()
  if (action !== 'accept' && action !== 'reject') {
    return res.status(400).json({ error: 'action must be accept or reject' })
  }

  try {
    const followerId = Number(req.params.followerId)
    const request = await prisma.followRequest.findUnique({
      where: {
        followerId_followingId: {
          followerId,
          followingId: req.userId,
        },
      },
    })

    if (!request) {
      return res.status(404).json({ error: 'Follow request not found' })
    }

    await prisma.followRequest.delete({ where: { id: request.id } })

    if (action === 'accept') {
      await prisma.follow.upsert({
        where: {
          followerId_followingId: {
            followerId,
            followingId: req.userId,
          },
        },
        update: {},
        create: { followerId, followingId: req.userId },
      })
    }

    res.json({ success: true, action })
  } catch (err) {
    console.error('POST /api/users/me/follow-requests error:', err)
    res.status(500).json({ error: 'Could not respond to follow request' })
  }
})

// ── Global error handler ─────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err)
  res.status(500).json({ error: 'Internal server error' })
})

app.listen(port, () => {
  console.log(`Backend listening on http://localhost:${port}`)
})