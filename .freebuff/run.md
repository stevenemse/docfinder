# Run doc — DocFinder (Vite dev server)

## Reproduce the artifacts (fresh checkout)

1. Dependencies are committed-adjacent via `package-lock.json` → install with npm:
   ```bash
   npm install
   ```
2. No uncommitted env files are needed for demo mode: `.env.local` does not exist on purpose.
   The app runs in demo mode (localStorage + seed data). To connect a real Supabase project,
   copy `.env.example` to `.env.local` and fill `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`.

## Run the server

```bash
npm run dev
```

- Default port **5173** (Vite default), free at startup → kept.
- Started detached via PowerShell with stdout/stderr redirected separately:
  - stdout: `.freebuff/preview-8e85273c-7be0-4b98-9114-1ed6a6b01240.log`
  - stderr: `.freebuff/preview-8e85273c-7be0-4b98-9114-1ed6a6b01240.log.err`
- Working dir: `C:\Users\JOUVENCE COMPUTER\Desktop\App\docfinder` (this workspace = main checkout).
