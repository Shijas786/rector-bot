import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function check() {
    const predictions = await prisma.prediction.findMany({
        orderBy: { createdAt: 'desc' },
        take: 5
    });
    console.log('Last 5 predictions:');
    console.log(JSON.stringify(predictions, null, 2));
    await prisma.$disconnect();
}

check().catch(console.error);
