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

// Build a Pollinations.ai image URL from text (synchronous — downloads the image)
export function pollinationsImageUrl(prompt: string, seed = 42): string {
  const encoded = encodeURIComponent(prompt);
  return `https://image.pollinations.ai/prompt/${encoded}?width=1024&height=1024&nologo=true&seed=${seed}`;
}

// Submit an image URL to Hunyuan 3D — returns GenAPI request ID
export async function createHunyuan3D(imageUrl: string): Promise<string> {
  const res = await axios.post<{ id: string }>(
    `${GENAPI_BASE}/networks/hunyuan-3d`,
    { input_image_url: imageUrl },
    { headers: headers() },
  );
  return res.data.id;
}

// Poll any GenAPI request by ID
export async function getRequest(requestId: string): Promise<GenApiRequest> {
  const res = await axios.get<GenApiRequest>(
    `${GENAPI_BASE}/requests/${requestId}`,
    { headers: headers() },
  );
  return res.data;
}

// Extract the first HTTP URL from whatever shape the output is
function firstUrl(output: GenApiRequest["output"]): string | undefined {
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

export function extractGlbUrl(output: GenApiRequest["output"]): string | undefined {
  if (!output) return undefined;
  if (typeof output === "object" && !Array.isArray(output)) {
    const obj = output as Record<string, unknown>;
    for (const key of ["glb", "model", "model_url", "output"]) {
      if (typeof obj[key] === "string") return obj[key] as string;
    }
  }
  if (Array.isArray(output)) {
    for (const v of output) {
      if (typeof v === "string" && (v.includes(".glb") || v.startsWith("http"))) return v;
    }
  }
  return firstUrl(output);
}

export function extractThumbnailUrl(output: GenApiRequest["output"]): string | undefined {
  if (!output || typeof output !== "object" || Array.isArray(output)) return undefined;
  const obj = output as Record<string, unknown>;
  for (const key of ["thumbnail", "preview", "image"]) {
    if (typeof obj[key] === "string") return obj[key] as string;
  }
  return undefined;
}
