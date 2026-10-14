import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/client';

const connectionString = process.env.DATABASE_URL ?? 'postgresql://postgres@localhost:5432/arbolado';
export const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
export type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];
