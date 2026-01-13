import makeWASocket, { 
    DisconnectReason, 
    useMultiFileAuthState,
    makeCacheableSignalKeyStore,
    WASocket
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import qrcode from 'qrcode-terminal';
import pino from 'pino';
import path from 'path';

const AUTH_DIR = path.resolve(__dirname, '../../../auth_info_baileys');

export async function connectToWhatsApp(): Promise<WASocket> {
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    const logger = pino({ level: 'silent' });

    return new Promise((resolve, reject) => {
        const sock = makeWASocket({
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, logger),
            },
            printQRInTerminal: false,
            logger: logger,
            // Timeout maior para garantir conexões lentas
            connectTimeoutMs: 60000, 
        });

        sock.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect, qr } = update;

            if (qr) {
                console.log('\nScan this QR Code to connect:');
                qrcode.generate(qr, { small: true });
            }

            if (connection === 'open') {
                console.log('✅ WhatsApp connected successfully!');
                // AQUI ESTÁ O SEGREDO: Só devolvemos o socket quando ele está PRONTO.
                resolve(sock);
            }

            if (connection === 'close') {
                const shouldReconnect = (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
                
                // Se cair ANTES de conectar, precisamos rejeitar ou tentar de novo.
                // Mas para este script, vamos apenas logar.
                if (shouldReconnect) {
                    // Nota: Em um servidor real, faríamos recursão aqui. 
                    // No script de disparo único, é melhor falhar e rodar de novo via CRON.
                    console.log('❌ Connection closed temporarily.');
                }
            }
        });

        sock.ev.on('creds.update', saveCreds);
    });
}