import axios from "axios";

const MESHY_BASE = "https://api.meshy.ai/openapi/v2";

function headers() {
  return { Authorization: `Bearer ${process.env.MESHY_API_KEY}` };
}

export type MeshyQuality = "draft" | "standard" | "high" | "ultra";

export function qualityToMeshy(q: string): MeshyQuality {
  const map: Record<string, MeshyQuality> = {
    fast: "draft",
    standard: "standard",
    high: "high",
    ultra: "ultra",
  };
  return map[q] ?? "standard";
}

export interface MeshyPreviewTask {
  result: string; // task id
}

export interface MeshyTask {
  id: string;
  status: "PENDING" | "IN_PROGRESS" | "SUCCEEDED" | "FAILED" | "EXPIRED";
  progress: number;
  model_urls?: {
    glb?: string;
    fbx?: string;
    obj?: string;
    mtl?: string;
    usdz?: string;
  };
  thumbnail_url?: string;
  started_at?: number;
  created_at?: number;
  finished_at?: number;
  task_error?: { message: string };
}

export interface MeshyTextPreviewTask {
  result: string;
}

export interface MeshyImagePreviewTask {
  result: string;
}

// Text → 3D: step 1 — preview task
export async function createTextTo3DPreview(
  prompt: string,
  artStyle: string = "realistic",
): Promise<string> {
  const res = await axios.post<MeshyTextPreviewTask>(
    `${MESHY_BASE}/text-to-3d`,
    { mode: "preview", prompt, art_style: artStyle, should_remesh: true },
    { headers: headers() },
  );
  return res.data.result;
}

// Text → 3D: step 2 — refine/finalize from preview
export async function createTextTo3DRefine(
  previewTaskId: string,
  quality: MeshyQuality = "standard",
): Promise<string> {
  const textureRichness = quality === "ultra" ? "ultra" : quality === "high" ? "high" : "medium";
  const res = await axios.post<MeshyTextPreviewTask>(
    `${MESHY_BASE}/text-to-3d`,
    { mode: "refine", preview_task_id: previewTaskId, texture_richness: textureRichness },
    { headers: headers() },
  );
  return res.data.result;
}

// Image → 3D
export async function createImageTo3D(
  imageUrl: string,
  quality: MeshyQuality = "standard",
): Promise<string> {
  const res = await axios.post<MeshyImagePreviewTask>(
    `${MESHY_BASE}/image-to-3d`,
    {
      image_url: imageUrl,
      should_remesh: true,
      enable_pbr: quality === "high" || quality === "ultra",
    },
    { headers: headers() },
  );
  return res.data.result;
}

// Poll task status
export async function getTask(taskId: string): Promise<MeshyTask> {
  const res = await axios.get<MeshyTask>(`${MESHY_BASE}/text-to-3d/${taskId}`, {
    headers: headers(),
  });
  return res.data;
}

export async function getImageTask(taskId: string): Promise<MeshyTask> {
  const res = await axios.get<MeshyTask>(`${MESHY_BASE}/image-to-3d/${taskId}`, {
    headers: headers(),
  });
  return res.data;
}
