import axios from 'axios';
import sharp from 'sharp';

export async function isWhiteBackground(url: string): Promise<boolean> {
    try {
        const response = await axios.get(url, { responseType: 'arraybuffer' });
        const buffer = Buffer.from(response.data);

        // Pegamos as estatísticas de cores da imagem
        const { channels } = await sharp(buffer).stats();
        
        // Calculamos a média de brilho (R, G, B)
        // No branco puro, esses valores ficam perto de 255
        const averageBrightness = (channels[0].mean + channels[1].mean + channels[2].mean) / 3;

        // Heurística: se a média for maior que 240, é fundo branco ou muito claro
        return averageBrightness > 240;
    } catch (error) {
        return true; // Na dúvida, assume que é branca para o filtro descartar
    }
}