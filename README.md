# Spendwise

Personal finance PWA for Thailand — spending, budgets, savings funds, and custodial money you hold for others. Fully client-side: all data lives in your browser's localStorage, nothing leaves the device. Built from the spec in `finance-app-build-prompt.md`.

## Run

```sh
pnpm install
pnpm dev        # develop
pnpm build      # type-check + production build to dist/
pnpm preview    # serve dist/ at http://localhost:4173
pnpm check      # money / assistant / crypto / currency / reminders self-checks (plain node)
```

Install to your phone: serve `dist/` over HTTPS (or localhost), open in the browser, "Add to Home Screen". Offline works via the service worker after the first load.

## Notes

- **Balances are derived** — every account balance folds the transaction ledger; there is no stored balance to drift.
- **Held funds** (Aunt & others) raise an account's raw balance and a matching liability; net worth and income always exclude them. `Spendable = raw − held`.
- **Savings funds are earmarks** — contributing doesn't change net worth (it's still your money).
- **Debts & loans** (`borrow`/`repay`/`lend`/`collect`) — borrowed cash is subtracted from "My money" like held money; lent cash shows as "owed to me" until it comes back. Parties share the People list.
- **Currency** — ฿ is the internal base for every total. Settings → Currency picks the display currency (THB/USD/VND/MMK) and edits three base rates (`1 USD = 33 THB`, `1 THB = 770 VND`, `1 THB = 133 MMK`); cross rates derive from those so conversions never disagree. The add sheet can take an amount in another currency and stores the converted value plus the original.
- **Notifications** are system notifications only (no in-app toasts). Budget alerts fire from the device when an entry crosses a limit. Scheduled reminders arrive as real **Web Push** even when the app is closed — see below. Without push (not signed in / not configured) they fire while the app is open.
- Backup/restore: Settings → Data → Export/Import JSON.

## Push notifications (closed-app reminders)

The device subscribes via the service worker; a tiny Vercel function (`api/push-tick.ts`) is pinged every 5 minutes by Supabase `pg_cron` and pushes `{reminderId, date}` to each device whose local time matches its schedule. The service worker then writes the notification text from the data snapshot on the device (`spendwise-data` cache) — the server never sees the ledger, only endpoint/keys/timezone/times. One-time setup:

1. **Vercel → Settings → Environment Variables** (values are in `.env.local`, generated locally):
   `VITE_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `PUSH_TICK_SECRET`, plus `SUPABASE_SERVICE_ROLE_KEY` (Supabase → Project Settings → API). `VITE_SUPABASE_URL` is reused. Redeploy.
2. **Supabase → SQL Editor**: run `supabase/push.sql` after replacing the deployment URL and `<PUSH_TICK_SECRET>`. It creates `push_subscriptions` (RLS) and the 5-minute cron.
3. In the app: sign in (Settings → Cloud sync), then Settings → Notifications → **Enable push notifications**. On iPhone the app must be added to the Home Screen first (iOS 16.4+).

Sanity check: open `https://<deployment>/api/push-tick` with the `Authorization: Bearer <secret>` header — it returns `{devices, sent, pruned, failed}`.

Icon source: `public/icons/icon.svg` — regenerate PNGs with `sharp` if you change it (192/512/180).
