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

async function getImagesFromCard(imgEl: ElementHandle<SVGElement | HTMLElement> | null): Promise<{ main: string, all: string[] }> {
    if (!imgEl) return { main: '', all: [] };
    const allImages: string[] = [];
    const srcset = await imgEl.getAttribute('srcset').catch(() => '');
    let mainUrl = await imgEl.getAttribute('src').catch(() => '') || '';

    if (srcset) {
        const parts = srcset.split(',');
        const lastPart = parts[parts.length - 1].trim();
        const largestUrl = lastPart.split(' ')[0];
        if (largestUrl && largestUrl.startsWith('http')) {
            mainUrl = largestUrl.replace(/\._AC_.*_\./, '.');
        }
    }
    allImages.push(mainUrl);

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
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        viewport: { width: 1280, height: 720 }
    });
    
    const page = await context.newPage();
    const results: ScrapedPromo[] = [];

    try {
        const url = `https://www.amazon.com.br/s?k=${encodeURIComponent(searchTerm)}`;
        
        // ESTRATÉGIA DE EVASÃO: 'commit' é mais rápido e evita timeouts de scripts de rastreio
        await page.goto(url, { waitUntil: 'commit', timeout: 45000 });

        // Espera manual apenas pelos cards, sem travar o processo
        await page.waitForSelector('[data-component-type="s-search-result"]', { timeout: 15000 }).catch(() => {
            console.log('⚠️ Aviso: Cards demoraram, tentando prosseguir...');
        });

        await page.evaluate(() => window.scrollBy(0, 600));
        await new Promise(r => setTimeout(r, 2000));

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
                    const imgEl = await card.$('img.s-image');
                    const { main, all } = await getImagesFromCard(imgEl);

                    results.push({
                        title: cleanTitle(title),
                        price: priceStr,
                        originalPrice: originalPriceStr,
                        url: finalUrl,
                        imageUrl: main,
                        additionalImages: all
                    });
                }
            } catch (err) { continue; }
        }
    } catch (error: any) {
        console.error('❌ Erro no scraper Amazon:', error?.message || error);
    } finally {
        await browser.close();
    }
    return results;
}