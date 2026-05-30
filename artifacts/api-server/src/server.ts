import app from "./app.js";
import { createBot } from "./bot/index.js";

const port = Number(process.env.PORT ?? 3000);
const server = app.listen(port, () => {
  console.log(`API server listening on http://0.0.0.0:${port}/api/healthz`);
});

if (process.env.TELEGRAM_BOT_TOKEN) {
  const bot = createBot();
  bot.start({ drop_pending_updates: true })
    .then(() => console.log("Telegram bot long-polling started"))
    .catch((err) => {
      console.error("Failed to start Telegram bot:", err);
      process.exit(1);
    });
} else {
  console.warn("TELEGRAM_BOT_TOKEN is not set; Telegram bot will not start.");
}

export default server;
