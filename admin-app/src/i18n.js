// Small UI dictionary for the React admin; shares the language key with the rest of the site.
export const LANG_KEY = 'wedding-commerce-language';
export const initialLang = () => { try { const l = localStorage.getItem(LANG_KEY); return ['zh', 'en', 'de'].includes(l) ? l : 'zh'; } catch { return 'zh'; } };
const D = {
  overview: ['总览', 'Overview', 'Übersicht'], studio: ['Studio / 账号', 'Studio / Accounts', 'Studio / Konten'], logistics: ['物流管理', 'Logistics', 'Logistik'], data: ['数据导入 / 导出', 'Data import / export', 'Datenimport / -export'], stores: ['店铺中心', 'Stores', 'Shops'], orders: ['订单管理', 'Orders', 'Bestellungen'],
  catalog: ['商品 / 采购', 'Catalog / Sourcing', 'Katalog / Beschaffung'], inbox: ['统一 Inbox', 'Unified Inbox', 'Posteingang'], marketing: ['营销 / 广告', 'Marketing / Ads', 'Marketing / Anzeigen'],
  customers: ['用户画像 / 推荐', 'Customer 360', 'Kundenprofil'], creators: ['达人 / 联盟', 'Creators / Affiliate', 'Creator / Affiliate'], finance: ['财务 / 利润', 'Finance / Profit', 'Finanzen / Gewinn'],
  agent: ['Agent 任务中心', 'Agent Command Center', 'Agent-Aufgaben'], approvals: ['审批中心', 'Approvals', 'Freigaben'], connectors: ['API / 协议', 'API / Protocols', 'API / Protokolle'],
  live: ['实时数据', 'Live data', 'Live-Daten'], demo: ['演示数据（后端未连接）', 'Demo data (backend not connected)', 'Demodaten (Backend nicht verbunden)'],
  denied: ['演示数据（需要管理员密钥，刷新页面后输入）', 'Demo data (admin key required — reload to enter it)', 'Demodaten (Admin-Schlüssel nötig – Seite neu laden)'],
  refresh: ['刷新', 'Refresh', 'Aktualisieren'], exportCsv: ['导出 CSV', 'Export CSV', 'CSV exportieren'], syncLogistics: ['同步物流', 'Sync shipping', 'Versand synchronisieren'],
  syncAll: ['全部同步', 'Sync all', 'Alle synchronisieren'], sync: ['同步', 'Sync', 'Sync'], connectShopify: ['连接 Shopify 店铺', 'Connect Shopify store', 'Shopify-Shop verbinden'],
  continue: ['继续授权', 'Continue', 'Weiter'], importFeed: ['导入 Supplier Feed', 'Import supplier feed', 'Lieferanten-Feed importieren'], aiCost: ['AI 成本检查', 'AI cost check', 'KI-Kostenprüfung'],
  newCampaign: ['新建 Campaign', 'New campaign', 'Neue Kampagne'], aiIdeas: ['AI 优化建议', 'AI optimization', 'KI-Optimierung'], segments: ['分群', 'Segments', 'Segmente'],
  draft: ['生成草稿', 'Draft reply', 'Entwurf erstellen'], approve: ['批准', 'Approve', 'Freigeben'], reject: ['拒绝', 'Reject', 'Ablehnen'], run: ['执行', 'Run', 'Ausführen'],
  testAll: ['测试全部连接', 'Test all connections', 'Alle Verbindungen testen'], noApprovals: ['暂无待审批任务', 'No pending approvals', 'Keine offenen Freigaben'],
  confirmWrite: ['这是写操作，确认执行？', 'This is a write action. Continue?', 'Dies ist ein Schreibvorgang. Fortfahren?'], done: ['已完成', 'Done', 'Erledigt'], failed: ['操作失败', 'Action failed', 'Aktion fehlgeschlagen'],
  needBackend: ['演示模式：请先启动后端', 'Demo mode: start the backend first', 'Demomodus: bitte zuerst das Backend starten'],
  oauthFail: ['Shopify OAuth 未配置或店铺域名无效', 'Shopify OAuth is not configured or the domain is invalid', 'Shopify OAuth nicht konfiguriert oder Domain ungültig'],
  invalidDomain: ['请输入有效的 .myshopify.com 域名', 'Enter a valid .myshopify.com domain', 'Bitte eine gültige .myshopify.com-Domain eingeben'],
  agentHint: ['例如：检查本周利润下降原因，并创建需要审批的优化任务', 'e.g. find why profit dropped and create optimization tasks for approval', 'z. B. Gewinnrückgang analysieren und Optimierungsaufgaben zur Freigabe anlegen'],
  draftOnly: ['只会创建草稿；发布和预算变更需要审批。', 'Only a draft is created; publishing and budget changes require approval.', 'Nur ein Entwurf; Veröffentlichung und Budgetänderungen benötigen Freigabe.'],
};
const idx = { zh: 0, en: 1, de: 2 };
export const makeT = lang => key => (D[key] ? D[key][idx[lang]] || D[key][0] : key);
