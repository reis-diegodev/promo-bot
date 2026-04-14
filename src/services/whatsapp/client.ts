import makeWASocket, {
    DisconnectReason,
    useMultiFileAuthState,
    fetchLatestBaileysVersion
} from '@whiskeysockets/baileys';
import Pino from 'pino';

export async function connectToWhatsApp() {
    const authPath = 'auth_info_baileys';
    const { state, saveCreds } = await useMultiFileAuthState(authPath);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false, // Usaremos o código de pareamento
        logger: Pino({ level: 'silent' }),
        version,
        browser: ["Ubuntu", "Chrome", "131.0.6778.204"],
        markOnlineOnConnect: false,       // Não mostra você como "Online" ao conectar
        syncFullHistory: false,
        shouldSyncHistoryMessage: () => false,
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 0, // Sem timeout para queries
        keepAliveIntervalMs: 10000,
    });

    // Salva as credenciais sempre que houver atualização
    sock.ev.on('creds.update', saveCreds);

    // SOLICITAÇÃO DE CÓDIGO (Apenas se não estiver registrado)
    if (!sock.authState.creds.registered) {
        // Delay de 10s para garantir que o socket estabilizou a tentativa de conexão
        setTimeout(async () => {
            try {
                const phoneNumber = "5581993203695";
                console.log(`⏳ Solicitando CÓDIGO ÚNICO para: ${phoneNumber}...`);
                const code = await sock.requestPairingCode(phoneNumber);
                console.log('\n================================================');
                console.log('🔒 CÓDIGO DE PAREAMENTO (DIGITE AGORA NO CELULAR):');
                console.log(`   ${code}`);
                console.log('================================================\n');
            } catch (err) {
                console.error("⚠️ Falha ao gerar código. Verifique se o número está correto.");
            }
        }, 10000);
    }

    return sock;
}