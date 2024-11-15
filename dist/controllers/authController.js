"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.login = exports.register = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const client_1 = __importDefault(require("../db/client"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const JWT_SECRET = process.env.JWT_SECRET;
const register = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { teamName, password, members } = req.body;
        if (!teamName || !password || !members || !Array.isArray(members) || members.length === 0) {
            return res.status(400).json({ error: "All fields are required, and members should be a non-empty array" });
        }
        const existingTeam = yield client_1.default.team.findUnique({ where: { teamName } });
        if (existingTeam) {
            return res.status(400).json({ error: "Team already exists" });
        }
        const enrollmentNumbers = members.map((member) => member.enrollmentNo);
        const existingUsers = yield client_1.default.user.findMany({
            where: {
                enrollmentNo: {
                    in: enrollmentNumbers,
                },
            },
        });
        if (existingUsers.length > 0) {
            const existingEnrollmentNumbers = existingUsers.map((user) => user.enrollmentNo);
            return res.status(400).json({
                error: `The following enrollment numbers are already registered: ${existingEnrollmentNumbers.join(", ")}`,
            });
        }
        const hashedPassword = yield bcryptjs_1.default.hash(password, 10);
        const newTeam = yield client_1.default.team.create({
            data: {
                teamName,
                password: hashedPassword,
            },
        });
        const createdUsers = [];
        for (const member of members) {
            const { enrollmentNo, name } = member;
            if (!enrollmentNo || !name) {
                return res.status(400).json({ error: "Each member must have an enrollment number and name" });
            }
            const newUser = yield client_1.default.user.create({
                data: {
                    teamId: newTeam.id,
                    enrollmentNo,
                    name,
                },
            });
            createdUsers.push({ enrollmentNo: newUser.enrollmentNo, name: newUser.name });
        }
        res.status(201).json({
            message: "Team and users registered successfully",
            team: { teamName: newTeam.teamName },
            members: createdUsers,
        });
    }
    catch (error) {
        console.error("Error during team and user registration:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
exports.register = register;
const login = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { teamName, password } = req.body;
        const team = yield client_1.default.team.findUnique({
            where: { teamName },
        });
        if (!team) {
            return res.status(400).json({ error: "Team not found" });
        }
        const isPasswordValid = yield bcryptjs_1.default.compare(password, team.password);
        if (!isPasswordValid) {
            return res.status(400).json({ error: "Invalid TeamName or password" });
        }
        const token = jsonwebtoken_1.default.sign({ userId: team.id }, JWT_SECRET, {
            expiresIn: process.env.JWT_EXPIRES_IN,
        });
        res.json({ message: "Login successful", token });
    }
    catch (error) {
        res.status(500).json({ error: "Internal server error" });
    }
});
exports.login = login;
