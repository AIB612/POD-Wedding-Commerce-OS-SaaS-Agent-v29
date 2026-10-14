export function startSchedulers(){
  const minutes=Number(process.env.SUPPLIER_SYNC_INTERVAL_MINUTES||0);if(!minutes)return;
  setInterval(()=>{console.log(`[scheduler] supplier sync tick ${new Date().toISOString()} — connect authorized feed job here`);},minutes*60_000).unref();
}
