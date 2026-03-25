import crypto from 'crypto';
import { prisma } from '../core/prisma';
import { ScrapedPromo } from './scraper/types';
import { WASocket } from '@whiskeysockets/baileys';
import { isWhiteBackground } from './image/analyzer';

// Configurações
const REPOST_COOLDOWN_HOURS = 72;

// Palavras que não agregam valor ao nome curto e devem ser removidas
const FLUFF_WORDS = [
    'original', 'promoção', 'oferta', 'lançamento', 'novo', 'lacrado',
    'envio', 'imediato', 'frete', 'grátis', 'full', 'premium', 'exclusivo',
    'brinde', 'nota', 'fiscal', 'garantia', 'nfc', 'gps', 'bluetooth',
    'wifi', '4g', '5g', 'unissex', 'adulto', 'infantil'
];

function generateHash(text: string): string {
    return crypto.createHash('md5').update(text).digest('hex');
}

// --- MÁGICA DE TÍTULOS CURTOS ---
function smartShortenTitle(title: string): string {
    if (!title) return '';

    // 1. Limpeza Prévia: Remove conteúdo entre parênteses () ou colchetes []
    let clean = title.replace(/(\(|\[).*?(\)|\])/g, '');

    // 2. Corte por Separadores Lógicos
    const separators = [' - ', ' | ', ' / ', ', ', ' – ']; 
    for (const sep of separators) {
        if (clean.includes(sep)) {
            clean = clean.split(sep)[0];
            break; 
        }
    }

    // 3. Tokenização e Filtragem
    let words = clean.split(/\s+/);
    words = words.filter(w => !FLUFF_WORDS.includes(w.toLowerCase()));

    // 4. Limite de Palavras
    if (words.length > 6) {
        words = words.slice(0, 6);
    }

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

        // Verifica Cooldown no Banco de Dados
        const existingPromo = await prisma.promotion.findUnique({ where: { urlHash: promoHash } });

        if (existingPromo) {
            const lastSent = new Date(existingPromo.createdAt);
            const now = new Date();
            const diffInHours = Math.abs(now.getTime() - lastSent.getTime()) / 36e5;
            if (diffInHours < REPOST_COOLDOWN_HOURS) continue; 
            console.log(`   ♻️ Reenviando oferta (Passaram ${diffInHours.toFixed(1)}h)...`);
        }

        const shortTitle = smartShortenTitle(promo.title);
        
        // --- HEURÍSTICA DE IMAGEM 3.0 (VISÃO COMPUTACIONAL) ---
        let imageToSend = promo.imageUrl; // Imagem padrão (catálogo)

        if (promo.additionalImages && promo.additionalImages.length > 0) {
            console.log(`   🔍 Analisando visualmente ${promo.additionalImages.length} imagens para: ${shortTitle}`);
            
            // Percorre a galeria de imagens coletadas pelo scraper
            for (const imgUrl of promo.additionalImages) {
                // Analisa se a imagem tem fundo branco predominante através de pixels
                const isWhite = await isWhiteBackground(imgUrl);
                
                if (!isWhite) {
                    imageToSend = imgUrl;
                    console.log(`   ✨ Imagem LIFESTYLE validada visualmente para: ${shortTitle}`);
                    break; // Interrompe na primeira imagem que não for de catálogo
                }
            }
        }
        // ----------------------------------------------------

        let couponLine = '';
        if (promo.coupon) {
            couponLine = `🎟️ *CUPOM:* ${promo.coupon}\n`;
        }

        const caption = `🔥 *${shortTitle}*\n\n` + 
                        `❌ De: ~${promo.originalPrice}~\n` + 
                        `✅ Por: *${promo.price}*\n` +
                        `${couponLine}` +
                        `🔗 *Link:* ${promo.url}\n\n` +
                        `${footerSignature}`;

        try {
            if (!existingPromo) {
                console.log(`   🚀 Enviando (${storeName}): "${shortTitle}"`);
            }

            // Envio via WhatsApp
            if (imageToSend) {
                await sock.sendMessage(groupId, {
                    image: { url: imageToSend },
                    caption: caption
                });
            } else {
                await sock.sendMessage(groupId, { text: caption });
            }

            // Salva ou atualiza no Prisma
            await prisma.promotion.upsert({
                where: { urlHash: promoHash },
                update: { createdAt: new Date(), sentToGroup: true },
                create: {
                    title: promo.title,
                    price: promo.price,
                    url: promo.url,
                    urlHash: promoHash,
                    sentToGroup: true,
                    createdAt: new Date()
                }
            });

            sentCount++;

            // Delay para evitar banimento do WhatsApp
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