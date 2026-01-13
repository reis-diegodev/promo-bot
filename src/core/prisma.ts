import { PrismaClient } from '@prisma/client';

// Padrão Singleton para evitar "Too many connections" em desenvolvimento
export const prisma = new PrismaClient();