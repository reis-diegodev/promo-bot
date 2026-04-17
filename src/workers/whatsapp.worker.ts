import { WASocket } from '@whiskeysockets/baileys';
import { getNextJob } from '../queue/message.queue';
import { isWhatsAppReady } from '../utils/whatsapp.utils';

let currentSock: WASocket | null = null;
let workerInterval: NodeJS.Timeout | null = null;
let isProcessing = false;

export function setWhatsAppSocket(sock: WASocket) {
  currentSock = sock;
  console.log('🔌 Socket do WhatsApp atualizado no worker');
}

export function clearWhatsAppSocket() {
  currentSock = null;
  console.log('🧹 Socket do WhatsApp removido do worker');
}

export function startWhatsAppWorker() {
  if (workerInterval) {
    console.log('ℹ️ Worker já está iniciado');
    return;
  }

  console.log('📤 Worker de envio iniciado...');

  workerInterval = setInterval(async () => {
    if (isProcessing) return;

    try {
      if (!currentSock) {
        console.log('⚠️ Socket do WhatsApp indisponível — aguardando...');
        return;
      }

      if (!isWhatsAppReady(currentSock)) {
        console.log('⚠️ WhatsApp não pronto — aguardando...');
        return;
      }

      const job = getNextJob();
      if (!job) return;

      isProcessing = true;

      if (job.image) {
        await currentSock.sendMessage(job.groupId, {
          image: { url: job.image },
          caption: job.caption,
        });
      } else {
        await currentSock.sendMessage(job.groupId, {
          text: job.caption,
        });
      }

      console.log('✅ Mensagem enviada');
    } catch (error: any) {
      const message = error?.message || '';
      const statusCode = error?.output?.statusCode;

      if (message.includes('Connection Closed') || statusCode === 428) {
        console.warn('⚠️ Envio falhou porque a conexão está fechada. Aguardando reconexão...');
        return;
      }

      console.error('❌ Erro no worker:', error);
    } finally {
      isProcessing = false;
    }
  }, 5000);
}

export function stopWhatsAppWorker() {
  if (workerInterval) {
    clearInterval(workerInterval);
    workerInterval = null;
    console.log('🛑 Worker de envio parado');
  }

  currentSock = null;
  isProcessing = false;
}