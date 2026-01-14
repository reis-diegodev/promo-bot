import 'dotenv/config';
import { scrapeAmazon } from './services/scraper/amazon';
import { scrapeMercadoLivre } from './services/scraper/mercadolivre';
import { processAndSendPromos } from './services/promo';
import { ScrapedPromo } from './services/scraper/types';

const SEARCH_TERMS = [
    'creatina monohidratada', 'whey protein concentrado', 'tênis corrida masculino',
    'tênis corrida feminino', 'smartwatch garmin', 'relogio amazfit',
    'garrafa termica academia',
    'roupa dry fit', 'pré treino', 'barra de proteina', 'fone de ouvido',
];

// Função de espera (Sleep) para não parecer robô
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Função para embaralhar array (Fisher-Yates Shuffle)
function shuffleArray(array: string[]) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

async function main() {
    console.log('🚀 Iniciando Ciclo do Promo-Bot (Modo Lote Suave)...');
    
    try {
        // 1. Embaralha e pega 3 termos
        const termsToSearch = shuffleArray([...SEARCH_TERMS]).slice(0, 3);
        console.log(`📋 Termos sorteados para hoje: [ ${termsToSearch.join(', ')} ]`);

        // 2. Decide a loja da vez (Mantemos 1 loja por execução para ser rápido)
        const isAmazon = Math.random() > 0.5;
        const storeName = isAmazon ? 'Amazon' : 'Mercado Livre';
        const scraperFunction = isAmazon ? scrapeAmazon : scrapeMercadoLivre;

        console.log(`🏪 Loja selecionada: ${storeName}`);

        // 3. Loop pelos 3 termos
        for (const term of termsToSearch) {
            console.log(`\n--- 🔍 Buscando: "${term}" em ${storeName} ---`);
            
            try {
                const promos = await scraperFunction(term);

                if (promos.length > 0) {
                    console.log(`   📦 ${promos.length} ofertas candidatas. Processando envio...`);
                    await processAndSendPromos(promos);
                } else {
                    console.log(`   ⚠️ Nada relevante (>25%) para "${term}".`);
                }

            } catch (err) {
                console.error(`   ❌ Erro ao buscar "${term}":`, err);
            }

            // 4. PAUSA ESTRATÉGICA (Anti-Bloqueio)
            // Espera entre 10 e 15 segundos antes da próxima busca
            if (term !== termsToSearch[termsToSearch.length - 1]) {
                const delay = 10000 + Math.random() * 5000;
                console.log(`⏳ Respirando por ${(delay/1000).toFixed(1)}s para evitar bloqueio...`);
                await wait(delay);
            }
        }

    } catch (error) {
        console.error('🔥 Erro fatal no loop principal:', error);
    } finally {
        console.log('\n👋 Ciclo de Lote encerrado.');
        process.exit(0);
    }
}

main();