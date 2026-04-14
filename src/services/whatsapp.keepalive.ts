import { WASocket } from '@whiskeysockets/baileys';

export function startKeepAlive(sock: WASocket) {
    setInterval(async () => {
        try {
            if (!sock.user) return;

            // ping leve (mantém conexão viva)
            await sock.sendPresenceUpdate('available');

            console.log('💓 WhatsApp keep-alive');

        } catch (error) {
            console.log('⚠️ Keep-alive falhou');
        }
    }, 20000); // a cada 20s
}