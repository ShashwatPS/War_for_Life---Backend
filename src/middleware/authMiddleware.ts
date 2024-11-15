import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export default function authMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
    const token = req.header("Authorization")?.replace("Bearer ", "");

    if (!token) {
        res.status(401).json({ error: "Unauthorized" });
        return Promise.resolve();
    }

    try {
        const verified = jwt.verify(token, process.env.JWT_SECRET as string);
        (req as any).user = verified;
        next();
        return Promise.resolve();
    } catch (error) {
        res.status(401).json({ error: "Unauthorized" });
        return Promise.resolve();
    }
}