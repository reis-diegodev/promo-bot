import 'dotenv/config';
import express from 'express';
import { scrapeMercadoLivre } from './services/scraper/mercadolivre';
import { processAndSendPromos } from './services/promo';
import { connectToWhatsApp } from './services/whatsapp/client';
import { startWhatsAppWorker } from './workers/whatsapp.worker';
import { startKeepAlive } from './services/whatsapp.keepalive';
import { ScrapedPromo } from './services/scraper/types';

const app = express();
const PORT = process.env.PORT || 3000;
let hasStarted = false;
let isMainRunning = false;

const SEARCH_TERMS = [
    "Creatina",
    "Tenis Nike",
    "Tenis Adidas",
    "Tenis Kappa",
    "Tenis Fila",
    "Tenis Olympikus",
];

function shuffleArray(array: any[]) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function parsePrice(priceStr: string): number {
    const clean = priceStr.replace(/[R$\s.]/g, '').replace(',', '.');
    return parseFloat(clean) || 0;
}

function isWithinOperatingHours(): boolean {
    const now = new Date();
    const hour = now.toLocaleString('pt-BR', {
        timeZone: 'America/Recife',
        hour: 'numeric',
        hour12: false
    });
    const h = parseInt(hour);
    return h >= 9 && h < 22;
}

app.get('/', (req, res) => res.send('Promo-Bot is Active! 🚀'));
app.listen(PORT, () => console.log(`📡 Server listening on port ${PORT}`));

async function main(sock: any) {
    if (isMainRunning) return;

    if (!isWithinOperatingHours()) {
        const now = new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Recife' });
        console.log(`🌙 Fora do horário de operação (${now}) — próxima verificação em 30min`);
        setTimeout(() => main(sock), 30 * 60 * 1000);
        return;
    }

    isMainRunning = true;

    try {
        console.log('\n🚀 Iniciando Ciclo...');
        const roundTerms = shuffleArray([...SEARCH_TERMS]).slice(0, 3);

        for (const term of roundTerms) {
            console.log(`\n🔎 Caçando: "${term}" (Limite R$ 500)`);

            try {
                const mlPromos = await Promise.race([
                    scrapeMercadoLivre(term),
                    new Promise<ScrapedPromo[]>((resolve) =>
                        setTimeout(() => {
                            console.warn(`⚠️ Timeout no termo: "${term}" — pulando`);
                            resolve([]);
                        }, 90000)
                    )
                ]);

                const filteredMl = mlPromos.filter(p => parsePrice(p.price) <= 500);
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
        setTimeout(() => main(sock), 60 * 60 * 1000);
    }
}

async function start() {
    console.log('🚀 Iniciando Instância do Promo-Bot...');

    try {
        const sock = await connectToWhatsApp();

        sock.ev.on('connection.update', async ({ connection, lastDisconnect }) => {
            if (connection === 'open' && !hasStarted) {
                hasStarted = true;
                console.log('✅ WHATSAPP CONECTADO COM SUCESSO!');
                console.log('⏳ Aguardando estabilização...');
                await wait(10000);
                console.log('🚀 Inicializando serviços...');
                startKeepAlive(sock);
                startWhatsAppWorker(sock);
                console.log('🚀 Iniciando bot...');
                main(sock);
            }

            if (connection === 'close') {
                const shouldReconnect =
                    (lastDisconnect?.error as any)?.output?.statusCode !== 401;
                console.log('🔄 Conexão fechada. Reconectar:', shouldReconnect);
                hasStarted = false;
                if (shouldReconnect) {
                    setTimeout(() => start(), 5000);
                } else {
                    console.log('❌ Sessão inválida. Refaça o pareamento.');
                }
            }
        });

        sock.ev.on('creds.update', () => {
            console.log('🔐 Credenciais atualizadas (sessão ativa)');
        });
    } catch (error) {
        console.error('❌ Erro fatal ao iniciar:', error);
        setTimeout(() => start(), 10000);
    }
}

start();