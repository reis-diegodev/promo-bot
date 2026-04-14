// src/modules/image/providers/marketplace.provider.ts

interface MeliPicture {
    id: string;
    url: string;
    secure_url: string;
    max_size: string;
}

export async function getMeliProductImages(mlbId: string): Promise<string[]> {
    try {
        const isUniversal = mlbId.toUpperCase().startsWith('MLBU');
        const endpoint = isUniversal
            ? `https://api.mercadolibre.com/products/${mlbId}/pictures`
            : `https://api.mercadolibre.com/items/${mlbId}/pictures`;

        console.log(`📡 Buscando pictures: ${endpoint}`);

        const response = await fetch(endpoint, {
            headers: { 'Accept': 'application/json' }
        });

        if (!response.ok) {
            console.warn(`⚠️ ML Pictures API erro ${response.status} para ${mlbId}`);
            return [];
        }

        const pictures: MeliPicture[] = await response.json();

        return pictures
            .map(p => p.secure_url || p.url)
            .filter(Boolean);

    } catch (error) {
        console.error(`❌ Erro ao buscar imagens ML para ${mlbId}:`, error);
        return [];
    }
}