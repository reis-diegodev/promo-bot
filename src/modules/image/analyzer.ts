import axios from 'axios';
import sharp from 'sharp';

export type ImageAnalysis = {
  isWhiteBackground: boolean;
  whiteBorderRatio: number;
  width: number;
  height: number;
  score: number;
};

export async function analyzeImage(url: string): Promise<ImageAnalysis> {
  try {
    const response = await axios.get<ArrayBuffer>(url, {
      responseType: 'arraybuffer',
      timeout: 8000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        Accept: 'image/webp,image/apng,image/*,*/*',
      },
    });

    const buffer = Buffer.from(response.data);
    const image = sharp(buffer);
    const metadata = await image.metadata();

    const width = metadata.width || 0;
    const height = metadata.height || 0;

    if (!width || !height || width < 100) {
      return {
        isWhiteBackground: true,
        whiteBorderRatio: 1,
        width,
        height,
        score: 0,
      };
    }

    const { data, info } = await image
      .resize(100, 100, { fit: 'fill' })
      .raw()
      .toBuffer({ resolveWithObject: true });

    const channels = info.channels;
    let whiteBorderPixels = 0;
    let totalBorderPixels = 0;

    for (let i = 0; i < 100; i++) {
      const positions = [
        i * channels,
        (99 * 100 + i) * channels,
        i * 100 * channels,
        (i * 100 + 99) * channels,
      ];

      for (const pos of positions) {
        if (pos + 2 >= data.length) continue;

        const r = data[pos];
        const g = data[pos + 1];
        const b = data[pos + 2];

        totalBorderPixels++;

        if (r > 230 && g > 230 && b > 230) {
          whiteBorderPixels++;
        }
      }
    }

    const whiteBorderRatio = totalBorderPixels
      ? whiteBorderPixels / totalBorderPixels
      : 1;

    const isWhiteBackground = whiteBorderRatio > 0.7;

    let score = 0;

    score += Math.min(width, 2000) / 100;

    if (!isWhiteBackground) {
      score += 10;
    } else {
      score -= 8;
    }

    if (width < 500 || height < 500) {
      score -= 4;
    }

    return {
      isWhiteBackground,
      whiteBorderRatio,
      width,
      height,
      score,
    };
  } catch (error) {
    console.warn(`⚠️ Não foi possível analisar imagem — fallback: ${url}`);

    return {
      isWhiteBackground: true,
      whiteBorderRatio: 1,
      width: 0,
      height: 0,
      score: 0,
    };
  }
}

export async function isWhiteBackground(url: string): Promise<boolean> {
  const analysis = await analyzeImage(url);
  return analysis.isWhiteBackground;
}