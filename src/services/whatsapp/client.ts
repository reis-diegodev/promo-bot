import makeWASocket, {
  useMultiFileAuthState,
  fetchLatestBaileysVersion
} from '@whiskeysockets/baileys';
import Pino from 'pino';

export const BAILEYS_AUTH_PATH = 'auth_info_baileys';

export async function connectToWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState(BAILEYS_AUTH_PATH);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    logger: Pino({ level: 'silent' }),
    version,
    browser: ['Ubuntu', 'Chrome', '131.0.6778.204'],
    markOnlineOnConnect: false,
    syncFullHistory: false,
    shouldSyncHistoryMessage: () => false,
    connectTimeoutMs: 60000,
    defaultQueryTimeoutMs: 0,
    keepAliveIntervalMs: 10000,
  });

  sock.ev.on('creds.update', saveCreds);

  if (!sock.authState.creds.registered) {
    setTimeout(async () => {
      try {
        const phoneNumber = process.env.WHATSAPP_PAIRING_NUMBER;

        if (!phoneNumber) {
          throw new Error('WHATSAPP_PAIRING_NUMBER não definida');
        }

        console.log(`⏳ Solicitando código para: ${phoneNumber}...`);
        const code = await sock.requestPairingCode(phoneNumber);

        console.log('\n================================================');
        console.log('🔒 CÓDIGO DE PAREAMENTO (DIGITE AGORA NO CELULAR):');
        console.log(`   ${code}`);
        console.log('================================================\n');
      } catch (err) {
        console.error('⚠️ Falha ao gerar código:', err);
      }
    }, 5000);
  }

  return sock;
}