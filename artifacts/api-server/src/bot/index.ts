import { Bot, session } from "grammy";
import { registerStartHandlers } from "./handlers/start.js";
import { registerMenuHandlers } from "./handlers/menu.js";
import { registerGenerationHandlers } from "./handlers/generation.js";
import { registerPaymentHandlers } from "./handlers/payment.js";
import type { BotContext } from "./context.js";

const defaultSession = (): BotContext["session"] => ({
  step: "idle",
  quality: "standard",
});

export function createBot() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    throw new Error("TELEGRAM_BOT_TOKEN must be set to start the Telegram bot");
  }

  const bot = new Bot<BotContext>(token);
  bot.use(session({ initial: defaultSession }));

  registerStartHandlers(bot);
  registerMenuHandlers(bot);
  registerGenerationHandlers(bot);
  registerPaymentHandlers(bot);

  bot.catch((err) => {
    console.error("Bot error:", err);
  });

  return bot;
}
