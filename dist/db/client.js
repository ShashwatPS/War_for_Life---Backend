"use strict";
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const prismaSingleton = () => {
    return new client_1.PrismaClient();
};
const globalForPrisma = globalThis;
const pclient = (_a = globalForPrisma.prisma) !== null && _a !== void 0 ? _a : prismaSingleton();
exports.default = pclient;
