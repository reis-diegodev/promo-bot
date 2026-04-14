import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import * as path from 'path';
import * as fs from 'fs';

chromium.use(StealthPlugin());

(async () => {
    console.log('🌐 Abrindo ML para capturar cookies...');
    
    const browser = await chromium.launchPersistentContext(
        path.join(process.cwd(), 'chrome-profile'),
        {
            executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            headless: false, // <- visível para você ver o que acontece
            args: ['--profile-directory=Default']
        }
    );

    const page = await browser.newPage();
    
    // Navega para o ML
    await page.goto('https://www.mercadolivre.com.br', { 
        waitUntil: 'domcontentloaded',
        timeout: 30000 
    });

    // Aguarda 5s para carregar completamente
    await new Promise(r => setTimeout(r, 5000));

    const cookies = await browser.cookies([
        'https://www.mercadolivre.com.br',
        'https://lista.mercadolivre.com.br'
    ]);

    console.log('✅ Cookies capturados:', cookies.length);
    console.log('Nomes:', cookies.map(c => c.name).join(', '));

    fs.writeFileSync('ml-cookies.json', JSON.stringify(cookies, null, 2));

    await browser.close();
    process.exit(0);
})();