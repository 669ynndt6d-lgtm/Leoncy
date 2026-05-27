---
name: Meshy text-to-3D two-stage pipeline
description: Meshy text-to-3D requires preview task first, then a separate refine task
---

The Meshy API text-to-3D flow is two stages:
1. POST /v2/text-to-3d with mode:"preview" → get preview task ID
2. Poll until SUCCEEDED
3. POST /v2/text-to-3d with mode:"refine" + preview_task_id → get refine task ID
4. Poll until SUCCEEDED — refine task has the final model_urls

**Why:** Meshy separates low-poly preview from high-quality refinement.

**How to apply:** Never try to get model_urls from the preview task; always run refine step first.
