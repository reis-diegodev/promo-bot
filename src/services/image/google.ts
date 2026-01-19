import axios from 'axios';

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const GOOGLE_CX = process.env.GOOGLE_SEARCH_CX;

// Sufixos focados em LIFESTYLE (Pinterest Vibe)
const SOCIAL_SUFFIXES = [
    'review br',    
    'real photo',
    'aesthetic'
];

// Validador de Segurança (Garante que a imagem existe e carrega rápido)
async function isValidImageUrl(url: string): Promise<boolean> {
    try {
        // Timeout curto (2s): Se a imagem demorar, é melhor usar a original do que travar o bot
        const response = await axios.head(url, { 
            timeout: 2000, 
            validateStatus: (status) => status === 200 
        });
        const contentType = response.headers['content-type'];
        return contentType && contentType.startsWith('image/');
    } catch (error) {
        return false;
    }
}

export async function findLifestyleImage(productTitle: string): Promise<string | null> {
    if (!GOOGLE_API_KEY || !GOOGLE_CX) return null;

    try {
        // Limpeza do título para focar no produto principal
        const cleanTerms = productTitle
            .replace(/tênis|tenis|sapato|smartwatch|relógio|relogio|kit|combo|promoção|oferta|original/gi, '') 
            .replace(/\s-\s.*/, '') 
            .replace(/[()]/g, '')   
            .trim()
            .split(' ').slice(0, 4).join(' '); 

        const suffix = SOCIAL_SUFFIXES[Math.floor(Math.random() * SOCIAL_SUFFIXES.length)];
        
        // Query limpa: Confiamos na configuração do Painel (Pinterest)
        const query = `${cleanTerms} ${suffix}`;

        const response = await axios.get('https://www.googleapis.com/customsearch/v1', {
            params: {
                key: GOOGLE_API_KEY,
                cx: GOOGLE_CX,
                q: query,
                searchType: 'image',
                num: 3, // Pega 3 opções
                imgSize: 'large', 
                safe: 'active'
            }
        });

        const items = response.data.items;
        
        if (items && items.length > 0) {
            // Tenta validar as imagens recebidas
            for (const item of items) {
                const link = item.link;
                const isValid = await isValidImageUrl(link);
                
                if (isValid) {
                    return link; // Retorna a primeira que funcionar
                }
            }
        }
        
        return null; // Se nada funcionar, volta null (usa a original)

    } catch (error) {
        // console.error('Erro Google Image:', error);
        return null;
    }
}