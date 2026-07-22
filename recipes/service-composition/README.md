# service-composition

Installs the explicit Winzard service-composition contract: typed definition
files, generated graph artifacts, startup validation and Forge diagnostics.

The recipe does not install a runtime service locator or reflection container.
After installation run:

```bash
pnpm forge composition:generate --project .
pnpm forge composition:docs --project .
pnpm forge composition:check --project .
```
