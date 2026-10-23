// Returns a human-readable block reason, or null if the user may publish.
export function canPublish(u, plan, paused) {
  if (paused) return 'Publishing is paused by the administrator';
  if (!u.active) return 'Account is disabled';
  if (!u.publish_enabled) return 'Publishing is disabled for this user';
  if (plan?.active === false) return 'Your plan is inactive';
  if (!plan?.publish_ok) return 'Your plan does not allow publishing';
  if (u.pay_status !== 'PAID') return 'Payment has not been confirmed';
  if (u.pay_expires && new Date(u.pay_expires) < new Date()) return 'Access has expired';
  return null;
}

export function resolveEffectiveUserConfig(user, plan, overrides = {}) {
  if (!plan) return { publish_ok: false, max_accounts: 0, monthly_posts: 0, max_mb: 0, storage_limit: 0, monthly_upload_quota: 0, horizon_days: 0, retention_days: 1, active: false, public_visible: false };
  const base = {
    ...plan,
    max_accounts: Number(plan.max_accounts || 0),
    monthly_posts: Number(plan.monthly_posts || 0),
    max_mb: Number(plan.max_mb || 0),
    storage_limit: Number(plan.storage_limit || 0),
    monthly_upload_quota: Number(plan.monthly_upload_quota || 0),
    horizon_days: Number(plan.horizon_days || 0),
    retention_days: Number(plan.retention_days || 1),
    publish_ok: Boolean(plan.publish_ok),
    active: Boolean(plan.active !== false),
    public_visible: Boolean(plan.public_visible !== false),
  };
  const custom = {
    max_accounts: overrides.max_accounts ?? null,
    monthly_posts: overrides.monthly_posts ?? null,
    max_mb: overrides.max_mb ?? null,
    horizon_days: overrides.horizon_days ?? null,
    publish_ok: overrides.publish ?? null,
    storage_limit: overrides.storage_limit ?? null,
    monthly_upload_quota: overrides.monthly_upload_quota ?? null,
    retention_days: overrides.retention_days ?? null,
  };
  const effective = {
    ...base,
    max_accounts: custom.max_accounts ?? base.max_accounts,
    monthly_posts: custom.monthly_posts ?? base.monthly_posts,
    max_mb: custom.max_mb ?? base.max_mb,
    horizon_days: custom.horizon_days ?? base.horizon_days,
    publish_ok: custom.publish_ok ?? base.publish_ok,
    storage_limit: custom.storage_limit ?? base.storage_limit,
    monthly_upload_quota: custom.monthly_upload_quota ?? base.monthly_upload_quota,
    retention_days: custom.retention_days ?? base.retention_days,
    pay_status: user?.pay_status || 'UNPAID',
    active_user: !!user?.active,
    publish_enabled: !!user?.publish_enabled,
  };
  return effective;
}

export function getEffectivePlan(user, plan, overrides = {}) {
  return resolveEffectiveUserConfig(user, plan, overrides);
}
