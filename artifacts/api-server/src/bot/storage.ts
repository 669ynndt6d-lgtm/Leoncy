import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { createWriteStream } from "node:fs";
import axios from "axios";

const UPLOADS_DIR = path.resolve(process.cwd(), "uploads");

export function ensureUploadsDir() {
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
}

export function getUploadsDir() {
  return UPLOADS_DIR;
}

export async function downloadFile(url: string, filename: string): Promise<string> {
  ensureUploadsDir();
  const filePath = path.join(UPLOADS_DIR, filename);
  const response = await axios.get(url, { responseType: "stream" });
  await pipeline(response.data, createWriteStream(filePath));
  return filePath;
}

export function fileExists(filePath: string): boolean {
  return fs.existsSync(filePath);
}

export function getFileSize(filePath: string): number {
  try {
    return fs.statSync(filePath).size;
  } catch {
    return 0;
  }
}
