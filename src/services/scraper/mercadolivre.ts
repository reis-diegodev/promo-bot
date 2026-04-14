import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import * as path from 'path';
import { ScrapedPromo } from './types';

chromium.use(StealthPlugin());

const MIN_DISCOUNT_PERCENT = 5;
const CHROME_USER_DATA = path.join(process.cwd(), 'chrome-profile');
const CHROME_EXECUTABLE = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

function cleanTitle(title: string): string {
    let clean = title.replace(/\b(frete grátis|envio imediato|original|promoção|oferta|lançamento|novo|lacrado|nfc|brindes?|top)\b/gi, '');
    clean = clean.replace(/\s+/g, ' ').trim();
    return clean.length > 60 ? clean.substring(0, 60).trim() + '...' : clean;
}

function isValidMlbId(id: string): boolean {
    return id.length >= 9;
}

function getShortMlLink(rawUrl: string): string {
    if (!rawUrl) return '';

    if (rawUrl.includes('click1.mercadolivre')) {
        const searchVariationMatch = rawUrl.match(/searchVariation=(MLB[A-Z]?)(\d+)/i);
        if (searchVariationMatch && isValidMlbId(searchVariationMatch[2])) {
            return `https://www.mercadolivre.com.br/p/${searchVariationMatch[1]}${searchVariationMatch[2]}`;
        }
        const widMatch = rawUrl.match(/wid=(MLB[A-Z]?)(\d+)/i);
        if (widMatch && isValidMlbId(widMatch[2])) {
            return `https://www.mercadolivre.com.br/${widMatch[1]}${widMatch[2]}`;
        }
        return '';
    }

    const fichaMatch = rawUrl.match(/\/p\/(MLB[A-Z]?)(\d+)/i);
    if (fichaMatch && isValidMlbId(fichaMatch[2])) {
        return `https://www.mercadolivre.com.br/p/${fichaMatch[1]}${fichaMatch[2]}`;
    }

    const upMatch = rawUrl.match(/\/up\/(MLB[A-Z]?)(\d+)/i);
    if (upMatch && isValidMlbId(upMatch[2])) {
        return `https://www.mercadolivre.com.br/p/${upMatch[1]}${upMatch[2]}`;
    }

    if (rawUrl.includes('produto.mercadolivre.com.br')) {
        return rawUrl.split('#')[0].split('?')[0];
    }

    const mlbMatch = rawUrl.match(/\/(MLB[A-Z]?)(\d{9,15})/i);
    if (mlbMatch && isValidMlbId(mlbMatch[2])) {
        return `https://www.mercadolivre.com.br/${mlbMatch[1]}${mlbMatch[2]}`;
    }

    return '';
}

function toHighRes(url: string): string {
    if (!url) return '';
    return url
        .replace(/-[A-Z]\.jpg/, '-O.jpg')
        .replace(/_\d+x\d+\.jpg/, '.jpg')
        .replace(/\?.*$/, '');
}

function parseMlPrice(priceText: string): number {
    if (!priceText) return 0;
    const clean = priceText.replace(/[R$\s.]/g, '').replace(',', '.');
    return parseFloat(clean);
}

export async function scrapeMercadoLivre(searchTerm: string): Promise<ScrapedPromo[]> {
    console.log(`🕵️ ML: Buscando "${searchTerm}"...`);

    const browser = await chromium.launchPersistentContext(CHROME_USER_DATA, {
        executablePath: CHROME_EXECUTABLE,
        headless: true,
        args: ['--profile-directory=Default'],
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        locale: 'pt-BR',
        timezoneId: 'America/Sao_Paulo',
    });

    const page = await browser.newPage();
    const results: ScrapedPromo[] = [];

    try {
        const url = `https://lista.mercadolivre.com.br/${encodeURIComponent(searchTerm).replace(/%20/g, '-')}_NoIndex_True`;

        console.log(`🌐 Acessando: ${url}`);
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

        const pageTitle = await page.title();
        console.log(`📄 Título: ${pageTitle}`);

        await page.waitForSelector('li.ui-search-layout__item', { timeout: 20000 })
            .catch(() => console.warn('⚠️ Cards não apareceram em 20s'));

        const cards = await page.$$('li.ui-search-layout__item');
        console.log(`📦 Cards encontrados: ${cards.length}`);

        if (cards.length === 0) return [];

        for (const card of cards.slice(0, 10)) {
            try {
                const title = await card.$eval(
                    '.poly-component__title, .ui-search-item__title',
                    el => (el as HTMLElement).innerText
                ).catch(() => '');
                if (!title) continue;

                const originalPriceText = await card.$eval(
                    '.andes-money-amount--previous .andes-money-amount__fraction',
                    el => (el as HTMLElement).innerText
                ).catch(() => '');
                const currentPriceText = await card.$eval(
                    '.poly-price__current .andes-money-amount__fraction, .ui-search-price__second-line .price-tag-fraction',
                    el => (el as HTMLElement).innerText
                ).catch(() => '');

                if (!originalPriceText || !currentPriceText) continue;

                const originalNum = parseMlPrice(originalPriceText);
                const currentNum = parseMlPrice(currentPriceText);
                const discountPercent = ((originalNum - currentNum) / originalNum) * 100;

                if (discountPercent < MIN_DISCOUNT_PERCENT) continue;

                const rawLink = await card.$eval(
                    'a.poly-component__title-wrapper, a.poly-component__title, a.ui-search-link',
                    el => (el as HTMLAnchorElement).href
                ).catch(() => '');

                const finalUrl = getShortMlLink(rawLink);
                if (!finalUrl) continue;

                const allImgs = await card.$$eval('img', (els: Element[]) =>
                    (els as HTMLImageElement[]).map(el =>
                        el.getAttribute('data-src') || el.getAttribute('src') || ''
                    ).filter(src => src.startsWith('http'))
                ).catch((): string[] => []);

                const additionalImages = [...new Set(allImgs.map(toHighRes))].filter(Boolean);
                const mainImage = additionalImages[0] || '';

                console.log(`🖼️ ${additionalImages.length} imgs | "${cleanTitle(title)}"`);

                results.push({
                    title: cleanTitle(title),
                    price: currentPriceText,
                    originalPrice: originalPriceText,
                    url: finalUrl,
                    imageUrl: mainImage,
                    additionalImages
                });
            } catch (err) { continue; }
        }
    } catch (error) {
        console.error('❌ Erro crítico no Scraper ML:', error);
    } finally {
        await browser.close().catch(() => {});
    }

    console.log(`✅ ML: ${results.length} promos para "${searchTerm}"`);
    return results;
}