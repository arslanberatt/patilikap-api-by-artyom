const isDev = process.env.NODE_ENV !== "production";

const colors = {
  reset: "\x1b[0m",
  gray: "\x1b[90m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
};

function timestamp() {
  return `${colors.gray}[${new Date().toISOString()}]${colors.reset}`;
}

export const logger = {
  info: (msg: string, ...args: unknown[]) => {
    if (!isDev) return;
    console.log(`${timestamp()} ${colors.cyan}INFO${colors.reset}  ${msg}`, ...args);
  },
  success: (msg: string, ...args: unknown[]) => {
    if (!isDev) return;
    console.log(`${timestamp()} ${colors.green}OK${colors.reset}    ${msg}`, ...args);
  },
  warn: (msg: string, ...args: unknown[]) => {
    if (!isDev) return;
    console.warn(`${timestamp()} ${colors.yellow}WARN${colors.reset}  ${msg}`, ...args);
  },
  error: (msg: string, ...args: unknown[]) => {
    // error her zaman loglanır
    console.error(`${timestamp()} ${colors.red}ERROR${colors.reset} ${msg}`, ...args);
  },
};
