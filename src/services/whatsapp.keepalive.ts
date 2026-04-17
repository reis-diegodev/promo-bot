import { WASocket } from '@whiskeysockets/baileys';

let keepAliveInterval: NodeJS.Timeout | null = null;
let keepAliveFailures = 0;
let lastKeepAliveSuccessAt = Date.now();

const KEEP_ALIVE_INTERVAL_MS = 20_000;
const MAX_KEEP_ALIVE_FAILURES = 5;
const MAX_TIME_WITHOUT_SUCCESS_MS = 3 * 60 * 1000;

type KeepAliveHandlers = {
  onSuccess?: () => void;
  onFailure?: (failures: number) => void | Promise<void>;
  onStale?: () => void | Promise<void>;
};

export function startKeepAlive(
  sock: WASocket,
  handlers: KeepAliveHandlers = {},
) {
  stopKeepAlive();

  keepAliveFailures = 0;
  lastKeepAliveSuccessAt = Date.now();

  keepAliveInterval = setInterval(async () => {
    try {
      if (!sock?.user) {
        throw new Error('Socket sem usuário ativo');
      }

      await sock.sendPresenceUpdate('available');

      keepAliveFailures = 0;
      lastKeepAliveSuccessAt = Date.now();

      console.log('💓 WhatsApp keep-alive');
      await handlers.onSuccess?.();
    } catch (error) {
      keepAliveFailures += 1;

      console.warn(`⚠️ Keep-alive falhou (${keepAliveFailures}/${MAX_KEEP_ALIVE_FAILURES})`);
      await handlers.onFailure?.(keepAliveFailures);

      const timeWithoutSuccess = Date.now() - lastKeepAliveSuccessAt;
      const exceededFailures = keepAliveFailures >= MAX_KEEP_ALIVE_FAILURES;
      const exceededStaleTime = timeWithoutSuccess >= MAX_TIME_WITHOUT_SUCCESS_MS;

      if (exceededFailures || exceededStaleTime) {
        console.warn('🚨 Keep-alive travado. Sinalizando reconexão...');
        await handlers.onStale?.();
      }
    }
  }, KEEP_ALIVE_INTERVAL_MS);
}

export function stopKeepAlive() {
  if (keepAliveInterval) {
    clearInterval(keepAliveInterval);
    keepAliveInterval = null;
  }
}

export function resetKeepAliveState() {
  keepAliveFailures = 0;
  lastKeepAliveSuccessAt = Date.now();
}