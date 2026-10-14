import React, { useMemo, useState } from 'react';
import { App as AntApp, Button, ConfigProvider, Dropdown, Input, Modal, Select, Space, Typography } from 'antd';
import { RobotOutlined, ShopOutlined, GlobalOutlined, ReloadOutlined } from '@ant-design/icons';
import { ProLayout } from '@ant-design/pro-components';
import enUS from 'antd/locale/en_US';
import zhCN from 'antd/locale/zh_CN';
import deDE from 'antd/locale/de_DE';
import { useAdminData } from './useAdminData.js';
import { LANG_KEY, initialLang, makeT } from './i18n.js';
import * as P from './pages.jsx';
import * as V11 from './pages-v11.jsx';

const { Text } = Typography;
const PAGES = ['overview', 'stores', 'orders', 'studio', 'logistics', 'catalog', 'data', 'inbox', 'marketing', 'customers', 'creators', 'finance', 'agent', 'approvals', 'connectors'];
const COMPONENTS = { overview: P.Overview, stores: P.Stores, orders: P.Orders, studio: V11.StudioSync, logistics: V11.Logistics, catalog: P.Catalog, data: V11.DataExchange, inbox: P.Inbox, marketing: P.Marketing, customers: P.Customers, creators: P.Creators, finance: P.Finance, agent: P.Agent, approvals: P.Approvals, connectors: V11.ConnectorCenter };
const LOCALES = { zh: zhCN, en: enUS, de: deDE };

function Shell({ lang, setLang }) {
  const t = useMemo(() => makeT(lang), [lang]);
  const { data, live, loading, denied, reload } = useAdminData();
  const [page, setPage] = useState('overview');
  const [agentSeed, setAgentSeed] = useState(null);
  const [shopifyOpen, setShopifyOpen] = useState(false);
  const [shop, setShop] = useState('');
  const { message } = AntApp.useApp();

  const goAgent = q => { setAgentSeed(q + '\u200b'.repeat(Date.now() % 7)); setPage('agent'); }; // new seed value each time
  const pendingApprovals = (data.tasks || []).filter(x => x.status === 'needs_approval').length;
  const routes = PAGES.map(k => ({ path: '/' + k, name: t(k) + (k === 'approvals' && pendingApprovals ? ` (${pendingApprovals})` : '') }));
  const sourceLabel = loading ? '…' : live ? t('live') : denied ? t('denied') : t('demo');
  const Page = COMPONENTS[page];

  return <>
    <ProLayout
      title="Wedding Commerce OS"
      logo={<div style={{ width: 28, height: 28, borderRadius: 6, background: '#1677ff', color: '#fff', display: 'grid', placeItems: 'center' }}>W</div>}
      layout="mix" siderWidth={208} fixedHeader fixSiderbar
      location={{ pathname: '/' + page }}
      route={{ routes }}
      menuItemRender={(item, dom) => <a onClick={() => setPage(item.path.slice(1))}>{dom}</a>}
      actionsRender={() => [
        <Text key="src" type="secondary" style={{ fontSize: 12 }}>{sourceLabel}</Text>,
        <Select key="tenant" size="small" defaultValue="tenant_demo" options={[{ value: 'tenant_demo', label: 'tenant_demo' }]} style={{ width: 120 }} />,
        <Dropdown key="lang" menu={{ items: [{ key: 'zh', label: '中文' }, { key: 'en', label: 'English' }, { key: 'de', label: 'Deutsch' }], onClick: ({ key }) => setLang(key) }}><Button size="small" icon={<GlobalOutlined />}>{lang.toUpperCase()}</Button></Dropdown>,
        <Button key="reload" size="small" icon={<ReloadOutlined />} onClick={reload} aria-label={t('refresh')} />,
        <Button key="shopify" size="small" icon={<ShopOutlined />} onClick={() => setShopifyOpen(true)}>Shopify</Button>,
        <Button key="agent" type="primary" size="small" icon={<RobotOutlined />} onClick={() => setPage('agent')}>Ask Agent</Button>
      ]}
    >
      <Page data={data} live={live} reload={reload} t={t} sourceLabel={sourceLabel} goAgent={goAgent} openShopify={() => setShopifyOpen(true)} seed={page === 'agent' ? agentSeed : null} />
    </ProLayout>
    <Modal title={t('connectShopify')} open={shopifyOpen} onCancel={() => setShopifyOpen(false)} onOk={() => P.startShopifyOAuth(shop, t, message)} okText={t('continue')}>
      <Space direction="vertical" style={{ width: '100%' }} size={12}>
        <Text type="secondary">your-store.myshopify.com → Shopify OAuth. SHOPIFY_CLIENT_SECRET stays on the server.</Text>
        <Input value={shop} onChange={e => setShop(e.target.value)} onPressEnter={() => P.startShopifyOAuth(shop, t, message)} placeholder="your-store.myshopify.com" />
      </Space>
    </Modal>
  </>;
}

export default function App() {
  const [lang, setLangState] = useState(initialLang);
  const setLang = l => { setLangState(l); try { localStorage.setItem(LANG_KEY, l); } catch {} };
  return <ConfigProvider locale={LOCALES[lang]} theme={{ token: { colorPrimary: '#1677ff', borderRadius: 8, fontSize: 14, colorBgLayout: '#f5f5f5' } }}>
    <AntApp><Shell lang={lang} setLang={setLang} /></AntApp>
  </ConfigProvider>;
}
