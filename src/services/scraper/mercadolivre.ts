import { chromium } from 'playwright';
import { ScrapedPromo } from './types';

const MIN_DISCOUNT_PERCENT = 40; 
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function cleanTitle(title: string): string {
    let clean = title.replace(/\b(frete grátis|envio imediato|original|promoção|oferta|lançamento|novo|lacrado|nfc|brindes?|top)\b/gi, '');
    clean = clean.replace(/\s+/g, ' ').trim();
    return clean.length > 60 ? clean.substring(0, 60).trim() + '...' : clean;
}

/**
 * LÓGICA DE LINK BLINDADA: 
 * O ML usa links dinâmicos. A melhor forma de não quebrar o link é 
 * capturar a URL completa e apenas remover parâmetros de busca de usuário (tracking),
 * mantendo a estrutura que o Mercado Livre usa para o redirecionamento interno.
 */
function getShortMlLink(rawUrl: string): string {
    if (!rawUrl) return '';

    // 1. Tenta extrair o ID MLB (Ex: MLB12345678)
    // O ML às vezes usa hífen, às vezes não. O regex abaixo pega ambos.
    const mlbMatch = rawUrl.match(/MLB-?(\d{8,15})/i);
    if (mlbMatch) {
        return `https://produto.mercadolivre.com.br/MLB-${mlbMatch[1]}`;
    }

    // 2. Se for link de "pdp" (página de produto) sem MLB no nome
    if (rawUrl.includes('/p/MLB')) {
        return rawUrl.split('?')[0].split('#')[0];
    }

    // 3. Se for link de anúncio/redirecionamento (ex: /jm/click)
    // Esses links SÃO sensíveis. Se limparmos o 'ad_id' ou 'click_id', eles quebram.
    // Nesses casos, apenas removemos o excesso de 'tracking' de rede social.
    return rawUrl.split('&site_id=')[0]; 
}

function parseMlPrice(priceText: string): number {
    if (!priceText) return 0;
    const clean = priceText.replace(/[R$\s.]/g, '').replace(',', '.');
    return parseFloat(clean);
}

export async function scrapeMercadoLivre(searchTerm: string): Promise<ScrapedPromo[]> {
    console.log(`🕵️ ML: Iniciando busca de ELITE para: "${searchTerm}"...`);

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ userAgent: USER_AGENT });
    const page = await context.newPage();
    const results: ScrapedPromo[] = [];

    try {
        const url = `https://lista.mercadolivre.com.br/${encodeURIComponent(searchTerm).replace(/%20/g, '-')}_NoIndex_True`;
        // 'networkidle' é fundamental para que o ML termine de processar os scripts de preço
        await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
        
        const cards = await page.$$('li.ui-search-layout__item');

        for (const card of cards.slice(0, 20)) { 
            try {
                // TÍTULO E PREÇOS (Seletores Híbridos)
                const title = await card.$eval('.poly-component__title, .ui-search-item__title', el => (el as HTMLElement).innerText).catch(() => '');
                if (!title) continue;

                const originalPriceText = await card.$eval('.andes-money-amount--previous .andes-money-amount__fraction', el => (el as HTMLElement).innerText).catch(() => '');
                const currentPriceText = await card.$eval('.poly-price__current .andes-money-amount__fraction, .ui-search-price__second-line .price-tag-fraction', el => (el as HTMLElement).innerText).catch(() => '');
                
                if (!originalPriceText || !currentPriceText) continue;

                const originalNum = parseMlPrice(originalPriceText);
                const currentNum = parseMlPrice(currentPriceText);
                const discountPercent = ((originalNum - currentNum) / originalNum) * 100;

                if (discountPercent < MIN_DISCOUNT_PERCENT) continue;

                // URL - Captura mais genérica da tag 'a' para evitar erros de layout
                const rawLink = await card.$eval('a', el => (el as HTMLAnchorElement).href).catch(() => '');
                const finalUrl = getShortMlLink(rawLink);
                if (!finalUrl) continue;

                // IMAGENS - Tentativa de pegar a galeria se disponível
                const mainImage = await card.$eval('img', el => el.getAttribute('data-src') || el.getAttribute('src') || '').catch(() => '');
                
                // NOVIDADE: Captura do atributo de múltiplas imagens do card (se existir)
                const additionalImages: string[] = [mainImage];
                const dataImages = await card.$eval('.poly-component__picture, .ui-search-result-image__element', el => el.getAttribute('data-images')).catch(() => null);
                
                if (dataImages) {
                    const extraImages = dataImages.split(',');
                    additionalImages.push(...extraImages);
                }

                results.push({
                    title: cleanTitle(title),
                    price: currentPriceText,
                    originalPrice: originalPriceText,
                    url: finalUrl,
                    imageUrl: mainImage,
                    additionalImages // Agora o analyzer terá opções REAIS para fugir do fundo branco
                });
            } catch (err) { continue; }
        }
    } catch (error) { 
        console.error('❌ Erro crítico no Scraper ML:', error); 
    } finally { 
        await browser.close(); 
    }
    return results;
}