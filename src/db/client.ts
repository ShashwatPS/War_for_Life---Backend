import { PrismaClient } from "@prisma/client";

const prismaSingleton = () =>{
    return new PrismaClient();
}

type PrismaSingleton = ReturnType<typeof prismaSingleton>;

const globalForPrisma = globalThis as unknown as { prisma: PrismaSingleton | undefined };

const pclient = globalForPrisma.prisma ?? prismaSingleton();

export default pclient;