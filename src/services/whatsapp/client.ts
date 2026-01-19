import makeWASocket, { DisconnectReason, useMultiFileAuthState } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';

export async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        // Configurações de Estabilidade para Servidor Linux
        browser: ["PromoBot", "Ubuntu", "3.0"], 
        syncFullHistory: false, // Deixa o boot mais rápido
        connectTimeoutMs: 60000, // Dá mais tempo para conectar
        keepAliveIntervalMs: 10000, // Pinga o servidor a cada 10s para não cair
        emitOwnEvents: false,
    });

    // Lógica do Código de Pareamento
    if (!sock.authState.creds.registered) {
        const phoneNumber = process.env.BOT_PHONE_NUMBER;

        if (phoneNumber) {
            // Aumentei o delay para 5s para garantir que o socket está pronto
            setTimeout(async () => {
                try {
                    const cleanPhone = phoneNumber.replace(/[^0-9]/g, '');
                    console.log(`⏳ Solicitando código de pareamento para: ${cleanPhone}...`);
                    
                    const code = await sock.requestPairingCode(cleanPhone);
                    
                    console.log('================================================');
                    console.log('🔒 CÓDIGO DE PAREAMENTO WHATSAPP:');
                    console.log(`   ${code?.match(/.{1,4}/g)?.join('-') || code}`); 
                    console.log('================================================');
                } catch (error) {
                    console.error('❌ Falha ao pedir código (Tentando novamente em breve):', error);
                }
            }, 5000);
        }
    }

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log(`❌ Conexão caiu. Reconectando? ${shouldReconnect}`);
            
            // Reconnect um pouco mais lento para evitar loop infinito rápido
            if (shouldReconnect) {
                setTimeout(() => connectToWhatsApp(), 3000);
            }
        } else if (connection === 'open') {
            console.log('✅ WhatsApp conectado e estável!');
        }
    });

    return sock;
}