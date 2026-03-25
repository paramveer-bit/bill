import { PrismaClient } from '../lib/generated/prisma/client.js'
import { PrismaPg } from '@prisma/adapter-pg'
import "dotenv/config";

const connectionString = `${process.env.DATABASE_URL}`
if (!connectionString) {
    throw new Error("DATABASE_URL environment variable is not set");
}
const prismaClientSingleton = () => {
    console.log("Prisma Client Initialized", process.env.DATABASE_URL);
    const adapter = new PrismaPg({ connectionString })

    return new PrismaClient({
        adapter
    })
}

declare global {
    var prismaGlobal: undefined | ReturnType<typeof prismaClientSingleton>
}

const prisma: ReturnType<typeof prismaClientSingleton> = globalThis.prismaGlobal ?? prismaClientSingleton()

export default prisma

if (process.env.NODE_ENV !== 'production') globalThis.prismaGlobal = prisma