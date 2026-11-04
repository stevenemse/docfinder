# Run doc — DocFinder (Vite dev server)

## Reproduce the artifacts (fresh checkout)

1. Install dependencies with npm (lockfile committed):
   ```bash
   npm install
   ```
2. `.env.local` exists in the MAIN checkout (`C:\Users\JOUVENCE COMPUTER\Desktop\App\docfinder\.env.local`)
   and contains the LIVE Supabase credentials (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
   plus `VITE_` aliases). COPY it from the main checkout into the workspace root — never commit it,
   never symlink it. Without it the app silently falls back to demo mode (localStorage seed data).
3. Database: schema lives in `supabase/schema.sql`; one-off idempotent migrations in `supabase/migration-*.sql`
   (each is meant to be pasted once into the Supabase SQL Editor when noted).

## Run the server

```bash
npm run dev
```

- Default port **5173** (Vite default), kept when free; otherwise adapt flags.
- Started detached via PowerShell (this workspace = main checkout):
  - stdout: `.freebuff/preview-8e85273c-7be0-4b98-9114-1ed6a6b01240.log`
  - stderr: `.freebuff/preview-8e85273c-7be0-4b98-9114-1ed6a6b01240.log.err`
- Working dir: `C:\Users\JOUVENCE COMPUTER\Desktop\App\docfinder`.
- Production: push to `main` → Vercel auto-deploys https://docfinder-cm.vercel.app.
