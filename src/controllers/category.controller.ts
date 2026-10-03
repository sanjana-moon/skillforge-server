import type { Request, Response } from "express";
import * as CourseService from "../services/course.service";

export async function getCategories(req: Request, res: Response) {
  try {
    const categories = await CourseService.listCategories();
    res.send(categories);
  } catch (err) {
    console.error("Error fetching categories:", err);
    res.status(500).send({ message: "Failed to fetch categories" });
  }
}