import { Bot, session } from "grammy";
import type { BotContext, SessionData } from "./context.js";
import { registerStartHandlers } from "./handlers/start.js";
import { registerMenuHandlers } from "./handlers/menu.js";
import { registerGenerationHandlers } from "./handlers/generation.js";
import { mainMenuKeyboard } from "./keyboards.js";
import { logger } from "../lib/logger.js";

function initialSession(): SessionData {
  return {
    step: "idle",
    quality: "standard",
  };
}

export function createBot(): Bot<BotContext> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is required");

  const bot = new Bot<BotContext>(token);

  // Session middleware (in-memory)
  bot.use(
    session({
      initial: initialSession,
    }),
  );

  // Register handlers
  registerStartHandlers(bot);
  registerMenuHandlers(bot);
  registerGenerationHandlers(bot);

  // Fallback for unhandled text (not in a specific step)
  bot.on("message:text", async (ctx) => {
    if (ctx.session.step !== "idle") return;
    const firstName = ctx.from?.first_name ?? "Пользователь";
    await ctx.reply(
      `👋 Привет, <b>${firstName}</b>! Используйте меню ниже:`,
      { parse_mode: "HTML", reply_markup: mainMenuKeyboard() },
    );
  });

  // Error handler
  bot.catch((err) => {
    logger.error({ err: err.error, ctx: err.ctx?.update }, "Bot error");
  });

  return bot;
}

export async function startBot() {
  const bot = createBot();

  logger.info("Starting Telegram bot (long polling)…");

  // Set bot commands
  await bot.api.setMyCommands([
    { command: "start", description: "Запустить бота" },
    { command: "menu", description: "Главное меню" },
  ]);

  bot.start({
    onStart: (info) => {
      logger.info({ username: info.username }, "Bot started");
    },
  });

  return bot;
}
