import makeWASocket, { DisconnectReason, useMultiFileAuthState, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import Pino from 'pino';

export async function connectToWhatsApp() {
    const authPath = 'auth_info_baileys';
    const { state, saveCreds } = await useMultiFileAuthState(authPath);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: Pino({ level: 'error' }),
        version,
        browser: ["Ubuntu", "Chrome", "131.0.6778.204"],
        syncFullHistory: false,
        shouldSyncHistoryMessage: () => false,
        connectTimeoutMs: 60000,
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) setTimeout(() => connectToWhatsApp(), 10000);
        } else if (connection === 'open') {
            console.log('✅ WHATSAPP CONECTADO!');
        }
    });

    // ÚNICA SOLICITAÇÃO DE CÓDIGO - COM DELAY DE 20s PARA SEGURANÇA
    if (!sock.authState.creds.registered) {
        setTimeout(async () => {
            try {
                const phoneNumber = "5581993203695";
                console.log(`⏳ Solicitando CÓDIGO ÚNICO para: ${phoneNumber}...`);
                const code = await sock.requestPairingCode(phoneNumber);
                console.log('================================================');
                console.log('🔒 CÓDIGO DE PAREAMENTO (DIGITE AGORA):');
                console.log(`   ${code}`);
                console.log('================================================');
            } catch (err) {
                console.error("⚠️ Falha ao gerar código. Tente reiniciar em 1 minuto.");
            }
        }, 20000); // 20 segundos de espera para o socket estabilizar
    }

    return sock;
}