type LogLevel = "debug" | "info" | "warn" | "error";

function log(level: LogLevel, message: string, context?: unknown): void {
  const payload = {
    level,
    message,
    context,
    timestamp: new Date().toISOString(),
  };

  if (level === "error") {
    console.error(payload);
    return;
  }
  if (level === "warn") {
    console.warn(payload);
    return;
  }
  console.log(payload);
}

export const logger = {
  debug: (message: string, context?: unknown) => log("debug", message, context),
  info: (message: string, context?: unknown) => log("info", message, context),
  warn: (message: string, context?: unknown) => log("warn", message, context),
  error: (message: string, context?: unknown) => log("error", message, context),
};
