import test from 'node:test'; import assert from 'node:assert';
import { canPublish, getEffectivePlan } from '../server/policy.js';
const ok = { active: true, publish_enabled: true, pay_status: 'PAID', pay_expires: null }, plan = { publish_ok: true, max_accounts: 10, monthly_posts: 100, max_mb: 250, storage_limit: 5000, monthly_upload_quota: 5000, horizon_days: 30, retention_days: 14, active: true, public_visible: true };
test('paid active user may publish', () => assert.equal(canPublish(ok, plan, false), null));
test('unpaid blocked', () => assert.match(canPublish({ ...ok, pay_status: 'UNPAID' }, plan, false), /Payment/));
test('expired blocked', () => assert.match(canPublish({ ...ok, pay_expires: '2020-01-01' }, plan, false), /expired/));
test('global pause blocks', () => assert.match(canPublish(ok, plan, true), /paused/));
test('plan without publishing blocks', () => assert.match(canPublish(ok, { publish_ok: false }, false), /plan/));
test('inactive plan blocks publishing', () => assert.match(canPublish(ok, { ...plan, active: false }, false), /inactive/));
test('disabled user blocked', () => assert.ok(canPublish({ ...ok, active: false }, plan, false)));
test('effective plan normalizes values', () => {
  const effective = getEffectivePlan({ active: true, publish_enabled: true, pay_status: 'PAID' }, plan);
  assert.equal(effective.max_accounts, 10);
  assert.equal(effective.horizon_days, 30);
  assert.equal(effective.publish_ok, true);
  assert.equal(effective.pay_status, 'PAID');
});
test('effective plan respects per-user overrides', () => {
  const effective = getEffectivePlan({ active: true, publish_enabled: true, pay_status: 'PAID' }, plan, { monthly_posts: 42, publish: false, retention_days: 7, storage_limit: 2500 });
  assert.equal(effective.monthly_posts, 42);
  assert.equal(effective.publish_ok, false);
  assert.equal(effective.retention_days, 7);
  assert.equal(effective.storage_limit, 2500);
});
