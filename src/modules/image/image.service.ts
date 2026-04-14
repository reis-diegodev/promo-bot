// src/modules/image/image.service.ts
import { prisma } from '../../core/prisma';
import { isWhiteBackground } from './analyzer';

const CACHE_TTL_HOURS = 24;

function normalizeSearch(title: string): string {
    if (!title) return '';
    return title
        .toLowerCase()
        .replace(/[^a-z0-9\s]/gi, '')
        .replace(/\s+/g, ' ')
        .trim()
        .split(' ')
        .slice(0, 5)
        .join(' ');
}

function isCacheValid(createdAt: Date): boolean {
    const diffHours = (Date.now() - createdAt.getTime()) / 36e5;
    return diffHours < CACHE_TTL_HOURS;
}

export async function getBestImage(
    productTitle: string,
    fallbackImages: string[]
): Promise<string | null> {
    const searchTerm = normalizeSearch(productTitle);
    const images = fallbackImages.filter(Boolean);

    try {
        // 1. CACHE
        const cached = await prisma.imageCache.findUnique({
            where: { query: searchTerm }
        });
        if (cached && isCacheValid(cached.createdAt)) {
            console.log(`💾 Cache hit: ${searchTerm}`);
            return cached.imageUrl;
        }

        let selectedImage: string | null = null;

        // 2. MELHOR IMAGEM DO CARD (primeira sem fundo branco)
        for (const img of images) {
            const isWhite = await isWhiteBackground(img);
            if (!isWhite) {
                selectedImage = img;
                console.log(`✅ Imagem selecionada`);
                break;
            }
        }

        // 3. ÚLTIMO RECURSO
        if (!selectedImage && images.length) {
            selectedImage = images[0];
            console.log(`📦 Usando primeira imagem disponível`);
        }

        // 4. CACHE
        if (selectedImage && searchTerm) {
            await prisma.imageCache.upsert({
                where: { query: searchTerm },
                update: { imageUrl: selectedImage, createdAt: new Date() },
                create: { query: searchTerm, imageUrl: selectedImage }
            });
        }

        return selectedImage;

    } catch (error) {
        console.error(`❌ Erro no image.service:`, error);
        return images?.[0] || null;
    }
}