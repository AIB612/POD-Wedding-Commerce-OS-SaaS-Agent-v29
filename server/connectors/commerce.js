export const commerceChannels={
  shopify:{label:"Shopify",mode:"oauth_multistore",configured:()=>!!process.env.SHOPIFY_CLIENT_ID},
  woocommerce:{label:"WooCommerce",mode:"rest_oauth_or_keys",configured:()=>!!process.env.WOOCOMMERCE_BASE_URL&&!!process.env.WOOCOMMERCE_CONSUMER_KEY},
  magento:{label:"Adobe Commerce / Magento",mode:"rest_graphql",configured:()=>!!process.env.MAGENTO_BASE_URL&&!!process.env.MAGENTO_ACCESS_TOKEN},
  custom:{label:"Custom Store / ERP",mode:"webhook_api",configured:()=>true}
};
export function commerceChannelStatus(){return Object.entries(commerceChannels).map(([id,x])=>({id,label:x.label,mode:x.mode,configured:x.configured()}));}
export async function getOrder(orderId){return {order_id:orderId,status:"Use internal Order Hub first; provider adapters are channel mirrors, not the business source of truth."};}
