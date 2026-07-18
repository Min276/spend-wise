# Build Prompt — Spendwise (Personal Finance Management App)

> Paste everything below into your AI app builder (Claude, v0, Lovable, Bolt, Replit, Cursor, etc.). Edit any bracketed choice to taste.

---

You are an expert full-stack developer. Build a complete, polished, **single-user personal finance management app called "Spendwise"** for someone based in Thailand. Build it as a **mobile-first Progressive Web App (PWA)** — installable to the home screen, works offline, with a service worker — that I can run and start using immediately. Prioritize clarity, quick data entry, beautiful visual charts, and the exact visual identity described in the Design System section below.

## Ground rules
- **Currency:** Thai Baht (฿) as default, formatted with thousands separators. Support an optional per-account currency (my Wise account can hold multiple currencies) with a simple manual FX-rate field to convert into ฿ for totals.
- **Privacy & persistence:** Fully client-side. Persist ALL data locally (localStorage/IndexedDB or the builder's storage). No backend, no login, nothing leaves my device. Include **Export to JSON** (backup) and **Import from JSON** (restore), plus a **Reset all data** option with confirmation.
- **Everything editable:** Every account, income source, category, fund, budget, and record can be added, renamed, edited, and deleted. Deletes require confirmation.
- **PWA:** Include a web app manifest and service worker so it installs to the home screen (name "Spendwise", the ฿-coin icon from the Design System, theme color `#0D9488`), works offline, and can show notifications (see the Notifications section).
- Seed the app with the accounts, categories, and funds listed below so it's usable from the first second.

## Design System & Visual Identity (apply throughout)
Use this exact system for all colors, type, and shape. Define these as CSS variables (design tokens) and reference them everywhere — no hard-coded colors in components. Support **light and dark mode** by toggling `data-theme="dark"` on `<html>`.

**Brand:** App name **Spendwise** (wordmark: "Spend" in dark teal, "wise" in emerald). App icon: a white circular coin with the **฿** symbol on an emerald→teal gradient rounded square.

**Fonts (Google Fonts):**
- Display / headings / money figures: **Space Grotesk** (500/600/700).
- Body / UI text: **Inter** (400/500/600/700).
- All money amounts use **tabular numerals** (`font-variant-numeric: tabular-nums lining-nums`) so columns align.

**Money semantics (the core rule — one color per kind of money):**
- Income / positive → **emerald** `#059669` (dark: `#34D399`)
- Expense / negative → **red** `#DC2626` (dark: `#F87171`)
- Savings → **indigo** `#4F46E5` (dark: `#818CF8`)
- Custodial / held ("not my money") + budget warnings → **amber** `#D97706` / `#F59E0B` (dark: `#FBBF24`)
- Brand / primary interactive → **teal** `#0D9488` (dark: `#14B8A6`)

**Semantic tokens — light:** bg `#F8FAFC`, surface `#FFFFFF`, sunken `#F1F5F9`, border `#E2E8F0`, text `#0F172A`, text-secondary `#475569`, text-muted `#94A3B8`, primary `#0D9488`, on-primary `#FFFFFF`.
**Semantic tokens — dark:** bg `#060B14`, surface `#0F172A`, sunken `#0B1220`, border `#1E293B`, text `#F8FAFC`, text-secondary `#94A3B8`, primary `#14B8A6`, on-primary `#04211D`.

**Chart / category palette (12 hues, in order):** `#0D9488, #6366F1, #F59E0B, #F43F5E, #10B981, #8B5CF6, #0EA5E9, #F97316, #EC4899, #84CC16, #06B6D4, #A16207`.

**Type scale (rem):** 0.75 / 0.875 / 1 / 1.125 / 1.25 / 1.5 / 1.875 / 2.25 / 3 (hero balance = 3rem, Space Grotesk 700).
**Spacing:** 4px base (4/8/12/16/20/24/32/40/48/64).
**Radius:** inputs/buttons 10–14px, cards 20px, hero/balance card 28px, pills full.
**Shadows:** subtle — cards `0 1px 3px rgba(15,23,42,.08)`, elevated `0 4px 12px rgba(15,23,42,.08)`, overlays `0 12px 32px rgba(15,23,42,.12)`.
**Focus:** visible keyboard focus ring `0 0 0 3px rgba(20,184,166,.45)`. Min tap target 44px. Respect `prefers-reduced-motion`.
**Layout:** mobile-first single column, max content width ~480px, centered on desktop.

**Signature elements:** a gradient (emerald→teal) **balance card** with the ฿-coin, big tabular balance, and per-account chips; category chips as colored dots + label; the custodial/held section tinted amber so it always reads as "handle with care."

## 1. Accounts (where my money lives)
Seed these three, each with an editable name, type, currency, color/icon, and a balance that is **auto-computed from its transactions**:
- **Wise** (my main account)
- **KPlus (KBank)**
- **TrueMoney Wallet**

Let me add/edit/remove accounts. Show each account's balance and a **total net worth** (personal money only — see custodial funds below).

## 2. Income (support multiple sources with custom names)
- Let me create multiple income sources, each with a **custom, editable name** (e.g. Salary, Freelance, Side gig).
- Recording income captures: amount, income source, which account it lands in, date, optional note, and an optional "recurring" flag.

## 3. Spending / Expenses (customizable categories)
Seed these categories (each editable, with icon + color; allow custom subcategories/tags):
Rent · Electricity/Utilities · Daily Meals & Food · Visa Fees · Travel · Fun Activities · Donations · Bay-din / Tarot · Friends-Treats · Mom Medicine Support · Self-Rewarding · Personal / Misc

- Each expense captures: amount, category, account it's paid from, date, optional note.
- Let me add/rename/delete categories freely.

## 4. Savings Funds (goal-based, per purpose)
Seed **Education** and **Visa**, and let me add more. Each fund has:
- Name, optional target amount, current saved amount, optional deadline, linked account.
- Ability to **contribute** to and **withdraw** from a fund, with a progress bar toward the target.
- Savings totals viewable per day / month / year.

## 5. Custodial / Held Funds — money that is NOT mine (IMPORTANT — get this right)
Some money sits in my KPlus (KBank) account but does **not belong to me**. Track it in a **separate area** with its own ledgers, and treat it as a **liability, never as my income or net worth**:

- **Aunt's Funds:** My aunt sends money into my KBank account. Track the total I'm currently holding for her. Let me **add** when she sends more and **reduce** when I transfer money back to her. Keep a full timestamped history of every add/reduce.
- **Other People's Funds:** Multiple **named people** park money in my KBank short-term. Track per person: how much of theirs I currently hold, add/reduce entries, and a full history. Show who I owe and how much.

**Accounting rules (must implement exactly):**
- Held funds are excluded from my income, my spendable balance, and my net worth.
- **My real spendable KBank balance = raw KBank balance − aunt's held funds − all other people's held funds.**
- The dashboard must reconcile this clearly, e.g.:
  `Raw KBank ฿X − Aunt ฿A − Others ฿B = My money in KBank ฿(X−A−B)`
- Never lose history. Every add/reduce is a permanent, timestamped, editable record.
- Show a summary line: "You are holding ฿A for Aunt and ฿B for others (N people). Total to return: ฿(A+B)."

## 6. Budgets, Limits & Alerts
- Let me set a **daily spending limit** and a **monthly budget** (overall, and optionally per category).
- Live tracking: **today's spend vs daily limit** and **month-to-date vs monthly budget**, with remaining allowance shown.
- **In-app alerts (always on, no permissions needed):** color warning when approaching a limit (e.g. ≥80%) and a clear banner when a limit is exceeded. These fire instantly whenever I add a transaction that crosses a threshold.

## 6a. Notifications & Reminders
Add push/scheduled notifications for spending alerts and reminders. Implement the **best available method and degrade gracefully**:
1. **In-app alerts** — always work (see above); the baseline.
2. **Local scheduled notifications** via the Notifications API + service worker while the app is installed — use these for the reminder schedule below.
3. **Background push** (fires when the app is closed) — if a lightweight push setup (service worker + Web Push/VAPID) is feasible, include it; on iOS this requires the PWA be installed to the home screen (iOS 16.4+). If a backend isn't feasible, implement it as local scheduled/alarm-style notifications and clearly note the limitation.
- Ask for notification permission at the right moment (not on first load — after I set my first budget), and add a **Notifications settings screen** where every reminder below can be toggled on/off and its time edited.

**Reminder schedule (defaults — all editable in settings):**
- **Daily + monthly budget summary — twice a day:** a **morning brief (~9:00 AM)** and an **evening summary (~9:00 PM)**, each showing today's spend vs daily limit *and* month-to-date vs monthly budget, with remaining allowance.
- **Daily spending check-ins — four times a day:** short "how's today's spending?" nudges at **09:00 (morning), 15:00 (afternoon), 18:00 (evening), and 22:00 (night)**. Each shows today's total spent, the daily limit, and remaining. Make the **night time configurable** (10:00 PM / 12:00 AM / 1:00 AM options).
- **Threshold alerts (event-based, not scheduled):** notify immediately when I hit ~80% of the daily limit, exceed the daily limit, hit ~80% of the monthly budget, and exceed the monthly budget.
- Each notification is dismissible, opens the app to the relevant screen when tapped, and never fires duplicates for the same event on the same day.

## 7. Dashboard (home screen)
Show at a glance:
- Total **net worth** (personal money only, held funds excluded) and each account's balance.
- **Today / This Month / This Year** totals for income, spending, and savings.
- **Budget status** (daily + monthly) with progress bars and alerts.
- **Held-funds summary** (aunt + others) and the KBank reconciliation line.
- Recent transactions with a always-visible **quick "Add" button**.

## 8. Reports & Visual Charts
A reports screen with a **Day / Month / Year** toggle plus a custom date range, and filters by account, category, and person. Include:
- **Spending by category** — pie/donut.
- **Spending over time** — bar/line, per day / month / year.
- **Income over time** — bar/line.
- **Income vs Spending** — comparison chart.
- **Savings growth** over time — total and per fund.
- **Account balance trends** over time.
- Highlights: top spending categories and biggest individual expenses for the selected period.

## 9. Transactions Ledger
A full, searchable, sortable, filterable list of **every record**: income, expense, transfer, savings contribution/withdrawal, and held-fund add/reduce. Filter by type, account, category, person, and date. Any record can be edited or deleted.
- Support **transfers between my own accounts** (e.g. Wise → KBank) that move balances **without** counting as income or expense.

## 10. UX & polish
- Modern, clean, mobile-first, fast. Light **and** dark mode per the Design System, with a theme toggle.
- Fast add-transaction flow (few taps), sensible defaults (today's date, last-used account).
- Empty states with guidance, confirmations on destructive actions, ฿ formatting everywhere.
- Keep the whole thing self-contained so I can run it right away.

**Deliver a single, runnable, installable PWA — styled exactly per the Design System, pre-seeded with the accounts, categories, and funds above, and wired with the in-app alerts, scheduled reminders, and notification settings described in section 6a.**
