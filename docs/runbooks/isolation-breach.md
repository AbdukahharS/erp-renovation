# Runbook — Suspected cross-tenant isolation breach

This is the highest-severity incident the product can have. Schema-per-tenant + the negative tests in CI make accidental leakage structurally unlikely, but a bug in a new code path (or a malicious admin) could still produce one.

## Triage (first 15 minutes)

1. **Capture the evidence.** Save the request/response, user id, tenant id(s), and any logs in `npm:better-stack` / Railway. Do not redeploy yet — debugging requires the suspect state intact.
2. **Identify the scope.**
   - Was data *read* from another tenant (information disclosure), *written* into another tenant (corruption), or both?
   - Which schema(s) and which row(s)?
3. **Isolate the suspected blast radius.**
   - If a specific code path is suspected (e.g. a new endpoint shipped today), suspend access via Railway env (`MAINTENANCE_MODE=true` is a placeholder — add a kill-switch if the path is critical).
   - Optionally suspend the affected tenant via `POST /admin/tenants/:id/suspend` until the audit completes.

## Investigation

1. **Revoke active sessions for affected users.** Delete from `public.session WHERE user_id IN (...)`. Force a re-login.
2. **Audit `stage_events`** in the affected tenant for unusual `actor_user_id` values around the incident window — these are cross-tenant writes if the actor is from another tenant.
3. **Audit `financial_transactions`** — wage credits / fines applied to the wrong master are the most damaging case.
4. **Cross-check `property_assets.r2_key`** prefixes vs the owning schema. Any row whose key doesn't start with its tenant's schema name is a cross-tenant write.
5. **Diff R2** — list objects under each tenant prefix and confirm every key matches the owning tenant.

## Containment

- If the breach is a code path: patch + redeploy + re-run the isolation negative tests; add the specific repro as a permanent test.
- If the breach is a credentials leak (e.g. a stolen super-admin session): rotate `BETTER_AUTH_SECRET`, revoke all sessions, force password reset for the compromised account, demote the super-admin if appropriate.

## Customer communications

1. **Acknowledge within 24 hours** to all affected tenants. State what was disclosed/written and to whom. Do not speculate.
2. **Provide a remediation timeline** (typically same-day for code patches, longer for credential rotations).
3. **Follow up within 7 days** with a postmortem (cause, fix, tests added, prevention).

## Post-incident

- Add a CI test that would have caught this — every confirmed breach must leave behind a permanent regression test.
- File the incident in `docs/incidents/YYYY-MM-DD-<slug>.md` with the timeline, root cause, and the new test.
- Schedule a Phase-9 re-audit (re-run all isolation negative tests against staging) within 30 days.

## Useful one-liners

Rows in tenant X whose r2_key doesn't match tenant X's schema:
```sql
SELECT id, r2_key FROM tenant_X.property_assets WHERE r2_key NOT LIKE 'tenant_X/%';
```

All financial transactions touching a master who isn't a member of the tenant:
```sql
SELECT t.* FROM tenant_X.financial_transactions t
LEFT JOIN public.tenant_memberships m ON m.user_id = t.master_user_id AND m.tenant_id = '<tenant-X-id>'
WHERE m.user_id IS NULL AND t.master_user_id IS NOT NULL;
```
