import React, { useMemo, useState } from 'react';
import { App as AntApp, Button, Input, InputNumber, List, Modal, Progress, Select, Space, Tag, Typography } from 'antd';
import { PageContainer, ProCard, ProTable, StatisticCard } from '@ant-design/pro-components';
// Charts are large and only used on the overview page: load them on demand.
const Area = React.lazy(() => import('@ant-design/charts').then(m => ({ default: m.Area })));
import { api, post, ok, downloadCsv, TENANT } from './api.js';
import { CustomerDrawer } from './pages-v11.jsx';

const { Text, Paragraph } = Typography;
const money = v => '$' + Number(v || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
const pct = v => (Number(v || 0) * 100).toFixed(1) + '%';
const r2 = v => Math.round(Number(v || 0) * 100) / 100;
export function StatusTag({ v }) {
  const s = String(v ?? '');
  const c = /active|connected|shipped|synced|approved|paid|delivered|vip|configured|ready/i.test(s) ? 'green'
    : /review|proof|production|pending|warning|contacted|shortlist|needs|draft|medium/i.test(s) ? 'gold'
    : /high|failed|cancel|error/i.test(s) ? 'red' : 'blue';
  return <Tag color={c}>{s}</Tag>;
}
const tag = v => <StatusTag v={v} />;

/** Confirm + call a write endpoint; shows the result as a message. */
function useWrite({ live, t }) {
  const { modal, message } = AntApp.useApp();
  return (title, fn, onDone) => {
    if (!live) return message.warning(t('needBackend'));
    modal.confirm({
      title, content: t('confirmWrite'),
      onOk: async () => { const r = await fn(); if (ok(r)) { message.success(r?.message || t('done')); onDone?.(r); } else message.error(r?.message || r?.error || t('failed')); }
    });
  };
}
/** Client-side search for ProTable over an in-memory list (search form + text match). */
const localRequest = rows => async (params = {}) => {
  const { current, pageSize, keyword, ...filters } = params;
  const data = rows.filter(r => Object.entries(filters).every(([k, v]) => k.startsWith('_') || v === undefined || v === '' || String(r[k] ?? '').toLowerCase().includes(String(v).toLowerCase())));
  return { data, success: true, total: data.length };
};

// ---------------- Overview ----------------
export function Overview({ data, t, sourceLabel }) {
  const f = data.finance, ov = data.overview;
  const trend = useMemo(() => [18, 21, 20, 25, 27, 31, 30, 35, 37, 41, 39, 45].map((v, i) => ({ day: i + 1, value: v })), []);
  return <PageContainer title={t('overview')} subTitle={sourceLabel}>
    <ProCard ghost gutter={[16, 16]} wrap>
      <ProCard colSpan={{ xs: 24, md: 6 }}><StatisticCard statistic={{ title: 'Revenue', value: f.revenue, prefix: '$', precision: 2 }} /></ProCard>
      <ProCard colSpan={{ xs: 24, md: 6 }}><StatisticCard statistic={{ title: 'Contribution', value: f.contribution_margin, prefix: '$', precision: 2 }} /></ProCard>
      <ProCard colSpan={{ xs: 24, md: 6 }}><StatisticCard statistic={{ title: 'Orders', value: ov.orders }} /></ProCard>
      <ProCard colSpan={{ xs: 24, md: 6 }}><StatisticCard statistic={{ title: 'Open Agent Tasks', value: ov.open_tasks }} /></ProCard>
    </ProCard>
    <ProCard gutter={[16, 16]} ghost wrap style={{ marginTop: 16 }}>
      <ProCard title="Revenue trend" colSpan={{ xs: 24, md: 16 }}><React.Suspense fallback={<div style={{ height: 260 }} />}><Area data={trend} xField="day" yField="value" height={260} /></React.Suspense></ProCard>
      <ProCard title="Channel health" colSpan={{ xs: 24, md: 8 }}>
        {data.stores.map(s => <div key={s.id} style={{ padding: '8px 0' }}><Space style={{ width: '100%', justifyContent: 'space-between' }}><Text>{s.name}</Text><Text type="secondary">{s.health || 88}%</Text></Space><Progress percent={s.health || 88} showInfo={false} size="small" /></div>)}
      </ProCard>
    </ProCard>
  </PageContainer>;
}

// ---------------- Stores ----------------
export function Stores({ data, live, reload, t, openShopify }) {
  const write = useWrite({ live, t });
  const sync = (s, type = 'products') => write(`${t('sync')} ${s.name} (${type})`, () => post(`/api/shopify/stores/${encodeURIComponent(s.id)}/sync-${type}`, { approved: true }));
  const syncAll = () => write(t('syncAll'), async () => { const rs = await Promise.all(data.stores.map(s => post(`/api/shopify/stores/${encodeURIComponent(s.id)}/sync-products`, { approved: true }))); return { message: `${rs.filter(ok).length}/${rs.length}` }; });
  return <PageContainer title={t('stores')} subTitle="Shopify OAuth, sync and channel health" extra={[<Button key="all" onClick={syncAll}>{t('syncAll')}</Button>]}>
    <ProCard>
      <Space direction="vertical" size={10} style={{ width: '100%' }}>
        <div style={{ width: 40, height: 40, borderRadius: 8, display: 'grid', placeItems: 'center', background: '#008060', color: '#fff', fontWeight: 700 }}>S</div>
        <Text strong style={{ fontSize: 18 }}>{t('connectShopify')}</Text>
        <Text type="secondary">OAuth · Products / Orders / Customers / Fulfillment · tenant isolation</Text>
        <Button type="primary" style={{ background: '#008060' }} onClick={openShopify}>{t('connectShopify')}</Button>
      </Space>
    </ProCard>
    <ProTable style={{ marginTop: 16 }} headerTitle="Connected stores" rowKey="id" search={false} options={{ reload }} pagination={false} dataSource={data.stores}
      columns={[{ title: 'Store', dataIndex: 'name' }, { title: 'Domain', dataIndex: 'domain' }, { title: 'Country', dataIndex: 'country' }, { title: 'Health', render: (_, r) => `${r.health || 88}%` }, { title: 'Status', dataIndex: 'status', render: (_, r) => tag(r.status) },
        { title: '', valueType: 'option', render: (_, r) => [<a key="p" onClick={() => sync(r)}>Sync products</a>, <a key="o" onClick={() => sync(r, 'orders')}>Sync orders</a>] }]} />
  </PageContainer>;
}

// ---------------- Orders ----------------
export function Orders({ data, live, reload, t }) {
  const write = useWrite({ live, t });
  const rows = useMemo(() => {
    const storeName = id => id === 'pod_studio' ? 'POD Studio' : id === 'direct_storefront' ? 'Storefront' : data.stores.find(s => s.id === id)?.name || id;
    return data.orders.map(o => ({
      ...o, store: storeName(o.store_id),
      customer: o.customer_email || data.customers.find(c => c.id === o.customer_id)?.email || o.customer_id || '—',
      profit: r2(o.revenue - (o.cogs || 0) - (o.shipping_cost || 0) - (o.payment_fee || 0) - (o.affiliate_commission || 0) - (o.ad_attributed_cost || 0)),
      tracking: data.shipments.find(s => s.order_id === o.id)?.tracking_number || '—'
    }));
  }, [data]);
  const stores = Object.fromEntries([...new Set(rows.map(r => r.store))].map(s => [s, { text: s }]));
  const statuses = Object.fromEntries([...new Set(['Paid', 'Proofing', 'Production', 'Shipped', ...rows.map(r => r.status)])].map(s => [s, { text: s }]));
  return <PageContainer title={t('orders')} subTitle="Payment → Proof → Production → Shipping → Delivery">
    <ProTable rowKey="id" params={{ _rows: rows.length }} request={localRequest(rows)} search={{ labelWidth: 'auto', defaultCollapsed: false }} rowSelection={{}} pagination={{ pageSize: 10 }} options={{ reload, density: true, setting: true }}
      toolbar={{ title: t('orders'), actions: [
        <Button key="sync" onClick={() => write(t('syncLogistics'), () => post('/api/saas/logistics/sync', { approved: true }), reload)}>{t('syncLogistics')}</Button>,
        <Button key="csv" onClick={() => downloadCsv('orders.csv', rows.map(({ id, customer, store, status, revenue, currency, profit, tracking, created_at }) => ({ id, customer, store, status, revenue, currency, profit, tracking, created_at })))}>{t('exportCsv')}</Button>] }}
      columns={[
        { title: 'Order', dataIndex: 'id', copyable: true },
        { title: 'Customer', dataIndex: 'customer' },
        { title: 'Store', dataIndex: 'store', valueType: 'select', valueEnum: stores },
        { title: 'Status', dataIndex: 'status', valueType: 'select', valueEnum: statuses, render: (_, r) => tag(r.status) },
        { title: 'Revenue', dataIndex: 'revenue', search: false, render: (_, r) => `${r.currency || 'USD'} ${Number(r.revenue || 0).toFixed(2)}` },
        { title: 'Contribution', dataIndex: 'profit', search: false, render: (_, r) => money(r.profit) },
        { title: 'Tracking', dataIndex: 'tracking' }
      ]} />
  </PageContainer>;
}

// ---------------- Catalog ----------------
export function Catalog({ data, live, reload, t, goAgent }) {
  const write = useWrite({ live, t });
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(JSON.stringify([{ sku: 'NEW-INV-01', name: 'Pearl Invitation', supplier_id: 'sup_print', supplier_cost: 4.2, inbound_shipping: 0.5, duty: 0.1, packaging: 0.3, base_price: 13.9, inventory: 500, scene_tags: ['cream'] }], null, 2));
  const { message } = AntApp.useApp();
  const submit = () => { let items; try { items = JSON.parse(text); if (!Array.isArray(items)) throw 0; } catch { return message.error('JSON array required'); } setOpen(false); write(t('importFeed'), () => post('/api/saas/catalog/import', { approved: true, items }), reload); };
  return <PageContainer title={t('catalog')} subTitle="Supplier cost → landed cost → listing" extra={[<Button key="ai" onClick={() => goAgent('检查商品同步和采购成本异常')}>{t('aiCost')}</Button>, <Button key="imp" type="primary" onClick={() => setOpen(true)}>{t('importFeed')}</Button>]}>
    <ProTable rowKey="sku" params={{ _rows: data.catalog.length }} request={localRequest(data.catalog)} search={{ labelWidth: 'auto' }} options={{ reload }} columns={[
      { title: 'SKU', dataIndex: 'sku' }, { title: 'Product', dataIndex: 'name' },
      { title: 'Supplier cost', dataIndex: 'supplier_cost', search: false, render: (_, r) => money(r.supplier_cost) },
      { title: 'Landed cost', dataIndex: 'landed_cost', search: false, render: (_, r) => money(r.landed_cost) },
      { title: 'Price', dataIndex: 'base_price', search: false, render: (_, r) => money(r.base_price) },
      { title: 'Margin', dataIndex: 'gross_margin', search: false, render: (_, r) => pct(r.gross_margin) },
      { title: 'Inventory', dataIndex: 'inventory', search: false },
      { title: 'Channel', dataIndex: 'channel_status', search: false, render: (_, r) => tag(r.channel_status || 'synced') }]} />
    <Modal title={t('importFeed')} open={open} onCancel={() => setOpen(false)} onOk={submit} width={640}>
      <Input.TextArea value={text} onChange={e => setText(e.target.value)} autoSize={{ minRows: 10, maxRows: 20 }} style={{ fontFamily: 'ui-monospace,Menlo,monospace', fontSize: 12 }} />
    </Modal>
  </PageContainer>;
}

// ---------------- Inbox ----------------
export function Inbox({ data, live, t, goAgent }) {
  const conv = data.conversations?.conversations || [], msgs = data.conversations?.messages || [];
  const [sel, setSel] = useState(null);
  const [text, setText] = useState('');
  const { message } = AntApp.useApp();
  const saveDraft = async () => {
    if (!live) return message.warning(t('needBackend'));
    const r = await post(`/api/saas/conversations/${encodeURIComponent(sel.id)}/reply-draft`, { text });
    ok(r) ? message.success('Draft saved — sending requires approval') : message.error(t('failed'));
  };
  return <PageContainer title={t('inbox')} subTitle="Email · Instagram · WhatsApp · TikTok · Web chat" extra={[<Button key="ai" type="primary" onClick={() => goAgent('汇总所有未读客户会话并给出处理建议')}>AI summary</Button>]}>
    <ProCard gutter={16} ghost wrap>
      <ProCard title={`${conv.length} open`} colSpan={{ xs: 24, md: 10 }}>
        <List dataSource={conv} renderItem={c => <List.Item onClick={() => { setSel(c); setText(''); }} style={{ cursor: 'pointer', background: sel?.id === c.id ? '#e6f4ff' : undefined, paddingInline: 8 }}>
          <List.Item.Meta title={c.subject} description={`${c.channel} · ${c.last_message || ''}`} /></List.Item>} />
      </ProCard>
      <ProCard title="Agent Reply Draft" colSpan={{ xs: 24, md: 14 }}>
        {sel ? <Space direction="vertical" style={{ width: '100%' }}>
          {msgs.filter(m => m.conversation_id === sel.id).map(m => <Paragraph key={m.id} style={{ background: m.role === 'customer' ? '#f5f5f5' : '#e6f4ff', padding: 10, borderRadius: 6, margin: 0 }}>{m.text}</Paragraph>)}
          <Input.TextArea value={text} onChange={e => setText(e.target.value)} autoSize={{ minRows: 4 }} />
          <Button type="primary" disabled={!text.trim()} onClick={saveDraft}>{t('draft')}</Button>
        </Space> : <Text type="secondary">←</Text>}
      </ProCard>
    </ProCard>
  </PageContainer>;
}

// ---------------- Marketing ----------------
export function Marketing({ data, live, t }) {
  const camps = data.marketing?.campaigns || [], ideas = data.marketing?.ideas || [], platforms = data.marketing?.platforms || [];
  const spend = camps.reduce((a, c) => a + Number(c.spend || 0), 0), rev = camps.reduce((a, c) => a + Number(c.revenue || 0), 0);
  const [open, setOpen] = useState(false), [ideasOpen, setIdeasOpen] = useState(false);
  const [form, setForm] = useState({ platform: 'google_ads', objective: 'sales', budget: 50 });
  const { message, modal } = AntApp.useApp();
  const create = async () => {
    if (!live) return message.warning(t('needBackend'));
    const r = await post('/api/saas/marketing/drafts', form);
    if (ok(r)) { setOpen(false); modal.success({ title: 'Draft created', content: `${r.id} · ${r.status} · requires approval` }); } else message.error(t('failed'));
  };
  const platformOptions = (platforms.length ? platforms : ['google_ads', 'meta', 'tiktok', 'pinterest', 'reddit', 'linkedin', 'youtube', 'x'].map(id => ({ id, label: id }))).map(p => ({ value: p.id, label: p.label + (p.configured === false ? ' (needs keys)' : '') }));
  return <PageContainer title={t('marketing')} subTitle="Spend, revenue, ROAS, CPA" extra={[<Button key="ai" onClick={() => setIdeasOpen(true)}>{t('aiIdeas')}</Button>, <Button key="new" type="primary" onClick={() => setOpen(true)}>{t('newCampaign')}</Button>]}>
    <ProCard ghost gutter={[16, 16]} wrap>
      <ProCard colSpan={{ xs: 24, md: 6 }}><StatisticCard statistic={{ title: 'Spend', value: spend, prefix: '$' }} /></ProCard>
      <ProCard colSpan={{ xs: 24, md: 6 }}><StatisticCard statistic={{ title: 'Attributed revenue', value: rev, prefix: '$' }} /></ProCard>
      <ProCard colSpan={{ xs: 24, md: 6 }}><StatisticCard statistic={{ title: 'Blended ROAS', value: spend ? (rev / spend).toFixed(2) : '—' }} /></ProCard>
      <ProCard colSpan={{ xs: 24, md: 6 }}><StatisticCard statistic={{ title: 'Approvals', value: ideas.filter(i => i.requires_approval).length }} /></ProCard>
    </ProCard>
    <ProTable style={{ marginTop: 16 }} rowKey="id" params={{ _rows: camps.length }} request={localRequest(camps)} search={{ labelWidth: 'auto' }} columns={[
      { title: 'Platform', dataIndex: 'platform' }, { title: 'Campaign', dataIndex: 'name' },
      { title: 'Spend', dataIndex: 'spend', search: false, render: (_, r) => money(r.spend) }, { title: 'Revenue', dataIndex: 'revenue', search: false, render: (_, r) => money(r.revenue) },
      { title: 'ROAS', dataIndex: 'roas', search: false, render: (_, r) => r2(r.roas).toFixed(2) }, { title: 'CPA', dataIndex: 'cpa', search: false, render: (_, r) => money(r.cpa) },
      { title: 'Status', dataIndex: 'status', search: false, render: (_, r) => tag(r.status) }]} />
    <Modal title={t('newCampaign')} open={open} onCancel={() => setOpen(false)} onOk={create}>
      <Space direction="vertical" style={{ width: '100%' }}>
        <Select style={{ width: '100%' }} value={form.platform} onChange={platform => setForm({ ...form, platform })} options={platformOptions} />
        <Select style={{ width: '100%' }} value={form.objective} onChange={objective => setForm({ ...form, objective })} options={['sales', 'traffic', 'awareness'].map(value => ({ value, label: value }))} />
        <InputNumber style={{ width: '100%' }} min={1} addonBefore="USD / day" value={form.budget} onChange={budget => setForm({ ...form, budget })} />
        <Text type="secondary">{t('draftOnly')}</Text>
      </Space>
    </Modal>
    <Modal title={t('aiIdeas')} open={ideasOpen} onCancel={() => setIdeasOpen(false)} footer={null} width={720}>
      <ProTable rowKey="id" search={false} options={false} pagination={false} dataSource={ideas} columns={[{ title: 'Campaign', dataIndex: 'name' }, { title: 'ROAS', render: (_, r) => r2(r.roas).toFixed(2) }, { title: 'Action', render: (_, r) => tag(r.action) }, { title: 'Reason', dataIndex: 'reason' }]} />
    </Modal>
  </PageContainer>;
}

// ---------------- Customers ----------------
export function Customers({ data, live, t, goAgent }) {
  const [openId, setOpenId] = useState(null);
  const { modal, message } = AntApp.useApp();
  const showSegments = async () => {
    if (!live) return message.warning(t('needBackend'));
    const seg = await api('/api/saas/customer-segments');
    modal.info({ title: t('segments'), content: (seg || []).map(s => <div key={s.segment}>{tag(s.segment)} {s.count}</div>) });
  };
  return <PageContainer title={t('customers')} subTitle="LTV · segment · scene preference · source" extra={[<Button key="ai" onClick={() => goAgent('根据客户画像生成产品推荐')}>AI recommendations</Button>, <Button key="seg" onClick={showSegments}>{t('segments')}</Button>]}>
    <ProTable rowKey="id" params={{ _rows: data.customers.length }} request={localRequest(data.customers)} search={{ labelWidth: 'auto' }} columns={[
      { title: 'Customer', dataIndex: 'email', render: (_, r) => <a onClick={() => setOpenId(r.id)}>{r.name || r.email}<br /><Text type="secondary">{r.email}</Text></a> }, { title: 'Segment', dataIndex: 'segment', render: (_, r) => tag(r.segment) },
      { title: 'LTV', dataIndex: 'lifetime_value', search: false, render: (_, r) => money(r.lifetime_value) }, { title: 'Orders', dataIndex: 'orders', search: false },
      { title: 'Scene', dataIndex: 'favorite_scene' }, { title: 'Source', dataIndex: 'acquisition' },
      { title: 'Engagement', search: false, render: (_, r) => <Progress percent={r.scores?.engagement || 0} size="small" /> },
      { title: 'Intent', search: false, render: (_, r) => <Progress percent={r.scores?.intent || 0} size="small" /> }]} />
    <CustomerDrawer id={openId} onClose={() => setOpenId(null)} live={live} goAgent={goAgent} />
  </PageContainer>;
}

// ---------------- Creators ----------------
export function Creators({ data, t, goAgent }) {
  return <PageContainer title={t('creators')} subTitle="Authorized creator data · affiliate commission" extra={[<Button key="ai" onClick={() => goAgent('筛选适合婚礼品类的达人')}>AI shortlist</Button>, <Button key="out" type="primary" onClick={() => goAgent('联系达人合作并准备外联草稿')}>Outreach</Button>]}>
    <ProTable rowKey="id" headerTitle="Creators" params={{ _rows: (data.influencers?.items || []).length }} request={localRequest(data.influencers?.items || [])} search={{ labelWidth: 'auto' }} columns={[
      { title: 'Platform', dataIndex: 'platform' }, { title: 'Handle', dataIndex: 'handle' },
      { title: 'Followers', dataIndex: 'followers', search: false, render: (_, r) => Number(r.followers || 0).toLocaleString() },
      { title: 'Engagement', dataIndex: 'engagement_rate', search: false, render: (_, r) => pct(r.engagement_rate) },
      { title: 'Status', dataIndex: 'status', search: false, render: (_, r) => tag(r.status) }]} />
    <ProTable style={{ marginTop: 16 }} rowKey="id" headerTitle="Affiliates" search={false} options={false} pagination={false} dataSource={data.affiliates || []} columns={[
      { title: 'Partner', dataIndex: 'name' }, { title: 'Code', dataIndex: 'code' }, { title: 'Rate', render: (_, r) => pct(r.commission_rate) },
      { title: 'Revenue', render: (_, r) => money(r.revenue) }, { title: 'Commission due', render: (_, r) => money(r.commission_due) }, { title: 'Status', render: (_, r) => tag(r.status) }]} />
  </PageContainer>;
}

// ---------------- Finance ----------------
export function Finance({ data, t, goAgent }) {
  const f = data.finance, R = Number(f.revenue) || 1;
  const rows = [['Revenue', f.revenue], ['COGS', f.cogs], ['Shipping', f.shipping], ['Payment fees', f.payment_fees], ['Affiliates', f.affiliates], ['Ads', f.ads], ['Contribution margin', f.contribution_margin]];
  return <PageContainer title={t('finance')} subTitle="Revenue − COGS − Shipping − Payment fee − Affiliate − Ads" extra={[<Button key="s" onClick={() => goAgent('汇总本期财务利润并准备结算')}>Settlement</Button>, <Button key="csv" onClick={() => downloadCsv('profit-and-loss.csv', rows.map(([line, amount]) => ({ line, amount: r2(amount) })))}>Export P&L</Button>]}>
    <ProCard ghost gutter={[16, 16]} wrap>
      <ProCard colSpan={{ xs: 24, md: 6 }}><StatisticCard statistic={{ title: 'Revenue', value: f.revenue, prefix: '$', precision: 2 }} /></ProCard>
      <ProCard colSpan={{ xs: 24, md: 6 }}><StatisticCard statistic={{ title: 'COGS + Shipping', value: Number(f.cogs || 0) + Number(f.shipping || 0), prefix: '$', precision: 2 }} /></ProCard>
      <ProCard colSpan={{ xs: 24, md: 6 }}><StatisticCard statistic={{ title: 'Ads + Affiliate', value: Number(f.ads || 0) + Number(f.affiliates || 0), prefix: '$', precision: 2 }} /></ProCard>
      <ProCard colSpan={{ xs: 24, md: 6 }}><StatisticCard statistic={{ title: 'Contribution', value: f.contribution_margin, prefix: '$', precision: 2, description: pct(f.margin_rate) }} /></ProCard>
    </ProCard>
    <ProCard title="Profit bridge" style={{ marginTop: 16 }}>
      {rows.map(([k, v]) => <div key={k} style={{ padding: '6px 0' }}><Space style={{ width: '100%', justifyContent: 'space-between' }}><Text type="secondary">{k}</Text><Text strong>{money(v)}</Text></Space><Progress percent={Math.max(0, Math.min(100, Number(v || 0) / R * 100))} showInfo={false} size="small" /></div>)}
    </ProCard>
  </PageContainer>;
}

// ---------------- Agent ----------------
export function Agent({ live, reload, t, seed }) {
  const [input, setInput] = useState(seed || '');
  const [runs, setRuns] = useState([]);
  const [busy, setBusy] = useState(false);
  const run = async q => {
    q = (q ?? input).trim(); if (!q) return;
    setInput(''); setBusy(true);
    const d = live ? await post('/api/agent/ops', { message: q }) : null;
    setRuns(rs => [{ q, d, at: new Date().toLocaleTimeString() }, ...rs]); setBusy(false);
    if (d?.data?.task) reload();
  };
  React.useEffect(() => { if (seed) run(seed); }, [seed]); // eslint-disable-line react-hooks/exhaustive-deps
  return <PageContainer title={t('agent')} subTitle="Plan → Retrieve → Tool Call → Approval → Execute → Observe">
    <ProCard>
      <Space wrap style={{ marginBottom: 12 }}>
        {['汇总今天需要我处理的事项', '检查订单和物流异常', '分析低ROAS广告并生成优化建议', '检查商品同步和采购成本异常'].map(q => <Button key={q} size="small" onClick={() => run(q)}>{q}</Button>)}
      </Space>
      <Space.Compact style={{ width: '100%' }}>
        <Input.TextArea value={input} onChange={e => setInput(e.target.value)} placeholder={t('agentHint')} autoSize={{ minRows: 2 }} onPressEnter={e => { if (!e.shiftKey) { e.preventDefault(); run(); } }} />
        <Button type="primary" loading={busy} onClick={() => run()} style={{ height: 'auto' }}>{t('run')}</Button>
      </Space.Compact>
    </ProCard>
    {runs.map((r, i) => <ProCard key={runs.length - i} style={{ marginTop: 16 }} title={r.q} extra={<Space>{r.d ? tag(r.d.intent) : tag('demo')}{r.d?.data?.task && tag(r.d.data.task.status)}<Text type="secondary">{r.at}</Text></Space>}>
      <Paragraph><Text strong>Plan: </Text>{(r.d?.plan || ['retrieve', 'analyze', 'approval gate']).join(' → ')}</Paragraph>
      {r.d?.data?.task && <Paragraph>Task: {r.d.data.task.title}</Paragraph>}
      {r.d && <details><summary style={{ cursor: 'pointer' }}>JSON</summary><pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, maxHeight: 320, overflow: 'auto' }}>{JSON.stringify(r.d.data, null, 2)}</pre></details>}
      {!r.d && <Text type="secondary">{t('needBackend')}</Text>}
    </ProCard>)}
  </PageContainer>;
}

// ---------------- Approvals ----------------
export function Approvals({ data, live, reload, t }) {
  const write = useWrite({ live, t });
  const [rejected, setRejected] = useState(() => new Set());
  const rows = (data.tasks || []).filter(x => x.status === 'needs_approval' && !rejected.has(x.id));
  return <PageContainer title={t('approvals')} subTitle="Ads · budgets · refunds · purchasing · outbound messages">
    <ProTable rowKey="id" search={false} options={{ reload }} dataSource={rows} locale={{ emptyText: t('noApprovals') }} columns={[
      { title: 'Type', dataIndex: 'type' }, { title: 'Request', dataIndex: 'title' }, { title: 'Risk', dataIndex: 'risk', render: (_, r) => tag(r.risk) },
      { title: 'Reason', render: (_, r) => r.payload?.request || 'Agent-staged action' },
      { title: '', valueType: 'option', render: (_, r) => [<a key="r" onClick={() => setRejected(s => new Set(s).add(r.id))}>{t('reject')}</a>, <a key="a" onClick={() => write(`${t('approve')}: ${r.title}`, () => post(`/api/saas/tasks/${encodeURIComponent(r.id)}/approve`, { approved: true }), reload)}>{t('approve')}</a>] }]} />
  </PageContainer>;
}

// ---------------- Connectors ----------------
export function Connectors({ data, reload, t }) {
  const c = data.connectors || {};
  const rows = [
    ...(c.protocols || []).map(x => ({ name: x.name, status: x.status, detail: x.role, group: 'Protocol' })),
    { name: 'Shopify', status: c.shopify?.configured ? 'configured' : 'needs keys', detail: `Admin GraphQL ${c.shopify?.api_version || ''}`, group: 'Commerce' },
    { name: 'PayPal', status: c.paypal?.configured ? 'configured' : 'needs keys', detail: c.paypal?.environment || '', group: 'Payments' },
    ...(c.marketing || []).map(x => ({ name: x.label, status: x.configured ? 'configured' : 'needs keys', detail: (x.capabilities || []).join(' · '), group: 'Marketing' })),
    ...(c.logistics || []).map(x => ({ name: x.label, status: x.configured ? 'configured' : 'needs keys', detail: 'tracking / webhook', group: 'Logistics' })),
    ...(c.messaging || []).map(x => ({ name: x.label, status: x.configured ? 'configured' : 'needs keys', detail: x.send_mode, group: 'Messaging' }))
  ].map((x, i) => ({ ...x, key: i }));
  return <PageContainer title={t('connectors')} subTitle="UCP · ACP · MCP · A2A · Shopify · PayPal · Marketing · Logistics · Messaging" extra={[<Button key="t" onClick={reload}>{t('testAll')}</Button>]}>
    <ProTable rowKey="key" search={false} options={false} pagination={false} dataSource={rows} columns={[{ title: 'Group', dataIndex: 'group' }, { title: 'Connector', dataIndex: 'name' }, { title: 'Status', render: (_, r) => tag(r.status) }, { title: 'Details', dataIndex: 'detail' }]} />
  </PageContainer>;
}

export async function startShopifyOAuth(shop, t, message) {
  const s = shop.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '');
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(s)) return message.warning(t('invalidDomain'));
  // A plain redirect cannot carry the admin header: fetch the OAuth URL first, then leave for Shopify.
  const d = await api(`/api/shopify/oauth/start?shop=${encodeURIComponent(s)}&tenant_id=${TENANT}`);
  if (d?.url) window.location.href = d.url; else message.error(t('oauthFail'));
}
