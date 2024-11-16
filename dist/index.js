"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const http_1 = require("http");
const socketInstance_1 = require("./services/socketInstance");
const socketService_1 = __importDefault(require("./services/socketService"));
const userRoute_1 = __importDefault(require("./routes/userRoute"));
const authMiddleware_1 = __importDefault(require("./middleware/authMiddleware"));
const client_1 = __importDefault(require("./db/client"));
const buffDebuffs_1 = require("./helpers/buffDebuffs");
const publicRoutes_1 = __importDefault(require("./routes/publicRoutes"));
dotenv_1.default.config();
const app = (0, express_1.default)();
const server = (0, http_1.createServer)(app);
const io = (0, socketInstance_1.initSocket)(server); // Initialize Socket.io
app.use(express_1.default.json());
app.use((0, cors_1.default)());
// Routes and middleware
app.use('/auth', userRoute_1.default);
app.use(authMiddleware_1.default);
app.use('/public', publicRoutes_1.default);
// Initialize socket service
(0, socketService_1.default)(io, client_1.default);
// Pass the io instance to startUnlockSystem
(0, buffDebuffs_1.startUnlockSystem)(io);
const PORT = process.env.PORT || 5000;
// Start the server
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
// Handle graceful shutdown
process.on('SIGTERM', () => {
    // Cleanup code if needed...
    process.exit(0);
});
