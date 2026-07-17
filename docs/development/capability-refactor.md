# Capability refaktor implementáció

## Eredmény

- a reference app az `apps/reference` alá került;
- a Forge forrás és tesztek a `packages/forge` alá kerültek;
- az általános app env parser a `packages/config` alá került, és nem parse-ol modulbetöltéskor;
- a root `build` nem futtat Prisma-generálást;
- a root `verify` a database-független core ellenőrzést jelenti;
- a `verify:database` külön PostgreSQL-profilt ellenőriz;
- a Forge a `winzard.json` vagy `package.json#winzard` capability manifestből dolgozik;
- Prisma, database readiness és auth csak saját template/recipe határban létezik.

## Nem készül el ebben a refaktorban

- a Forge npm publikálása;
- template materializer;
- recipe dependency resolver;
- template–recipe drift engine;
- auth runtime implementáció.
