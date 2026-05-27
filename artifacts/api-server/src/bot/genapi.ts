import axios from "axios";

const GENAPI_BASE = "https://api.gen-api.ru/api/v1";

function headers() {
  return {
    Authorization: `Bearer ${process.env.MESHY_API_KEY}`,
    "Content-Type": "application/json",
  };
}

export type GenApiStatus = "queued" | "processing" | "completed" | "failed" | "error";

export interface GenApiRequest {
  id: string;
  status: GenApiStatus;
  output?: Record<string, unknown>;
  error?: string;
  progress?: number;
}

// Create a text-to-3D request via GenAPI Hunyuan 3D
export async function createTextTo3D(
  prompt: string,
): Promise<string> {
  const res = await axios.post<{ id: string; status: string }>(
    `${GENAPI_BASE}/networks/hunyuan-3d`,
    {
      input: {
        prompt,
        steps: 50,
        guidance_scale: 7.5,
        octree_resolution: 256,
        num_chunks: 8000,
        randomize_seed: true,
        seed: 0,
        remove_background: true,
        foreground_ratio: 0.85,
        mc_algo: "mc",
        export_format: "glb",
        geometry_type: "birefnet",
      },
    },
    { headers: headers() },
  );
  return res.data.id;
}

// Create an image-to-3D request via GenAPI Hunyuan 3D
export async function createImageTo3D(
  imageUrl: string,
): Promise<string> {
  const res = await axios.post<{ id: string; status: string }>(
    `${GENAPI_BASE}/networks/hunyuan-3d`,
    {
      input: {
        image: imageUrl,
        steps: 50,
        octree_resolution: 256,
        num_chunks: 8000,
        randomize_seed: true,
        seed: 0,
        remove_background: true,
        foreground_ratio: 0.85,
        mc_algo: "mc",
        export_format: "glb",
        geometry_type: "birefnet",
      },
    },
    { headers: headers() },
  );
  return res.data.id;
}

// Poll request status
export async function getRequest(requestId: string): Promise<GenApiRequest> {
  const res = await axios.get<GenApiRequest>(
    `${GENAPI_BASE}/requests/${requestId}`,
    { headers: headers() },
  );
  return res.data;
}

// Extract the GLB URL from a completed request output
export function extractGlbUrl(output: Record<string, unknown>): string | undefined {
  // GenAPI Hunyuan 3D typically returns output.glb or output[0] or similar
  if (typeof output.glb === "string") return output.glb;
  if (typeof output.model === "string") return output.model;
  if (typeof output.model_url === "string") return output.model_url;
  if (Array.isArray(output) && typeof output[0] === "string") return output[0];
  // Try to find any string value that looks like a URL
  for (const val of Object.values(output)) {
    if (typeof val === "string" && (val.startsWith("http") || val.includes(".glb"))) {
      return val;
    }
  }
  return undefined;
}

export function extractThumbnailUrl(output: Record<string, unknown>): string | undefined {
  if (typeof output.thumbnail === "string") return output.thumbnail;
  if (typeof output.preview === "string") return output.preview;
  if (typeof output.image === "string") return output.image;
  return undefined;
}
