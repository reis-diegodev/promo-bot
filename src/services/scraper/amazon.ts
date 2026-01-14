import { chromium, ElementHandle } from 'playwright';
import { ScrapedPromo } from './types';

const MIN_DISCOUNT_PERCENT = 30;

function cleanTitle(title: string): string {
    let clean = title.replace(/\b(frete grátis|envio imediato|original|promoção|oferta|lançamento|novo|lacrado|nfc|brindes?|top)\b/gi, '');
    clean = clean.replace(/\s+/g, ' ').trim();
    if (clean.length > 60) {
        return clean.substring(0, 60).trim() + '...';
    }
    return clean;
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

// NOVO: Função para extrair a melhor imagem possível
async function getHighResImageUrl(imgEl: ElementHandle<SVGElement | HTMLElement> | null, card: ElementHandle<SVGElement | HTMLElement>): Promise<string> {
    if (!imgEl) return '';

    // Tenta pegar o srcset (lista de imagens de vários tamanhos)
    const srcset = await imgEl.getAttribute('srcset').catch(() => '');

    if (srcset) {
        // Exemplo de srcset: "link_pequeno 1x, link_medio 1.5x, link_grande 2x"
        // Dividimos por vírgula e pegamos o último pedaço, que costuma ser o maior.
        const parts = srcset.split(',');
        const lastPart = parts[parts.length - 1].trim(); // "link_grande 2x"
        const largestUrl = lastPart.split(' ')[0]; // "link_grande"
        if (largestUrl && largestUrl.startsWith('http')) {
            // Truque extra: remove sufixos de tamanho da Amazon (ex: ._AC_UL320_) para tentar pegar a original
            return largestUrl.replace(/\._AC_.*_\./, '.');
        }
    }

    // Fallback: se não tiver srcset, usa o src normal
    return await imgEl.getAttribute('src').catch(() => '') || '';
}


export async function scrapeAmazon(searchTerm: string): Promise<ScrapedPromo[]> {
    console.log(`🕵️ AMAZON: Iniciando scrap ELITE (> ${MIN_DISCOUNT_PERCENT}%) para: "${searchTerm}"...`);

    const browser = await chromium.launch({
        headless: true,
        args: [
            '--disable-blink-features=AutomationControlled',
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-infobars',
            '--window-position=0,0',
            '--ignore-certifcate-errors',
            '--ignore-certifcate-errors-spki-list',
            '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        ]
    });
    const context = await browser.newContext({
        viewport: { width: 1366, height: 768 } // Tamanho de tela de notebook comum
    });
    const page = await context.newPage();

    const results: ScrapedPromo[] = [];

    try {
        const url = `https://www.amazon.com.br/s?k=${encodeURIComponent(searchTerm)}`;
        await page.goto(url, { waitUntil: 'domcontentloaded' });

        await page.evaluate(async () => {
            for (let i = 0; i < 2000; i += 200) {
                window.scrollTo(0, i);
                await new Promise(resolve => setTimeout(resolve, 50));
            }
        });

        const cards = await page.$$('[data-component-type="s-search-result"]');
        console.log(`🔎 Cards analisados: ${cards.length}`);

        for (const card of cards.slice(0, 30)) {
            try {
                let title = await card.$eval('h2', el => el.textContent?.trim()).catch(() => '');
                if (!title) title = await card.$eval('.a-text-normal', el => el.textContent?.trim()).catch(() => '');
                if (!title || title.toLowerCase().includes('indisponível')) continue;

                const originalPriceStr = await card.$eval('.a-text-price .a-offscreen', el => el.textContent?.trim()).catch(() => '');
                let priceStr = await card.$eval('.a-price .a-offscreen', el => el.textContent?.trim()).catch(() => '');
                if (!priceStr) priceStr = await card.$eval('.a-price-whole', el => el.textContent?.trim()).catch(() => '');

                if (!originalPriceStr || !priceStr) continue;

                const originalPriceNum = parsePrice(originalPriceStr);
                const currentPriceNum = parsePrice(priceStr);

                if (originalPriceNum <= currentPriceNum) continue;
                const discountPercent = ((originalPriceNum - currentPriceNum) / originalPriceNum) * 100;

                if (discountPercent < MIN_DISCOUNT_PERCENT) {
                    console.log(`      ⚠️ Ignorado: ${discountPercent.toFixed(0)}% OFF (Fraco) - ${title.substring(0, 20)}...`);
                    continue;
                }

                let relativeLink: string | null = null;
                const linkH2 = await card.$('h2 a');
                if (linkH2) relativeLink = await linkH2.getAttribute('href');
                if (!relativeLink) {
                    const linkImg = await card.$('.s-product-image-container a');
                    if (linkImg) relativeLink = await linkImg.getAttribute('href');
                }

                if (relativeLink) {
                    const fullLink = `https://www.amazon.com.br${relativeLink}`;
                    const finalUrl = getProductUrl(fullLink);

                    const cleanTitleText = cleanTitle(title);

                    // AQUI ESTÁ A MUDANÇA DA IMAGEM
                    const imgEl = await card.$('img.s-image');
                    const imageUrl = await getHighResImageUrl(imgEl, card);

                    console.log(`   💎 AMAZON ELITE: -${discountPercent.toFixed(0)}% OFF | "${title.substring(0, 20)}..."`);

                    results.push({
                        title: cleanTitleText,
                        price: priceStr,
                        originalPrice: originalPriceStr,
                        url: finalUrl,
                        imageUrl: imageUrl
                    });
                }

            } catch (err) {
                continue;
            }
        }

    } catch (error) {
        console.error('❌ Erro no scraper Amazon:', error);
    } finally {
        await browser.close();
    }

    return results;
}