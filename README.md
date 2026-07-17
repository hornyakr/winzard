# Winzard

Next.js App Router fölé épített, konvencióvezérelt alkalmazásplatform.

## Első indítás

```bash
corepack enable
corepack install
pnpm install --frozen-lockfile
cp .env.example .env
docker compose up -d postgres
pnpm db:generate
pnpm db:migrate:deploy
pnpm forge doctor
pnpm dev
```

Részletes leírás: [setup dokumentáció](docs/public_documentation/winzard-setup.md).
