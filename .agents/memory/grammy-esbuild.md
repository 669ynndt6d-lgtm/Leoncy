---
name: grammY esbuild externalize
description: grammy must be externalized in esbuild or platform.node native module fails
---

grammy loads `platform.node` dynamically at runtime via require(). When bundled by esbuild this path breaks.

**Why:** esbuild inlines grammy but can't resolve its dynamic native-module loading.

**How to apply:** Always keep `"grammy"` and `"grammy-i18n"` in the `external` array in `build.mjs`.
