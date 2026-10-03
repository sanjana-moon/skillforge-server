import express from "express";
import cors from "cors";
import { env } from "./config/env";
import routes from "./routes";
import { notFound } from "./middleware/notFound";
import { errorHandler } from "./middleware/errorHandler";

const app = express();

app.use(
  cors({
    origin: env.CLIENT_URL,
    credentials: true,
  })
);
app.use(express.json());

app.use("/api", routes);

app.use(notFound);
app.use(errorHandler);

export default app;