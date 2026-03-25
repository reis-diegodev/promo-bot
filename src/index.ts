import 'dotenv/config';
import express from 'express';
import { scrapeAmazon } from './services/scraper/amazon';
import { scrapeMercadoLivre } from './services/scraper/mercadolivre';
import { scrapeNetshoes } from './services/scraper/netshoes';
import { processAndSendPromos } from './services/promo';
import { connectToWhatsApp } from './services/whatsapp/client';

let isMainRunning = false;
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Bot is running! 🚀'));
app.listen(PORT, () => console.log(`📡 Server listening on port ${PORT}`));

const MAX_OFFERS_PER_STORE = 5;

// 💎 LISTA PREMIUM
const SEARCH_TERMS = [
    'Creatina Max Titanium', 'Creatina Dux Nutrition', 'Creatina Integralmedica',
    'Whey Protein Dux', 'Whey Protein Gold Standard', 'Whey Protein Max Titanium',
    'Pré Treino Psichotic', 'Pré Treino Haze', 'Barra de Proteina Bold', 'Barra de Proteina YoPro',
    'Tênis Nike Corrida Masculino', 'Tênis Nike Corrida Feminino', 'Tênis Adidas Ultraboost',
    'Tênis Asics Nimbus', 'Tênis Mizuno Wave', 'Tênis Olympikus Corre 3',
    'Roupa Nike Dry Fit', 'Roupa Under Armour', 'Shorts Adidas Academia', 'Legging Live Fitness',
    'Relógio Garmin Forerunner', 'Apple Watch Series', 'Smartwatch Samsung Galaxy Watch',
    'Fone JBL Endurance', 'Garrafa Stanley Original', 'Mochila Nike Brasília'
];

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function shuffleArray(array: string[]) {
    const newArray = [...array];
    for (let i = newArray.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
    }
    return newArray;
}

async function main(sock: any) {
    console.log('\n🚀 Iniciando Ciclo de busca de ofertas...');

    try {
        const termsToSearch = shuffleArray(SEARCH_TERMS).slice(0, 3);
        console.log(`📋 Vitrine da rodada: [ ${termsToSearch.join(', ')} ]`);

        for (const term of termsToSearch) {
            console.log(`\n========================================`);
            console.log(`🔎 Caçando ofertas de: "${term}"`);
            console.log(`========================================`);

            // 1. AMAZON
            try {
                const amazonPromos = await scrapeAmazon(term);
                if (amazonPromos.length > 0) {
                    const top = amazonPromos.slice(0, MAX_OFFERS_PER_STORE);
                    console.log(`   📦 Amazon: ${amazonPromos.length} achadas. A enviar Top ${top.length}...`);
                    await processAndSendPromos(top, sock, 'Amazon');
                } else {
                    console.log(`   🍂 Amazon: Nada relevante encontrado.`);
                }
            } catch (err) { console.error(`   ❌ Erro Amazon:`, err); }

            await wait(5000 + Math.random() * 3000);

            // 2. MERCADO LIVRE
            try {
                const mlPromos = await scrapeMercadoLivre(term);
                if (mlPromos.length > 0) {
                    const top = mlPromos.slice(0, MAX_OFFERS_PER_STORE);
                    console.log(`   📦 ML: ${mlPromos.length} achadas. A enviar Top ${top.length}...`);
                    await processAndSendPromos(top, sock, 'Mercado Livre');
                } else {
                    console.log(`   🍂 ML: Nada relevante (>35%) encontrado.`);
                }
            } catch (err) { console.error(`   ❌ Erro ML:`, err); }

            await wait(5000 + Math.random() * 3000);

            // 3. NETSHOES
            try {
                const nsPromos = await scrapeNetshoes(term);
                if (nsPromos.length > 0) {
                    const top = nsPromos.slice(0, MAX_OFFERS_PER_STORE);
                    console.log(`   📦 Netshoes: ${nsPromos.length} achadas. A enviar Top ${top.length}...`);
                    await processAndSendPromos(top, sock, 'Netshoes');
                } else {
                    console.log(`   🍂 Netshoes: Nada relevante (>35%) encontrado.`);
                }
            } catch (err) { console.error(`   ❌ Erro Netshoes:`, err); }

            if (term !== termsToSearch[termsToSearch.length - 1]) {
                const nextTermDelay = 10000 + Math.random() * 5000;
                console.log(`\n🛌 A descansar antes da próxima marca... (${(nextTermDelay / 1000).toFixed(1)}s)`);
                await wait(nextTermDelay);
            }
        }

    } catch (error) {
        console.error('🔥 Erro no ciclo:', error);
    } finally {
        console.log('\n👋 Ciclo encerrado. Próxima rodada em 1 hora...');
        setTimeout(() => main(sock), 60 * 60 * 1000);
    }
}

async function start() {
    console.log('🚀 Iniciando Ciclo do Promo-Bot...');
    
    const sock = await connectToWhatsApp();

    sock.ev.on('connection.update', async (update) => {
        const { connection } = update;

        if (connection === 'open') {
            console.log('✅ Conexão Totalmente Estabelecida!');
            
            // Controle para não rodar o main() várias vezes
            if (!isMainRunning) { 
                isMainRunning = true;
                console.log('⏳ Aguardando 10s para estabilizar o envio...');
                await wait(10000);
                main(sock); 
            }
        }
    });

    // GATILHO DE EMERGÊNCIA: Caso o evento 'open' demore por causa do histórico
    setTimeout(async () => {
        // sock.user indica que a sessão já existe, mesmo em sincronização
        if (sock.user && !isMainRunning) {
            console.log('⚡ Conexão detectada via Socket (Forçando início do Ciclo)...');
            isMainRunning = true;
            main(sock);
        }
    }, 30000); 
}

start();