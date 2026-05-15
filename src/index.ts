import dotenv from 'dotenv';
import app from './app.js';
import prisma from './prismaClient/index.js';

dotenv.config({
    path: './env'
});

const PORT = parseInt(process.env.PORT || '5000', 10);
const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server started on http://localhost:${PORT}`);
})

process.on("SIGINT", async () => {
    console.log("Shutting down...");
    await prisma.$disconnect();
    server.close(() => {
        console.log("Server closed.");
        process.exit(0);

    });
});