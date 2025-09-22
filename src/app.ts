import express from "express";
import path from "path";
import bodyParser from "body-parser";
import index from "./routes";
import RateLimit from "express-rate-limit";
import morgan from "morgan";
import compression from "compression";

import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const limiter = RateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 2000, // limit each IP to X requests per windowMs
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

const app = express();
app.disable("x-powered-by");
app.use(compression());
app.use(morgan("dev"));
app.set("trust proxy", 1); // trust first proxy

//  apply to all requests
app.use(limiter);

app.use(bodyParser.json({ limit: "50mb" }));

app.use(
  bodyParser.urlencoded({
    extended: false,
    limit: "1mb",
  }),
);
app.use(express.static(path.join(__dirname, "public")));
app.use("/", index);
app.use("/anubis/", index);

app.use((req, res) => {
  res.status(404);
  res.send("404").end();
});

export default app;
