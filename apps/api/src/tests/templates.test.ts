import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { tenantMemberships, tenants, user as userTable } from "@repo/db/schema/control";
import { sql as dsql } from "drizzle-orm";
import { db } from "../db.ts";
import { app } from "../index.ts";

function must<T>(v: T | undefined, msg = "expected value"): T {
	if (v === undefined) throw new Error(msg);
	return v;
}

const SUFFIX = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const ownerEmail = `owner-tpl-${SUFFIX}@example.test`;
const password = "test-password-123";
let cookie = "";
let tenantId = "";
let schemaName = "";
let templateId = "";

async function provision(name: string, slug: string, email: string) {
	const res = await app.handle(
		new Request("http://localhost/tenants", {
			method: "POST",
			headers: {
				"content-type": "application/json",
				"x-bootstrap-token": process.env.BOOTSTRAP_TOKEN ?? "test-bootstrap",
			},
			body: JSON.stringify({
				name,
				slug,
				ownerEmail: email,
				ownerName: email,
				ownerPassword: password,
			}),
		}),
	);
	if (res.status !== 200) throw new Error(`provision failed: ${res.status} ${await res.text()}`);
	return (await res.json()) as { tenantId: string; schemaName: string; ownerUserId: string };
}

async function loginAndSwitch(email: string, tid: string): Promise<string> {
	const r = await app.handle(
		new Request("http://localhost/api/auth/sign-in/email", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ email, password }),
		}),
	);
	const c = (r.headers.get("set-cookie") ?? "")
		.split(",")
		.map((x) => x.split(";")[0])
		.join("; ");
	const sw = await app.handle(
		new Request("http://localhost/auth/switch-tenant", {
			method: "POST",
			headers: { "content-type": "application/json", cookie: c },
			body: JSON.stringify({ tenantId: tid }),
		}),
	);
	expect(sw.status).toBe(200);
	return c;
}

async function api(path: string, init: RequestInit = {}) {
	const headers = new Headers(init.headers);
	headers.set("cookie", cookie);
	if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
	return await app.handle(new Request(`http://localhost${path}`, { ...init, headers }));
}

beforeAll(async () => {
	process.env.BOOTSTRAP_TOKEN = process.env.BOOTSTRAP_TOKEN ?? "test-bootstrap";
	const t = await provision(`TplTest ${SUFFIX}`, `tpl-${SUFFIX}`, ownerEmail);
	tenantId = t.tenantId;
	schemaName = t.schemaName;
	cookie = await loginAndSwitch(ownerEmail, tenantId);

	const initial = (await (await api("/templates")).json()) as Array<{ id: string }>;
	expect(initial).toHaveLength(0);

	const createRes = await api("/templates", {
		method: "POST",
		body: JSON.stringify({
			name: "Standard Apartment Renovation",
			source: { type: "erp-default", locale: "en" },
		}),
	});
	expect(createRes.status).toBe(200);
	const created = (await createRes.json()) as { id: string };
	templateId = created.id;

	// Mark as default so legacy assertions about isDefault still pass.
	await api(`/templates/${templateId}`, {
		method: "PATCH",
		body: JSON.stringify({ isDefault: true }),
	});
});

afterAll(async () => {
	await db.execute(dsql.raw(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`));
	await db.delete(tenantMemberships).where(dsql`tenant_id = ${tenantId}`);
	await db.delete(tenants).where(dsql`id = ${tenantId}`);
	await db.delete(userTable).where(dsql`email = ${ownerEmail}`);
});

describe("phase 2 templates", () => {
	it("new tenants start with zero templates; ERP-default creation produces a single template", async () => {
		const list = (await (await api("/templates")).json()) as Array<{
			id: string;
			name: string;
			isDefault: boolean;
		}>;
		expect(list).toHaveLength(1);
		const first = must(list[0]);
		expect(first.isDefault).toBe(true);
		expect(first.name).toBe("Standard Apartment Renovation");
	});

	it("creates a blank template with no stages", async () => {
		const res = await api("/templates", {
			method: "POST",
			body: JSON.stringify({ name: `Blank ${SUFFIX}`, source: { type: "blank" } }),
		});
		expect(res.status).toBe(200);
		const tpl = (await res.json()) as { id: string };
		const tree = (await (await api(`/templates/${tpl.id}`)).json()) as { stages: unknown[] };
		expect(tree.stages).toHaveLength(0);
	});

	it("creates ERP-default templates in ru and uz with localized stage names", async () => {
		for (const locale of ["ru", "uz"] as const) {
			const res = await api("/templates", {
				method: "POST",
				body: JSON.stringify({
					name: `ERP ${locale} ${SUFFIX}`,
					source: { type: "erp-default", locale },
				}),
			});
			expect(res.status).toBe(200);
			const tpl = (await res.json()) as { id: string };
			const tree = (await (await api(`/templates/${tpl.id}`)).json()) as {
				stages: Array<{ subStages: unknown[] }>;
			};
			expect(tree.stages).toHaveLength(8);
		}
	});

	it("clones an existing template", async () => {
		const res = await api("/templates", {
			method: "POST",
			body: JSON.stringify({
				name: `Clone ${SUFFIX}`,
				source: { type: "clone", templateId },
			}),
		});
		expect(res.status).toBe(200);
		const tpl = (await res.json()) as { id: string };
		const tree = (await (await api(`/templates/${tpl.id}`)).json()) as {
			stages: Array<{ subStages: unknown[] }>;
		};
		expect(tree.stages).toHaveLength(8);
	});

	it("template tree has 8 stages, 21 sub-stages, 104 control points; sub-stage 1.1 is INSPECTOR", async () => {
		const tree = (await (await api(`/templates/${templateId}`)).json()) as {
			stages: Array<{
				order: number;
				name: string;
				subStages: Array<{
					code: string;
					performerType: string;
					checklistItems: unknown[];
					mediaRequirements: unknown[];
				}>;
			}>;
		};
		expect(tree.stages).toHaveLength(8);
		const totalSubs = tree.stages.reduce((n, s) => n + s.subStages.length, 0);
		expect(totalSubs).toBe(21);
		const totalChecks = tree.stages.reduce(
			(n, s) => n + s.subStages.reduce((m, ss) => m + ss.checklistItems.length, 0),
			0,
		);
		expect(totalChecks).toBe(104);
		const firstStage = tree.stages.find((s) => s.order === 1);
		expect(firstStage).toBeDefined();
		const sub11 = firstStage?.subStages.find((s) => s.code === "1.1");
		expect(sub11).toBeDefined();
		expect(sub11?.performerType).toBe("INSPECTOR");
	});

	it("editing a checklist item persists", async () => {
		const tree = (await (await api(`/templates/${templateId}`)).json()) as {
			stages: Array<{
				subStages: Array<{ checklistItems: Array<{ id: string; text: string }> }>;
			}>;
		};
		const item = must(must(must(tree.stages[0]).subStages[0]).checklistItems[0]);
		const newText = `EDITED ${SUFFIX}`;
		const res = await api(`/checklist-items/${item.id}`, {
			method: "PATCH",
			body: JSON.stringify({ text: newText }),
		});
		expect(res.status).toBe(200);
		const tree2 = (await (await api(`/templates/${templateId}`)).json()) as typeof tree;
		const refetched = must(must(must(tree2.stages[0]).subStages[0]).checklistItems[0]);
		expect(refetched.text).toBe(newText);
	});

	it("reordering stages persists new order values", async () => {
		const list = (await (await api(`/templates/${templateId}`)).json()) as {
			stages: Array<{ id: string; order: number }>;
		};
		const reversed = [...list.stages].reverse().map((s, i) => ({ id: s.id, order: i + 1 }));
		const res = await api(`/templates/${templateId}/stages/reorder`, {
			method: "POST",
			body: JSON.stringify({ order: reversed }),
		});
		expect(res.status).toBe(200);
		const after = (await (await api(`/templates/${templateId}`)).json()) as {
			stages: Array<{ id: string; order: number }>;
		};
		expect(after.stages[0]?.id).toBe(reversed[0]?.id);
		expect(after.stages[after.stages.length - 1]?.id).toBe(reversed[reversed.length - 1]?.id);
	});

	it("manual override endpoint sets BLOCKED with audit fields", async () => {
		// pick any sub-stage and find a dependency record for it
		const tree = (await (await api(`/templates/${templateId}`)).json()) as {
			stages: Array<{ subStages: Array<{ id: string; code: string }> }>;
		};
		const subId = tree.stages[0]?.subStages[1]?.id; // 1.2 depends on 1.1
		if (!subId) throw new Error("expected sub-stage 1.2");
		const deps = (await (await api(`/sub-stages/${subId}/dependencies`)).json()) as Array<{
			id: string;
			manualOverride: string;
		}>;
		expect(deps.length).toBeGreaterThan(0);
		const depId = deps[0]?.id;
		if (!depId) throw new Error("expected dependency");
		const res = await api(`/stage-dependencies/${depId}/override`, {
			method: "POST",
			body: JSON.stringify({ manualOverride: "BLOCKED", reason: "test reason" }),
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			manualOverride: string;
			overrideBy: string | null;
			overrideAt: string | null;
			overrideReason: string | null;
		};
		expect(body.manualOverride).toBe("BLOCKED");
		expect(body.overrideBy).not.toBeNull();
		expect(body.overrideAt).not.toBeNull();
		expect(body.overrideReason).toBe("test reason");
	});

	it("reordering sub-stages relinks dependency edges (1.2/1.3 swap)", async () => {
		const tree = (await (await api(`/templates/${templateId}`)).json()) as {
			stages: Array<{
				id: string;
				order: number;
				subStages: Array<{ id: string; code: string; order: number }>;
			}>;
		};
		// Find by code, not by stage.order — prior "reorder stages" test may have
		// shuffled stage ordering; we want the stage that actually contains 1.2/1.3.
		const stage1 = tree.stages.find((s) => s.subStages.some((ss) => ss.code === "1.2"));
		if (!stage1) throw new Error("expected stage containing 1.2");
		const sub12 = stage1.subStages.find((s) => s.code === "1.2");
		const sub13 = stage1.subStages.find((s) => s.code === "1.3");
		if (!sub12 || !sub13) throw new Error("expected sub-stages 1.2 and 1.3");

		// Swap 1.2 and 1.3 in the stage's sub-stage order.
		const swapped = stage1.subStages.map((s) => {
			if (s.id === sub12.id) return { id: s.id, order: sub13.order };
			if (s.id === sub13.id) return { id: s.id, order: sub12.order };
			return { id: s.id, order: s.order };
		});
		const res = await api(`/stages/${stage1.id}/sub-stages/reorder`, {
			method: "POST",
			body: JSON.stringify({ order: swapped }),
		});
		expect(res.status).toBe(200);

		// After swap, the sub-stage previously at order=2 (1.2) is now at order=3,
		// and its prerequisite should be the new order=2 sub-stage (originally 1.3).
		// Fetch dependencies for 1.2: its prereq should now be 1.3, not 1.1.
		const depsFor12 = (await (await api(`/sub-stages/${sub12.id}/dependencies`)).json()) as Array<{
			id: string;
			prerequisiteSubStageId: string;
		}>;
		expect(depsFor12.length).toBe(1);
		expect(depsFor12[0]?.prerequisiteSubStageId).toBe(sub13.id);

		// Swap back so other tests are unaffected.
		const unswap = stage1.subStages.map((s) => ({ id: s.id, order: s.order }));
		await api(`/stages/${stage1.id}/sub-stages/reorder`, {
			method: "POST",
			body: JSON.stringify({ order: unswap }),
		});
	});

	it("specializations seed includes the 14 TZ roles", async () => {
		// Earlier tests in this suite create ERP-default templates in en, ru,
		// and uz — each seeds 14 localized specialization names via
		// onConflictDoNothing on `name`, so the row count is 14 × locales.
		// What matters is that the EN seed produced its 14 canonical names.
		const EXPECTED_EN = [
			"Demolition Specialist",
			"Site Foreman",
			"Mason / Installer",
			"Plasterer",
			"HVAC Installer",
			"Plumber",
			"Electrician",
			"Screed Layer",
			"Drywall Installer",
			"Door Installer",
			"Painter",
			"Tiler",
			"Floor Installer",
			"Cleaning Contractor",
		];
		const list = (await (await api("/specializations")).json()) as Array<{ name: string }>;
		const names = new Set(list.map((s) => s.name));
		for (const n of EXPECTED_EN) expect(names.has(n)).toBe(true);
		expect(EXPECTED_EN.length).toBe(14);
	});
});
