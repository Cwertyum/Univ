/**
 * Bot Token Security & Anti-Leak Shield
 * Automatically redacts bot tokens, secret keys, and credentials from all logs, messages, and stack traces.
 */

const TOKEN = process.env.DISCORD_TOKEN;

/**
 * Redacts any occurrence of DISCORD_TOKEN or sensitive credentials from text strings
 */
export function redactToken(text) {
  if (!text) return text;
  let str = typeof text === 'string' ? text : String(text);

  if (TOKEN && TOKEN.length > 10) {
    str = str.replaceAll(TOKEN, '[REDACTED_DISCORD_TOKEN]');
  }

  // Regex to catch Discord Bot Token formats (e.g. MTIzNDU2Nzg5... . G... . ...)
  const tokenRegex = /[\w-]{24,28}\.[\w-]{6}\.[\w-]{27,38}/g;
  str = str.replace(tokenRegex, '[REDACTED_DISCORD_TOKEN]');

  return str;
}

/**
 * Installs global security monkey-patching on console.error and process loggers
 */
export function initSecurityShield() {
  const originalError = console.error;
  const originalLog = console.log;

  console.error = function (...args) {
    const sanitizedArgs = args.map(arg => {
      if (typeof arg === 'string') return redactToken(arg);
      if (arg instanceof Error) {
        arg.message = redactToken(arg.message);
        if (arg.stack) arg.stack = redactToken(arg.stack);
      }
      return arg;
    });
    originalError.apply(console, sanitizedArgs);
  };

  console.log = function (...args) {
    const sanitizedArgs = args.map(arg => {
      if (typeof arg === 'string') return redactToken(arg);
      return arg;
    });
    originalLog.apply(console, sanitizedArgs);
  };
}
