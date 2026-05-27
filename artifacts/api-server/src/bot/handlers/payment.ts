import { Bot } from "grammy";
import { eq } from "drizzle-orm";
import { getDb, schema } from "../db.js";
import { mainMenuKeyboard, backToMenuKeyboard } from "../keyboards.js";
import type { BotContext } from "../context.js";
import { logger } from "../../lib/logger.js";

const PREMIUM_STARS_PRICE = 50; // 50 Telegram Stars per month
const PREMIUM_DURATION_DAYS = 30;

export function registerPaymentHandlers(bot: Bot<BotContext>) {
  // Show premium offer
  bot.callbackQuery("menu_premium", async (ctx) => {
    await ctx.answerCallbackQuery();
    const db = getDb();
    const tgId = String(ctx.from?.id ?? "");
    const [user] = await db.select().from(schema.usersTable).where(eq(schema.usersTable.telegramId, tgId));

    if (user?.isPremium) {
      const until = user.premiumUntil ? user.premiumUntil.toLocaleDateString("ru-RU") : "—";
      await ctx.editMessageText(
        `⭐ <b>У вас уже есть Premium!</b>\n\nАктивен до: <b>${until}</b>\n\nLimitы:\n• 100 генераций в месяц\n• Приоритетная очередь\n• Качество Ultra HD`,
        { parse_mode: "HTML", reply_markup: backToMenuKeyboard() },
      );
      return;
    }

    await ctx.editMessageText(
      `⭐ <b>Premium-подписка</b>\n\n` +
      `Разблокируйте все возможности бота:\n\n` +
      `✅ 100 генераций в месяц (вместо 10)\n` +
      `✅ Ultra HD качество моделей\n` +
      `✅ Приоритетная очередь генерации\n` +
      `✅ История всех моделей\n\n` +
      `💰 Стоимость: <b>${PREMIUM_STARS_PRICE} ⭐ Stars</b> / месяц`,
      {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [{ text: `⭐ Оплатить ${PREMIUM_STARS_PRICE} Stars`, callback_data: "buy_premium" }],
            [{ text: "◀ Назад", callback_data: "menu_back" }],
          ],
        },
      },
    );
  });

  // Send invoice
  bot.callbackQuery("buy_premium", async (ctx) => {
    await ctx.answerCallbackQuery();
    const chatId = ctx.chat?.id;
    if (!chatId) return;

    try {
      await ctx.api.sendInvoice(
        chatId,
        "⭐ Premium — 3D Bot",
        `Premium-подписка на 30 дней: 100 генераций, Ultra HD качество, приоритетная очередь.`,
        "premium_30days",
        "", // empty provider_token = Telegram Stars
        "XTR",
        [{ label: "Premium 30 дней", amount: PREMIUM_STARS_PRICE }],
        {
          photo_url: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/82/Telegram_logo.svg/1024px-Telegram_logo.svg.png",
          photo_width: 512,
          photo_height: 512,
          is_flexible: false,
        },
      );
    } catch (err) {
      logger.error({ err }, "Failed to send invoice");
      await ctx.reply("❌ Не удалось создать счёт. Попробуйте позже.");
    }
  });

  // Pre-checkout — must be answered within 10 seconds
  bot.on("pre_checkout_query", async (ctx) => {
    await ctx.answerPreCheckoutQuery(true);
  });

  // Successful payment
  bot.on("message:successful_payment", async (ctx) => {
    const db = getDb();
    const tgId = String(ctx.from?.id ?? "");
    const payment = ctx.message.successful_payment;

    logger.info({ tgId, payment }, "Stars payment received");

    const premiumUntil = new Date();
    premiumUntil.setDate(premiumUntil.getDate() + PREMIUM_DURATION_DAYS);

    await db.update(schema.usersTable)
      .set({
        isPremium: true,
        premiumUntil,
        generationsLimit: 100,
      })
      .where(eq(schema.usersTable.telegramId, tgId));

    await ctx.reply(
      `🎉 <b>Оплата прошла успешно!</b>\n\n` +
      `Вы получили Premium-подписку на <b>${PREMIUM_DURATION_DAYS} дней</b>.\n` +
      `Теперь вам доступно:\n` +
      `✅ 100 генераций в месяц\n` +
      `✅ Ultra HD качество\n` +
      `✅ Приоритетная очередь\n\n` +
      `Premium активен до: <b>${premiumUntil.toLocaleDateString("ru-RU")}</b>`,
      { parse_mode: "HTML", reply_markup: mainMenuKeyboard() },
    );
  });
}
