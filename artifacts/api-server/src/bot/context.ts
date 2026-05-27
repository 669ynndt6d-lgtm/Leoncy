import { Context } from "grammy";

export interface SessionData {
  step: "idle" | "awaiting_text_prompt" | "awaiting_image" | "confirming";
  quality: string;
  pendingGenerationId?: number;
  pendingPrompt?: string;
}

export type BotContext = Context & {
  session: SessionData;
};
