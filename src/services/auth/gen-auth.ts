import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: false }); // Abre o navegador visível
  const page = await browser.newPage();
  await page.goto('https://www.mercadolivre.com.br/afiliados/linkbuilder');
  
  console.log('Faca o login manualmente no navegador...');
  
  // Espera você logar e chegar na página correta
  await page.waitForSelector('textarea#url-0', { timeout: 0 });
  
  // Salva o estado da sessão
  await page.context().storageState({ path: 'auth_meli.json' });
  console.log('Sessao salva com sucesso em auth_meli.json!');
  
  await browser.close();
})();