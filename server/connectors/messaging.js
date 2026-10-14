export const messagingChannels={
  webchat:{label:"Website Chat",configured:()=>true,send_mode:"internal"},
  email:{label:"Email",configured:()=>!!process.env.SENDGRID_API_KEY||!!process.env.POSTMARK_SERVER_TOKEN,send_mode:"provider"},
  whatsapp:{label:"WhatsApp Business",configured:()=>!!process.env.WHATSAPP_ACCESS_TOKEN,send_mode:"meta"},
  instagram_dm:{label:"Instagram Messaging",configured:()=>!!process.env.META_SYSTEM_USER_TOKEN,send_mode:"meta_permissions"},
  facebook_messenger:{label:"Facebook Messenger",configured:()=>!!process.env.META_SYSTEM_USER_TOKEN,send_mode:"meta_permissions"},
  tiktok_business:{label:"TikTok Business Messaging",configured:()=>!!process.env.TIKTOK_ACCESS_TOKEN,send_mode:"tiktok_business"},
  shopify_inbox:{label:"Shopify Inbox / customer conversation adapter",configured:()=>!!process.env.SHOPIFY_CLIENT_ID,send_mode:"shopify_capability_dependent"}
};
export function messagingStatus(){return Object.entries(messagingChannels).map(([id,c])=>({id,label:c.label,configured:c.configured(),send_mode:c.send_mode}));}
export async function sendMessageDraft({channel,conversationId,text}){
  if(!messagingChannels[channel])throw new Error("unsupported_message_channel");
  return {conversation_id:conversationId,channel,text,status:"draft",requires_approval:true,provider_configured:messagingChannels[channel].configured()};
}
