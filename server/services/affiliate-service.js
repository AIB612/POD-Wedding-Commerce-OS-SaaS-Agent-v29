import {listForTenant} from "../saas-store.js";export async function affiliateSummary(tenantId){return listForTenant("affiliates",tenantId);}
