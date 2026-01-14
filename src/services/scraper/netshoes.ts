import { chromium } from 'playwright';
import { ScrapedPromo } from './types';

const MIN_DISCOUNT_PERCENT = 35; 
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// ENCURTADOR AGRESSIVO DE URL
function cleanNetshoesUrl(rawUrl: string): string {
    if (!rawUrl) return '';

    // 1. Garante URL absoluta (adiciona domínio se faltar)
    let fullUrl = rawUrl;
    if (rawUrl.startsWith('/')) {
        fullUrl = `https://www.netshoes.com.br${rawUrl}`;
    } else if (!rawUrl.startsWith('http')) {
        // Caso venha algo estranho, ignoramos
        return '';
    }

    // 2. Corta qualquer parâmetro de query (?) ou hash (#)
    // Ex: produto-xyz?campaign=123 -> produto-xyz
    const cleanUrl = fullUrl.split('?')[0].split('#')[0];

    return cleanUrl;
}

function parsePrice(priceText: string): number {
    if (!priceText) return 0;
    const clean = priceText.replace(/[R$\s.]/g, '').replace(',', '.');
    return parseFloat(clean);
}

function cleanTitle(title: string): string {
    let clean = title.replace(/\s+/g, ' ').trim();
    if (clean.length > 65) {
        return clean.substring(0, 65).trim() + '...';
    }
    return clean;
}

export async function scrapeNetshoes(searchTerm: string): Promise<ScrapedPromo[]> {
    console.log(`🕵️ NETSHOES: Iniciando scrap ELITE (> ${MIN_DISCOUNT_PERCENT}%) para: "${searchTerm}"...`);

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
            '--user-agent=' + USER_AGENT
        ]
    });

    const context = await browser.newContext({ userAgent: USER_AGENT });
    const page = await context.newPage();
    const results: ScrapedPromo[] = [];

    try {
        const url = `https://www.netshoes.com.br/busca?nsCat=Natural&q=${encodeURIComponent(searchTerm)}`;
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        
        console.log('📜 Netshoes: Rolando página...');
        await page.evaluate(async () => {
            for (let i = 0; i < document.body.scrollHeight; i += 400) { 
                window.scrollTo(0, i);
                await new Promise(resolve => setTimeout(resolve, 80));
            }
        });

        const cards = await page.$$('a.card__link');
        console.log(`🔎 Cards analisados na Netshoes: ${cards.length}`);

        for (const card of cards.slice(0, 40)) { 
            try {
                // TÍTULO
                const titleText = await card.$eval('.card__description--name', el => (el as HTMLElement).innerText).catch(() => '');
                if (!titleText) continue;
                const title = cleanTitle(titleText);

                // PREÇO ANTIGO
                const originalPriceText = await card.$eval('del', el => (el as HTMLElement).innerText).catch(() => '');
                if (!originalPriceText) continue;

                // PREÇO ATUAL
                const currentPriceText = await card.$eval('[data-price="price"]', el => (el as HTMLElement).innerText).catch(() => '');
                if (!currentPriceText) continue;

                // MATEMÁTICA
                const originalNum = parsePrice(originalPriceText);
                const currentNum = parsePrice(currentPriceText);
                if (originalNum <= currentNum || originalNum === 0) continue;
                const discountPercent = ((originalNum - currentNum) / originalNum) * 100;

                if (discountPercent < MIN_DISCOUNT_PERCENT) {
                    console.log(`      ⚠️ NS Ignorado: ${discountPercent.toFixed(0)}% OFF (Fraco) - ${title.substring(0, 15)}...`);
                    continue;
                }

                // LINK LIMPO
                const rawLink = await card.getAttribute('href');
                const finalUrl = cleanNetshoesUrl(rawLink || ''); // <--- Função aprimorada aqui

                // IMAGEM
                const imgEl = await card.$('img.image');
                let imageUrl = '';
                if (imgEl) {
                    imageUrl = await imgEl.getAttribute('data-src') || await imgEl.getAttribute('src') || '';
                    if (imageUrl.includes(' ')) imageUrl = imageUrl.split(' ')[0];
                }

                if (finalUrl && imageUrl) {
                    console.log(`   💎 NETSHOES: -${discountPercent.toFixed(0)}% OFF | "${title}"`);
                    
                    results.push({
                        title,
                        price: currentPriceText,
                        originalPrice: originalPriceText,
                        url: finalUrl,
                        imageUrl
                    });
                }

            } catch (err) { continue; }
        }

    } catch (error) {
        console.error('❌ Erro no scraper Netshoes:', error);
    } finally {
        await browser.close();
    }

    return results;
}