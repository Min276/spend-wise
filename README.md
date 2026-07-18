# Spendwise

Personal finance PWA for Thailand — spending, budgets, savings funds, and custodial money you hold for others. Fully client-side: all data lives in your browser's localStorage, nothing leaves the device. Built from the spec in `finance-app-build-prompt.md`.

## Run

```sh
pnpm install
pnpm dev        # develop
pnpm build      # type-check + production build to dist/
pnpm preview    # serve dist/ at http://localhost:4173
pnpm check      # money-math self-check (plain node, no framework)
```

Install to your phone: serve `dist/` over HTTPS (or localhost), open in the browser, "Add to Home Screen". Offline works via the service worker after the first load.

## Notes

- **Balances are derived** — every account balance folds the transaction ledger; there is no stored balance to drift.
- **Held funds** (Aunt & others) raise an account's raw balance and a matching liability; net worth and income always exclude them. `Spendable = raw − held`.
- **Savings funds are earmarks** — contributing doesn't change net worth (it's still your money).
- **Notifications**: in-app alerts always work. System notifications need permission (asked after you set your first budget). There is no backend, so reminders fire while the app is open/backgrounded — true closed-app push is impossible by design (privacy).
- Backup/restore: Settings → Data → Export/Import JSON.

Icon source: `public/icons/icon.svg` — regenerate PNGs with `sharp` if you change it (192/512/180).
