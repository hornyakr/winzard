# Authentication recipe

Az auth környezeti szerződés kizárólag az `authentication` capability telepítésekor kerül a projektbe.

## Tulajdonolt konfiguráció

| Kulcs | Kötelező | Fázis | Besorolás | Validáció |
| --- | --- | --- | --- | --- |
| `AUTH_SECRET` | igen | process-start | secret | legalább 32 karakter, ismert placeholder és alacsony diverzitás tiltott |

A recipe `server-only` parserrel, explicit startup-validációval és Forge metadata-contracttal települ. Nincs development fallback; hiányzó vagy gyenge secret esetén az alkalmazás fail-closed módon nem indul el.

Ellenőrzés:

```bash
pnpm forge env:check
pnpm forge config:inspect AUTH_SECRET
pnpm forge secrets:check
```

A diagnosztika csak jelenlétet, validációs státuszt és redaktált fingerprintet jeleníthet meg.
