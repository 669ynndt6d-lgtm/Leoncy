import app from "./app.js";
import { logger } from "./lib/logger.js";
import { startBot } from "./bot/index.js";
import { ensureUploadsDir } from "./bot/storage.js";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

ensureUploadsDir();

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});

// Start Telegram bot (only if token is present)
if (process.env.TELEGRAM_BOT_TOKEN) {
  startBot().catch((err) => {
    logger.error({ err }, "Failed to start bot");
  });
} else {
  logger.warn("TELEGRAM_BOT_TOKEN not set — bot not started");
}
