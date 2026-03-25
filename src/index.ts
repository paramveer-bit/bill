import dotenv from 'dotenv';
import app from './app.js';
import prisma from './prismaClient/index.js';

dotenv.config({
    path: './env'
});

const server = app.listen(process.env.PORT || 5000, () => {
    console.log(`Server started on http://localhost:${process.env.PORT}`);
})

process.on("SIGINT", async () => {
    console.log("Shutting down...");
    await prisma.$disconnect();
    server.close(() => {
        console.log("Server closed.");
        process.exit(0);

    });
});