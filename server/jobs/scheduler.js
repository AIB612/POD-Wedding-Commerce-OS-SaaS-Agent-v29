import { startFxSync } from "../services/fx-service.js";
export function startSchedulers(){
  startFxSync().catch(e=>console.warn("[fx] start failed",e.message));
  const minutes=Number(process.env.SUPPLIER_SYNC_INTERVAL_MINUTES||0);if(!minutes)return;
  setInterval(()=>{console.log(`[scheduler] supplier sync tick ${new Date().toISOString()} — connect authorized feed job here`);},minutes*60_000).unref();
}
