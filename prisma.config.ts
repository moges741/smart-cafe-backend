import "dotenv/config"; 
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",

  migrations: {
    path: "prisma/migrations", 
    seed: "ts-node src/database/seeds/seed.ts", 

  },

  // engine: "classic", // required in Prisma 6.18+ when datasource is here
  datasource: {
    url: env("DATABASE_URL"), // reads DATABASE_URL from your .env
  },
});