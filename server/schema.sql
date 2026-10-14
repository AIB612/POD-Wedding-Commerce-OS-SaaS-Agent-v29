-- Wedding Commerce OS v3 — PostgreSQL reference schema
create extension if not exists pgcrypto;
create extension if not exists citext; -- users.email uses citext

create table tenants(id uuid primary key default gen_random_uuid(),name text not null,plan text not null default 'starter',currency text default 'USD',created_at timestamptz default now());
create table users(id uuid primary key default gen_random_uuid(),email citext unique not null,display_name text,created_at timestamptz default now());
create table tenant_memberships(tenant_id uuid references tenants(id),user_id uuid references users(id),role text not null,primary key(tenant_id,user_id));
create table stores(id uuid primary key default gen_random_uuid(),tenant_id uuid references tenants(id),provider text not null,domain text,name text,status text,encrypted_access_token text,scopes text[],country text,currency text,external_shop_id text,created_at timestamptz default now(),unique(tenant_id,provider,domain));
create index stores_tenant_idx on stores(tenant_id);

create table suppliers(id uuid primary key default gen_random_uuid(),tenant_id uuid references tenants(id),name text,connector_type text,config_encrypted jsonb default '{}',currency text,active boolean default true);
create table products(id uuid primary key default gen_random_uuid(),tenant_id uuid references tenants(id),sku text not null,name text not null,description text,product_type text,supplier_id uuid references suppliers(id),supplier_cost numeric(12,2) default 0,inbound_shipping numeric(12,2) default 0,duty numeric(12,2) default 0,packaging numeric(12,2) default 0,base_price numeric(12,2) default 0,currency text default 'USD',inventory int default 0,scene_tags text[] default '{}',metadata jsonb default '{}',created_at timestamptz default now(),unique(tenant_id,sku));
create table product_listings(id uuid primary key default gen_random_uuid(),tenant_id uuid references tenants(id),product_id uuid references products(id),store_id uuid references stores(id),external_product_id text,external_variant_id text,status text,price numeric(12,2),sync_hash text,last_synced_at timestamptz,unique(store_id,product_id));
create table materials(id uuid primary key default gen_random_uuid(),tenant_id uuid references tenants(id),code text,name text,price_delta numeric(12,2) default 0,image_url text,specifications jsonb default '{}',unique(tenant_id,code));

create table customers(id uuid primary key default gen_random_uuid(),tenant_id uuid references tenants(id),email text,phone text,country text,profile jsonb default '{}',lifetime_value numeric(12,2) default 0,order_count int default 0,consent jsonb default '{}',created_at timestamptz default now());
create table customer_identities(id uuid primary key default gen_random_uuid(),tenant_id uuid references tenants(id),customer_id uuid references customers(id),source text,external_id text,attributes jsonb default '{}',unique(tenant_id,source,external_id));
create table customer_events(id bigserial primary key,tenant_id uuid references tenants(id),customer_id uuid references customers(id),event_type text,event_time timestamptz default now(),store_id uuid references stores(id),product_id uuid references products(id),campaign_id uuid,payload jsonb default '{}');
create index customer_events_profile_idx on customer_events(tenant_id,customer_id,event_time desc);
create table customer_segments(id uuid primary key default gen_random_uuid(),tenant_id uuid references tenants(id),name text,definition jsonb,status text default 'active',created_at timestamptz default now());
create table recommendation_events(id bigserial primary key,tenant_id uuid references tenants(id),customer_id uuid references customers(id),product_id uuid references products(id),model_version text,score numeric,reason text,event_type text,created_at timestamptz default now());

create table orders(id uuid primary key default gen_random_uuid(),tenant_id uuid references tenants(id),store_id uuid references stores(id),external_order_id text,status text,payment_status text,currency text,revenue numeric(12,2),cogs numeric(12,2),shipping_cost numeric(12,2),payment_fee numeric(12,2),affiliate_commission numeric(12,2),ad_attributed_cost numeric(12,2),customer_id uuid references customers(id),provider_payload jsonb default '{}',channel text,customer_email citext,shipping_address jsonb default '{}',paypal_order_id text,paypal_capture_id text,paid_at timestamptz,created_at timestamptz default now(),updated_at timestamptz,unique(store_id,external_order_id));
create table order_items(id uuid primary key default gen_random_uuid(),tenant_id uuid references tenants(id),order_id uuid references orders(id),product_id uuid references products(id),sku text,name text,quantity int,unit_price numeric(12,2),supplier_unit_cost numeric(12,2),material_snapshot jsonb default '{}',customization jsonb default '{}');
create table order_events(id bigserial primary key,tenant_id uuid references tenants(id),order_id uuid references orders(id),event_type text,event_time timestamptz default now(),source text,payload jsonb default '{}');
create table proofs(id uuid primary key default gen_random_uuid(),tenant_id uuid references tenants(id),order_id uuid references orders(id),token text unique not null,status text not null default 'Pending',proof_url text,material text,created_at timestamptz default now(),updated_at timestamptz,approved_at timestamptz);
create table shipments(id uuid primary key default gen_random_uuid(),tenant_id uuid references tenants(id),order_id uuid references orders(id),provider text,carrier text,tracking_number text,status text,eta timestamptz,last_event jsonb default '{}',updated_at timestamptz default now());
create table tracking_events(id bigserial primary key,tenant_id uuid references tenants(id),shipment_id uuid references shipments(id),event_time timestamptz,status text,location text,description text,raw_payload jsonb default '{}');
create table payments(id uuid primary key default gen_random_uuid(),tenant_id uuid references tenants(id),order_id uuid references orders(id),provider text,external_payment_id text,status text,amount numeric(12,2),currency text,raw_payload jsonb default '{}',created_at timestamptz default now());

create table ad_accounts(id uuid primary key default gen_random_uuid(),tenant_id uuid references tenants(id),platform text,external_account_id text,name text,status text,encrypted_token text,metadata jsonb default '{}');
create table campaigns(id uuid primary key default gen_random_uuid(),tenant_id uuid references tenants(id),ad_account_id uuid references ad_accounts(id),platform text,external_campaign_id text,name text,objective text,status text,budget numeric(12,2),currency text,metadata jsonb default '{}');
create table campaign_metrics(id bigserial primary key,tenant_id uuid references tenants(id),campaign_id uuid references campaigns(id),metric_date date,spend numeric(12,2),revenue numeric(12,2),impressions bigint,clicks bigint,conversions numeric,raw_metrics jsonb default '{}',unique(campaign_id,metric_date));
create table marketing_attribution(id bigserial primary key,tenant_id uuid references tenants(id),order_id uuid references orders(id),campaign_id uuid references campaigns(id),source text,medium text,content text,attributed_revenue numeric(12,2),model text,created_at timestamptz default now());

create table influencers(id uuid primary key default gen_random_uuid(),tenant_id uuid references tenants(id),platform text,external_id text,handle text,followers bigint,engagement_rate numeric,country text,categories text[],metrics jsonb default '{}',estimated_cpm numeric,status text,updated_at timestamptz default now());
create table influencer_campaigns(id uuid primary key default gen_random_uuid(),tenant_id uuid references tenants(id),influencer_id uuid references influencers(id),campaign_id uuid references campaigns(id),status text,fee numeric(12,2),currency text,brief jsonb default '{}',performance jsonb default '{}');
create table affiliates(id uuid primary key default gen_random_uuid(),tenant_id uuid references tenants(id),name text,code text,commission_rate numeric,status text,payout_details_encrypted jsonb default '{}',unique(tenant_id,code));
create table affiliate_conversions(id bigserial primary key,tenant_id uuid references tenants(id),affiliate_id uuid references affiliates(id),order_id uuid references orders(id),revenue numeric(12,2),commission numeric(12,2),status text,created_at timestamptz default now());

create table conversations(id uuid primary key default gen_random_uuid(),tenant_id uuid references tenants(id),customer_id uuid references customers(id),channel text,external_thread_id text,state jsonb default '{}',created_at timestamptz default now());
create table messages(id bigserial primary key,tenant_id uuid references tenants(id),conversation_id uuid references conversations(id),role text,channel text,content jsonb,created_at timestamptz default now());
create table agent_tasks(id uuid primary key default gen_random_uuid(),tenant_id uuid references tenants(id),conversation_id uuid references conversations(id),task_type text,title text,status text,risk text,payload jsonb default '{}',requires_approval boolean default false,approved_by uuid references users(id),approved_at timestamptz,created_at timestamptz default now());
create table agent_runs(id uuid primary key default gen_random_uuid(),tenant_id uuid references tenants(id),conversation_id uuid references conversations(id),intent text,plan jsonb default '[]',retrieved_document_ids text[] default '{}',tool_calls jsonb default '[]',result_summary text,created_at timestamptz default now());
create table audit_logs(id bigserial primary key,tenant_id uuid references tenants(id),actor_type text,actor_id text,action text,resource_type text,resource_id text,risk text,payload jsonb default '{}',created_at timestamptz default now());
create table webhook_deliveries(id text primary key,tenant_id uuid references tenants(id),provider text,topic text,status text,attempt_count int default 0,payload_hash text,processed_at timestamptz,created_at timestamptz default now());

create table knowledge_documents(id uuid primary key default gen_random_uuid(),tenant_id uuid references tenants(id),doc_type text,title text,body text,metadata jsonb default '{}',embedding_ref text,valid_from timestamptz,valid_to timestamptz,updated_at timestamptz default now());

-- v29 customer-facing POD Studio accounts / projects / notifications.
-- These remain separate from back-office `users`, which are tenant staff/admin identities.
create table if not exists customer_accounts(
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id),
  email citext not null,
  name text,
  password_hash text,
  password_salt text,
  role text not null default 'customer',
  status text not null default 'active',
  last_login_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz,
  unique(tenant_id,email)
);
create table if not exists customer_sessions(
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id),
  user_id uuid references customer_accounts(id),
  token_hash text unique not null,
  expires_at timestamptz not null,
  created_at timestamptz default now()
);
create table if not exists login_codes(
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id),
  email citext not null,
  name text,
  code_hash text not null,
  expires_at timestamptz not null,
  created_at timestamptz default now()
);
create table if not exists studio_projects(
  id text primary key,
  tenant_id uuid references tenants(id),
  user_id uuid references customer_accounts(id),
  status text not null default 'draft',
  scenario_id text,
  kit_id text,
  buyer_type text,
  payload jsonb not null default '{}',
  order_ref text,
  expires_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz
);
create table if not exists notifications(
  id text primary key,
  tenant_id uuid references tenants(id),
  user_id uuid references customer_accounts(id),
  related_id text,
  type text,
  channel text,
  "to" text,
  subject text,
  provider text,
  status text,
  error text,
  created_at timestamptz default now()
);
create table if not exists invitations(
  id text primary key,
  tenant_id uuid references tenants(id),
  user_id uuid references customer_accounts(id),
  names text,
  scene text,
  url text,
  status text default 'published',
  created_at timestamptz default now(),
  updated_at timestamptz
);
