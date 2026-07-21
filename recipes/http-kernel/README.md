# HTTP-kernel recipe

A recipe nem épít második HTTP-szervert vagy runtime routert. A Next.js App Router marad a hálózati és rendering source of truth; a recipe az explicit delivery contractot, RequestContext-factoryt, Route Handler lifecycle wrappert, response-policyt, Problem Details mappinget, instrumentation hookot és Forge evidence-et telepíti.

## Kötelező invariánsok

- minden Page, Route Handler és Server Action adjacent contractot kap;
- a nyers request input a delivery határon marad;
- az application művelet explicit `ApplicationContext` értéket kap;
- a belső `x-winzard-*` headereket a Proxy törli és újraképezi;
- a body limit és az abort cleanup a lifecycle része;
- a response policy stream commit előtt fut;
- `after()` csak best-effort telemetryt vagy elveszíthető utómunkát végez;
- név szerinti rate-limit policy csak explicit `RateLimitExecutor` adapterrel, required idempotencia pedig csak explicit durable executorral engedélyezett.

## Ellenőrzés

```bash
pnpm forge kernel:graph --project .
pnpm forge kernel:check --project .
pnpm forge request-context:check --project .
pnpm forge response-policy:check --project .
pnpm forge instrumentation:check --project .
pnpm forge lifecycle:docs --check --project .
```
