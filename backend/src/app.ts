import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import morgan from "morgan";
import swaggerUi from "swagger-ui-express";
import { env } from "./config/env.js";
import { loadSwaggerDocument } from "./docs/swagger.js";
import { errorHandler, notFound } from "./middleware/errorHandler.js";
import { adminRouter } from "./routes/admin.js";
import { authRouter } from "./routes/auth.js";
import { cartRouter } from "./routes/cart.js";
import { categoriesRouter } from "./routes/categories.js";
import { healthRouter } from "./routes/health.js";
import { inventoryRouter } from "./routes/inventory.js";
import { ordersRouter } from "./routes/orders.js";
import { productsRouter } from "./routes/products.js";
import { reviewsRouter } from "./routes/reviews.js";
import { wishlistRouter } from "./routes/wishlist.js";
import { logger } from "./utils/logger.js";

export function createApp(): express.Express {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);

  // Security headers (sensible defaults; CSP left to the frontend host).
  app.use(helmet());

  // CORS: explicit allow-list from env, credentials on for cookie-based refresh later.
  const origins = env.CORS_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean);
  app.use(cors({ origin: origins, credentials: true }));

  // Global rate limit (tighter per-route limits, e.g. auth, arrive in Stage 2).
  const limiter = rateLimit({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    limit: env.RATE_LIMIT_MAX,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { success: false, message: "Too many requests, please try again later.", code: "RATE_LIMITED" }
  });
  app.use("/api/", limiter);

  // Body parsing with size caps (no file uploads in Stage 1).
  app.use(express.json({ limit: "256kb" }));
  app.use(express.urlencoded({ extended: false, limit: "256kb" }));

  if (env.NODE_ENV !== "test") {
    app.use(morgan(env.NODE_ENV === "production" ? "combined" : "dev"));
  }

  // Root + versioned routes.
  app.get("/", (_req, res) => {
    res.json({
      success: true,
      data: { name: "AURA API", version: "1.0.0", health: "/api/v1/health", docs: "/api/docs" }
    });
  });
  app.use("/api/v1", healthRouter);
  app.use("/api/v1/auth", authRouter);
  app.use("/api/v1/products", productsRouter);
  app.use("/api/v1/categories", categoriesRouter);
  app.use("/api/v1/cart", cartRouter);
  app.use("/api/v1/wishlist", wishlistRouter);
  app.use("/api/v1/orders", ordersRouter);
  app.use("/api/v1/inventory", inventoryRouter);
  app.use("/api/v1/reviews", reviewsRouter);
  app.use("/api/v1/admin", adminRouter);

  // Interactive docs (skipped gracefully if the yaml is missing, e.g. trimmed deploys).
  try {
    const doc = loadSwaggerDocument();
    app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(doc));
    logger.info("[docs] Swagger UI at /api/docs");
  } catch (err) {
    logger.warn("[docs] Skipped:", (err as Error).message);
  }

  // 404 + centralized errors LAST.
  app.use(notFound);
  app.use(errorHandler);
  return app;
}
