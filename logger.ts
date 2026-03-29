type BaseLogger = {
  debug?: (message: string) => void;
  info: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string) => void;
};

const noopLogger: BaseLogger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

let logger: BaseLogger = noopLogger;
let debugEnabled = false;

export function initLogger(nextLogger: BaseLogger, debug: boolean): void {
  logger = nextLogger;
  debugEnabled = debug;
}

export const log = {
  debug(message: string): void {
    if (debugEnabled && logger.debug) {
      logger.debug(`[memcontext] ${message}`);
    }
  },
  info(message: string): void {
    logger.info(`[memcontext] ${message}`);
  },
  warn(message: string): void {
    logger.warn(`[memcontext] ${message}`);
  },
  error(message: string): void {
    logger.error(`[memcontext] ${message}`);
  },
};
