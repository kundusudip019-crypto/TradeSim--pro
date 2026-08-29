# TradeSim Pro — Separate User + Admin Sites

## Included
- `USER_SITE/` — public/demo trading website: landing, login/register, dashboard, 5-minute demo trading, animated charts, history, wallet, offers, referral, settings, PWA.
- `ADMIN_SITE/` — separate admin website: admin login + dashboard, users/wallet, trades, offers, settings.
- Both sites use the same existing Firebase project/config and Firestore collections.

## Hosting
Recommended: deploy the two folders as two separate sites/subdomains.
- User: `https://your-domain.example/` → contents of `USER_SITE/`
- Admin: `https://admin.your-domain.example/` → contents of `ADMIN_SITE/`

For a single static host, keep them as separate folders and do not expose `ADMIN_SITE` through the user navigation.

## Firebase
The existing Firebase project configuration is preserved. Deploy the existing `USER_SITE/firebase/firestore.rules` to the same Firebase project if needed.

## Demo-only
The trading outcome system is for virtual/demo credits only.
