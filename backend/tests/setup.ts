import mongoose from "mongoose";
import { getTestDbUri } from "./testDb.js";

const uri = getTestDbUri();

export async function connectTestDb(): Promise<void> {
  await mongoose.connect(uri);
  await mongoose.connection.db?.dropDatabase();
}

export async function clearTestDb(): Promise<void> {
  await mongoose.connection.db?.dropDatabase();
}

export async function closeTestDb(): Promise<void> {
  await mongoose.disconnect();
}
