import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { createServer } from "http";
import { initSocket } from "./services/socketInstance";
import socketService from "./services/socketService";
import userRoute from "./routes/userRoute";
import authMiddleware from "./middleware/authMiddleware";
import pclient from "./db/client";
import { startUnlockSystem } from './helpers/buffDebuffs';
import publicRoutes from "./routes/publicRoutes";

dotenv.config();

const app = express();
const server = createServer(app);
const wss = initSocket(server); // Initialize WebSocket server

app.use(express.json());
app.use(cors());

app.use('/auth', userRoute);
app.use(authMiddleware);
app.use('/public', publicRoutes);

socketService(wss, pclient);

startUnlockSystem(wss);

const PORT = process.env.PORT || 6000;

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});


process.on('SIGTERM', () => {
    process.exit(0);
});
