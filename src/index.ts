import 'dotenv/config';
import { scrapeAmazon } from './services/scraper/amazon';
import { processAndSendPromos } from './services/promo';

// Lista de desejos rotativa
const SEARCH_TERMS = [
    'creatina monohidratada',
    'whey protein concentrado',
    'tênis corrida',
    'smartwatch garmin',
    'relogio amazfit',
    'garrafa termica academia',
    'roupa dry fit',
    'pré treino',
    'barra de proteina',
    'fone de ouvido esportivo'
];

async function main() {
    console.log('🚀 Iniciando Ciclo do Promo-Bot...');
    
    try {
        // ESCOLHA ALEATÓRIA: Pega um termo da lista sorteado
        const term = SEARCH_TERMS[Math.floor(Math.random() * SEARCH_TERMS.length)];
        
        // Passa o termo sorteado para o scraper
        const promos = await scrapeAmazon(term);

        if (promos.length > 0) {
            await processAndSendPromos(promos);
        } else {
            console.log('⚠️ Nenhuma promoção válida encontrada nesta rodada.');
        }

    } catch (error) {
        console.error('🔥 Erro fatal no loop principal:', error);
    } finally {
        console.log('👋 Ciclo encerrado.');
        process.exit(0);
    }
}

main();