#!/usr/bin/env bun
import { parseArgs } from "node:util";

const { values } = parseArgs({
	options: {
		name: { type: "string" },
		slug: { type: "string" },
		"owner-email": { type: "string" },
		"owner-name": { type: "string" },
		"owner-password": { type: "string" },
		"api-url": { type: "string" },
	},
});

const required = ["name", "slug", "owner-email", "owner-name", "owner-password"] as const;
for (const key of required) {
	if (!values[key]) {
		console.error(`Missing required --${key}`);
		process.exit(1);
	}
}

const apiUrl = values["api-url"] ?? process.env.API_URL ?? "http://localhost:3001";
const token = process.env.BOOTSTRAP_TOKEN;
if (!token) {
	console.error("BOOTSTRAP_TOKEN env var is required");
	process.exit(1);
}

const res = await fetch(`${apiUrl}/tenants`, {
	method: "POST",
	headers: { "content-type": "application/json", "x-bootstrap-token": token },
	body: JSON.stringify({
		name: values.name,
		slug: values.slug,
		ownerEmail: values["owner-email"],
		ownerName: values["owner-name"],
		ownerPassword: values["owner-password"],
	}),
});

const body = await res.json();
if (!res.ok) {
	console.error("provision failed:", res.status, body);
	process.exit(1);
}
console.log(JSON.stringify(body, null, 2));
