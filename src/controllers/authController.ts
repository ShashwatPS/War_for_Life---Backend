import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pclient from "../db/client";
import { Request, Response } from 'express';
import dotenv from "dotenv";

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET as string;

export const register = async (req: Request, res: Response): Promise<any> => {
    try {
        const { teamName, password, members } = req.body;

        if (!teamName || !password || !members || !Array.isArray(members) || members.length === 0) {
            return res.status(400).json({ error: "All fields are required, and members should be a non-empty array" });
        }

        const existingTeam = await pclient.team.findUnique({ where: { teamName } });
        if (existingTeam) {
            return res.status(400).json({ error: "Team already exists" });
        }
        const enrollmentNumbers = members.map((member) => member.enrollmentNo);

        const existingUsers = await pclient.user.findMany({
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
        const hashedPassword = await bcrypt.hash(password, 10);
        const newTeam = await pclient.team.create({
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
            const newUser = await pclient.user.create({
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
    } catch (error) {
        console.error("Error during team and user registration:", error);
        res.status(500).json({ error: "Internal server error" });
    }
};


export const login = async (req: Request, res: Response): Promise<any> => {
    try {
        const { teamName, password } = req.body;

        const team = await pclient.team.findUnique({
            where: { teamName },
        });

        if (!team) {
            return res.status(400).json({ error: "Team not found" });
        }

        const isPasswordValid = await bcrypt.compare(password, team.password);
        if (!isPasswordValid) {
            return res.status(400).json({ error: "Invalid TeamName or password" });
        }

        const token = jwt.sign({ userId: team.id }, JWT_SECRET, {
            expiresIn: process.env.JWT_EXPIRES_IN,
        });

        res.json({ message: "Login successful", token, teamId: team.id });
    } catch (error) {
        res.status(500).json({ error: "Internal server error" });
    }
};
