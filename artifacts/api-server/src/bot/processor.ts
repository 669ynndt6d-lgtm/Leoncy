import { Bot, InlineKeyboard } from "grammy";
import { eq } from "drizzle-orm";
import { getDb, schema } from "./db.js";
import {
  createTextTo3D,
  createImageTo3D,
  getRequest,
  extractGlbUrl,
  extractThumbnailUrl,
} from "./genapi.js";
import { downloadFile } from "./storage.js";
import { cancelGenerationKeyboard, downloadKeyboard } from "./keyboards.js";
import { generationStatusText } from "./messages.js";
import { logger } from "../lib/logger.js";

const POLL_INTERVAL = 6000;

export async function startTextGeneration(
  bot: Bot,
  chatId: number,
  statusMsgId: number,
  generationId: number,
  prompt: string,
  quality: string,
) {
  const db = getDb();
  try {
    await bot.api.editMessageText(
      chatId,
      statusMsgId,
      `🔄 <b>Запуск генерации…</b>\n\n${generationStatusText("processing", 5, quality)}`,
      { parse_mode: "HTML", reply_markup: cancelGenerationKeyboard(generationId) },
    );

    const requestId = await createTextTo3D(prompt);
    await db
      .update(schema.generationsTable)
      .set({ meshyTaskId: requestId, status: "processing", progress: 5 })
      .where(eq(schema.generationsTable.id, generationId));

    const result = await pollRequest(bot, chatId, statusMsgId, generationId, requestId, quality);
    if (!result) return;

    await finalizeGeneration(bot, chatId, statusMsgId, generationId, result, prompt, quality);
  } catch (err) {
    logger.error({ err, generationId }, "Text generation failed");
    await handleError(bot, chatId, statusMsgId, generationId, err);
  }
}

export async function startImageGeneration(
  bot: Bot,
  chatId: number,
  statusMsgId: number,
  generationId: number,
  imageUrl: string,
  quality: string,
) {
  const db = getDb();
  try {
    await bot.api.editMessageText(
      chatId,
      statusMsgId,
      `🔄 <b>Анализ изображения…</b>\n\n${generationStatusText("processing", 5, quality)}`,
      { parse_mode: "HTML", reply_markup: cancelGenerationKeyboard(generationId) },
    );

    const requestId = await createImageTo3D(imageUrl);
    await db
      .update(schema.generationsTable)
      .set({ meshyTaskId: requestId, status: "processing", progress: 5 })
      .where(eq(schema.generationsTable.id, generationId));

    const result = await pollRequest(bot, chatId, statusMsgId, generationId, requestId, quality);
    if (!result) return;

    await finalizeGeneration(bot, chatId, statusMsgId, generationId, result, "Из фото", quality);
  } catch (err) {
    logger.error({ err, generationId }, "Image generation failed");
    await handleError(bot, chatId, statusMsgId, generationId, err);
  }
}

async function pollRequest(
  bot: Bot,
  chatId: number,
  statusMsgId: number,
  generationId: number,
  requestId: string,
  quality: string,
) {
  const db = getDb();
  let lastProgress = 5;

  while (true) {
    const [gen] = await db
      .select()
      .from(schema.generationsTable)
      .where(eq(schema.generationsTable.id, generationId));

    if (!gen || gen.status === "cancelled") return null;

    const req = await getRequest(requestId);
    logger.info({ requestId, status: req.status, progress: req.progress }, "Poll");

    if (req.status === "completed") {
      return req;
    }

    if (req.status === "failed" || req.status === "error") {
      throw new Error(req.error ?? "Generation failed");
    }

    // Map progress: queued=5..10, processing=10..90
    let mappedProgress = lastProgress;
    if (req.status === "queued") {
      mappedProgress = Math.min(lastProgress + 2, 15);
    } else if (req.status === "processing") {
      const raw = typeof req.progress === "number" ? req.progress : 0;
      mappedProgress = Math.round(15 + (raw / 100) * 75);
    }
    mappedProgress = Math.max(mappedProgress, lastProgress);
    lastProgress = mappedProgress;

    await db
      .update(schema.generationsTable)
      .set({ progress: mappedProgress })
      .where(eq(schema.generationsTable.id, generationId));

    try {
      await bot.api.editMessageText(
        chatId,
        statusMsgId,
        `⚙️ <b>Генерация 3D-модели…</b>\n\n${generationStatusText("processing", mappedProgress, quality)}`,
        { parse_mode: "HTML", reply_markup: cancelGenerationKeyboard(generationId) },
      );
    } catch {
      // message unchanged — ok
    }

    await sleep(POLL_INTERVAL);
  }
}

async function finalizeGeneration(
  bot: Bot,
  chatId: number,
  statusMsgId: number,
  generationId: number,
  req: Awaited<ReturnType<typeof getRequest>>,
  prompt: string,
  quality: string,
) {
  const db = getDb();

  const output = req.output ?? {};
  const glbUrl = extractGlbUrl(output);
  const thumbnailUrl = extractThumbnailUrl(output);

  logger.info({ generationId, glbUrl, thumbnailUrl, output }, "Generation completed");

  await bot.api.editMessageText(
    chatId,
    statusMsgId,
    `📦 <b>Скачивание файлов…</b>\n\n${generationStatusText("processing", 95, quality)}`,
    { parse_mode: "HTML", reply_markup: cancelGenerationKeyboard(generationId) },
  );

  let localGlbPath: string | undefined;
  if (glbUrl) {
    try {
      localGlbPath = await downloadFile(glbUrl, `gen_${generationId}.glb`);
    } catch (err) {
      logger.warn({ err }, "Failed to download GLB, will use remote URL");
    }
  }

  await db
    .update(schema.generationsTable)
    .set({
      status: "completed",
      progress: 100,
      modelUrlGlb: glbUrl,
      localGlbPath,
      thumbnailUrl,
    })
    .where(eq(schema.generationsTable.id, generationId));

  // Increment usage counter
  const [gen] = await db
    .select()
    .from(schema.generationsTable)
    .where(eq(schema.generationsTable.id, generationId));
  if (gen) {
    await db
      .update(schema.usersTable)
      .set({
        generationsUsed: db.$count(schema.generationsTable) as unknown as number,
      })
      .where(eq(schema.usersTable.telegramId, gen.telegramId));
  }

  // Build viewer WebApp URL
  const domain = process.env.REPLIT_DOMAINS?.split(",")[0];
  const viewerUrl = domain && glbUrl
    ? `https://${domain}/viewer/?model=${encodeURIComponent(glbUrl)}&title=${encodeURIComponent(prompt.slice(0, 60))}&id=${generationId}`
    : null;

  await bot.api.editMessageText(
    chatId,
    statusMsgId,
    `✅ <b>3D-модель готова!</b>\n\n🎉 Генерация завершена успешно.\n📁 Формат: GLB\n\n${viewerUrl ? "Нажмите «👁 Просмотр» для интерактивного вращения модели" : ""}`,
    {
      parse_mode: "HTML",
      reply_markup: buildResultKeyboard(generationId, viewerUrl),
    },
  );

  // Send thumbnail if available
  if (thumbnailUrl) {
    try {
      await bot.api.sendPhoto(chatId, thumbnailUrl, {
        caption: `🖼 Превью: <i>${prompt.slice(0, 80)}</i>`,
        parse_mode: "HTML",
      });
    } catch {
      // non-critical
    }
  }
}

function buildResultKeyboard(generationId: number, viewerUrl: string | null) {
  const kb = new InlineKeyboard();
  if (viewerUrl) {
    kb.webApp("👁 Просмотр 3D", viewerUrl);
    kb.row();
  }
  kb.text("⬇ Скачать GLB", `download_glb_${generationId}`);
  kb.text("◀ Меню", "menu_back");
  return kb;
}

async function handleError(
  bot: Bot,
  chatId: number,
  statusMsgId: number,
  generationId: number,
  err: unknown,
) {
  const db = getDb();
  const msg = err instanceof Error ? err.message : String(err);
  await db
    .update(schema.generationsTable)
    .set({ status: "failed", errorMessage: msg.slice(0, 500) })
    .where(eq(schema.generationsTable.id, generationId));
  try {
    await bot.api.editMessageText(
      chatId,
      statusMsgId,
      `❌ <b>Ошибка генерации</b>\n\nПопробуйте снова.\n\n<i>${msg.slice(0, 200)}</i>`,
      { parse_mode: "HTML" },
    );
  } catch { /* ignore */ }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
