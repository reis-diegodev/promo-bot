import { chromium } from 'playwright';
import { ScrapedPromo } from './types';

const MIN_DISCOUNT_PERCENT = 25; 
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function cleanTitle(title: string): string {
    let clean = title.replace(/\b(frete grátis|envio imediato|original|promoção|oferta|lançamento|novo|lacrado|nfc|brindes?|top)\b/gi, '');
    clean = clean.replace(/\s+/g, ' ').trim();
    if (clean.length > 60) {
        return clean.substring(0, 60).trim() + '...';
    }
    return clean;
}

function getShortMlLink(rawUrl: string): string {
    if (!rawUrl) return '';
    const match = rawUrl.match(/(MLB-?\d+)/);
    if (match) {
        return `https://produto.mercadolivre.com.br/${match[1]}`;
    }
    return rawUrl.split('#')[0].split('?')[0];
}

function parseMlPrice(priceText: string): number {
    if (!priceText) return 0;
    const clean = priceText.replace(/[R$\s.]/g, '').replace(',', '.');
    return parseFloat(clean);
}

export async function scrapeMercadoLivre(searchTerm: string): Promise<ScrapedPromo[]> {
    console.log(`🕵️ ML: Iniciando scrap HÍBRIDO + CUPONS para: "${searchTerm}"...`);

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
        const url = `https://lista.mercadolivre.com.br/${encodeURIComponent(searchTerm).replace(/%20/g, '-')}_NoIndex_True`;
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        
        console.log('📜 ML: Rolando página...');
        await page.evaluate(async () => {
            for (let i = 0; i < document.body.scrollHeight; i += 400) { 
                window.scrollTo(0, i);
                await new Promise(resolve => setTimeout(resolve, 80));
            }
        });

        const cards = await page.$$('li.ui-search-layout__item');
        console.log(`🔎 Cards analisados no ML: ${cards.length}`);

        for (const card of cards.slice(0, 40)) { 
            try {
                // TÍTULO (Usando as HTMLElement dentro do eval para garantir tipagem no contexto do browser)
                let rawTitle = await card.$eval('.ui-search-item__title', el => (el as HTMLElement).innerText).catch(() => '');
                if (!rawTitle) rawTitle = await card.$eval('.poly-component__title', el => (el as HTMLElement).innerText).catch(() => '');
                if (!rawTitle) continue;
                
                const title = cleanTitle(rawTitle);

                // PREÇO ANTIGO
                let originalPriceText = await card.$eval('.ui-search-price__original-value .price-tag-text-sr-only', el => (el as HTMLElement).innerText).catch(() => '');
                if (!originalPriceText) originalPriceText = await card.$eval('.ui-search-price__original-value .price-tag-fraction', el => (el as HTMLElement).innerText).catch(() => '');
                if (!originalPriceText) originalPriceText = await card.$eval('.andes-money-amount--previous .andes-money-amount__fraction', el => (el as HTMLElement).innerText).catch(() => '');
                if (!originalPriceText) originalPriceText = await card.$eval('s .andes-money-amount__fraction', el => (el as HTMLElement).innerText).catch(() => '');

                if (!originalPriceText) continue;

                // PREÇO ATUAL
                let currentPriceText = '';
                // Poly Layout
                currentPriceText = await card.$eval('.poly-price__current .andes-money-amount__fraction', el => (el as HTMLElement).innerText).catch(() => '');
                if (currentPriceText) {
                     const cents = await card.$eval('.poly-price__current .andes-money-amount__cents', el => (el as HTMLElement).innerText).catch(() => '00');
                     currentPriceText = `${currentPriceText},${cents}`;
                }
                
                // Classic Layout fallback
                if (!currentPriceText) {
                    // Nota: Aqui não usamos $eval, usamos $, então 'el' é um ElementHandle
                    const elHandle = await card.$('.ui-search-price__second-line .price-tag-fraction');
                    if (elHandle) {
                        // CORREÇÃO: Usamos .innerText() (método assíncrono do Playwright)
                        const r = await elHandle.innerText();
                        const c = await card.$eval('.ui-search-price__second-line .price-tag-cents', el => (el as HTMLElement).innerText).catch(() => '00');
                        currentPriceText = `${r},${c}`;
                    }
                }

                // Fallback final
                if (!currentPriceText) {
                     const priceFractions = await card.$$('.andes-money-amount__fraction');
                     if (priceFractions.length > 0) {
                         // CORREÇÃO: Acesso ao array de handles e chamada do método .innerText()
                         const lastPriceHandle = priceFractions[priceFractions.length - 1];
                         currentPriceText = await lastPriceHandle.innerText();
                     }
                }

                // MATEMÁTICA
                const originalNum = parseMlPrice(originalPriceText);
                const currentNum = parseMlPrice(currentPriceText);
                if (originalNum <= currentNum || originalNum === 0) continue;
                const discountPercent = ((originalNum - currentNum) / originalNum) * 100;

                if (discountPercent < MIN_DISCOUNT_PERCENT) continue;

                // CUPONS (Correção de tipos aqui também)
                let coupon = '';
                
                // Tenta Poly Pill
                let couponText = await card.$eval('.poly-coupons__pill', el => (el as HTMLElement).innerText).catch(() => '');
                
                // Tenta Wrapper
                if (!couponText) {
                    couponText = await card.$eval('.poly-component__coupons', el => (el as HTMLElement).innerText).catch(() => '');
                }

                // Tenta Fallback Antigo
                if (!couponText) {
                    const greenTxtHandle = await card.$('.ui-search-price__discount');
                    if (greenTxtHandle) {
                        // CORREÇÃO: Método .innerText() no handle
                        const txt = await greenTxtHandle.innerText();
                        if (txt.includes('CUPOM')) couponText = txt;
                    }
                }

                if (couponText) {
                    coupon = couponText.replace(/cupom/gi, '').trim();
                }

                // LINK
                let rawLink = await card.$eval('a.ui-search-link', el => el.getAttribute('href')).catch(() => '');
                if (!rawLink) rawLink = await card.$eval('a.poly-component__title', el => el.getAttribute('href')).catch(() => '');
                const finalUrl = getShortMlLink(rawLink || '');

                // IMAGEM
                let imageUrl = await card.$eval('img.ui-search-result-image__element', el => el.getAttribute('src')).catch(() => '');
                if (!imageUrl) imageUrl = await card.$eval('img.poly-component__picture', el => el.getAttribute('src')).catch(() => '');
                if (!imageUrl || !imageUrl.startsWith('http')) {
                    const imgElHandle = await card.$('img');
                    if (imgElHandle) {
                        imageUrl = await imgElHandle.getAttribute('data-src') || await imgElHandle.getAttribute('src') || '';
                    }
                }

                if (finalUrl && imageUrl) {
                    const couponLog = coupon ? `| 🎟️ Cupom: ${coupon}` : '';
                    console.log(`   💎 ML: -${discountPercent.toFixed(0)}%${couponLog} | "${title}"`);
                    
                    results.push({
                        title,
                        price: currentPriceText,
                        originalPrice: originalPriceText,
                        url: finalUrl,
                        imageUrl,
                        coupon: coupon || undefined
                    });
                }

            } catch (err) { continue; }
        }
    } catch (error) { console.error('❌ Erro ML:', error); } 
    finally { await browser.close(); }
    return results;
}