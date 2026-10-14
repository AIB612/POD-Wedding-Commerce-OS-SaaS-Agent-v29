// Demo data (same shape as /api/saas/*), used when the backend is unreachable.
export const demo = {
 "overview": {
  "stores": 3,
  "orders": 3,
  "shipments": 2,
  "products": 3,
  "open_tasks": 3,
  "finance": {
   "revenue": 993,
   "cogs": 358,
   "shipping": 63,
   "payment_fees": 34.76,
   "affiliates": 34.75,
   "ads": 121,
   "contribution_margin": 381.49,
   "margin_rate": 0.3842
  }
 },
 "stores": [
  {
   "id": "store_ch_1",
   "tenant_id": "tenant_demo",
   "provider": "shopify",
   "name": "Wedding Atelier CH",
   "domain": "wedding-atelier-ch.myshopify.com",
   "status": "connected",
   "currency": "CHF",
   "country": "CH"
  },
  {
   "id": "store_us_1",
   "tenant_id": "tenant_demo",
   "provider": "shopify",
   "name": "Wedding Atelier US",
   "domain": "wedding-atelier-us.myshopify.com",
   "status": "connected",
   "currency": "USD",
   "country": "US"
  },
  {
   "id": "store_custom_1",
   "tenant_id": "tenant_demo",
   "provider": "custom",
   "name": "Direct POD Store",
   "domain": "direct.example.com",
   "status": "connected",
   "currency": "USD",
   "country": "US"
  }
 ],
 "orders": [
  {
   "id": "POD-2026-1008",
   "tenant_id": "tenant_demo",
   "store_id": "store_ch_1",
   "external_order_id": "#1048",
   "status": "Proofing",
   "payment_status": "paid",
   "customer_id": "cust_1",
   "revenue": 298.0,
   "cogs": 92.0,
   "shipping_cost": 16.0,
   "payment_fee": 10.43,
   "affiliate_commission": 0,
   "ad_attributed_cost": 42.0,
   "currency": "CHF",
   "created_at": "2026-10-04T10:00:00Z",
   "items": [
    {
     "name": "Acrylic Welcome Sign",
     "quantity": 1,
     "material": "磨砂亚克力"
    }
   ]
  },
  {
   "id": "POD-2026-1009",
   "tenant_id": "tenant_demo",
   "store_id": "store_us_1",
   "external_order_id": "#2091",
   "status": "Production",
   "payment_status": "paid",
   "customer_id": "cust_2",
   "revenue": 506.0,
   "cogs": 198.0,
   "shipping_cost": 28.0,
   "payment_fee": 17.71,
   "affiliate_commission": 25.3,
   "ad_attributed_cost": 58.0,
   "currency": "USD",
   "created_at": "2026-10-03T09:15:00Z"
  },
  {
   "id": "POD-2026-1010",
   "tenant_id": "tenant_demo",
   "store_id": "store_custom_1",
   "external_order_id": "D-310",
   "status": "Shipped",
   "payment_status": "paid",
   "customer_id": "cust_3",
   "revenue": 189.0,
   "cogs": 68.0,
   "shipping_cost": 19.0,
   "payment_fee": 6.62,
   "affiliate_commission": 9.45,
   "ad_attributed_cost": 21.0,
   "currency": "USD",
   "created_at": "2026-10-02T14:20:00Z"
  }
 ],
 "shipments": [
  {
   "id": "ship_1",
   "tenant_id": "tenant_demo",
   "order_id": "POD-2026-1010",
   "carrier": "DHL",
   "tracking_number": "TRK-DEMO-8821",
   "status": "In transit",
   "eta": "2026-10-09",
   "last_event": "Basel Distribution Center"
  },
  {
   "id": "ship_2",
   "tenant_id": "tenant_demo",
   "order_id": "POD-2026-1009",
   "carrier": "UPS",
   "tracking_number": "TRK-DEMO-9912",
   "status": "Label created",
   "eta": "2026-10-13",
   "last_event": "Shipment information received"
  }
 ],
 "catalog": [
  {
   "id": "p_menu",
   "tenant_id": "tenant_demo",
   "sku": "MENU-001",
   "name": "Wedding Menu Card",
   "source": "supplier_api",
   "supplier_id": "sup_print",
   "supplier_cost": 3.2,
   "inbound_shipping": 0.4,
   "duty": 0.1,
   "packaging": 0.25,
   "base_price": 12.9,
   "inventory": 680,
   "scene_tags": [
    "cream",
    "french",
    "modern"
   ],
   "landed_cost": 3.95,
   "gross_margin": 0.6938
  },
  {
   "id": "p_sign",
   "tenant_id": "tenant_demo",
   "sku": "SIGN-ACR-01",
   "name": "Acrylic Welcome Sign",
   "source": "supplier_api",
   "supplier_id": "sup_sign",
   "supplier_cost": 24.0,
   "inbound_shipping": 4.5,
   "duty": 1.2,
   "packaging": 1.1,
   "base_price": 68.0,
   "inventory": 120,
   "scene_tags": [
    "cream",
    "beach",
    "modern"
   ],
   "landed_cost": 30.8,
   "gross_margin": 0.5471
  },
  {
   "id": "p_gift",
   "tenant_id": "tenant_demo",
   "sku": "GIFT-BOX-01",
   "name": "Personalized Gift Box",
   "source": "csv_feed",
   "supplier_id": "sup_gift",
   "supplier_cost": 11.0,
   "inbound_shipping": 1.8,
   "duty": 0.5,
   "packaging": 0.7,
   "base_price": 32.0,
   "inventory": 340,
   "scene_tags": [
    "cream",
    "rustic"
   ],
   "landed_cost": 14.0,
   "gross_margin": 0.5625
  }
 ],
 "finance": {
  "revenue": 993,
  "cogs": 358,
  "shipping": 63,
  "payment_fees": 34.76,
  "affiliates": 34.75,
  "ads": 121,
  "contribution_margin": 381.49,
  "margin_rate": 0.3842
 },
 "marketing": {
  "campaigns": [
   {
    "id": "camp_google_1",
    "tenant_id": "tenant_demo",
    "platform": "google_ads",
    "name": "Wedding Menu Search",
    "status": "active",
    "spend": 680,
    "revenue": 2380,
    "clicks": 1480,
    "conversions": 42,
    "currency": "USD",
    "roas": 3.5,
    "cpa": 16.19047619047619
   },
   {
    "id": "camp_meta_1",
    "tenant_id": "tenant_demo",
    "platform": "meta",
    "name": "Cream Garden Retargeting",
    "status": "active",
    "spend": 410,
    "revenue": 1640,
    "clicks": 1190,
    "conversions": 31,
    "currency": "USD",
    "roas": 4.0,
    "cpa": 13.225806451612904
   },
   {
    "id": "camp_tiktok_1",
    "tenant_id": "tenant_demo",
    "platform": "tiktok",
    "name": "Wedding Decor Video",
    "status": "active",
    "spend": 330,
    "revenue": 890,
    "clicks": 2130,
    "conversions": 18,
    "currency": "USD",
    "roas": 2.696969696969697,
    "cpa": 18.333333333333332
   },
   {
    "id": "camp_pinterest_1",
    "tenant_id": "tenant_demo",
    "platform": "pinterest",
    "name": "Invitation Inspiration",
    "status": "draft",
    "spend": 0,
    "revenue": 0,
    "clicks": 0,
    "conversions": 0,
    "currency": "USD",
    "roas": 0,
    "cpa": 0
   }
  ],
  "ideas": [],
  "platforms": []
 },
 "customers": [
  {
   "id": "cust_1",
   "tenant_id": "tenant_demo",
   "email": "anna@example.com",
   "country": "CH",
   "lifetime_value": 862,
   "orders": 3,
   "favorite_scene": "cream",
   "acquisition": "instagram",
   "last_seen": "2026-10-04",
   "traits": [
    "premium-paper",
    "garden-style",
    "mobile"
   ],
   "segment": "VIP"
  },
  {
   "id": "cust_2",
   "tenant_id": "tenant_demo",
   "email": "leo@example.com",
   "country": "US",
   "lifetime_value": 506,
   "orders": 1,
   "favorite_scene": "french",
   "acquisition": "google",
   "last_seen": "2026-10-03",
   "traits": [
    "bulk-order",
    "formal",
    "desktop"
   ],
   "segment": "New"
  },
  {
   "id": "cust_3",
   "tenant_id": "tenant_demo",
   "email": "mia@example.com",
   "country": "US",
   "lifetime_value": 390,
   "orders": 2,
   "favorite_scene": "rustic",
   "acquisition": "affiliate",
   "last_seen": "2026-10-02",
   "traits": [
    "gift-buyer",
    "rustic",
    "returning"
   ],
   "segment": "Returning"
  }
 ],
 "conversations": {
  "channels": [],
  "conversations": [
   {
    "id": "conv_1",
    "tenant_id": "tenant_demo",
    "channel": "webchat",
    "customer_id": "cust_1",
    "external_thread_id": "web_201",
    "status": "open",
    "subject": "Cream Garden 定制与材质",
    "last_message": "想把邀请卡改成珠光纸，50份多少钱？",
    "updated_at": "2026-10-05T10:20:00Z",
    "assigned_to": "agent"
   },
   {
    "id": "conv_2",
    "tenant_id": "tenant_demo",
    "channel": "instagram_dm",
    "customer_id": "cust_3",
    "external_thread_id": "ig_883",
    "status": "open",
    "subject": "伴手礼合作咨询",
    "last_message": "Can you customize 80 gift boxes with our monogram?",
    "updated_at": "2026-10-05T09:45:00Z",
    "assigned_to": "agent"
   },
   {
    "id": "conv_3",
    "tenant_id": "tenant_demo",
    "channel": "email",
    "customer_id": "cust_2",
    "external_thread_id": "mail_772",
    "status": "waiting_customer",
    "subject": "Proof approval",
    "last_message": "Please confirm the revised menu proof.",
    "updated_at": "2026-10-05T08:50:00Z",
    "assigned_to": "human"
   }
  ],
  "messages": [
   {
    "id": "msg_1",
    "tenant_id": "tenant_demo",
    "conversation_id": "conv_1",
    "role": "customer",
    "channel": "webchat",
    "text": "想把邀请卡改成珠光纸，50份多少钱？",
    "created_at": "2026-10-05T10:20:00Z"
   },
   {
    "id": "msg_2",
    "tenant_id": "tenant_demo",
    "conversation_id": "conv_2",
    "role": "customer",
    "channel": "instagram_dm",
    "text": "Can you customize 80 gift boxes with our monogram?",
    "created_at": "2026-10-05T09:45:00Z"
   },
   {
    "id": "msg_3",
    "tenant_id": "tenant_demo",
    "conversation_id": "conv_3",
    "role": "agent",
    "channel": "email",
    "text": "Please confirm the revised menu proof.",
    "created_at": "2026-10-05T08:50:00Z"
   }
  ]
 },
 "influencers": {
  "items": [
   {
    "id": "inf_1",
    "tenant_id": "tenant_demo",
    "platform": "instagram",
    "handle": "@modernbride",
    "followers": 184000,
    "engagement_rate": 0.041,
    "country": "US",
    "categories": [
     "wedding",
     "fashion"
    ],
    "estimated_cpm": 18,
    "status": "shortlisted"
   },
   {
    "id": "inf_2",
    "tenant_id": "tenant_demo",
    "platform": "tiktok",
    "handle": "@weddingideasdaily",
    "followers": 421000,
    "engagement_rate": 0.063,
    "country": "GB",
    "categories": [
     "wedding",
     "diy"
    ],
    "estimated_cpm": 14,
    "status": "new"
   },
   {
    "id": "inf_3",
    "tenant_id": "tenant_demo",
    "platform": "youtube",
    "handle": "The Minimal Wedding",
    "followers": 98000,
    "engagement_rate": 0.052,
    "country": "US",
    "categories": [
     "wedding",
     "planning"
    ],
    "estimated_cpm": 22,
    "status": "contacted"
   },
   {
    "id": "inf_4",
    "tenant_id": "tenant_demo",
    "platform": "pinterest",
    "handle": "Garden Ceremony Ideas",
    "followers": 75000,
    "engagement_rate": 0.036,
    "country": "CH",
    "categories": [
     "wedding",
     "garden"
    ],
    "estimated_cpm": 12,
    "status": "new"
   },
   {
    "id": "inf_5",
    "tenant_id": "tenant_demo",
    "platform": "linkedin",
    "handle": "Luxury Event Network",
    "followers": 54000,
    "engagement_rate": 0.028,
    "country": "DE",
    "categories": [
     "events",
     "b2b"
    ],
    "estimated_cpm": 30,
    "status": "new"
   }
  ]
 },
 "affiliates": [
  {
   "id": "aff_1",
   "tenant_id": "tenant_demo",
   "name": "Bridal Planner Network",
   "code": "BRIDE10",
   "commission_rate": 0.1,
   "revenue": 1240,
   "commission_due": 124,
   "status": "active"
  },
  {
   "id": "aff_2",
   "tenant_id": "tenant_demo",
   "name": "Garden Venue Partners",
   "code": "GARDEN8",
   "commission_rate": 0.08,
   "revenue": 860,
   "commission_due": 68.8,
   "status": "active"
  }
 ],
 "tasks": [
  {
   "id": "task_1",
   "tenant_id": "tenant_demo",
   "type": "marketing_review",
   "title": "Review TikTok campaign ROAS",
   "status": "needs_approval",
   "risk": "medium",
   "created_at": "2026-10-05T08:00:00Z"
  },
  {
   "id": "task_2",
   "tenant_id": "tenant_demo",
   "type": "catalog_sync",
   "title": "Sync supplier catalog to 2 Shopify stores",
   "status": "queued",
   "risk": "low",
   "created_at": "2026-10-05T08:20:00Z"
  },
  {
   "id": "task_3",
   "tenant_id": "tenant_demo",
   "type": "influencer_outreach",
   "title": "Prepare outreach draft for 3 creators",
   "status": "draft",
   "risk": "low",
   "created_at": "2026-10-05T09:10:00Z"
  }
 ],
 "connectors": {
  "protocols": [],
  "marketing": [],
  "commerce": [],
  "logistics": [],
  "messaging": [],
  "shopify": {
   "configured": false
  },
  "paypal": {
   "configured": false
  }
 }
};
