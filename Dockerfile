# ATUALIZADO para v1.57.0-jammy (A versão que o erro pediu)
FROM mcr.microsoft.com/playwright:v1.57.0-jammy

WORKDIR /usr/src/app

# Copia dependências
COPY package*.json ./
COPY prisma ./prisma/

# Instala pacotes
RUN npm install --unsafe-perm

# Copia o código
COPY . .

# Comando de inicialização (Gera Prisma + Roda Bot)
CMD npx prisma generate && npx tsx src/index.ts