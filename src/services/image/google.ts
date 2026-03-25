import axios from 'axios';

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const GOOGLE_CX = process.env.GOOGLE_SEARCH_CX;

export async function findLifestyleImage(productTitle: string): Promise<string | null> {
    if (!GOOGLE_API_KEY || !GOOGLE_CX) return null;

    try {
        // 1. Fragmentação do Título
        const words = productTitle.split(' ');
        const brand = words[0].toLowerCase(); // Ex: "Olympikus" ou "Dark"
        const model = words[1]?.toLowerCase(); // Ex: "Corre" ou "Lab"
        const version = words[2]?.toLowerCase(); // Ex: "3" ou "Protein"

        // Criamos o termo de busca focado no modelo exato
        const searchTerms = words.slice(0, 3).join(' ');
        const finalQuery = `"${searchTerms}" review photo -video -site:instagram.com`;

        const response = await axios.get('https://www.googleapis.com/customsearch/v1', {
            params: {
                key: GOOGLE_API_KEY,
                cx: GOOGLE_CX,
                q: finalQuery,
                searchType: 'image',
                num: 5,
                imgType: 'photo',
                safe: 'active'
            }
        });

        const items = response.data.items;
        
        if (items && items.length > 0) {
            for (const item of items) {
                const itemText = (item.title + " " + item.snippet).toLowerCase();

                // --- HEURÍSTICA DE VALIDAÇÃO (O FILTRO RÍGIDO) ---
                
                // 1. Validar a Marca (Obrigatório)
                const hasBrand = itemText.includes(brand);
                
                // 2. Validar o Modelo/Versão (Obrigatório)
                // Se buscamos "Corre 3", o texto TEM que ter "3" e não pode ter "4"
                const hasModel = model ? itemText.includes(model) : true;
                const hasVersion = version ? itemText.includes(version) : true;
                
                // 3. Bloqueio de Versão Errada (Ex: buscou 3, veio 4)
                // Se a versão for um número (como 3), verificamos se não há outros números próximos
                let versionMismatch = false;
                if (!isNaN(Number(version))) {
                    // Se no texto achar "4" mas você queria "3", descartamos
                    if (itemText.includes(' 4 ') || itemText.includes(' v4 ')) versionMismatch = true;
                }

                if (hasBrand && hasModel && hasVersion && !versionMismatch) {
                    console.log(`   🎯 Imagem validada com precisão para: ${searchTerms}`);
                    return item.link;
                }
            }
        }
        
        return null; // Se não houver 100% de certeza, usa a foto da loja
    } catch (error) {
        return null;
    }
}