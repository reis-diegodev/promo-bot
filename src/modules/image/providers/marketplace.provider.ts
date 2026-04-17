// src/modules/image/providers/marketplace.provider.ts

interface MeliPicture {
  id: string;
  url?: string;
  secure_url?: string;
  max_size?: string;
}

interface MeliItemResponse {
  id: string;
  pictures?: MeliPicture[];
}

export async function getMeliProductImages(mlbId: string): Promise<string[]> {
  try {
    const endpoint = `https://api.mercadolibre.com/items/${mlbId}`;

    console.log(`📡 Buscando item ML: ${endpoint}`);

    const response = await fetch(endpoint, {
      headers: {
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      console.warn(`⚠️ ML Item API erro ${response.status} para ${mlbId}`);
      return [];
    }

    const item: MeliItemResponse = await response.json();

    return (item.pictures || [])
      .map((picture) => picture.secure_url || picture.url || '')
      .filter(Boolean);
  } catch (error) {
    console.error(`❌ Erro ao buscar imagens ML para ${mlbId}:`, error);
    return [];
  }
}