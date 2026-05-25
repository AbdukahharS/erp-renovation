import {
	boolean,
	index,
	pgEnum,
	pgTable,
	primaryKey,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";

// ---------- Domain enums ----------

export const roleEnum = pgEnum("role", ["OWNER", "INSPECTOR", "MASTER", "PROCUREMENT"]);
export const tenantStatusEnum = pgEnum("tenant_status", ["ACTIVE", "SUSPENDED"]);

// ---------- Better Auth core tables ----------
// Names and fields follow Better Auth's default `getAuthTables` schema.
// JS keys are camelCase to match Better Auth's `fieldName`s; DB columns are snake_case.

export const user = pgTable("user", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	email: text("email").notNull().unique(),
	emailVerified: boolean("email_verified").notNull().default(false),
	image: text("image"),
	createdAt: timestamp("created_at").notNull().defaultNow(),
	updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const session = pgTable("session", {
	id: text("id").primaryKey(),
	expiresAt: timestamp("expires_at").notNull(),
	token: text("token").notNull().unique(),
	createdAt: timestamp("created_at").notNull().defaultNow(),
	updatedAt: timestamp("updated_at").notNull().defaultNow(),
	ipAddress: text("ip_address"),
	userAgent: text("user_agent"),
	userId: text("user_id")
		.notNull()
		.references(() => user.id, { onDelete: "cascade" }),
	// Custom session data: which tenant + role this session is acting under.
	activeTenantId: uuid("active_tenant_id"),
	activeRole: roleEnum("active_role"),
});

export const account = pgTable("account", {
	id: text("id").primaryKey(),
	accountId: text("account_id").notNull(),
	providerId: text("provider_id").notNull(),
	userId: text("user_id")
		.notNull()
		.references(() => user.id, { onDelete: "cascade" }),
	accessToken: text("access_token"),
	refreshToken: text("refresh_token"),
	idToken: text("id_token"),
	accessTokenExpiresAt: timestamp("access_token_expires_at"),
	refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
	scope: text("scope"),
	password: text("password"),
	createdAt: timestamp("created_at").notNull().defaultNow(),
	updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const verification = pgTable("verification", {
	id: text("id").primaryKey(),
	identifier: text("identifier").notNull(),
	value: text("value").notNull(),
	expiresAt: timestamp("expires_at").notNull(),
	createdAt: timestamp("created_at").notNull().defaultNow(),
	updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ---------- Tenancy ----------

export const tenants = pgTable("tenants", {
	id: uuid("id").primaryKey().defaultRandom(),
	name: text("name").notNull(),
	slug: text("slug").notNull().unique(),
	schemaName: text("schema_name").notNull().unique(),
	status: tenantStatusEnum("status").notNull().default("ACTIVE"),
	createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const tenantMemberships = pgTable(
	"tenant_memberships",
	{
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		tenantId: uuid("tenant_id")
			.notNull()
			.references(() => tenants.id, { onDelete: "cascade" }),
		role: roleEnum("role").notNull(),
		// Phase 7: grants the holder the right to perform the property closing
		// audit (TZ "Chief Technical Supervisor" maps to an Inspector with this
		// permission, per assumption A7). Owners always implicitly hold it.
		closingPermission: boolean("closing_permission").notNull().default(false),
		createdAt: timestamp("created_at").notNull().defaultNow(),
	},
	(t) => [primaryKey({ columns: [t.userId, t.tenantId] })],
);

// ---------- Phase 6: invitations ----------

export const invitations = pgTable(
	"invitations",
	{
		token: text("token").primaryKey(),
		tenantId: uuid("tenant_id")
			.notNull()
			.references(() => tenants.id, { onDelete: "cascade" }),
		role: roleEnum("role").notNull(),
		email: text("email"),
		createdBy: text("created_by")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		createdAt: timestamp("created_at").notNull().defaultNow(),
		expiresAt: timestamp("expires_at").notNull(),
		consumedAt: timestamp("consumed_at"),
		consumedByUserId: text("consumed_by_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
	},
	(t) => [index("invitations_tenant_idx").on(t.tenantId)],
);

// Tracks applied tenant migrations per schema — resumable fan-out.
export const tenantMigrations = pgTable(
	"tenant_migrations",
	{
		schemaName: text("schema_name").notNull(),
		migrationTag: text("migration_tag").notNull(),
		appliedAt: timestamp("applied_at").notNull().defaultNow(),
	},
	(t) => [primaryKey({ columns: [t.schemaName, t.migrationTag] })],
);

export type Role = (typeof roleEnum.enumValues)[number];
export type TenantStatus = (typeof tenantStatusEnum.enumValues)[number];
