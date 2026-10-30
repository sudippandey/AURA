import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { ZodSchema } from "zod";

interface Schemas {
  body?: ZodSchema;
  query?: ZodSchema;
  params?: ZodSchema;
}

/** Validate req.body / req.query / req.params with Zod. Failures → errorHandler (400). */
export function validate(schemas: Schemas): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (schemas.body) req.body = schemas.body.parse(req.body);
      if (schemas.query) req.query = schemas.query.parse(req.query) as Request["query"];
      if (schemas.params) req.params = schemas.params.parse(req.params) as Request["params"];
      next();
    } catch (err) {
      next(err);
    }
  };
}
