import { prisma } from '../../core/prisma';
import { analyzeImage } from './analyzer';

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

function dedupeImages(images: string[]): string[] {
  return [...new Set(images.filter(Boolean))];
}

function isFashionLike(title: string): boolean {
  const text = title.toLowerCase();

  const keywords = [
    'tenis',
    'tênis',
    'cueca',
    'camiseta',
    'camisa',
    'bermuda',
    'calça',
    'short',
    'legging',
    'perfume',
    'relógio',
    'oculos',
    'óculos',
    'sapato',
    'sandalia',
    'sandália',
    'chinelo',
    'jaqueta',
    'dry fit',
    'dry-fit',
  ];

  return keywords.some((word) => text.includes(word));
}

export async function getBestImage(
  productTitle: string,
  fallbackImages: string[],
): Promise<string | null> {
  const searchTerm = normalizeSearch(productTitle);
  const images = dedupeImages(fallbackImages);

  try {
    const cached = await prisma.imageCache.findUnique({
      where: { query: searchTerm },
    });

    if (cached && isCacheValid(cached.createdAt)) {
      console.log(`💾 Cache hit: ${searchTerm}`);
      return cached.imageUrl;
    }

    if (!images.length) return null;

    const fashionLike = isFashionLike(productTitle);

    const rankedImages: Array<{
      url: string;
      score: number;
      isWhiteBackground: boolean;
      width: number;
      height: number;
    }> = [];

    for (const img of images.slice(0, 8)) {
      const analysis = await analyzeImage(img);

      let finalScore = analysis.score;

      if (fashionLike) {
        if (!analysis.isWhiteBackground) {
          finalScore += 12;
        } else {
          finalScore -= 6;
        }
      }

      rankedImages.push({
        url: img,
        score: finalScore,
        isWhiteBackground: analysis.isWhiteBackground,
        width: analysis.width,
        height: analysis.height,
      });
    }

    rankedImages.sort((a, b) => b.score - a.score);

    const selectedImage = rankedImages[0]?.url || images[0];

    console.log('🖼️ Ranking de imagens:', rankedImages.slice(0, 3));

    if (selectedImage && searchTerm) {
      await prisma.imageCache.upsert({
        where: { query: searchTerm },
        update: {
          imageUrl: selectedImage,
          createdAt: new Date(),
        },
        create: {
          query: searchTerm,
          imageUrl: selectedImage,
        },
      });
    }

    return selectedImage;
  } catch (error) {
    console.error('❌ Erro no image.service:', error);
    return images?.[0] || null;
  }
}