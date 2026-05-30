// Simple preinstall check placeholder — original script missing in repository
// This file ensures `pnpm install` preinstall hook succeeds in CI/dev.
try {
  const v = process.env.npm_config_user_agent || '';
  // no-op check
  process.exitCode = 0;
} catch (e) {
  // ignore
}
