# SpendWise — Personal Expense Tracker

## Problem Statement

Tracking daily expenses manually is tedious and often abandoned. Small groups of friends sharing accountability for their finances need a lightweight tool that:

- Makes recording expenses as frictionless as possible (voice or typing)
- Automatically categorizes spending so users don't have to think about it
- Visualizes where money goes each month
- Provides actionable tips to optimize spending

**Target users**: 2–3 friends who want to track personal expenses and get monthly insights — at zero hosting cost.

---

## Features

### 1. Expense Recording
- **Manual input** — amount + description, quick-add form
- **Voice input** — speak naturally ("spent 450 on groceries at BigBazaar"), parsed into structured data via browser Web Speech API (free, no external service)
- Date picker (defaults to today)
- Edit and delete existing entries

### 2. AI-Powered Categorization
- When a user adds an expense, the AI reads the description and assigns a category automatically
- **Default categories**: Food & Dining, Groceries, Transport, Shopping, Bills & Utilities, Entertainment, Health, Education, Subscriptions, Travel, Gifts, Miscellaneous
- Users can override the AI's pick; future categorizations learn from corrections
- Bulk re-categorization if a user changes their mind

### 3. Dashboard & Visualization
- **Monthly overview** — total spent, daily average, comparison to previous month
- **Category breakdown** — donut/pie chart showing where money went
- **Daily spending** — bar chart of spend per day in the current month
- **Trend line** — month-over-month total spending across the last 6–12 months
- **Top expenses** — list of biggest individual spends in the month
- Filter by date range, category

### 4. Monthly Summary (30th of each month)
- Auto-generated summary card on the dashboard
- Total spent, category-wise breakdown, top 3 categories
- Comparison with previous month (↑/↓ with percentage)
- Biggest single expense
- Number of transactions

### 5. AI-Powered Saving Tips
- Personalized tips based on the user's actual spending patterns
- Examples: "You spent 35% more on dining out this month — cooking twice a week could save ~₹2,000"
- Triggered on demand from the dashboard or included in the monthly summary
- Contextual to the user's data, not generic advice

### 6. Authentication & Multi-User
- Simple email + password auth (Supabase Auth)
- Each user sees only their own data
- No admin panel needed — direct Supabase dashboard for management
- Invite-only: pre-create accounts for 2–3 friends

---

## Architecture

```
┌──────────────────────────────────────────────┐
│              Vercel (Free Tier)               │
│                                              │
│  ┌────────────────────────────────────────┐  │
│  │       Next.js 15 App (Frontend)        │  │
│  │  • React 19 + TypeScript               │  │
│  │  • Tailwind CSS + shadcn/ui            │  │
│  │  • Recharts (visualizations)           │  │
│  │  • Web Speech API (voice input)        │  │
│  └────────────────────────────────────────┘  │
│                                              │
│  ┌────────────────────────────────────────┐  │
│  │    Next.js API Routes (Backend)        │  │
│  │  • Expense CRUD                        │  │
│  │  • AI categorization endpoint          │  │
│  │  • Monthly summary generation          │  │
│  │  • Spending tips generation            │  │
│  └────────────────────────────────────────┘  │
└──────────────┬───────────────┬───────────────┘
               │               │
               ▼               ▼
  ┌────────────────┐  ┌─────────────────┐
  │   Supabase     │  │  Google Gemini  │
  │  (Free Tier)   │  │  API (Free)     │
  │                │  │                 │
  │  • PostgreSQL  │  │  • Categorize   │
  │  • Auth        │  │  • Tips         │
  │  • Row-Level   │  │  • Parse voice  │
  │    Security    │  │    input        │
  └────────────────┘  └─────────────────┘
```

### Why this stack?

| Choice | Reason |
|--------|--------|
| **Next.js 15** | Full-stack in one project — React frontend + API routes as backend. Deploys to Vercel in one click. |
| **Supabase (Free Tier)** | Managed PostgreSQL + built-in Auth + Row Level Security. Free tier: 500 MB DB, 50K MAU, 5 GB bandwidth — more than enough for 3 users. |
| **Google Gemini API (Free Tier)** | 15 requests/minute, 1M tokens/day on Gemini 2.0 Flash — completely free and more than enough for 2–3 users recording a few expenses daily. |
| **Tailwind + shadcn/ui** | Polished UI with minimal effort. shadcn/ui components are copy-pasted in (not a dependency), so bundle stays small. |
| **Recharts** | Lightweight React charting library, works well with Next.js. |
| **Web Speech API** | Browser-native speech-to-text — no external service, no cost, works offline. |
| **Vercel (Free Tier)** | Automatic deployments from Git, serverless functions, custom domain support, 100 GB bandwidth — all free for hobby projects. |

### Cost Breakdown

| Service | Free Tier Limits | Our Usage (3 users) |
|---------|-----------------|---------------------|
| Vercel | 100 GB bandwidth, 100K serverless invocations/month | < 1 GB, < 5K invocations |
| Supabase | 500 MB DB, 50K MAU, 5 GB bandwidth | < 10 MB, 3 MAU |
| Gemini API | 15 RPM, 1M tokens/day | < 50 requests/day |
| **Total** | — | **$0/month** |

---

## Database Schema

### `expenses`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid (PK) | Auto-generated |
| user_id | uuid (FK → auth.users) | Row Level Security |
| amount | numeric(10,2) | In user's currency |
| description | text | What the expense was for |
| category | text | AI-assigned or manual |
| date | date | When the expense occurred |
| input_method | text | `'manual'` or `'voice'` |
| ai_categorized | boolean | Whether AI assigned the category |
| created_at | timestamptz | Auto-set |
| updated_at | timestamptz | Auto-set on update |

### `monthly_summaries`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid (PK) | Auto-generated |
| user_id | uuid (FK → auth.users) | |
| month | integer | 1–12 |
| year | integer | e.g. 2026 |
| total_spent | numeric(10,2) | |
| category_breakdown | jsonb | `{"Food": 3200, "Transport": 1500, ...}` |
| top_expenses | jsonb | Array of top 5 expenses |
| tips | text[] | AI-generated tips for this month |
| comparison | jsonb | `{"prev_total": 15000, "change_pct": 12.5}` |
| created_at | timestamptz | |

### Row Level Security
Every table has RLS enabled so each user can only read/write their own rows:
```sql
CREATE POLICY "Users can only access their own expenses"
  ON expenses FOR ALL
  USING (auth.uid() = user_id);
```

---

## Integrations

| Integration | Purpose | Setup Required |
|-------------|---------|---------------|
| **Supabase** | Database + Auth | Create project on supabase.com, get URL + keys |
| **Google Gemini API** | AI categorization + tips | Get API key from ai.google.dev (free) |
| **Vercel** | Hosting + deployment | Connect GitHub repo, auto-deploys |
| **Web Speech API** | Voice input | None — browser built-in |

---

## Environment Variables Required

These are the values you (the user) need to provide:

```env
# ── Supabase ──────────────────────────────────
# Get these from: https://supabase.com → Your Project → Settings → API
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...

# ── Google Gemini API ─────────────────────────
# Get this from: https://ai.google.dev → Get API Key
GEMINI_API_KEY=AIzaSy...
```

| Variable | Public? | Where to get it |
|----------|---------|-----------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes (client-side) | Supabase Dashboard → Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes (client-side, safe with RLS) | Supabase Dashboard → Settings → API → anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | **No** (server-only) | Supabase Dashboard → Settings → API → service_role key |
| `GEMINI_API_KEY` | **No** (server-only) | [ai.google.dev](https://ai.google.dev) → Get API Key |

> **Note**: If you prefer Claude API over Gemini, replace `GEMINI_API_KEY` with `ANTHROPIC_API_KEY` from [console.anthropic.com](https://console.anthropic.com). The AI layer is modular — swap with one config change. Gemini is recommended because its free tier covers this use case completely.

---

## Pages & UI Structure

```
/                   → Landing / redirect to dashboard
/login              → Email + password login
/signup             → Registration (invite-only, can disable later)
/dashboard          → Main dashboard with charts + monthly summary
/expenses           → Full expense list with filters + search
/expenses/add       → Add expense form (manual + voice)
/expenses/[id]/edit → Edit an existing expense
/tips               → AI-generated saving tips
```

---

## Task Sheet

### Phase 1: Project Setup
- [ ] Initialize Next.js 15 project with TypeScript
- [ ] Install and configure Tailwind CSS + shadcn/ui
- [ ] Set up Supabase client library
- [ ] Configure environment variables
- [ ] Set up project folder structure

### Phase 2: Database & Auth
- [ ] Create Supabase project
- [ ] Create `expenses` table with schema above
- [ ] Create `monthly_summaries` table
- [ ] Enable Row Level Security policies
- [ ] Implement sign-up page
- [ ] Implement login page
- [ ] Add auth middleware (protect routes)
- [ ] Session management (auto-refresh tokens)

### Phase 3: Expense CRUD
- [ ] Add expense form (amount, description, date)
- [ ] API route: POST /api/expenses (create)
- [ ] API route: GET /api/expenses (list with filters)
- [ ] API route: PUT /api/expenses/[id] (update)
- [ ] API route: DELETE /api/expenses/[id] (delete)
- [ ] Expense list page with pagination
- [ ] Edit expense page
- [ ] Delete confirmation

### Phase 4: Voice Input
- [ ] Integrate Web Speech API for voice recording
- [ ] Parse spoken text into structured expense (amount + description)
- [ ] Use Gemini to extract amount and description from natural speech
- [ ] Voice input button on add-expense form
- [ ] Visual feedback during recording (waveform/indicator)
- [ ] Fallback message for unsupported browsers

### Phase 5: AI Categorization
- [ ] API route: POST /api/categorize
- [ ] Gemini prompt to classify expense description → category
- [ ] Auto-categorize on expense creation
- [ ] Allow manual category override
- [ ] Store whether category was AI-assigned or manual

### Phase 6: Dashboard & Visualization
- [ ] Dashboard layout with summary cards (total spent, daily avg, transaction count)
- [ ] Donut chart — category breakdown
- [ ] Bar chart — daily spending
- [ ] Trend line — month-over-month totals
- [ ] Top expenses list
- [ ] Date range filter
- [ ] Category filter
- [ ] Responsive design (mobile-friendly)

### Phase 7: Monthly Summary
- [ ] API route: POST /api/summary/generate
- [ ] Logic to aggregate expenses for a given month
- [ ] Compare with previous month
- [ ] Store summary in `monthly_summaries` table
- [ ] Summary card on dashboard (auto-show after 30th)
- [ ] Historical summaries view

### Phase 8: AI-Powered Tips
- [ ] API route: POST /api/tips
- [ ] Gemini prompt with user's spending data → personalized tips
- [ ] Tips section on dashboard
- [ ] Tips included in monthly summary
- [ ] "Refresh tips" button

### Phase 9: Polish & Deploy
- [ ] Loading states and error handling across all pages
- [ ] Empty states (no expenses yet, no summary yet)
- [ ] Toast notifications for actions
- [ ] Dark mode support
- [ ] PWA setup (installable on phone)
- [ ] Connect GitHub repo to Vercel
- [ ] Configure env vars on Vercel
- [ ] Deploy and test
- [ ] Create accounts for friends

---

## Folder Structure

```
expense-tracker/
├── src/
│   ├── app/
│   │   ├── layout.tsx              # Root layout with auth provider
│   │   ├── page.tsx                # Redirect to /dashboard
│   │   ├── login/page.tsx
│   │   ├── signup/page.tsx
│   │   ├── dashboard/page.tsx      # Main dashboard
│   │   ├── expenses/
│   │   │   ├── page.tsx            # Expense list
│   │   │   ├── add/page.tsx        # Add expense
│   │   │   └── [id]/edit/page.tsx  # Edit expense
│   │   ├── tips/page.tsx           # AI tips page
│   │   └── api/
│   │       ├── expenses/route.ts
│   │       ├── categorize/route.ts
│   │       ├── summary/route.ts
│   │       └── tips/route.ts
│   ├── components/
│   │   ├── ui/                     # shadcn/ui components
│   │   ├── expense-form.tsx
│   │   ├── expense-list.tsx
│   │   ├── voice-input.tsx
│   │   ├── category-badge.tsx
│   │   ├── charts/
│   │   │   ├── category-donut.tsx
│   │   │   ├── daily-bar.tsx
│   │   │   └── trend-line.tsx
│   │   ├── dashboard/
│   │   │   ├── summary-cards.tsx
│   │   │   ├── monthly-summary.tsx
│   │   │   └── tips-card.tsx
│   │   └── layout/
│   │       ├── sidebar.tsx
│   │       ├── header.tsx
│   │       └── nav.tsx
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── client.ts           # Browser Supabase client
│   │   │   ├── server.ts           # Server Supabase client
│   │   │   └── middleware.ts       # Auth middleware
│   │   ├── gemini.ts               # Gemini API helper
│   │   └── utils.ts                # Shared utilities
│   ├── hooks/
│   │   ├── use-speech.ts           # Web Speech API hook
│   │   └── use-expenses.ts         # Expense data hook
│   └── types/
│       └── index.ts                # TypeScript types
├── supabase/
│   └── migrations/
│       └── 001_initial_schema.sql  # DB migration
├── public/
│   ├── icons/                      # PWA icons
│   └── manifest.json               # PWA manifest
├── .env.local                      # Local env vars (git-ignored)
├── .env.example                    # Template for env vars
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── package.json
└── PLANNING.md                     # This file
```

---

## Notes & Decisions

- **Currency**: Default to ₹ (INR). Can add a user-preference later if needed.
- **Voice parsing**: The Web Speech API gives raw text. Gemini extracts the amount and description from it (e.g., "spent four fifty on auto" → amount: 450, description: "auto ride").
- **Monthly summary trigger**: Generated on-demand when the user visits the dashboard after the 28th. No cron job needed — avoids serverless scheduling complexity on free tier.
- **AI model**: Gemini 2.0 Flash — fast, capable enough for categorization, and free.
- **No email notifications**: Per user's request. Everything lives on the dashboard.
- **PWA**: Making it installable means users can add it to their phone home screen and use it like a native app — important for quick expense logging on the go.
- **Supabase keep-alive**: `GET /api/keep-alive` pings the database. Set up a free external cron (cron-job.org or UptimeRobot) to hit `https://your-domain.vercel.app/api/keep-alive` every 6 hours to prevent Supabase free-tier pausing after 7 days of inactivity.
