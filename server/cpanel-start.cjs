// CommonJS entry for cPanel / LiteSpeed (lsnode uses require(), app.js is ESM with top-level await).
import("./app.js").catch(err => { console.error(err); process.exit(1); });
