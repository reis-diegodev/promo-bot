import 'dotenv/config';
import { scrapeAmazon } from './services/scraper/amazon';
import { scrapeMercadoLivre } from './services/scraper/mercadolivre';
import { scrapeNetshoes } from './services/scraper/netshoes';
import { processAndSendPromos } from './services/promo';
import { connectToWhatsApp } from './services/whatsapp/client';

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
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

async function main() {
    console.log('🚀 Iniciando Ciclo do Promo-Bot (Com Assinaturas Personalizadas)...');
    
    console.log('📱 Conectando ao WhatsApp...');
    const sock = await connectToWhatsApp();
    console.log('✅ Conexão estabelecida.');

    try {
        const termsToSearch = shuffleArray([...SEARCH_TERMS]).slice(0, 3);
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
                    // PASSANDO O NOME DA LOJA AQUI 👇
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
                    // PASSANDO O NOME DA LOJA AQUI 👇
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
                    // PASSANDO O NOME DA LOJA AQUI 👇
                    await processAndSendPromos(top, sock, 'Netshoes');
                } else {
                    console.log(`   🍂 Netshoes: Nada relevante (>35%) encontrado.`);
                }
            } catch (err) { console.error(`   ❌ Erro Netshoes:`, err); }

            if (term !== termsToSearch[termsToSearch.length - 1]) {
                const nextTermDelay = 10000 + Math.random() * 5000;
                console.log(`\n🛌 A descansar antes da próxima marca... (${(nextTermDelay/1000).toFixed(1)}s)`);
                await wait(nextTermDelay);
            }
        }

    } catch (error) {
        console.error('🔥 Erro fatal:', error);
    } finally {
        console.log('\n👋 Ciclo encerrado.');
        process.exit(0);
    }
}

main();