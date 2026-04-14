// src/modules/image/analyzer.ts
import axios from 'axios';
import sharp from 'sharp';

export async function isWhiteBackground(url: string): Promise<boolean> {
    try {
        const response = await axios.get<ArrayBuffer>(url, {
            responseType: 'arraybuffer',
            timeout: 8000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'image/webp,image/apng,image/*,*/*'
            }
        });

        const buffer = Buffer.from(response.data);
        const image = sharp(buffer);
        const metadata = await image.metadata();

        if (!metadata.width || metadata.width < 100) return true;

        // Analisa só a borda da imagem — fundo branco de catálogo
        // tem bordas brancas, imagens lifestyle não
        const { data, info } = await image
            .resize(100, 100, { fit: 'fill' })
            .raw()
            .toBuffer({ resolveWithObject: true });

        const channels = info.channels;
        let whiteBorderPixels = 0;
        let totalBorderPixels = 0;

        // Verifica pixels das bordas (primeira e última linha + colunas)
        for (let i = 0; i < 100; i++) {
            const positions = [
                i * channels,                    // primeira linha
                (99 * 100 + i) * channels,       // última linha
                i * 100 * channels,              // primeira coluna
                (i * 100 + 99) * channels        // última coluna
            ];

            for (const pos of positions) {
                if (pos + 2 >= data.length) continue;
                const r = data[pos];
                const g = data[pos + 1];
                const b = data[pos + 2];
                totalBorderPixels++;
                if (r > 230 && g > 230 && b > 230) whiteBorderPixels++;
            }
        }

        const whiteBorderRatio = whiteBorderPixels / totalBorderPixels;
        // Se mais de 70% das bordas são brancas, é imagem de catálogo
        return whiteBorderRatio > 0.70;

    } catch (error) {
        console.warn(`⚠️ Não foi possível analisar imagem — assumindo válida: ${url}`);
        return true; // <- mudança crítica: fail-safe agora ACEITA em vez de descartar
    }
}