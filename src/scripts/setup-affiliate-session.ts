// src/scripts/setup-affiliate-session.ts
import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import path from 'path';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

chromium.use(StealthPlugin());

const CHROME_USER_DATA = path.join(process.cwd(), 'chrome-profile');
const CHROME_EXECUTABLE =
  process.env.CHROME_EXECUTABLE ||
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function main() {
  const context = await chromium.launchPersistentContext(CHROME_USER_DATA, {
    executablePath: CHROME_EXECUTABLE,
    headless: false,
    args: ['--profile-directory=Default'],
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
  });

  const page = await context.newPage();

  await page.goto('https://www.mercadolivre.com.br/afiliados/linkbuilder#hub', {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });

  console.log('Faça login manualmente e confirme que a página do afiliado abriu corretamente.');

  const rl = readline.createInterface({ input, output });
  await rl.question('Pressione ENTER depois de concluir o login...');
  rl.close();

  await context.close();
  console.log('✅ Sessão do afiliado salva com sucesso.');
}

main().catch(console.error);