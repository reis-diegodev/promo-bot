import { chromium } from 'playwright-extra';
import type { BrowserContext, Page } from 'playwright';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import path from 'path';

chromium.use(StealthPlugin());

const CHROME_USER_DATA = path.join(process.cwd(), 'chrome-profile');
const CHROME_EXECUTABLE =
  process.env.CHROME_EXECUTABLE ||
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const AFFILIATE_CACHE = new Map<string, string>();

function extractMlbId(url: string): string | null {
  const patterns = [
    /\/MLB-?(\d{8,15})/i,
    /\/p\/MLB[A-Z]?(\d{8,15})/i,
    /\/up\/MLBU?(\d{8,15})/i,
    /wid=MLB(\d{8,15})/i,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      return `MLB${match[1]}`;
    }
  }

  return null;
}

function normalizeProductUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = '';

    // mantém parâmetros úteis se existirem
    const mattTool = parsed.searchParams.get('matt_tool');

    // limpa lixo de navegação
    parsed.searchParams.delete('tracking_id');
    parsed.searchParams.delete('seller_id');
    parsed.searchParams.delete('searchVariation');
    parsed.searchParams.delete('source');
    parsed.searchParams.delete('position');
    parsed.searchParams.delete('search_layout');
    parsed.searchParams.delete('type');
    parsed.searchParams.delete('sid');
    parsed.searchParams.delete('wid');

    if (mattTool) {
      parsed.searchParams.set('matt_tool', mattTool);
    }

    return parsed.toString();
  } catch {
    return url;
  }
}

async function openContext(): Promise<BrowserContext> {
  return chromium.launchPersistentContext(CHROME_USER_DATA, {
    executablePath: CHROME_EXECUTABLE,
    headless: false,
    args: ['--profile-directory=Default'],
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
  });
}

async function firstVisibleSelector(
  page: Page,
  selectors: string[],
  timeout = 5000,
): Promise<string | null> {
  for (const selector of selectors) {
    const ok = await page
      .locator(selector)
      .first()
      .waitFor({ state: 'visible', timeout })
      .then(() => true)
      .catch(() => false);

    if (ok) return selector;
  }

  return null;
}

async function tryGenerateFromAffiliateBar(page: Page): Promise<string | null> {
  const openBarSelectors = [
    'button:has-text("Gerar link")',
    'button:has-text("Copiar link")',
    'button:has-text("Criar link")',
    '[data-testid*="affiliate"] button',
    '[class*="affiliate"] button',
    '[class*="afiliad"] button',
  ];

  const openBarSelector = await firstVisibleSelector(page, openBarSelectors, 6000);

  if (!openBarSelector) {
    return null;
  }

  await page.locator(openBarSelector).first().click().catch(() => {});
  await page.waitForTimeout(1500);

  const outputSelectors = [
    'input[value*="meli.la"]',
    'input[value*="mercadolivre.com"]',
    'textarea',
    '[data-testid*="link"] input',
    '[class*="link"] input',
    '[class*="affiliate"] input',
  ];

  for (const selector of outputSelectors) {
    const locator = page.locator(selector).first();
    const exists = await locator.count().then((n) => n > 0).catch(() => false);
    if (!exists) continue;

    const value =
      (await locator.inputValue().catch(() => '')) ||
      (await locator.textContent().catch(() => '')) ||
      '';

    const clean = value.trim();

    if (clean.includes('meli.la/') || clean.includes('mercadolivre.com')) {
      return clean;
    }
  }

  return null;
}

async function tryGenerateFromPortal(page: Page, productUrl: string): Promise<string | null> {
  await page.goto('https://www.mercadolivre.com.br/l/afiliados-gere-seus-links', {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });

  await page.waitForTimeout(2000);

  const inputSelectors = [
    'input[type="url"]',
    'input[placeholder*="URL"]',
    'input[placeholder*="link"]',
    'textarea',
  ];

  let filled = false;

  for (const selector of inputSelectors) {
    const locator = page.locator(selector).first();
    const exists = await locator.count().then((n) => n > 0).catch(() => false);

    if (!exists) continue;

    await locator.fill(productUrl).catch(() => {});
    filled = true;
    break;
  }

  if (!filled) {
    return null;
  }

  const buttonSelectors = [
    'button:has-text("Gerar")',
    'button:has-text("Criar")',
    'button:has-text("Copiar link")',
    'button[type="submit"]',
  ];

  for (const selector of buttonSelectors) {
    const locator = page.locator(selector).first();
    const exists = await locator.count().then((n) => n > 0).catch(() => false);

    if (!exists) continue;

    await locator.click().catch(() => {});
    break;
  }

  await page.waitForTimeout(3000);

  const outputSelectors = [
    'input[value*="meli.la"]',
    'input[value*="mercadolivre.com"]',
    'textarea',
    '[data-testid*="link"] input',
    '[class*="link"] input',
    '[class*="affiliate"] input',
  ];

  for (const selector of outputSelectors) {
    const locator = page.locator(selector).first();
    const exists = await locator.count().then((n) => n > 0).catch(() => false);

    if (!exists) continue;

    const value =
      (await locator.inputValue().catch(() => '')) ||
      (await locator.textContent().catch(() => '')) ||
      '';

    const clean = value.trim();

    if (clean.includes('meli.la/') || clean.includes('mercadolivre.com')) {
      return clean;
    }
  }

  return null;
}

export async function generateMeliAffiliateLink(productUrl: string): Promise<string> {
  const normalizedUrl = normalizeProductUrl(productUrl);
  const mlbId = extractMlbId(normalizedUrl);

  if (mlbId && AFFILIATE_CACHE.has(mlbId)) {
    const cached = AFFILIATE_CACHE.get(mlbId)!;
    console.log(`💾 Link afiliado em cache: ${cached}`);
    return cached;
  }

  const context = await openContext();

  try {
    const page = await context.newPage();

    console.log(`🔗 Gerando link afiliado para: ${normalizedUrl}`);

    await page.goto(normalizedUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });

    await page.waitForTimeout(3000);

    let affiliateLink = await tryGenerateFromAffiliateBar(page);

    if (!affiliateLink) {
      console.warn('⚠️ Barra de afiliados não retornou link. Tentando portal...');
      affiliateLink = await tryGenerateFromPortal(page, normalizedUrl);
    }

    if (!affiliateLink) {
      throw new Error('Não foi possível gerar o link oficial de afiliado');
    }

    if (mlbId) {
      AFFILIATE_CACHE.set(mlbId, affiliateLink);
    }

    console.log(`✅ Link afiliado gerado: ${affiliateLink}`);
    return affiliateLink;
  } catch (error) {
    console.error('❌ Erro ao gerar link afiliado:', error);
    return normalizedUrl;
  } finally {
    await context.close().catch(() => {});
  }
}