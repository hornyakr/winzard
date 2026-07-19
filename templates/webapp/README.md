# Webapp template

A `webapp` profil a minimal alkalmazás `presentation-contract` szerződésére opcionális Prisma/PostgreSQL és database readiness képességet telepít. Auth nincs benne; az külön recipe.

```bash
pnpm forge view:check
pnpm forge view:assets --check
pnpm forge make:view catalog/product/product-card --dry-run
```
