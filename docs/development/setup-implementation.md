# Setup implementáció

A kezdeti setup baseline-ból kiderült, hogy a gyökéralkalmazás túl korán tette kötelezővé a Prisma/PostgreSQL és auth konfigurációt.

Az [ADR-0001](../adr/0001-product-boundaries-and-capabilities.md) alapján a repository most három részre válik:

- `packages/forge`: fejlesztői eszköz és capability-aware szabálymotor;
- `templates`: kihúzható minimal és webapp profilok;
- `apps/reference`: futtatható golden reference.

A root build adatbázis-független. A PostgreSQL-, Prisma- és database readiness fájlok a webapp template és a hozzájuk tartozó recipe határában találhatók. Az auth secret csak az authentication recipe saját szerződése.

A `create-winzard`, a resource-generátor, a teljes recipe resolver és a drift engine külön későbbi mérföldkő.
