export const marketingPlatforms={
  google_ads:{label:"Google Ads",capabilities:["campaigns","reporting","audiences","conversion"],configured:()=>!!process.env.GOOGLE_ADS_DEVELOPER_TOKEN},
  meta:{label:"Meta Marketing API",capabilities:["campaigns","ads","insights","audiences","conversions"],configured:()=>!!process.env.META_SYSTEM_USER_TOKEN},
  tiktok:{label:"TikTok API for Business",capabilities:["campaigns","reporting","organic","creator_marketplace","messaging"],configured:()=>!!process.env.TIKTOK_ACCESS_TOKEN},
  pinterest:{label:"Pinterest API",capabilities:["catalogs","shopping_ads","campaigns","analytics","trends"],configured:()=>!!process.env.PINTEREST_ACCESS_TOKEN},
  reddit:{label:"Reddit Ads API v3",capabilities:["campaigns","creative_assets","reporting","forecasting","conversions"],configured:()=>!!process.env.REDDIT_ADS_REFRESH_TOKEN},
  linkedin:{label:"LinkedIn Marketing API",capabilities:["advertising","reporting","community","leads","matched_audiences","conversions"],configured:()=>!!process.env.LINKEDIN_ACCESS_TOKEN},
  youtube:{label:"YouTube Data/Analytics",capabilities:["channel_discovery","video_stats","analytics"],configured:()=>!!process.env.YOUTUBE_REFRESH_TOKEN},
  x:{label:"X Ads/API",capabilities:["campaigns","analytics","organic"],configured:()=>!!process.env.X_ACCESS_TOKEN}
};
export function platformStatus(){return Object.entries(marketingPlatforms).map(([id,p])=>({id,label:p.label,capabilities:p.capabilities,configured:p.configured()}));}
export async function createCampaignDraft({platform,objective,budget,product_ids=[]}){
  if(!marketingPlatforms[platform])throw new Error("unsupported_marketing_platform");
  return {id:`draft_${platform}_${Date.now()}`,platform,objective,budget,product_ids,status:"draft",requires_approval:true};
}
export async function publishCampaign({draft,approved=false}){
  if(!approved) return {status:"needs_approval",draft};
  if(!marketingPlatforms[draft.platform]?.configured()) return {status:"connector_not_configured",draft};
  return {status:"provider_call_scaffold",message:"Provider-specific campaign creation must map the approved draft to the platform SDK/API.",draft};
}
