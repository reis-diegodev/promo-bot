# Usa uma imagem leve do Node com as dependências do Chrome
FROM ghcr.io/puppeteer/puppeteer:21.5.2

# Define variáveis de ambiente para produção
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable \
    NODE_ENV=production

WORKDIR /usr/src/app

# Copia os arquivos de dependência
COPY package*.json ./
COPY prisma ./prisma/

# Instala as dependências
RUN npm ci

# Gera o cliente do Prisma
RUN npx prisma generate

# Copia o resto do código
COPY . .

# Comando para iniciar o bot
CMD [ "npx", "tsx", "src/index.ts" ]