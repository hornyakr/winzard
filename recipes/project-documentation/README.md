# Project documentation recipe

Telepíti a kitelepített Winzard-alkalmazás saját, Git-verziózott Project Vault szerződését. A recipe nem másolja ki a Winzard alaprendszer belső dokumentációját; kizárólag a publikus consumer contract kerül a `docs/80-winzard` könyvtárba.

```bash
pnpm forge docs:init --prefix=ATLAS
pnpm forge docs:check
```
