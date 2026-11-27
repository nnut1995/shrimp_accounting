# Moving the database and server from Seoul to Singapore

Why: users are in Thailand. Each page or save goes browser → Vercel edge
(Singapore) → function (Seoul, `icn1`) → database (Seoul). Moving both the
function and the database to Singapore removes the Singapore↔Seoul trip
(about 0.07 s on every page and save). They must move **together**: a
Singapore function talking to a Seoul database would be slower than today.

Supabase cannot change a project's region, so this means a new project plus a
copy. The old project is only read and stays as a backup.

## Before the switch (no downtime)

1. In Supabase, create a new project in **Southeast Asia (Singapore),
   ap-southeast-1**. Use the same plan as the old one.
2. In the new project, copy any Auth settings you changed in the old one
   (Authentication → URL Configuration: Site URL
   `https://shrimp-accounting.vercel.app`; sign-ups setting; email templates).
3. On your computer, install the tools:
   `brew install supabase/tap/supabase libpq` and
   `export PATH="$(brew --prefix libpq)/bin:$PATH"`.
4. In each project, open **Connect** and copy the **Session pooler** connection
   string (with the database password filled in). Keep them private; don't
   paste them in chat.

## Switch-over (about 10–15 minutes; nobody saves anything)

1. Stop the Discord bot (`pm2 stop shrimp-discord-bot`) so it doesn't write.
2. Run `scripts/move-db/copy-to-new-project.sh` and paste the two connection
   strings when asked. It refuses to run into a non-empty project, copies
   everything in one transaction, then compares row counts per table
   (including logins). It must end with `OK`.
3. In Vercel → Project → Settings → Environment Variables (Production and
   Preview), replace `NEXT_PUBLIC_SUPABASE_URL` and
   `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` with the new project's values
   (Supabase → Project Settings → API Keys).
4. Merge the one-line change `vercel.json` → `"regions": ["sin1"]`. That
   deploy picks up the new variables. (Variables starting with `NEXT_PUBLIC_`
   are baked in at build time, so a fresh deploy is required either way.)
5. Sign in again (same email and password). Check the lot list, a lot page and
   the monthly totals against the old site's numbers.
6. Update your local `.env.local`, re-run `npm run discord:setup` (or edit the
   bot's saved Supabase URL/key), then `pm2 start shrimp-discord-bot`.

## Rollback

Until you're happy, nothing is lost: put the old URL/key back in Vercel,
revert `vercel.json` to `icn1` and redeploy. Anything saved in the new project
after the switch would need to be re-entered in the old one, so decide within
a day or so. Pause or delete the Seoul project only after a few days of normal
use.
