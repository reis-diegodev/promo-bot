import { chromium, ElementHandle } from 'playwright';
import { ScrapedPromo } from './types';

const MIN_DISCOUNT_PERCENT = 30;

function cleanTitle(title: string): string {
    let clean = title.replace(/\b(frete grátis|envio imediato|original|promoção|oferta|lançamento|novo|lacrado|nfc|brindes?|top)\b/gi, '');
    clean = clean.replace(/\s+/g, ' ').trim();
    return clean.length > 60 ? clean.substring(0, 60).trim() + '...' : clean;
}

function getProductUrl(rawUrl: string): string {
    try {
        let urlToProcess = rawUrl;
        if (rawUrl.includes('/sspa/click')) {
            const urlObj = new URL(rawUrl);
            const innerUrl = urlObj.searchParams.get('url');
            if (innerUrl) urlToProcess = decodeURIComponent(innerUrl);
        }
        const match = urlToProcess.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/);
        if (match && match[1]) return `https://www.amazon.com.br/dp/${match[1]}?tag=promobot-20`;
        return rawUrl;
    } catch (e) {
        return rawUrl;
    }
}

function parsePrice(priceStr: string): number {
    if (!priceStr) return 0;
    const cleanStr = priceStr.replace(/[^0-9,]/g, '').replace(',', '.');
    return parseFloat(cleanStr);
}

// Extrai a imagem em alta resolução e tenta encontrar outras na galeria do card
async function getImagesFromCard(imgEl: ElementHandle<SVGElement | HTMLElement> | null): Promise<{ main: string, all: string[] }> {
    if (!imgEl) return { main: '', all: [] };

    const allImages: string[] = [];
    
    // Tenta pegar a imagem principal via srcset (maior qualidade)
    const srcset = await imgEl.getAttribute('srcset').catch(() => '');
    let mainUrl = await imgEl.getAttribute('src').catch(() => '') || '';

    if (srcset) {
        const parts = srcset.split(',');
        const lastPart = parts[parts.length - 1].trim();
        const largestUrl = lastPart.split(' ')[0];
        if (largestUrl && largestUrl.startsWith('http')) {
            mainUrl = largestUrl.replace(/\._AC_.*_\./, '.'); // Remove sufixo de redimensionamento
        }
    }

    allImages.push(mainUrl);

    // No card de busca, a Amazon as vezes coloca variações no atributo data-image-variant-urls
    // Isso é ouro para a nossa lógica de fundo branco!
    const variants = await imgEl.getAttribute('data-image-variant-urls').catch(() => null);
    if (variants) {
        try {
            const variantList = JSON.parse(variants);
            allImages.push(...variantList);
        } catch (e) { /* ignore */ }
    }

    return { main: mainUrl, all: allImages };
}

export async function scrapeAmazon(searchTerm: string): Promise<ScrapedPromo[]> {
    console.log(`🕵️ AMAZON: Iniciando scrap ELITE para: "${searchTerm}"...`);

    const browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled']
    });
    
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        viewport: { width: 1280, height: 720 }
    });
    
    const page = await context.newPage();
    const results: ScrapedPromo[] = [];

    try {
        const url = `https://www.amazon.com.br/s?k=${encodeURIComponent(searchTerm)}`;
        
        // AJUSTE DE TIMEOUT PARA O RENDER: 60s e waitUntil 'networkidle'
        await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });

        // Scroll suave para carregar imagens lazy-load
        await page.evaluate(async () => {
            window.scrollBy(0, 800);
            await new Promise(r => setTimeout(r, 500));
        });

        const cards = await page.$$('[data-component-type="s-search-result"]');
        
        for (const card of cards.slice(0, 20)) {
            try {
                const title = await card.$eval('h2', el => el.textContent?.trim()).catch(() => '');
                if (!title || title.toLowerCase().includes('indisponível')) continue;

                const originalPriceStr = await card.$eval('.a-text-price .a-offscreen', el => el.textContent?.trim()).catch(() => '');
                const priceStr = await card.$eval('.a-price .a-offscreen', el => el.textContent?.trim()).catch(() => '');

                if (!originalPriceStr || !priceStr) continue;

                const originalPriceNum = parsePrice(originalPriceStr);
                const currentPriceNum = parsePrice(priceStr);
                const discountPercent = ((originalPriceNum - currentPriceNum) / originalPriceNum) * 100;

                if (discountPercent < MIN_DISCOUNT_PERCENT) continue;

                const relativeLink = await card.$eval('h2 a', el => el.getAttribute('href')).catch(() => '');
                
                if (relativeLink) {
                    const finalUrl = getProductUrl(`https://www.amazon.com.br${relativeLink}`);
                    
                    // BUSCA DE IMAGENS PARA O ANALYZER
                    const imgEl = await card.$('img.s-image');
                    const { main, all } = await getImagesFromCard(imgEl);

                    results.push({
                        title: cleanTitle(title),
                        price: priceStr,
                        originalPrice: originalPriceStr,
                        url: finalUrl,
                        imageUrl: main,
                        additionalImages: all // Agora o promo.ts tem a galeria para fugir do fundo branco!
                    });
                }
            } catch (err) { continue; }
        }
    } catch (error) {
        console.error('❌ Erro no scraper Amazon (Timeout ou Bloqueio):', error.message);
    } finally {
        await browser.close();
    }

    return results;
}