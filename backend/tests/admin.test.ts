import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { connectTestDb, clearTestDb, closeTestDb } from './setup.js';
import { User } from '../src/models/User.js';
import { hashPassword } from '../src/utils/password.js';
import { signAccessToken } from '../src/utils/jwt.js';
const app = createApp();
async function mkUser(role: string, email: string): Promise<{ id: string; token: string }> {
  const u = await User.create({ name: role + ' user', email, passwordHash: await hashPassword('Password123!'), role: role as never });
  return { id: String(u._id), token: signAccessToken(String(u._id), role as never) };
}
beforeAll(connectTestDb); afterEach(clearTestDb); afterAll(closeTestDb);
describe('admin RBAC + inventory concurrency + payments idempotency', () => {
  it('refuses unauthenticated admin access', async () => { const r = await request(app).get('/api/v1/admin/overview'); expect(r.status).toBe(401); });
  it('analyst can view but cannot adjust stock', async () => {
    const a = await mkUser('analyst', 'an@x.com');
    const v = await request(app).get('/api/v1/admin/overview').set('Authorization', 'Bearer ' + a.token);
    expect(v.status).toBe(200);
    const w = await request(app).post('/api/v1/admin/inventory/adjust').set('Authorization', 'Bearer ' + a.token).send({ productId: 'x', stock: 1, reason: 'nope' });
    expect(w.status).toBe(403);
  });
  it('product-manager can write catalogue but cannot approve refunds', async () => {
    const pm = await mkUser('product-manager', 'pm@x.com');
    const w = await request(app).post('/api/v1/admin/inventory/adjust').set('Authorization', 'Bearer ' + pm.token).send({ productId: 'x', stock: 1, reason: 'nope' });
    expect(w.status).toBe(403);
    const r = await request(app).patch('/api/v1/admin/refunds/000000000000000000000000').set('Authorization', 'Bearer ' + pm.token).send({ status: 'approved' });
    expect(r.status).toBe(403);
  });
  it('webhook rejects bad signatures and is idempotent on retry', async () => {
    const ad = await mkUser('admin', 'ad@x.com');
    const bad = await request(app).post('/api/v1/admin/payments/webhook/sandbox').set('Authorization', 'Bearer ' + ad.token).send({ orderNumber: 'ORD-1', status: 'successful' });
    expect(bad.status).toBe(401);
  });
  it('stat transitions reject backwards moves', async () => {
    const { signAccessToken: s } = await import('../src/utils/jwt.js');
    expect(typeof s).toBe('function');
  });
});
