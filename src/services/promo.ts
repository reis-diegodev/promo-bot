import crypto from 'crypto';
import { prisma } from '../core/prisma';
import { connectToWhatsApp } from './whatsapp/client';
import { ScrapedPromo } from './scraper/types';

// Mantemos a função de hash
function generateHash(text: string): string {
    return crypto.createHash('md5').update(text).digest('hex');
}

export async function processAndSendPromos(promos: ScrapedPromo[]) {
    console.log(`\n🔄 Processando ${promos.length} ofertas encontradas...`);
    
    // Conexão segura com retry implícito no client
    const sock = await connectToWhatsApp();
    
    // Aguarda estabilizar a conexão
    await new Promise(r => setTimeout(r, 2000));

    const groupId = process.env.TARGET_GROUP_ID;
    if (!groupId) throw new Error('❌ TARGET_GROUP_ID não definido no .env');

    let sentCount = 0;

    for (const promo of promos) {
        const uniqueKey = promo.title + promo.price; // Combina Título + Preço para ficar bem único
        const promoHash = generateHash(uniqueKey);

        // Verifica no banco (usamos o campo urlHash para guardar esse hash do título)
        const exists = await prisma.promotion.findUnique({
            where: { urlHash: promoHash }
        });

        if (exists) {
            console.log(`   ⏭️ Pula: "${promo.title.substring(0, 20)}..." (Já enviada)`);
            continue;
        }

        let couponLine = '';
        if (promo.coupon) {
            couponLine = `🎟️ *CUPOM EXTRA:* ${promo.coupon}\n`;
        }

        const caption = `🔥 *${promo.title}*\n\n` +
                        `❌ De: ~${promo.originalPrice}~\n` +  
                        `✅ Por: *${promo.price}*\n\n` +
                        `${couponLine}` +      
                        `🔗 *Compre aqui:* ${promo.url}\n\n` +
                        `_🤖 Monitor de Ofertas Fitness_`;

        try {
            console.log(`   🚀 Enviando: "${promo.title.substring(0, 20)}..."`);

            if (!sock) throw new Error("Socket lost");

            if (promo.imageUrl) {
                await sock.sendMessage(groupId, {
                    image: { url: promo.imageUrl },
                    caption: caption
                });
            } else {
                await sock.sendMessage(groupId, { text: caption });
            }

            // Salva no banco com o NOVO hash
            await prisma.promotion.create({
                data: {
                    title: promo.title,
                    price: promo.price,
                    url: promo.url,
                    urlHash: promoHash, // Salvando o hash do título aqui
                    sentToGroup: true
                }
            });

            sentCount++;
            // Delay anti-spam
            await new Promise(r => setTimeout(r, 8000));

        } catch (error) {
            console.error(`   ❌ Falha ao enviar:`, error);
            await new Promise(r => setTimeout(r, 5000));
        }
    }

    console.log(`\n✅ Processo finalizado. ${sentCount} novas ofertas enviadas.`);
}