# Minimal template

A `minimal` profil Next.js App Routert, Forge-kompatibilis manifestet, valamint `kernel-configuration`, `http-kernel` és `presentation-contract` capability-t tartalmaz. Nem telepít Prisma-, PostgreSQL- vagy auth-függőséget.

## Konfiguráció

A verziózott `.env.example` a telepített capability-k teljes, secretmentes kulcsinventára. Lokális fejlesztéshez:

```bash
cp .env.example .env.local
pnpm forge env:check
pnpm forge config:list
pnpm forge config:reference --check
pnpm forge config:drift
```

Az `APP_URL`, `APP_NAME`, `APP_STAGE` és `LOG_LEVEL` process-start konfiguráció. A `NEXT_PUBLIC_APP_NAME` publikus build input; módosítása új buildet igényel. A process indulásakor az `instrumentation.ts` fail-fast ellenőrzi az aktív szerverkonfigurációt.

## Kernel configuration contract

```bash
pnpm forge kernel-config:list
pnpm forge kernel-config:check
pnpm forge runtime:check --runtime-mode web
pnpm forge proxy:trust
pnpm forge locale:check
pnpm forge kernel-config:docs --check
```

A build- és deployment-identitás, a canonical origin, a Host/proxy trust, a locale-lista és a runtime írható tér explicit, fail-closed szerződés.

## Presentation contract

```bash
pnpm forge view:list
pnpm forge view:check
pnpm forge make:view catalog/product/product-card --dry-run
```

## HTTP-kernel contract

```bash
pnpm forge kernel:graph
pnpm forge kernel:check
pnpm forge lifecycle:docs --check
pnpm test
```

A template Proxy request-ID bridge-et, immutable RequestContextet, typed delivery contractot és redaktált instrumentation hookot tartalmaz.
