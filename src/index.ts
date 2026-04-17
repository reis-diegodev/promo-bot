import 'dotenv/config';
import express from 'express';
import fs from 'node:fs/promises';

import { scrapeMercadoLivre } from './services/scraper/mercadolivre';
import { processAndSendPromos } from './services/promo';
import { ScrapedPromo } from './services/scraper/types';
import { BAILEYS_AUTH_PATH, connectToWhatsApp } from './services/whatsapp/client';
import {
  startWhatsAppWorker,
  setWhatsAppSocket,
  clearWhatsAppSocket,
} from './workers/whatsapp.worker';
import {
  startKeepAlive,
  stopKeepAlive,
  resetKeepAliveState,
} from './services/whatsapp.keepalive';

const app = express();
const PORT = Number(process.env.PORT || 3000);

let hasStarted = false;
let isStarting = false;
let isMainRunning = false;
let isReconnectScheduled = false;
let isForceReconnecting = false;

let mainTimer: NodeJS.Timeout | null = null;
let currentSock: any = null;

const SEARCH_TERMS = [
  'Aramis',
  'Perfume Arabe',
  'Tommy Hilfiger',
  'Fila',
  'Nike',
  'Puma',
  'Adidas',
  'Dark Lab',
  'Soldiers',
  'Polo',
  'Dry-fit',
];

async function resetWhatsAppSession() {
  try {
    console.log('🧹 Removendo sessão inválida do Baileys...');
    await fs.rm(BAILEYS_AUTH_PATH, { recursive: true, force: true });
    console.log('✅ Sessão removida com sucesso.');
  } catch (error) {
    console.error('❌ Erro ao remover sessão do Baileys:', error);
  }
}

function shuffleArray<T>(array: T[]): T[] {
  const copy = [...array];

  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }

  return copy;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function parsePrice(priceStr: string): number {
  const clean = priceStr.replace(/[R$\s.]/g, '').replace(',', '.');
  return Number.parseFloat(clean) || 0;
}

function isWithinOperatingHours(): boolean {
  const now = new Date();
  const hour = now.toLocaleString('pt-BR', {
    timeZone: 'America/Recife',
    hour: 'numeric',
    hour12: false,
  });

  const h = Number.parseInt(hour, 10);
  return h >= 9 && h < 22;
}

function clearMainTimer() {
  if (mainTimer) {
    clearTimeout(mainTimer);
    mainTimer = null;
  }
}

function scheduleNextRun(sock: any, ms: number) {
  clearMainTimer();
  mainTimer = setTimeout(() => {
    void main(sock);
  }, ms);
}

async function scheduleReconnect(delayMs: number) {
  if (isReconnectScheduled || isStarting) return;

  isReconnectScheduled = true;

  setTimeout(async () => {
    isReconnectScheduled = false;
    await start();
  }, delayMs);
}

async function forceReconnectFromKeepAlive() {
  if (isForceReconnecting) return;

  isForceReconnecting = true;
  console.warn('🚨 Keep-alive travado. Forçando reconexão do WhatsApp...');

  try {
    stopKeepAlive();
    clearMainTimer();
    clearWhatsAppSocket();
    hasStarted = false;

    const sockToClose = currentSock;
    currentSock = null;

    if (sockToClose) {
      try {
        sockToClose.end?.(new Error('Forced reconnect after keep-alive failure'));
      } catch (error) {
        console.warn('⚠️ Não foi possível encerrar o socket atual:', error);
      }
    }
  } finally {
    setTimeout(() => {
      isForceReconnecting = false;
      void scheduleReconnect(5000);
    }, 1000);
  }
}

app.get('/', (_req, res) => res.send('Promo-Bot is Active! 🚀'));
app.listen(PORT, () => console.log(`📡 Server listening on port ${PORT}`));

async function main(sock: any) {
  if (isMainRunning) return;

  if (!isWithinOperatingHours()) {
    const now = new Date().toLocaleTimeString('pt-BR', {
      timeZone: 'America/Recife',
    });

    console.log(`🌙 Fora do horário de operação (${now}) — próxima verificação em 30min`);
    scheduleNextRun(sock, 30 * 60 * 1000);
    return;
  }

  isMainRunning = true;

  try {
    console.log('\n🚀 Iniciando ciclo...');
    const roundTerms = shuffleArray(SEARCH_TERMS).slice(0, 3);

    for (const term of roundTerms) {
      console.log(`\n🔎 Caçando: "${term}" (Limite R$ 500)`);

      try {
        const mlPromos = await Promise.race([
          scrapeMercadoLivre(term),
          new Promise<ScrapedPromo[]>((resolve) =>
            setTimeout(() => {
              console.warn(`⚠️ Timeout no termo: "${term}" — pulando`);
              resolve([]);
            }, 90000),
          ),
        ]);

        const filteredMl = mlPromos.filter((p) => parsePrice(p.price) <= 500);

        if (filteredMl.length > 0) {
          await processAndSendPromos(filteredMl, sock, 'Mercado Livre');
        }
      } catch (termError) {
        console.error(`❌ Erro no termo "${term}":`, termError);
      }

      await wait(5000);
    }
  } catch (error) {
    console.error('❌ Erro no ciclo:', error);
  } finally {
    isMainRunning = false;
    console.log('✅ Ciclo finalizado — próximo em 1h');
    scheduleNextRun(sock, 60 * 60 * 1000);
  }
}

async function start() {
  if (isStarting) return;
  isStarting = true;

  console.log('🚀 Iniciando instância do Promo-Bot...');

  try {
    const sock = await connectToWhatsApp();
    currentSock = sock;

    sock.ev.on('connection.update', async ({ connection, lastDisconnect }: any) => {
      if (connection === 'open' && !hasStarted) {
        hasStarted = true;
        resetKeepAliveState();

        console.log('✅ WhatsApp conectado com sucesso!');
        console.log('⏳ Aguardando estabilização...');
        await wait(10000);

        console.log('🚀 Inicializando serviços...');
        setWhatsAppSocket(sock);

        startKeepAlive(sock, {
          onStale: async () => {
            await forceReconnectFromKeepAlive();
          },
        });

        startWhatsAppWorker();

        console.log('🚀 Iniciando bot...');
        clearMainTimer();
        void main(sock);
      }

      if (connection === 'close') {
        const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
        const shouldReconnect = statusCode !== 401;

        console.log('🔄 Conexão fechada. Reconectar:', shouldReconnect);

        hasStarted = false;
        currentSock = null;
        clearMainTimer();
        stopKeepAlive();
        clearWhatsAppSocket();

        if (statusCode === 401) {
          console.log('❌ Sessão inválida detectada. Limpando credenciais e refazendo pareamento...');
          await resetWhatsAppSession();
          await scheduleReconnect(5000);
          return;
        }

        if (shouldReconnect) {
          await scheduleReconnect(5000);
        }
      }
    });

    sock.ev.on('creds.update', () => {
      console.log('🔐 Credenciais atualizadas');
    });
  } catch (error) {
    console.error('❌ Erro fatal ao iniciar:', error);
    await scheduleReconnect(10000);
  } finally {
    isStarting = false;
  }
}

void start();