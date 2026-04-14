import { WASocket } from '@whiskeysockets/baileys';
import { getNextJob } from '../queue/message.queue';
import { isWhatsAppReady } from '../utils/whatsapp.utils';

export function startWhatsAppWorker(sock: WASocket) {
    console.log('📤 Worker de envio iniciado...');

    setInterval(async () => {
        try {
            if (!isWhatsAppReady(sock)) {
                console.log('⚠️ WhatsApp não pronto — aguardando...');
                return;
            }

            const job = getNextJob();
            if (!job) return;

            if (job.image) {
                await sock.sendMessage(job.groupId, {
                    image: { url: job.image },
                    caption: job.caption
                });
            } else {
                await sock.sendMessage(job.groupId, {
                    text: job.caption
                });
            }

            console.log('✅ Mensagem enviada');

        } catch (error) {
            console.error('❌ Erro no worker:', error);
        }
    }, 5000);
}