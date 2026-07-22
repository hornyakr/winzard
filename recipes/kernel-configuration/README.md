# Kernel-configuration recipe

A recipe a projekt-, build-, deployment-, runtime-, locale-, host-, proxy-, cache- és secret-határokat explicit, típusos contractként telepíti. Nem hoz létre globális ParameterBaget vagy második HTTP-kernelt.

## Invariánsok

- a buildkönyvtár az alkalmazásgyökéren belül marad;
- release build stabil build-, deployment- és `SOURCE_DATE_EPOCH` inputot igényel;
- a web, CLI és worker entrypoint explicit;
- a Host és forwardolt header csak ellenőrzött trust boundary után használható;
- a runtime írható könyvtár az immutable artifacton kívül van;
- a diagnostics secretet, secret-hosszt és secret-fingerprintet nem jelenít meg.

## Ellenőrzés

```bash
pnpm forge kernel-config:check --project .
pnpm forge runtime:check --project .
pnpm forge proxy:trust --project .
pnpm forge locale:check --project .
pnpm forge kernel-config:docs --check --project .
```
