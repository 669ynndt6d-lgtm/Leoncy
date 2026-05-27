// Mock 3D generation — simulates the full pipeline without any external API.
// Returns a real GLB sample so the viewer and download actually work.

export type GenApiStatus = "queued" | "processing" | "completed" | "failed" | "error";

export interface GenApiRequest {
  id: string;
  status: GenApiStatus;
  output?: Record<string, unknown> | string[] | string;
  error?: string;
  progress?: number;
}

// In-memory store of fake requests
const mockRequests = new Map<string, { createdAt: number; durationMs: number }>();

// Sample public GLB (a small rubber duck from three.js examples)
const SAMPLE_GLB_URL =
  "https://threejs.org/examples/models/gltf/RobotExpressive/RobotExpressive.glb";

let _counter = 1;

// Build a Pollinations.ai image URL from text (used for preview)
export function pollinationsImageUrl(prompt: string, seed = 42): string {
  const encoded = encodeURIComponent(prompt);
  return `https://image.pollinations.ai/prompt/${encoded}?width=1024&height=1024&nologo=true&seed=${seed}`;
}

// "Submit" a job — instantly succeeds, schedules completion after delay
export async function createHunyuan3D(
  _imageUrl: string,
  _maxRetries = 5,
  _onRetry?: (attempt: number, delayMs: number) => void,
): Promise<string> {
  const id = `mock_${Date.now()}_${_counter++}`;
  // Simulate 30-60 second generation time
  const durationMs = 30_000 + Math.random() * 30_000;
  mockRequests.set(id, { createdAt: Date.now(), durationMs });
  return id;
}

// Poll status — progresses over time, completes when duration elapsed
export async function getRequest(requestId: string): Promise<GenApiRequest> {
  const req = mockRequests.get(requestId);
  if (!req) {
    return { id: requestId, status: "failed", error: "Задача не найдена" };
  }

  const elapsed = Date.now() - req.createdAt;
  const progress = Math.min(99, Math.round((elapsed / req.durationMs) * 100));

  if (elapsed >= req.durationMs) {
    mockRequests.delete(requestId);
    return {
      id: requestId,
      status: "completed",
      progress: 100,
      output: { glb: SAMPLE_GLB_URL },
    };
  }

  return {
    id: requestId,
    status: elapsed < 3000 ? "queued" : "processing",
    progress,
  };
}

export function extractGlbUrl(output: GenApiRequest["output"]): string | undefined {
  if (!output) return undefined;
  if (typeof output === "string" && output.startsWith("http")) return output;
  if (Array.isArray(output)) {
    for (const v of output) {
      if (typeof v === "string" && v.startsWith("http")) return v;
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
