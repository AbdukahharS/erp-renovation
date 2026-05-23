import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createDbClient } from "../client.ts";

const url = process.env.DATABASE_URL;
if (!url) {
	console.error("DATABASE_URL is not set");
	process.exit(1);
}

const { db, sql } = createDbClient(url);

try {
	await migrate(db, {
		migrationsFolder: `${import.meta.dir}/../../drizzle/control`,
	});
	console.log("[control] migrations applied");
} finally {
	await sql.end();
}
