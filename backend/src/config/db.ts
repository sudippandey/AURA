import mongoose from "mongoose";
import { env } from "./env.js";

/**
 * Connect to MongoDB via Mongoose.
 * NOTE (Stage 6): multi-document transactions for inventory reservation
 * require a replica set — even locally (`mongod --replSet rs0`). Single-node
 * servers work for everything in Stage 1.
 */
export async function connectDb(): Promise<typeof mongoose.connection> {
  mongoose.set("strictQuery", true);
  await mongoose.connect(env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
  return mongoose.connection;
}

export function dbStatus(): string {
  const states = ["disconnected", "connected", "connecting", "disconnecting"];
  return states[mongoose.connection.readyState] ?? "unknown";
}

export async function disconnectDb(): Promise<void> {
  await mongoose.disconnect();
}
