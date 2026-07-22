# Winzard Contracts teljes forrásspecifikáció

A GitHubon közvetlenül olvasható `../winzard-contracts.md` az implementációs állapotot és a bevezetett contract-governance felületet dokumentálja.

Az alapul szolgáló, 3726 soros teljes specifikáció tömörített, byte-pontos forrása négy Base64-részben található ebben a könyvtárban. Rekonstrukció:

```bash
cat winzard-contracts.md.xz.part-*.b64 \
  | base64 --decode \
  > winzard-contracts.md.xz
xz -dc winzard-contracts.md.xz > winzard-contracts.md
sha256sum winzard-contracts.md.xz winzard-contracts.md
```

Elvárt Markdown SHA-256:

```text
b1e88bad9ffa4b4d73112b0b4c054868018ddc2f17e624b8ce360e2e708233b9
```

Elvárt összeillesztett XZ SHA-256:

```text
f625c41b4a71c81cca8bfdd89ac7e73db16a7bec2a9cf4e2704c01bbdb4d992a
```

A részek sorrendje lexikografikus. Egyik rész sem értelmezhető önálló archívumként.
