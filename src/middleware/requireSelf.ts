import type { Request, Response, NextFunction } from "express";

export function requireSelf(paramName: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const target = req.params[paramName];

    if (req.user?.email !== target) {
      res.status(403).send({ message: "Forbidden" });
      return;
    }

    next();
  };
}