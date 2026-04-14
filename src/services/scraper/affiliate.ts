function extractMlbId(url: string): string | null {
    // Cobre /MLB-123, /MLB123, /p/MLB123, /up/MLBU123
    const match = url.match(/\/MLB[A-Z]?-?(\d{8,15})/i);
    return match ? `MLB${match[1]}` : null;
}

export function generateMeliAffiliateLink(productUrl: string): string {
    const mattTool = process.env.MELI_MATT_TOOL;

    if (!mattTool) {
        console.warn('⚠️ MELI_MATT_TOOL não definido — usando URL original');
        return productUrl;
    }

    const mlbId = extractMlbId(productUrl);

    if (!mlbId) {
        console.warn(`⚠️ Não foi possível extrair MLB ID de: ${productUrl}`);
        return productUrl;
    }

    let base: string;
    if (productUrl.includes('/p/')) {
        base = `https://www.mercadolivre.com.br/p/${mlbId}`;
    } else if (productUrl.includes('produto.mercadolivre.com.br')) {
        base = productUrl.split('#')[0].split('?')[0];
    } else {
        base = `https://www.mercadolivre.com.br/${mlbId}`;
    }

    const affiliateUrl = `${base}?matt_tool=${mattTool}`;
    console.log(`✅ Link afiliado: ${affiliateUrl}`);
    return affiliateUrl;
}