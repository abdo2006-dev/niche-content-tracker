# Content Tracker

A private competitor analytics dashboard for tracking creators across **YouTube, TikTok, and Instagram** — and discovering top-performing content in your niches (MM2, GAG2, Steal a Brainrot, Kick a Lucky Block, etc.).

Built with **Next.js 14 App Router, TypeScript, Tailwind CSS, Prisma, PostgreSQL, and the YouTube Data API v3**. Deployable to Vercel in minutes.

---

## Features

- **Dashboard** — unified stats across all platforms: total creators, posts, uploads today/week, top by views/VPH, fastest growing
- **Creators** — add YouTube channels, TikTok accounts, and Instagram profiles; assign tags; per-creator post stats; manual sync
- **Posts** — filter by platform, creator, tag, date range, keyword; sort by views, likes, VPH, shares, 24h/7d/30d growth; platform badges per post
- **Trending** — keyword/hashtag trackers across YouTube (and TikTok/Instagram when APIs are configured), top 20 posts, auto-archive after N days
- **Ideas** — outlier detection, fastest growing 24h, top keywords in titles, best creators by avg VPH, per-post idea notes
- **Tags** — flexible tags across creators/posts/keywords
- **Settings** — per-platform API key status, refresh intervals, manual sync/stats triggers, 24h API usage log

---

## Platform API support

| Platform | Auto-sync | Manual tracking | Notes |
|---|---|---|---|
| **YouTube** | ✅ Full | ✅ | YouTube Data API v3. Free, 10,000 units/day. |
| **TikTok** | ✅ Full (if approved) | ✅ | TikTok Research API — requires application at developers.tiktok.com. If not approved, creators can still be added manually. |
| **Instagram** | ✅ Own account; ⚠️ Competitors need Business Discovery | ✅ | Instagram Graph API. Business Discovery (competitor tracking) requires a Business/Creator account connected to a Facebook page. |

> **In all cases you can add any creator manually** — just enter their handle/URL. If the API for that platform isn't configured, the add will work as a basic profile stub and you can manually log post stats.

---

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS |
| ORM | Prisma |
| Database | PostgreSQL (Neon / Supabase / Railway) |
| APIs | YouTube Data API v3, TikTok Research API, Instagram Graph API |
| Hosting | Vercel |
| Cron | Vercel Cron Jobs |

---

## Quick start

### 1. Clone and install

```bash
git clone https://github.com/abdo2006-dev/niche-content-tracker.git
cd niche-content-tracker
npm install
```

### 2. Set up environment variables

```bash
cp .env.example .env.local
```

Edit `.env.local`. At minimum you need `DATABASE_URL`. Everything else is optional but enables auto-sync for that platform:

```env
# Required
DATABASE_URL="postgresql://..."

# YouTube (highly recommended — free, easy to get)
YOUTUBE_API_KEY=""

# TikTok Research API (optional — requires application approval)
TIKTOK_CLIENT_KEY=""
TIKTOK_CLIENT_SECRET=""

# Instagram Graph API (optional — requires Facebook developer app)
INSTAGRAM_ACCESS_TOKEN=""
INSTAGRAM_BUSINESS_ACCOUNT_ID=""  # for competitor tracking

# Vercel Cron
CRON_SECRET=""
```

### 3. Set up the database

```bash
npx prisma migrate dev --name init
# or for a quick push without migration history:
npx prisma db push

# Seed starter tags (MM2, GAG2, etc.)
npm run db:seed
```

### 4. Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Deploying to Vercel

1. Go to [vercel.com/new](https://vercel.com/new) → import `abdo2006-dev/niche-content-tracker`
2. Framework preset: **Next.js** (auto-detected)
3. Add environment variables in project settings (at minimum `DATABASE_URL` + `YOUTUBE_API_KEY`)
4. Click **Deploy**
5. Run database migrations once from local:
   ```bash
   DATABASE_URL="<prod-url>" npx prisma migrate deploy
   DATABASE_URL="<prod-url>" npm run db:seed
   ```

---

## Getting API credentials

### YouTube (highly recommended)
1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/library/youtube.googleapis.com)
2. Enable **YouTube Data API v3**
3. Create credentials → API key
4. Set as `YOUTUBE_API_KEY`

**Quota:** 10,000 units/day. `videos.list` costs 1 unit/call (50 IDs per call). `search.list` costs 100 units. The app batches and rate-limits all calls — normal usage stays well within the free tier.

### TikTok Research API (optional)
1. Apply at [developers.tiktok.com/products/research-api](https://developers.tiktok.com/products/research-api)
2. This requires an application with a stated research purpose — approval can take days to weeks
3. Once approved, create an app and get `TIKTOK_CLIENT_KEY` + `TIKTOK_CLIENT_SECRET`

**If not approved:** You can still add TikTok creators as manual stubs and track them via the app — just no auto-sync.

### Instagram Graph API (optional)
See detailed setup options in `src/lib/platforms/instagram.ts`. In short:
- **Option A (own account):** Create a Facebook app → Instagram Basic Display → generate a long-lived User Access Token → `INSTAGRAM_ACCESS_TOKEN`
- **Option B (competitor tracking):** Also set `INSTAGRAM_BUSINESS_ACCOUNT_ID` to enable Business Discovery, which lets you look up any public professional account

**Token expiry:** Long-lived tokens last 60 days. Refresh them before expiry — the Settings page shows token status.

---

## Cron jobs (Vercel)

Defined in `vercel.json`:

| Endpoint | Schedule | Purpose |
|---|---|---|
| `/api/cron/sync-creators` | Every 6 hours | New posts from all tracked creators |
| `/api/cron/update-stats` | Every hour | Re-fetch stats for active posts (last 30 days) |
| `/api/cron/archive-trending` | Daily at 4 AM UTC | Archive expired keyword-tracker posts; auto-refresh due keywords |

All cron endpoints require `Authorization: Bearer <CRON_SECRET>` when `CRON_SECRET` is set. Vercel sends this automatically.

Cron jobs can be disabled without redeploying from the **Settings** page.

---

## Project structure

```
src/
  app/
    api/
      creators/        CRUD creators + sync
      posts/           List posts (all platforms), manual stats update
      keywords/        Keyword trackers (multi-platform)
      dashboard/       Unified stats
      notes/           Idea notes
      settings/        App settings
      usage/           API usage log summary
      cron/            Vercel cron handlers
    page.tsx           Dashboard
    creators/          Creators management (YouTube/TikTok/Instagram)
    posts/             Unified posts feed
    trending/          Keyword tracker
    ideas/             Ideas / outlier finder
    tags/              Tags CRUD
    settings/          Settings
  lib/
    platforms/
      index.ts         Platform router (dispatches to right wrapper)
      youtube.ts       YouTube Data API v3
      tiktok.ts        TikTok Research API
      instagram.ts     Instagram Graph API
    sync.ts            Platform-agnostic sync logic
    metrics.ts         VPH + growth calculations
    quota.ts           Refresh interval enforcement
    settings.ts        AppSetting helpers
    types.ts           Shared interfaces (ResolvedCreator, ResolvedPost, etc.)
    prisma.ts          Prisma client singleton
    serialize.ts       BigInt → string for JSON
    format.ts          Formatting utilities
    validations.ts     Zod schemas
    cronAuth.ts        Cron request verification
  components/
    shared/
      Nav.tsx           Sidebar (YouTube/TikTok/Instagram badges in subtitle)
      PostCard.tsx      Platform-aware post card
      PlatformBadge.tsx Coloured platform pill (YouTube/TikTok/Instagram)
      TagPill.tsx       Tag badge
      TagSelector.tsx   Multi-select tag picker
      StatCard.tsx      Dashboard stat card
      States.tsx        Loading / empty / error states
prisma/
  schema.prisma        All models (Creator, Post, PostStatsSnapshot, Tag, …)
  seed.ts              Starter tags
vercel.json            Cron schedules
.env.example           Environment variable template
```

---

## Database models

| Model | Purpose |
|---|---|
| `Creator` | YouTube channel / TikTok account / Instagram profile |
| `Post` | Any piece of content — video, reel, TikTok, carousel |
| `PostStatsSnapshot` | Point-in-time stats for growth calculation |
| `Tag` | Flexible tag, usable on creators/posts/keywords |
| `CreatorTag` / `PostTag` / `KeywordTrackerTag` | Many-to-many join tables |
| `KeywordTracker` | Saved keyword/hashtag search (cross-platform) |
| `KeywordTrackerPost` | Join table with expiry tracking |
| `IdeaNote` | Personal note saved on a post from /ideas |
| `AppSetting` | Key/value config store |
| `ApiUsageLog` | Per-platform API call log for quota visibility |
