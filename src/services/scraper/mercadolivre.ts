import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import * as path from 'path';
import { ScrapedPromo } from './types';

chromium.use(StealthPlugin());

const MIN_DISCOUNT_PERCENT = 40;
const CHROME_USER_DATA = path.join(process.cwd(), 'chrome-profile');
const CHROME_EXECUTABLE =
  process.env.CHROME_EXECUTABLE ||
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

function cleanTitle(title: string): string {
  let clean = title.replace(
    /\b(frete grátis|envio imediato|original|promoção|oferta|lançamento|novo|lacrado|nfc|brindes?|top)\b/gi,
    '',
  );

  clean = clean.replace(/\s+/g, ' ').trim();
  return clean.length > 60 ? `${clean.substring(0, 60).trim()}...` : clean;
}

function isValidMlbId(id: string): boolean {
  return /^\d{8,15}$/.test(id);
}

function parseMlPrice(priceText: string): number {
  if (!priceText) return 0;

  const clean = priceText.replace(/[R$\s.]/g, '').replace(',', '.');
  const value = Number.parseFloat(clean);

  return Number.isFinite(value) ? value : 0;
}

function formatPriceFromParts(fraction?: string, cents?: string): string {
  if (!fraction) return '';

  const cleanFraction = fraction.replace(/\D/g, '');
  const cleanCents = (cents || '').replace(/\D/g, '');

  if (!cleanFraction) return '';

  return cleanCents ? `${cleanFraction},${cleanCents}` : cleanFraction;
}

function toHighRes(url: string): string {
  if (!url) return '';

  return url
    .replace(/-[A-Z]\.(jpg|jpeg|png|webp)$/i, '-O.$1')
    .replace(/_\d+x\d+\.(jpg|jpeg|png|webp)$/i, '.$1')
    .replace(/\?.*$/, '');
}

function extractProductId(url: string): string | null {
  const match = url.match(/MLB-?(\d{8,15})/i);
  return match ? match[1] : null;
}

function isValidMercadoLivreUrl(url: string): boolean {
  return (
    /^https:\/\/produto\.mercadolivre\.com\.br\/MLB-\d+/i.test(url) ||
    /^https:\/\/(www\.)?mercadolivre\.com\.br\/p\/MLB[A-Z]?\d+/i.test(url) ||
    /^https:\/\/(www\.)?mercadolivre\.com\.br\/.*\/p\/MLB[A-Z]?\d+/i.test(url)
  );
}

function normalizeMercadoLivreUrl(rawUrl: string): string {
  if (!rawUrl) return '';

  try {
    const parsed = new URL(rawUrl);
    const mattTool = parsed.searchParams.get('matt_tool');

    let finalUrl = rawUrl;

    // Caso click tracking do ML
    if (parsed.hostname.includes('click1.mercadolivre')) {
      const searchVariation = parsed.searchParams.get('searchVariation');
      const wid = parsed.searchParams.get('wid');

      if (searchVariation) {
        const variationMatch = searchVariation.match(/(MLB[A-Z]?)(\d{8,15})/i);
        if (variationMatch && isValidMlbId(variationMatch[2])) {
          finalUrl = `https://www.mercadolivre.com.br/p/${variationMatch[1]}${variationMatch[2]}`;
        }
      } else if (wid) {
        const widMatch = wid.match(/(MLB[A-Z]?)(\d{8,15})/i);
        if (widMatch && isValidMlbId(widMatch[2])) {
          finalUrl = `https://produto.mercadolivre.com.br/MLB-${widMatch[2]}`;
        }
      } else {
        return '';
      }
    } else {
      // Remove só lixo opcional. Mantém o afiliado.
      parsed.hash = '';
      parsed.searchParams.delete('tracking_id');
      parsed.searchParams.delete('seller_id');
      parsed.searchParams.delete('searchVariation');
      parsed.searchParams.delete('source');
      parsed.searchParams.delete('variation');
      parsed.searchParams.delete('quantity');
      parsed.searchParams.delete('position');
      parsed.searchParams.delete('search_layout');
      parsed.searchParams.delete('type');
      parsed.searchParams.delete('attribute');
      parsed.searchParams.delete('applied_product_filters');
      parsed.searchParams.delete('applied_product_filters_id');
      parsed.searchParams.delete('applied_product_filters_order');
      parsed.searchParams.delete('applied_product_filters_v');
      parsed.searchParams.delete('searchVariation');

      finalUrl = parsed.toString();

      // Caso problemático: https://www.mercadolivre.com.br/MLB123...
      const pathnameLooksBroken =
        /\/MLB\d+/i.test(parsed.pathname) && !parsed.pathname.includes('/p/');

      if (pathnameLooksBroken) {
        const productId = extractProductId(rawUrl);
        if (productId) {
          finalUrl = `https://produto.mercadolivre.com.br/MLB-${productId}`;
        }
      }
    }

    const finalParsed = new URL(finalUrl);

    if (mattTool) {
      finalParsed.searchParams.set('matt_tool', mattTool);
    }

    const normalized = finalParsed.toString();

    if (!isValidMercadoLivreUrl(normalized)) {
      return '';
    }

    return normalized;
  } catch {
    return '';
  }
}

async function extractText(card: any, selectors: string[]): Promise<string> {
  for (const selector of selectors) {
    const value = await card
      .$eval(selector, (el: Element) => (el as HTMLElement).innerText?.trim() || '')
      .catch(() => '');

    if (value) return value;
  }

  return '';
}

async function extractHref(card: any, selectors: string[]): Promise<string> {
  for (const selector of selectors) {
    const value = await card
      .$eval(selector, (el: Element) => (el as HTMLAnchorElement).href || '')
      .catch(() => '');

    if (value) return value;
  }

  return '';
}

export async function scrapeMercadoLivre(searchTerm: string): Promise<ScrapedPromo[]> {
  console.log(`🕵️ ML: Buscando "${searchTerm}"...`);

  const browser = await chromium.launchPersistentContext(CHROME_USER_DATA, {
    executablePath: CHROME_EXECUTABLE,
    headless: true,
    args: ['--profile-directory=Default'],
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
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

    await page
      .waitForSelector('li.ui-search-layout__item', { timeout: 20000 })
      .catch(() => console.warn('⚠️ Cards não apareceram em 20s'));

    const cards = await page.$$('li.ui-search-layout__item');
    console.log(`📦 Cards encontrados: ${cards.length}`);

    if (cards.length === 0) return [];

    for (const card of cards.slice(0, 10)) {
      try {
        const title = await extractText(card, [
          '.poly-component__title',
          '.ui-search-item__title',
        ]);

        if (!title) continue;

        const originalFraction = await extractText(card, [
          '.andes-money-amount--previous .andes-money-amount__fraction',
          '.ui-search-price__original-value .andes-money-amount__fraction',
        ]);

        const originalCents = await extractText(card, [
          '.andes-money-amount--previous .andes-money-amount__cents',
          '.ui-search-price__original-value .andes-money-amount__cents',
        ]);

        const currentFraction = await extractText(card, [
          '.poly-price__current .andes-money-amount__fraction',
          '.ui-search-price__second-line .price-tag-fraction',
          '.andes-money-amount__fraction',
        ]);

        const currentCents = await extractText(card, [
          '.poly-price__current .andes-money-amount__cents',
          '.ui-search-price__second-line .price-tag-cents',
          '.andes-money-amount__cents',
        ]);

        const originalPriceText = formatPriceFromParts(originalFraction, originalCents);
        const currentPriceText = formatPriceFromParts(currentFraction, currentCents);

        if (!originalPriceText || !currentPriceText) continue;

        const originalNum = parseMlPrice(originalPriceText);
        const currentNum = parseMlPrice(currentPriceText);

        if (!originalNum || !currentNum || currentNum >= originalNum) continue;

        const discountPercent = ((originalNum - currentNum) / originalNum) * 100;
        if (discountPercent < MIN_DISCOUNT_PERCENT) continue;

        const rawLink = await extractHref(card, [
          'a.poly-component__title-wrapper',
          'a.poly-component__title',
          'a.ui-search-link',
        ]);

        const finalUrl = normalizeMercadoLivreUrl(rawLink);

        if (!finalUrl) {
          console.warn('⚠️ URL inválida descartada:', rawLink);
          continue;
        }

        const allImgs = await card
          .$$eval('img', (els: Element[]) =>
            (els as HTMLImageElement[])
              .map(
                (el) =>
                  el.getAttribute('data-src') ||
                  el.getAttribute('src') ||
                  el.getAttribute('data-srcset') ||
                  '',
              )
              .filter((src) => typeof src === 'string' && src.startsWith('http')),
          )
          .catch((): string[] => []);

        const additionalImages = [...new Set(allImgs.map(toHighRes))].filter(Boolean);
        const mainImage = additionalImages[0] || '';

        console.log({
          title: cleanTitle(title),
          rawLink,
          finalUrl,
          discount: `${discountPercent.toFixed(2)}%`,
          images: additionalImages.length,
        });

        results.push({
          title: cleanTitle(title),
          price: currentPriceText,
          originalPrice: originalPriceText,
          url: finalUrl,
          imageUrl: mainImage,
          additionalImages,
        });
      } catch (err) {
        console.warn('⚠️ Erro ao processar card do Mercado Livre:', err);
        continue;
      }
    }
  } catch (error) {
    console.error('❌ Erro crítico no Scraper ML:', error);
  } finally {
    await browser.close().catch(() => {});
  }

  console.log(`✅ ML: ${results.length} promos para "${searchTerm}"`);
  return results;
}