const ts = () => new Date().toISOString();

export const log = {
  info: (msg: string, ...rest: unknown[]) => console.log(`[api ${ts()}] ${msg}`, ...rest),
  warn: (msg: string, ...rest: unknown[]) => console.warn(`[api ${ts()}] WARN ${msg}`, ...rest),
  error: (msg: string, ...rest: unknown[]) => console.error(`[api ${ts()}] ERROR ${msg}`, ...rest),
  /** Used when a real provider is replaced by the offline mock. Hard to miss on purpose. */
  loud: (msg: string) => {
    const line = '='.repeat(Math.min(96, msg.length + 8));
    console.warn(`\n${line}\n!!  ${msg}\n${line}\n`);
  },
};

export const errorMessage = (err: unknown): string =>
  err instanceof Error ? err.message : typeof err === 'string' ? err : JSON.stringify(err);
