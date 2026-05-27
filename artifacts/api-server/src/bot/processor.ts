import { Bot, InlineKeyboard } from "grammy";
import { eq } from "drizzle-orm";
import { getDb, schema } from "./db.js";
import {
  pollinationsImageUrl,
  createHunyuan3D,
  getRequest,
  extractGlbUrl,
  extractThumbnailUrl,
} from "./genapi.js";
import { downloadFile, getUploadsDir } from "./storage.js";
import { cancelGenerationKeyboard } from "./keyboards.js";
import { generationStatusText } from "./messages.js";
import { logger } from "../lib/logger.js";
import path from "node:path";

const POLL_INTERVAL = 5000;

function publicBaseUrl(): string {
  const domain = process.env.REPLIT_DOMAINS?.split(",")[0];
  return domain ? `https://${domain}` : `http://localhost:${process.env.PORT ?? 8080}`;
}

// Download any image URL to local uploads and return public URL
async function localiseImage(srcUrl: string, filename: string): Promise<string> {
  const localPath = await downloadFile(srcUrl, filename);
  const rel = path.basename(localPath);
  return `${publicBaseUrl()}/uploads/${rel}`;
}

// TEXT → 3D pipeline
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
    // Step 1: Generate preview image via Pollinations (free, no auth)
    await editStatus(bot, chatId, statusMsgId, generationId,
      `🎨 <b>Генерация превью изображения…</b>\n\n${generationStatusText("processing", 5, quality)}`);

    const pollinationsUrl = pollinationsImageUrl(
      `${prompt}, 3D render style, white background, centered, product photo`,
      Math.floor(Math.random() * 9999),
    );

    let imageUrl: string;
    try {
      imageUrl = await localiseImage(pollinationsUrl, `preview_${generationId}.jpg`);
    } catch (err) {
      // Fallback: use the Pollinations URL directly
      logger.warn({ err }, "Could not localise Pollinations image, using URL directly");
      imageUrl = pollinationsUrl;
    }

    await db.update(schema.generationsTable)
      .set({ previewImageUrl: imageUrl, status: "processing", progress: 15 })
      .where(eq(schema.generationsTable.id, generationId));

    // Send preview to user
    try {
      await bot.api.sendPhoto(chatId, imageUrl, {
        caption: `🎨 Превью: <i>${prompt.slice(0, 80)}</i>\n⏳ Генерирую 3D-модель…`,
        parse_mode: "HTML",
      });
    } catch { /* non-critical */ }

    // Step 2: Hunyuan 3D
    await editStatus(bot, chatId, statusMsgId, generationId,
      `🏗 <b>Создание 3D-модели…</b>\n\n${generationStatusText("processing", 20, quality)}`);

    const requestId = await createHunyuan3D(imageUrl, 5, async (attempt, delayMs) => {
      const secs = Math.round(delayMs / 1000);
      await editStatus(bot, chatId, statusMsgId, generationId,
        `⏳ <b>Сервис перегружен, повторяем попытку ${attempt}/5…</b>\n\nПодождите ${secs} сек.`);
    });
    await db.update(schema.generationsTable)
      .set({ meshyTaskId: requestId, progress: 20 })
      .where(eq(schema.generationsTable.id, generationId));

    const result = await pollUntilDone(bot, chatId, statusMsgId, generationId, requestId, quality, 20, 95);
    if (!result) return;

    await finalizeGeneration(bot, chatId, statusMsgId, generationId, result, imageUrl, prompt);
  } catch (err) {
    logger.error({ err, generationId }, "Text generation failed");
    await handleError(bot, chatId, statusMsgId, generationId, err);
  }
}

// IMAGE → 3D pipeline
export async function startImageGeneration(
  bot: Bot,
  chatId: number,
  statusMsgId: number,
  generationId: number,
  telegramFileUrl: string,
  quality: string,
) {
  const db = getDb();
  try {
    await editStatus(bot, chatId, statusMsgId, generationId,
      `📥 <b>Загрузка фото…</b>\n\n${generationStatusText("processing", 5, quality)}`);

    // Download Telegram photo locally so GenAPI can reach it
    const imageUrl = await localiseImage(telegramFileUrl, `photo_${generationId}.jpg`);

    await db.update(schema.generationsTable)
      .set({ previewImageUrl: imageUrl, status: "processing", progress: 10 })
      .where(eq(schema.generationsTable.id, generationId));

    await editStatus(bot, chatId, statusMsgId, generationId,
      `🏗 <b>Создание 3D-модели…</b>\n\n${generationStatusText("processing", 15, quality)}`);

    const requestId = await createHunyuan3D(imageUrl, 5, async (attempt, delayMs) => {
      const secs = Math.round(delayMs / 1000);
      await editStatus(bot, chatId, statusMsgId, generationId,
        `⏳ <b>Сервис перегружен, повторяем попытку ${attempt}/5…</b>\n\nПодождите ${secs} сек.`);
    });
    await db.update(schema.generationsTable)
      .set({ meshyTaskId: requestId, progress: 15 })
      .where(eq(schema.generationsTable.id, generationId));

    const result = await pollUntilDone(bot, chatId, statusMsgId, generationId, requestId, quality, 15, 95);
    if (!result) return;

    await finalizeGeneration(bot, chatId, statusMsgId, generationId, result, imageUrl, "Из фото");
  } catch (err) {
    logger.error({ err, generationId }, "Image generation failed");
    await handleError(bot, chatId, statusMsgId, generationId, err);
  }
}

async function pollUntilDone(
  bot: Bot,
  chatId: number,
  statusMsgId: number,
  generationId: number,
  requestId: string,
  quality: string,
  progressStart: number,
  progressEnd: number,
) {
  const db = getDb();
  let lastProgress = progressStart;

  while (true) {
    const [gen] = await db.select().from(schema.generationsTable)
      .where(eq(schema.generationsTable.id, generationId));
    if (!gen || gen.status === "cancelled") return null;

    const req = await getRequest(requestId);
    logger.info({ requestId, status: req.status, progress: req.progress }, "Poll");

    if (req.status === "completed") return req;
    if (req.status === "failed" || req.status === "error") {
      throw new Error(req.error ?? "Генерация завершилась с ошибкой");
    }

    const raw = typeof req.progress === "number" ? req.progress : 0;
    const mapped = Math.round(progressStart + (raw / 100) * (progressEnd - progressStart));
    const newProgress = Math.max(mapped, lastProgress);
    lastProgress = newProgress;

    await db.update(schema.generationsTable)
      .set({ progress: newProgress })
      .where(eq(schema.generationsTable.id, generationId));

    try {
      await editStatus(bot, chatId, statusMsgId, generationId,
        `⚙️ <b>Генерация…</b>\n\n${generationStatusText("processing", newProgress, quality)}`);
    } catch { /* message unchanged */ }

    await sleep(POLL_INTERVAL);
  }
}

async function finalizeGeneration(
  bot: Bot,
  chatId: number,
  statusMsgId: number,
  generationId: number,
  req: Awaited<ReturnType<typeof getRequest>>,
  previewImageUrl: string,
  prompt: string,
) {
  const db = getDb();

  const glbUrl = extractGlbUrl(req.output);
  const thumbnailUrl = extractThumbnailUrl(req.output) ?? previewImageUrl;

  logger.info({ generationId, glbUrl, rawOutput: JSON.stringify(req.output) }, "Generation completed");

  let localGlbPath: string | undefined;
  if (glbUrl) {
    try {
      localGlbPath = await downloadFile(glbUrl, `gen_${generationId}.glb`);
    } catch (err) {
      logger.warn({ err }, "Could not download GLB");
    }
  }

  await db.update(schema.generationsTable)
    .set({ status: "completed", progress: 100, modelUrlGlb: glbUrl, localGlbPath, thumbnailUrl })
    .where(eq(schema.generationsTable.id, generationId));

  const domain = process.env.REPLIT_DOMAINS?.split(",")[0];
  const viewerUrl = domain && glbUrl
    ? `https://${domain}/viewer/?model=${encodeURIComponent(glbUrl)}&title=${encodeURIComponent(prompt.slice(0, 60))}&id=${generationId}`
    : null;

  const kb = new InlineKeyboard();
  if (viewerUrl) {
    kb.webApp("👁 Просмотр 3D", viewerUrl).row();
  }
  kb.text("⬇ Скачать GLB", `download_glb_${generationId}`).text("◀ Меню", "menu_back");

  await bot.api.editMessageText(
    chatId, statusMsgId,
    `✅ <b>3D-модель готова!</b>\n\n🎉 Генерация завершена.\n📁 Формат: GLB${viewerUrl ? "\n\n👁 Нажмите «Просмотр 3D» для интерактивного вращения!" : ""}`,
    { parse_mode: "HTML", reply_markup: kb },
  );
}

async function editStatus(
  bot: Bot,
  chatId: number,
  msgId: number,
  generationId: number,
  text: string,
) {
  try {
    await bot.api.editMessageText(chatId, msgId, text, {
      parse_mode: "HTML",
      reply_markup: cancelGenerationKeyboard(generationId),
    });
  } catch { /* ignore "message not modified" */ }
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
  await db.update(schema.generationsTable)
    .set({ status: "failed", errorMessage: msg.slice(0, 500) })
    .where(eq(schema.generationsTable.id, generationId));
  try {
    await bot.api.editMessageText(chatId, statusMsgId,
      `❌ <b>Ошибка генерации</b>\n\nПопробуйте снова.\n\n<i>${msg.slice(0, 200)}</i>`,
      { parse_mode: "HTML" });
  } catch { /* ignore */ }
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }
