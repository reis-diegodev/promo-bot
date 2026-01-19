# Usa a imagem oficial do Playwright (já vem com Node 20 e Browsers)
FROM mcr.microsoft.com/playwright:v1.41.2-jammy

# Define o diretório de trabalho
WORKDIR /usr/src/app

# Copia os arquivos de configuração de dependências
COPY package*.json ./
COPY prisma ./prisma/

# Instala as dependências do projeto
# (O --unsafe-perm ajuda a evitar problemas de permissão no Render)
RUN npm install --unsafe-perm

# Gera o cliente do Prisma (para o banco de dados)
RUN npx prisma generate

# Copia o restante do código do projeto
COPY . .

# Comando para iniciar o bot
# (Usamos npx tsx diretamente)
CMD [ "npx", "tsx", "src/index.ts" ]