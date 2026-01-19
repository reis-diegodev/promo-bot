# Usa a imagem oficial do Playwright (Ubuntu Jammy + Node 20)
FROM mcr.microsoft.com/playwright:v1.41.2-jammy

WORKDIR /usr/src/app

# Copia os arquivos de dependência
COPY package*.json ./
COPY prisma ./prisma/

# Instala dependências
RUN npm install --unsafe-perm

# Copia o código fonte
COPY . .

CMD npx prisma generate && npx tsx src/index.ts