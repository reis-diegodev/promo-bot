// src/core/meli-auth.ts

interface TokenState {
    accessToken: string;
    expiresAt: number;
}

let tokenState: TokenState = {
    accessToken: process.env.MELI_ACCESS_TOKEN || '',
    expiresAt: Date.now() + 5.5 * 60 * 60 * 1000 // 5.5h — margem de segurança
};

export async function getMeliToken(): Promise<string> {
    if (Date.now() < tokenState.expiresAt) {
        return tokenState.accessToken;
    }

    console.log('🔄 Token ML expirado — renovando via client_credentials...');

    try {
        const params = new URLSearchParams({
            grant_type: 'client_credentials',
            client_id: process.env.MELI_CLIENT_ID!,
            client_secret: process.env.MELI_CLIENT_SECRET!,
        });

        const response = await fetch('https://api.mercadolibre.com/oauth/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params.toString()
        });

        if (!response.ok) {
            console.error('❌ Falha ao renovar token — usando token atual');
            return tokenState.accessToken;
        }

        const data = await response.json();

        tokenState = {
            accessToken: data.access_token,
            expiresAt: Date.now() + (data.expires_in - 300) * 1000
        };

        console.log('✅ Token ML renovado');
        return tokenState.accessToken;

    } catch (error) {
        console.error('❌ Erro ao renovar token:', error);
        return tokenState.accessToken;
    }
}