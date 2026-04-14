import crypto from 'crypto';
import { prisma } from '../core/prisma';
import { ScrapedPromo } from './scraper/types';
import { WASocket } from '@whiskeysockets/baileys';
import { getBestImage } from '../modules/image/image.service';
import { generateMeliAffiliateLink } from './scraper/affiliate';
import { addToQueue } from '../queue/message.queue';

const REPOST_COOLDOWN_HOURS = 72;

// --------------------
// UTILIDADES
// --------------------

function generateHash(text: string): string {
    return crypto.createHash('md5').update(text).digest('hex');
}

function parsePrice(priceStr: string): number {
    const clean = priceStr.replace(/[R$\s.]/g, '').replace(',', '.');
    return parseFloat(clean) || 0;
}

const FLUFF_WORDS = [
    'original', 'promoção', 'oferta', 'lançamento', 'novo', 'lacrado',
    'envio', 'imediato', 'frete', 'grátis', 'full', 'premium', 'exclusivo',
    'brinde', 'nota', 'fiscal', 'garantia', 'nfc', 'gps', 'bluetooth',
    'wifi', '4g', '5g', 'unissex', 'adulto', 'infantil'
];

function smartShortenTitle(title: string): string {
    if (!title) return '';

    let clean = title.replace(/(\(|\[).*?(\)|\])/g, '');

    const separators = [' - ', ' | ', ' / ', ', ', ' – '];
    for (const sep of separators) {
        if (clean.includes(sep)) {
            clean = clean.split(sep)[0];
            break;
        }
    }

    let words = clean.split(/\s+/);
    words = words.filter(w => !FLUFF_WORDS.includes(w.toLowerCase()));

    if (words.length > 6) words = words.slice(0, 6);

    return words.join(' ').trim();
}

const STORE_SIGNATURES: Record<string, string> = {
    'Amazon': '📦 *Olha isso na Amazon!*',
    'Mercado Livre': '⚡ *Direto do MELI!*',
    'Netshoes': '🏃 *Corre na Netshoes!*',
    'Shopee': '🛍️ *Achado na Shopee!*',
    'Default': '🔥 *Oferta*'
};

// --------------------
// CORE SERVICE
// --------------------

async function shouldSendPromo(hash: string): Promise<boolean> {
    const existing = await prisma.promotion.findUnique({
        where: { urlHash: hash }
    });

    if (!existing) return true;

    const diffHours =
        (Date.now() - new Date(existing.createdAt).getTime()) / 36e5;

    return diffHours >= REPOST_COOLDOWN_HOURS;
}

async function buildAffiliateUrl(
    url: string,
    storeName: string,
    shortTitle: string
): Promise<string> {
    if (storeName === 'Mercado Livre') {
        return generateMeliAffiliateLink(url);
    }
    return url;
}

function buildCaption(promo: ScrapedPromo, shortTitle: string, link: string, storeName: string) {
    const signature = STORE_SIGNATURES[storeName] || STORE_SIGNATURES['Default'];

    const couponLine = promo.coupon
        ? `🎟️ *CUPOM:* ${promo.coupon}\n`
        : '';

    return `🔥 *${shortTitle}*\n\n` +
        `❌ De: ~${promo.originalPrice}~\n` +
        `✅ Por: *${promo.price}*\n` +
        `${couponLine}` +
        `🔗 *LINK EXCLUSIVO:* ${link}\n\n` +
        `${signature}`;
}

async function savePromo(promo: ScrapedPromo, hash: string, url: string) {
    await prisma.promotion.upsert({
        where: { urlHash: hash },
        update: {
            createdAt: new Date(),
            sentToGroup: true
        },
        create: {
            title: promo.title,
            price: promo.price,
            url,
            urlHash: hash,
            sentToGroup: true,
            createdAt: new Date()
        }
    });
}

// --------------------
// MAIN FLOW
// --------------------

export async function processAndSendPromos(
    promos: ScrapedPromo[],
    sock: WASocket,
    storeName: string
) {
    const groupId = process.env.TARGET_GROUP_ID;
    if (!groupId) throw new Error('TARGET_GROUP_ID não definido');

    let sentCount = 0;

    for (const promo of promos) {
        try {
            const hash = generateHash(promo.title + promo.price);

            const canSend = await shouldSendPromo(hash);
            if (!canSend) continue;

            const shortTitle = smartShortenTitle(promo.title);

            // 💰 LINK AFILIADO
            const affiliateUrl = await buildAffiliateUrl(
                promo.url,
                storeName,
                shortTitle
            );

            // 🖼️ IMAGEM
            const bestImage = await getBestImage(
                shortTitle,
                promo.additionalImages || [promo.imageUrl]
            );

            // 📝 CAPTION
            const caption = buildCaption(
                promo,
                shortTitle,
                affiliateUrl,
                storeName
            );

            // 📤 FILA
            addToQueue({
                image: bestImage,
                caption,
                groupId
            });

            // 💾 PERSISTÊNCIA
            await savePromo(promo, hash, affiliateUrl);

            sentCount++;

            // ⏱️ Delay anti-ban
            const delay = Math.floor(Math.random() * (10 - 5 + 1) + 5) * 60 * 1000;
            console.log(`✅ Adicionado à fila (${sentCount}) | Próximo em ${delay / 60000}min`);
            await new Promise(resolve => setTimeout(resolve, delay));

        } catch (error) {
            console.error('❌ Erro ao processar promo:', error);
        }
    }

    console.log(`🚀 Total enviado: ${sentCount}`);
}