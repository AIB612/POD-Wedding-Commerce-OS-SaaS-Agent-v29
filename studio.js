var TECH_TIPS = { DTG: "Direct-to-garment print", sublimation: "Dye sublimation", UV: "UV print", laser: "Laser engraving", embroidery: "Embroidery", offset: "Offset print", digital: "Digital print" };
/* POD Studio v28 — V23 studio UI/components preserved; v24 focused catalog retained; v27 right-rail flow preserved; v28 makes Packaging/Review actionable.
 * Packaging: optional reference image + explicit "no custom packaging" choice.
 * Review: every unfinished check explains what is missing and jumps directly to the place where it can be fixed.
 * explore (who you are · scenarios · what's inside · all products) → flexible workspace
 * (selection rail + free tabs: design · pricing · delivery · packaging · review). Works from disk (file://);
 * with the server, projects / quote requests go to /api/studio/*. Rendering: studio-mockups.js. Numbers: studio-pricing.js. */
(() => {
  const D = window.STUDIO_DATA, P = window.StudioPricing, M = window.StudioMockups;
  const SERVER = /^https?:$/.test(location.protocol);
  const LANG_KEY = "wedding-commerce-language", LOCAL_KEY = "pod-studio-projects", DRAFT_KEY = "pod-studio-draft-v2";
  const store = { get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } } };
  let lang = (() => { try { const l = localStorage.getItem(LANG_KEY); return ["zh", "en", "de"].includes(l) ? l : "en"; } catch { return "en"; } })();   // default: English

  // ------------------------------------------------------------------ i18n
  const I = {
    role: ["身份", "I am", "Ich bin"], roleHint: ["当前身份：{r}。右上角可随时切换。", "Ordering as {r}. Switch any time at the top right.", "Bestellung als {r}. Oben rechts jederzeit änderbar."],
    bindStore: ["绑定店铺", "Connect shop", "Shop verbinden"], storesN: ["已绑定 {n} 个店铺", "{n} shop(s) connected", "{n} Shop(s) verbunden"],
    bindTitle: ["绑定你的网店", "Connect your shop", "Shop verbinden"], bindLead: ["绑定后，商品可以直接发布到你的店铺，顾客订单自动回传生产。可以现在绑定，也可以最后在「确认」时再选。", "Once connected, products publish to your shop and customer orders flow back to production. Connect now or choose at the end in Review.", "Nach der Verbindung werden Produkte veröffentlicht und Bestellungen automatisch produziert. Jetzt verbinden oder am Ende wählen."],
    bind: ["绑定", "Connect", "Verbinden"], shopDomain: ["Shopify 店铺域名", "Shopify store domain", "Shopify-Shop-Domain"], wooUrl: ["WooCommerce 网店地址", "WooCommerce shop URL", "WooCommerce-Shop-URL"],
    shopHint: ["例如 your-store.myshopify.com。会跳转到 Shopify 官方授权页，我们不会接触你的密码。", "e.g. your-store.myshopify.com. You authorise on Shopify's own page — we never see your password.", "z. B. your-store.myshopify.com. Freigabe auf der Shopify-Seite – wir sehen kein Passwort."],
    wooHint: ["例如 https://shop.example.com。会跳转到你的 WordPress 后台授权，API 密钥由 WooCommerce 直接发给服务器并加密保存。", "e.g. https://shop.example.com. You approve in your WordPress admin; WooCommerce sends the API keys straight to our server, stored encrypted.", "z. B. https://shop.example.com. Freigabe im WordPress-Admin; die Schlüssel gehen verschlüsselt an unseren Server."],
    st_requested: ["已提交，等待平台开通", "Requested — awaiting activation", "Angefragt – wartet auf Freischaltung"], st_pending_authorization: ["等待授权", "Awaiting authorisation", "Wartet auf Freigabe"],
    st_connected: ["已连接", "Connected", "Verbunden"], st_local: ["待授权（需启动服务）", "Pending (needs the server)", "Ausstehend (Server nötig)"],
    publishShopify: ["发布到 Shopify", "Publish to Shopify", "In Shopify veröffentlichen"], sellerLead: ["生成成品图、设置三币种零售价与物流，然后直接上架到你的 Shopify 店铺——无需付款。", "Generate product mockups, set EUR/CHF/USD retail prices and shipping, then list it in your Shopify store — no payment needed.", "Mockups erstellen, Preise in EUR/CHF/USD und Versand festlegen und direkt in Ihrem Shopify-Shop listen — ohne Zahlung."],
    publishTo: ["发布到店铺", "Publish to", "Veröffentlichen in"], later: ["稍后再绑定", "Connect later", "Später verbinden"], connectedOk: ["店铺已连接", "Shop connected", "Shop verbunden"],
    material: ["材质", "Material", "Material"], materialHint: ["不同材质会改变单价", "The material changes the unit price", "Das Material ändert den Stückpreis"],
    privacy: ["设计在服务器上加密保存（AES-256-GCM），未下单的方案 30 天后自动删除，已询价的方案 90 天后删除。永久免费，无需订阅。", "Designs are stored encrypted on the server (AES-256-GCM); plans without an order are deleted after 30 days, plans with a quote request after 90 days. Free forever, no subscription.", "Designs werden verschlüsselt gespeichert (AES-256-GCM); Pläne ohne Bestellung werden nach 30 Tagen gelöscht, mit Anfrage nach 90 Tagen. Dauerhaft kostenlos, ohne Abo."],
    nav_scenes: ["场景套装", "Scenario kits", "Szenario-Sets"], nav_all: ["全部商品", "All products", "Alle Produkte"], nav_work: ["我的方案 · 设计工作室", "My selection · Studio", "Meine Auswahl · Studio"],
    pickScene: ["选择一个场景，右侧会显示它的套装。", "Pick a scenario — its kits appear on the right.", "Szenario wählen – die Sets erscheinen rechts."],
    addToSel: ["+ 加入方案", "+ Add to selection", "+ Zur Auswahl"], kitAdded: ["已在方案中", "In selection", "In der Auswahl"], designKit: ["用这个套装开始设计 →", "Design with this kit →", "Mit diesem Set gestalten →"],
    weddingDefault: ["婚礼", "Wedding", "Hochzeit"], otherKits: ["其他套装：企业、创作者、小众社群等", "Other kits: corporate, creators, niche & more", "Weitere Sets: Firmen, Creator, Nischen & mehr"], otherKitsLead: ["不是婚礼？选择适合您的场景。", "Not a wedding? Pick the scenario that fits.", "Keine Hochzeit? Wählen Sie das passende Szenario."], studioName: ["设计工作室", "Design studio", "Design-Studio"],
    m_explore: ["场景与商品", "Scenarios & products", "Szenarien & Produkte"], m_work: ["设计工作室", "Design studio", "Design-Studio"],
    sub_kits: ["场景套装", "Scenario kits", "Szenario-Sets"], sub_all: ["全部商品", "All products", "Alle Produkte"],
    replaceKit: ["用这个套装开始设计", "Start designing with this kit", "Mit diesem Set gestalten"], mergeKit: ["+ 合并到方案", "+ Add to selection", "+ Zur Auswahl"],
    details: ["明细", "Details", "Details"], hide: ["收起", "Hide", "Ausblenden"], inSelection: ["已在方案中", "In your selection", "In Ihrer Auswahl"],
    perSet: ["每套", "per set", "pro Set"], profitPerSet: ["每套利润", "Profit per set", "Gewinn pro Set"], retailSet: ["建议零售", "Suggested retail", "Empf. Verkaufspreis"],
    merged: ["已合并到方案", "Added to your selection", "Zur Auswahl hinzugefügt"], startDesign: ["开始设计 →", "Start designing →", "Gestalten →"], goDesign: ["去设计 →", "Go to design →", "Zum Design →"],
    nextPricing: ["下一步 · 定价 →", "Next · Pricing →", "Weiter · Preise →"], nextDelivery: ["下一步 · 寄送 →", "Next · Delivery →", "Weiter · Versand →"],
    nextPackaging: ["下一步 · 包装 →", "Next · Packaging →", "Weiter · Verpackung →"], nextReview: ["下一步 · 确认 →", "Next · Review →", "Weiter · Übersicht →"],
    flowSelected: ["已选择 {n} 件商品", "{n} products selected", "{n} Produkte ausgewählt"], flowNeedDesign: ["先上传设计图或生成文字设计", "Add a design before continuing", "Vor dem Fortfahren Design hinzufügen"],
    flowNeedDelivery: ["先完善寄送信息", "Complete delivery details first", "Zuerst Versandangaben vervollständigen"], flowReady: ["当前步骤已完成，可以继续", "This step is ready — continue", "Dieser Schritt ist bereit"],
    flowReviewBlocked: ["先完成确认页里的必填检查", "Complete the required checks before submitting", "Pflichtprüfungen vor dem Absenden abschließen"], flowSubmitted: ["已提交 · {ref}", "Submitted · {ref}", "Gesendet · {ref}"],
    emptyHint: ["从场景套装开始，或在「全部商品」里挑选；选中的商品会出现在左侧。", "Start from a kit or pick from All products — your selection appears on the left.", "Mit einem Set starten oder aus allen Produkten wählen – Ihre Auswahl erscheint links."],
    kitsIn: ["个套装", "kits", "Sets"], found: ["件商品", "products", "Produkte"],
    tagline: ["场景 → 设计 → 定价 → 寄送 一站式", "Scenario → design → pricing → delivery", "Szenario → Design → Preis → Versand"],
    backToShop: ["返回婚礼商城", "Back to wedding shop", "Zurück zum Hochzeitsshop"],
    whoTitle: ["你是谁？", "Who are you ordering as?", "Als wer bestellen Sie?"],
    whoLead: ["不同身份的定价、数量和寄送方式不一样。选好后，下面会优先推荐适合你的场景；随时可以切换。", "Pricing, quantities and delivery differ by buyer. Scenarios that fit you are shown first — you can switch any time.", "Preise, Mengen und Versand unterscheiden sich je nach Käufer. Passende Szenarien stehen oben – jederzeit änderbar."],
    recommended: ["推荐给你", "Recommended for you", "Für Sie empfohlen"], products: ["件商品", "products", "Produkte"], from: ["起", "from", "ab"],
    useKit: ["用这个套装开始", "Start with this kit", "Mit diesem Set starten"], kitDetail: ["查看套装明细", "Kit details", "Set-Details"],
    search: ["搜索商品", "Search products", "Produkte suchen"], all: ["全部", "All", "Alle"],
    selected: ["已选", "Selected", "Ausgewählt"], openWork: ["进入工作台", "Open workspace", "Zum Arbeitsbereich"],
    cat_apparel: ["服装", "Apparel", "Bekleidung"], cat_headwear: ["帽饰", "Headwear", "Kopfbedeckung"], cat_footwear: ["鞋袜", "Footwear", "Schuhe & Socken"],
    cat_drinkware: ["杯具", "Drinkware", "Trinkgefäße"], cat_bags: ["包袋", "Bags", "Taschen"], cat_tech_accessories: ["数码配件", "Tech & accessories", "Tech & Accessoires"],
    cat_stationery: ["纸品文具", "Stationery", "Papeterie"], cat_wall_art: ["墙面艺术", "Wall art", "Wandkunst"], cat_home_living: ["家居", "Home & living", "Wohnen"],
    cat_corporate_office: ["企业办公", "Corporate & office", "Firma & Büro"], cat_gifts: ["礼品", "Gifts", "Geschenke"], cat_pets: ["宠物", "Pets", "Haustiere"],
    cat_outdoor: ["户外", "Outdoor", "Outdoor"], cat_sports: ["运动", "Sports", "Sport"], cat_seasonal: ["节日", "Seasonal", "Saisonal"], cat_branding_packaging: ["品牌包装", "Branding & packaging", "Branding & Verpackung"],
    t_design: ["设计", "Design", "Design"], t_pricing: ["定价", "Pricing", "Preise"], t_delivery: ["寄送", "Delivery", "Versand"], t_packaging: ["包装", "Packaging", "Verpackung"], t_review: ["确认", "Review", "Übersicht"],
    myLine: ["我的方案", "My selection", "Meine Auswahl"], addProducts: ["+ 添加商品", "+ Add products", "+ Produkte"], backExplore: ["← 场景与商品", "← Scenarios & products", "← Szenarien & Produkte"],
    qty: ["数量", "Qty", "Menge"], perPerson: ["每人", "per person", "pro Person"], perSale: ["按单生产", "on demand", "auf Abruf"], market: ["市场", "Market", "Markt"],
    upload: ["上传设计图", "Upload design", "Design hochladen"], uploadHint: ["PNG / JPG / WebP，建议 3000px+、透明背景", "PNG / JPG / WebP, ideally 3000 px+, transparent", "PNG / JPG / WebP, ideal 3000 px+, transparent"],
    textPh: ["例如：Anna & Ben 2027", "e.g. Anna & Ben 2027", "z. B. Anna & Ben 2027"], useText: ["用文字生成", "Use text", "Text verwenden"],
    serif: ["衬线", "Serif", "Serif"], sans: ["无衬线", "Sans", "Sans"], script: ["手写", "Script", "Schreibschrift"], monogram: ["徽章", "Monogram", "Monogramm"],
    noDesign: ["还没有设计 —— 先上传，或用文字生成", "No design yet — upload or create a text design", "Noch kein Design – hochladen oder Text erstellen"],
    fit: ["适配", "Fit", "Einpassen"], fill: ["铺满", "Fill", "Füllen"], tile: ["平铺", "Pattern", "Muster"], auto: ["自动", "auto", "auto"],
    scale: ["缩放", "Scale", "Größe"], offsetX: ["水平位置", "Horizontal", "Horizontal"], offsetY: ["垂直位置", "Vertical", "Vertikal"], productColor: ["商品颜色", "Colour", "Farbe"],
    resetPl: ["重置摆放", "Reset placement", "Zurücksetzen"], applyAll: ["应用到同类商品", "Apply to similar products", "Auf ähnliche anwenden"],
    dpiGood: ["打印清晰", "Print-ready", "Druckfertig"], dpiWarn: ["分辨率偏低", "Low resolution", "Niedrige Auflösung"], dpiBad: ["分辨率不足", "Too low", "Zu niedrig"],
    download: ["下载效果图", "Download mockup", "Mockup laden"], printArea: ["印刷区域", "Print area", "Druckbereich"], technique: ["工艺", "Technique", "Technik"],
    prodDays: ["生产", "Production", "Produktion"],
    days: ["天", "days", "Tage"],
    sizes: ["尺码", "Sizes", "Größen"], colors: ["颜色", "Colours", "Farben"], production: ["生产地", "Production", "Produktion"], leadTime: ["生产", "production", "Produktion"],
    days: ["天", "days", "Tage"], tiers: ["数量阶梯价", "Quantity pricing", "Staffelpreise"], add: ["加入方案", "Add to selection", "Hinzufügen"], remove: ["从方案移除", "Remove", "Entfernen"], inLine: ["已在方案中", "In selection", "Ausgewählt"],
    marginTitle: ["目标利润率", "Target margin", "Zielmarge"], basePrice: ["出厂价（每单）", "Base price / order", "Basispreis / Bestellung"], retail: ["建议零售价", "Suggested retail", "Empf. Verkaufspreis"],
    ceiling: ["市场价位上限", "Market ceiling", "Marktobergrenze"], profitSale: ["每单利润", "Profit / sale", "Gewinn / Verkauf"], over: ["超出价位", "Above market", "Über Markt"], okC: ["可达", "OK", "OK"],
    autoExclude: ["排除达不到目标利润的商品", "Exclude products that miss the margin", "Produkte unter Zielmarge ausschließen"],
    unitPrice: ["单价", "Unit price", "Stückpreis"], lineTotal: ["小计", "Subtotal", "Zwischensumme"], nextTier: ["再加 {n} 件，单价降到 {p}", "Add {n} more → {p} each", "{n} mehr → {p} pro Stück"],
    fxNote: ["示例价格：生产成本、运费与汇率为演示数据，上线前替换为供应商报价与实时汇率。", "Example prices: costs, shipping rates and FX are demo data — replace with supplier quotes and live rates.", "Beispielpreise: Kosten, Versand und Kurse sind Demodaten – durch echte Angebote und Kurse ersetzen."],
    delMerchant: ["按单代发", "Print-on-demand fulfilment", "Fulfillment auf Abruf"],
    delMerchantLead: ["顾客在你的店铺下单后，我们在离顾客最近的工厂生产，以你的品牌直接寄出。下表是每单寄往各市场的运费参考与送达天数，可用来设置店铺运费。", "When a customer orders in your shop we print at the facility nearest to them and ship under your brand. Use these per-order shipping costs and delivery times to set your shop's shipping rates.", "Bei jeder Bestellung drucken wir nahe beim Kunden und versenden unter Ihrer Marke. Nutzen Sie diese Versandkosten und Lieferzeiten für Ihre Shop-Versandregeln."],
    sample: ["样品单", "Sample order", "Musterbestellung"], sampleLead: ["上线前先给自己寄一套样品，检查颜色和质量。", "Order one of each to check colour and quality before launch.", "Vor dem Start je ein Muster bestellen und Qualität prüfen."],
    sampleTo: ["样品寄往", "Ship samples to", "Muster an"], connectShop: ["连接店铺（Shopify 等）", "Connect your shop (Shopify …)", "Shop verbinden (Shopify …)"],
    connectHint: ["在后台「API / 协议」连接 Shopify 后，商品会同步到店铺，订单自动回传生产。", "Connect Shopify under Admin → API; products sync to your shop and orders flow back to production.", "Shopify unter Admin → API verbinden: Produkte werden synchronisiert, Bestellungen automatisch produziert."],
    bulk: ["一次寄到一个地址", "Ship everything to one address", "Alles an eine Adresse"], bulkHint: ["适合办公室、门店、活动场地：整批生产、按工厂合并成少量包裹。", "For an office, shop or venue: produced as a batch and consolidated per facility.", "Für Büro, Shop oder Location: als Charge produziert, je Werk gebündelt."],
    multi: ["按名单分别寄给每个人", "Ship to each recipient", "An jeden Empfänger"], multiHint: ["适合员工礼包、远程团队、客户礼品：每人一个包裹，可分别选尺码。", "For employee packs, remote teams, client gifts: one parcel per person, sizes per person.", "Für Mitarbeiterpakete, Remote-Teams, Kundengeschenke: ein Paket pro Person, Größen je Person."],
    deliverTo: ["收货国家", "Delivery country", "Lieferland"], deadline: ["最晚送达日期", "Needed by", "Benötigt bis"], eventDate: ["活动日期", "Event date", "Eventdatum"],
    earliest: ["最早送达", "Earliest delivery", "Frühestens geliefert"], latestOrder: ["最晚下单日", "Order by", "Bestellen bis"], onTime: ["可以按时送达", "Arrives in time", "Kommt rechtzeitig"], late: ["来不及：请减少跨境商品或调整日期", "Too late — remove cross-border items or move the date", "Zu spät – grenzüberschreitende Artikel entfernen oder Datum ändern"],
    shipments: ["包裹", "Parcels", "Pakete"], from_: ["发货地", "Ships from", "Versand ab"], weight: ["重量", "Weight", "Gewicht"], shipping: ["运费", "Shipping", "Versand"],
    recipients: ["收件人名单", "Recipient list", "Empfängerliste"], recipientsHint: ["每行一位：姓名, 国家代码, 尺码（尺码可选）。也可以上传 CSV。", "One per line: name, country code, size (size optional). Or upload a CSV.", "Pro Zeile: Name, Ländercode, Größe (optional). Oder CSV hochladen."],
    uploadCsv: ["上传 CSV", "Upload CSV", "CSV hochladen"], csvTemplate: ["下载模板", "Template", "Vorlage"], people: ["人", "people", "Personen"], unsupported: ["暂不支持寄送的国家", "Countries not served yet", "Noch nicht belieferte Länder"],
    perRecipient: ["每人运费", "Shipping / person", "Versand / Person"], sizeMix: ["尺码分布", "Size mix", "Größenverteilung"], sizeSum: ["尺码合计需等于数量", "Size total must equal quantity", "Summe der Größen = Menge"],
    fromCsv: ["来自名单", "from list", "aus Liste"],
    packTitle: ["品牌开箱体验", "Branded unboxing", "Marken-Unboxing"], brandName: ["品牌名称", "Brand name", "Markenname"], thanks: ["感谢卡文字", "Thank-you message", "Dankestext"], perUnit: ["/ 件", "/ unit", "/ Stk."], supported: ["适用", "applies to", "gilt für"],
    whiteLabel: ["白标寄送：包裹上不出现平台信息，只有你的品牌。", "White-label: parcels carry only your brand.", "White Label: Pakete tragen nur Ihre Marke."],
    packChoice: ["包装方式", "Packaging choice", "Verpackungswahl"], packCustom: ["需要品牌包装", "Use branded packaging", "Markenverpackung verwenden"],
    packCustomLead: ["选择感谢卡、贴纸、领标等定制包装。", "Choose inserts, stickers, neck labels and other branded options.", "Dankeskarte, Sticker, Nackenlabel und weitere Markenoptionen wählen."],
    packNone: ["不需要定制包装", "No custom packaging", "Keine individuelle Verpackung"], packNoneLead: ["使用生产商标准白牌包装，不增加品牌包装费用。", "Use the producer's standard white-label packaging with no branded packaging add-ons.", "Standard-White-Label-Verpackung des Produzenten, ohne Marken-Zusätze."],
    packRef: ["包装示例图", "Packaging reference image", "Verpackungs-Referenzbild"], packSelected: ["已选择 {n} 个包装选项", "{n} packaging option(s) selected", "{n} Verpackungsoption(en) gewählt"], packRefLead: ["可选。上传你希望参考的包装、开箱风格或示例照片；确认页也可以补充。", "Optional. Upload a packaging, unboxing or mood reference; you can also add it in Review.", "Optional. Verpackungs-, Unboxing- oder Stilreferenz hochladen; auch in der Übersicht möglich."],
    uploadExample: ["上传示例图", "Upload example", "Beispiel hochladen"], replaceExample: ["更换示例图", "Replace image", "Bild ersetzen"], removeExample: ["删除", "Remove", "Entfernen"], exampleAdded: ["已添加示例图", "Reference image added", "Referenzbild hinzugefügt"],
    flowNeedPackaging: ["请选择一种品牌包装，或选择“不需要定制包装”", "Choose a branded packaging option or select “No custom packaging”", "Markenverpackung wählen oder „Keine individuelle Verpackung“ auswählen"],
    lowContrast: ["设计和商品颜色太接近，印出来看不清", "Design and product colour are too similar to read", "Design und Produktfarbe zu ähnlich"],
    ck_contrast: ["设计与商品颜色对比清晰", "Design stands out on every product colour", "Design auf allen Produktfarben gut sichtbar"],
    reviewTitle: ["确认方案", "Review", "Übersicht"], checks: ["检查清单", "Checklist", "Checkliste"],
    reviewAttention: ["还有 {n} 项需要处理", "{n} item(s) still need attention", "{n} Punkt(e) benötigen noch Aufmerksamkeit"], reviewAttentionLead: ["点击未完成项即可直接去对应步骤，不需要自己寻找。", "Click any unfinished item to jump straight to where it can be fixed.", "Auf einen offenen Punkt klicken, um direkt zur passenden Stelle zu springen."],
    goComplete: ["去完成 →", "Fix now →", "Jetzt beheben →"], reviewCheck: ["检查 →", "Review →", "Prüfen →"], completed: ["已完成", "Done", "Erledigt"],
    ck_design: ["已添加设计", "Design added", "Design vorhanden"], ck_dpi: ["所有商品打印清晰", "All products print-ready", "Alles druckfertig"], ck_margin: ["所有商品达到目标利润", "All products reach the margin", "Alle erreichen die Marge"],
    ck_availability: ["当前市场至少有 1 件商品可生产", "At least one selected product can be produced in this market", "Mindestens ein Produkt ist in diesem Markt produzierbar"], fix_availability: ["当前选择在这个市场没有可生产路线。进入定价页更换市场，或回到商品列表替换商品。", "None of the selected products has a production route in this market. Change market in Pricing or replace a product.", "Für die Auswahl gibt es in diesem Markt keine Produktionsroute. Markt oder Produkt ändern."],
    ck_sizes: ["尺码分配完整", "Sizes complete", "Größen vollständig"], ck_date: ["能在截止日期前送达", "Delivered before the date", "Rechtzeitig geliefert"], ck_date_set: ["已设置活动 / 到货日期", "Delivery / event date set", "Liefer-/Eventdatum festgelegt"], ck_rec: ["收件人名单有效", "Recipient list valid", "Empfängerliste gültig"], ck_packaging: ["包装方式已确认", "Packaging choice confirmed", "Verpackungswahl bestätigt"],
    fix_design: ["先上传设计图，或使用文字生成设计。", "Upload artwork or create a text design first.", "Zuerst Design hochladen oder Textdesign erstellen."],
    fix_dpi_bad: ["{n} 件商品分辨率不足。点击后进入第一件问题商品：上传更高分辨率图片，或缩小图案的印刷尺寸，直到有效 DPI ≥ {min}（建议 ≥ {good}）。", "{n} product(s) are below print resolution. Open the first affected product, upload a higher-resolution file or make the artwork smaller until effective DPI is ≥ {min} (recommended ≥ {good}).", "{n} Produkt(e) haben zu wenig Auflösung. Erstes betroffenes Produkt öffnen, höher aufgelöste Datei verwenden oder Motiv verkleinern, bis effektive DPI ≥ {min} (empfohlen ≥ {good})."],
    fix_dpi_warn: ["{n} 件商品可以生产，但清晰度低于建议值 {good} DPI。建议点击检查并缩小图案或换更高清设计。", "{n} product(s) can print, but are below the recommended {good} DPI. Review them and reduce artwork size or use a higher-resolution file.", "{n} Produkt(e) sind druckbar, liegen aber unter den empfohlenen {good} DPI. Motiv verkleinern oder höher aufgelöste Datei verwenden."],
    fix_contrast: ["{n} 件商品的设计与商品颜色过于接近。点击后更换商品颜色、设计颜色或调整图案。", "The design is too close to the product colour on {n} product(s). Change the product colour, artwork colour or placement.", "Bei {n} Produkt(en) ist der Kontrast zu gering. Produktfarbe, Designfarbe oder Platzierung ändern."],
    fix_margin: ["{n} 件商品未达到当前目标利润。进入定价后降低目标利润、调整商品，或启用自动排除。", "{n} product(s) miss the target margin. Go to Pricing to lower the target, change products or use auto-exclude.", "{n} Produkt(e) erreichen die Zielmarge nicht. Zielmarge senken, Produkte ändern oder automatisch ausschließen."],
    fix_sizes: ["{n} 件有尺码的商品分配数量与订购数量不一致。进入寄送页补齐每个尺码数量。", "Size allocation does not match ordered quantity for {n} product(s). Complete the size mix in Delivery.", "Bei {n} Produkt(en) stimmt die Größenverteilung nicht mit der Bestellmenge überein. Größen im Versand vervollständigen."],
    fix_date: ["当前预计到货晚于你设置的日期。进入寄送页调整日期、收货地或商品方案。", "Estimated delivery is later than your required date. Adjust the date, destination or product selection in Delivery.", "Voraussichtliche Lieferung ist später als benötigt. Datum, Ziel oder Produktauswahl im Versand anpassen."],
    fix_date_set: ["请先设置活动日期或最晚到货日期，系统才能判断是否来得及。", "Set an event or required delivery date so the studio can verify timing.", "Event- oder spätestes Lieferdatum festlegen, damit die Lieferzeit geprüft werden kann."],
    fix_rec: ["收件人名单为空或包含暂不支持的国家。进入寄送页补充 / 修正名单。", "The recipient list is empty or contains unsupported countries. Fix the list in Delivery.", "Empfängerliste ist leer oder enthält nicht unterstützte Länder. Im Versand korrigieren."],
    fix_packaging: ["请选择至少一种品牌包装；如果不需要，请明确选择“不需要定制包装”。", "Select at least one branded packaging option, or explicitly choose “No custom packaging”.", "Mindestens eine Markenverpackung wählen oder ausdrücklich „Keine individuelle Verpackung“ auswählen."],
    downloadAll: ["下载全部效果图", "Download all mockups", "Alle Mockups laden"], save: ["保存方案", "Save plan", "Plan speichern"], exportJson: ["导出方案文件", "Export plan", "Plan exportieren"],
    cta_merchant: ["下样品单并申请开店接入", "Order samples & connect shop", "Muster bestellen & Shop verbinden"], cta_company: ["提交采购询价", "Request a quote", "Angebot anfordern"], cta_individual: ["提交订单询价", "Request order", "Bestellung anfragen"],
    qt_merchant: ["下样品单", "Order samples", "Muster bestellen"], qt_company: ["提交采购询价", "Request a quote", "Angebot anfordern"], qt_individual: ["提交订单询价", "Request your order", "Bestellung anfragen"],
    ql_merchant: ["我们会确认样品单并帮你连接店铺。每个商品寄一件样品，效果确认后开始生产。", "We confirm the sample order and help connect your shop. One sample of each product; production starts after proof approval.", "Wir bestätigen die Musterbestellung und verbinden Ihren Shop. Je ein Muster; Produktion nach Freigabe."],
    ql_company: ["我们会确认价格、发票信息和寄送安排，并把效果确认链接发到你的邮箱。", "We confirm price, invoicing and delivery and e-mail you a proof link.", "Wir bestätigen Preis, Rechnung und Versand und senden einen Freigabelink."],
    ql_individual: ["我们会确认细节，并把效果确认链接发到你的邮箱。确认后才开始生产。", "We confirm the details and e-mail you a proof link. Production starts after your approval.", "Wir bestätigen die Details und senden einen Freigabelink."],
    name: ["姓名", "Name", "Name"], email: ["邮箱", "E-mail", "E-Mail"], company: ["公司 / 品牌", "Company / brand", "Firma / Marke"], vat: ["增值税号（可选）", "VAT ID (optional)", "USt-IdNr. (optional)"], noteLabel: ["备注", "Notes", "Anmerkungen"],
    cancel: ["取消", "Cancel", "Abbrechen"], send: ["提交", "Submit", "Absenden"],
    s_subtotal: ["商品小计（不含运费）", "Subtotal (excl. shipping)", "Zwischensumme (ohne Versand)"], shipAtCheckout: ["结账时计算", "Calculated at checkout", "An der Kasse berechnet"],
    vatNote: ["价格来自统一价目表；运费与增值税按配送国家在结账时计算。", "Prices from our standard price list; shipping and VAT are calculated for your delivery country at checkout.", "Preise laut Standardpreisliste; Versand und MwSt. werden an der Kasse für Ihr Lieferland berechnet."],
    addToCart: ["加入购物车", "Add to cart", "In den Warenkorb"], addingCart: ["正在保存设计…", "Saving your design…", "Design wird gespeichert…"], addedCart: ["已加入购物车：{n} 件商品", "Added to cart: {n} product(s)", "In den Warenkorb gelegt: {n} Produkt(e)"],
    buyLead: ["直接下单：设计会保存到你的账户，付款后我们会发送数字校样。", "Buy directly: your design is saved to your account and we send a digital proof after payment.", "Direkt kaufen: Ihr Design wird im Konto gespeichert, nach der Zahlung erhalten Sie einen digitalen Korrekturabzug."],
    blockedBy: ["还不能加入购物车：{r}", "Can't add to cart yet: {r}", "Noch nicht möglich: {r}"], bulkQuote: ["企业批量询价", "Company / bulk quote", "Firmen-/Mengenangebot"],
    s_profitSet: ["每卖出一套的利润", "Profit per set sold", "Gewinn pro verkauftem Set"], s_total: ["总价（含运费）", "Total incl. delivery", "Gesamt inkl. Versand"],
    products_: ["商品", "Products", "Produkte"], delivery_: ["运费", "Delivery", "Versand"], units: ["件数", "Units", "Stück"], perPersonCost: ["每人成本", "Cost per person", "Kosten pro Person"],
    avgDays: ["送达市场", "Delivery to market", "Lieferung"], marginR: ["实际利润率", "Actual margin", "Ist-Marge"], scenario: ["场景", "Scenario", "Szenario"], kit: ["套装", "Kit", "Set"], custom: ["自选", "Custom", "Individuell"],
    modeServer: ["已连接服务器：方案与询价保存到 Commerce OS 后台，价格由服务端重新计算。", "Connected: plans and requests are saved to Commerce OS; prices are recomputed by the server.", "Verbunden: Pläne und Anfragen werden gespeichert; Preise serverseitig berechnet."],
    modeLocal: ["离线模式（直接打开文件）：方案保存在本浏览器，可导出；提交询价需要启动服务（npm start）。", "Offline (opened from disk): plans stay in this browser and can be exported; requests need the server (npm start).", "Offline: Pläne bleiben im Browser; Anfragen benötigen den Server (npm start)."],
    saved: ["方案已保存", "Plan saved", "Plan gespeichert"], savedLocal: ["方案已保存在本浏览器", "Saved in this browser", "Im Browser gespeichert"], linkCopied: ["分享链接已复制", "Share link copied", "Link kopiert"],
    sent: ["已提交，编号：", "Submitted, reference: ", "Gesendet, Referenz: "], needServer: ["提交需要启动服务（npm start）；离线时请导出方案文件。", "Submitting needs the server (npm start); offline, export the plan.", "Absenden benötigt den Server; offline bitte exportieren."],
    failed: ["操作失败", "Something went wrong", "Fehler"], tooBig: ["图片太大（上限 8MB）", "Image too large (8 MB max)", "Bild zu groß (max. 8 MB)"], loaded: ["已载入方案", "Plan loaded", "Plan geladen"],
    emptySel: ["方案里还没有商品。从场景套装开始，或者自由添加商品。", "No products yet. Start from a kit or add products.", "Noch keine Produkte. Mit einem Set starten oder Produkte hinzufügen."],
    added: ["已加入方案", "Added", "Hinzugefügt"], removed: ["已移除", "Removed", "Entfernt"], neckPreview: ["领标", "Neck label", "Nackenlabel"], thankYou: ["谢谢你的支持", "Thank you for your support", "Danke für Ihre Unterstützung"],
    note_: ["提示", "Note", "Hinweis"], noRoute: ["该地区暂不支持", "not served", "nicht verfügbar"], cross: ["跨境", "cross-border", "grenzüberschreitend"], local: ["本地", "local", "lokal"]
  };
  const L = { zh: 0, en: 1, de: 2 };
  const t = (k, vars) => { let s = I[k] ? I[k][L[lang]] || I[k][0] : k; if (vars) for (const [a, b] of Object.entries(vars)) s = s.replace(`{${a}}`, b); return s; };
  const nm = o => (o ? o[lang] || o.zh || o.en : "");
  const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const $ = s => document.querySelector(s);
  const prod = id => D.products.find(p => p.id === id);
  const market = () => D.markets.find(m => m.id === S.market);
  const money = (v, cur = market().currency) => { try { return new Intl.NumberFormat(lang === "zh" ? "zh-CN" : lang === "de" ? "de-CH" : "en-GB", { style: "currency", currency: cur, maximumFractionDigits: 2 }).format(v); } catch { return `${cur} ${Number(v).toFixed(2)}`; } };
  const toast = msg => { const e = $("#toast"); e.textContent = msg; e.classList.add("show"); clearTimeout(toast.t); toast.t = setTimeout(() => e.classList.remove("show"), 2600); };
  const COUNTRIES = ["CH", "LI", "DE", "AT", "FR", "IT", "NL", "BE", "LU", "ES", "PT", "IE", "DK", "SE", "FI", "PL", "CZ", "US"];
  const countryName = c => { try { return new Intl.DisplayNames([lang === "zh" ? "zh" : lang], { type: "region" }).of(c); } catch { return c; } };

  // ------------------------------------------------------------------ state
  const TABS = ["design", "pricing", "delivery", "packaging", "review"];
  const S = { pendingMat: {}, view: "scenes", buyer: "individual", othersOpen: false, scenario: null, kit: null, items: [], tab: "design", focus: null, cat: "all", search: "",
    market: (window.PODMarket ? PODMarket.get() : "CH"), margin: 0.4, autoExclude: true, ship: { mode: "bulk", address_country: "CH", deadline: "", sample_country: "CH", recipients: [], recipients_text: "" },
    packaging: ["insert_card", "sticker"], packagingMode: "custom", packagingRef: null, brand: { name: "", message: "" }, stores: [], publishStore: "", platform: "shopify", browse: "gifts", sub: "kits", openKit: null, design: null, textDesign: { text: "Anna & Ben", style: "serif", color: "#28231f" }, projectId: null, submittedRef: null, submission: null };
  const buyerDef = () => D.buyer_types.find(b => b.id === S.buyer);
  const newItem = pid => ({ product_id: pid, qty: buyerDef().default_qty, per_person: 1, include: true, sizes: {}, material_id: S.pendingMat[pid] || null, placement: { mode: null, scale: 1, dx: 0, dy: 0, color: null } });
  const inSel = pid => S.items.some(i => i.product_id === pid);
  const active = () => S.items.filter(i => i.include);
  /** Quantity actually produced: merchant = 1 sample each (on demand afterwards); multi = recipients × per person. */
  const effQty = i => S.buyer === "merchant" ? 1 : S.ship.mode === "multi" ? Math.max(1, S.ship.recipients.filter(r => P.regionOf(D, r.country)).length) * (i.per_person || 1) : i.qty;
  /** Consumers (individual / company) buy at the admin price list (sell price); merchants see base cost + their own margin. */
  const consumer = () => S.buyer !== "merchant";
  const qopts = () => consumer() ? {} : { packaging: S.packaging, list: false };
  const unitOf = l => consumer() ? l.price : l.unit_cost, lineOf = l => consumer() ? l.line_revenue : l.line_cost, totalOf = q => consumer() ? q.totals.revenue : q.totals.cost;
  /** Direct purchase (Add to cart) for consumers; multi-recipient company orders and merchant samples keep the request flow. */
  const buyDirect = () => consumer() && S.ship.mode !== "multi";
  /** Packaging add-ons for consumers: per-unit prices from the admin "Fees & tax" settings (/api/storefront/fees), same rule as the
   * checkout quote (selected ids ∩ product-supported ids, × units). CHF market → CHF prices; other markets → EUR prices (×fx for USD display). */
  let FEES = null;
  const packQ = items => P.packagingAddon(D, consumer() ? FEES : null, { market: S.market, packaging: S.packaging, mode: S.packagingMode, items: items.map(i => ({ product_id: i.product_id, qty: effQty(i) })) });
  const packagingTotal = items => packQ(items).total;
  const packPriceLabel = o => { if (consumer() && FEES) { const v = packQ([]).price(o.id); return v > 0 ? `+${money(v)}` : `+${money(0)}`; } return `€${o.cost_eur.toFixed(2)}`; };
  const quoteAll = () => P.quote(D, { market: S.market, margin: S.margin, ...qopts(), items: active().map(i => ({ product_id: i.product_id, qty: effQty(i), material_id: i.material_id })) });
  const finalItems = () => { if (S.buyer !== "merchant" || !S.autoExclude) return active(); const bad = new Set(quoteAll().totals.unreachable); return active().filter(i => !bad.has(i.product_id)); };
  const quoteFinal = () => P.quote(D, { market: S.market, margin: S.margin, ...qopts(), items: finalItems().map(i => ({ product_id: i.product_id, qty: effQty(i), material_id: i.material_id })) });
  const delivery = () => {
    const items = finalItems().map(i => ({ product_id: i.product_id, qty: effQty(i) }));
    const mode = S.buyer === "merchant" ? "dropship" : S.ship.mode;
    return P.fulfillment(D, { mode, market: S.market, items, address_country: S.ship.address_country, sample_country: S.ship.sample_country, recipients: S.ship.recipients,
      per_person: Object.fromEntries(finalItems().map(i => [i.product_id, i.per_person || 1])) });
  };
  function setBuyer(b) {
    S.submittedRef = null; S.submission = null;
    S.buyer = b;
    S.ship.mode = b === "merchant" ? "dropship" : b === "company" ? (S.ship.mode === "multi" ? "multi" : "bulk") : "bulk";
    if (b !== "merchant") S.items.forEach(i => { if (i.qty < 1) i.qty = buyerDef().default_qty; });
  }
  function useKit(scId, kitId) {
    S.submittedRef = null; S.submission = null;
    const sc = D.scenarios.find(s => s.id === scId), kit = sc.kits.find(k => k.id === kitId);
    S.scenario = scId; S.kit = kitId;
    const keep = Object.fromEntries(S.items.map(i => [i.product_id, i]));
    S.items = kit.items.map(pid => keep[pid] || { ...newItem(pid), qty: S.buyer === "merchant" ? 1 : kit.default_qty });
    S.focus = S.items[0]?.product_id; S.view = "work"; S.tab = "design";
  }
  function mergeKit(scId, kitId) {
    S.submittedRef = null; S.submission = null;
    const kit = D.scenarios.find(s => s.id === scId).kits.find(k => k.id === kitId);
    kit.items.forEach(pid => { if (!inSel(pid)) S.items.push({ ...newItem(pid), qty: S.buyer === "merchant" ? 1 : kit.default_qty }); });
    if (!S.scenario) S.scenario = scId; if (!S.kit) S.kit = kitId; else if (S.kit !== kitId) S.kit = null;
    if (!S.focus) S.focus = S.items[0]?.product_id; toast(t("merged"));
  }
  const scenarioScore = sc => { const b = D.scenario_buyers[sc.id] || []; return b[0] === S.buyer ? 2 : b.includes(S.buyer) ? 1 : 0; };
  const orderedScenarios = () => [...D.scenarios].sort((a, b) => scenarioScore(b) - scenarioScore(a));
  function toggleProduct(pid) {
    S.submittedRef = null; S.submission = null;
    if (inSel(pid)) { S.items = S.items.filter(i => i.product_id !== pid); toast(t("removed")); }
    else { S.items.push(newItem(pid)); S.kit = null; toast(t("added")); }
    if (!S.focus || !inSel(S.focus)) S.focus = S.items[0]?.product_id || null;
  }

  // ------------------------------------------------------------------ design
  function textDesignCanvas() {
    const { text, style, color } = S.textDesign, c = document.createElement("canvas"); c.width = c.height = 1600;
    const x = c.getContext("2d"); x.fillStyle = color; x.strokeStyle = color; x.textAlign = "center"; x.textBaseline = "middle";
    const lines = String(text || "").split(/\n/).slice(0, 4).filter(Boolean);
    if (style === "monogram") {
      x.lineWidth = 26; x.beginPath(); x.arc(800, 800, 640, 0, Math.PI * 2); x.stroke(); x.lineWidth = 8; x.beginPath(); x.arc(800, 800, 590, 0, Math.PI * 2); x.stroke();
      const words = lines.join(" ").split(/[\s&+]+/).filter(Boolean), initials = words.map(w => w[0]).join("").slice(0, 3).toUpperCase() || "A";
      x.font = "italic 520px Georgia, serif"; x.fillText(initials, 800, 820);
    } else {
      const fontFor = s => style === "sans" ? `800 ${s}px Inter, Arial, sans-serif` : style === "script" ? `${s}px 'Brush Script MT','Segoe Script','Snell Roundhand',cursive` : `italic ${s}px Georgia, 'Times New Roman', serif`;
      let size = 360; do { x.font = fontFor(size); size -= 10; } while (size > 60 && lines.some(l => x.measureText(l).width > 1440));
      const lh = size * 1.25, y0 = 800 - (lines.length - 1) * lh / 2; lines.forEach((l, i) => x.fillText(l, 800, y0 + i * lh));
    }
    return c;
  }
  
  /** Save current design to library */
  
  /** Parse CSV guest list for batch personalization */
  
  /** Validate design resolution for print */
  
  /** Calculate postage based on envelope size and destination */
  
  /** Compare screen color vs expected print color */
  
  /** Generate order timeline */
  
  /** Check contrast ratio between design and background */
  
  /** Font recommendations by event type */
  
  /** Track user actions for analytics */
  
  /** Simple cache for API responses */
  
  /** Keyboard shortcuts */
  
  /** Auto-save current state */
  let autoSaveTimer = null;
  function scheduleAutoSave(state) {
    clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(() => {
      localStorage.setItem("pod-autosave", JSON.stringify({ state, ts: Date.now() }));
      trackEvent("autosave");
    }, 2000);
  }
  /** Recover session from auto-save */
  function recoverSession() {
    const saved = localStorage.getItem("pod-autosave");
    if (!saved) return null;
    const { state, ts } = JSON.parse(saved);
    const age = Date.now() - ts;
    if (age > 86400000) return null; // expire after 24h
    return { state, age: Math.round(age / 60000) + " min ago" };
  }
  /** Clear auto-save */
  function clearAutoSave() {
    localStorage.removeItem("pod-autosave");
  }

  const SHORTCUTS = {
    "ctrl+z": () => undo(),
    "ctrl+y": () => redo(),
    "ctrl+s": () => saveDesign("autosave"),
    "ctrl+d": () => trackEvent("duplicate"),
    "escape": () => trackEvent("cancel")
  };
  function handleShortcut(e) {
    const key = (e.ctrlKey || e.metaKey ? "ctrl+" : "") + e.key.toLowerCase();
    if (SHORTCUTS[key]) { e.preventDefault(); SHORTCUTS[key](); return true; }
    return false;
  }
  /** Touch gesture detection */
  let touchStart = null;
  function handleTouchStart(e) { touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() }; }
  function handleTouchEnd(e) {
    if (!touchStart) return null;
    const dx = e.changedTouches[0].clientX - touchStart.x;
    const dy = e.changedTouches[0].clientY - touchStart.y;
    const dt = Date.now() - touchStart.t;
    touchStart = null;
    if (Math.abs(dx) > 50 && dt < 300) return dx > 0 ? "swipe-right" : "swipe-left";
    if (Math.abs(dy) > 50 && dt < 300) return dy > 0 ? "swipe-down" : "swipe-up";
    return null;
  }

  const cache = new Map();
  function cached(key, fn, ttl = 60000) {
    const hit = cache.get(key);
    if (hit && Date.now() - hit.ts < ttl) return hit.data;
    const data = fn();
    cache.set(key, { data, ts: Date.now() });
    return data;
  }
  /** Undo/redo stack for design changes */
  const history = { stack: [], index: -1, max: 20 };
  function pushHistory(state) {
    history.stack = history.stack.slice(0, history.index + 1);
    history.stack.push(JSON.stringify(state));
    if (history.stack.length > history.max) history.stack.shift();
    history.index = history.stack.length - 1;
  }
  function undo() {
    if (history.index <= 0) return null;
    history.index--;
    return JSON.parse(history.stack[history.index]);
  }
  function redo() {
    if (history.index >= history.stack.length - 1) return null;
    history.index++;
    return JSON.parse(history.stack[history.index]);
  }

  function trackEvent(action, data = {}) {
    const event = { action, ...data, ts: Date.now(), page: "studio" };
    if (typeof gtag === "function") gtag("event", action, data);
    console.log("[track]", action, data);
    return event;
  }
  /** Safe wrapper for async operations */
  async function safeAsync(fn, fallback = null) {
    try { return await fn(); }
    catch (e) { console.error("[error]", e.message); trackEvent("error", { msg: e.message }); return fallback; }
  }
  /** Validate order before submission */
  function validateOrder(order) {
    const errors = [];
    if (!order.items?.length) errors.push("No items");
    if (!order.design) errors.push("No design");
    order.items?.forEach((item, i) => {
      const v = validateDesign(order.design, item.printArea || [100, 100]);
      if (v.level === "bad") errors.push(`Item ${i+1}: low resolution`);
    });
    return { ok: errors.length === 0, errors };
  }

  const FONT_PAIRS = {
    wedding: [
      { heading: "Playfair Display", body: "Lato", style: "classic" },
      { heading: "Great Vibes", body: "Montserrat", style: "romantic" },
      { heading: "Cinzel", body: "Raleway", style: "elegant" }
    ],
    corporate: [
      { heading: "Roboto", body: "Open Sans", style: "modern" },
      { heading: "Montserrat", body: "Source Sans", style: "professional" }
    ],
    party: [
      { heading: "Pacifico", body: "Nunito", style: "fun" },
      { heading: "Bebas Neue", body: "Poppins", style: "bold" }
    ]
  };
  function recommendFonts(eventType = "wedding") {
    return FONT_PAIRS[eventType] || FONT_PAIRS.wedding;
  }
  /** Design template suggestions */
  function designTemplates(category) {
    const templates = {
      stationery: ["minimal", "floral", "geometric", "vintage"],
      apparel: ["centered", "left-chest", "full-front", "back"],
      gifts: ["photo", "monogram", "pattern", "text-only"]
    };
    return templates[category] || templates.stationery;
  }

  function contrastRatio(fg, bg) {
    const lum = hex => {
      const rgb = [1,3,5].map(i => parseInt(hex.slice(i,i+2), 16) / 255);
      const [r,g,b] = rgb.map(c => c <= 0.03928 ? c/12.92 : Math.pow((c+0.055)/1.055, 2.4));
      return 0.2126*r + 0.7152*g + 0.0722*b;
    };
    const l1 = lum(fg), l2 = lum(bg);
    return (Math.max(l1,l2) + 0.05) / (Math.min(l1,l2) + 0.05);
  }
  /** Get export options for design */
  function exportOptions(design) {
    return [
      { format: "png", dpi: 300, label: "PNG 300dpi" },
      { format: "pdf", dpi: 300, label: "PDF Print" },
      { format: "jpg", dpi: 150, label: "JPG Web" }
    ];
  }

  function orderTimeline(orderDate, prodDays = 3, shipDays = 3) {
    const d = new Date(orderDate);
    const stages = [
      { name: "ordered", days: 0 },
      { name: "production", days: 1 },
      { name: "shipped", days: prodDays },
      { name: "delivered", days: prodDays + shipDays }
    ];
    return stages.map(s => {
      const date = new Date(d);
      date.setDate(date.getDate() + s.days);
      return { ...s, date: date.toISOString().slice(0, 10) };
    });
  }
  /** Calculate batch pricing with volume discount */
  function batchPrice(unitPrice, qty) {
    let discount = 0;
    if (qty >= 100) discount = 0.15;
    else if (qty >= 50) discount = 0.12;
    else if (qty >= 25) discount = 0.08;
    else if (qty >= 10) discount = 0.04;
    return { unit: unitPrice * (1 - discount), total: unitPrice * qty * (1 - discount), discount, qty };
  }

  function colorShift(hex) {
    const r = parseInt(hex.slice(1,3), 16), g = parseInt(hex.slice(3,5), 16), b = parseInt(hex.slice(5,7), 16);
    const nr = Math.round(r * 0.95), ng = Math.round(g * 0.97), nb = Math.round(b * 0.92);
    return { screen: hex, print: `#${nr.toString(16).padStart(2,'0')}${ng.toString(16).padStart(2,'0')}${nb.toString(16).padStart(2,'0')}`, shift: Math.abs(r-nr) + Math.abs(g-ng) + Math.abs(b-nb) };
  }
  /** Calculate overall quality score */
  function qualityScore(design, printAreaMm) {
    const v = validateDesign(design, printAreaMm);
    let score = 100;
    if (v.level === "warn") score -= 20;
    if (v.level === "bad") score -= 50;
    if (!design?.transparent && design?.width < 1000) score -= 10;
    return { score: Math.max(0, score), level: score >= 80 ? "good" : score >= 50 ? "ok" : "poor" };
  }

  function calcPostage(envelopeSize, dest = "CH", qty = 1) {
    const rates = {
      CH: { C6: 1.10, C5: 1.40, C4: 2.20, custom: 2.50 },
      EU: { C6: 2.20, C5: 2.80, C4: 4.50, custom: 5.00 },
      US: { C6: 3.50, C5: 4.50, C4: 7.00, custom: 8.00 }
    };
    const rate = rates[dest]?.[envelopeSize] || rates.CH.C5;
    return { unit: rate, total: rate * qty, currency: dest === "CH" ? "CHF" : dest === "EU" ? "EUR" : "USD" };
  }
  /** Get bleed area (3mm standard) */
  function getBleedArea(printAreaMm, bleedMm = 3) {
    const [w, h] = printAreaMm;
    return { 
      safe: [w - bleedMm * 2, h - bleedMm * 2],
      trim: [w, h],
      bleed: [w + bleedMm * 2, h + bleedMm * 2]
    };
  }

  function validateDesign(design, printAreaMm) {
    if (!design) return { ok: false, msg: "No design" };
    const [w, h] = printAreaMm;
    const dpiW = design.width / (w / 25.4);
    const dpiH = design.height / (h / 25.4);
    const dpi = Math.min(dpiW, dpiH);
    if (dpi >= 300) return { ok: true, dpi: Math.round(dpi), level: "good" };
    if (dpi >= 150) return { ok: true, dpi: Math.round(dpi), level: "warn" };
    return { ok: false, dpi: Math.round(dpi), level: "bad", msg: "Resolution too low" };
  }
  /** Calculate latest order date */
  function calcDeadline(eventDate, prodDays = 3, shipDays = 3) {
    const d = new Date(eventDate);
    d.setDate(d.getDate() - prodDays - shipDays - 2);
    return d.toISOString().slice(0, 10);
  }

  function parseGuestCSV(text) {
    const lines = text.trim().split("\n");
    const headers = lines[0].split(",").map(h => h.trim().toLowerCase());
    return lines.slice(1).map(line => {
      const vals = line.split(",").map(v => v.trim());
      const guest = {};
      headers.forEach((h, i) => guest[h] = vals[i] || "");
      return guest;
    }).filter(g => g.name || g.email);
  }

  function saveDesign(name) {
    const designs = JSON.parse(localStorage.getItem("pod-designs") || "[]");
    designs.unshift({ id: Date.now(), name: name || "Design", data: designDataUrl(), ts: new Date().toISOString() });
    localStorage.setItem("pod-designs", JSON.stringify(designs.slice(0, 20)));
    return designs[0];
  }
  /** Load design from library */
  function loadDesign(id) {
    const designs = JSON.parse(localStorage.getItem("pod-designs") || "[]");
    return designs.find(d => d.id === id);
  }
  /** List saved designs */
  function listDesigns() {
    return JSON.parse(localStorage.getItem("pod-designs") || "[]");
  }

  function matchEnvelope(cardMm) {
    const [w, h] = cardMm;
    const max = Math.max(w, h), min = Math.min(w, h);
    if (max <= 148 && min <= 105) return "C6";
    if (max <= 210 && min <= 148) return "C5";
    if (max <= 297 && min <= 210) return "C4";
    return "custom";
  }
  function hasTransparency(c) {
    const k = Math.min(1, 200 / Math.max(c.width, c.height)), tc = document.createElement("canvas"); tc.width = Math.max(1, Math.round(c.width * k)); tc.height = Math.max(1, Math.round(c.height * k));
    const x = tc.getContext("2d"); x.drawImage(c, 0, 0, tc.width, tc.height); const a = x.getImageData(0, 0, tc.width, tc.height).data;
    for (let i = 3; i < a.length; i += 4) if (a[i] < 200) return true; return false;
  }
  function setDesignFromImage(img, name, source = "upload") {
    const k = Math.min(1, 4000 / Math.max(img.naturalWidth, img.naturalHeight)), c = document.createElement("canvas");
    c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k); c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    S.design = { canvas: c, width: img.naturalWidth, height: img.naturalHeight, name, source, transparent: source === "text" || hasTransparency(c) };
  }
  function loadFile(file) {
    S.submittedRef = null; S.submission = null;
    if (!file || !/^image\/(png|jpeg|webp)$/.test(file.type)) return;
    if (file.size > 8 * 1024 * 1024) return toast(t("tooBig"));
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => { setDesignFromImage(img, file.name); URL.revokeObjectURL(url); render(); saveDraft(); };
    img.src = url;
  }
  function loadPackagingReference(file) {
    S.submittedRef = null; S.submission = null;
    if (!file || !/^image\/(png|jpeg|webp)$/.test(file.type)) return;
    if (file.size > 8 * 1024 * 1024) return toast(t("tooBig"));
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      const max = 1200, k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight)), c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(img.naturalWidth * k)); c.height = Math.max(1, Math.round(img.naturalHeight * k)); c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      S.packagingRef = { name: file.name.slice(0, 120), data_url: c.toDataURL("image/jpeg", 0.82) };
      S.packagingMode = "custom"; URL.revokeObjectURL(url); rerender(); toast(t("exampleAdded"));
    };
    img.src = url;
  }
  function designDataUrl(maxSide = 2400) {
    const c = S.design?.canvas; if (!c) return null;
    const k = Math.min(1, maxSide / Math.max(c.width, c.height)), o = document.createElement("canvas");
    o.width = Math.round(c.width * k); o.height = Math.round(c.height * k); o.getContext("2d").drawImage(c, 0, 0, o.width, o.height);
    let u = o.toDataURL("image/png"); if (u.length > 10_000_000) u = o.toDataURL("image/jpeg", 0.9); return u;
  }
  const lum = hex => { const n = parseInt(String(hex).slice(1), 16); const [r, g, b] = [n >> 16 & 255, n >> 8 & 255, n & 255].map(v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }); return .2126 * r + .7152 * g + .0722 * b; };
  function designLum() {
    if (!S.design) return null; if (S.design._lum !== undefined) return S.design._lum;
    const c = S.design.canvas, k = Math.min(1, 120 / Math.max(c.width, c.height)), t = document.createElement("canvas"); t.width = Math.max(1, Math.round(c.width * k)); t.height = Math.max(1, Math.round(c.height * k));
    const x = t.getContext("2d"); x.drawImage(c, 0, 0, t.width, t.height); const a = x.getImageData(0, 0, t.width, t.height).data; let sum = 0, n = 0;
    for (let i = 0; i < a.length; i += 4) if (a[i + 3] > 128) { const h = "#" + [a[i], a[i + 1], a[i + 2]].map(v => v.toString(16).padStart(2, "0")).join(""); sum += lum(h); n++; }
    return (S.design._lum = n ? sum / n : null);
  }
  /** Contrast ratio between the design and the product colour (WCAG formula); < 1.6 is hard to see when printed. */
  function lowContrast(i) {
    const p = prod(i.product_id), dl = designLum(); if (dl === null || !S.design?.transparent || !p.colors) return false;
    const pl = lum(i.placement.color || p.colors[0]), hi = Math.max(dl, pl), lo = Math.min(dl, pl);
    return (hi + .05) / (lo + .05) < 1.6;
  }
  const matsOf = pid => prod(pid).materials || [];
  const matOf = i => { const m = matsOf(i.product_id); return m.find(x => x.id === i.material_id) || m[0] || null; };
  function matChips(pid, current, attr) {
    const m = matsOf(pid); if (!m.length) return "";
    const base = m[0].delta_eur;
    return `<div><div class="note">${t("material")} · ${t("materialHint")}</div><div class="mats">${m.map(x => { const d = x.delta_eur - base, fx = market().fx_from_eur;
      return `<button ${attr}="${pid}:${x.id}" class="${(current || m[0].id) === x.id ? "active" : ""}">${esc(nm(x.name))}${d ? `<small>${d > 0 ? "+" : "−"}${money(Math.abs(d) * fx)}</small>` : ""}</button>`; }).join("")}</div></div>`;
  }
  const effMode = i => { const p = prod(i.product_id); if (i.placement?.mode) return i.placement.mode; return S.design?.source === "upload" ? "contain" : p.default_mode; };
  const effPl = i => ({ ...(i.placement || {}), mode: effMode(i) });
  function dpiInfo(i) {
    if (!S.design) return null;
    const dpi = P.effectiveDpi(S.design.width, S.design.height, prod(i.product_id).print_area_mm, effMode(i), i.placement.scale);
    const level = dpi >= D.dpi.good ? "ok" : dpi >= D.dpi.min ? "warn" : "bad";
    return { dpi, level, label: t(level === "ok" ? "dpiGood" : level === "warn" ? "dpiWarn" : "dpiBad") };
  }
  const draw = (cv, pid, opts = {}) => { const i = S.items.find(x => x.product_id === pid) || newItem(pid); M.render(cv, prod(pid), effPl(i), opts.noDesign ? null : S.design, { ...opts, onPhotoLoad: () => draw(cv, pid, opts) }); };
  function drawAll() {
    document.querySelectorAll("canvas[data-p]").forEach(cv => draw(cv, cv.dataset.p, { size: Number(cv.dataset.size) || undefined, showArea: cv.dataset.area === "1", noDesign: cv.dataset.nod === "1", clean: cv.dataset.clean === "1" }));
  }

  // ------------------------------------------------------------------ explore view
  // ------------------------------------------------------------------ one page: rail · centre (scenes | studio) · summary
  const thumb = (pid, extra = "") => `<canvas data-p="${pid}" data-size="200" data-nod="1" data-clean="1" ${extra}></canvas>`;   // browsing: clean product shots
  function kitPrice(sc, k) {
    const items = k.items.map(pid => ({ product_id: pid, qty: S.buyer === "merchant" ? 1 : k.default_qty }));
    const q = P.quote(D, { market: S.market, margin: S.margin, ...qopts(), items });
    if (S.buyer === "merchant") { const profit = q.lines.reduce((a, l) => a + l.unit_profit, 0), retail = q.lines.reduce((a, l) => a + l.price, 0);
      return `<span class="chip ok">${t("profitPerSet")} ${money(profit)}</span><span class="chip gray">${t("retailSet")} ${money(retail)}</span>`; }
    const perSet = q.lines.reduce((a, l) => a + unitOf(l), 0);
    return `<span class="chip">${money(perSet)} ${t("perSet")}</span><span class="chip gray">${t("qty")} ${k.default_qty} · ${money(totalOf(q))}</span>`;
  }
  const NAV = [["scenes", "▦"], ["all", "◫"], ["work", "✎"]];
  /** Centre · scenario kits: every scenario as a card; clicking one shows its kits in the right column. */
  // Wedding first: the wedding kit ("gifts" scenario) is the default; other kits (corporate, creator, niche …) sit in a collapsed selector.
  const WEDDING_SCENARIO = "gifts";
  /** Product notes are stored in Chinese in the catalog; show them through the shared i18n dictionary. */
  function noteT(n) { if (!n) return n; const x = window.WeddingI18n?.t ? window.WeddingI18n.t(n) : n; if (lang === "zh") return n; return /[\u3400-\u9fff]/.test(x) ? "" : x; }
  function sceneCard(sc) {
    const pids = [...new Set(sc.kits.flatMap(k => k.items))].slice(0, 4);
    const cover = sc.scene_image ? `<div class="cover" style="background-image:url('${esc(sc.scene_image.src)}')"></div>` : `<div class="collage">${pids.map(pid => thumb(pid)).join("")}</div>`;
    return `<button class="scene-card2 ${S.browse === sc.id ? "active" : ""}" data-browse="${sc.id}" aria-pressed="${S.browse === sc.id}">${cover}
        <div class="scene-meta"><div class="spread"><b>${esc(nm(sc.name))}</b>${sc.id === WEDDING_SCENARIO ? `<span class="chip ok">♥ ${t("weddingDefault")}</span>` : scenarioScore(sc) ? `<span class="chip ok">★ ${t("recommended")}</span>` : ""}</div><small>${esc(nm(sc.audience))}</small>
        <span class="row" style="gap:5px;margin-top:8px">${sc.kits.map(k => `<span class="chip gray">${esc(nm(k.name))}</span>`).join("")}</span></div></button>`;
  }
  function vScenes() {
    const list = orderedScenarios();
    // Show all top-level scenarios (6 main categories)
    const topLevel = ["gifts", "corporate", "creator", "community", "art", "seasonal"];
    const main = topLevel.map(id => list.find(x => x.id === id)).filter(Boolean);
    const others = list.filter(x => !topLevel.includes(x.id));
    if (!S.browse || !list.some(x => x.id === S.browse)) S.browse = main[0]?.id || list[0]?.id;
    const open = S.othersOpen;
    return `<div class="scene-grid">${main.map(sceneCard).join("")}</div>
      ${others.length ? `<div class="other-kits ${open ? "open" : ""}"><button class="btn ghost other-kits-toggle" data-others="1" aria-expanded="${open}">${open ? "▾" : "▸"} More kits <span class="note">(${others.length})</span></button>
      <div id="otherKits" ${open ? "" : "hidden"}><div class="scene-grid">${others.map(sceneCard).join("")}</div></div></div>` : ""}`;
  }
  /** Centre · all products. */
  function vAll() {
    const ordered = D.category_order || [...new Set(D.products.map(p => p.category))];
    const cats = ["all", ...ordered.filter(c => D.products.some(p => p.category === c))], q = S.search.trim().toLowerCase();
    const items = D.products.filter(p => (S.cat === "all" || p.category === S.cat) && (!q || [p.name.zh, p.name.en, p.name.de, p.technique, ...(p.eco_tags || [])].join(" ").toLowerCase().includes(q)));
    return `<div class="cats" style="margin-bottom:12px">${cats.map(c => `<button data-cat="${c}" class="${S.cat === c ? "active" : ""}">${c === "all" ? t("all") : t("cat_" + c)}</button>`).join("")}</div>
      <div class="pgrid">${items.map(p => { const l = P.quote(D, { market: S.market, items: [{ product_id: p.id, qty: 1 }] }).lines[0], eco=(p.eco_tags||[])[0];
        return `<div class="ptile" data-detail="${p.id}">${thumb(p.id)}<b>${esc(nm(p.name))}</b><small>${t("from")} ${money(unitOf(l))} · ${esc(p.technique)}${eco ? ` · ♻ ${esc(eco)}` : ""}</small>
        <button class="add ${inSel(p.id) ? "in" : ""}" data-toggle="${p.id}" aria-label="${t(inSel(p.id) ? "remove" : "add")}">${inSel(p.id) ? "✓" : "+"}</button></div>`; }).join("") || `<div class="empty">—</div>`}</div>`;
  }
  /** Right column · kits of the clicked scenario (compact: name, count, price, product list, details, big add button). */
  function vKitsPanel() {
    const sc = D.scenarios.find(x => x.id === S.browse) || orderedScenarios()[0];
    const kits = sc.kits.map(k => { const open = S.openKit === k.id, inAll = k.items.every(inSel);
      const lines = P.quote(D, { market: S.market, margin: S.margin, items: k.items.map(pid => ({ product_id: pid, qty: S.buyer === "merchant" ? 1 : k.default_qty })) }).lines;
      return `<article class="kit3 ${S.kit === k.id ? "current" : ""}"><h3>${esc(nm(k.name))}</h3><div class="note">${k.items.length} ${t("products")}</div>
        <div class="row" style="gap:6px;margin:8px 0 10px">${kitPrice(sc, k)}</div>
        <ul class="kit3-list">${lines.map(l => { const p = prod(l.product_id); return `<li data-detail="${p.id}"><canvas data-p="${p.id}" data-size="80" data-nod="1" data-clean="1"></canvas><span>${esc(nm(p.name))}${p.note ? ` <span title="${esc(noteT(p.note))}">⚠</span>` : ""}</span>${inSel(p.id) ? `<i class="tick">✓</i>` : ""}
          ${open ? `<small>${esc(p.technique)} · ${p.print_area_mm[0]}×${p.print_area_mm[1]} mm · ${esc(l.facility_city)} ${l.days} ${t("days")} · ${money(S.buyer === "merchant" ? l.price : unitOf(l))}</small>` : ""}</li>`; }).join("")}</ul>
        <div class="spread" style="margin-top:10px"><button class="btn sm ghost" data-openkit="${k.id}">${open ? t("hide") + " ▴" : t("details") + " ▾"}</button></div>
        <button class="btn big ${inAll ? "added" : "dark"}" data-merge="${sc.id}:${k.id}" ${inAll ? "disabled" : ""}>${inAll ? "✓ " + t("kitAdded") : t("addToSel")}</button></article>`; }).join("");
    return `<div class="panel kits-panel" id="kitsPanel"><div class="eyebrow">${t("nav_scenes")}</div><h2 style="margin:4px 0 2px">${esc(nm(sc.name))}</h2><p class="note" style="margin:0 0 12px">${esc(nm(sc.audience))}</p>${kits}${vFlowAction()}</div>`;
  }
  function vRail() {
    const sc = D.scenarios.find(s => s.id === S.scenario), kit = sc?.kits.find(k => k.id === S.kit), n = S.items.length;
    const nav = `<nav class="sidenav" aria-label="studio">${NAV.map(([v, ic]) => `<button data-view="${v}" class="${S.view === v ? "active" : ""}" aria-current="${S.view === v}"><i>${ic}</i><span>${t("nav_" + v)}</span>${v === "all" ? `<em>${D.products.length}</em>` : v === "work" && n ? `<em class="hot">${n}</em>` : ""}</button>`).join("")}</nav>`;
    const qtyCell = i => S.buyer === "merchant" ? `<span class="note">${t("perSale")}</span>`
      : S.ship.mode === "multi" ? `<input class="input" type="number" min="1" max="20" value="${i.per_person || 1}" data-pp="${i.product_id}"><span class="note">${t("perPerson")}</span>`
      : `<input class="input" type="number" min="1" max="10000" value="${i.qty}" data-qty="${i.product_id}"><span class="note">${t("qty")}</span>`;
    return `<div class="panel">${nav}<div class="eyebrow" style="margin-top:16px">${t("myLine")}</div><h3 style="margin:4px 0 2px">${kit ? esc(nm(kit.name)) : t("custom")}</h3><div class="note">${sc ? esc(nm(sc.name)) : ""}</div>
      <div style="margin-top:8px">${S.items.map(i => { const p = prod(i.product_id); return `<div class="sel-item ${i.include ? "" : "off"}">${`<canvas data-p="${p.id}" data-size="120" data-detail="${p.id}"></canvas>`}
        <div><b data-detail="${p.id}">${esc(nm(p.name))}</b><div class="q">${qtyCell(i)}</div></div><button class="x" data-toggle="${p.id}" aria-label="${t("remove")}">✕</button></div>`; }).join("") || `<div class="empty">${t("emptyHint")}</div>`}</div>
      <div class="rail-actions"><button class="btn rail-cta" data-catalog="1">${t("addProducts")}</button></div></div>`;
  }
  function tabDone(tab) {
    if (tab === "design") return !!S.design;
    if (tab === "pricing") return finalItems().length > 0;
    if (tab === "delivery") { const d = delivery(); return S.buyer === "merchant" || (S.ship.mode === "multi" ? d.recipients > 0 : true); }
    if (tab === "packaging") return S.packagingMode === "none" || (S.packagingMode === "custom" && S.packaging.length > 0);
    return false;
  }
  function reviewReady() {
    const cks = checks();
    return quoteFinal().lines.length > 0 && cks.every(c => c.ok || c.warn);
  }
  function vFlowAction() {
    const n = S.items.length; if (!n) return "";
    if (S.view !== "work") return `<div class="flow-footer"><div class="flow-meta">${t("flowSelected", { n })}</div><button class="btn dark flow-cta" data-startflow="1">${t("startDesign")}</button></div>`;
    if (S.tab === "design") { const ok = tabDone("design"); return `<div class="flow-footer"><div class="flow-meta">${ok ? t("flowReady") : t("flowNeedDesign")}</div><button class="btn dark flow-cta" data-tab="pricing" ${ok ? "" : "disabled"}>${t("nextPricing")}</button></div>`; }
    if (S.tab === "pricing") return `<div class="flow-footer"><div class="flow-meta">${t("flowReady")}</div><button class="btn dark flow-cta" data-tab="delivery">${t("nextDelivery")}</button></div>`;
    if (S.tab === "delivery") { const ok = tabDone("delivery"); return `<div class="flow-footer"><div class="flow-meta">${ok ? t("flowReady") : t("flowNeedDelivery")}</div><button class="btn dark flow-cta" data-tab="packaging" ${ok ? "" : "disabled"}>${t("nextPackaging")}</button></div>`; }
    if (S.tab === "packaging") { const ok = tabDone("packaging"); return `<div class="flow-footer"><div class="flow-meta">${ok ? t("flowReady") : t("flowNeedPackaging")}</div><button class="btn dark flow-cta" data-tab="review" ${ok ? "" : "disabled"}>${t("nextReview")}</button></div>`; }
    const ok = reviewReady();
    if (S.submittedRef) { const em=S.submission?.email_status; return `<div class="flow-footer final"><div class="flow-complete">✓ ${t("flowSubmitted", { ref: esc(S.submittedRef) })}<div class="flow-meta" style="margin-top:5px">${em==="sent"?"Confirmation email sent":em==="not_configured"?"Email queued — provider not configured":"Order request saved"}</div></div><a class="btn dark flow-cta" href="account.html">View order status →</a></div>`; }
    if (buyDirect()) { const why = blockReasons();
      return `<div class="flow-footer final"><div class="flow-meta" id="buyMeta">${why.length ? esc(t("blockedBy", { r: why.join(" · ") })) : t("buyLead")}</div><button class="btn dark flow-cta" id="addCartBtn" ${why.length ? "aria-disabled=\"true\" data-blocked=\"1\"" : ""}>🛒 ${t("addToCart")}</button>${S.buyer === "company" && SERVER ? `<button class="btn flow-secondary ghost" id="quoteBtn">${t("bulkQuote")}</button>` : ""}${SERVER ? "" : `<div class="flow-meta">${t("needServer")}</div>`}</div>`; }
    if (S.buyer === "merchant") { const why = blockReasons();
      return `<div class="flow-footer final"><div class="flow-meta" id="sellerMeta">${why.length ? esc(t("blockedBy", { r: why.join(" · ") })) : t("sellerLead")}</div><button class="btn dark flow-cta" id="publishShopifyBtn" ${why.length ? 'aria-disabled="true" data-blocked="1"' : ""}>⇪ ${t("publishShopify")}</button><button class="btn flow-secondary ghost" id="quoteBtn" ${ok ? "" : "disabled"}>${t(`cta_${S.buyer}`)}</button>${SERVER ? "" : `<div class="flow-meta">${t("needServer")}</div>`}</div>`; }
    return `<div class="flow-footer final"><div class="flow-meta">${ok ? t(`ql_${S.buyer}`) : t("flowReviewBlocked")}</div><button class="btn dark flow-cta" id="quoteBtn" ${ok ? "" : "disabled"}>${t(`cta_${S.buyer}`)}</button>${SERVER ? "" : `<button class="btn flow-secondary" id="exportBtn">${t("exportJson")}</button><div class="flow-meta">${t("needServer")}</div>`}</div>`;
  }
  function vStudio() {
    if (!S.items.length) return `<div class="empty">${t("emptyHint")}<br><br><button class="btn dark" data-view="scenes">${t("nav_scenes")}</button></div>`;
    const tabs = `<nav class="tabs">${TABS.map(x => `<button data-tab="${x}" class="${S.tab === x ? "active" : ""}">${x !== "review" ? `<span class="dot ${tabDone(x) ? "" : "todo"}"></span>` : ""}${t("t_" + x)}</button>`).join("")}</nav>`;
    return tabs + { design: vDesign, pricing: vPricing, delivery: vDelivery, packaging: vPackaging, review: vReview }[S.tab]();
  }
  function vPage() {
    const n = S.items.length, v = S.view;
    const head = `<div class="modebar"><div><div class="eyebrow">${t("studioName")} · ${esc(nm(buyerDef().name))}</div><h2 style="margin:2px 0 0">${t("nav_" + v)}</h2>${v === "scenes" ? `<div class="note">${t("pickScene")}</div>` : ""}</div>
      <span class="row">${v === "all" ? `<input class="input" id="search" style="width:220px" placeholder="${t("search")}" value="${esc(S.search)}">` : ""}
      <span class="note" aria-label="${t("market")}">${esc(nm(market().name))} · ${market().currency}</span></span></div>`;
    const centre = v === "scenes" ? vScenes() : v === "all" ? vAll() : vStudio();
    const summary = `<div class="panel" id="summary">${n ? vSummary() : `<div class="eyebrow">${esc(nm(buyerDef().name))}</div><p class="note" style="margin-top:8px">${esc(nm(buyerDef().pitch))}</p><p class="note">${t("emptyHint")}</p>`}${n ? vFlowAction() : ""}</div>`;
    const right = v === "scenes" ? vKitsPanel() : summary;
    return `<div class="ws"><aside class="rail">${vRail()}</aside><section class="panel centre">${head}<div class="centre-body ${S.animate ? "anim" : ""}" id="centre">${centre}</div></section>
      <aside class="side">${right}${v === "scenes" ? "" : `<div class="panel"><div class="note">${SERVER ? t("modeServer") : t("modeLocal")}</div><div class="note" style="margin-top:8px">🔒 ${t("privacy")}</div></div>`}</aside></div>`;
  }
  function vDesign() {
    const td = S.textDesign, f = S.items.find(i => i.product_id === S.focus) || S.items[0]; S.focus = f.product_id;
    const p = prod(f.product_id), d = dpiInfo(f), mode = effMode(f), pl = f.placement;
    const toolbar = `<div class="toolbar"><div class="drop" id="drop">${S.design ? `<img id="designThumb" alt="">` : ""}<div><b>${t("upload")}</b><span class="note">${S.design ? `${esc(S.design.name)} · ${S.design.width}×${S.design.height}px` : t("uploadHint")}</span></div></div>
      <div class="textgen"><div class="row"><input class="input" id="tdText" style="flex:1;min-width:140px" placeholder="${t("textPh")}" value="${esc(td.text.replace(/\n/g, " / "))}">
        <input type="color" id="tdColor" value="${td.color}" style="width:34px;height:32px;border:0;background:none;padding:0" aria-label="colour"></div>
        <div class="row" style="margin-top:8px"><div class="seg">${["serif", "sans", "script", "monogram"].map(s => `<button data-style="${s}" class="${td.style === s ? "active" : ""}">${t(s)}</button>`).join("")}</div><button class="btn dark sm" id="tdUse">${t("useText")}</button></div></div></div>`;
    const editor = `<div class="editor"><canvas data-p="${p.id}" data-area="1" data-size="900"></canvas><div class="ctl">
      <div><h3 style="margin:0">${esc(nm(p.name))}</h3><div class="row" style="margin-top:6px">${d ? `<span class="chip ${d.level}">${d.label} · ${d.dpi} dpi</span>` : `<span class="chip gray">${t("noDesign")}</span>`}<span class="chip gray">${t("printArea")} ${p.print_area_mm[0]}×${p.print_area_mm[1]} mm</span><span class="chip gray" title="${TECH_TIPS[p.technique] || ''}">${esc(p.technique)}</span>${p.production_days ? `<span class="chip gray">${p.production_days} ${t("days")}</span>` : ""}${lowContrast(f) ? `<span class="chip warn">${t("lowContrast")}</span>` : ""}</div></div>
      <div class="seg">${["contain", "cover", "tile"].map(m => `<button data-mode="${m}" class="${mode === m ? "active" : ""}">${t({ contain: "fit", cover: "fill", tile: "tile" }[m])}${!pl.mode && mode === m ? ` · ${t("auto")}` : ""}</button>`).join("")}</div>
      <label class="note">${t("scale")}<input type="range" min="0.3" max="2.5" step="0.05" value="${pl.scale}" data-pl="scale"></label>
      <label class="note">${t("offsetX")}<input type="range" min="-1" max="1" step="0.02" value="${pl.dx}" data-pl="dx"></label>
      <label class="note">${t("offsetY")}<input type="range" min="-1" max="1" step="0.02" value="${pl.dy}" data-pl="dy"></label>
      ${p.colors ? `<div><div class="note">${t("productColor")}</div><div class="swatches" style="margin-top:6px">${p.colors.map(c => `<button style="background:${c}" data-color="${c}" class="${(pl.color || p.colors[0]) === c ? "active" : ""}" aria-label="${c}"></button>`).join("")}</div></div>` : ""}
      ${matChips(p.id, f.material_id, "data-mat")}
      <div class="row"><button class="btn sm" data-resetpl="1">${t("resetPl")}</button><button class="btn sm" data-applyall="1">${t("applyAll")}</button><button class="btn sm" data-dl="${p.id}">⤓ ${t("download")}</button></div>
      ${p.note ? `<div class="note">⚠ ${esc(noteT(p.note))}</div>` : ""}</div></div>`;
    const grid = `<div class="mgrid">${active().map(i => { const di = dpiInfo(i); return `<button class="mtile ${i.product_id === S.focus ? "active" : ""}" data-focus="${i.product_id}"><canvas data-p="${i.product_id}" data-size="260"></canvas>
      <div class="spread"><span>${esc(nm(prod(i.product_id).name))}</span>${di ? `<span class="chip ${di.level}" title="${di.dpi} dpi">${di.dpi}</span>` : ""}</div></button>`; }).join("")}</div>`;
    return toolbar + editor + grid;
  }
  function vPricing() {
    const q = quoteAll();
    if (S.buyer === "merchant") {
      const rows = q.lines.map(l => `<tr class="${l.reachable ? "" : "dim"}"><td><b data-detail="${l.product_id}" style="cursor:pointer">${esc(nm(prod(l.product_id).name))}</b><div class="note">${(() => { const m = matsOf(l.product_id).find(x => x.id === l.material_id); return m ? esc(nm(m.name)) + " · " : ""; })()}${esc(l.facility_city)} · ${l.days} ${t("days")} ${t("leadTime")}</div></td>
        <td class="num">${money(l.unit_cost)}</td><td class="num"><b>${money(l.price)}</b></td><td class="num">${money(l.ceiling)}</td><td class="num">${money(l.unit_profit)}</td><td>${l.reachable ? `<span class="chip ok">${t("okC")}</span>` : `<span class="chip bad">${t("over")}</span>`}</td></tr>`).join("");
      return `<div class="box"><div class="spread"><div><div class="eyebrow">${t("marginTitle")}</div><div class="big" id="marginVal">${Math.round(S.margin * 100)}%</div></div><div style="flex:1;min-width:220px"><input type="range" id="margin" min="10" max="70" step="1" value="${Math.round(S.margin * 100)}"></div></div>
        <label class="row note" style="margin-top:8px"><input type="checkbox" id="autoExclude" ${S.autoExclude ? "checked" : ""}> ${t("autoExclude")}</label></div>
        <div class="table-wrap"><table><thead><tr><th>${t("products_")}</th><th class="num">${t("basePrice")}</th><th class="num">${t("retail")}</th><th class="num">${t("ceiling")}</th><th class="num">${t("profitSale")}</th><th></th></tr></thead><tbody>${rows}</tbody></table></div><p class="note">${t("fxNote")}</p>`;
    }
    const nextTier = (pid, qty) => { const tr = [...D.qty_tiers].sort((a, b) => a.min_qty - b.min_qty).find(x => x.min_qty > qty); if (!tr) return ""; const ln = finalItems().find(i => i.product_id === pid); const u = unitOf(P.quote(D, { market: S.market, ...qopts(), items: [{ product_id: pid, qty: tr.min_qty, material_id: ln?.material_id }] }).lines[0]); return t("nextTier", { n: tr.min_qty - qty, p: money(u) }); };
    const rows = q.lines.map(l => `<tr><td><b data-detail="${l.product_id}" style="cursor:pointer">${esc(nm(prod(l.product_id).name))}</b><div class="note">${(() => { const m = matsOf(l.product_id).find(x => x.id === l.material_id); return m ? esc(nm(m.name)) + " · " : ""; })()}${esc(l.facility_city)} · ${l.days} ${t("days")} ${t("leadTime")}</div></td>
      <td class="num">${l.qty}</td><td class="num">${money(unitOf(l))}</td><td class="note">${esc(nextTier(l.product_id, l.qty))}</td><td class="num"><b>${money(lineOf(l))}</b></td></tr>`).join("");
    const d = delivery(), pk = packagingTotal(active());
    return `<div class="table-wrap"><table><thead><tr><th>${t("products_")}</th><th class="num">${t("qty")}</th><th class="num">${t("unitPrice")}</th><th>${t("tiers")}</th><th class="num">${t("lineTotal")}</th></tr></thead><tbody>${rows}
      ${pk > 0 ? `<tr data-row="packaging"><td colspan="4">${t("t_packaging")}</td><td class="num">${money(pk)}</td></tr>` : ""}
      ${buyDirect() ? `<tr><td colspan="4">${t("delivery_")}</td><td class="num note">${t("shipAtCheckout")}</td></tr><tr><td colspan="4"><b>${t("s_subtotal")}</b></td><td class="num"><b>${money(totalOf(q) + pk)}</b></td></tr>`
        : `<tr><td colspan="4">${t("delivery_")}</td><td class="num">${money(d.total_cost)}</td></tr><tr><td colspan="4"><b>${t("s_total")}</b></td><td class="num"><b>${money(totalOf(q) + pk + d.total_cost)}</b></td></tr>`}</tbody></table></div><p class="note">${buyDirect() ? t("vatNote") : t("fxNote")}</p>`;
  }
  function deadlineCheck(d) {
    const earliest = P.deliveryDate(D, d.lead_days), dl = S.ship.deadline;
    return { earliest, ok: !dl || earliest <= dl, latestOrder: dl ? subtractBusinessDays(dl, d.lead_days + (D.proof_buffer_days || 0)) : null };
  }
  function subtractBusinessDays(dateStr, n) { const d = new Date(dateStr + "T12:00:00"); while (n > 0) { d.setDate(d.getDate() - 1); if (d.getDay() !== 0 && d.getDay() !== 6) n--; } return d.toISOString().slice(0, 10); }
  const countrySel = (id, val) => `<select class="input" id="${id}">${COUNTRIES.map(c => `<option value="${c}" ${val === c ? "selected" : ""}>${esc(countryName(c))} (${c})</option>`).join("")}</select>`;
  function vDelivery() {
    const d = delivery();
    if (S.buyer === "merchant") {
      const regs = ["CH", "EU", "US"], rows = d.per_order.map(r => `<tr><td>${esc(nm(prod(r.product_id).name))}</td>${regs.map(g => { const x = r.regions[g]; return `<td class="num">${x ? `${money(x.cost)}<div class="note">${x.days} ${t("days")} · ${esc(x.city)}${x.cross_border ? " · " + t("cross") : ""}</div>` : `<span class="note">${t("noRoute")}</span>`}</td>`; }).join("")}</tr>`).join("");
      return `<h2>${t("delMerchant")}</h2><p class="lead">${t("delMerchantLead")}</p>
        <div class="table-wrap"><table><thead><tr><th>${t("products_")}</th>${regs.map(g => `<th class="num">${esc(nm(D.markets.find(m => m.region === g).name))}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table></div>
        <div class="grid2"><div class="box"><h3>${t("sample")}</h3><p class="note">${t("sampleLead")}</p><label class="field">${t("sampleTo")}${countrySel("sampleCountry", S.ship.sample_country)}</label>
          <div class="kv"><span>${t("shipping")}</span><b>${money(d.sample.cost)}</b></div><div class="kv"><span>${t("earliest")}</span><b>${P.deliveryDate(D, d.sample.days)}</b></div></div>
          <div class="box"><h3>${t("connectShop")}</h3><p class="note">${t("connectHint")}</p>${SERVER ? `<a class="btn sm" href="/admin.html" target="_blank" rel="noopener">Admin → API</a>` : ""}<p class="note" style="margin-top:10px">${t("whiteLabel")}</p></div></div>`;
    }
    const dc = deadlineCheck(d), isEvent = S.buyer === "individual";
    const modes = S.buyer === "company" ? `<div class="grid2">${[["bulk", "bulkHint"], ["multi", "multiHint"]].map(([m, h]) => `<label class="radio ${S.ship.mode === m ? "active" : ""}"><input type="radio" name="shipmode" value="${m}" ${S.ship.mode === m ? "checked" : ""}><div><b>${t(m)}</b><small>${t(h)}</small></div></label>`).join("")}</div>` : "";
    const dateBox = `<div class="box"><div class="grid2"><label class="field">${isEvent ? t("eventDate") : t("deadline")}<input class="input" type="date" id="deadline" value="${esc(S.ship.deadline)}"></label>
      <div><div class="kv"><span>${t("earliest")}</span><b>${dc.earliest}</b></div>${dc.latestOrder ? `<div class="kv"><span>${t("latestOrder")}</span><b>${dc.latestOrder}</b></div>` : ""}
      ${S.ship.deadline ? `<div class="check ${dc.ok ? "ok" : "bad"}"><i>${dc.ok ? "✓" : "!"}</i>${dc.ok ? t("onTime") : t("late")}</div>` : ""}</div></div></div>`;
    let body;
    if (S.ship.mode === "multi") {
      const regRows = d.regions.map(r => `<tr><td>${esc(nm(D.markets.find(m => m.region === r.region).name))}</td><td class="num">${r.recipients}</td><td class="num">${r.parcels}</td><td class="num">${money(r.per_recipient)}</td><td class="num">${money(r.cost)}</td><td class="num">${r.days} ${t("days")}</td></tr>`).join("");
      body = `<div class="box"><div class="spread"><h3 style="margin:0">${t("recipients")}</h3><span class="row"><button class="btn sm" id="csvBtn">${t("uploadCsv")}</button><button class="btn sm ghost" id="csvTpl">${t("csvTemplate")}</button></span></div>
        <p class="note">${t("recipientsHint")}</p><textarea class="input" id="recipients" rows="6" style="font-family:ui-monospace,Menlo,monospace;font-size:12px" placeholder="Lea Muster, CH, M&#10;Jonas Weber, DE, L&#10;Sam Lee, US, XL">${esc(S.ship.recipients_text)}</textarea>
        <div class="row" style="margin-top:8px"><span class="chip">${d.recipients} ${t("people")}</span>${d.unsupported.length ? `<span class="chip bad">${t("unsupported")}: ${esc(d.unsupported.join(", "))}</span>` : ""}</div></div>
        ${d.regions.length ? `<div class="table-wrap"><table><thead><tr><th>${t("market")}</th><th class="num">${t("people")}</th><th class="num">${t("shipments")}</th><th class="num">${t("perRecipient")}</th><th class="num">${t("shipping")}</th><th class="num">${t("earliest")}</th></tr></thead><tbody>${regRows}</tbody></table></div>` : ""}`;
    } else {
      const rows = d.shipments.map(s => `<tr><td>${esc(s.city)} → ${esc(countryName(S.ship.address_country))}</td><td class="note">${s.products.map(pid => esc(nm(prod(pid).name))).join(", ")}</td><td class="num">${s.weight_kg} kg</td><td class="num">${money(s.cost)}</td><td class="num">${s.days} ${t("days")}</td></tr>`).join("");
      body = `<div class="box" style="max-width:360px"><label class="field" style="margin:0">${t("deliverTo")}${countrySel("addressCountry", S.ship.address_country)}</label></div>
        <div class="table-wrap"><table><thead><tr><th>${t("from_")}</th><th>${t("products_")}</th><th class="num">${t("weight")}</th><th class="num">${t("shipping")}</th><th class="num">${t("earliest")}</th></tr></thead><tbody>${rows}</tbody></table></div>`;
    }
    return `${modes}${body}${dateBox}${vSizes(d)}`;
  }
  function recipientSizes(pid) { // counts from the recipient list (size column) for multi mode
    const sizes = prod(pid).sizes || [], out = {};
    S.ship.recipients.filter(r => P.regionOf(D, r.country)).forEach(r => { const s = sizes.includes(r.size) ? r.size : null; if (s) out[s] = (out[s] || 0) + 1; });
    return out;
  }
  function sizeState(i) {
    const p = prod(i.product_id); if (!p.sizes || p.sizes.length < 2) return null;
    if (S.ship.mode === "multi" && S.buyer === "company") { const c = recipientSizes(i.product_id), n = Object.values(c).reduce((a, b) => a + b, 0), q = effQty(i); return { counts: c, sum: n * (i.per_person || 1), qty: q, fromList: true }; }
    const c = i.sizes || {}, sum = Object.values(c).reduce((a, b) => a + (Number(b) || 0), 0); return { counts: c, sum, qty: effQty(i), fromList: false };
  }
  function vSizes() {
    if (S.buyer === "merchant") return "";
    const rows = finalItems().map(i => ({ i, s: sizeState(i) })).filter(x => x.s);
    if (!rows.length) return "";
    return `<div class="box"><h3>${t("sizeMix")}</h3>${rows.map(({ i, s }) => { const p = prod(i.product_id);
      return `<div style="padding:8px 0;border-top:1px solid var(--line)"><div class="spread"><b style="font-size:13px">${esc(nm(p.name))}</b><span class="chip ${s.sum === s.qty ? "ok" : "warn"}">${s.sum} / ${s.qty}${s.fromList ? " · " + t("fromCsv") : ""}</span></div>
        <div class="sizes" style="margin-top:6px">${p.sizes.map(z => `<label>${esc(z)}<input class="input" type="number" min="0" value="${s.counts[z] || 0}" ${s.fromList ? "disabled" : ""} data-size="${p.id}:${esc(z)}"></label>`).join("")}</div></div>`; }).join("")}
      <p class="note">${t("sizeSum")}</p></div>`;
  }
  function packagingReferenceBlock(compact = false) {
    if (S.packagingMode === "none") return `<div class="pkg-ref none"><div><b>✓ ${t("packNone")}</b><small>${t("packNoneLead")}</small></div></div>`;
    const ref = S.packagingRef;
    return `<div class="pkg-ref ${ref ? "has" : ""} ${compact ? "compact" : ""}">
      ${ref ? `<img src="${esc(ref.data_url)}" alt="${esc(ref.name || t("packRef"))}"><div class="pkg-ref-copy"><b>${t("exampleAdded")}</b><small>${esc(ref.name || t("packRef"))}</small><div class="row" style="margin-top:8px"><button class="btn sm" data-pkgrefupload="1">${t("replaceExample")}</button><button class="btn sm ghost" data-pkgrefremove="1">${t("removeExample")}</button></div></div>`
        : `<div class="pkg-ref-empty">＋</div><div class="pkg-ref-copy"><b>${t("packRef")}</b><small>${t("packRefLead")}</small><button class="btn sm" data-pkgrefupload="1" style="margin-top:8px">${t("uploadExample")}</button></div>`}
    </div>`;
  }
  function vPackaging() {
    const items = finalItems();
    const opts = D.packaging.map(o => { const n = items.filter(i => prod(i.product_id).packaging.includes(o.id)).length;
      return `<label class="opt"><input type="checkbox" data-pkg="${o.id}" ${S.packaging.includes(o.id) ? "checked" : ""} ${n ? "" : "disabled"}><div><b>${esc(nm(o.name))}</b> · ${packPriceLabel(o)} ${t("perUnit")}<small>${t("supported")} ${n}/${items.length} ${t("products")}</small></div></label>`; }).join("");
    const mode = `<div class="box pack-choice"><h3>${t("packChoice")}</h3>
      <label class="radio ${S.packagingMode === "custom" ? "active" : ""}"><input type="radio" name="packmode" value="custom" ${S.packagingMode === "custom" ? "checked" : ""}><div><b>${t("packCustom")}</b><small>${t("packCustomLead")}</small></div></label>
      <label class="radio ${S.packagingMode === "none" ? "active" : ""}"><input type="radio" name="packmode" value="none" ${S.packagingMode === "none" ? "checked" : ""}><div><b>${t("packNone")}</b><small>${t("packNoneLead")}</small></div></label></div>`;
    if (S.packagingMode === "none") return `<h2>${t("packTitle")}</h2>${mode}<div class="box"><div class="pack-none-confirm">✓</div><h3>${t("packNone")}</h3><p class="note">${t("packNoneLead")}</p></div>`;
    return `<h2>${t("packTitle")}</h2>${mode}<div class="grid2"><div><label class="field">${t("brandName")}<input class="input" id="brandName" maxlength="60" value="${esc(S.brand.name)}"></label>
      <label class="field">${t("thanks")}<textarea class="input" id="brandMsg" rows="3" maxlength="240">${esc(S.brand.message)}</textarea></label>${opts}${S.buyer === "merchant" ? `<p class="note">${t("whiteLabel")}</p>` : ""}${packagingReferenceBlock()}</div><div><canvas id="pkgCanvas"></canvas></div></div>`;
  }
  function checks() {
    const out = [], d = delivery(), q = quoteAll(), items = finalItems();
    const designOk = !!S.design;
    const available = quoteFinal().lines.length > 0;
    out.push({ id: "availability", ok: available, label: t("ck_availability"), help: available ? "" : t("fix_availability"), fix: "pricing" });
    out.push({ id: "design", ok: designOk, label: t("ck_design"), help: designOk ? "" : t("fix_design"), fix: "design" });

    if (!S.design) {
      out.push({ id: "dpi", ok: false, label: t("ck_dpi"), help: t("fix_design"), fix: "design" });
    } else {
      const badDpi = items.filter(i => dpiInfo(i)?.level === "bad"), warnDpi = items.filter(i => dpiInfo(i)?.level === "warn");
      if (badDpi.length) out.push({ id: "dpi", ok: false, label: t("ck_dpi"), help: t("fix_dpi_bad", { n: badDpi.length, min: D.dpi.min, good: D.dpi.good }), fix: `design:${badDpi[0].product_id}` });
      else if (warnDpi.length) out.push({ id: "dpi", ok: false, warn: true, label: t("ck_dpi"), help: t("fix_dpi_warn", { n: warnDpi.length, good: D.dpi.good }), fix: `design:${warnDpi[0].product_id}` });
      else out.push({ id: "dpi", ok: true, label: t("ck_dpi"), help: "", fix: "design" });
    }

    if (S.design && items.some(i => prod(i.product_id).colors)) {
      const contrast = items.filter(lowContrast);
      out.push({ id: "contrast", ok: !contrast.length, warn: !!contrast.length, label: t("ck_contrast"), help: contrast.length ? t("fix_contrast", { n: contrast.length }) : "", fix: `design:${contrast[0]?.product_id || items[0]?.product_id || ""}` });
    }
    if (S.buyer === "merchant") {
      const n = q.totals.unreachable.length;
      out.push({ id: "margin", ok: !n, warn: !!(n && S.autoExclude), label: t("ck_margin"), help: n ? t("fix_margin", { n }) : "", fix: "pricing" });
    } else {
      const sizeRows = items.map(i => ({ i, s: sizeState(i) })).filter(x => x.s), badSizes = sizeRows.filter(x => x.s.sum !== x.s.qty);
      if (sizeRows.length) out.push({ id: "sizes", ok: !badSizes.length, label: t("ck_sizes"), help: badSizes.length ? t("fix_sizes", { n: badSizes.length }) : "", fix: "delivery" });
      if (S.ship.mode === "multi") {
        const recOk = d.recipients > 0 && !d.unsupported.length, recWarn = d.recipients > 0 && !!d.unsupported.length;
        out.push({ id: "recipients", ok: recOk, warn: recWarn, label: t("ck_rec"), help: recOk ? "" : t("fix_rec"), fix: "delivery" });
      }
      if (S.buyer === "individual" && !S.ship.deadline) out.push({ id: "date-set", ok: false, label: t("ck_date_set"), help: t("fix_date_set"), fix: "delivery" });
      else if (S.ship.deadline) { const dc = deadlineCheck(d); out.push({ id: "date", ok: dc.ok, label: t("ck_date"), help: dc.ok ? "" : t("fix_date"), fix: "delivery" }); }
    }
    const packagingOk = S.packagingMode === "none" || (S.packagingMode === "custom" && S.packaging.length > 0);
    out.push({ id: "packaging", ok: packagingOk, label: t("ck_packaging"), help: packagingOk ? "" : t("fix_packaging"), fix: "packaging" });
    return out;
  }
  function vReview() {
    const cks = checks(), q = quoteFinal(), attention = cks.filter(c => !c.ok), blocking = attention.filter(c => !c.warn);
    const alert = attention.length ? `<div class="review-attention ${blocking.length ? "bad" : "warn"}"><div class="review-attention-icon">!</div><div><b>${t("reviewAttention", { n: attention.length })}</b><small>${t("reviewAttentionLead")}</small></div></div>` : "";
    const tasks = cks.map(c => {
      const cls = c.ok ? "ok" : c.warn ? "warn" : "bad", icon = c.ok ? "✓" : "!";
      if (c.ok) return `<div class="review-task ${cls}"><i>${icon}</i><div class="review-task-copy"><b>${esc(c.label)}</b></div><span class="review-task-state">${t("completed")}</span></div>`;
      return `<button class="review-task ${cls}" data-reviewfix="${esc(c.fix || "review")}"><i>${icon}</i><div class="review-task-copy"><b>${esc(c.label)}</b><small>${esc(c.help || "")}</small></div><span class="review-task-cta">${c.warn ? t("reviewCheck") : t("goComplete")}</span></button>`;
    }).join("");
    const packagingReview = `<div class="box"><div class="spread"><h3 style="margin:0">${t("packTitle")}</h3><button class="btn sm ghost" data-reviewfix="packaging">${t("t_packaging")} →</button></div>${S.packagingMode === "none" ? `<div class="pkg-ref none" style="margin-top:10px"><div><b>✓ ${t("packNone")}</b><small>${t("packNoneLead")}</small></div></div>` : `<div class="note" style="margin:6px 0 10px">${t("packSelected", { n: S.packaging.length })}</div>${packagingReferenceBlock(true)}`}</div>`;
    return `${alert}<div class="grid2"><div class="box review-checks"><h3>${t("checks")}</h3>${tasks}</div>
      <div>${packagingReview}<div class="box"><h3>${buyDirect() ? t("addToCart") : t(`cta_${S.buyer}`)}</h3><p class="note">${buyDirect() ? t("buyLead") : t(`ql_${S.buyer}`)}</p>
        ${S.buyer === "merchant" ? `<label class="field" style="margin-top:10px">${t("publishTo")}<select class="input" id="publishSel"><option value="">${t("later")}</option>${S.stores.map(c => `<option value="${esc(c.id)}" ${S.publishStore === c.id ? "selected" : ""}>${c.platform === "shopify" ? "Shopify" : "WooCommerce"} · ${esc(c.store)} — ${t("st_" + c.status)}</option>`).join("")}</select></label><button class="btn sm" data-bind="1">+ ${t("bindStore")}</button><button class="btn dark big" id="publishShopifyBtn2" type="button">⇪ ${t("publishShopify")}</button><p class="note">${t("sellerLead")}</p>` : ""}
        ${SERVER ? "" : `<p class="note" style="margin-top:8px">${t("needServer")}</p>`}</div></div></div>
      <div class="mgrid" style="margin-bottom:14px">${q.lines.map(l => `<div class="mtile" style="cursor:default"><canvas data-p="${l.product_id}" data-size="260"></canvas><div class="spread"><span>${esc(nm(prod(l.product_id).name))}</span><span class="note">${S.buyer === "merchant" ? money(l.price) : `${l.qty}×`}</span></div></div>`).join("")}</div>
      <div class="row"><button class="btn" id="dlAll">⤓ ${t("downloadAll")}</button><button class="btn" id="saveBtn">${t("save")}</button></div>`;
  }
  function vSummary() {
    const q = quoteFinal(), d = delivery(), sc = D.scenarios.find(s => s.id === S.scenario), kit = sc?.kits.find(k => k.id === S.kit);
    const head = `<div class="kv"><span>${t("scenario")}</span><b>${sc ? esc(nm(sc.name)) : "—"}</b></div><div class="kv"><span>${t("kit")}</span><b>${kit ? esc(nm(kit.name)) : t("custom")}</b></div>`;
    if (S.buyer === "merchant") {
      const perSet = q.lines.reduce((a, l) => a + l.unit_profit, 0), rev = q.lines.reduce((a, l) => a + l.price, 0);
      const days = d.per_order.map(r => r.regions[market().region]?.days || 0), avg = days.length ? Math.round(days.reduce((a, b) => a + b, 0) / days.length) : 0;
      return `<div class="eyebrow">${t("s_profitSet")}</div><div class="hero-num">${money(perSet)}</div><div class="bar"><i style="width:${rev ? Math.min(100, perSet / rev * 100 / 0.7) : 0}%"></i></div>
        <div class="note">${t("marginR")} ${rev ? (perSet / rev * 100).toFixed(1) : 0}%</div><div style="margin-top:10px">${head}
        <div class="kv"><span>${t("products_")}</span><b>${q.lines.length}</b></div><div class="kv"><span>${t("sample")}</span><b>${money(q.totals.cost + d.sample.cost)}</b></div>
        <div class="kv"><span>${t("avgDays")}</span><b>≈ ${avg} ${t("days")}</b></div></div>`;
    }
    const direct = buyDirect(), pk = packagingTotal(finalItems()), total = totalOf(q) + pk + (direct ? 0 : d.total_cost), people = S.ship.mode === "multi" ? d.recipients : 0, dc = deadlineCheck(d);
    return `<div class="eyebrow">${t(direct ? "s_subtotal" : "s_total")}</div><div class="hero-num">${money(total)}</div><div class="note">${t("products_")} ${money(totalOf(q))}${pk > 0 ? ` · <span data-pk="sum">${t("t_packaging")} ${money(pk)}</span>` : ""} · ${t("delivery_")} ${direct ? t("shipAtCheckout") : money(d.total_cost)}</div>
      <div style="margin-top:10px">${head}<div class="kv"><span>${t("units")}</span><b>${q.totals.units}</b></div>${people ? `<div class="kv"><span>${t("perPersonCost")}</span><b>${money(total / people)}</b></div>` : ""}
      <div class="kv"><span>${t("shipments")}</span><b>${d.parcels}</b></div><div class="kv"><span>${t("earliest")}</span><b>${dc.earliest}</b></div>
      ${S.ship.deadline ? `<div class="check ${dc.ok ? "ok" : "bad"}"><i>${dc.ok ? "✓" : "!"}</i>${dc.ok ? t("onTime") : t("late")}</div>` : ""}</div>`;
  }

  // ------------------------------------------------------------------ drawers
  function openDrawer(title, body, foot = "") { $("#drawerTitle").textContent = title; $("#drawerBody").innerHTML = body; $("#drawerFoot").innerHTML = foot; $("#drawer").classList.add("open"); $("#drawerMask").classList.add("open"); $("#drawer").setAttribute("aria-hidden", "false"); drawAll(); }
  function closeDrawer() { $("#drawer").classList.remove("open"); $("#drawerMask").classList.remove("open"); $("#drawer").setAttribute("aria-hidden", "true"); }
  function productDetail(pid) {
    const p = prod(pid), tiers = [...D.qty_tiers].sort((a, b) => a.min_qty - b.min_qty).map(tr => ({ q: tr.min_qty, u: unitOf(P.quote(D, { market: S.market, ...qopts(), items: [{ product_id: pid, qty: tr.min_qty }] }).lines[0]) }));
    const facs = ["CH", "EU", "US"].map(r => { const f = P.facilityFor(D, p, D.markets.find(m => m.region === r)); return `<div class="kv"><span>${esc(nm(D.markets.find(m => m.region === r).name))}</span><b>${f ? `${esc(f.facility.city)} · ${f.days} ${t("days")}${f.cross_border ? " · " + t("cross") : ""}` : "—"}</b></div>`; }).join("");
    const body = `<div class="pdetail"><canvas data-p="${pid}" data-size="500" data-area="1"></canvas><div>
      <div class="row"><span class="chip">${esc(p.technique)}</span><span class="chip gray">${t("cat_" + p.category)}</span>${(p.eco_tags||[]).map(x=>`<span class="chip gray">♻ ${esc(x)}</span>`).join("")}</div>
      <div class="kv"><span>${t("printArea")}</span><b>${p.print_area_mm[0]} × ${p.print_area_mm[1]} mm</b></div><div class="kv"><span>${t("weight")}</span><b>${p.weight_g} g</b></div>
      ${p.sizes ? `<div class="kv"><span>${t("sizes")}</span><b>${esc(p.sizes.join(" · "))}</b></div>` : ""}
      ${p.colors ? `<div class="kv"><span>${t("colors")}</span><b><span class="swatches">${p.colors.map(c => `<span style="display:inline-block;width:14px;height:14px;border-radius:50%;background:${c};border:1px solid var(--line)"></span>`).join("")}</span></b></div>` : ""}
      ${p.note ? `<p class="note">⚠ ${esc(noteT(p.note))}</p>` : ""}
      <div style="margin-top:12px">${matChips(pid, (S.items.find(i => i.product_id === pid) || {}).material_id || S.pendingMat[pid], "data-dmat")}</div></div></div>
      <h3 style="margin-top:18px">${t("production")}</h3>${facs}
      <h3 style="margin-top:18px">${t("tiers")}</h3><div class="table-wrap"><table><tbody><tr>${tiers.map(x => `<td class="num"><div class="note">≥ ${x.q}</div><b>${money(x.u)}</b></td>`).join("")}</tr></tbody></table></div>`;
    openDrawer(nm(p.name), body, `<button class="btn ${inSel(pid) ? "" : "dark"}" data-toggle="${pid}" data-close="1">${inSel(pid) ? t("remove") : t("add")}</button><button class="btn dark" data-designprod="${pid}">${t("goDesign")}</button>`);
  }
  function kitDetail(scId, kitId) {
    const sc = D.scenarios.find(s => s.id === scId), k = sc.kits.find(x => x.id === kitId);
    const q = P.quote(D, { market: S.market, margin: S.margin, items: k.items.map(pid => ({ product_id: pid, qty: S.buyer === "merchant" ? 1 : k.default_qty })) });
    const body = `<p class="lead">${esc(nm(sc.audience))}</p>${q.lines.map(l => { const p = prod(l.product_id); return `<div class="sel-item" style="grid-template-columns:64px 1fr auto"><canvas data-p="${p.id}" data-size="140" style="width:64px;height:64px" data-detail="${p.id}"></canvas>
      <div><b data-detail="${p.id}">${esc(nm(p.name))}</b><div class="note">${esc(p.technique)} · ${p.print_area_mm[0]}×${p.print_area_mm[1]} mm · ${esc(l.facility_city)} ${l.days} ${t("days")}${p.note ? " · ⚠" : ""}</div></div>
      <b class="note" style="font-size:13px;color:var(--ink)">${money(S.buyer === "merchant" ? l.price : unitOf(l))}</b></div>`; }).join("")}`;
    const inAll = k.items.every(inSel);
    openDrawer(nm(k.name), body, `<button class="btn ${inAll ? "" : "dark"}" data-merge="${scId}:${kitId}" data-close="1" ${inAll ? "disabled" : ""}>${inAll ? "✓ " + t("kitAdded") : t("addToSel")}</button>`);
  }
  function catalogDrawer() {
    const body = `<div class="pgrid">${D.products.map(p => `<div class="ptile" data-detail="${p.id}"><canvas data-p="${p.id}" data-size="180" data-nod="${S.design ? 0 : 1}"></canvas><b>${esc(nm(p.name))}</b><small>${t("cat_" + p.category)}</small>
      <button class="add ${inSel(p.id) ? "in" : ""}" data-toggle="${p.id}">${inSel(p.id) ? "✓" : "+"}</button></div>`).join("")}</div>`;
    openDrawer(t("addProducts").replace("+ ", ""), body);
  }

  // ------------------------------------------------------------------ render
  function renderRoleBar() {
    const n = S.stores.length;
    $("#roleBar").innerHTML = `<label class="role"><span>${t("role")}</span><select id="roleSel" aria-label="${t("role")}">${D.buyer_types.map(b => `<option value="${b.id}" ${S.buyer === b.id ? "selected" : ""}>${esc(nm(b.name))}</option>`).join("")}</select></label>
      ${S.buyer === "merchant" ? `<button class="btn storebtn ${S.stores.some(c => c.status === "connected") ? "bound" : ""}" data-bind="1">🔗 ${n ? t("storesN", { n }) : t("bindStore")}</button>` : ""}`;
  }
  function openStoreModal() { $("#storeErr").textContent = ""; renderStoreModal(); if (S.platform === "shopify" && !$("#storeInput").value) { try { $("#storeInput").value = localStorage.getItem("pod-shopify-shop") || "dropkingdev.myshopify.com"; } catch {} } $("#storeModal").classList.add("open"); setTimeout(() => { $("#storeInput").focus(); $("#storeInput").select?.(); }, 50); }
  function renderStoreModal() {
    const sh = S.platform === "shopify";
    document.querySelectorAll("#platformSeg button").forEach(b => b.classList.toggle("active", b.dataset.platform === S.platform));
    $("#storeLabel").textContent = sh ? t("shopDomain") : t("wooUrl"); $("#storeInput").placeholder = sh ? "your-store.myshopify.com" : "https://shop.example.com"; $("#storeHint").textContent = sh ? t("shopHint") : t("wooHint");
    $("#storeList").innerHTML = S.stores.map(c => `<div class="st-row"><span><b>${c.platform === "shopify" ? "Shopify" : "WooCommerce"}</b> · ${esc(c.store)}</span><span class="row"><span class="chip ${c.status === "connected" ? "ok" : "warn"}">${t("st_" + c.status)}</span><button class="x" data-unbind="${esc(c.id)}" aria-label="remove">✕</button></span></div>`).join("");
  }
  async function bindStore() {
    let raw = $("#storeInput").value.trim(), platform = S.platform;
    if (platform === "shopify" && /^[a-z0-9][a-z0-9-]*$/i.test(raw)) raw = `${raw.toLowerCase()}.myshopify.com`;
    const ok = platform === "shopify" ? /^(https?:\/\/)?[a-z0-9][a-z0-9-]*\.myshopify\.com\/?$/i.test(raw) : /^(https:\/\/)?[a-z0-9.-]+\.[a-z]{2,}(\/.*)?$/i.test(raw);
    if (!ok) { $("#storeErr").textContent = platform === "shopify" ? t("shopHint") : t("wooHint"); return; }
    if (!SERVER) { S.stores.push({ id: `local_${Date.now().toString(36)}`, platform, store: raw.replace(/^https?:\/\//, "").replace(/\/$/, ""), status: "local" }); $("#storeInput").value = ""; renderStoreModal(); rerender(); return; }
    const r = await fetch("/api/studio/connections", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ platform, store: raw }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { $("#storeErr").textContent = d.message || d.error || t("failed"); return; }
    S.stores.push(d.connection); if (!S.publishStore) S.publishStore = d.connection.id; $("#storeInput").value = ""; saveDraft();
    if (d.authorize_url) { location.href = d.authorize_url; return; }   // official Shopify / WooCommerce authorisation page
    renderStoreModal(); rerender();
  }
  function render() {
    renderRoleBar();
    $("#app").innerHTML = vPage(); S.animate = false;
    if (S.design && $("#designThumb")) $("#designThumb").src = S.design.canvas.toDataURL("image/png");
    drawAll(); drawPackaging(); applyStatic(); renderStickyBar();
  }
  // Mobile (≤720px): sticky bottom bar with the live price and "Add to cart" (same action and gating as the review button).
  function renderStickyBar() {
    let bar = document.getElementById("stickyBuy");
    if (!bar) { bar = document.createElement("div"); bar.id = "stickyBuy"; bar.className = "sticky-buy"; bar.setAttribute("role", "region"); document.body.appendChild(bar);
      bar.addEventListener("click", e => { if (e.target.closest("#stickyAdd")) { if (S.tab !== "review") { S.tab = "review"; rerender(); } addToCart(); } }); }
    const items = finalItems();
    if (!buyDirect() || !items.length) { bar.hidden = true; document.body.classList.remove("has-sticky-buy"); return; }
    let total = 0; try { total = totalOf(quoteFinal()) + packagingTotal(items); } catch { total = 0; }
    const why = blockReasons();
    bar.hidden = false; document.body.classList.add("has-sticky-buy");
    bar.setAttribute("aria-label", t("addToCart"));
    bar.innerHTML = `<div class="sb-price"><span>${esc(window.WeddingI18n?.k ? window.WeddingI18n.k("studio.sticky.total") : "Total")} · ${items.reduce((a, i) => a + effQty(i), 0)}×</span><b>${money(total)}</b><small>${esc(window.WeddingI18n?.k ? window.WeddingI18n.k("cart.vatExcl") : "")}</small></div><button class="btn dark" id="stickyAdd" type="button" ${why.length ? 'aria-disabled="true"' : ""}>🛒 ${t("addToCart")}</button>`;
  }
  function applyStatic() {
    document.documentElement.lang = lang === "zh" ? "zh-CN" : lang;
    document.querySelectorAll("[data-t]").forEach(e => { e.textContent = t(e.dataset.t); });
    const ls = document.getElementById("langSelect"); if (ls && ls.value !== lang) ls.value = lang;
  }
  function drawPackaging() {
    const cv = $("#pkgCanvas"); if (!cv) return;
    const W = 800, H = 600; cv.width = W; cv.height = H; const x = cv.getContext("2d");
    if (S.packagingMode === "none") { x.fillStyle = "#efe7de"; x.fillRect(0, 0, W, H); x.fillStyle = "#28231f"; x.textAlign = "center"; x.font = "italic 34px Georgia, serif"; x.fillText(t("packNone"), W / 2, H / 2 - 8); x.font = "14px Inter, Arial, sans-serif"; x.fillStyle = "#7c746c"; x.fillText(t("packNoneLead").slice(0, 90), W / 2, H / 2 + 26); return; }
    x.fillStyle = "#efe7de"; x.fillRect(0, 0, W, H);
    x.fillStyle = "#b99a76"; x.beginPath(); x.moveTo(110, 220); x.lineTo(560, 220); x.lineTo(600, 520); x.lineTo(70, 520); x.closePath(); x.fill();
    x.fillStyle = "#d7bf9c"; x.beginPath(); x.moveTo(130, 240); x.lineTo(540, 240); x.lineTo(570, 500); x.lineTo(100, 500); x.closePath(); x.fill();
    x.fillStyle = "#f4ede3"; x.beginPath(); x.moveTo(150, 260); x.lineTo(520, 250); x.lineTo(560, 480); x.lineTo(120, 490); x.closePath(); x.fill();
    x.fillStyle = "#c9ab86"; x.beginPath(); x.moveTo(110, 220); x.lineTo(560, 220); x.lineTo(610, 90); x.lineTo(160, 90); x.closePath(); x.fill();
    const brand = S.brand.name || "Your Brand", pk = new Set(S.packaging);
    if (pk.has("sticker")) { x.save(); x.beginPath(); x.arc(335, 268, 52, 0, 7); x.fillStyle = "#fff"; x.shadowColor = "rgba(0,0,0,.2)"; x.shadowBlur = 8; x.fill(); x.restore();
      x.save(); x.beginPath(); x.arc(335, 268, 46, 0, 7); x.clip(); if (S.design) { const c = S.design.canvas, f = Math.min(92 / c.width, 92 / c.height); x.drawImage(c, 335 - c.width * f / 2, 268 - c.height * f / 2, c.width * f, c.height * f); } x.restore(); }
    if (pk.has("insert_card")) {
      x.save(); x.translate(560, 330); x.rotate(-0.08); x.shadowColor = "rgba(0,0,0,.18)"; x.shadowBlur = 12; x.fillStyle = "#fffdf8"; x.fillRect(0, 0, 200, 240); x.restore();
      x.save(); x.translate(560, 330); x.rotate(-0.08); x.fillStyle = "#28231f"; x.textAlign = "center"; x.font = "italic 26px Georgia, serif"; x.fillText(brand.slice(0, 18), 100, 60);
      x.font = "14px Inter, Arial, sans-serif"; x.fillStyle = "#7c746c"; const msg = (S.brand.message || t("thankYou")).slice(0, 120), parts = /\s/.test(msg) ? msg.split(/(\s+)/) : [...msg]; let line = "", y = 110;
      for (const w of parts) { if (x.measureText(line + w).width > 170) { x.fillText(line.trim(), 100, y); y += 22; line = w.trim(); if (y > 210) break; } else line += w; } if (y <= 210) x.fillText(line.trim(), 100, y); x.restore(); }
    if (pk.has("neck_label") && finalItems().some(i => prod(i.product_id).packaging.includes("neck_label"))) {
      x.fillStyle = "#fff"; x.fillRect(200, 360, 150, 70); x.fillStyle = "#28231f"; x.textAlign = "center"; x.font = "bold 18px Inter, Arial, sans-serif"; x.fillText(brand.toUpperCase().slice(0, 14), 275, 392);
      x.font = "11px Inter, Arial, sans-serif"; x.fillStyle = "#7c746c"; x.fillText(t("neckPreview"), 275, 414); }
  }

  // ------------------------------------------------------------------ recipients
  function parseRecipients(text) {
    const rows = String(text || "").split(/\r?\n/).map(l => l.split(/[,;\t]/).map(s => s.trim())).filter(r => r.some(Boolean));
    if (rows[0] && /country|land|国家/i.test(rows[0].join(" "))) rows.shift();
    return rows.slice(0, 5000).map(r => { const cc = r.find((v, i) => i > 0 && /^[A-Za-z]{2}$/.test(v)) || ""; const size = r[r.indexOf(cc) + 1] || ""; return { name: r[0] || "", country: cc.toUpperCase(), size: size.toUpperCase() === "ONE SIZE" ? "One size" : size.toUpperCase() }; });
  }
  function setRecipients(text) { S.ship.recipients_text = text; S.ship.recipients = parseRecipients(text); }

  // ------------------------------------------------------------------ persistence
  function snapshot() {
    return { buyer_type: S.buyer, scenario_id: S.scenario, kit_id: S.kit, market: S.market, margin: S.margin, auto_exclude: S.autoExclude, packaging: S.packaging, packaging_mode: S.packagingMode, packaging_reference: S.packagingRef, brand: S.brand,
      fulfillment: { mode: S.buyer === "merchant" ? "dropship" : S.ship.mode, address_country: S.ship.address_country, deadline: S.ship.deadline, sample_country: S.ship.sample_country, recipients: S.ship.recipients.map(({ name, country, size }) => ({ name, country, size })) },
      items: finalItems().map(i => ({ product_id: i.product_id, qty: effQty(i), per_person: i.per_person || 1, sizes: i.sizes || {}, material_id: i.material_id || null, placement: i.placement })),
      all_items: S.items, browse: S.browse, text_design: S.textDesign, recipients_text: S.ship.recipients_text, stores: S.stores, publish_store_id: S.publishStore, submitted_ref: S.submittedRef, submission: S.submission,
      publish_store: (() => { const c = S.stores.find(x => x.id === S.publishStore && /^sc_/.test(x.id)); return c ? { platform: c.platform, connection_id: c.id, store: c.store } : null; })(),
      design_meta: S.design ? { name: S.design.name, width: S.design.width, height: S.design.height, source: S.design.source } : null };
  }
  function saveDraft() { const s = snapshot(); s.view = S.view; s.tab = S.tab; store.set(DRAFT_KEY, s); }
  function restore(s, designUrl) {
    S.buyer = D.buyer_types.some(b => b.id === s.buyer_type) ? s.buyer_type : "individual"; S.scenario = s.scenario_id || null; S.kit = s.kit_id || null;
    S.market = s.market || "CH"; if (window.PODMarket) S.market = PODMarket.get(); S.margin = s.margin || 0.4; S.autoExclude = s.auto_exclude !== false; S.packaging = s.packaging || []; S.packagingMode = s.packaging_mode === "none" ? "none" : "custom"; S.packagingRef = s.packaging_reference?.data_url ? s.packaging_reference : null; S.brand = s.brand || { name: "", message: "" };
    const f = s.fulfillment || {}; S.ship = { mode: f.mode || (S.buyer === "merchant" ? "dropship" : "bulk"), address_country: f.address_country || "CH", deadline: f.deadline || "", sample_country: f.sample_country || "CH", recipients: f.recipients || [], recipients_text: s.recipients_text || (f.recipients || []).map(r => [r.name, r.country, r.size].filter(Boolean).join(", ")).join("\n") };
    S.items = (s.all_items || s.items || []).filter(i => prod(i.product_id)).map(i => ({ ...newItem(i.product_id), ...i, placement: { mode: null, scale: 1, dx: 0, dy: 0, color: null, ...(i.placement || {}) } }));
    S.browse = s.browse || S.browse;
    S.stores = Array.isArray(s.stores) ? s.stores : []; S.publishStore = [s.publish_store_id, s.publish_store?.connection_id].find(id => id !== undefined && (id === "" || S.stores.some(c => c.id === id))) ?? (S.stores[0]?.id || "");
    S.textDesign = s.text_design || S.textDesign; S.submittedRef = s.submitted_ref || null; S.submission = s.submission || null; S.view = ({ explore: "scenes" })[s.view] || (["scenes", "all", "work"].includes(s.view) ? s.view : (S.items.length ? "work" : "scenes")); S.tab = TABS.includes(s.tab) ? s.tab : "review"; S.focus = S.items[0]?.product_id || null;
    const url = designUrl || s.design_data_url;
    if (url) { const img = new Image(); img.onload = () => { setDesignFromImage(img, s.design_meta?.name || "design", s.design_meta?.source === "text" ? "text" : "upload"); if (s.design_meta?.width) { S.design.width = s.design_meta.width; S.design.height = s.design_meta.height; } render(); }; img.src = url; }
    else if (s.design_meta?.source === "text") S.design = { canvas: textDesignCanvas(), width: 1600, height: 1600, name: "text", source: "text", transparent: true };
  }
  /** Blocking print-ready checks (design missing, DPI too low, sizes, …) as short labels; warnings don't block. */
  function blockReasons() { return checks().filter(c => !c.ok && !c.warn).map(c => c.help || c.label); }
  /** Small mockup thumbnail for the cart (rendered client-side, stored server-side). */
  function renderThumb(pid, size = 240) {
    return new Promise(res => {
      const cv = document.createElement("canvas"), i = S.items.find(x => x.product_id === pid) || newItem(pid);
      let done = false; const fin = () => { if (done) return; done = true; let u = ""; try { u = cv.toDataURL("image/webp", 0.82); if (!u.startsWith("data:image/webp")) u = cv.toDataURL("image/jpeg", 0.82); } catch { u = ""; } res(u); };
      M.render(cv, prod(pid), effPl(i), S.design, { size, onPhotoLoad: () => { M.render(cv, prod(pid), effPl(i), S.design, { size }); fin(); } });
      setTimeout(fin, 1500);
    });
  }
  async function addToCart() {
    const why = blockReasons();
    if (why.length) { toast(t("blockedBy", { r: why[0] })); const m = $("#buyMeta"); if (m) m.textContent = t("blockedBy", { r: why.join(" · ") }); return; }
    if (!SERVER) { toast(t("needServer")); return; }
    const btn = $("#addCartBtn"); if (btn) { btn.disabled = true; btn.textContent = t("addingCart"); }
    try {
      const prev = S.projectId;
      const saved = await saveProject({ silent: true }); if (!saved || !saved.id) return;
      const q = quoteFinal(), lines = [];
      for (const l of q.lines) {
        const p = prod(l.product_id), it = finalItems().find(i => i.product_id === l.product_id) || {}, mat = matsOf(l.product_id).find(m => m.id === l.material_id);
        let thumb = "";
        const data = await renderThumb(l.product_id);
        if (data) { const r = await fetch(`/api/studio/projects/${saved.id}/mockup/${encodeURIComponent(l.product_id)}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data_url: data }) }); if (r.ok) thumb = (await r.json()).url; }
        const sizes = p.sizes && p.sizes.length > 1 ? Object.fromEntries(Object.entries(it.sizes || {}).filter(([, n]) => n > 0)) : {};
        lines.push({ id: `sp-${saved.id}-${l.product_id}`, productId: l.product_id, sku: l.product_id.toUpperCase(), name: nm(p.name) || p.id, qty: l.qty, material: mat ? (mat.name.en || nm(mat.name)) : "", materialId: l.material_id || "",
          sizes, projectId: saved.id, thumb, thumb2: thumb, thumbOrig: p.mockup_photo?.src || "", mode: "studio", customization: `Studio project ${saved.id}` });
      }
      // Re-adding an edited project replaces its previous lines.
      for (const old of (window.PODCart?.items || []).filter(x => x.projectId && (x.projectId === prev || x.projectId === saved.id))) window.PODCart.remove(old.id);
      for (const line of lines) window.PODCart.upsert(line);
      toast(t("addedCart", { n: lines.length })); window.PODCart.open();
      // Offer direct checkout after a short delay
      setTimeout(() => {
        const foot = document.getElementById("cartFoot");
        if (foot && !document.getElementById("goPayNow")) {
          const btn = document.createElement("button");
          btn.id = "goPayNow";
          btn.className = "cart-checkout";
          btn.style.cssText = "margin-top:8px;background:#0070ba";
          btn.textContent = "Proceed to payment →";
          btn.onclick = () => { location.href = "checkout.html"; };
          foot.insertBefore(btn, foot.querySelector(".pay-marks"));
        }
      }, 300);
    } finally { const b = $("#addCartBtn"); if (b) { b.disabled = false; b.textContent = "🛒 " + t("addToCart"); } }
  }
  async function saveProject({ silent = false } = {}) {
    const s = snapshot();
    if (SERVER) {
      try { await window.PODAuth?.require?.({ guest: true }); } catch { return null; }
      const r = await fetch("/api/studio/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...s, design_data_url: designDataUrl() }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { toast(d.message || d.error || t("failed")); return null; }
      S.projectId = d.id; history.replaceState(null, "", `?project=${d.id}`);
      if (!silent) { try { await navigator.clipboard.writeText(location.href); toast(`${t("saved")} · ${t("linkCopied")}`); } catch { toast(t("saved")); } }
      return d;
    }
    const list = store.get(LOCAL_KEY) || [], id = S.projectId || `local_${Date.now().toString(36)}`;
    const entry = { id, saved_at: new Date().toISOString(), ...s, view: "work", tab: "review", design_data_url: designDataUrl(1200) };
    if (!store.set(LOCAL_KEY, [entry, ...list.filter(x => x.id !== id)].slice(0, 10))) { delete entry.design_data_url; store.set(LOCAL_KEY, [entry, ...list.filter(x => x.id !== id)].slice(0, 10)); }
    S.projectId = id; history.replaceState(null, "", `?local=${id}`); toast(t("savedLocal")); return entry;
  }
  function download(name, blob) { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 800); }
  const exportPlan = () => download(`pod-studio-${S.kit || "plan"}.json`, new Blob([JSON.stringify({ ...snapshot(), quote: quoteFinal(), delivery: delivery(), design_data_url: designDataUrl(), exported_at: new Date().toISOString() }, null, 2)], { type: "application/json" }));
  async function downloadMock(pid) { const cv = document.createElement("canvas"); draw(cv, pid, { size: 1200 }); await new Promise(res => cv.toBlob(b => { download(`${pid}-mockup.png`, b); setTimeout(res, 300); }, "image/png")); }

  // ------------------------------------------------------------------ events
  const rerender = () => { render(); saveDraft(); };
  /** Switch the centre between scenes and studio without leaving the page; each side keeps its scroll position. */
  const scrollMem = {};
  function switchView(v) {
    if (v === "work" && !S.items.length) return;
    if (v === S.view) return;
    scrollMem[S.view] = window.scrollY;
    S.view = v; S.animate = true; if (v === "work" && !S.focus) S.focus = S.items[0]?.product_id;
    rerender();
    const top = scrollMem[v] ?? 0, centre = document.querySelector(".centre");
    window.scrollTo({ top: Math.min(top, centre ? centre.offsetTop + centre.offsetHeight : top), behavior: "instant" });
  }
  document.addEventListener("click", async e => {
    const el = e.target.closest("[data-others],[data-mat],[data-dmat],[data-browse],[data-sub],[data-openkit],[data-merge],[data-designkit],[data-designprod],[data-startflow],[data-bind],[data-platform],[data-unbind],[data-buyer],[data-usekit],[data-kitdetail],[data-detail],[data-toggle],[data-view],[data-tab],[data-cat],[data-catalog],[data-focus],[data-style],[data-mode],[data-color],[data-resetpl],[data-applyall],[data-dl],[data-lang],button,#drop,#drawerMask");
    if (!el) return;
    const d = el.dataset;
    if (d.others) { S.othersOpen = !(S.othersOpen || (S.browse !== WEDDING_SCENARIO)); if (!S.othersOpen && S.browse !== WEDDING_SCENARIO) S.browse = WEDDING_SCENARIO; return render(); }
    if (d.reviewfix) { const [tab, pid] = d.reviewfix.split(":"); S.tab = TABS.includes(tab) ? tab : "review"; if (pid && prod(pid)) S.focus = pid; return rerender(); }
    if (d.pkgrefupload) return $("#pkgRefInput").click();
    if (d.pkgrefremove) { S.submittedRef = null; S.submission = null; S.packagingRef = null; return rerender(); }
    if (d.toggle) { e.stopPropagation(); toggleProduct(d.toggle); if (d.close) closeDrawer(); rerender(); if ($("#drawer").classList.contains("open") && !d.close) catalogRefresh(); return; }
    if (d.close && d.usekit) { closeDrawer(); }
    if (d.buyer) { setBuyer(d.buyer); return rerender(); }
    if (d.bind) return openStoreModal();
    if (d.mat || d.dmat) { S.submittedRef = null; S.submission = null; const [pid, mid] = (d.mat || d.dmat).split(":"); const it = S.items.find(i => i.product_id === pid);
      if (it) it.material_id = mid; else S.pendingMat[pid] = mid;
      if (d.dmat) { rerender(); return productDetail(pid); } return rerender(); }
    if (d.platform) { S.platform = d.platform; return renderStoreModal(); }
    if (d.unbind) { S.stores = S.stores.filter(c => c.id !== d.unbind); if (S.publishStore === d.unbind) S.publishStore = ""; renderStoreModal(); return rerender(); }
    if (el.id === "storeBind") return bindStore();
    if (el.id === "storeClose") { $("#storeModal").classList.remove("open"); return; }
    if (d.usekit) { const [s, k] = d.usekit.split(":"); useKit(s, k); S.view = "scenes"; switchView("work"); return; }
    if (d.designkit) {
      const [scId, kitId] = d.designkit.split(":");
      const kit = D.scenarios.find(x => x.id === scId)?.kits.find(x => x.id === kitId);
      S.scenario = scId; S.kit = kitId; S.tab = "design";
      if (kit && (!S.focus || !kit.items.includes(S.focus))) S.focus = kit.items.find(inSel) || S.items[0]?.product_id || null;
      if (S.view === "work") rerender(); else switchView("work");
      return;
    }
    if (d.designprod) {
      const pid = d.designprod;
      if (!inSel(pid)) { S.items.push(newItem(pid)); S.kit = null; }
      S.focus = pid; S.tab = "design"; closeDrawer();
      if (S.view === "work") rerender(); else switchView("work");
      return;
    }
    if (d.kitdetail) { const [s, k] = d.kitdetail.split(":"); return kitDetail(s, k); }
    if (d.detail) return productDetail(d.detail);
    if (d.startflow) { S.tab = "design"; S.focus = S.focus && inSel(S.focus) ? S.focus : S.items[0]?.product_id || null; if (S.view === "work") rerender(); else switchView("work"); return; }
    if (d.view) { switchView(d.view); return; }
    if (d.browse) { S.browse = d.browse; S.openKit = null; S.animate = false; render(); saveDraft();
      const kp = document.getElementById("kitsPanel"); if (kp && window.matchMedia("(max-width:1250px)").matches) kp.scrollIntoView({ behavior: "smooth", block: "start" }); return; }
    if (d.sub) { S.sub = d.sub; return render(); }
    if (d.openkit) { S.openKit = S.openKit === d.openkit ? null : d.openkit; return render(); }
    if (d.merge) { const [sc, k] = d.merge.split(":"); mergeKit(sc, k); if (d.close) closeDrawer(); return rerender(); }
    if (d.tab) { S.tab = d.tab; return rerender(); }
    if (d.cat) { S.cat = d.cat; render(); return; }
    if (d.catalog) return catalogDrawer();
    if (d.focus) { S.focus = d.focus; if (S.tab !== "design") S.tab = "design"; return rerender(); }
    if (d.style) { S.textDesign.style = d.style; render(); return; }
    const f = S.items.find(i => i.product_id === S.focus);
    if (d.mode && f) { S.submittedRef = null; S.submission = null; f.placement.mode = d.mode; return rerender(); }
    if (d.color && f) { S.submittedRef = null; S.submission = null; f.placement.color = d.color; return rerender(); }
    if (d.resetpl && f) { S.submittedRef = null; S.submission = null; f.placement = { mode: null, scale: 1, dx: 0, dy: 0, color: f.placement.color }; return rerender(); }
    if (d.applyall && f) { S.submittedRef = null; S.submission = null; const shape = prod(f.product_id).shape; S.items.forEach(i => { if (i !== f && prod(i.product_id).shape === shape) i.placement = { ...f.placement, color: i.placement.color }; }); return rerender(); }
    if (d.dl) return downloadMock(d.dl);
    if (d.lang) { lang = d.lang; try { localStorage.setItem(LANG_KEY, lang); } catch {} window.PODCart?.relabel(); return render(); }
    if (el.id === "drop") return $("#fileInput").click();
    if (el.id === "drawerMask" || el.id === "drawerClose") return closeDrawer();
    if (el.id === "tdUse") { S.submittedRef = null; S.submission = null; S.textDesign.text = ($("#tdText").value.trim() || "A & B").split(/\s*\/\s*/).join("\n"); S.textDesign.color = $("#tdColor").value; S.design = { canvas: textDesignCanvas(), width: 1600, height: 1600, name: S.textDesign.text.replace(/\n/g, " ").slice(0, 30), source: "text", transparent: true }; return rerender(); }
    if (el.id === "csvBtn") return $("#csvInput").click();
    if (el.id === "csvTpl") return download("recipients-template.csv", new Blob(["\ufeffname,country,size\nLea Muster,CH,M\nJonas Weber,DE,L\nSam Lee,US,XL\n"], { type: "text/csv" }));
    if (el.id === "dlAll") { for (const l of quoteFinal().lines) await downloadMock(l.product_id); return; }
    if (el.id === "saveBtn") return saveProject();
    if (el.id === "exportBtn") return exportPlan();
    if (el.id === "addCartBtn") return addToCart();
    if (el.id === "publishShopifyBtn" || el.id === "publishShopifyBtn2") { const why = blockReasons(); if (why.length) { toast(t("blockedBy", { r: why[0] })); return; } if (!SERVER) { toast(t("needServer")); return; } return window.StudioSeller?.open(); }
    if (el.id === "quoteBtn") {
      if (!SERVER) { toast(t("needServer")); return; }
      try { await window.PODAuth?.require?.(); } catch { return; }
      $("#quoteTitle").textContent = t(`qt_${S.buyer}`); $("#quoteLead").textContent = t(`ql_${S.buyer}`); $("#vatField").style.display = S.buyer === "company" ? "" : "none"; $("#companyField").style.display = S.buyer === "individual" ? "none" : "";
      const u=window.PODAuth?.user; if(u){ const f=$("#quoteForm"); if(f?.elements?.email&&!f.elements.email.value)f.elements.email.value=u.email||""; if(f?.elements?.name&&!f.elements.name.value)f.elements.name.value=u.name||""; }
      $("#quoteModal").classList.add("open"); return; }
    if (el.id === "quoteCancel") { $("#quoteModal").classList.remove("open"); return; }
  });
  function catalogRefresh() { document.querySelectorAll("#drawerBody .add[data-toggle]").forEach(b => { const on = inSel(b.dataset.toggle); b.classList.toggle("in", on); b.textContent = on ? "✓" : "+"; }); }
  const timers = {};
  document.addEventListener("input", e => {
    const el = e.target, d = el.dataset, f = S.items.find(i => i.product_id === S.focus);
    if (d.pl && f) { S.submittedRef = null; S.submission = null; f.placement[d.pl] = Number(el.value); document.querySelectorAll(`canvas[data-p="${f.product_id}"]`).forEach(cv => draw(cv, f.product_id, { size: Number(cv.dataset.size) || undefined, showArea: cv.dataset.area === "1" }));
      clearTimeout(timers.pl); timers.pl = setTimeout(rerender, 350); return; }
    if (el.id === "margin") { S.submittedRef = null; S.submission = null; S.margin = Number(el.value) / 100; $("#marginVal").textContent = el.value + "%"; clearTimeout(timers.m); timers.m = setTimeout(rerender, 80); return; }
    if (el.id === "search") { S.search = el.value; clearTimeout(timers.s); timers.s = setTimeout(() => { const pos = el.selectionStart; render(); const n = $("#search"); n.focus(); n.setSelectionRange(pos, pos); }, 200); return; }
    if (el.id === "recipients") { setRecipients(el.value); clearTimeout(timers.r); timers.r = setTimeout(() => { const pos = el.selectionStart; rerender(); const n = $("#recipients"); if (n) { n.focus(); n.setSelectionRange(pos, pos); } }, 500); return; }
    if (el.id === "brandName" || el.id === "brandMsg") { S.submittedRef = null; S.submission = null; S.brand = { name: $("#brandName").value, message: $("#brandMsg").value }; drawPackaging(); saveDraft(); return; }
  });
  document.addEventListener("change", e => {
    const el = e.target, d = el.dataset;
    if (d.qty) { S.submittedRef = null; S.submission = null; S.items.find(i => i.product_id === d.qty).qty = Math.min(10000, Math.max(1, Math.round(Number(el.value) || 1))); return rerender(); }
    if (d.pp) { S.submittedRef = null; S.submission = null; S.items.find(i => i.product_id === d.pp).per_person = Math.min(20, Math.max(1, Math.round(Number(el.value) || 1))); return rerender(); }
    if (d.size) { S.submittedRef = null; S.submission = null; const [pid, z] = d.size.split(":"); const it = S.items.find(i => i.product_id === pid); it.sizes = { ...(it.sizes || {}), [z]: Math.max(0, Math.round(Number(el.value) || 0)) }; return rerender(); }
    if (d.pkg) { S.submittedRef = null; S.submission = null; S.packagingMode = "custom"; S.packaging = el.checked ? [...new Set([...S.packaging, d.pkg])] : S.packaging.filter(x => x !== d.pkg); return rerender(); }
    if (el.name === "packmode") { S.submittedRef = null; S.submission = null; S.packagingMode = el.value === "none" ? "none" : "custom"; if (S.packagingMode === "none") S.packaging = []; else if (!S.packaging.length) S.packaging = ["insert_card", "sticker"]; return rerender(); }
    if (el.name === "shipmode") { S.submittedRef = null; S.submission = null; S.ship.mode = el.value; return rerender(); }
    if (el.id === "autoExclude") { S.submittedRef = null; S.submission = null; S.autoExclude = el.checked; return rerender(); }
    if (el.id === "marketSel") { S.submittedRef = null; S.submission = null; S.market = el.value; if (window.PODMarket && el.value !== "US") PODMarket.set(el.value, { silent: true }); return rerender(); }
    if (el.id === "langSelect") { lang = el.value; try { localStorage.setItem(LANG_KEY, lang); } catch {} window.PODCart?.relabel(); return render(); }
    if (el.id === "roleSel") { setBuyer(el.value); S.browse = null; return rerender(); }
    if (el.id === "publishSel") { S.submittedRef = null; S.submission = null; S.publishStore = el.value; return saveDraft(); }
    if (el.id === "addressCountry") { S.submittedRef = null; S.submission = null; S.ship.address_country = el.value; return rerender(); }
    if (el.id === "sampleCountry") { S.submittedRef = null; S.submission = null; S.ship.sample_country = el.value; return rerender(); }
    if (el.id === "deadline") { S.submittedRef = null; S.submission = null; S.ship.deadline = el.value; return rerender(); }
    if (el.id === "fileInput") { loadFile(el.files[0]); el.value = ""; return; }
    if (el.id === "pkgRefInput") { loadPackagingReference(el.files[0]); el.value = ""; return; }
    if (el.id === "csvInput") { const file = el.files[0]; el.value = ""; if (!file) return; file.text().then(txt => { setRecipients(txt.replace(/^\ufeff/, "")); rerender(); }); return; }
  });
  document.addEventListener("keydown", e => { if (e.key === "Escape") { closeDrawer(); $("#quoteModal").classList.remove("open"); $("#storeModal").classList.remove("open"); } if (e.key === "Enter" && e.target.id === "storeInput") bindStore(); });
  document.addEventListener("dragover", e => { const z = e.target.closest?.("#drop"); if (z) { e.preventDefault(); z.classList.add("drag"); } });
  document.addEventListener("dragleave", e => { e.target.closest?.("#drop")?.classList.remove("drag"); });
  document.addEventListener("drop", e => { const z = e.target.closest?.("#drop"); if (z) { e.preventDefault(); z.classList.remove("drag"); loadFile(e.dataTransfer.files[0]); } });
  $("#drawerClose").addEventListener("click", closeDrawer);
  $("#quoteForm").addEventListener("submit", async e => {
    e.preventDefault(); const contact = Object.fromEntries(new FormData(e.target).entries());
    const saved = await saveProject(); if (!saved) return;
    const r = await fetch(`/api/studio/projects/${saved.id}/request-quote`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contact }) });
    const d = await r.json().catch(() => ({}));
    if (r.ok) { $("#quoteModal").classList.remove("open"); S.submittedRef = d.order_id || d.id || "OK"; S.submission = d; saveDraft(); rerender(); toast(t("sent") + S.submittedRef); } else toast(d.message || d.error || t("failed"));
  });
  window.addEventListener("resize", () => { clearTimeout(timers.rs); timers.rs = setTimeout(drawAll, 150); });

  // Seller publish panel (studio-seller.js) reads studio state through this narrow API.
  window.StudioApp = { D, P, M, S, t, nm, money, esc, toast, prod, matsOf, effPl, finalItems, quoteFinal, lang: () => lang, shopifyShop: () => { try { return localStorage.getItem("pod-shopify-shop") || ""; } catch { return ""; } } };
  // ------------------------------------------------------------------ boot
  // Shared header: language select (i18n.js) and the one market/currency selection (header.js PODMarket) drive the studio too.
  window.addEventListener("wedding-language-change", e => { const l = e.detail?.lang; if (l && l !== lang && ["zh", "en", "de"].includes(l)) { lang = l; window.PODCart?.relabel(); render(); } });
  window.addEventListener("pod-market-change", e => { e.preventDefault(); S.submittedRef = null; S.submission = null; S.market = e.detail.market; render(); saveDraft(); });
  (async () => {
    // if (SERVER) { try { await window.PODAuth.require(); } catch { location.href = "index.html"; return; } }
    const qs = new URLSearchParams(location.search);
    const syncShopifyStore = shop => {
      if (!shop) return;
      const idx = S.stores.findIndex(x => x.platform === "shopify" && x.store === shop);
      const entry = { id: idx >= 0 ? S.stores[idx].id : "sc_shopify", platform: "shopify", store: shop, status: "connected" };
      if (idx >= 0) S.stores[idx] = { ...S.stores[idx], status: "connected" };
      else S.stores.push(entry);
      if (!S.publishStore) S.publishStore = entry.id;
    };
    // Shopify app login (this browser) => merchant role + bound shop.
    const shopifyShop = () => { try { return localStorage.getItem("pod-shopify-shop") || ""; } catch { return ""; } };
    const becomeMerchant = (shop, force) => { if (!shop && !force) return; if (S.buyer !== "merchant") setBuyer("merchant"); if (shop) syncShopifyStore(shop); saveDraft(); };
    if (SERVER) {
      fetch("/api/shopify/app/public-status").then(r => r.ok ? r.json() : null).then(st => {
        const mine = shopifyShop(), shop = st?.shops?.find(x => x.shop === mine)?.shop;
        if (shop) { becomeMerchant(shop); render(); }
      }).catch(() => {});
    }
    window.addEventListener("pod-shopify-connected", e => { if (e.detail?.shop) { becomeMerchant(e.detail.shop); render(); } });
    window.addEventListener("pod-auth-changed", e => { if ((e.detail?.providers || []).includes("shopify")) { becomeMerchant(shopifyShop(), true); render(); } });
    if (SERVER) fetch("/api/storefront/fees").then(r => r.ok ? r.json() : null).then(f => { if (f) { FEES = f; if (S.view === "work") rerender(); } }).catch(() => {});
    try {
      if (qs.get("project") && SERVER) { const r = await fetch(`/api/studio/projects/${encodeURIComponent(qs.get("project"))}`); if (r.ok) { const p = await r.json(); S.projectId = p.id; restore({ ...p, all_items: p.all_items || p.items, view: "work", tab: "review" }, p.design_url); toast(t("loaded")); } }
      else if (qs.get("local")) { const p = (store.get(LOCAL_KEY) || []).find(x => x.id === qs.get("local")); if (p) { S.projectId = p.id; restore(p); toast(t("loaded")); } }
      else { const d = store.get(DRAFT_KEY); if (d) restore(d); }
      if (qs.get("connected") && SERVER) {
        const r = await fetch(`/api/studio/connections/${encodeURIComponent(qs.get("connected"))}`); if (r.ok) { const c = await r.json(); S.buyer = "merchant"; S.ship.mode = "dropship";
          S.stores = [...S.stores.filter(x => x.id !== c.id), c]; S.publishStore = c.id; if (c.status === "connected") toast(t("connectedOk")); }
        history.replaceState(null, "", location.pathname);
      }
      if (qs.get("buyer") && D.buyer_types.some(b => b.id === qs.get("buyer"))) setBuyer(qs.get("buyer"));
      if (qs.get("scenario") && D.scenarios.some(x => x.id === qs.get("scenario"))) {
        const scId = qs.get("scenario"), sc = D.scenarios.find(x => x.id === scId);
        S.browse = scId;
        if (qs.get("entry") === "home") {
          const preferredBuyer = (D.scenario_buyers?.[scId] || [])[0];
          if (!qs.get("buyer") && preferredBuyer) setBuyer(preferredBuyer);
          const ids = [...new Set(sc.kits.flatMap(k => k.items))];
          const keep = Object.fromEntries(S.items.map(i => [i.product_id, i]));
          S.items = ids.map(pid => keep[pid] || newItem(pid));
          S.scenario = scId; S.kit = null; S.focus = qs.get("product") && ids.includes(qs.get("product")) ? qs.get("product") : (ids[0] || null);
          S.view = "work"; S.tab = "design";
        } else S.view = "scenes";
      }
      if (qs.get("product") && prod(qs.get("product"))) setTimeout(() => productDetail(qs.get("product")), 60);
      const keep = Date.now() - 30 * 864e5, plans = store.get(LOCAL_KEY) || [];   // local privacy: forget old plans
      if (plans.some(x => Date.parse(x.saved_at) < keep)) store.set(LOCAL_KEY, plans.filter(x => Date.parse(x.saved_at) >= keep));
      if (qs.get("signed_in") === "shopify" || qs.get("shop_connected") || shopifyShop()) becomeMerchant(qs.get("shop_connected") || shopifyShop());
    } catch (err) { console.warn("studio restore failed", err); }
    render();
  })();
})();
