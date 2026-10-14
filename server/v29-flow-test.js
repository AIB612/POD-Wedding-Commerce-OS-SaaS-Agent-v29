// V29 service-level smoke test. Uses only Node built-ins and the local service layer.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'pod-v29-'));
process.env.NODE_ENV = 'development';
process.env.STORE_PERSIST_PATH = path.join(tmp, 'state.json');
process.env.APP_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
process.env.PUBLIC_BASE_URL = 'http://localhost:3000';

const { register, dashboard } = await import('./services/account-service.js');
const Studio = await import('./services/studio-service.js');
const Proof = await import('./services/proof-service.js');
const { findRecord, listForTenant, flushStore } = await import('./saas-store.js');

const tenantId = 'tenant_demo';
const email = `v29-${Date.now()}@example.com`;
const a = await register({ tenantId, email, password: 'ExamplePass123!', name: 'V29 Flow Test' });
const cat = Studio.studioCatalog(), scenario = cat.scenarios[0], kit = scenario.kits[0], productId = kit.items[0];
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const project = await Studio.saveProject({ tenantId, userId: a.user.id, generatedDir: path.join(tmp, 'generated'), body: {
  buyer_type: 'individual', scenario_id: scenario.id, kit_id: kit.id, market: 'CH', items: [{ product_id: productId, qty: 1 }],
  fulfillment: { mode: 'bulk', address_country: 'CH', deadline: '2026-12-31' }, packaging_mode: 'none', packaging: [],
  design_meta: { name: 'test.png', width: 1600, height: 1600, source: 'upload' }, design_data_url: png
} });
const submitted = await Studio.requestQuote({ id: project.id, contact: { email, name: 'V29 Flow Test' }, user: a.user, tenantId });
const proof = await findRecord('proofs', submitted.proof_id);
await Proof.updateProof(tenantId, proof.id, { proof_url: 'https://example.com/proof.png', status: 'Sent' });
await Proof.requestPublicProofChanges(proof.token, 'Please move the design slightly up');
await Proof.updateProof(tenantId, proof.id, { proof_url: 'https://example.com/proof-v2.png', status: 'Sent' });
await Proof.approvePublicProof(proof.token);
const dash = await dashboard(tenantId, a.user.id), order = await findRecord('orders', submitted.order_id);
const notifications = (await listForTenant('notifications', tenantId)).filter(n => n.related_id === submitted.order_id);
const events = (await listForTenant('order_events', tenantId)).filter(e => e.order_id === submitted.order_id);
if (order?.status !== 'Approved' || dash.orders.length !== 1 || dash.projects.length !== 1 || notifications.length < 5 || events.length < 6) throw new Error('v29 flow test failed');
await flushStore();
console.log(`V29 FLOW PASS · ${submitted.order_id} · ${notifications.length} notifications · ${events.length} events`);
await fs.rm(tmp, { recursive: true, force: true });
