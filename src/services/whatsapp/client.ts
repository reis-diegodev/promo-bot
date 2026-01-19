import makeWASocket, { DisconnectReason, useMultiFileAuthState } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';

export async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false, // Desligamos o QR Code nativo (que quebra no Render)
        browser: ["PromoBot", "Chrome", "1.0.0"], // Identificação do bot
    });

    // Lógica do Código de Pareamento
    if (!sock.authState.creds.registered) {
        const phoneNumber = process.env.BOT_PHONE_NUMBER;

        if (phoneNumber) {
            // Espera um pouquinho para o socket estabilizar
            setTimeout(async () => {
                try {
                    // Limpa o número de caracteres não numéricos
                    const cleanPhone = phoneNumber.replace(/[^0-9]/g, '');
                    
                    console.log(`⏳ Solicitando código de pareamento para: ${cleanPhone}...`);
                    const code = await sock.requestPairingCode(cleanPhone);
                    
                    console.log('================================================');
                    console.log('🔒 CÓDIGO DE PAREAMENTO WHATSAPP:');
                    console.log(`   ${code?.match(/.{1,4}/g)?.join('-') || code}`); 
                    console.log('================================================');
                    console.log('👉 No celular vá em: Aparelhos Conectados > Conectar > Conectar com número de telefone');
                } catch (error) {
                    console.error('❌ Falha ao pedir código:', error);
                }
            }, 3000);
        } else {
            console.log('⚠️ BOT_PHONE_NUMBER não definido no .env. O QR Code não será exibido.');
        }
    }

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        // Se NÃO tiver telefone configurado, tenta mostrar o QR Code (modo fallback)
        if (qr && !process.env.BOT_PHONE_NUMBER) {
            console.log('⚠️ QR Code recebido (Configure BOT_PHONE_NUMBER para usar código de texto).');
        }

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log(`❌ Conexão caiu. Reconectando? ${shouldReconnect}`);
            
            if (shouldReconnect) {
                connectToWhatsApp();
            }
        } else if (connection === 'open') {
            console.log('✅ WhatsApp conectado com sucesso!');
        }
    });

    return sock;
}