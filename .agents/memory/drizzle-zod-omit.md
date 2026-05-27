---
name: drizzle-zod v4 omit incompatibility
description: createInsertSchema omit() rejects 'id' key in zod/v4 — use without omit
---

In drizzle-zod with zod/v4, calling createInsertSchema(table).omit({ id: true }) throws "Unrecognized key: id".

**Why:** The zod/v4 omit() validates known keys strictly; 'id' on a generatedAlwaysAsIdentity column is not in the insert shape.

**How to apply:** Use createInsertSchema(table) without .omit() — drizzle-zod already excludes generated columns from insert schemas.
