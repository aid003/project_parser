import dotenv from "dotenv";

dotenv.config();

export const CONFIG = {
  BASE_URL: process.env.BASE_URL || "https://example.com",
  TIMEOUT: Number(process.env.TIMEOUT) || 5000,
};
