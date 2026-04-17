import { chromium } from 'playwright-extra';
import type { BrowserContext, Page } from 'playwright';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import path from 'path';

chromium.use(StealthPlugin());

const CHROME_USER_DATA = path.join(process.cwd(), 'chrome-profile');
const CHROME_EXECUTABLE =
  process.env.CHROME_EXECUTABLE ||
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const LINK_BUILDER_URL =
  'https://www.mercadolivre.com.br/afiliados/linkbuilder#hub';

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

    parsed.searchParams.delete('tracking_id');
    parsed.searchParams.delete('seller_id');
    parsed.searchParams.delete('searchVariation');
    parsed.searchParams.delete('source');
    parsed.searchParams.delete('position');
    parsed.searchParams.delete('search_layout');
    parsed.searchParams.delete('type');
    parsed.searchParams.delete('sid');
    parsed.searchParams.delete('wid');

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

async function ensureAffiliateSession(page: Page): Promise<void> {
  const currentUrl = page.url();
  const currentTitle = await page.title().catch(() => '');

  if (
    currentUrl.includes('/login') ||
    currentUrl.includes('registration') ||
    currentUrl.includes('authentication')
  ) {
    throw new Error(
      `Sessão do afiliado não está autenticada. Rode o setup manual do perfil "chrome-profile". title="${currentTitle}" url="${currentUrl}"`,
    );
  }
}

async function ensureLinkBuilderReady(page: Page): Promise<void> {
  await page.goto(LINK_BUILDER_URL, {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });

  await page.waitForTimeout(3000);
  await ensureAffiliateSession(page);

  await page.waitForSelector('#root-app', { timeout: 15000 }).catch(() => {});

  let hasInput = await page
    .locator('#url-0')
    .count()
    .then((n) => n > 0)
    .catch(() => false);

  if (!hasInput) {
    console.warn('⚠️ #url-0 não apareceu na primeira tentativa. Recarregando...');
    await page.goto(LINK_BUILDER_URL, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });

    await page.waitForTimeout(4000);
    await ensureAffiliateSession(page);

    hasInput = await page
      .locator('#url-0')
      .count()
      .then((n) => n > 0)
      .catch(() => false);
  }

  if (!hasInput) {
    const title = await page.title().catch(() => '');
    const finalUrl = page.url();

    throw new Error(
      `Campo #url-0 não encontrado no linkbuilder. title="${title}" url="${finalUrl}"`,
    );
  }

  await page.locator('#url-0').first().waitFor({
    state: 'visible',
    timeout: 15000,
  });
}

async function fillLinkBuilderInput(page: Page, productUrl: string): Promise<void> {
  await ensureLinkBuilderReady(page);

  const input = page.locator('#url-0').first();

  await input.click();
  await input.clear();

  await page.$eval(
    '#url-0',
    (el, value) => {
      const inputEl = el as HTMLTextAreaElement;

      const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        'value',
      )?.set;

      nativeSetter?.call(inputEl, value);

      inputEl.dispatchEvent(new Event('input', { bubbles: true }));
      inputEl.dispatchEvent(new Event('change', { bubbles: true }));
      inputEl.dispatchEvent(new Event('blur', { bubbles: true }));
    },
    productUrl,
  );

  await page.waitForTimeout(800);
}

async function clickGenerateButton(page: Page): Promise<void> {
  const generateButton = page.locator('button.links-form__button').first();

  await generateButton.waitFor({ state: 'visible', timeout: 10000 });

  let isDisabled = await generateButton.isDisabled().catch(() => true);
  console.log(`🧪 Botão gerar desabilitado? ${isDisabled}`);

  if (isDisabled) {
    const input = page.locator('#url-0').first();

    await input.click();
    await input.press('End').catch(() => {});
    await input.type(' ', { delay: 30 }).catch(() => {});
    await input.press('Backspace').catch(() => {});

    await page.waitForTimeout(1000);

    isDisabled = await generateButton.isDisabled().catch(() => true);
    console.log(`🧪 Botão gerar desabilitado após ajuste? ${isDisabled}`);
  }

  if (isDisabled) {
    throw new Error('Botão "Gerar" permaneceu desabilitado');
  }

  await generateButton.click();
}

async function readGeneratedLink(page: Page): Promise<string | null> {
  const output = page.locator('#textfield-copyLink-1').first();

  await output.waitFor({ state: 'visible', timeout: 15000 });

  const value = await output.evaluate((el) => {
    if (el instanceof HTMLTextAreaElement) {
      return el.value?.trim() || el.textContent?.trim() || '';
    }

    return el.textContent?.trim() || '';
  });

  if (!value) return null;
  if (!value.includes('meli.la/')) return null;

  return value;
}

async function generateFromLinkBuilder(
  page: Page,
  productUrl: string,
): Promise<string | null> {
  await fillLinkBuilderInput(page, productUrl);
  await clickGenerateButton(page);
  return await readGeneratedLink(page);
}

export async function generateMeliAffiliateLink(
  productUrl: string,
): Promise<string> {
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

    const affiliateLink = await generateFromLinkBuilder(page, normalizedUrl);

    if (!affiliateLink) {
      throw new Error(
        'Não foi possível capturar o link gerado em #textfield-copyLink-1',
      );
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