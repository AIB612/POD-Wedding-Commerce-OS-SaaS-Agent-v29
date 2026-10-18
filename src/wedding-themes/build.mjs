// Builds assets/wedding/wb-themes.js from the sources in this folder.
// Run: npm run build:wedding-themes
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
const S=path.dirname(fileURLToPath(import.meta.url))+"/";
const OUT=path.resolve(S,"../../assets/wedding/wb-themes.js");
const rd=f=>fs.readFileSync(S+f,"utf8");
const THEMES=["letterpress","modern","garden","bloom","postcard","gallery"];
const SERIF=new Set(["BOD","COR","GIL","PIN","PLA","DMS","INS"]);
const fam=css=>css.replace(/\b(BOD|COR|GIL|PIN|PLA|DMS|INS|ANT|INT|TEN|JOS|OSW)\b(,(?:serif|sans-serif))?/g,(m,a)=>a+(SERIF.has(a)?",serif":",sans-serif"));
const strip=css=>css.replace(/\/\*[\s\S]*?\*\//g,"").replace(/\n{2,}/g,"\n").trim();
const sub={modern:[[/(?<!--lime:)#d6f450/g,"var(--lime)"]],bloom:[[/(?<!--pink:)#e8a9b5/g,"var(--pink)"]],garden:[[/(?<!--moss:)#38432f/g,"var(--moss)"],[/(?<!--gk:)#6c7a55/g,"var(--gk)"],[/(?<!--gl:)#8b9a72/g,"var(--gl)"]]};
const tx=(t,css)=>{for(const [a,b] of sub[t]||[])css=css.replace(a,b);return strip(fam(css))};
const out={base:strip(fam(rd("base.css")))};
for(const t of THEMES)out[t]=tx(t,rd("themes/"+t+".css"));
const envOut={common:strip(fam(rd("envelopes/_common.css"))),tail:strip(fam(rd("envelopes/_tail.css")))};
for(const t of THEMES)envOut[t]=tx(t,rd("envelopes/"+t+".css"));
const q=s=>"`"+s.replace(/\\/g,"\\\\").replace(/`/g,"\\`").replace(/\$\{/g,"\\${")+"`";
const render=rd("render.js");
const js=`/* Wedding website themes (v30) — generator-only asset, loaded by the builder in index.html.
 * Six page architectures built from the same content: Letterpress (card suite), Modern (Swiss poster grid),
 * Garden (herbarium split), Bloom (chapter story), Postcard (travel journal), Gallery (magazine issue),
 * each with its envelope-opening choreography and a printable 5x7 card. Pure functions: no DOM access. */
(function(G){"use strict";
const CSS={${Object.entries(out).map(([k,v])=>`${k}:${q(v)}`).join(",\n")}};
const ENVCSS={${Object.entries(envOut).map(([k,v])=>`${k}:${q(v)}`).join(",\n")}};
${render}
G.WBT={version:"30.1",TOT,FONTS,KEY,
 css:(t,o={})=>CSS.base+"\\n"+CSS[t]+(o.env?"\\n"+ENVCSS.common+"\\n"+ENVCSS[t]+"\\n"+ENVCSS.tail:""),
 page:(t,D,H)=>(PMI=0,R[t](D,H)),env:(t,D,H)=>E[t](D,H),card:(t,D,H)=>C[t](D,H)};
})(typeof window!=="undefined"?window:globalThis);
`;
fs.mkdirSync(path.dirname(OUT),{recursive:true});
fs.writeFileSync(OUT,js);
console.log("wb-themes.js",(js.length/1024).toFixed(1)+"KB");
