import axios from "axios";

const GENAPI_BASE = "https://api.gen-api.ru/api/v1";

function getApiKey(): string {
  const raw = process.env.MESHY_API_KEY ?? "";
  const match = raw.match(/sk-[A-Za-z0-9]+/);
  return match ? match[0] : raw.trim();
}

function headers() {
  return {
    Authorization: `Bearer ${getApiKey()}`,
    "Content-Type": "application/json",
  };
}

export type GenApiStatus = "queued" | "processing" | "completed" | "failed" | "error";

export interface GenApiRequest {
  id: string;
  status: GenApiStatus;
  output?: Record<string, unknown> | string[] | string;
  error?: string;
  progress?: number;
}

// Step 1 for text-to-3D: generate a 2D image from text using Flux
export async function generateImageFromText(prompt: string): Promise<string> {
  const res = await axios.post<{ id: string; status: string }>(
    `${GENAPI_BASE}/networks/flux-1-schnell`,
    {
      input: {
        prompt: `${prompt}, high quality, white background, centered, 3D product render style`,
        width: 1024,
        height: 1024,
        num_inference_steps: 4,
        guidance_scale: 3.5,
      },
    },
    { headers: headers() },
  );
  return res.data.id;
}

// Step 2 for text-to-3D (and only step for image-to-3D): Hunyuan 3D
export async function createHunyuan3D(imageUrl: string): Promise<string> {
  const res = await axios.post<{ id: string; status: string }>(
    `${GENAPI_BASE}/networks/hunyuan-3d`,
    {
      input: {
        input_image_url: imageUrl,
        steps: 50,
        octree_resolution: 256,
        num_chunks: 8000,
        randomize_seed: true,
        seed: 0,
        remove_background: true,
        foreground_ratio: 0.85,
        mc_algo: "mc",
        export_format: "glb",
      },
    },
    { headers: headers() },
  );
  return res.data.id;
}

// Poll any GenAPI request
export async function getRequest(requestId: string): Promise<GenApiRequest> {
  const res = await axios.get<GenApiRequest>(
    `${GENAPI_BASE}/requests/${requestId}`,
    { headers: headers() },
  );
  return res.data;
}

// Extract image URL from a completed text-to-image request
export function extractImageUrl(output: GenApiRequest["output"]): string | undefined {
  if (!output) return undefined;
  if (typeof output === "string" && output.startsWith("http")) return output;
  if (Array.isArray(output)) {
    for (const v of output) {
      if (typeof v === "string" && v.startsWith("http")) return v;
    }
  }
  if (typeof output === "object" && !Array.isArray(output)) {
    for (const v of Object.values(output)) {
      if (typeof v === "string" && v.startsWith("http")) return v;
    }
  }
  return undefined;
}

// Extract GLB URL from a completed Hunyuan 3D request
export function extractGlbUrl(output: GenApiRequest["output"]): string | undefined {
  if (!output) return undefined;
  if (typeof output === "string" && (output.includes(".glb") || output.startsWith("http"))) return output;
  if (Array.isArray(output)) {
    for (const v of output) {
      if (typeof v === "string" && (v.includes(".glb") || v.startsWith("http"))) return v;
    }
  }
  if (typeof output === "object" && !Array.isArray(output)) {
    const obj = output as Record<string, unknown>;
    for (const key of ["glb", "model", "model_url", "output"]) {
      if (typeof obj[key] === "string") return obj[key] as string;
    }
    for (const v of Object.values(obj)) {
      if (typeof v === "string" && v.startsWith("http")) return v;
    }
  }
  return undefined;
}

export function extractThumbnailUrl(output: GenApiRequest["output"]): string | undefined {
  if (!output || typeof output !== "object" || Array.isArray(output)) return undefined;
  const obj = output as Record<string, unknown>;
  for (const key of ["thumbnail", "preview", "image"]) {
    if (typeof obj[key] === "string") return obj[key] as string;
  }
  return undefined;
}
