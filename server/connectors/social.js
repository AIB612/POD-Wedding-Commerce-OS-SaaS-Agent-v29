import {listForTenant} from "../saas-store.js";
export const creatorSources={
  tiktok:{official_path:"TikTok One / Discovery APIs",notes:"Use authorized TikTok API for Business/TikTok One access; do not scrape creator data."},
  youtube:{official_path:"YouTube Data API + YouTube Analytics (authorized channels)",notes:"Public channel/video metadata and authorized analytics."},
  instagram:{official_path:"Meta/Instagram Graph APIs subject to app permissions",notes:"Availability depends on account type, permissions and Meta review."},
  pinterest:{official_path:"Pinterest API organic analytics / trends",notes:"Use business-authorized API access."},
  linkedin:{official_path:"LinkedIn Community/Marketing APIs",notes:"Creator/company metrics require appropriate products/access tier."},
  reddit:{official_path:"Reddit Ads API / Developer Platform",notes:"Use ads and approved developer surfaces, not bulk public scraping."},
  x:{official_path:"X API / Ads API",notes:"Access tier and permitted use vary; keep connector isolated."}
};
export async function discoverInfluencers({tenantId,platform,category,minFollowers=0}){
  let rows=await listForTenant("influencers",tenantId);if(platform)rows=rows.filter(x=>x.platform===platform);if(category)rows=rows.filter(x=>x.categories?.includes(category));return rows.filter(x=>x.followers>=minFollowers).sort((a,b)=>(b.engagement_rate||0)-(a.engagement_rate||0));
}
