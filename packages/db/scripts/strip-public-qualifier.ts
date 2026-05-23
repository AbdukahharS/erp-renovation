/**
 * Post-process the generated tenant SQL migrations.
 *
 * drizzle-kit always emits `"public".<name>` qualifiers, but tenant migrations
 * run under SET LOCAL search_path = "<tenant_schema>" — the public. prefix
 * would either fail or write to the wrong schema. Strip those qualifiers so
 * everything resolves into the tenant schema via search_path.
 *
 * Idempotent: re-running is a no-op for already-clean files.
 */

import { Glob } from "bun";

const folder = `${import.meta.dir}/../drizzle/tenant`;
let changed = 0;

for (const file of new Glob("*.sql").scanSync({ cwd: folder })) {
	const path = `${folder}/${file}`;
	const original = await Bun.file(path).text();
	const stripped = original.replaceAll('"public".', "");
	if (stripped !== original) {
		await Bun.write(path, stripped);
		changed++;
		console.log(`stripped public. from ${file}`);
	}
}
console.log(`[strip-public-qualifier] processed tenant migrations (${changed} modified)`);
