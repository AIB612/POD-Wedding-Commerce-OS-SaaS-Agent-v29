// v11 pages: Logistics center, Data import/export, Connector center, Customer 360 drawer.
import React, { useEffect, useState } from 'react';
import { App as AntApp, Button, Descriptions, Drawer, Form, Input, InputNumber, List, Progress, Select, Space, Switch, Tag, Timeline, Typography, Upload } from 'antd';
import { PageContainer, ProCard, ProTable, StatisticCard } from '@ant-design/pro-components';
import { api, post, ok, downloadAuthed, uploadFile } from './api.js';
import { StatusTag } from './pages.jsx';

const { Text, Paragraph } = Typography;
const tag = v => <StatusTag v={v} />;
const money = v => '$' + Number(v || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
const fmt = v => String(v || '—').replace('T', ' ').slice(0, 16);

function useConfirmWrite(live, t) {
  const { modal, message } = AntApp.useApp();
  return (title, fn, onDone) => {
    if (!live) return message.warning(t('needBackend'));
    modal.confirm({ title, content: t('confirmWrite'), onOk: async () => { const r = await fn(); if (ok(r)) { message.success(t('done')); onDone?.(r); } else message.error(r?.error || t('failed')); } });
  };
}

// ---------------- Logistics ----------------
export function Logistics({ live, t }) {
  const [d, setD] = useState(null);
  const [track, setTrack] = useState(null);
  const [zone, setZone] = useState(null);
  const [quote, setQuote] = useState(null);
  const [form] = Form.useForm();
  const write = useConfirmWrite(live, t);
  const load = async () => setD(live ? await api('/api/saas/logistics/overview') : null);
  useEffect(() => { load(); }, [live]); // eslint-disable-line react-hooks/exhaustive-deps
  const x = d || { shipments: [], zones: [], providers: [], store_sync: [], stores: [] };
  const storeName = id => (x.stores || []).find(s => s.id === id)?.name || id;
  const openTrack = async n => setTrack(await api(`/api/saas/logistics/tracking/${encodeURIComponent(n)}`) || { shipment: x.shipments.find(s => s.tracking_number === n), timeline: [] });
  const runQuote = async v => setQuote(await api('/api/saas/logistics/quote', { method: 'POST', body: JSON.stringify({ ...v, weight_kg: 1.2, item_count: 4, currency: 'CNY' }) }));
  const saveZone = v => write(`${zone.name}`, () => post(`/api/saas/logistics/zones/${encodeURIComponent(zone.id)}`, { ...v, approved: true }), () => { setZone(null); load(); });
  return <PageContainer title={t('logistics')} subTitle="Carrier API · Tracking · Shipping · Tax · Regions · Store sync"
    extra={[<Button key="t" onClick={() => write('Sync tracking', () => post('/api/saas/logistics/sync', { approved: true }), load)}>Sync tracking</Button>,
      <Button key="s" type="primary" onClick={() => write('Sync shipping rules to all stores', () => post('/api/saas/logistics/sync-stores', { approved: true }), load)}>Sync to all stores</Button>]}>
    <ProCard ghost gutter={[16, 16]} wrap>
      {[['Active shipments', x.active_shipments], ['Carrier APIs', x.connected_providers], ['Shipping regions', x.configured_regions ?? x.zones.length], ['Connected stores', x.connected_stores]].map(([title, value]) =>
        <ProCard key={title} colSpan={{ xs: 24, md: 6 }}><StatisticCard statistic={{ title, value: value ?? 0 }} /></ProCard>)}
    </ProCard>
    <ProCard gutter={[16, 16]} ghost wrap style={{ marginTop: 16 }}>
      <ProCard title="Carrier APIs" colSpan={{ xs: 24, md: 14 }}>
        <ProTable rowKey="id" search={false} options={false} pagination={false} dataSource={x.providers} columns={[{ title: 'Provider', dataIndex: 'label' }, { title: 'Capabilities', render: (_, r) => (r.capabilities || []).join(' · ') }, { title: 'Status', render: (_, r) => tag(r.configured ? 'configured' : 'not configured') }]} />
      </ProCard>
      <ProCard title="Shipping & tax estimate" colSpan={{ xs: 24, md: 10 }}>
        <Form layout="vertical" initialValues={{ country: 'CH', postal_code: '4051', subtotal: 980 }} onFinish={runQuote}>
          <Form.Item name="country" label="Country"><Select options={['CH', 'DE', 'FR', 'GB', 'US', 'CA'].map(v => ({ value: v, label: v }))} /></Form.Item>
          <Form.Item name="postal_code" label="Postal code"><Input /></Form.Item>
          <Form.Item name="subtotal" label="Cart subtotal (CNY)"><InputNumber style={{ width: '100%' }} min={0} /></Form.Item>
          <Button htmlType="submit" type="primary" disabled={!live}>Calculate</Button>
        </Form>
        {quote && !quote.__error && <Paragraph style={{ marginTop: 12 }}><Text strong>{quote.zone.name}</Text><br />{quote.shipping_options.map(o => <span key={o.id}>{o.label}: ¥{o.amount} · {o.eta_days}<br /></span>)}Tax ¥{quote.tax.amount} · {quote.tax.engine}<br /><Text strong>Total ¥{quote.grand_total}</Text>{quote.live_rate_error && <><br /><Text type="warning">Live rate fallback: {quote.live_rate_error}</Text></>}</Paragraph>}
      </ProCard>
    </ProCard>
    <ProTable style={{ marginTop: 16 }} headerTitle="Shipment tracking" rowKey="id" search={false} options={{ reload: load }} pagination={false} dataSource={x.shipments} columns={[
      { title: 'Order', dataIndex: 'order_id' }, { title: 'Carrier', dataIndex: 'carrier' },
      { title: 'Tracking', dataIndex: 'tracking_number', render: (_, r) => <a onClick={() => openTrack(r.tracking_number)}>{r.tracking_number}</a> },
      { title: 'Status', render: (_, r) => tag(r.status) }, { title: 'Last event', render: (_, r) => typeof r.last_event === 'string' ? r.last_event : (r.last_event?.description || '—') }, { title: 'ETA', dataIndex: 'eta' }]} />
    <ProTable style={{ marginTop: 16 }} headerTitle="Shipping / tax regions" rowKey="id" search={false} options={false} pagination={false} dataSource={x.zones}
      toolBarRender={() => [<Button key="x" onClick={() => downloadAuthed('/api/saas/data/export/shipping_zones?format=xlsx', 'shipping_zones.xlsx')}>Export Excel</Button>]}
      columns={[{ title: 'Region', render: (_, r) => <a onClick={() => { setZone(r); form.setFieldsValue({ ...r, countries: (r.countries || []).join(', ') }); }}>{r.name}</a> },
        { title: 'Countries', render: (_, r) => (r.countries || []).join(', ') }, { title: 'Standard', render: (_, r) => `${r.standard_base} + ${r.standard_per_kg}/kg` },
        { title: 'Express', render: (_, r) => `${r.express_base} + ${r.express_per_kg}/kg` }, { title: 'Free from', dataIndex: 'free_shipping_threshold' },
        { title: 'Tax', render: (_, r) => `${((Number(r.tax_rate) || 0) * 100).toFixed(1)}% · ${r.tax_mode}` }, { title: 'Status', render: (_, r) => tag(r.active === false ? 'disabled' : 'active') }]} />
    <ProTable style={{ marginTop: 16 }} headerTitle="Store sync" rowKey={(r, i) => r.id || i} search={false} options={false} pagination={false} dataSource={x.store_sync}
      columns={[{ title: 'Store', render: (_, r) => storeName(r.store_id) }, { title: 'Provider', dataIndex: 'provider' }, { title: 'Type', dataIndex: 'sync_type' }, { title: 'Status', render: (_, r) => tag(r.status) }, { title: 'Synced', render: (_, r) => fmt(r.synced_at) }]} />
    <Drawer open={!!track} onClose={() => setTrack(null)} width={560} title={`Tracking · ${track?.shipment?.tracking_number || ''}`}>
      {track && <><Descriptions column={1} size="small" items={[{ label: 'Carrier', children: track.shipment?.carrier || '—' }, { label: 'Status', children: tag(track.shipment?.status || 'Unknown') }, { label: 'Order', children: track.shipment?.order_id || '—' }, { label: 'ETA', children: track.shipment?.eta || '—' }]} />
        <Timeline style={{ marginTop: 24 }} items={(track.timeline || []).map(e => ({ children: <><Text strong>{e.status}</Text><br /><Text type="secondary">{e.location || ''}{e.description ? ' · ' + e.description : ''} · {fmt(e.time)}</Text></> }))} /></>}
    </Drawer>
    <Drawer open={!!zone} onClose={() => setZone(null)} width={560} title={`Region · ${zone?.name || ''}`} extra={<Button type="primary" onClick={() => form.submit()}>Save</Button>}>
      <Form form={form} layout="vertical" onFinish={saveZone}>
        <Form.Item name="name" label="Name" rules={[{ required: true }]}><Input /></Form.Item>
        <Form.Item name="countries" label="Countries (comma separated)"><Input /></Form.Item>
        <Space wrap>{[['standard_base', 'Standard base'], ['standard_per_kg', 'Standard / kg'], ['express_base', 'Express base'], ['express_per_kg', 'Express / kg'], ['free_shipping_threshold', 'Free shipping from'], ['tax_rate', 'Tax rate']].map(([n, l]) =>
          <Form.Item key={n} name={n} label={l}><InputNumber min={0} step={n === 'tax_rate' ? 0.001 : 1} /></Form.Item>)}</Space>
        <Form.Item name="tax_mode" label="Tax mode"><Select options={['manual_demo', 'external_recommended', 'external_required'].map(v => ({ value: v, label: v }))} /></Form.Item>
        <Form.Item name="active" label="Active" valuePropName="checked"><Switch /></Form.Item>
      </Form>
    </Drawer>
  </PageContainer>;
}

// ---------------- Data import / export ----------------
const ENTITIES = [['products', 'Products'], ['orders', 'Orders'], ['customers', 'Customers'], ['shipments', 'Shipments'], ['shipping_zones', 'Shipping zones'], ['influencers', 'Creators'], ['affiliates', 'Affiliates'], ['campaigns', 'Campaigns']];
export function DataExchange({ live, reload, t }) {
  const [entity, setEntity] = useState('products');
  const [preview, setPreview] = useState(null);
  const { message, modal } = AntApp.useApp();
  const dl = (path, name) => downloadAuthed(path, name).catch(e => message.error(e.message));
  const onFile = async file => {
    if (!live) { message.warning(t('needBackend')); return false; }
    const fmtType = file.name.toLowerCase().endsWith('.csv') ? 'csv' : 'xlsx';
    const d = await uploadFile(`/api/saas/data/import/preview?entity=${entity}&format=${fmtType}`, file);
    if (ok(d)) setPreview(d); else message.error(d?.error || t('failed'));
    return false; // handled manually
  };
  const commit = () => modal.confirm({ title: `Import ${preview.valid_rows} rows?`, content: t('confirmWrite'), onOk: async () => {
    const r = await post('/api/saas/data/import/commit', { preview_token: preview.preview_token, approved: true });
    if (ok(r)) { message.success(`${r.inserted} new · ${r.updated} updated`); setPreview(null); reload(); } else message.error(r?.error || t('failed'));
  } });
  const cols = preview ? [...new Set((preview.rows || []).slice(0, 8).flatMap(r => Object.keys(r)))] : [];
  return <PageContainer title={t('data')} subTitle="Excel / CSV · Upload → Validate → Preview → Approve → Commit" extra={[<Button key="tpl" onClick={() => dl('/api/saas/data/template.xlsx', 'commerce-os-import-template.xlsx')}>Excel template</Button>]}>
    <ProCard gutter={16} ghost wrap>
      <ProCard title="Import" colSpan={{ xs: 24, md: 8 }}>
        <Space direction="vertical" style={{ width: '100%' }}>
          <Select value={entity} onChange={v => { setEntity(v); setPreview(null); }} options={ENTITIES.map(([value, label]) => ({ value, label }))} style={{ width: '100%' }} />
          <Upload.Dragger accept=".xlsx,.csv" showUploadList={false} beforeUpload={onFile}><p>Drop .xlsx / .csv here or click to choose</p><Text type="secondary">Validated first — nothing is written yet.</Text></Upload.Dragger>
          <Button type="primary" disabled={!preview || preview.error_rows > 0 || !preview.valid_rows} onClick={commit}>Commit import</Button>
        </Space>
      </ProCard>
      <ProCard title="Preview" colSpan={{ xs: 24, md: 16 }}>
        {preview ? <>
          <Space size={24}><StatisticCard statistic={{ title: 'Total', value: preview.total_rows }} /><StatisticCard statistic={{ title: 'Valid', value: preview.valid_rows }} /><StatisticCard statistic={{ title: 'Errors', value: preview.error_rows, status: preview.error_rows ? 'error' : 'success' }} /></Space>
          {(preview.errors || []).slice(0, 12).map((e, i) => <div key={i}><Text type="danger">Row {e.row} · {e.field}: {e.message}</Text></div>)}
          <ProTable style={{ marginTop: 12 }} rowKey={(r, i) => i} search={false} options={false} pagination={false} scroll={{ x: true }} dataSource={(preview.rows || []).slice(0, 8)}
            columns={cols.map(c => ({ title: c, dataIndex: c, render: (_, r) => Array.isArray(r[c]) ? r[c].join(', ') : String(r[c] ?? '') }))} />
        </> : <Text type="secondary">Upload a file to see valid rows, errors and a preview.</Text>}
      </ProCard>
    </ProCard>
    <ProTable style={{ marginTop: 16 }} headerTitle="Export" rowKey={r => r[0]} search={false} options={false} pagination={false} dataSource={ENTITIES}
      columns={[{ title: 'Module', render: (_, r) => r[1] }, { title: '', valueType: 'option', render: (_, r) => [<a key="x" onClick={() => dl(`/api/saas/data/export/${r[0]}?format=xlsx`, `${r[0]}.xlsx`)}>.xlsx</a>, <a key="c" onClick={() => dl(`/api/saas/data/export/${r[0]}?format=csv`, `${r[0]}.csv`)}>.csv</a>] }]} />
  </PageContainer>;
}

// ---------------- Connector center ----------------
export function ConnectorCenter({ live, t }) {
  const [rows, setRows] = useState([]);
  const [sel, setSel] = useState(null);
  const [form] = Form.useForm();
  const { message, modal } = AntApp.useApp();
  const load = async () => setRows(live ? (await api('/api/saas/connectors/registry')) || [] : []);
  useEffect(() => { load(); }, [live]); // eslint-disable-line react-hooks/exhaustive-deps
  const open = r => { setSel(r); form.resetFields(); form.setFieldsValue({ webhook_url: r.webhook_url || '', notes: r.notes || '' }); };
  const save = v => modal.confirm({ title: `${sel.label}`, content: t('confirmWrite'), onOk: async () => {
    const body = Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined && String(x).trim() !== ''));
    const r = await post(`/api/saas/connectors/${encodeURIComponent(sel.id)}/config`, { ...body, enabled: true, approved: true });
    form.resetFields(); // secrets never stay in the form
    if (ok(r)) { message.success(t('done')); setSel(r); load(); } else message.error(r?.error || t('failed'));
  } });
  const test = async id => { const r = await post(`/api/saas/connectors/${encodeURIComponent(id)}/test`, {}); ok(r) ? message.info(r.last_test_status) : message.error(t('failed')); load(); if (sel?.id === id && ok(r)) setSel(r); };
  const testAll = async () => { await Promise.all(rows.map(r => post(`/api/saas/connectors/${encodeURIComponent(r.id)}/test`, {}))); load(); message.success(t('done')); };
  return <PageContainer title={t('connectors')} subTitle="Credentials are stored encrypted per tenant and never shown again" extra={[<Button key="t" onClick={testAll} disabled={!live}>{t('testAll')}</Button>]}>
    <ProTable rowKey="id" search={false} options={{ reload: load }} pagination={false} dataSource={rows} locale={{ emptyText: t('needBackend') }}
      columns={[{ title: 'Connector', dataIndex: 'label', render: (_, r) => <a onClick={() => open(r)}>{r.label}</a> }, { title: 'Group', dataIndex: 'group' },
        { title: 'Status', render: (_, r) => tag(r.configured ? 'configured' : 'not configured') }, { title: 'Fields', render: (_, r) => `${r.configured_fields}/${r.total_fields}` },
        { title: 'Last test', render: (_, r) => `${r.last_test_status || 'not_tested'} ${r.last_test_at ? fmt(r.last_test_at) : ''}` },
        { title: '', valueType: 'option', render: (_, r) => [<a key="c" onClick={() => open(r)}>Configure</a>, <a key="t" onClick={() => test(r.id)}>Test</a>] }]} />
    <Drawer open={!!sel} onClose={() => setSel(null)} width={600} title={sel ? `${sel.label} · API` : ''} extra={<Space><Button onClick={() => test(sel.id)}>Test</Button><Button type="primary" onClick={() => form.submit()}>Save</Button></Space>}>
      {sel && <><Paragraph type="secondary">{sel.description}</Paragraph>
        <Form form={form} layout="vertical" onFinish={save} autoComplete="off">
          {(sel.fields || []).map(f => <Form.Item key={f.key} name={f.key} label={`${f.key}${f.required ? ' *' : ''}${f.secret ? ' · secret' : ''}`}>
            {f.secret ? <Input.Password placeholder={f.configured ? 'Configured — leave empty to keep' : f.env} autoComplete="new-password" /> : <Input placeholder={f.configured ? 'Configured — leave empty to keep' : f.env} />}</Form.Item>)}
          <Form.Item name="webhook_url" label="Webhook URL" rules={[{ pattern: /^$|^https:\/\//i, message: 'https:// required' }]}><Input /></Form.Item>
          <Form.Item name="notes" label="Notes"><Input /></Form.Item>
        </Form></>}
    </Drawer>
  </PageContainer>;
}

// ---------------- Customer 360 drawer ----------------
export function CustomerDrawer({ id, onClose, live, goAgent }) {
  const [d, setD] = useState(null);
  useEffect(() => { setD(null); if (id && live) api(`/api/saas/customers/${encodeURIComponent(id)}/detail`).then(setD); }, [id, live]);
  const c = d?.customer;
  return <Drawer open={!!id} onClose={onClose} width={760} title={c ? (c.name || c.email) : 'Customer 360'}>
    {!live && <Text type="secondary">Demo mode: start the backend to load the full profile.</Text>}
    {c && <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Descriptions size="small" column={2} items={[{ label: 'Email', children: c.email }, { label: 'Segment', children: tag(c.segment) }, { label: 'LTV', children: money(c.lifetime_value) }, { label: 'Orders', children: c.orders }, { label: 'Avg order', children: money(c.avg_order_value) }, { label: 'Last seen', children: c.last_seen }, { label: 'Scene', children: c.favorite_scene }, { label: 'Source', children: c.acquisition }]} />
      <ProCard title="Profile scores" size="small">{Object.entries(c.scores || {}).map(([k, v]) => <div key={k}><Text type="secondary">{k}</Text><Progress percent={v} size="small" /></div>)}</ProCard>
      <div>{[...(c.interests || []), ...(c.preferred_materials || []), ...(c.preferred_categories || [])].map(x => <Tag key={x}>{x}</Tag>)}</div>
      <ProCard title="Recent activity" size="small"><List size="small" dataSource={d.behavior_events || []} renderItem={e => <List.Item extra={fmt(e.created_at)}>{e.label} · <Text type="secondary">{e.channel}</Text></List.Item>} /></ProCard>
      <ProCard title="Recommendations" size="small" extra={<Button size="small" type="primary" onClick={() => { onClose(); goAgent(`为客户 ${c.name || c.email} 生成个性化营销与产品推荐任务`); }}>Ask agent</Button>}>
        <List size="small" dataSource={(d.recommendations || []).slice(0, 3)} renderItem={p => <List.Item extra={`${Math.round((Number(p.score) || 0) * 100)}%`}>{p.name}<br /><Text type="secondary">{p.reason}</Text></List.Item>} /></ProCard>
      <ProTable size="small" headerTitle="Orders" rowKey="id" search={false} options={false} pagination={false} dataSource={d.orders || []} columns={[{ title: 'Order', dataIndex: 'id' }, { title: 'Date', render: (_, o) => String(o.created_at || '').slice(0, 10) }, { title: 'Status', render: (_, o) => tag(o.status) }, { title: 'Total', render: (_, o) => `${o.currency || ''} ${o.revenue}` }]} />
    </Space>}
  </Drawer>;
}


// ---------------- Frontend Studio / account sync ----------------
export function StudioSync({ data, live, t }) {
  const users = data.users || [], projects = data['studio-projects'] || [], notes = data.notifications || [], invitations = data.invitations || [], proofs = data.proofs || [], events = data['order-events'] || [], orders = (data.orders || []).filter(o => o.channel === 'studio');
  const byId = Object.fromEntries(users.map(u => [u.id, u]));
  const proofByOrder = Object.fromEntries(proofs.map(p => [p.order_id, p]));
  return <PageContainer title={t('studio')} subTitle="Frontend accounts · projects · request orders · proof lifecycle · email delivery">
    <ProCard ghost gutter={[16,16]} wrap>
      {[['Users', users.length], ['Projects', projects.length], ['Studio orders', orders.length], ['Notifications', notes.length]].map(([title,value]) => <ProCard key={title} colSpan={{xs:24,md:6}}><StatisticCard statistic={{title,value}} /></ProCard>)}
    </ProCard>
    <ProTable style={{marginTop:16}} headerTitle="Users" rowKey="id" search={false} dataSource={users} columns={[{title:'Email',dataIndex:'email'},{title:'Name',dataIndex:'name'},{title:'Status',render:(_,r)=>tag(r.status||'active')},{title:'Last login',render:(_,r)=>fmt(r.last_login_at)}]} />
    <ProTable style={{marginTop:16}} headerTitle="Studio projects" rowKey="id" search={false} dataSource={projects} columns={[{title:'Project',dataIndex:'id'},{title:'User',render:(_,r)=>byId[r.user_id]?.email||r.contact?.email||'—'},{title:'Scenario',dataIndex:'scenario_id'},{title:'Status',render:(_,r)=>tag(r.status||'draft')},{title:'Updated',render:(_,r)=>fmt(r.updated_at||r.created_at)}]} />
    <ProTable style={{marginTop:16}} headerTitle="Studio orders / lifecycle" rowKey="id" search={false} dataSource={orders} columns={[{title:'Order',dataIndex:'id'},{title:'User',render:(_,r)=>byId[r.user_id]?.email||r.customer_email||'—'},{title:'Status',render:(_,r)=>tag(r.status||'—')},{title:'Proof',render:(_,r)=>tag(proofByOrder[r.id]?.status||'not ready')},{title:'Total',render:(_,r)=>`${r.currency||''} ${Number(r.revenue||0).toFixed(2)}`},{title:'Updated',render:(_,r)=>fmt(r.updated_at||r.created_at)}]} />
    <ProTable style={{marginTop:16}} headerTitle="Order events" rowKey="id" search={false} dataSource={[...events].sort((a,b)=>String(b.event_time||'').localeCompare(String(a.event_time||'')))} columns={[{title:'Order',dataIndex:'order_id'},{title:'Event',dataIndex:'event_type'},{title:'Source',dataIndex:'source'},{title:'Detail',render:(_,r)=>r.payload?.status||r.payload?.note||r.payload?.proof_id||'—'},{title:'Time',render:(_,r)=>fmt(r.event_time||r.created_at)}]} />
    <ProTable style={{marginTop:16}} headerTitle="Published invitation sites" rowKey="id" search={false} dataSource={invitations} columns={[{title:'ID',dataIndex:'id'},{title:'User',render:(_,r)=>byId[r.user_id]?.email||'—'},{title:'Names',dataIndex:'names'},{title:'Scene',dataIndex:'scene'},{title:'URL',render:(_,r)=><a href={r.url} target="_blank" rel="noreferrer">Open</a>}]} />
    <ProTable style={{marginTop:16}} headerTitle="Email / notifications" rowKey="id" search={false} dataSource={notes} columns={[{title:'Type',dataIndex:'type'},{title:'To',dataIndex:'to'},{title:'Subject',dataIndex:'subject'},{title:'Status',render:(_,r)=>tag(r.status||'pending')},{title:'Created',render:(_,r)=>fmt(r.created_at)}]} />
  </PageContainer>;
}
