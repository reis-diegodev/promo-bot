import crypto from 'crypto';
import { prisma } from '../core/prisma';
import { ScrapedPromo } from './scraper/types';
import { WASocket } from '@whiskeysockets/baileys';

// CONFIGURAÇÃO 1: Intervalo de reenvio aumentado para 3 dias (evitar spam)
const REPOST_COOLDOWN_HOURS = 72;

function generateHash(text: string): string {
    return crypto.createHash('md5').update(text).digest('hex');
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

        const existingPromo = await prisma.promotion.findUnique({
            where: { urlHash: promoHash }
        });

        if (existingPromo) {
            const lastSent = new Date(existingPromo.createdAt);
            const now = new Date();
            const diffInHours = Math.abs(now.getTime() - lastSent.getTime()) / 36e5;

            // Se foi enviado há menos de 72h, ignora completamente
            if (diffInHours < REPOST_COOLDOWN_HOURS) {
                continue; 
            }
            
            console.log(`   ♻️ Reenviando oferta (Passaram ${diffInHours.toFixed(1)}h): "${promo.title.substring(0, 15)}..."`);
        }

        let couponLine = '';
        if (promo.coupon) {
            couponLine = `🎟️ *CUPOM:* ${promo.coupon}\n`;
        }

        const caption = `🔥 *${promo.title}*\n\n` +
                        `❌ De: ~${promo.originalPrice}~\n` +
                        `✅ Por: *${promo.price}*\n` +
                        `${couponLine}` +
                        `🔗 *Link:* ${promo.url}\n\n` +
                        `${footerSignature}`;

        try {
            if (!existingPromo) {
                console.log(`   🚀 Enviando (${storeName}): "${promo.title.substring(0, 20)}..."`);
            }

            if (promo.imageUrl) {
                await sock.sendMessage(groupId, {
                    image: { url: promo.imageUrl },
                    caption: caption
                });
            } else {
                await sock.sendMessage(groupId, { text: caption });
            }

            await prisma.promotion.upsert({
                where: { urlHash: promoHash },
                update: { 
                    createdAt: new Date(), 
                    sentToGroup: true 
                },
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

            if (index < promos.length - 1) {
                const delayMs = 60000 + Math.random() * 30000;
                console.log(`   ⏳ Aguardando ${(delayMs/1000).toFixed(0)}s antes da próxima oferta...`);
                await new Promise(r => setTimeout(r, delayMs));
            }

        } catch (error) {
            console.error(`   ❌ Falha ao enviar msg:`, error);
        }
    }
    
    if (sentCount > 0) {
        console.log(`   ✅ ${sentCount} mensagens processadas deste lote.`);
    }
}