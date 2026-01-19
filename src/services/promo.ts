import crypto from 'crypto';
import { prisma } from '../core/prisma';
import { ScrapedPromo } from './scraper/types';
import { WASocket } from '@whiskeysockets/baileys';

// Configurações
const REPOST_COOLDOWN_HOURS = 72;

// Palavras que não agregam valor ao nome curto e devem morrer
const FLUFF_WORDS = [
    'original', 'promoção', 'oferta', 'lançamento', 'novo', 'lacrado',
    'envio', 'imediato', 'frete', 'grátis', 'full', 'premium', 'exclusivo',
    'brinde', 'nota', 'fiscal', 'garantia', 'nfc', 'gps', 'bluetooth',
    'wifi', '4g', '5g', 'unissex', 'adulto', 'infantil'
];

function generateHash(text: string): string {
    return crypto.createHash('md5').update(text).digest('hex');
}

// --- A NOVA MÁGICA DE TÍTULOS CURTOS ---
function smartShortenTitle(title: string): string {
    if (!title) return '';

    // 1. Limpeza Prévia: Remove conteúdo entre parênteses () ou colchetes []
    // Ex: "Creatina (300g)" vira "Creatina"
    let clean = title.replace(/(\(|\[).*?(\)|\])/g, '');

    // 2. Corte por Separadores Lógicos
    // Se tiver " - ", " | ", " / ", pega só o que vem antes.
    // Ex: "Apple Watch SE - Caixa de Alumínio" vira "Apple Watch SE"
    const separators = [' - ', ' | ', ' / ', ', ', ' – ']; // Hífen, Pipe, Barra, Vírgula, Travessão
    for (const sep of separators) {
        if (clean.includes(sep)) {
            clean = clean.split(sep)[0];
            break; // Paramos no primeiro separador que acharmos
        }
    }

    // 3. Tokenização (Quebra em palavras)
    let words = clean.split(/\s+/);

    // 4. Filtragem de Palavras Lixo (Fluff)
    words = words.filter(w => !FLUFF_WORDS.includes(w.toLowerCase()));

    // 5. Limite de Palavras (O Segredo do Minimalismo)
    // Marcas geralmente têm 2 a 4 nomes (Tênis Nike Revolution 6).
    // Se passar de 6 palavras, cortamos.
    if (words.length > 6) {
        words = words.slice(0, 6);
    }

    // Reconstrói a string
    return words.join(' ').trim();
}

const STORE_SIGNATURES: Record<string, string> = {
    'Amazon': '📦 *Olha isso na Amazon!*',
    'Mercado Livre': '⚡ *Direto do MELI!*',
    'Netshoes': '🏃 *Corre na Netshoes!*',
    'Shopee': '🛍️ *Achado na Shopee!*',
    'Default': '🔥 *Oferta Fitness*'
};

export async function processAndSendPromos(promos: ScrapedPromo[], sock: WASocket, storeName: string) {
    const groupId = process.env.TARGET_GROUP_ID;
    if (!groupId) throw new Error('❌ TARGET_GROUP_ID não definido no .env');

    let sentCount = 0;
    const footerSignature = STORE_SIGNATURES[storeName] || STORE_SIGNATURES['Default'];

    for (const [index, promo] of promos.entries()) {
        const uniqueKey = promo.title + promo.price;
        const promoHash = generateHash(uniqueKey);

        // Verifica Cooldown
        const existingPromo = await prisma.promotion.findUnique({ where: { urlHash: promoHash } });

        if (existingPromo) {
            const lastSent = new Date(existingPromo.createdAt);
            const now = new Date();
            const diffInHours = Math.abs(now.getTime() - lastSent.getTime()) / 36e5;
            if (diffInHours < REPOST_COOLDOWN_HOURS) continue; 
            console.log(`   ♻️ Reenviando oferta (Passaram ${diffInHours.toFixed(1)}h)...`);
        }

        // --- APLICA A LIMPEZA NO TÍTULO AQUI ---
        const shortTitle = smartShortenTitle(promo.title);
        // ---------------------------------------

        let couponLine = '';
        if (promo.coupon) {
            couponLine = `🎟️ *CUPOM:* ${promo.coupon}\n`;
        }

        const caption = `🔥 *${shortTitle}*\n\n` + // Usa o título curto
                        `❌ De: ~${promo.originalPrice}~\n` +
                        `✅ Por: *${promo.price}*\n` +
                        `${couponLine}` +
                        `🔗 *Link:* ${promo.url}\n\n` +
                        `${footerSignature}`;

        try {
            if (!existingPromo) {
                console.log(`   🚀 Enviando (${storeName}): "${shortTitle}"`);
            }

            // Envio padrão (MVP - Imagem original)
            if (promo.imageUrl) {
                await sock.sendMessage(groupId, {
                    image: { url: promo.imageUrl },
                    caption: caption
                });
            } else {
                await sock.sendMessage(groupId, { text: caption });
            }

            // Upsert no Banco
            await prisma.promotion.upsert({
                where: { urlHash: promoHash },
                update: { createdAt: new Date(), sentToGroup: true },
                create: {
                    title: promo.title, // Salva o título original no banco para referência
                    price: promo.price,
                    url: promo.url,
                    urlHash: promoHash,
                    sentToGroup: true,
                    createdAt: new Date()
                }
            });

            sentCount++;

            // Delay Humano
            if (index < promos.length - 1) {
                const delayMs = 60000 + Math.random() * 30000;
                console.log(`   ⏳ Aguardando ${(delayMs/1000).toFixed(0)}s...`);
                await new Promise(r => setTimeout(r, delayMs));
            }

        } catch (error) {
            console.error(`   ❌ Falha envio:`, error);
        }
    }
    
    if (sentCount > 0) {
        console.log(`   ✅ ${sentCount} mensagens processadas.`);
    }
}