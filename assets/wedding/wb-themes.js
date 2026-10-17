/* Wedding website themes (v30) — generator-only asset, loaded by the builder in index.html.
 * Six page architectures built from the same content: Letterpress (card suite), Modern (Swiss poster grid),
 * Garden (herbarium split), Bloom (chapter story), Postcard (travel journal), Gallery (magazine issue),
 * each with its envelope-opening choreography and a printable 5x7 card. Pure functions: no DOM access. */
(function(G){"use strict";
const CSS={base:`*{box-sizing:border-box}html,body{margin:0}html{scroll-behavior:smooth;-webkit-text-size-adjust:100%}
body{-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility;overflow-wrap:break-word}
img{display:block;max-width:100%}a{color:inherit}button,input,select,textarea{font:inherit;color:inherit}button{cursor:pointer}
[id]{scroll-margin-top:64px}
.ph{width:100%;height:100%;object-fit:cover}[data-lb]{cursor:zoom-in}
.wb-map{display:block;color:inherit}
.wb-cta{display:flex;gap:8px;flex-wrap:wrap;justify-content:center;margin-top:28px;position:relative}
.alt{opacity:.78}
.wx-hint{flex-basis:100%;font-size:13px;line-height:1.5;margin:10px 0 0;opacity:.85}
.rs label{display:block}.rs input:not([type=radio]),.rs select,.rs textarea{width:100%;background:transparent;border:0;outline:0;border-radius:0;-webkit-appearance:none;appearance:none}
.rs select{background-image:linear-gradient(45deg,transparent 50%,currentColor 50%),linear-gradient(135deg,currentColor 50%,transparent 50%);background-position:calc(100% - 12px) 55%,calc(100% - 7px) 55%;background-size:5px 5px;background-repeat:no-repeat}
.rs input:focus-visible,.rs select:focus-visible,.rs button:focus-visible{outline:2px solid currentColor;outline-offset:3px}
.rs .att{display:flex;gap:10px;flex-wrap:wrap}.rs .att label{flex:1;min-width:140px;cursor:pointer;position:relative;overflow:hidden}
.rs .att input{position:absolute;opacity:0;left:0;top:0;width:1px;height:1px}.rs .att input:focus-visible+span{outline:2px solid currentColor;outline-offset:2px}
.rs .two{display:grid;grid-template-columns:1fr 2fr;gap:inherit}
.rs .off{opacity:.35;pointer-events:none}
.rs .hp{position:absolute!important;left:-9999px;width:1px;height:1px;opacity:0}
.rs button{cursor:pointer}.rs button[disabled]{opacity:.6;cursor:default}
.rs-more{display:flex;gap:14px;flex-wrap:wrap;justify-content:center;font-size:13px;letter-spacing:.06em}.rs-more a{text-decoration:underline;text-underline-offset:3px}
.rsvp-msg{margin:0;min-height:1.2em;font-size:15px;line-height:1.5}.rsvp-msg:empty{display:none}.rsvp-msg.ok{font-size:19px}
.rs .privacy{margin:0;font-size:12px;opacity:.65;letter-spacing:.02em;text-transform:none}
.rs-link{display:grid;gap:16px;justify-items:center;text-align:center}
@media(max-width:700px){.rs .two{grid-template-columns:1fr}.rs .att label{flex-basis:100%}}
.rv{transition:opacity .9s cubic-bezier(.2,.7,.2,1),transform .9s cubic-bezier(.2,.7,.2,1)}
.mo .rv:not(.in){opacity:0;transform:translateY(24px)}
.mo .t-lp .rv:not(.in){transform:translateY(36px) rotate(var(--r,0deg))}
.mo .t-md .rv:not(.in){transform:translateX(-28px)}
.mo .t-gd .rv:not(.in){transform:translateY(14px)}
.mo .t-bl .rv:not(.in){transform:translateY(18px) scale(.97)}
.mo .t-pc .rv:not(.in){transform:translateY(24px) rotate(calc(var(--r,0deg) - 1.5deg))}
.mo .t-gl .rv:not(.in){transform:translateY(32px)}
@media(max-width:700px){.rv{transition-duration:.6s}.mo body[class] .rv:not(.in){transform:translateY(14px)}}
.invite-lang{position:fixed;left:12px;bottom:12px;z-index:60;display:flex;gap:2px;padding:4px;border-radius:30px;background:rgba(255,255,255,.86);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);box-shadow:0 4px 18px rgba(0,0,0,.13);font:12px/1 system-ui,-apple-system,sans-serif;color:#222}
.invite-lang button{border:0;background:none;padding:7px 9px;border-radius:20px;font:inherit}.invite-lang button.active{background:#222;color:#fff}
.floating{position:fixed;right:12px;bottom:12px;z-index:60;display:flex;gap:6px;transition:opacity .3s,transform .3s}
.floating.top{opacity:0;transform:translateY(10px);pointer-events:none}
.floating a,.floating button{width:42px;height:42px;border-radius:50%;display:grid;place-items:center;border:0;background:rgba(255,255,255,.9);color:#222;box-shadow:0 4px 18px rgba(0,0,0,.15);text-decoration:none;font:15px/1 system-ui,-apple-system,sans-serif;-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px)}
.env{position:fixed;inset:0;z-index:100;outline:0}.env.gone{opacity:0;pointer-events:none;transition:opacity .35s}
html.envon,html.envon body{overflow:hidden}
.cardview{position:fixed;inset:0;z-index:90;background:rgba(20,18,16,.74);display:none;align-items:center;justify-content:center;padding:14px;overflow:auto}
.cardview.open{display:flex}.card-wrap{display:flex;flex-direction:column;align-items:center;gap:16px;max-width:100%}
.card-actions{display:flex;gap:10px}.card-actions button{padding:12px 24px;border-radius:30px;border:0;background:#fff;color:#222;font:13px system-ui,-apple-system,sans-serif;letter-spacing:.04em}
.ic{position:relative;box-shadow:0 2px 3px rgba(0,0,0,.08),0 40px 60px -34px rgba(0,0,0,.5);overflow:hidden;flex:none;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.ic-qr{position:absolute;right:30px;bottom:30px;z-index:5;display:flex;flex-direction:column;align-items:center;gap:4px}
.ic-qr .qr{width:62px;height:62px}.ic-qr .qr svg{display:block;width:100%;height:100%}.ic-qr .qr:empty{display:none}
.ic-qr .url{font:7.5px/1.25 system-ui,-apple-system,sans-serif;letter-spacing:.02em;opacity:.7;max-width:160px;text-align:center;word-break:break-all}.ic-qr .url:empty{display:none}
.lightbox{position:fixed;inset:0;z-index:95;background:rgba(10,10,10,.92);display:none;align-items:center;justify-content:center;padding:18px;cursor:zoom-out}.lightbox.open{display:flex}.lightbox img{max-width:100%;max-height:100%;object-fit:contain}
@media print{body.printing>*:not(#cardView){display:none!important}body.printing{background:#fff!important;padding:0!important}
 body.printing #cardView{position:static;display:block!important;background:none;padding:0;overflow:visible}body.printing .card-wrap{display:block}body.printing .card-actions{display:none}
 body.printing .ic{zoom:var(--pz,1)!important;box-shadow:none;margin:0;break-inside:avoid;page-break-inside:avoid}.rv{opacity:1!important;transform:none!important}}
@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}.rv{transition:none}}
.l-zh *,.cjk .lp-name,.cjk .gd-names{font-style:normal!important}
h1,h2,h3{text-wrap:balance}`,
letterpress:`.t-lp{background:repeating-linear-gradient(90deg,rgba(255,255,255,.08) 0 1px,transparent 1px 3px),repeating-linear-gradient(0deg,rgba(0,0,0,.025) 0 1px,transparent 1px 4px),#d3ccbe;color:#1e2741;font-family:BOD,serif}
.lp-top{text-align:center;padding:38px 0 0;font:italic 15px BOD,serif;letter-spacing:.06em;opacity:.7}
.lp-suite{width:min(740px,100% - 32px);margin:0 auto;padding:40px 0 120px;display:flex;flex-direction:column;align-items:center;gap:72px}
.lp-c{position:relative;background:#fbf8f1;width:100%;padding:70px 64px;text-align:center;transform:rotate(var(--r,0deg));box-shadow:0 1px 1px rgba(40,30,20,.08),0 2px 3px rgba(40,30,20,.06),0 30px 50px -28px rgba(40,30,20,.45)}
.lp-c::before{content:"";position:absolute;inset:14px;border:.75px solid rgba(30,39,65,.55);pointer-events:none}
.lp-c::after{content:"";position:absolute;inset:19px;border:.5px solid rgba(30,39,65,.25);pointer-events:none}
.lp-c.sm{width:78%}.lp-c.l{align-self:flex-start;--r:-.7deg}.lp-c.r{align-self:flex-end;--r:.6deg}
.lp-k{font-size:11px;letter-spacing:.32em;text-transform:uppercase}
.lp-h{font-size:13px;letter-spacing:.42em;text-transform:uppercase;margin:0 0 26px;font-weight:500}
.lp-hr{width:44px;height:0;border-top:.75px solid currentColor;margin:26px auto;opacity:.6}
.lp-inv{padding:96px 64px 88px;min-height:860px;display:flex;flex-direction:column;justify-content:center}
.lp-mono{width:84px;height:84px;margin:0 auto 34px;border-radius:50%;display:grid;place-items:center;font:italic 30px BOD,serif;color:#f1ece1;text-shadow:-1px -1px 0 rgba(255,255,255,.9),1px 1px 1px rgba(0,0,0,.25);background:#f1ece1;box-shadow:inset 1px 1px 2px rgba(0,0,0,.16),inset -1px -1px 1px rgba(255,255,255,.9)}
.lp-name{font-size:76px;font-weight:500;letter-spacing:.12em;line-height:1;margin:0}
.lp-and{font:italic 30px/1 BOD,serif;margin:16px 0}
.lp-it{font:italic 19px/1.6 BOD,serif;margin:0}
.lp-date{font-size:13px;letter-spacing:.3em;line-height:2.1;text-transform:uppercase}
.lp-ord{list-style:none;padding:0;margin:0 auto;max-width:420px;text-align:left}
.lp-ord li{display:flex;align-items:baseline;gap:10px;padding:10px 0;font-size:17px}
.lp-ord li i{flex:1;border-bottom:1px dotted rgba(30,39,65,.5);transform:translateY(-4px)}
.lp-ord b{font-weight:400;letter-spacing:.2em;font-size:13px}
.lp-map{border:.75px solid rgba(30,39,65,.5);margin:6px auto 22px;max-width:440px}
.lp-btn{display:inline-block;font-size:11px;letter-spacing:.3em;text-transform:uppercase;text-decoration:none;padding:12px 20px;border:.75px solid currentColor;margin:4px}
.lp-prints{display:flex;justify-content:center;width:100%}
.lp-pr{background:#fff;padding:12px 12px 40px;width:34%;box-shadow:0 18px 30px -20px rgba(0,0,0,.5);transform:rotate(var(--r));margin:0 -14px}
.lp-pr .ph{aspect-ratio:4/5}.lp-pr span{display:block;font:italic 13px BOD,serif;text-align:center;margin-top:10px}
.lp-tents{display:grid;grid-template-columns:repeat(3,1fr);gap:20px;width:100%}
.lp-tents .lp-c{padding:44px 22px}
.lp-reply{max-width:560px}
.lp-reply .rs{text-align:left;display:grid;gap:18px;margin-top:10px}
.lp-reply .rs label>span{font-size:10px;letter-spacing:.3em;text-transform:uppercase;opacity:.7}
.lp-reply .rs input,.lp-reply .rs select,.lp-reply .rs textarea{border-bottom:.75px solid rgba(30,39,65,.6);padding:6px 0;font:italic 18px BOD,serif}
.lp-reply .att label span{display:flex;gap:10px;align-items:center;font:italic 17px BOD,serif}
.lp-reply .att label span::before{content:"";width:16px;height:16px;border:.75px solid currentColor;border-radius:50%}
.lp-reply .att input:checked+span::before{background:radial-gradient(#1e2741 0 4px,transparent 5px)}
.lp-reply button{justify-self:center;background:#1e2741;color:#fbf8f1;border:0;padding:15px 32px;font-size:11px;letter-spacing:.32em;text-transform:uppercase;margin-top:8px}
.lp-tag{width:240px!important;padding:34px 20px!important;--r:-2deg}
.lp-tag b{font-size:54px;font-weight:500;display:block;line-height:1}
@media(max-width:700px){.lp-suite{gap:44px;padding-top:24px}.lp-c{padding:52px 30px}.lp-inv{min-height:auto;padding:76px 30px}.lp-name{font-size:44px}.lp-c.sm{width:94%}.lp-tents{grid-template-columns:1fr}.lp-tents .lp-c{padding:34px 22px}.lp-pr{width:38%;padding:7px 7px 26px}.lp-pr span{font-size:11px}}
.ic-lp{width:500px;aspect-ratio:5/7;background:#fbf8f1;color:#1e2741;font-family:BOD,serif;text-align:center;display:flex;flex-direction:column;justify-content:center;padding:60px}
.ic-lp::before{content:"";position:absolute;inset:16px;border:.75px solid rgba(30,39,65,.5)}.ic-lp::after{content:"";position:absolute;inset:21px;border:.5px solid rgba(30,39,65,.25)}
.lp-names{margin:0;font-weight:500}
.lp-name{display:block;text-transform:uppercase;font-size:min(76px,calc(700px / var(--nl)))}
.lp-and{display:block}
.cjk .lp-name{letter-spacing:.2em}
.lp-p{margin-bottom:14px}.lp-p:last-child{margin-bottom:0}
.lp-adr{letter-spacing:.12em;text-transform:none;font-style:italic;font-size:16px}
.lp-ord span small{display:block;font-style:italic;font-size:14px;opacity:.7;margin-top:2px}.lp-ord span{text-align:right}
.lp-btn{background:none;color:inherit;cursor:pointer;font-family:inherit}
.lp-tools{display:flex;flex-wrap:wrap;justify-content:center;margin-top:20px}
.lp-inv .wb-cta{margin-top:34px}
.lp-prints{flex-wrap:wrap;row-gap:26px}.lp-pr{padding-bottom:28px;cursor:zoom-in}.lp-prints.n1 .lp-pr{width:48%}
.lp-tents.n1{grid-template-columns:1fr;max-width:560px}.lp-tents.n2{grid-template-columns:1fr 1fr;max-width:640px}
.lp-tents .lp-h{margin-bottom:14px;font-size:11px}.lp-tents .lp-it{font-size:16px}
.lp-end{opacity:.6}
.lp-reply .privacy{text-align:center}.lp-reply .rsvp-msg{text-align:center;font-style:italic}
.x-page .n{text-transform:uppercase;font-size:min(36px,calc(250px / var(--nl)))}
.ic-lp .lp-mono{width:66px;height:66px;font-size:24px;margin-bottom:26px}.ic-lp .lp-k{font-size:10px}.ic-lp .lp-hr{margin:20px auto}
.ic-lp .lp-name{font-size:min(52px,calc(430px / var(--nl)))}.ic-lp .lp-and{font-size:24px;margin:10px 0}.ic-lp .lp-it{font-size:16px}.ic-lp .lp-date{font-size:10.5px;letter-spacing:.26em}
.ic-lp .ic-qr{right:34px;bottom:34px}.ic-lp .ic-qr .qr{width:54px;height:54px}
@media(max-width:700px){.lp-name{font-size:min(44px,calc(330px / var(--nl)))}.lp-prints.n1 .lp-pr{width:70%}.lp-tents.n2{grid-template-columns:1fr}.lp-ord li{font-size:15px}}`,
modern:`.t-md{--ink:#0e0e0e;--paper:#f0efe9;--lime:#d6f450;background:var(--paper);color:var(--ink);font-family:INT,sans-serif}
.md-grid{position:fixed;inset:0;pointer-events:none;background:repeating-linear-gradient(90deg,rgba(0,0,0,.07) 0 1px,transparent 1px calc((100% - 1px)/6));z-index:0}
.md-bar{position:sticky;top:0;z-index:20;display:grid;grid-template-columns:1fr auto 1fr;align-items:center;padding:14px 28px;background:var(--paper);border-bottom:1px solid var(--ink);font-size:12px;font-weight:500}
.md-bar nav{display:flex;gap:22px}.md-bar nav a{text-decoration:none}.md-bar nav a b{font-weight:500;opacity:.45;margin-right:5px}.md-bar .r{text-align:right}
.md-hero{position:relative;z-index:1;min-height:calc(100vh - 47px);padding:3vh 28px 28px;display:flex;flex-direction:column}
.md-name{font:600 23vw/.8 ANT,sans-serif;text-transform:uppercase;letter-spacing:-.025em;margin:0}
.md-name>span{display:block}.md-name .amp{color:var(--paper);-webkit-text-stroke:2px var(--ink)}
.md-date{position:absolute;right:28px;top:calc(3vh + 24vw);background:var(--lime);padding:18px 22px;font:600 52px/1 ANT,sans-serif}
.md-meta{margin-top:auto;display:grid;grid-template-columns:repeat(4,1fr);border-top:1px solid var(--ink)}
.md-meta div{padding:14px 14px 0 0;font-size:15px;line-height:1.35}.md-meta small{display:block;font-size:11px;opacity:.55;margin-bottom:6px}
.md-band{position:relative;z-index:1;background:var(--ink);color:var(--lime);overflow:hidden;white-space:nowrap;font:600 64px/1 ANT,sans-serif;text-transform:uppercase;padding:18px 0}
.md-band div{display:inline-block;padding-right:40px}.mo .md-band div{animation:mq 26s linear infinite}
@keyframes mq{to{transform:translateX(-100%)}}
.md-row{position:relative;z-index:1;display:grid;grid-template-columns:2fr 4fr;border-bottom:1px solid var(--ink)}
.md-num{padding:28px;border-right:1px solid var(--ink)}.md-num>div{position:sticky;top:70px}
.md-num b{display:block;font:600 160px/.8 ANT,sans-serif}.md-num span{font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:.04em}
.md-body{padding:28px 28px 64px;min-width:0}
.md-lead{font-size:44px;line-height:1.08;letter-spacing:-.03em;font-weight:500;margin:0;max-width:22ch}
.md-sched{list-style:none;margin:0;padding:0}
.md-sched li{display:grid;grid-template-columns:200px 1fr auto;align-items:end;border-top:1px solid var(--ink);padding:14px 0}
.md-sched li:last-child{border-bottom:1px solid var(--ink)}
.md-sched b{font:600 88px/.85 ANT,sans-serif}.md-sched span{font-size:28px;font-weight:500;letter-spacing:-.02em}.md-sched em{font-style:normal;font-size:13px;opacity:.6}
.md-place{display:grid;grid-template-columns:1fr 1fr;gap:28px;align-items:end}
.md-addr{font:600 64px/.9 ANT,sans-serif;text-transform:uppercase;margin:0 0 20px}
.md-btns{display:flex;gap:8px;flex-wrap:wrap}.md-btn{display:inline-block;padding:13px 18px;border:1px solid var(--ink);font-size:13px;font-weight:600;text-decoration:none;text-transform:uppercase}
.md-btn.k{background:var(--ink);color:var(--paper)}
.md-strip{display:flex;gap:12px;overflow-x:auto;scroll-snap-type:x mandatory;padding-bottom:10px}
.md-strip figure{flex:0 0 38%;margin:0;scroll-snap-align:start}.md-strip .ph{aspect-ratio:3/4;filter:grayscale(1) contrast(1.05)}
.md-strip figcaption{font-size:12px;padding-top:8px;display:flex;justify-content:space-between}
.md-count{position:relative;z-index:1;background:var(--lime);display:grid;grid-template-columns:repeat(4,1fr);border-bottom:1px solid var(--ink)}
.md-count div{padding:28px;border-right:1px solid var(--ink)}.md-count b{display:block;font:600 150px/.8 ANT,sans-serif}.md-count span{font-size:13px;font-weight:600;text-transform:uppercase}
.md-det{display:grid;grid-template-columns:repeat(3,1fr);gap:28px}.md-det h4{font-size:13px;text-transform:uppercase;margin:0 0 10px;padding-top:10px;border-top:3px solid var(--ink)}.md-det p{margin:0;font-size:17px;line-height:1.45}
.md-rsvp{position:relative;z-index:1;background:var(--ink);color:var(--paper);display:grid;grid-template-columns:2fr 4fr}
.md-rsvp .md-num{border-color:#444}.md-rsvp .md-num b{color:var(--lime)}
.md-rsvp .rs{display:grid;gap:0}.md-rsvp .rs>label,.md-rsvp .rs .two>label{border-bottom:1px solid #555;padding:14px 0}
.md-rsvp .rs label>span{font-size:11px;text-transform:uppercase;opacity:.6;font-weight:600}
.md-rsvp .rs input,.md-rsvp .rs select,.md-rsvp .rs textarea{font-size:26px;font-weight:500;letter-spacing:-.02em;padding-top:4px}
.md-rsvp .rs select option{color:#000}.md-rsvp .rs .two{gap:28px}
.md-rsvp .att{padding:14px 0;gap:0!important}.md-rsvp .att label span{display:block;border:1px solid #666;padding:16px;font:600 22px ANT,sans-serif;text-transform:uppercase}
.md-rsvp .att input:checked+span{background:var(--lime);color:var(--ink);border-color:var(--lime)}
.md-rsvp button{margin-top:22px;background:var(--lime);color:var(--ink);border:0;padding:26px;font:600 34px/1 ANT,sans-serif;text-transform:uppercase;text-align:left;display:flex;justify-content:space-between}
.md-foot{position:relative;z-index:1;display:flex;justify-content:space-between;padding:18px 28px;font-size:12px;font-weight:500}
@media(max-width:700px){.md-bar{grid-template-columns:1fr 1fr;padding:12px 16px}.md-bar nav{display:none}.md-hero{padding:16px 16px 20px;min-height:calc(100svh - 43px)}.md-name{font-size:30vw}.md-date{position:static;align-self:flex-start;font-size:34px;margin-top:18px}.md-meta{grid-template-columns:1fr 1fr}.md-meta div{padding-bottom:12px}.md-band{font-size:40px}.md-row,.md-rsvp{grid-template-columns:1fr}.md-num{border-right:0;border-bottom:1px solid var(--ink);padding:16px}.md-num>div{position:static;display:flex;align-items:flex-end;gap:12px}.md-num b{font-size:84px}.md-body{padding:20px 16px 44px}.md-lead{font-size:30px}.md-sched li{grid-template-columns:110px 1fr}.md-sched li em{grid-column:2}.md-sched b{font-size:56px}.md-sched span{font-size:20px}.md-place{grid-template-columns:1fr}.md-addr{font-size:44px}.md-strip figure{flex-basis:72%}.md-count{grid-template-columns:1fr 1fr}.md-count div{padding:16px;border-bottom:1px solid var(--ink)}.md-count b{font-size:84px}.md-det{grid-template-columns:1fr;gap:20px}.md-rsvp button{font-size:26px;padding:20px}.md-foot{padding:16px;flex-direction:column;gap:6px}}
.ic-md{width:500px;aspect-ratio:5/7;background:#f0efe9;font-family:INT,sans-serif;display:flex;flex-direction:column;padding:26px;color:#0e0e0e}
.ic-md h1{font:600 132px/.8 ANT,sans-serif;text-transform:uppercase;margin:0;letter-spacing:-.02em}
.md-count span{display:block;margin-top:12px}
body.t-md{--mf:min(23vw,calc(190vw / var(--nl)))}
.plain{--lime:var(--paper)}.plain .md-date,.plain .ic-dt{box-shadow:inset 0 0 0 1.5px var(--ink)}.plain .md-count{border-top:1px solid var(--ink)}
.md-name{font-size:var(--mf)}.md-date{top:calc(3vh + var(--mf) * 1.04)}
.cjk .md-name{line-height:1;letter-spacing:0}
@media(min-width:701px){.md-meta{grid-template-columns:repeat(auto-fit,minmax(0,1fr))}.md-num span{display:block;margin-top:30px}}.md-meta a{text-decoration:none}@media(max-width:700px){.md-meta{grid-template-columns:1fr 1fr}}
.md-p{font-size:19px;line-height:1.5;max-width:46ch;margin:28px 0 0}
.md-adr{font-size:17px;margin:0 0 20px}
.md-btn{background:none;color:inherit;cursor:pointer;font-family:inherit}.md-btn.k{background:var(--ink);color:var(--paper)}
.md-mapw{border:1px solid var(--ink)}
.md-strip.n1 figure{flex-basis:60%}.md-strip.n2 figure{flex-basis:48%}
.md-strip .ph{height:auto}
.md-cal{position:relative;z-index:1;padding:28px;border-bottom:1px solid var(--ink)}
.md-rsvp .rs .rs-more{justify-content:flex-start;padding-top:14px}.md-rsvp .rsvp-msg{padding-top:16px}.md-rsvp .privacy{padding-top:12px}
.md-rsvp .rs .rs-link{justify-items:start}
.x-main .fr b{font-size:min(clamp(40px,10vw,78px),calc(400px / var(--nl)))}.x-main .bk b{font-size:min(clamp(46px,11.5vw,92px),calc(460px / var(--nl)))}
.ic-hd{display:flex;justify-content:space-between;font-size:11px;font-weight:600;border-bottom:1px solid;padding-bottom:8px;text-transform:uppercase}
.ic-md h1{margin-top:22px;font-size:min(132px,calc(560px / var(--nl)))}
.ic-dt{background:var(--lime);font:600 46px/1 ANT,sans-serif;padding:12px 14px;align-self:flex-start;margin-top:18px}
.ic-ft{margin-top:auto;display:grid;grid-template-columns:1fr 1.4fr auto;gap:14px;border-top:1px solid;font-size:12px;line-height:1.4;padding-top:10px}.ic-ft b{display:block;font-size:10px;opacity:.5}
.ic-md .ic-qr{position:static}.ic-md .ic-qr .qr{width:58px;height:58px}
@media(max-width:700px){body.t-md{--mf:min(30vw,calc(220vw / var(--nl)))}.md-strip.n1 figure,.md-strip.n2 figure{flex-basis:72%}}
body.t-md.cjk{--mf:min(23vw,calc(135vw / var(--nl)))}@media(max-width:700px){body.t-md.cjk{--mf:min(30vw,calc(118vw / var(--nl)))}}`,
garden:`.t-gd{--moss:#38432f;--cream:#efe9d8;--paper:#f6f2e7;--ink:#2c3126;background:var(--paper);color:var(--ink);font-family:COR,serif}
.gd-wrap{display:grid;grid-template-columns:42% 58%;align-items:start}
.gd-side{position:sticky;top:0;height:100vh;background:var(--moss);color:var(--cream);padding:52px 56px 44px;display:flex;flex-direction:column;overflow:hidden}
.gd-side .k{font:12px TEN,sans-serif;letter-spacing:.24em;text-transform:uppercase;opacity:.75}
.gd-names{font:84px/.95 GIL,serif;margin:22px 0 0;font-weight:400}.gd-names i{font:italic 300 70px COR,serif;display:block;margin:4px 0 0 .9em}
.gd-when{font:italic 22px/1.5 COR,serif;margin:22px 0 0;opacity:.9}
.gd-nav{margin:auto 0 0;padding:0;list-style:none;border-top:1px solid rgba(239,233,216,.25)}
.gd-nav li{display:flex;gap:16px;align-items:baseline;padding:11px 0;border-bottom:1px solid rgba(239,233,216,.25);font-size:21px}
.gd-nav li b{font:11px TEN,sans-serif;letter-spacing:.2em;width:26px;opacity:.6}.gd-nav li.on::after{content:"";margin-left:auto;width:7px;height:7px;border-radius:50%;background:#c9d3a8;align-self:center}
.gd-cta{margin-top:24px;display:flex;gap:10px}.gd-cta a{flex:1;text-align:center;padding:14px;font:12px TEN,sans-serif;letter-spacing:.2em;text-transform:uppercase;text-decoration:none;border:1px solid rgba(239,233,216,.6)}.gd-cta a:first-child{background:var(--cream);color:var(--moss)}
.gd-sprig{position:absolute;right:-30px;top:40px;width:250px;opacity:.45}
.gd-main{padding:0 72px 100px}
.gd-plate{padding:84px 0 44px;border-bottom:1px solid rgba(44,49,38,.18)}
.gd-ph{display:flex;align-items:baseline;gap:18px;margin-bottom:32px}.gd-ph b{font:11px TEN,sans-serif;letter-spacing:.24em;text-transform:uppercase;color:var(--gk)}.gd-ph h2{font:44px/1 GIL,serif;margin:0;font-weight:400}
.gd-two{display:grid;grid-template-columns:1fr 170px;gap:36px}
.gd-two p{font-size:22px;line-height:1.55;margin:0 0 14px}.gd-two sup{font:10px TEN,sans-serif;color:var(--gk)}
.gd-marg{font:italic 16px/1.45 COR,serif;color:#5c6650;border-left:1px solid rgba(44,49,38,.25);padding-left:16px}
.gd-marg p{font-size:16px!important}
.gd-line{list-style:none;margin:0 0 0 8px;padding:0 0 0 30px;border-left:1px solid var(--gl)}
.gd-line li{position:relative;padding:0 0 30px}
.gd-line li::before{content:"";position:absolute;left:-37px;top:6px;width:13px;height:13px;background:var(--gl);border-radius:0 70% 0 70%}
.gd-line b{font:12px TEN,sans-serif;letter-spacing:.22em}.gd-line h3{font:30px GIL,serif;margin:4px 0 2px;font-weight:400}.gd-line span{font:italic 18px COR,serif;color:#5c6650}
.gd-label{display:grid;grid-template-columns:1fr 1fr;border:1px solid var(--ink);margin-top:18px;font-size:16px}
.gd-label div{padding:10px 14px;border-right:1px solid var(--ink);border-bottom:1px solid var(--ink)}.gd-label div:nth-child(2n){border-right:0}.gd-label div:nth-last-child(-n+2){border-bottom:0}
.gd-label small{display:block;font:9.5px TEN,sans-serif;letter-spacing:.2em;text-transform:uppercase;color:var(--gk)}
.gd-map{border:1px solid var(--ink)}
.gd-btns{display:flex;gap:10px;margin-top:16px}.gd-btn{padding:12px 18px;border:1px solid var(--ink);font:11px TEN,sans-serif;letter-spacing:.2em;text-transform:uppercase;text-decoration:none}
.gd-sheet{display:grid;grid-template-columns:1.2fr 1fr;gap:34px 30px;align-items:start}
.gd-spec{position:relative;background:#fff;padding:12px;box-shadow:0 10px 24px -16px rgba(0,0,0,.4)}
.gd-spec::before,.gd-spec::after{content:"";position:absolute;width:70px;height:20px;background:rgba(222,214,186,.85);top:-9px;left:20%;transform:rotate(-4deg)}.gd-spec::after{left:auto;right:16%;transform:rotate(5deg)}
.gd-spec .ph{aspect-ratio:4/3}.gd-spec.t .ph{aspect-ratio:3/4}
.gd-spec span{display:block;font:italic 15px COR,serif;margin-top:8px;color:#5c6650}
.gd-dl{display:grid;grid-template-columns:150px 1fr;gap:16px 26px;margin:0}.gd-dl dt{font:12px TEN,sans-serif;letter-spacing:.2em;text-transform:uppercase;padding-top:5px;color:var(--gk)}.gd-dl dd{margin:0;font-size:21px;line-height:1.45}
.gd-count{font:italic 22px COR,serif;margin-top:26px}.gd-count b{font:52px GIL,serif;font-style:normal;margin-right:6px;font-weight:400}
.gd-reply .rs{display:grid;gap:22px;background:#fffdf7;padding:34px;border:1px solid rgba(44,49,38,.2)}
.gd-reply .rs label>span{font:11px TEN,sans-serif;letter-spacing:.22em;text-transform:uppercase;color:var(--gk)}
.gd-reply .rs input,.gd-reply .rs select,.gd-reply .rs textarea{font:italic 22px COR,serif;border-bottom:1px solid var(--ink);padding:4px 0}
.gd-reply .att label span{display:block;padding:14px;border:1px solid var(--ink);text-align:center;font-size:20px}
.gd-reply .att input:checked+span{background:var(--moss);color:var(--cream)}
.gd-reply button{background:var(--moss);color:var(--cream);border:0;padding:16px;font:12px TEN,sans-serif;letter-spacing:.24em;text-transform:uppercase}
.gd-mbar{display:none}
@media(max-width:700px){.gd-wrap{display:block}.gd-side{position:relative;height:auto;min-height:100svh;padding:36px 26px 30px}.gd-names{font-size:62px}.gd-names i{font-size:52px}.gd-nav{margin-top:40px}.gd-mbar{display:flex;position:sticky;top:0;z-index:10;background:var(--moss);color:var(--cream);gap:18px;padding:12px 18px;overflow-x:auto;white-space:nowrap;font:11px TEN,sans-serif;letter-spacing:.18em;text-transform:uppercase;align-items:center}.gd-mbar b{font:18px GIL,serif;letter-spacing:0;text-transform:none;font-weight:400}.gd-main{padding:0 22px 70px}.gd-plate{padding:52px 0 30px}.gd-ph{flex-direction:column;gap:6px}.gd-ph h2{font-size:36px}.gd-two{grid-template-columns:1fr;gap:12px}.gd-two p{font-size:20px}.gd-sheet{grid-template-columns:1fr 1fr;gap:20px 14px}.gd-dl{grid-template-columns:1fr;gap:4px}.gd-dl dd{margin-bottom:14px}.gd-reply .rs{padding:22px}}
.ic-gd{width:720px;aspect-ratio:7/5;display:grid;grid-template-columns:40% 60%;background:#f6f2e7;color:#2c3126;font-family:COR,serif}
.gd-wrap{background:linear-gradient(90deg,var(--moss) 42%,transparent 42%)}@media(max-width:700px){.gd-wrap{background:none}}
body.t-gd{--gk:#6c7a55;--gl:#8b9a72}
body.t-gd.olive{--moss:#4f5233;--gk:#7b7a4a;--gl:#9d9a66;--paper:#f5f1e3}
.gd-names{font-size:min(84px,calc((42vw - 112px) * 1.75 / var(--nl)))}.gd-names i{font-size:.83em}
.cjk .gd-names{letter-spacing:.06em;line-height:1.15}
.gd-nav li{display:block;padding:0}.gd-nav li a{display:flex;gap:16px;align-items:baseline;padding:11px 0;text-decoration:none}
.gd-nav a.on::after{content:"";margin-left:auto;width:7px;height:7px;border-radius:50%;background:#c9d3a8;align-self:center}
.gd-cta:empty{display:none}.gd-cta button{flex:1;text-align:center;padding:14px;font:12px TEN,sans-serif;letter-spacing:.2em;text-transform:uppercase;border:1px solid rgba(239,233,216,.6);background:none;color:inherit}
.gd-cta>:first-child{background:var(--cream);color:var(--moss)}
.gd-two{display:block;max-width:36em}
.gd-mbar a{text-decoration:none}
.gd-btns{flex-wrap:wrap}.gd-btn{background:none;color:inherit;cursor:pointer}
.gd-sheet.n1{grid-template-columns:minmax(0,560px)}.gd-sheet.n1 .gd-spec .ph{aspect-ratio:4/3}
.gd-spec .ph{height:auto}
.gd-label:has(div:only-child) div{border:0}
.gd-reply .rs-more{justify-content:flex-start}.gd-reply .privacy{font-style:italic}
.gd-solo{border:0;display:grid;place-items:center;min-height:60vh}.gd-sprig2{width:170px;opacity:.7}
.gd-foot{padding:40px 0 0;font:12px TEN,sans-serif;letter-spacing:.2em;text-transform:uppercase;color:var(--gk)}
.x-inner b{font-size:min(clamp(40px,10vw,56px),calc(320px / var(--nl)))}.x-inner i{font-size:min(clamp(32px,8vw,44px),calc(270px / var(--nl)))}
.ic-gd .ic-l{background:var(--moss);color:#efe9d8;padding:34px;display:flex;flex-direction:column;position:relative;overflow:hidden}
.ic-spr{position:absolute;right:-40px;top:20px;width:160px;opacity:.5}
.ic-k{font:10px TEN,sans-serif;letter-spacing:.24em;opacity:.7;text-transform:uppercase;position:relative}.ic-k.g{color:var(--gk);opacity:1}
.ic-nm{font:52px/.95 GIL,serif;margin-top:auto;position:relative;font-size:min(52px,calc(300px / var(--nl)))}.ic-nm i{font:italic 300 .85em COR,serif;display:block;margin-left:.6em}
.ic-r{padding:40px 38px;display:flex;flex-direction:column;justify-content:center;position:relative}
.ic-p{font:italic 23px/1.45 COR,serif;margin:16px 0}.ic-gd .gd-label{font-size:14px}
.ic-gd .ic-qr{position:static;flex-direction:row;gap:10px;margin-top:16px;align-items:center;justify-content:flex-start}.ic-gd .ic-qr .url{text-align:left}
@media(max-width:700px){.gd-names{font-size:min(62px,calc((100vw - 52px) * 1.7 / var(--nl)))}.gd-sheet.n1{grid-template-columns:1fr}}`,
bloom:`.t-bl{--ink:#4a2b3b;color:var(--ink);font-family:PLA,serif;background:#fbefec}
.bl-ch{position:relative;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:110px 24px;overflow:hidden}
.bl-c0{background:radial-gradient(60% 50% at 30% 30%,#fbd3d6,transparent 70%),radial-gradient(50% 45% at 75% 70%,#f7d9c4,transparent 70%),#fbefec}
.bl-c1{background:linear-gradient(#fbefec,#fbf1e6)}.bl-c2{background:linear-gradient(#fbf1e6,#efe8f3)}.bl-c3{background:linear-gradient(#efe8f3,#f6e3ea)}.bl-c4{background:linear-gradient(#f6e3ea,#f3e9e2)}.bl-c5{background:linear-gradient(#f3e9e2,#4a2b3b 18%);color:#fbefec}
.bl-cap{font:12px JOS,sans-serif;letter-spacing:.34em;text-transform:uppercase;opacity:.7;position:relative}
.bl-name{font:150px/.9 PIN,serif;margin:0;font-weight:400;position:relative}.bl-and{font:italic 22px PLA,serif;margin:10px 0 0;position:relative}
.bl-date{font:italic 24px PLA,serif;margin:34px 0 0;position:relative}.bl-date b{font-weight:400;display:block;font:12px JOS,sans-serif;letter-spacing:.34em;text-transform:uppercase;margin-top:12px;font-style:normal}
.bl-scroll{position:absolute;bottom:36px;left:50%;transform:translateX(-50%);font:11px JOS,sans-serif;letter-spacing:.3em;text-transform:uppercase;display:flex;flex-direction:column;align-items:center;gap:12px;opacity:.7}.bl-scroll::after{content:"";width:1px;height:46px;background:currentColor}
.bl-blob{position:absolute;border-radius:50%;opacity:.8;pointer-events:none}
.bl-t{font:96px/1 PIN,serif;margin:8px 0 50px;font-weight:400}
.bl-dots{position:fixed;right:26px;top:50%;transform:translateY(-50%);z-index:20;display:flex;flex-direction:column;gap:14px;font:10px JOS,sans-serif;letter-spacing:.2em;text-transform:uppercase;color:#4a2b3b}
.bl-dots a{display:flex;align-items:center;gap:10px;justify-content:flex-end;text-decoration:none;opacity:.5}.bl-dots a::after{content:"";width:7px;height:7px;border-radius:50%;border:1px solid currentColor}.bl-dots a.on{opacity:1}.bl-dots a.on::after{background:currentColor}
.bl-tl{position:relative;width:min(860px,100%);display:grid;gap:56px}
.bl-tl::before{content:"";position:absolute;left:50%;top:0;bottom:0;border-left:1px dashed rgba(74,43,59,.4)}
.bl-tl>div{width:50%;padding:0 54px;text-align:right;position:relative}.bl-tl>div:nth-child(2n){margin-left:50%;text-align:left}
.bl-tl>div::after{content:"";position:absolute;top:18px;right:-7px;width:13px;height:13px;border-radius:50%;background:var(--pink);box-shadow:0 0 0 6px rgba(232,169,181,.25)}.bl-tl>div:nth-child(2n)::after{right:auto;left:-6px}
.bl-tl b{font:58px/1 PIN,serif;font-weight:400;display:block}.bl-tl h3{font:italic 24px PLA,serif;margin:6px 0;font-weight:400}.bl-tl p{margin:0;font:16px/1.6 JOS,sans-serif;font-weight:300}
.bl-tl .ph{border-radius:200px 200px 0 0;aspect-ratio:3/4;margin-top:18px}
.bl-day{list-style:none;padding:0;margin:0;display:grid;gap:30px}
.bl-day b{font:64px/1 PIN,serif;font-weight:400;display:block}.bl-day span{font:12px JOS,sans-serif;letter-spacing:.32em;text-transform:uppercase}.bl-day em{display:block;font:italic 17px PLA,serif;opacity:.7;margin-top:4px}
.bl-day li+li::before{content:"✦";display:block;font-size:12px;opacity:.4;margin-bottom:26px}
.bl-arch{width:min(420px,80vw);aspect-ratio:3/4;border-radius:999px 999px 0 0;overflow:hidden;margin:0 auto 34px;box-shadow:0 30px 60px -30px rgba(74,43,59,.5)}
.bl-addr{font:italic 30px PLA,serif;margin:0}.bl-addr small{display:block;font:15px JOS,sans-serif;font-style:normal;letter-spacing:.06em;margin-top:6px;opacity:.8}
.bl-btns{display:flex;gap:12px;justify-content:center;margin-top:24px;flex-wrap:wrap}.bl-btn{padding:13px 24px;border-radius:40px;border:1px solid currentColor;text-decoration:none;font:12px JOS,sans-serif;letter-spacing:.24em;text-transform:uppercase}
.bl-mo{position:relative;width:min(900px,100%);height:600px}
.bl-mo .f{position:absolute;overflow:hidden;box-shadow:0 26px 50px -30px rgba(74,43,59,.55)}
.bl-mo .f1{left:4%;top:6%;width:30%;aspect-ratio:3/4;border-radius:999px 999px 0 0}.bl-mo .f2{left:36%;top:0;width:30%;aspect-ratio:1;border-radius:50%}.bl-mo .f3{right:2%;top:12%;width:28%;aspect-ratio:3/4;border-radius:999px}.bl-mo .f4{left:24%;top:55%;width:24%;aspect-ratio:1;border-radius:50%}.bl-mo .f5{left:52%;top:52%;width:26%;aspect-ratio:4/3;border-radius:999px 999px 0 0}
.bl-ov{display:grid;grid-template-columns:repeat(3,1fr);gap:26px;width:min(940px,100%)}
.bl-ov div{aspect-ratio:4/5;border-radius:50%;background:rgba(255,255,255,.55);display:flex;flex-direction:column;justify-content:center;padding:34px;border:1px solid rgba(74,43,59,.15)}.bl-ov h4{font:44px PIN,serif;font-weight:400;margin:0}.bl-ov p{font:15px/1.55 JOS,sans-serif;font-weight:300;margin:6px 0 0}
.bl-cd{display:flex;gap:30px;justify-content:center;margin-top:40px}.bl-cd b{font:54px PIN,serif;font-weight:400;display:block}.bl-cd span{font:10px JOS,sans-serif;letter-spacing:.3em;text-transform:uppercase}
.bl-card{width:min(560px,100%);background:#fbefec;color:var(--ink);border-radius:300px 300px 18px 18px;padding:110px 52px 48px}
.bl-card .rs{display:grid;gap:16px;text-align:left}
.bl-card .rs label>span{font:10px JOS,sans-serif;letter-spacing:.3em;text-transform:uppercase;opacity:.7}
.bl-card .rs input,.bl-card .rs select,.bl-card .rs textarea{font:italic 19px PLA,serif;border-bottom:1px solid rgba(74,43,59,.4);padding:6px 0}
.bl-card .att label span{display:block;text-align:center;padding:13px;border-radius:40px;border:1px solid rgba(74,43,59,.4);font:italic 17px PLA,serif}
.bl-card .att input:checked+span{background:var(--ink);color:#fbefec}
.bl-card button{border:0;border-radius:40px;background:var(--pink);color:var(--ink);padding:16px;font:12px JOS,sans-serif;letter-spacing:.3em;text-transform:uppercase;margin-top:8px}
.bl-foot{font:italic 16px PLA,serif;opacity:.7;margin-top:40px}
@media(max-width:700px){.bl-ch{padding:80px 20px;min-height:100svh}.bl-name{font-size:96px}.bl-t{font-size:66px;margin-bottom:30px}.bl-dots{right:8px}.bl-dots a span{display:none}.bl-tl::before{left:8px}.bl-tl>div,.bl-tl>div:nth-child(2n){width:100%;margin:0;padding:0 0 0 34px;text-align:left}.bl-tl>div::after,.bl-tl>div:nth-child(2n)::after{left:2px;right:auto}.bl-tl b{font-size:46px}.bl-mo{height:520px}.bl-mo .f1{width:44%}.bl-mo .f2{left:50%;width:44%}.bl-mo .f3{right:auto;left:2%;top:48%;width:40%}.bl-mo .f4{left:48%;top:40%;width:40%}.bl-mo .f5{left:30%;top:72%;width:44%}.bl-ov{grid-template-columns:1fr;gap:16px}.bl-ov div{aspect-ratio:auto;border-radius:200px;padding:30px 40px}.bl-card{padding:80px 26px 34px}}
.ic-bl{width:480px;aspect-ratio:5/7;background:#fbefec;color:#4a2b3b;border-radius:240px 240px 0 0;text-align:center;display:flex;flex-direction:column;justify-content:center;padding:70px 46px 40px;font-family:PLA,serif}
body.t-bl{--pink:#e8a9b5}
.bl-names{margin:0;font-weight:400;position:relative}
.bl-name{display:block;font-size:min(150px,calc(1150px / var(--nl)))}.bl-and{display:block}
.cjk .bl-name{font-family:"Songti SC","STSong","Noto Serif CJK SC",serif;letter-spacing:.08em;line-height:1.15;font-size:min(110px,calc(900px / var(--nl)))}
.bl-btn{background:none;color:inherit;cursor:pointer}
.bl-c0 .wb-cta{margin-top:30px}
.bl-tl p{margin:0;font:italic 21px/1.6 PLA,serif}
.bl-arch .ph{height:100%}
.bl-arch.np{position:relative;display:grid;place-items:center;background:radial-gradient(circle at 40% 35%,#f8d7da,#efd9e6 60%,#f3e3d6)}
.bl-mono{position:relative;font:72px PIN,serif;color:#4a2b3b;opacity:.75}
.bl-mo .ph{height:100%}
.bl-mo.n1{height:auto}.bl-mo.n1 .f1{position:relative;left:auto;top:auto;width:min(420px,80vw);margin:0 auto}
.bl-mo.n2{height:440px}.bl-mo.n2 .f1{left:12%;width:34%}.bl-mo.n2 .f2{left:auto;right:12%;top:16%;width:34%}
.bl-mo.n3{height:520px}.bl-mo.n4{height:600px}
.bl-more{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:16px;width:min(900px,100%);margin-top:50px}
.bl-more .f{aspect-ratio:1;border-radius:50%;overflow:hidden}
.bl-ov.n1{grid-template-columns:1fr;width:min(420px,100%)}.bl-ov.n2{grid-template-columns:1fr 1fr;width:min(640px,100%)}
.bl-short{min-height:60vh}
.bl-card .rs-more{justify-content:center}.bl-card .privacy,.bl-card .rsvp-msg{text-align:center}
.bl-c5 .bl-btns{margin:28px 0 0}
.x-letter b{font-size:min(clamp(44px,11vw,64px),calc(380px / var(--nl)))}
.cjk .x-letter b{font-family:"Songti SC","STSong","Noto Serif CJK SC",serif;font-size:min(40px,calc(280px / var(--nl)))}
.ic-bl .bl-cap{font-size:10px}.ic-bl .bl-names{margin-top:18px}.ic-bl .bl-name{font-size:min(88px,calc(640px / var(--nl)))}.ic-bl .bl-date{font-size:18px}
.cjk .ic-bl .bl-name{font-size:min(64px,calc(500px / var(--nl)))}
.ic-bl .ic-qr{position:relative;right:auto;bottom:auto;margin:20px auto 0}
@media(max-width:700px){.bl-name{font-size:min(96px,calc(590px / var(--nl)))}.cjk .bl-name{font-size:min(72px,calc(470px / var(--nl)))}
 .bl-mo.n2{height:300px}.bl-mo.n2 .f1{left:2%;width:46%}.bl-mo.n2 .f2{left:52%;right:auto;top:12%;width:46%}.bl-mo.n3{height:430px}.bl-mo.n4{height:470px}.bl-ov.n2{grid-template-columns:1fr}}`,
postcard:`body.t-pc{--ink:#1d2a3a;--red:#b8402a;--blue:#2b4f7a;--paper:#f4efe6;--sheet:#fbf8f2;--mut:#6b6a66;background:var(--paper);background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.8' numOctaves='3'/%3E%3CfeColorMatrix values='0 0 0 0 .35 0 0 0 0 .3 0 0 0 0 .25 0 0 0 .07 0'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)'/%3E%3C/svg%3E");color:var(--ink);font-family:JOS,sans-serif}
.air{display:inline-block;width:46px;height:7px;background:repeating-linear-gradient(-45deg,var(--red) 0 6px,transparent 6px 10px,var(--blue) 10px 16px,transparent 16px 20px)}
.p2-chip{display:inline-flex;align-items:center;gap:8px;font:500 10.5px OSW,sans-serif;letter-spacing:.24em;text-transform:uppercase;color:var(--blue)}
.p2-chip::before{content:"";width:22px;height:7px;background:repeating-linear-gradient(-45deg,var(--red) 0 4px,transparent 4px 7px,var(--blue) 7px 11px,transparent 11px 14px)}
.p2-nav{position:sticky;top:0;z-index:30;display:flex;align-items:center;gap:30px;padding:16px 48px;background:rgba(244,239,230,.92);backdrop-filter:blur(8px);border-bottom:1px solid rgba(29,42,58,.12)}
.p2-nav>b{font:24px DMS,serif;font-weight:400}.p2-nav .lk{display:flex;gap:28px;margin:0 auto;font:500 11px OSW,sans-serif;letter-spacing:.2em;text-transform:uppercase}.p2-nav .lk a{text-decoration:none}.p2-nav .lk i{font-style:normal;color:var(--red);margin-right:6px}
.p2-cta{font:500 11px OSW,sans-serif;letter-spacing:.2em;text-transform:uppercase;text-decoration:none;padding:10px 18px;border:1px solid var(--ink)}
.p2-hero{width:min(1240px,100% - 96px);margin:0 auto;padding:80px 0 120px;display:grid;grid-template-columns:7fr 5fr;gap:72px;align-items:center}
.p2-front{position:relative;background:var(--sheet);padding:16px;transform:rotate(-1.6deg);box-shadow:0 1px 1px rgba(0,0,0,.06),0 2px 6px rgba(60,40,20,.06),0 40px 60px -40px rgba(60,40,20,.45)}
.p2-front .in{aspect-ratio:3/2;overflow:hidden}
.p2-front .p2-stamp{position:absolute;right:-26px;top:-30px;transform:rotate(4deg)}
.p2-front .pmw{position:absolute;right:30px;top:40px;width:240px;color:rgba(29,42,58,.78);transform:rotate(-8deg);mix-blend-mode:multiply}
.p2-intro h1{font:112px/.9 DMS,serif;font-weight:400;margin:22px 0 22px;letter-spacing:-.01em}.p2-intro h1 i{font-style:italic;color:var(--red);font-size:.8em}
.p2-intro .lede{font:italic 24px/1.4 DMS,serif;margin:0 0 30px;max-width:22ch;color:#2d3a4a}
.p2-facts{margin:0 0 34px;border-top:1px solid rgba(29,42,58,.2)}.p2-facts div{display:grid;grid-template-columns:90px 1fr;padding:12px 0;border-bottom:1px solid rgba(29,42,58,.2)}
.p2-facts dt{font:500 10.5px OSW,sans-serif;letter-spacing:.24em;text-transform:uppercase;color:var(--mut);padding-top:3px}.p2-facts dd{margin:0;font-size:17px}
.p2-btns{display:flex;gap:10px;flex-wrap:wrap}.p2-btn{font:500 11.5px OSW,sans-serif;letter-spacing:.2em;text-transform:uppercase;text-decoration:none;padding:15px 22px;border:1px solid var(--ink)}.p2-btn.k{background:var(--ink);color:var(--sheet)}
.p2-stamp{position:relative;width:104px;height:128px;padding:8px;background:#fdfbf6;filter:drop-shadow(0 1px 1px rgba(0,0,0,.18)) drop-shadow(0 6px 8px rgba(60,40,20,.12));-webkit-mask:linear-gradient(#000 0 0) content-box,radial-gradient(circle at 5px 5px,transparent 2.6px,#000 3px) -5px -5px/10px 10px;mask:linear-gradient(#000 0 0) content-box,radial-gradient(circle at 5px 5px,transparent 2.6px,#000 3px) -5px -5px/10px 10px;z-index:3}
.p2-stamp{-webkit-mask:none;mask:none;background:radial-gradient(circle at 5px 5px,transparent 2.8px,#fdfbf6 3.2px) -5px -5px/10px 10px}
.p2-stamp::after{content:"";position:absolute;inset:5px;background:#fdfbf6}
.p2-stamp .sf{position:relative;z-index:1;height:100%;border:1px solid currentColor;padding:4px;display:flex;flex-direction:column}
.p2-stamp.red{color:var(--red)}.p2-stamp.blue{color:var(--blue)}
.p2-stamp svg{flex:1;width:100%;display:block}
.p2-stamp .st{display:flex;justify-content:space-between;align-items:baseline;padding-top:4px;font:500 7.5px OSW,sans-serif;letter-spacing:.18em}.p2-stamp .st b{font:21px DMS,serif;font-weight:400;letter-spacing:0}
.p2-stamp.big{width:124px;height:152px}.p2-stamp.big .st b{font-size:26px}
.p2-pm{display:block;width:100%;height:auto}
.p2-sec{width:min(1240px,100% - 96px);margin:0 auto;padding:0 0 130px;display:grid;grid-template-columns:3fr 9fr;gap:60px;align-items:start}
.p2-cap{position:sticky;top:110px;border-top:1px solid var(--ink);padding-top:16px}
.p2-no{font:500 11px OSW,sans-serif;letter-spacing:.24em;color:var(--red)}
.p2-cap h2{font:44px/1 DMS,serif;font-weight:400;margin:12px 0 10px}.p2-cap p{margin:0;font:italic 17px DMS,serif;color:var(--mut)}
.p2-letter{position:relative;background:var(--sheet);padding:60px 72px 64px;max-width:760px;box-shadow:0 1px 1px rgba(0,0,0,.05),0 30px 50px -36px rgba(60,40,20,.4);transform:rotate(.5deg)}
.p2-letter::before{content:"";position:absolute;inset:0;border:10px solid transparent;border-image:repeating-linear-gradient(-45deg,var(--red) 0 12px,transparent 12px 20px,var(--blue) 20px 32px,transparent 32px 40px) 10;opacity:.9}
.p2-letter .hd{display:flex;justify-content:space-between;align-items:center;font:500 10.5px OSW,sans-serif;letter-spacing:.24em;text-transform:uppercase;color:var(--mut);margin-bottom:34px}
.p2-letter p{font:italic 23px/1.6 DMS,serif;margin:0 0 18px;color:#24324a}.p2-letter .sal{font-size:26px}.p2-letter .sig{margin:30px 0 0}
.p2-pass{display:grid;grid-template-columns:1fr 220px;background:var(--sheet);border-radius:16px;box-shadow:0 1px 1px rgba(0,0,0,.05),0 30px 50px -36px rgba(60,40,20,.45);position:relative;-webkit-mask:radial-gradient(circle at calc(100% - 220px) 0,transparent 14px,#000 14.5px) top/100% 51% no-repeat,radial-gradient(circle at calc(100% - 220px) 100%,transparent 14px,#000 14.5px) bottom/100% 51% no-repeat;mask:radial-gradient(circle at calc(100% - 220px) 0,transparent 14px,#000 14.5px) top/100% 51% no-repeat,radial-gradient(circle at calc(100% - 220px) 100%,transparent 14px,#000 14.5px) bottom/100% 51% no-repeat}
.p2-pass .m{padding:28px 40px 36px}
.p2-pass .top{display:flex;align-items:center;gap:16px;font:500 10.5px OSW,sans-serif;letter-spacing:.26em;text-transform:uppercase;color:var(--mut);padding-bottom:20px;border-bottom:1px solid rgba(29,42,58,.14)}.p2-pass .top .air{margin-right:auto}
.p2-pass .route{display:grid;grid-template-columns:auto 1fr auto;gap:30px;align-items:center;padding:28px 0}
.p2-pass .route small,.p2-pass .stub small{display:block;font:500 9.5px OSW,sans-serif;letter-spacing:.24em;text-transform:uppercase;color:var(--mut)}
.p2-pass .route b{display:block;font:300 68px/1 OSW,sans-serif;letter-spacing:.02em;margin:6px 0 4px}.p2-pass .route span{font:italic 15px DMS,serif;color:var(--mut)}.p2-pass .route .to{text-align:right}
.p2-pass .path{display:flex;align-items:center;gap:12px;color:var(--red)}.p2-pass .path i{flex:1;border-top:1.5px dashed rgba(29,42,58,.35)}.p2-pass .path svg{width:26px;height:26px}
.p2-pass .sch{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(4,1fr);border-top:1px solid rgba(29,42,58,.14)}
.p2-pass .sch li{padding:20px 18px 0 0;border-right:1px solid rgba(29,42,58,.1);margin-right:18px}.p2-pass .sch li:last-child{border:0;margin:0}
.p2-pass time{display:block;font:400 32px/1 OSW,sans-serif;color:var(--ink)}.p2-pass .sch b{display:block;font:22px DMS,serif;font-weight:400;margin:10px 0 2px}.p2-pass .sch span{font:500 10px OSW,sans-serif;letter-spacing:.2em;text-transform:uppercase;color:var(--mut)}
.p2-pass .stub{border-left:1.5px dashed rgba(29,42,58,.3);padding:28px 26px;display:grid;gap:14px;align-content:start;background:linear-gradient(var(--sheet),#f6f1e6)}
.p2-pass .stub b{font:400 18px OSW,sans-serif;letter-spacing:.04em}
.p2-pass .bar{height:52px;margin-top:6px;background:repeating-linear-gradient(90deg,var(--ink) 0 2px,transparent 2px 4px,var(--ink) 4px 5px,transparent 5px 8px,var(--ink) 8px 11px,transparent 11px 12px,var(--ink) 12px 13px,transparent 13px 16px)}
.p2-dest{display:grid;grid-template-columns:7fr 4fr;gap:44px;align-items:end}
.p2-map{position:relative;background:#efe8da;padding:0;box-shadow:0 1px 1px rgba(0,0,0,.05),0 30px 50px -36px rgba(60,40,20,.45);transform:rotate(-.6deg);overflow:hidden}
.p2-map .fold{position:absolute;inset:0;pointer-events:none;background:linear-gradient(90deg,transparent 32.8%,rgba(0,0,0,.06) 33.3%,rgba(255,255,255,.35) 33.8%,transparent 36%,transparent 65.8%,rgba(0,0,0,.06) 66.3%,rgba(255,255,255,.35) 66.8%,transparent 69%),linear-gradient(transparent 49.5%,rgba(0,0,0,.06) 50%,rgba(255,255,255,.3) 50.5%,transparent 53%)}
.p2-venue h3{font:40px/1.05 DMS,serif;font-weight:400;margin:0 0 14px}.p2-venue p{font-size:16px;line-height:1.65;margin:0 0 24px;color:#3c4654}
.p2-prints{display:grid;grid-template-columns:1.25fr 1fr 1fr;gap:34px;align-items:start}
.p2-prints figure{margin:0;transform:rotate(var(--r))}.p2-prints figure:nth-child(2){margin-top:60px}.p2-prints figure:nth-child(3){margin-top:20px}
.p2-prints .pr{background:#fdfbf6;padding:12px;box-shadow:0 1px 1px rgba(0,0,0,.06),0 24px 36px -26px rgba(60,40,20,.5)}.p2-prints .ph{aspect-ratio:4/5}.p2-prints figure:first-child .ph{aspect-ratio:4/4.6}
.p2-prints figcaption{font:italic 16px DMS,serif;color:var(--mut);margin-top:12px;padding-left:4px}
.p2-notes{background:var(--sheet);box-shadow:0 1px 1px rgba(0,0,0,.05),0 30px 50px -36px rgba(60,40,20,.4)}
.p2-notes .cols{display:grid;grid-template-columns:repeat(3,1fr)}.p2-notes .cols>div{padding:36px 32px;border-right:1px solid rgba(29,42,58,.12)}.p2-notes .cols>div:last-child{border:0}
.p2-notes h4{font:500 11px OSW,sans-serif;letter-spacing:.24em;text-transform:uppercase;color:var(--red);margin:0 0 12px}.p2-notes p{margin:0;font-size:16px;line-height:1.6}
.p2-notes .dep{display:flex;align-items:baseline;gap:10px;padding:20px 32px;border-top:1.5px dashed rgba(29,42,58,.25);font:500 10.5px OSW,sans-serif;letter-spacing:.24em;text-transform:uppercase;color:var(--mut)}
.p2-notes .dep span:first-child{margin-right:auto}.p2-notes .dep b{font:300 40px/1 OSW,sans-serif;color:var(--ink);letter-spacing:0;margin-left:14px}
.p2-reply{display:grid;grid-template-columns:1fr 1.15fr;background:var(--sheet);padding:44px;gap:44px;box-shadow:0 1px 1px rgba(0,0,0,.05),0 34px 56px -38px rgba(60,40,20,.5);transform:rotate(-.4deg)}
.p2-reply .l{border-right:1px solid rgba(29,42,58,.18);padding-right:44px}
.p2-reply h3{font:54px/1 DMS,serif;font-weight:400;margin:20px 0 18px}.p2-reply .l p{font:italic 20px/1.5 DMS,serif;color:#3c4654;margin:0}
.p2-reply .r{position:relative;padding-top:150px}
.p2-reply .corner{position:absolute;top:0;right:0;width:240px;height:140px}
.p2-reply .affix{position:absolute;right:0;top:0;width:104px;height:128px;border:1px dashed rgba(29,42,58,.3);display:grid;place-items:center;text-align:center;font:500 9px OSW,sans-serif;letter-spacing:.2em;text-transform:uppercase;color:var(--mut)}
.p2-reply .corner .p2-stamp{position:absolute;right:6px;top:4px;transform:rotate(3deg)}
.p2-reply .corner .pmw{position:absolute;right:56px;top:16px;width:220px;color:rgba(29,42,58,.72);transform:rotate(-6deg);z-index:4;mix-blend-mode:multiply}
.p2-reply .rs{display:grid;gap:16px}.p2-reply .rs label>span{font:500 9.5px OSW,sans-serif;letter-spacing:.24em;text-transform:uppercase;color:var(--mut)}
.p2-reply .rs input,.p2-reply .rs select,.p2-reply .rs textarea{font:italic 20px DMS,serif;border-bottom:1px solid rgba(29,42,58,.3);padding:6px 0}
.p2-reply .att label span{display:block;padding:14px;border:1px solid rgba(29,42,58,.35);text-align:center;font:500 11px OSW,sans-serif;letter-spacing:.2em;text-transform:uppercase}
.p2-reply .att input:checked+span{border-color:var(--ink);background:var(--ink);color:var(--sheet)}
.p2-reply button{background:var(--red);color:#fff;border:0;padding:17px;font:500 12px OSW,sans-serif;letter-spacing:.24em;text-transform:uppercase;margin-top:6px}
.p2-foot{text-align:center;padding:10px 0 80px}.p2-foot p{font:500 10.5px OSW,sans-serif;letter-spacing:.3em;text-transform:uppercase;color:var(--mut);margin:14px 0 0}
@media(max-width:700px){
.p2-nav{padding:12px 18px;gap:12px}.p2-nav .lk{display:none}.p2-nav>b{margin-right:auto;font-size:21px}.p2-cta{padding:8px 14px}
.p2-hero{width:auto;margin:0 18px;grid-template-columns:1fr;gap:44px;padding:34px 0 70px}
.p2-front{padding:9px;transform:rotate(-1.2deg);margin-right:10px}.p2-front .in{aspect-ratio:4/5}.p2-front .p2-stamp.big{width:84px;height:104px;right:-12px;top:-20px}.p2-front .p2-stamp.big .st b{font-size:19px}.p2-front .pmw{width:170px;right:12px;top:30px}
.p2-intro h1{font-size:72px;margin:16px 0}.p2-intro .lede{font-size:20px}
.p2-sec{width:auto;margin:0 18px;grid-template-columns:1fr;gap:22px;padding-bottom:80px}
.p2-cap{position:static}.p2-cap h2{font-size:36px}
.p2-letter{padding:44px 28px 46px;transform:none}.p2-letter p{font-size:19px}
.p2-pass{grid-template-columns:1fr;-webkit-mask:radial-gradient(circle at 0 calc(100% - 160px),transparent 14px,#000 14.5px) left/51% 100% no-repeat,radial-gradient(circle at 100% calc(100% - 160px),transparent 14px,#000 14.5px) right/51% 100% no-repeat;mask:radial-gradient(circle at 0 calc(100% - 160px),transparent 14px,#000 14.5px) left/51% 100% no-repeat,radial-gradient(circle at 100% calc(100% - 160px),transparent 14px,#000 14.5px) right/51% 100% no-repeat}
.p2-pass .m{padding:22px 22px 26px}.p2-pass .route{gap:14px;padding:22px 0}.p2-pass .route b{font-size:44px}.p2-pass .route span{font-size:13px}
.p2-pass .sch{grid-template-columns:1fr}.p2-pass .sch li{display:grid;grid-template-columns:76px 1fr;grid-template-rows:auto auto;column-gap:14px;padding:14px 0;margin:0;border-right:0;border-bottom:1px solid rgba(29,42,58,.1)}.p2-pass .sch li:last-child{border:0}.p2-pass time{grid-row:1/3;font-size:28px}.p2-pass .sch b{margin:0;font-size:20px}
.p2-pass .stub{border-left:0;border-top:1.5px dashed rgba(29,42,58,.3);grid-template-columns:1fr 1fr;height:160px;padding:20px 22px;gap:10px}.p2-pass .bar{display:none}
.p2-dest{grid-template-columns:1fr;gap:24px}.p2-map{transform:none}
.p2-prints{grid-template-columns:1fr 1fr;gap:16px}.p2-prints figure:first-child{grid-column:1/3}.p2-prints figure:first-child .ph{aspect-ratio:4/3}.p2-prints figure:nth-child(2){margin-top:0}.p2-prints figure:nth-child(3){margin-top:26px}.p2-prints .pr{padding:8px}
.p2-notes .cols{grid-template-columns:1fr}.p2-notes .cols>div{border-right:0;border-bottom:1px solid rgba(29,42,58,.12);padding:24px 22px}.p2-notes .dep{flex-wrap:wrap;padding:18px 22px;row-gap:6px}.p2-notes .dep span:first-child{width:100%}.p2-notes .dep b{margin-left:0;font-size:34px}
.p2-reply{grid-template-columns:1fr;padding:26px 22px;gap:24px;transform:none}.p2-reply .l{border-right:0;border-bottom:1px solid rgba(29,42,58,.18);padding:0 0 24px;margin-right:110px}.p2-reply h3{font-size:40px}.p2-reply .l p{font-size:18px}
.p2-reply{position:relative}.p2-reply .r{position:static;padding-top:0}.p2-reply .corner{top:20px;right:16px;width:110px;height:130px}.p2-reply .corner .pmw{display:none}.p2-reply .affix{display:none}
}
.p2-ic{width:760px;aspect-ratio:3/2;background:#fbf8f2;color:#1d2a3a;display:grid;grid-template-columns:1.1fr 1fr;padding:38px 40px;gap:34px;font-family:JOS,sans-serif}
.p2-ic .l{border-right:1px solid rgba(29,42,58,.2);padding-right:34px;display:flex;flex-direction:column}
.p2-ic h2{font:52px/.95 DMS,serif;font-weight:400;margin:22px 0 16px}.p2-ic h2 i{color:#b8402a;font-size:.8em}.p2-ic .l p{font:italic 18px/1.5 DMS,serif;margin:0;color:#3c4654}
.p2-ic .facts{margin-top:auto;display:grid;grid-template-columns:1fr 1fr;border-top:1px solid rgba(29,42,58,.2)}.p2-ic .facts div{padding-top:10px;font-size:15px}.p2-ic .facts small{display:block;font:500 9.5px OSW,sans-serif;letter-spacing:.24em;text-transform:uppercase;color:#6b6a66}
.p2-ic .r{position:relative}.p2-ic .p2-stamp{position:absolute;right:0;top:0}.p2-ic .pmw{position:absolute;right:62px;top:26px;width:210px;color:rgba(29,42,58,.75);transform:rotate(-8deg);z-index:4;mix-blend-mode:multiply}
.p2-ic .lines{position:absolute;left:0;right:0;bottom:0}.p2-ic .lines div{border-bottom:1px solid rgba(29,42,58,.3);padding:10px 0 4px;font-size:15px}.p2-ic .lines .rb{font:italic 16px DMS,serif;color:#b8402a}
.p2-ic .edge{position:absolute;inset:0;border:7px solid transparent;border-image:repeating-linear-gradient(-45deg,#b8402a 0 10px,transparent 10px 16px,#2b4f7a 16px 26px,transparent 26px 32px) 7;pointer-events:none}
.p2-front .pmw{right:-118px;top:46px;width:232px;color:rgba(29,42,58,.8);z-index:4;transform:rotate(-6deg)}
@media(max-width:700px){.p2-reply .from{display:none}.p2-front .pmw{right:-4px;top:58px;width:150px}}
.p2-intro h1{font-size:min(112px,calc(700px / var(--nl)))}
.cjk .p2-intro h1{line-height:1.08}
.p2-front .in .ph{height:100%}.pc-art{display:block}
.p2-btn{background:none;color:inherit;cursor:pointer}.p2-btn.k{background:var(--ink);color:var(--sheet)}
.p2-pass .sch{grid-template-columns:repeat(auto-fit,minmax(130px,1fr));row-gap:18px}
.p2-prints .ph{height:auto}
.p2-prints.n1{grid-template-columns:minmax(0,560px)}.p2-prints.n2{grid-template-columns:1.25fr 1fr}
.p2-prints figure:nth-child(n+4){margin-top:0}
.p2-notes .cols.n1{grid-template-columns:1fr}.p2-notes .cols.n2{grid-template-columns:1fr 1fr}
.p2-reply .rs-more{justify-content:flex-start}
.x-letter b{font-size:min(40px,calc(300px / var(--nl)))}
.p2-ic{width:720px;aspect-ratio:7/5}
.p2-ic h2{font-size:min(52px,calc(330px / var(--nl)))}
.p2-ic .ic-qr{position:static;flex-direction:row;gap:10px;margin-top:10px;align-items:center;justify-content:flex-start}.p2-ic .ic-qr .url{text-align:left}
@media(max-width:700px){.p2-intro h1{font-size:min(72px,calc(520px / var(--nl)))}.p2-prints.n1,.p2-prints.n2{grid-template-columns:1fr}.p2-prints.n2 figure:first-child{grid-column:auto}.p2-notes .cols.n2{grid-template-columns:1fr}}`,
gallery:`.t-gl{--ink:#121212;background:#fff;color:var(--ink);font-family:TEN,sans-serif}
.gl-cover{position:relative;height:100vh;min-height:640px;color:#fff;overflow:hidden}
.gl-cover>.ph{position:absolute;inset:0}.gl-cover::after{content:"";position:absolute;inset:0;background:linear-gradient(rgba(0,0,0,.32),transparent 32%,transparent 55%,rgba(0,0,0,.55))}
.mo .gl-cover>.ph{animation:kb 18s ease-out both}@keyframes kb{from{transform:scale(1.12)}}
.gl-mast{position:absolute;z-index:2;top:26px;left:30px;right:30px}
.gl-iss{display:flex;justify-content:space-between;font-size:11px;letter-spacing:.24em;text-transform:uppercase;border-bottom:1px solid rgba(255,255,255,.6);padding-bottom:10px}
.gl-logo{font:13.4vw/.86 INS,serif;letter-spacing:-.035em;margin:8px 0 0;white-space:nowrap}.gl-logo i{font-size:.8em}
.gl-lines{position:absolute;z-index:2;left:30px;bottom:34px;max-width:440px}.gl-lines b{display:block;font:italic 52px/1 INS,serif;font-weight:400}.gl-lines p{margin:12px 0 0;font-size:13px;letter-spacing:.2em;text-transform:uppercase;line-height:1.8}
.gl-code{position:absolute;z-index:2;right:30px;bottom:34px;background:#fff;color:#111;padding:8px 10px 4px;font-size:9px;letter-spacing:.2em;text-align:center}.gl-code div{width:110px;height:40px;background:repeating-linear-gradient(90deg,#111 0 2px,#fff 2px 3px,#111 3px 4px,#fff 4px 7px,#111 7px 10px,#fff 10px 11px)}
.gl-toc{display:grid;grid-template-columns:5fr 7fr;gap:40px;padding:110px 30px 90px;border-bottom:1px solid var(--ink)}
.gl-toc h2{font:italic 120px/.85 INS,serif;margin:0;font-weight:400}
.gl-toc ol{list-style:none;margin:0;padding:0}.gl-toc li{display:grid;grid-template-columns:70px 1fr auto;gap:16px;align-items:baseline;padding:16px 0;border-top:1px solid rgba(0,0,0,.2);font:34px INS,serif}.gl-toc li b,.gl-toc li span{font:12px TEN,sans-serif;letter-spacing:.2em}
.gl-spread{position:relative;display:grid;grid-template-columns:1fr 1fr;min-height:100vh;border-bottom:1px solid var(--ink)}
.gl-spread::before{content:"";position:absolute;left:50%;top:0;bottom:0;border-left:1px solid rgba(0,0,0,.15);z-index:1}
.gl-pg{position:relative;padding:80px 60px 80px}.gl-pg.img{padding:0;overflow:hidden}.gl-pg.img .ph{position:absolute;inset:0}
.gl-folio{position:absolute;bottom:24px;left:60px;right:60px;display:flex;justify-content:space-between;font-size:10px;letter-spacing:.24em;text-transform:uppercase;opacity:.6}.gl-pg.img .gl-folio{color:#fff;opacity:.95}
.gl-kick{font-size:11px;letter-spacing:.28em;text-transform:uppercase}
.gl-h{font:92px/.9 INS,serif;margin:18px 0 36px;letter-spacing:-.02em;font-weight:400}.gl-h i{font-size:.9em}
.gl-col{font-size:15.5px;line-height:1.75;columns:2;column-gap:32px}.gl-col p{margin:0 0 14px}
.gl-col p:first-child::first-letter{float:left;font:86px/.8 INS,serif;padding:6px 10px 0 0}
.gl-pull{font:italic 40px/1.1 INS,serif;margin:40px 0 0;padding-top:24px;border-top:1px solid var(--ink)}
.gl-ag{margin:0;padding:0;list-style:none}.gl-ag li{display:grid;grid-template-columns:150px 1fr;padding:20px 0;border-top:1px solid rgba(0,0,0,.2)}.gl-ag b{font:italic 56px/1 INS,serif;font-weight:400}.gl-ag h3{font:30px INS,serif;margin:0 0 4px;font-weight:400}.gl-ag p{margin:0;font-size:13px;letter-spacing:.14em;text-transform:uppercase;opacity:.6}
.gl-band{position:relative;height:90vh;min-height:600px;color:#fff;border-bottom:1px solid var(--ink);overflow:hidden}.gl-band>.ph{position:absolute;inset:0}.gl-band::after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,rgba(0,0,0,.6),transparent 65%)}
.gl-band .t{position:absolute;z-index:2;left:60px;bottom:60px;max-width:520px}.gl-band .t h2{font:96px/.9 INS,serif;margin:10px 0 18px;font-weight:400}.gl-band .t p{font-size:15px;line-height:1.7;margin:0 0 20px}
.gl-btn{display:inline-block;padding:14px 22px;border:1px solid currentColor;font-size:11px;letter-spacing:.24em;text-transform:uppercase;text-decoration:none;margin:0 8px 8px 0}.gl-btn.f{background:#fff;color:#111;border-color:#fff}
.gl-mapin{position:absolute;z-index:2;right:60px;bottom:60px;width:260px;background:#fff;padding:8px}
.gl-mos{padding:90px 30px 70px;border-bottom:1px solid var(--ink);display:grid;grid-template-columns:repeat(12,1fr);grid-auto-rows:70px;gap:16px}
.gl-mos figure{margin:0;position:relative;overflow:hidden}.gl-mos figure .ph{position:absolute;inset:0}.gl-mos figcaption{position:absolute;left:10px;bottom:8px;font-size:10px;letter-spacing:.2em;text-transform:uppercase;color:#fff;text-shadow:0 1px 6px rgba(0,0,0,.5)}
.gl-mos .hd{grid-column:1/6;grid-row:1/3}.gl-mos .a{grid-column:6/13;grid-row:1/7}.gl-mos .b{grid-column:1/6;grid-row:3/8}.gl-mos .c{grid-column:1/4;grid-row:8/11}.gl-mos .d{grid-column:4/9;grid-row:8/13}.gl-mos .e{grid-column:9/13;grid-row:7/12}
.gl-notes{display:grid;grid-template-columns:repeat(4,1fr);padding:90px 30px;border-bottom:1px solid var(--ink)}.gl-notes>div{padding:0 22px;border-left:1px solid rgba(0,0,0,.2)}.gl-notes>div:first-child{border:0;padding-left:0}
.gl-notes h4{font:italic 34px INS,serif;margin:0 0 10px;font-weight:400}.gl-notes p{font-size:14.5px;line-height:1.7;margin:0}
.gl-notes .cd b{display:block;font:110px/.85 INS,serif;font-weight:400}
.gl-back{background:#111;color:#fff;display:grid;grid-template-columns:5fr 7fr;gap:60px;padding:110px 30px 80px}
.gl-back h2{font:italic 150px/.8 INS,serif;margin:0;font-weight:400}.gl-back .sub{font-size:12px;letter-spacing:.24em;text-transform:uppercase;margin-top:28px;opacity:.7;line-height:1.9}
.gl-back .rs{display:grid;gap:0}.gl-back .rs>label,.gl-back .rs .two>label{border-top:1px solid #444;padding:16px 0}.gl-back .rs .two{gap:30px}
.gl-back .rs label>span{font-size:10px;letter-spacing:.24em;text-transform:uppercase;opacity:.55}
.gl-back .rs input,.gl-back .rs select,.gl-back .rs textarea{font:30px INS,serif;padding-top:4px}.gl-back .rs select option{color:#000}
.gl-back .att{border-top:1px solid #444;padding:16px 0}.gl-back .att label span{display:block;padding:16px;border:1px solid #555;text-align:center;font:italic 24px INS,serif}
.gl-back .att input:checked+span{background:#fff;color:#111}
.gl-back button{background:#fff;color:#111;border:0;padding:20px;font-size:12px;letter-spacing:.3em;text-transform:uppercase;margin-top:10px}
.gl-colo{display:flex;justify-content:space-between;padding:18px 30px;background:#111;color:#888;font-size:10px;letter-spacing:.24em;text-transform:uppercase;border-top:1px solid #333}
@media(max-width:700px){.gl-cover{height:100svh;min-height:600px}.gl-mast{top:16px;left:16px;right:16px}.gl-iss span:nth-child(2){display:none}.gl-logo{font-size:23vw;white-space:normal;line-height:.82}.gl-lines{left:16px;bottom:24px;right:16px}.gl-lines b{font-size:40px}.gl-code{display:none}.gl-toc{grid-template-columns:1fr;padding:70px 16px 50px;gap:20px}.gl-toc h2{font-size:84px}.gl-toc li{grid-template-columns:44px 1fr auto;font-size:26px}.gl-spread{grid-template-columns:1fr;min-height:0}.gl-spread::before{display:none}.gl-pg{padding:50px 16px 64px}.gl-pg.img{height:70svh;min-height:420px}.gl-folio{left:16px;right:16px}.gl-h{font-size:60px}.gl-col{columns:1}.gl-pull{font-size:30px}.gl-ag li{grid-template-columns:96px 1fr}.gl-ag b{font-size:40px}.gl-ag h3{font-size:24px}.gl-band{height:auto;min-height:85svh}.gl-band .t{left:16px;right:16px;bottom:30px}.gl-band .t h2{font-size:62px}.gl-mapin{display:none}.gl-mos{padding:60px 16px 50px;grid-template-columns:repeat(6,1fr);grid-auto-rows:60px;gap:10px}.gl-mos .hd{grid-column:1/7;grid-row:1/3}.gl-mos .a{grid-column:1/7;grid-row:3/8}.gl-mos .b{grid-column:1/4;grid-row:8/12}.gl-mos .e{grid-column:4/7;grid-row:8/11}.gl-mos .c{grid-column:4/7;grid-row:11/14}.gl-mos .d{grid-column:1/4;grid-row:12/15}.gl-notes{grid-template-columns:1fr 1fr;padding:60px 16px;gap:34px 0}.gl-notes>div:nth-child(3){border:0;padding-left:0}.gl-back{grid-template-columns:1fr;padding:70px 16px 50px;gap:30px}.gl-back h2{font-size:100px}.gl-colo{flex-direction:column;gap:6px;padding:16px}}
.ic-gl{width:480px;aspect-ratio:3/4.2;background:#fff;color:#121212;font-family:TEN,sans-serif;display:grid;grid-template-rows:62% 38%}
.gl-logo{font-size:min(13.4vw,calc(200vw / var(--na)))}
.cjk .gl-logo{letter-spacing:0;line-height:1}
.cjk .gl-logo{font-size:min(13.4vw,calc(150vw / var(--na)))}@media(max-width:700px){.cjk .gl-logo{font-size:min(23vw,calc(118vw / var(--nl)))}}
.gl-cover>.ph{height:100%}
.gl-cover.np{background:radial-gradient(ellipse 80% 70% at 30% 20%,#2e2b27,#121212 70%)}.gl-cover.np::after{display:none}
.gl-spread.one{grid-template-columns:1fr;min-height:0}.gl-spread.one::before{display:none}.gl-spread.one .gl-pg{padding:110px 12vw 120px}
.gl-col.c1{columns:1;max-width:36em}
.gl-pg.img .ph,.gl-band>.ph,.gl-mos figure .ph{height:100%}
.gl-band.np{background:#121212;height:auto;min-height:72vh}.gl-band.np::after{display:none}
.gl-band .t{max-width:560px}.gl-tools{display:flex;flex-wrap:wrap}
.gl-btn{background:none;color:inherit;cursor:pointer}.gl-btn.f{background:#fff;color:#111;border-color:#fff}
.gl-mos figure.x{grid-column:span 4;grid-row:span 4}
.gl-mos.n1 .a{grid-row:1/8}
.gl-notes.n1{grid-template-columns:1fr}.gl-notes.n2{grid-template-columns:1fr 1fr}.gl-notes.n3{grid-template-columns:repeat(3,1fr)}
.gl-notes .gl-kick{margin-bottom:12px}
.gl-toc li a{text-decoration:none}
.gl-cal{padding:40px 30px;text-align:center}
.gl-back .rs-more{justify-content:flex-start;padding-top:14px}.gl-back .rsvp-msg,.gl-back .privacy{padding-top:14px}
.x-mag .mh b{font-size:min(clamp(34px,8vw,50px),calc(250px / var(--nl)))}
.x-mag.np .ph-w{background:radial-gradient(ellipse at 30% 20%,#3a3631,#151515 70%)}
.ic-gl .ic-top{position:relative;color:#fff;overflow:hidden;background:radial-gradient(ellipse at 30% 20%,#3a3631,#151515 70%)}
.ic-gl .ic-top .ph{position:absolute;inset:0;height:100%}
.ic-sc{position:absolute;inset:0;background:linear-gradient(rgba(0,0,0,.32),transparent 40%)}
.ic-mh{position:absolute;top:14px;left:16px;right:16px}
.ic-iss{display:flex;justify-content:space-between;font-size:9px;letter-spacing:.24em;border-bottom:1px solid rgba(255,255,255,.6);padding-bottom:6px;text-transform:uppercase}
.ic-logo{font:66px/.86 INS,serif;letter-spacing:-.03em;margin-top:6px;font-size:min(66px,calc(330px / var(--nl)))}
.ic-bt{padding:22px 20px;display:grid;grid-template-columns:1fr 1fr;gap:16px}
.ic-bt .gl-kick{font-size:9px}.ic-dt{font:italic 26px/1.1 INS,serif;margin-top:8px}
.ic-in{font-size:12px;line-height:1.7;border-left:1px solid #ddd;padding-left:14px}
.ic-gl .ic-qr{position:static;align-items:flex-start;margin-top:8px}.ic-gl .ic-qr .url{text-align:left}.ic-gl .ic-qr .qr{width:54px;height:54px}
@media(max-width:700px){.gl-logo{font-size:min(23vw,calc(150vw / var(--nl)))}.gl-spread.one .gl-pg{padding:50px 16px 64px}.gl-notes.n2,.gl-notes.n3{grid-template-columns:1fr}.gl-mos figure.x{grid-column:span 3;grid-row:span 3}}
.gl-notes.solo{display:flex;justify-content:center;text-align:center}.gl-notes.solo .cd{border:0;padding-left:0;margin:0}`};
const ENVCSS={common:`.env2{--grain:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='220' height='220'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' seed='4'/%3E%3CfeColorMatrix values='0 0 0 0 .3 0 0 0 0 .25 0 0 0 0 .2 0 0 0 .09 0'/%3E%3C/filter%3E%3Crect width='220' height='220' filter='url(%23n)'/%3E%3C/svg%3E"),url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Cfilter id='f'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.012 .09' numOctaves='2' seed='9'/%3E%3CfeColorMatrix values='0 0 0 0 .4 0 0 0 0 .35 0 0 0 0 .3 0 0 0 .05 0'/%3E%3C/filter%3E%3Crect width='300' height='300' filter='url(%23f)'/%3E%3C/svg%3E");
position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;overflow:hidden;perspective:1800px;cursor:pointer;-webkit-tap-highlight-color:transparent}
.env2 *{box-sizing:border-box}
.x-bg{position:absolute;inset:0}
.x-bg::after{content:"";position:absolute;inset:0;background-image:var(--grain);opacity:.8}
.x-zoom,.x-float{position:relative;transform-style:preserve-3d}
.x-float{animation:flt 7s ease-in-out infinite}
@keyframes flt{50%{transform:translateY(-4px)}}
.pp{background-image:var(--grain),linear-gradient(135deg,rgba(255,255,255,.4),rgba(255,255,255,0) 42%,rgba(0,0,0,.035))}
.x-face{position:absolute;inset:0;backface-visibility:hidden;-webkit-backface-visibility:hidden}
.x-sh{position:absolute;left:3%;right:3%;top:8%;bottom:-6%;background:radial-gradient(closest-side,rgba(40,28,18,.36),rgba(40,28,18,.12) 60%,transparent);filter:blur(10px);transform:translateZ(-1px);pointer-events:none}
.x-cue{position:absolute;bottom:8vh;left:0;right:0;text-align:center;font:500 10.5px/1 JOS,sans-serif;letter-spacing:.38em;text-transform:uppercase;opacity:0;animation:cue .9s .7s ease forwards}
.x-cue span{display:inline-block;animation:cueb 3.2s 1.6s ease-in-out infinite}
@keyframes cue{to{opacity:.62}}@keyframes cueb{50%{opacity:.45}}
.x-skip{position:absolute;bottom:4.5vh;left:0;right:0;text-align:center;font:500 9.5px JOS,sans-serif;letter-spacing:.3em;text-transform:uppercase;opacity:0;pointer-events:none}
.x-ping{position:absolute;width:0;height:0;transform:translateZ(40px);pointer-events:none}
.x-ping i{position:absolute;left:-22px;top:-22px;width:44px;height:44px;border-radius:50%;border:1px solid currentColor;opacity:0;animation:ping 2.6s 1.2s ease-out infinite}
.x-ping i+i{animation-delay:1.65s}
@keyframes ping{0%{transform:scale(.5);opacity:.55}100%{transform:scale(1.7);opacity:0}}
.env2.open .x-cue,.env2.open .x-ping{opacity:0!important;transition:opacity .25s}
.env2.open .x-float{animation:none}
.env2.open .x-skip{animation:skp var(--fade) linear both}
@keyframes skp{0%,14%{opacity:0}24%,80%{opacity:.45}100%{opacity:0}}
.env2.open{animation:fadeout .45s ease var(--fade) both}
@keyframes fadeout{to{opacity:0}}
.env2.skip{animation:none;opacity:0;transition:opacity .25s}
.env2.open .x-zoom{animation:none}`,
tail:`@media(max-width:700px){
.x-bg::after,.pp{background-image:none!important}
.x-sh{filter:none;background:radial-gradient(closest-side,rgba(40,28,18,.28),transparent)}
.x-cover .mono{width:84px;height:84px;font-size:32px}
@keyframes lpBook{0%{transform:none}12%{transform:translate3d(0,-6px,20px)}50%,64%{transform:translate3d(50%,-6px,20px)}88%,100%{transform:translate3d(0,0,300px)}}
.x-book{width:44vw}
.x-tk{width:92vw;height:calc(92vw*.42)}
.x-gw{--gz:1.9}
.x-air{width:92vw;aspect-ratio:1.42}.x-flip .fr{padding:10px}.x-flip .fr::before{padding:9px;background:repeating-linear-gradient(-45deg,var(--red) 0 11px,var(--sheet) 11px 17px,var(--blue) 17px 28px,var(--sheet) 28px 34px)}.x-flip .fr .p2-chip{left:24px;top:24px;font-size:9px}.x-flip .fr .p2-stamp{width:62px;height:78px;padding:6px;right:22px;top:20px}.x-flip .fr .p2-stamp .st span{display:none}.x-flip .fr .p2-stamp .st{justify-content:flex-end}.x-flip .fr .p2-stamp .st b{font-size:13px}.x-flip .fr .p2-stamp+.p2-stamp{right:92px;top:26px}.x-flip .fr .pmw{right:60px;top:64px;width:150px}.x-flip .fr .addr{left:24px;bottom:22px}.x-flip .fr .addr i{font-size:21px;margin-bottom:2px}.x-flip .fr .addr span{font-size:12px;padding:4px 40px 3px 0}
.x-postcard .x-letter::after{border-width:5px;border-image-width:5px}
.x-pocket,.x-postcard .x-pocket{filter:none}.x-seal svg,.x-tag .tg,.x-bow{filter:none}
.x-sleeve .sheen{display:none}
}
@media(prefers-reduced-motion:reduce){
.env2 *{animation:none!important}
.env2.open{animation:fadeout .4s ease both!important}
}
.x-postcard.open .x-flip .fr{animation:pcFr 3.45s both}@keyframes pcFr{0%,18.5%{opacity:1}19%,100%{opacity:0}}
.x-postcard.open .x-flip .bk{animation:pcBk 3.45s both}@keyframes pcBk{0%,18.5%{opacity:0}19%,31%{opacity:1}31.5%,100%{opacity:0}}.x-flip .bk{backface-visibility:visible;-webkit-backface-visibility:visible}
.x-main .bk{box-shadow:inset 0 0 0 1px rgba(0,0,0,.1),0 1px 0 #d9d7cf}
.x-postcard:not(.open) .x-flip .bk{opacity:0}
.x-main .bk{box-shadow:inset 0 0 0 1px rgba(0,0,0,.1),0 1px 0 #d9d7cf,0 2px 0 #cfccc2,0 26px 50px -22px rgba(20,20,10,.45)}
@media(min-width:701px){.x-gallery .x-gw{margin-top:22vh;width:300px;--gz:5}}
.x-postcard svg.x-pocket{position:absolute;inset:0;width:100%;height:100%;z-index:3;background:none;filter:none;overflow:visible}
.x-pkb{position:absolute;inset:0;z-index:3;pointer-events:none;border:8px solid transparent;border-image:repeating-linear-gradient(-45deg,var(--red) 0 12px,transparent 12px 20px,var(--blue) 20px 32px,transparent 32px 40px) 8;clip-path:polygon(0 0,50% 58%,100% 0,100% 100%,0 100%)}
.x-postcard.open .x-live .x-pkb{animation:pcDrop 3.45s both}.x-flip .bk .x-pkb{animation:none!important}
@media(max-width:700px){.x-pkb{border-width:5px;border-image-slice:5}}
.x-bloom .x-flap>div,.x-postcard .x-flap>div{backface-visibility:visible;-webkit-backface-visibility:visible}
.x-bloom:not(.open) .x-flap .fi,.x-postcard:not(.open) .x-flap .fi{opacity:0}
.x-bloom.open .x-flap .fo{animation:blFo 3.3s both}@keyframes blFo{0%,29%{opacity:1}29.5%,100%{opacity:0}}
.x-bloom.open .x-flap .fi{animation:blFi 3.3s both}@keyframes blFi{0%,29%{opacity:0}29.5%,100%{opacity:1}}
.x-postcard.open .x-live .x-flap .fo{animation:pcFo 3.45s both}@keyframes pcFo{0%,46%{opacity:1}46.5%,100%{opacity:0}}
.x-postcard.open .x-live .x-flap .fi{animation:pcFi 3.45s both}@keyframes pcFi{0%,46%{opacity:0}46.5%,100%{opacity:1}}`,
letterpress:`.x-letterpress{color:#1e2741}
.x-letterpress .x-bg{background:radial-gradient(ellipse 70% 60% at 50% 40%,#e4ded2,#cfc7b8 70%,#bfb6a5)}
.x-book{position:relative;width:min(340px,62vw);aspect-ratio:5/7;perspective:1700px}.x-book .x-sh{z-index:0}.x-page{z-index:1}.x-cover{z-index:2}
.x-book .x-sh{transform-origin:0 50%}
.x-page{position:absolute;inset:0;background-color:#f8f4ec;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:6px;padding:30px;font-family:BOD,serif;box-shadow:1px 1px 0 #e8e1d4,2px 2px 0 #ddd5c6,3px 3px 0 #e7e0d3,4px 4px 0 #d7cfbf,0 30px 50px -30px rgba(40,30,20,.5)}
.x-page::before{content:"";position:absolute;inset:14px;border:.75px solid rgba(30,39,65,.45)}
.x-page::after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,rgba(40,30,20,.32),rgba(40,30,20,.06) 30%,transparent 60%);opacity:0;pointer-events:none}
.x-page .k{font-size:8.5px;letter-spacing:.3em;text-transform:uppercase}.x-page .k.s{margin-top:8px;font-size:8px}
.x-page .n{font-size:36px;font-weight:500;letter-spacing:.12em;line-height:1}.x-page .a{font:italic 15px BOD,serif}.x-page .r{width:30px;border-top:.75px solid;opacity:.6;margin:10px 0}
.x-cover{position:absolute;inset:0;transform-origin:0 50%;transform-style:preserve-3d}
.x-cover .fr{background-color:#fbf8f1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:22px;box-shadow:inset -1px 0 0 rgba(0,0,0,.04)}
.x-cover .fr::after,.x-cover .bk::after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,rgba(0,0,0,0),rgba(30,20,10,.22));opacity:0;pointer-events:none}
.x-cover .bk::after{background:linear-gradient(270deg,rgba(0,0,0,0),rgba(30,20,10,.18))}
.x-cover .frame{position:absolute;inset:20px;box-shadow:inset 1px 1px 1.5px rgba(60,45,25,.2),1px 1px 0 rgba(255,255,255,.95)}
.x-cover .mono{width:104px;height:104px;border-radius:50%;display:grid;place-items:center;font:italic 40px BOD,serif;color:#f1ebdf;text-shadow:-1px -1px 0 rgba(70,55,35,.28),1px 1px 0 rgba(255,255,255,.95);box-shadow:inset 1.5px 1.5px 2px rgba(60,45,25,.22),inset -1px -1px 0 rgba(255,255,255,.9),1px 1px 0 rgba(255,255,255,.8)}
.x-cover .dt{font:9.5px BOD,serif;letter-spacing:.42em;color:#efe9dd;text-shadow:-.6px -.6px 0 rgba(70,55,35,.35),.6px .6px 0 #fff}
.x-cover .bk{transform:rotateY(180deg);background-color:#f3eee4;display:flex;align-items:center;justify-content:center}
.x-cover .lin{position:absolute;inset:16px;background:repeating-linear-gradient(45deg,rgba(30,39,65,.05) 0 1px,transparent 1px 7px),repeating-linear-gradient(-45deg,rgba(30,39,65,.05) 0 1px,transparent 1px 7px);border:.75px solid rgba(30,39,65,.2)}
.x-cover .wl{position:relative;font:italic 15px/1.5 BOD,serif;text-align:center;background:#f3eee4;padding:10px 18px;color:#2b3550}
.x-letterpress .x-ping{color:#1e2741}
.open .x-book{animation:lpBook 2.9s cubic-bezier(.45,.05,.25,1) both}
@keyframes lpBook{0%{transform:translate3d(0,0,0)}12%{transform:translate3d(0,-8px,40px)}50%{transform:translate3d(50%,-8px,40px)}64%{transform:translate3d(50%,-8px,40px)}88%,100%{transform:translate3d(0,0,420px)}}
.open .x-cover{animation:lpCover 2.9s both}
@keyframes lpCover{0%,11%{transform:rotateY(0)}11%{animation-timing-function:cubic-bezier(.5,0,.25,1)}50%,100%{transform:rotateY(-174deg)}}
.open .x-cover .x-face{animation:lpFace 2.9s both}
@keyframes lpFace{0%,62%{opacity:1}76%,100%{opacity:0}}
.open .x-cover .fr::after{animation:lpShadeF 2.9s both}@keyframes lpShadeF{0%,11%{opacity:0}32%{opacity:1}100%{opacity:1}}
.open .x-cover .bk::after{animation:lpShadeB 2.9s both}@keyframes lpShadeB{0%,30%{opacity:1}50%,100%{opacity:0}}
.open .x-page::after{animation:lpSpine 2.9s both}@keyframes lpSpine{0%,11%{opacity:0}30%{opacity:1}52%{opacity:.35}80%,100%{opacity:0}}
.open .x-book .x-sh{animation:lpSh 2.9s cubic-bezier(.45,.05,.25,1) both}@keyframes lpSh{0%{transform:translateZ(-1px)}12%{transform:translateZ(-1px) translateY(10px) scale(1.06);opacity:.8}50%,64%{transform:translateZ(-1px) translateX(-100%) scaleX(2) translateY(10px);opacity:.8}88%,100%{transform:translateZ(-1px) scale(1.1);opacity:.4}}`,
modern:`.x-modern{color:#0e0e0e;font-family:INT,sans-serif}
.x-modern .x-bg{background:repeating-linear-gradient(90deg,rgba(0,0,0,.055) 0 1px,transparent 1px calc((100% - 1px)/6)),radial-gradient(ellipse 70% 60% at 50% 42%,#f6f5f0,#e6e4dc)}
.x-tk{position:relative;width:min(680px,90vw);height:calc(min(680px,90vw)*.37);display:flex;transform-style:preserve-3d}
.x-main{position:relative;flex:1;transform-style:preserve-3d}
.x-main .x-face{border-radius:10px 0 0 10px}
.x-main .fr{background:#0e0e0e;color:#f0efe9;padding:6% 5%;display:flex;flex-direction:column;justify-content:space-between;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2'/%3E%3CfeColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 .05 0'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)'/%3E%3C/svg%3E"),linear-gradient(135deg,#1b1b1b,#0a0a0a);-webkit-mask:radial-gradient(circle at 100% 50%,transparent 2.3px,#000 2.8px) right/6px 10px repeat-y,linear-gradient(#000 0 0) left/calc(100% - 3px) 100% no-repeat;mask:radial-gradient(circle at 100% 50%,transparent 2.3px,#000 2.8px) right/6px 10px repeat-y,linear-gradient(#000 0 0) left/calc(100% - 3px) 100% no-repeat}
.x-main .fr b{font:600 clamp(40px,10vw,78px)/.84 ANT,sans-serif;text-transform:uppercase}
.x-main .t{display:flex;justify-content:space-between;font-size:clamp(9px,1.6vw,11.5px);font-weight:500;opacity:.62;letter-spacing:.02em}
.x-main .bk{transform:rotateY(180deg);background:#f0efe9;padding:5%;border-radius:0 10px 10px 0;display:flex;flex-direction:column;justify-content:space-between;box-shadow:inset 0 0 0 1px rgba(0,0,0,.08)}
.x-main .bk b{font:600 clamp(46px,11.5vw,92px)/.8 ANT,sans-serif;text-transform:uppercase;letter-spacing:-.02em}.x-main .bk b span{color:#f0efe9;-webkit-text-stroke:1.5px #0e0e0e}
.x-main .bk .dl{align-self:flex-end;background:var(--lime);font:600 clamp(18px,4vw,30px)/1 ANT,sans-serif;padding:8px 12px}
.x-stub{position:relative;width:28%;background:var(--lime);border-radius:0 10px 10px 0;padding:5% 4.5%;display:flex;flex-direction:column;justify-content:space-between;transform-origin:0 100%;background-image:var(--grain);-webkit-mask:radial-gradient(circle at 0 50%,transparent 2.3px,#000 2.8px) left/6px 10px repeat-y,linear-gradient(#000 0 0) right/calc(100% - 3px) 100% no-repeat;mask:radial-gradient(circle at 0 50%,transparent 2.3px,#000 2.8px) left/6px 10px repeat-y,linear-gradient(#000 0 0) right/calc(100% - 3px) 100% no-repeat}
.x-stub small{font-size:clamp(8px,1.5vw,10.5px);font-weight:700;letter-spacing:.04em}.x-stub b{font:600 clamp(28px,7vw,54px)/.84 ANT,sans-serif}.x-stub i{height:22%;background:repeating-linear-gradient(90deg,#0e0e0e 0 2px,transparent 2px 4px,#0e0e0e 4px 7px,transparent 7px 8px,#0e0e0e 8px 9px,transparent 9px 12px)}
.x-tk .x-sh{left:2%;right:30%;top:20%;bottom:-14%}
.x-modern .x-ping{color:#0e0e0e}
.open .x-tk{animation:mdTk 2.55s both}
@keyframes mdTk{0%{transform:none;animation-timing-function:cubic-bezier(.3,0,.3,1)}10%{transform:translateY(-6px) rotateZ(-1.6deg)}30%{transform:translateY(-6px) rotateZ(-1.6deg);animation-timing-function:cubic-bezier(.3,1.45,.5,1)}56%,100%{transform:translateX(14%) translateY(0) rotateZ(0)}}
.open .x-stub{animation:mdStub 2.55s both}
@keyframes mdStub{0%{transform:none;animation-timing-function:ease-out}10%{transform:translateX(2px) rotate(.8deg)}14%{transform:translateX(5px) rotate(2deg);animation-timing-function:cubic-bezier(.2,.8,.3,1)}28%{transform:translate(40px,-18px) rotate(11deg);animation-timing-function:cubic-bezier(.55,0,.9,.5)}58%{transform:translate(150px,85vh) rotate(48deg);opacity:1}59%,100%{transform:translate(150px,85vh) rotate(48deg);opacity:0}}
.open .x-main{animation:mdMain 2.55s both}
@keyframes mdMain{0%,50%{transform:rotateY(0) translateZ(0);animation-timing-function:cubic-bezier(.5,0,.3,1)}62%{transform:rotateY(-90deg) translateZ(90px)}76%{transform:rotateY(-180deg) translateZ(30px);animation-timing-function:cubic-bezier(.6,0,.3,1)}100%{transform:rotateY(-180deg) translateZ(30px)}}
.open .x-modern .x-zoom,.x-modern.open .x-zoom{animation:mdZoom 3s both}
@keyframes mdZoom{0%,78%{transform:none;animation-timing-function:cubic-bezier(.6,0,.3,1)}100%{transform:scale(2.2)}}
.open .x-tk .x-sh{animation:mdSh 2.55s both}@keyframes mdSh{0%,50%{opacity:1}60%,100%{opacity:0}}`,
garden:`.x-garden{color:var(--moss)}
.x-garden .x-bg{background:radial-gradient(ellipse 70% 60% at 50% 40%,#efeadc,#ddd5c1 72%,#cfc6ae)}
.x-gate{position:relative;width:min(420px,76vw);aspect-ratio:4/5;perspective:1600px}.x-inner{z-index:1}
.x-inner{position:absolute;inset:5% 6%;background-color:#f7f3e8;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;color:#2c3126;box-shadow:0 1px 0 #e6dfcd,0 12px 30px -12px rgba(30,40,20,.45);overflow:hidden}
.x-inner::before{content:"";position:absolute;inset:12px;border:1px solid rgba(56,67,47,.35)}
.x-inner .k{font:10px TEN,sans-serif;letter-spacing:.26em;text-transform:uppercase;color:var(--gk)}
.x-inner b{font:clamp(40px,10vw,56px)/1 GIL,serif;font-weight:400;margin-top:14px}.x-inner i{font:italic 300 clamp(32px,8vw,44px) COR,serif}.x-inner .d{font:italic 16px COR,serif;margin-top:12px}
.x-inner .sp{position:absolute;right:-26px;bottom:-30px;width:120px;opacity:.6;transform:rotate(-14deg)}
.x-pl,.x-pr{position:absolute;top:0;bottom:0;width:50%;transform-style:preserve-3d;z-index:2}
.x-pl{left:0;transform-origin:0 50%}.x-pr{right:0;transform-origin:100% 50%}
.x-gate .fr{background-color:#3a4531;box-shadow:inset 0 0 0 1px rgba(0,0,0,.12)}
.x-pl .fr{background-image:var(--grain),linear-gradient(90deg,#3e4a35,var(--moss) 70%,#323c2a);box-shadow:-1px 0 0 #2a3322,0 1px 0 #2a3322}
.x-pr .fr{background-image:var(--grain),linear-gradient(90deg,#2f3828,var(--moss) 30%,#3c4733);box-shadow:1px 0 0 #2a3322,0 1px 0 #2a3322}
.x-gate .fr .ln{position:absolute;inset:14px 10px;border:1px solid rgba(201,211,168,.22)}.x-pl .fr .ln{border-right:0;right:0}.x-pr .fr .ln{border-left:0;left:0}
.x-gate .fr::after{content:"";position:absolute;inset:0;background:rgba(10,15,5,.5);opacity:0}
.x-pr .spr{position:absolute;right:8%;top:6%;width:42%;opacity:.38}
.x-gate .bk{transform:rotateY(180deg);background:#dfe3d2;background-image:radial-gradient(circle at 25% 30%,rgba(111,127,92,.22) 0 3px,transparent 3.5px),radial-gradient(circle at 75% 70%,rgba(111,127,92,.18) 0 2px,transparent 2.5px),linear-gradient(90deg,rgba(0,0,0,.08),transparent 40%);background-size:22px 22px,22px 22px,100% 100%}
.x-pr .bk{background-image:radial-gradient(circle at 25% 30%,rgba(111,127,92,.22) 0 3px,transparent 3.5px),radial-gradient(circle at 75% 70%,rgba(111,127,92,.18) 0 2px,transparent 2.5px),linear-gradient(270deg,rgba(0,0,0,.08),transparent 40%);background-size:22px 22px,22px 22px,100% 100%}
.x-tw{position:absolute;top:50%;height:8px;margin-top:-4px;z-index:3;background:repeating-linear-gradient(118deg,#d1bd93 0 2.5px,#a68d60 2.5px 4.5px,#c3ad80 4.5px 7px);border-radius:4px;box-shadow:0 2px 2px rgba(0,0,0,.35),inset 0 1px 0 rgba(255,255,255,.25)}
.x-tw.l{left:-3px;right:50%}.x-tw.r{right:-3px;left:50%}
.x-bow{position:absolute;z-index:4;left:50%;top:50%;width:140px;height:90px;margin:-40px 0 0 -70px;overflow:visible;filter:drop-shadow(0 2px 2px rgba(0,0,0,.3))}
.x-bow g{transform-box:fill-box;transform-origin:50% 50%}.x-bow .lo1{transform-origin:100% 70%}.x-bow .lo2{transform-origin:0 70%}.x-bow .ta1{transform-origin:100% 0}.x-bow .ta2{transform-origin:0 0}
.x-tag{position:absolute;z-index:5;left:50%;top:50%;width:100px;margin-left:-38px;transform-origin:38px 0;transform:rotate(-5deg)}
.x-tag i{display:block;width:1px;height:46px;margin-left:38px;background:#7d6844}
.x-tag .tg{background-color:#f1ebdb;height:128px;margin-top:-4px;clip-path:polygon(24% 0,76% 0,100% 15%,100% 100%,0 100%,0 15%);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;color:var(--moss);filter:drop-shadow(0 4px 4px rgba(0,0,0,.25))}
.x-tag .tg::before{content:"";position:absolute;top:10px;left:50%;width:10px;height:10px;margin-left:-5px;border-radius:50%;background:#cfc6ae;box-shadow:inset 0 0 0 2px #b5a77f}
.x-tag b{font:32px GIL,serif;font-weight:400}.x-tag span{font:8.5px TEN,sans-serif;letter-spacing:.2em}
.x-gate .x-sh{z-index:0}
.x-garden .x-ping{color:#efe9d8}
.x-garden.open .x-tag{animation:gdTag 3s both}
@keyframes gdTag{0%{transform:rotate(-5deg);animation-timing-function:ease-in-out}7%{transform:rotate(7deg)}14%{transform:rotate(-3deg)}22%{transform:rotate(1deg);animation-timing-function:cubic-bezier(.55,0,.9,.4)}44%{transform:translate(20px,75vh) rotate(32deg);opacity:1}45%,100%{transform:translate(20px,75vh) rotate(32deg);opacity:0}}
.x-garden.open .lo1{animation:gdLo1 3s both}@keyframes gdLo1{0%,5%{transform:none;animation-timing-function:cubic-bezier(.4,0,.6,1)}12%{transform:translateX(-4px) scale(1.06,.9)}24%,100%{transform:translate(-26px,6px) rotate(-70deg) scale(.15);opacity:0}}
.x-garden.open .lo2{animation:gdLo2 3s both}@keyframes gdLo2{0%,7%{transform:none;animation-timing-function:cubic-bezier(.4,0,.6,1)}14%{transform:translateX(4px) scale(1.06,.9)}26%,100%{transform:translate(26px,6px) rotate(70deg) scale(.15);opacity:0}}
.x-garden.open .kn{animation:gdKn 3s both}@keyframes gdKn{0%,18%{transform:none}28%,100%{transform:scale(.2);opacity:0}}
.x-garden.open .ta1{animation:gdTa1 3s both}@keyframes gdTa1{0%,16%{transform:none;animation-timing-function:cubic-bezier(.5,0,.8,.5)}34%,100%{transform:translate(-30px,40px) rotate(30deg);opacity:0}}
.x-garden.open .ta2{animation:gdTa2 3s both}@keyframes gdTa2{0%,16%{transform:none;animation-timing-function:cubic-bezier(.5,0,.8,.5)}34%,100%{transform:translate(30px,40px) rotate(-30deg);opacity:0}}
.x-garden.open .x-tw.l{animation:gdTwL 3s both}@keyframes gdTwL{0%,22%{transform:none;animation-timing-function:cubic-bezier(.6,0,.4,1)}40%,100%{transform:translateX(-75%) scaleX(.6);opacity:0}}
.x-garden.open .x-tw.r{animation:gdTwR 3s both}@keyframes gdTwR{0%,22%{transform:none;animation-timing-function:cubic-bezier(.6,0,.4,1)}40%,100%{transform:translateX(75%) scaleX(.6);opacity:0}}
.x-garden.open .x-pl{animation:gdPL 3s both}@keyframes gdPL{0%,33%{transform:rotateY(0);animation-timing-function:cubic-bezier(.45,.05,.2,1)}68%,100%{transform:rotateY(-160deg)}}
.x-garden.open .x-pr{animation:gdPR 3s both}@keyframes gdPR{0%,36%{transform:rotateY(0);animation-timing-function:cubic-bezier(.45,.05,.2,1)}71%,100%{transform:rotateY(160deg)}}
.x-garden.open .x-gate .fr::after{animation:gdShade 3s both}@keyframes gdShade{0%,34%{opacity:0}58%,100%{opacity:1}}
.x-garden.open .x-gate .x-face{animation:gdFace 3s both}@keyframes gdFace{0%,70%{opacity:1}80%,100%{opacity:0}}
.x-garden.open .x-inner{animation:gdIn 3s both}@keyframes gdIn{0%,60%{transform:none;animation-timing-function:cubic-bezier(.5,0,.25,1)}86%,100%{transform:translateZ(330px)}}
.x-garden.open .x-gate .x-sh{animation:gdSh 3s both}@keyframes gdSh{0%,33%{opacity:1;transform:translateZ(-1px)}68%{opacity:.7;transform:translateZ(-1px) scaleX(2.2)}86%,100%{opacity:.3;transform:translateZ(-1px) scale(1.2)}}`,
bloom:`.x-bloom{color:#4a2b3b}
.x-bloom .x-bg{background:radial-gradient(55% 45% at 28% 30%,rgba(251,211,214,.9),transparent 70%),radial-gradient(40% 40% at 78% 72%,rgba(230,215,239,.8),transparent 70%),radial-gradient(ellipse 80% 70% at 50% 45%,#fdf3f1,#f1dedb)}
.x-envl{position:relative;width:min(500px,86vw);aspect-ratio:7/5;perspective:1300px}
.x-rear{position:absolute;inset:0;z-index:1;background:#fbefec;background-image:radial-gradient(circle at 20% 30%,#eaa9b6 0 6%,transparent 6.5%),radial-gradient(circle at 60% 18%,#f2c8b2 0 5%,transparent 5.5%),radial-gradient(circle at 85% 40%,#cdb7dc 0 6%,transparent 6.5%),radial-gradient(circle at 40% 62%,#eaa9b6 0 4%,transparent 4.5%),radial-gradient(ellipse 8% 3% at 70% 66%,#a9c2a5 99%,transparent),radial-gradient(ellipse 3% 7% at 10% 75%,#a9c2a5 99%,transparent);background-size:90px 70px;box-shadow:inset 0 30px 40px -20px rgba(74,43,59,.35)}
.x-envl .x-sh{z-index:0;top:14%;bottom:-8%}
.x-bloom .x-letter{position:absolute;z-index:2;left:6%;right:6%;top:5%;height:92%;background-color:#fdf6f3;border-radius:200px 200px 6px 6px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;color:#4a2b3b;box-shadow:0 1px 0 #ecd8d5,0 10px 24px -10px rgba(74,43,59,.35)}
.x-bloom .x-letter .k{font:9px JOS,sans-serif;letter-spacing:.3em;text-transform:uppercase;opacity:.7}
.x-bloom .x-letter b{font:clamp(44px,11vw,64px)/.95 PIN,serif;font-weight:400}.x-bloom .x-letter i{font:italic 15px PLA,serif}.x-bloom .x-letter .d{font:10px JOS,sans-serif;letter-spacing:.28em;text-transform:uppercase;margin-top:10px}
.x-pocket{position:absolute;inset:0;z-index:3;width:100%;height:100%;filter:drop-shadow(0 -1px 1px rgba(74,43,59,.1))}
.x-bloom .x-flap{position:absolute;z-index:4;left:0;right:0;top:0;height:62%;transform-origin:50% 0;transform-style:preserve-3d}
.x-bloom .x-flap>div{position:absolute;inset:0;clip-path:polygon(0 0,100% 0,52% 98%,50% 100%,48% 98%);backface-visibility:hidden}
.x-bloom .fo{background:#f4dcdc;background-image:var(--grain),linear-gradient(180deg,#f7e5e4,#efd3d4)}
.x-bloom .fo::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,transparent 70%,rgba(74,43,59,.08))}
.x-bloom .fi{transform:rotateY(180deg);background:#fbefec;background-image:radial-gradient(circle at 20% 30%,#eaa9b6 0 7%,transparent 7.5%),radial-gradient(circle at 60% 18%,#f2c8b2 0 6%,transparent 6.5%),radial-gradient(circle at 85% 45%,#cdb7dc 0 7%,transparent 7.5%),radial-gradient(ellipse 9% 3% at 45% 70%,#a9c2a5 99%,transparent);background-size:90px 70px}
.x-seal{position:absolute;z-index:5;left:50%;top:62%;width:96px;height:96px;margin:-48px 0 0 -48px}
.x-seal .h{position:absolute;inset:0}.x-seal svg{width:100%;height:100%;display:block;filter:drop-shadow(0 3px 3px rgba(60,20,35,.35))}
.x-seal .ck{position:absolute;left:44%;top:0;width:12%;height:100%;opacity:0;background:linear-gradient(180deg,transparent,rgba(255,230,240,.9) 30%,rgba(255,255,255,.95) 50%,rgba(255,230,240,.9) 70%,transparent);clip-path:polygon(50% 0,30% 14%,80% 25%,20% 38%,70% 49%,10% 61%,60% 72%,30% 86%,50% 100%,55% 100%,35% 86%,65% 72%,15% 61%,75% 49%,25% 38%,85% 25%,35% 14%,55% 0)}
.x-seal .cr{position:absolute;left:46%;top:50%;width:7px;height:6px;border-radius:40% 60% 50% 50%;background:#6d3049;opacity:0}
.x-bloom .x-ping{color:#5a2c42}
.x-bloom.open .x-seal{animation:blSeal 3.3s both}@keyframes blSeal{0%{transform:none;animation-timing-function:ease-out}4%{transform:scale(.93)}8%,100%{transform:scale(1)}}
.x-bloom.open .ck{animation:blCk 3.3s both}@keyframes blCk{0%,6%{opacity:0}8%{opacity:1}12%{opacity:.6}16%,100%{opacity:0}}
.x-bloom.open .h1{animation:blH1 3.3s both}@keyframes blH1{0%,9%{transform:none;animation-timing-function:cubic-bezier(.2,.8,.4,1)}14%{transform:translate(-7px,2px) rotate(-12deg);animation-timing-function:cubic-bezier(.55,0,.95,.5)}36%{transform:translate(-40px,190px) rotate(-55deg);opacity:1}37%,100%{opacity:0;transform:translate(-40px,190px) rotate(-55deg)}}
.x-bloom.open .h2{animation:blH2 3.3s both}@keyframes blH2{0%,9%{transform:none;animation-timing-function:cubic-bezier(.2,.8,.4,1)}14%{transform:translate(8px,3px) rotate(14deg);animation-timing-function:cubic-bezier(.55,0,.95,.5)}38%{transform:translate(46px,200px) rotate(62deg);opacity:1}39%,100%{opacity:0;transform:translate(46px,200px) rotate(62deg)}}
.x-bloom.open .c1{animation:blC1 3.3s both}@keyframes blC1{0%,9%{opacity:0;transform:none}10%{opacity:1;animation-timing-function:cubic-bezier(.3,.6,.9,.5)}30%,100%{opacity:0;transform:translate(-30px,120px) rotate(200deg)}}
.x-bloom.open .c2{animation:blC2 3.3s both}@keyframes blC2{0%,9%{opacity:0;transform:none}10%{opacity:1;animation-timing-function:cubic-bezier(.3,.6,.9,.5)}32%,100%{opacity:0;transform:translate(18px,150px) rotate(-160deg) scale(.7)}}
.x-bloom.open .c3{animation:blC3 3.3s both}@keyframes blC3{0%,9%{opacity:0;transform:none}10%{opacity:1;animation-timing-function:cubic-bezier(.3,.6,.9,.5)}28%,100%{opacity:0;transform:translate(36px,90px) rotate(120deg) scale(.5)}}
.x-bloom.open .x-flap{animation:blFlap 3.3s both}@keyframes blFlap{0%,16%{transform:rotateX(0);z-index:4;animation-timing-function:cubic-bezier(.45,0,.3,1)}29%{z-index:4}29.5%{z-index:1}42%{transform:rotateX(180deg);z-index:1}68%{transform:rotateX(180deg);opacity:1;animation-timing-function:cubic-bezier(.5,0,.75,0)}88%,100%{transform:translateY(64%) rotateX(180deg);opacity:0;z-index:1}}
.x-bloom.open .x-letter{animation:blLet 3.3s both}@keyframes blLet{0%,40%{transform:none;z-index:2;animation-timing-function:cubic-bezier(.3,1.3,.45,1)}64%{transform:translateY(-58%);z-index:2;animation-timing-function:cubic-bezier(.55,0,.25,1)}66%{z-index:6}86%,100%{transform:translateY(-6%) translateZ(220px);z-index:6}}
.x-bloom.open .x-pocket,.x-bloom.open .x-rear{animation:blDrop 3.3s both}@keyframes blDrop{0%,66%{transform:none;opacity:1;animation-timing-function:cubic-bezier(.5,0,.75,0)}88%,100%{transform:translateY(40%);opacity:0}}
.x-bloom.open .x-envl .x-sh{animation:blSh 3.3s both}@keyframes blSh{0%,66%{opacity:1}88%,100%{opacity:0;transform:translateY(30%)}}`,
postcard:`.x-postcard{--ink:#1d2a3a;--red:#b8402a;--blue:#2b4f7a;--sheet:#fbf8f2;--mut:#6b6a66;color:#1d2a3a}
.x-postcard .x-bg{background:radial-gradient(ellipse 75% 65% at 50% 42%,#f7f3eb,#e9e2d4 75%,#ddd4c3)}
.x-air{position:relative;width:min(600px,90vw);aspect-ratio:1.55;perspective:1600px}
.x-air .x-sh{z-index:0;top:16%;bottom:-8%}
.x-flip{position:absolute;inset:0;z-index:3;transform-style:preserve-3d}
.x-flip .fr{background-color:var(--sheet);padding:16px;box-shadow:0 0 0 .5px rgba(0,0,0,.06),0 1px 0 #e3dccd,0 2px 0 #d9d1c0}
.x-flip .fr::before{content:"";position:absolute;inset:0;padding:14px;background:repeating-linear-gradient(-45deg,var(--red) 0 18px,var(--sheet) 18px 28px,var(--blue) 28px 46px,var(--sheet) 46px 56px);-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude}
.x-flip .fr .p2-chip{position:absolute;left:40px;top:38px}
.x-flip .fr .p2-stamp{position:absolute;right:36px;top:32px;transform:rotate(2deg)}.x-flip .fr .p2-stamp+.p2-stamp{right:150px;top:40px;transform:rotate(-4deg)}
.x-flip .fr .pmw{position:absolute;right:120px;top:84px;width:250px;color:rgba(29,42,58,.75);z-index:4;transform:rotate(-7deg);mix-blend-mode:multiply}
.x-flip .fr .addr{position:absolute;left:38%;bottom:16%;display:flex;flex-direction:column;gap:2px}.x-flip .fr .addr i{font:italic 30px DMS,serif;margin-bottom:8px}.x-flip .fr .addr span{font-size:14px;color:var(--mut);border-bottom:1px solid rgba(29,42,58,.2);padding:6px 60px 4px 0;font-family:JOS,sans-serif}
.x-flip .bk{transform:rotateY(180deg)}
.x-live{position:absolute;inset:0;z-index:2;opacity:0}
.x-postcard .x-rear{position:absolute;inset:0;z-index:1;background:#e7e0d1;background-image:repeating-linear-gradient(-45deg,#e3e9f0 0 7px,#d8e0ea 7px 14px);box-shadow:inset 0 30px 30px -18px rgba(29,42,58,.3)}
.x-postcard .x-letter{position:absolute;z-index:2;left:5%;right:5%;top:6%;height:88%;background-color:var(--sheet);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;text-align:center;box-shadow:0 1px 0 #e3dccd,0 8px 20px -8px rgba(40,30,20,.35)}
.x-postcard .x-letter b{font:clamp(30px,7vw,50px)/1 DMS,serif;font-weight:400}.x-postcard .x-letter i{font:italic clamp(15px,3vw,19px) DMS,serif;color:#3c4654}.x-postcard .x-letter .d{font:500 10.5px OSW,sans-serif;letter-spacing:.24em;color:var(--mut)}
.x-postcard .x-letter::after{content:"";position:absolute;inset:0;border:7px solid transparent;border-image:repeating-linear-gradient(-45deg,var(--red) 0 10px,transparent 10px 16px,var(--blue) 16px 26px,transparent 26px 32px) 7}
.x-postcard .x-pocket{position:absolute;inset:0;z-index:3;background:linear-gradient(to top right,#f8f4ec 49.8%,transparent 50%) left bottom/50.2% 100% no-repeat,linear-gradient(to top left,#f4efe5 49.8%,transparent 50%) right bottom/50.2% 100% no-repeat;filter:drop-shadow(0 -1px 1px rgba(0,0,0,.07))}
.x-postcard .x-pocket::after{content:"";position:absolute;inset:0;border:8px solid transparent;border-image:repeating-linear-gradient(-45deg,var(--red) 0 12px,transparent 12px 20px,var(--blue) 20px 32px,transparent 32px 40px) 8;-webkit-mask:linear-gradient(transparent 0 0) top/100% 0 no-repeat,linear-gradient(#000 0 0);mask:linear-gradient(#000,#000)}
.x-postcard .x-flap{position:absolute;z-index:4;left:0;right:0;top:0;height:58%;transform-origin:50% 0;transform-style:preserve-3d}
.x-postcard .x-flap>div{position:absolute;inset:0;clip-path:polygon(0 0,100% 0,52% 97%,50% 100%,48% 97%);backface-visibility:hidden}
.x-postcard .fo{background-color:#f8f4ec;background-image:var(--grain),linear-gradient(180deg,#faf6ef,#f1ebdf)}
.x-postcard .fi{transform:rotateY(180deg);background:repeating-linear-gradient(-45deg,#e6ecf3 0 7px,#dbe3ed 7px 14px)}
.x-stk{position:absolute;z-index:5;left:50%;top:58%;transform:translate(-50%,-50%);background:var(--red);color:#fff;font:500 11px OSW,sans-serif;letter-spacing:.2em;padding:8px 12px;box-shadow:0 1px 2px rgba(0,0,0,.2)}
.x-flip .bk .x-rear,.x-flip .bk .x-pocket,.x-flip .bk .x-flap,.x-flip .bk .x-stk{animation:none!important}
.x-postcard .x-ping{color:#2b4f7a}
.x-postcard.open .x-flip{animation:pcFlip 3.45s both}@keyframes pcFlip{0%{transform:translateZ(0) rotateY(0);animation-timing-function:cubic-bezier(.3,0,.4,1)}7%{transform:translateZ(30px) rotateY(0);animation-timing-function:cubic-bezier(.5,0,.5,1)}19%{transform:translateZ(120px) rotateY(95deg);animation-timing-function:cubic-bezier(.2,.6,.3,1)}31%,100%{transform:translateZ(0) rotateY(180deg)}}
.x-postcard.open .x-live{animation:pcLive 3.45s both}@keyframes pcLive{0%,31%{opacity:0}31.5%,100%{opacity:1}}
.x-postcard.open .x-live .x-stk{animation:pcStk 3.45s both}@keyframes pcStk{0%,32%{transform:translate(-50%,-50%);opacity:1;animation-timing-function:cubic-bezier(.4,0,.6,1)}40%,100%{transform:translate(-80%,-160%) rotate(-28deg) scale(.9);opacity:0}}
.x-postcard.open .x-live .x-flap{animation:pcFlap 3.45s both}@keyframes pcFlap{0%,37%{transform:rotateX(0);z-index:4;animation-timing-function:cubic-bezier(.45,0,.3,1)}46%{z-index:4}46.5%{z-index:1}55%{transform:rotateX(180deg);z-index:1}76%{transform:rotateX(180deg);opacity:1;animation-timing-function:cubic-bezier(.5,0,.75,0)}92%,100%{transform:translateY(69%) rotateX(180deg);opacity:0;z-index:1}}
.x-postcard.open .x-live .x-letter{animation:pcLet 3.45s both}@keyframes pcLet{0%,52%{transform:none;z-index:2;animation-timing-function:cubic-bezier(.3,1.3,.45,1)}73%{transform:translateY(-60%);z-index:2;animation-timing-function:cubic-bezier(.55,0,.25,1)}75%{z-index:6}92%,100%{transform:translateY(-4%) translateZ(200px);z-index:6}}
.x-postcard.open .x-live .x-pocket,.x-postcard.open .x-live .x-rear{animation:pcDrop 3.45s both}@keyframes pcDrop{0%,75%{transform:none;opacity:1;animation-timing-function:cubic-bezier(.5,0,.75,0)}92%,100%{transform:translateY(40%);opacity:0}}
.x-postcard.open .x-air .x-sh{animation:pcSh 3.45s both}@keyframes pcSh{0%{opacity:1}19%{opacity:.35;transform:translateZ(-1px) scale(.85)}31%,75%{opacity:1;transform:translateZ(-1px)}92%,100%{opacity:0}}`,
gallery:`.x-gallery{color:#111}
.x-gallery .x-bg{background:radial-gradient(ellipse 70% 60% at 50% 40%,#f1efeb,#dedbd5 75%,#d2cec7)}
.x-gw{position:relative;width:min(360px,64vw);aspect-ratio:3/4.3;margin-top:9vh;perspective:1500px;transform-origin:50% 100%}
.x-gw .x-sh{z-index:0;top:30%;bottom:-6%}
.x-mag{position:absolute;z-index:1;left:5%;right:5%;top:-25%;height:100%;overflow:hidden;background:#ddd;box-shadow:0 1px 0 #f2f2f2,1px 2px 0 #e2e2e2,0 10px 24px -10px rgba(0,0,0,.4)}
.x-mag .ph-w{position:absolute;inset:0}.x-mag .ph-w::after{content:"";position:absolute;inset:0;background:linear-gradient(rgba(0,0,0,.32),transparent 35%),linear-gradient(90deg,rgba(0,0,0,.18),transparent 6%)}
.x-mag .mh{position:absolute;top:12px;left:12px;right:12px;color:#fff}.x-mag .iss{display:flex;justify-content:space-between;font:8px TEN,sans-serif;letter-spacing:.24em;text-transform:uppercase;border-bottom:1px solid rgba(255,255,255,.6);padding-bottom:5px}
.x-mag b{display:block;font:clamp(34px,8vw,50px)/.86 INS,serif;font-weight:400;letter-spacing:-.03em;margin-top:6px}
.x-sleeve{position:absolute;z-index:2;inset:0;background:#141414;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2'/%3E%3CfeColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 .045 0'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)'/%3E%3C/svg%3E"),linear-gradient(160deg,#232323,#121212 45%,#0b0b0b);display:flex;flex-direction:column;align-items:center;justify-content:flex-end;padding:0 0 9%;color:#6f6f6f;overflow:hidden;box-shadow:0 1px 0 #000,0 2px 0 #1f1f1f,0 34px 50px -30px rgba(0,0,0,.75);-webkit-mask:radial-gradient(circle at 50% 0,transparent 30px,#000 31px);mask:radial-gradient(circle at 50% 0,transparent 30px,#000 31px)}
.x-sleeve .sheen{position:absolute;top:-20%;bottom:-20%;left:-60%;width:40%;background:linear-gradient(90deg,transparent,rgba(255,255,255,.07),transparent);transform:rotate(14deg) translateX(0);animation:shn 6s 1s ease-in-out infinite}
@keyframes shn{0%,60%{transform:rotate(14deg) translateX(0)}100%{transform:rotate(14deg) translateX(620%)}}
.x-sleeve .emb{display:flex;flex-direction:column;align-items:center;gap:8px;margin-bottom:auto;margin-top:40%}
.x-sleeve .emb b{font:italic clamp(28px,6vw,40px) INS,serif;font-weight:400;color:#171717;text-shadow:0 1px 0 rgba(255,255,255,.09),0 -1px 0 #000}
.x-sleeve .emb span{font:9px TEN,sans-serif;letter-spacing:.34em;text-transform:uppercase;color:#8c8c8c;background:linear-gradient(90deg,#7a7a7a,#c9c9c9,#7a7a7a);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}
.x-sleeve small{font:9px TEN,sans-serif;letter-spacing:.32em;text-transform:uppercase}
.x-gallery .x-ping{color:#fff}
.x-gallery.open .x-gw{animation:glW 3.15s both}@keyframes glW{0%{transform:none;animation-timing-function:cubic-bezier(.3,0,.3,1)}10%{transform:rotateX(7deg) translateY(4px)}40%{transform:rotateX(7deg) translateY(4px);animation-timing-function:cubic-bezier(.4,0,.3,1)}58%,100%{transform:none}}
.x-gallery.open .x-mag{animation:glMag 3.15s both}@keyframes glMag{0%,8%{transform:none;z-index:1;animation-timing-function:cubic-bezier(.2,1.28,.4,1)}40%{transform:translateY(-44%);z-index:1}44%{z-index:3;transform:translateY(-44%);animation-timing-function:cubic-bezier(.55,0,.2,1)}84%,100%{transform:translateY(-3%) scale(var(--gz,4.3));z-index:3}}
.x-gallery.open .x-sleeve{animation:glSl 3.15s both}@keyframes glSl{0%,42%{transform:none;opacity:1;animation-timing-function:cubic-bezier(.55,0,.9,.4)}64%,100%{transform:translateY(90%) rotate(5deg);opacity:0}}
.x-gallery.open .x-gw .x-sh{animation:glSh 3.15s both}@keyframes glSh{0%,42%{opacity:1}60%,100%{opacity:0}}`};
// ---- shared pieces -------------------------------------------------------
const TOT={letterpress:3200,modern:3000,garden:3250,bloom:3300,postcard:3450,gallery:3150};
const CUE={letterpress:"cue_lp",modern:"cue_md",garden:"cue_gd",bloom:"cue_bl",postcard:"cue_pc",gallery:"cue_gl"};
const FONTS={letterpress:["BOD","BODi"],modern:["ANT","INT"],garden:["COR","CORi","GIL","TEN"],bloom:["PLA","PLAi","PIN","JOS"],postcard:["DMS","DMSi","JOS","OSW"],gallery:["INS","INSi","TEN"]};
const KEY={letterpress:"lp",modern:"md",garden:"gd",bloom:"bl",postcard:"pc",gallery:"gl"};
const ROM=n=>{let s="";for(const [v,r] of [[1000,"M"],[900,"CM"],[500,"D"],[400,"CD"],[100,"C"],[90,"XC"],[50,"L"],[40,"XL"],[10,"X"],[9,"IX"],[5,"V"],[4,"IV"],[1,"I"]])while(n>=v){s+=r;n-=v}return s};
// Photo: data-lb opens the lightbox; the first (cover) photo loads eagerly.
const IMG=(D,i,cls="ph")=>{const s=D.photos[i];return s?`<img class="${cls}" src="${s}" alt="" data-lb="${i}"${i?' loading="lazy"':""} decoding="async">`:""};
const HAS=(D,i)=>!!D.photos[i];
// Decorative map (not a real map): the venue label sits next to the pin; the whole map opens the map link.
const MAP=(D,H,bg,water,road,pin,lbl)=>{const l=H.e(String(D.venue||D.address||"").toUpperCase().slice(0,30));return `<a class="wb-map" href="${H.e(D.mapUrl)}" target="_blank" rel="noopener" aria-label="${H.e(H.t("open_map"))}"><svg viewBox="0 0 600 400" aria-hidden="true" focusable="false" style="display:block;width:100%;height:auto"><rect width="600" height="400" fill="${bg}"/><path d="M0 330C120 300 220 340 330 300S520 250 600 270V400H0Z" fill="${water}"/><path d="M300 0C290 80 330 150 310 220S300 300 330 300" stroke="${water}" stroke-width="22" fill="none"/>${[60,140,220,380,460,540].map(x=>`<path d="M${x} 0L${x+30} 300" stroke="${road}" stroke-width="2"/>`).join("")}${[50,120,190,250].map(y=>`<path d="M0 ${y}L600 ${y+20}" stroke="${road}" stroke-width="2"/>`).join("")}<path d="M0 150C200 170 400 120 600 160" stroke="${road}" stroke-width="6" fill="none"/><g transform="translate(352 168)"><circle r="26" fill="${pin}" opacity=".18"/><circle r="9" fill="${pin}"/></g>${l?`<text x="${l.length>16?60:372}" y="${l.length>16?212:160}" font-size="13" letter-spacing="2" fill="${lbl}" style="font-family:inherit">${l}</text>`:""}</svg></a>`};
const SPRIG=(c,o=.25)=>`<svg viewBox="0 0 200 420" fill="none" stroke="${c}" stroke-width="1.1" aria-hidden="true" focusable="false"><path d="M110 420C100 320 120 220 90 120S80 30 100 0"/>${Array.from({length:11},(_,i)=>{const y=400-i*36,x=Math.round(110-Math.sin(i/2)*12),s=i%2?1:-1;return `<path d="M${x} ${y}c${s*18} -8 ${s*34} -4 ${s*46} -20c${-s*16} -6 ${-s*34} 0 ${-s*46} 20z" fill="${c}" fill-opacity="${o}"/>`}).join("")}</svg>`;
const PARAS=(D,H,cls="",tag="p")=>D.story.map(x=>`<${tag}${cls?` class="${cls}"`:""}>${H.e(x)}</${tag}>`).join("");
// Sections every theme can show, in page order; each theme decides how to draw them.
function SECS(D){const s=[];
 if(D.story.length)s.push("story");
 if(D.F.timeline&&D.sched.length)s.push("day");
 if(D.F.map&&D.place)s.push("place");
 if(D.F.gallery&&D.photos.length)s.push("photos");
 if(D.det.length)s.push("notes");
 if(D.F.rsvp)s.push("rsvp");
 return s}
const NAV={story:"nav_story",day:"nav_day",place:"nav_place",photos:"nav_photos",notes:"nav_notes",rsvp:"nav_reply"};
const TTL={story:"t_story",day:"t_day",place:"t_place",photos:"t_photos",notes:"t_notes",rsvp:"nav_reply"};
// Calendar buttons when there is no place section to carry them.
const CAL=(D,H,a,b)=>D.F.calendar&&D.hasDate&&!(D.F.map&&D.place)?H.tools({a,b,only:"cal"}):"";
const R={},E={},C={};

// ---- 1 LETTERPRESS: the stationery suite ---------------------------------
R.letterpress=(D,H)=>{const S=SECS(D),e=H.e;let side=0;const sm=()=>(side++%2?"r":"l");
 const names=D.two?`<span class="lp-name">${e(D.n[0])}</span><span class="lp-and">${H.W("and")}</span><span class="lp-name">${e(D.n[1])}</span>`:`<span class="lp-name">${e(D.names)}</span>`;
 let h=`<div class="lp-top">${e(D.ini)}${D.yr?` · ${ROM(+D.yr)}`:""}</div><div class="lp-suite">
<section class="lp-c lp-inv rv" id="top"><div class="lp-mono" aria-hidden="true">${e(D.mono)}</div><div class="lp-k">${H.W("families")}</div><div class="lp-hr"></div><h1 class="lp-names">${names}</h1><div class="lp-hr"></div><p class="lp-it">${H.W("request")}<br>${H.W("celebrate")}</p>${D.hasDate?`<div class="lp-hr"></div><div class="lp-date">${H.date("long")}${D.time?`<br>${e(D.time)}`:""}</div>`:""}${D.place?`<div class="lp-hr"></div><div class="lp-date">${e(D.venue||D.address)}${D.venue&&D.address?`<br><span class="lp-adr">${e(D.address)}</span>`:""}</div>`:""}${H.cta("lp-btn")}</section>`;
 for(const s of S){
  if(s==="story")h+=`<section class="lp-c sm ${sm()} rv" id="story"><h2 class="lp-h">${H.W("t_story")}</h2>${PARAS(D,H,"lp-it lp-p")}</section>`;
  if(s==="day")h+=`<section class="lp-c sm ${sm()} rv" id="day"><h2 class="lp-h">${H.W("t_day")}</h2><ul class="lp-ord">${D.sched.map(x=>`<li><b>${e(x.time)}</b><i></i><span>${e(x.title)}${x.desc?`<small>${e(x.desc)}</small>`:""}</span></li>`).join("")}</ul></section>`;
  if(s==="place")h+=`<section class="lp-c rv" id="place"><h2 class="lp-h">${H.W("t_place")}</h2><div class="lp-map">${MAP(D,H,"#fbf8f1","#e9e4d8","#d9d2c2","#1e2741","#1e2741")}</div><div class="lp-date">${[D.venue,D.address].filter(Boolean).map(e).join(" · ")}</div><div class="lp-tools">${H.tools({a:"lp-btn",b:"lp-btn"})}</div></section>`;
  if(s==="photos")h+=`<div class="lp-prints rv n${Math.min(D.photos.length,3)}" id="photos">${D.photos.slice(0,9).map((_,i)=>`<div class="lp-pr" style="--r:${[-4,2,5,-2,3,-5,4,-3,1][i]}deg">${IMG(D,i)}</div>`).join("")}</div>`;
  if(s==="notes")h+=`<div class="lp-tents rv n${Math.min(D.det.length,3)}" id="notes">${D.det.map((d,i)=>`<div class="lp-c" style="--r:${[-.8,.4,1,-.5,.7,-1][i%6]}deg">${d[0]?`<h3 class="lp-h">${e(d[0])}</h3>`:""}<p class="lp-it">${e(d[1])}</p></div>`).join("")}</div>`;
  if(s==="rsvp"){if(D.cd)h+=CD_LP(D,H);h+=`<section class="lp-c lp-reply rv" id="rsvp"><h2 class="lp-h">${H.W("kindly_reply")}</h2>${H.rsvp()}</section>`}
 }
 if(D.cd&&!S.includes("rsvp"))h+=CD_LP(D,H);
 const cal=CAL(D,H,"lp-btn","lp-btn");
 return h+`${cal?`<div class="lp-tools">${cal}</div>`:""}<div class="lp-k lp-end">${H.W("with_love")} · ${e(D.ini)}</div></div>`};
const CD_LP=(D,H)=>`<div class="lp-c lp-tag rv"><span class="lp-k">${H.W("cd_in")}</span><b>${H.cd("d")}</b><span class="lp-k">${H.W("days")}</span></div>`;

// ---- 2 MODERN: Swiss poster + index grid ---------------------------------
R.modern=(D,H)=>{const S=SECS(D),e=H.e;let n=0;const num=()=>String(++n).padStart(2,"0");
 const slash=D.n.map(x=>[...x.trim()][0]||"").join("/");
 const nav=S.map((s,i)=>`<a href="#${s}" data-to="${s}"><b>0${i+1}</b>${H.W(NAV[s])}</a>`).join("");
 const band=e([D.names,D.dot,D.city].filter(Boolean).join(" — "))+` — <w-t data-wi="getting_married">${e(H.t("getting_married"))}</w-t> —&nbsp;`;
 const meta=[D.hasDate?`<div><small>${H.W("lbl_date")}</small>${H.date("wk")}<br>${H.date("nowk")}</div>`:"",D.time?`<div><small>${H.W("lbl_time")}</small>${e(D.time)}</div>`:"",D.place?`<div><small>${H.W("lbl_venue")}</small>${e(D.venue||D.address)}${D.venue&&D.address?`<br>${e(D.address)}`:""}</div>`:"",D.F.rsvp?`<div><small>RSVP</small><a href="#rsvp">${H.W("nav_reply")} →</a></div>`:""].filter(Boolean).join("");
 const row=(id,label,body,st="")=>`<section class="md-row" id="${id}"><div class="md-num"><div><b>${num()}</b><span>${label}</span></div></div><div class="md-body rv"${st}>${body}</div></section>`;
 let h=`<div class="md-grid" aria-hidden="true"></div><header class="md-bar"><b>${e(slash)}</b><nav>${nav}</nav><span class="r">${e([D.dot,D.city].filter(Boolean).join(" — "))}</span></header>
<section class="md-hero" id="top"><h1 class="md-name">${D.two?`<span>${e(D.n[0])}</span><span><span class="amp">&amp;</span> ${e(D.n[1])}</span>`:`<span>${e(D.names)}</span>`}</h1>${D.hasDate?`<div class="md-date">${e(D.dash)}</div>`:""}${meta?`<div class="md-meta">${meta}</div>`:""}</section>
<div class="md-band" aria-hidden="true"><div>${band}</div><div>${band}</div></div>`;
 for(const s of S){
  if(s==="story")h+=row("story",H.W("nav_story"),`<p class="md-lead">${e(D.story[0])}</p>${D.story.slice(1).map(x=>`<p class="md-p">${e(x)}</p>`).join("")}`);
  if(s==="day")h+=row("day",H.W("nav_day"),`<ul class="md-sched">${D.sched.map(x=>`<li><b>${e(x.time)}</b><span>${e(x.title)}</span><em>${e(x.desc)}</em></li>`).join("")}</ul>`);
  if(s==="place")h+=row("place",H.W("nav_place"),`<div class="md-place"><div><h2 class="md-addr">${e(D.venue||D.address)}</h2>${D.venue&&D.address?`<p class="md-adr">${e(D.address)}</p>`:""}<div class="md-btns">${H.tools({a:"md-btn k",b:"md-btn"})}</div></div><div class="md-mapw">${MAP(D,H,"#f0efe9","#d8d7d0","#0e0e0e33","#0e0e0e","#0e0e0e")}</div></div>`);
  if(s==="photos")h+=row("photos",H.W("nav_photos"),`<div class="md-strip n${Math.min(D.photos.length,3)}">${D.photos.map((_,i)=>`<figure>${IMG(D,i)}<figcaption><span>${String(i+1).padStart(2,"0")}/${String(D.photos.length).padStart(2,"0")}</span><span>→</span></figcaption></figure>`).join("")}</div>`,' style="padding-right:0"');
  if(s==="notes"){if(D.cd)h+=CD_MD(D,H);h+=row("notes",H.W("nav_notes"),`<div class="md-det">${D.det.map(d=>`<div>${d[0]?`<h4>${e(d[0])}</h4>`:"<h4></h4>"}<p>${e(d[1])}</p></div>`).join("")}</div>`)}
  if(s==="rsvp"){if(D.cd&&!S.includes("notes"))h+=CD_MD(D,H);h+=`<section class="md-rsvp" id="rsvp"><div class="md-num"><div><b>${num()}</b><span>${H.W("nav_reply")}</span></div></div><div class="md-body rv">${H.rsvp()}</div></section>`}
 }
 if(D.cd&&!S.includes("notes")&&!S.includes("rsvp"))h+=CD_MD(D,H);
 const cal=CAL(D,H,"md-btn k","md-btn");
 return h+`${cal?`<div class="md-cal md-btns">${cal}</div>`:""}<footer class="md-foot"><span>${e(slash)}${D.yr?` — ${e(D.yr)}`:""}</span><span>${H.W("with_love")}</span></footer>`};
const CD_MD=(D,H)=>`<section class="md-count rv">${["d","h","m","s"].map(u=>`<div><b>${H.cd(u,2)}</b><span>${H.W({d:"days",h:"hours",m:"minutes",s:"seconds"}[u])}</span></div>`).join("")}</section>`;

// ---- 3 GARDEN: herbarium split, sticky side column -----------------------
R.garden=(D,H)=>{const S=SECS(D),e=H.e,RN=["I","II","III","IV","V","VI","VII"];let n=0;
 const plate=(id,body,cls="")=>`<section class="gd-plate${cls} rv" id="${id}"><div class="gd-ph"><b><w-t data-wi="plate">${e(H.t("plate"))}</w-t> ${RN[n++]}</b><h2>${H.W(TTL[id])}</h2></div>${body}</section>`;
 let h=`<div class="gd-wrap"><aside class="gd-side" id="top"><div class="gd-sprig" aria-hidden="true">${SPRIG("#c9d3a8")}</div><div class="k">${H.W("marriage_of")}</div><h1 class="gd-names">${D.two?`${e(D.n[0])}<i>&amp; ${e(D.n[1])}</i>`:e(D.names)}</h1>${D.hasDate||D.place?`<p class="gd-when">${D.hasDate?H.date("long"):""}${D.hasDate&&D.place?"<br>":""}${D.place?e(D.venue||D.city||D.address):""}</p>`:""}${S.length?`<ul class="gd-nav">${S.map((s,i)=>`<li><a href="#${s}" data-to="${s}"><b>${RN[i]}</b>${H.W(TTL[s])}</a></li>`).join("")}</ul>`:""}<div class="gd-cta">${D.F.rsvp?`<a href="#rsvp">${H.W("nav_reply")}</a>`:""}${D.F.calendar&&D.hasDate?`<button type="button" onclick="downloadICS()">${H.W("lbl_cal")}</button>`:""}</div></aside>
${S.length?`<div class="gd-mbar"><b>${e(D.ini)}</b>${S.map(s=>`<a href="#${s}">${H.W(NAV[s])}</a>`).join("")}</div>`:""}<main class="gd-main">`;
 for(const s of S){
  if(s==="story")h+=plate("story",`<div class="gd-two">${PARAS(D,H)}</div>`);
  if(s==="day")h+=plate("day",`<ul class="gd-line">${D.sched.map(x=>`<li><b>${e(x.time)}</b><h3>${e(x.title)}</h3>${x.desc?`<span>${e(x.desc)}</span>`:""}</li>`).join("")}</ul>`);
  if(s==="place")h+=plate("place",`<div class="gd-map">${MAP(D,H,"#f6f2e7","#d9dfcb","#c9c3ae","#38432f","#38432f")}</div><div class="gd-label">${[[D.venue,"lbl_venue"],[D.address,"lbl_address"],[D.hasDate?H.date("nowk"):"","lbl_date",1],[D.time,"lbl_time"]].filter(x=>x[0]).map(([v,k,raw])=>`<div><small>${H.W(k)}</small>${raw?v:e(v)}</div>`).join("")}</div><div class="gd-btns">${H.tools({a:"gd-btn",b:"gd-btn"})}</div>`);
  if(s==="photos")h+=plate("photos",`<div class="gd-sheet n${Math.min(D.photos.length,3)}">${D.photos.map((_,i)=>`<div class="gd-spec${i%4==1||i%4==2?" t":""}">${IMG(D,i)}<span>Fig. ${i+1}</span></div>`).join("")}</div>`);
  if(s==="notes")h+=plate("notes",`<dl class="gd-dl">${D.det.map(d=>`<dt>${e(d[0]||"—")}</dt><dd>${e(d[1])}</dd>`).join("")}</dl>${D.cd?CD_GD(D,H):""}`);
  if(s==="rsvp")h+=(D.cd&&!S.includes("notes")?`<section class="gd-plate rv">${CD_GD(D,H)}</section>`:"")+plate("rsvp",H.rsvp()," gd-reply");
 }
 if(D.cd&&!S.includes("notes")&&!S.includes("rsvp"))h+=`<section class="gd-plate rv">${CD_GD(D,H)}</section>`;
 if(!S.length&&!D.cd)h+=`<section class="gd-plate gd-solo rv"><div class="gd-sprig2" aria-hidden="true">${SPRIG("#8b9a72",.3)}</div></section>`;
 return h+`<footer class="gd-foot">${e(D.names)}${D.hasDate?` · ${e(D.dot)}`:""}</footer></main></div>`};
const CD_GD=(D,H)=>`<div class="gd-count"><b>${H.cd("d")}</b>${H.W("days_to_go")}</div>`;

// ---- 4 BLOOM: chapters of a story ----------------------------------------
const BLOBS=s=>`<div class="bl-blob" style="width:${460*s}px;height:${460*s}px;left:${-90*s}px;top:${-70*s}px;background:radial-gradient(circle,#f4b8c1,transparent 68%)"></div><div class="bl-blob" style="width:${380*s}px;height:${380*s}px;right:${-70*s}px;bottom:${30*s}px;background:radial-gradient(circle,#f6cfb6,transparent 68%)"></div><div class="bl-blob" style="width:${260*s}px;height:${260*s}px;right:20%;top:10%;background:radial-gradient(circle,#dcc9ea,transparent 68%)"></div>`;
R.bloom=(D,H)=>{const S=SECS(D),e=H.e;let n=0;
 const placeImg=S.includes("place")&&D.photos.length>0,mo=D.photos.map((_,i)=>i).slice(placeImg&&D.photos.length>1?1:placeImg?D.photos.length:0,placeImg?6:5);
 const chapters=S.filter(s=>s!=="rsvp"&&(s!=="photos"||mo.length));if(D.cd&&!chapters.includes("notes"))chapters.push("count");
 const cap=()=>`<div class="bl-cap"><w-t data-wi="ch${++n}">${e(H.t("ch"+n))}</w-t></div>`;
 let h=`<nav class="bl-dots" aria-label="${e(H.t("chapters"))}"><a href="#top" data-to="top" class="on"><span>${H.W("ch_pro")}</span></a>${chapters.concat(S.includes("rsvp")?["rsvp"]:[]).map(s=>`<a href="#${s}" data-to="${s}"><span>${H.W(s==="count"?"ey_count":NAV[s])}</span></a>`).join("")}</nav>
<section class="bl-ch bl-c0" id="top">${BLOBS(1)}<div class="bl-cap">${H.W("bl_cap")}</div><h1 class="bl-names">${D.two?`<span class="bl-name">${e(D.n[0])}</span><span class="bl-and">${H.W("and")}</span><span class="bl-name">${e(D.n[1])}</span>`:`<span class="bl-name">${e(D.names)}</span>`}</h1><p class="bl-date">${H.W("getting_married")}${D.hasDate||D.city?`<b>${D.hasDate?H.date("long"):""}${D.hasDate&&D.city?" · ":""}${e(D.city)}</b>`:""}</p>${H.cta("bl-btn")}${chapters.length||S.length?`<div class="bl-scroll" aria-hidden="true">${H.W("bl_begin")}</div>`:""}</section>`;
 chapters.forEach((s,i)=>{const c=`bl-ch bl-c${i%4+1}`;
  if(s==="story")h+=`<section class="${c}" id="story">${cap()}<h2 class="bl-t">${H.W("t_began")}</h2><div class="bl-tl">${D.story.map(x=>`<div class="rv"><p>${e(x)}</p></div>`).join("")}</div></section>`;
  if(s==="day")h+=`<section class="${c}" id="day">${cap()}<h2 class="bl-t">${H.W("t_day")}</h2><ul class="bl-day">${D.sched.map(x=>`<li class="rv"><b>${e(x.time)}</b><span>${e(x.title)}</span>${x.desc?`<em>${e(x.desc)}</em>`:""}</li>`).join("")}</ul></section>`;
  if(s==="place")h+=`<section class="${c}" id="place">${cap()}<h2 class="bl-t">${H.W("t_place")}</h2><div class="bl-arch rv${placeImg?"":" np"}">${placeImg?IMG(D,0):`${BLOBS(.55)}<span class="bl-mono">${e(D.mono)}</span>`}</div><p class="bl-addr">${e(D.venue||D.address)}${D.venue&&D.address?`<small>${e(D.address)}</small>`:""}</p><div class="bl-btns">${H.tools({a:"bl-btn",b:"bl-btn"})}</div></section>`;
  if(s==="photos")h+=`<section class="${c}" id="photos">${cap()}<h2 class="bl-t">${H.W("t_photos")}</h2><div class="bl-mo rv n${mo.length}">${mo.map((p,k)=>`<div class="f f${k+1}">${IMG(D,p)}</div>`).join("")}</div>${D.photos.length>6?`<div class="bl-more">${D.photos.slice(6).map((_,k)=>`<div class="f">${IMG(D,k+6)}</div>`).join("")}</div>`:""}</section>`;
  if(s==="notes")h+=`<section class="${c}" id="notes">${cap()}<h2 class="bl-t">${H.W("t_notes")}</h2><div class="bl-ov rv n${Math.min(D.det.length,3)}">${D.det.map(d=>`<div>${d[0]?`<h4>${e(d[0])}</h4>`:""}<p>${e(d[1])}</p></div>`).join("")}</div>${D.cd?CD_BL(D,H):""}</section>`;
  if(s==="count")h+=`<section class="${c} bl-short" id="count">${cap()}<h2 class="bl-t">${H.W("count_title")}</h2>${CD_BL(D,H)}</section>`;
 });
 const cal=CAL(D,H,"bl-btn","bl-btn");
 if(S.includes("rsvp"))h+=`<section class="bl-ch bl-c5" id="rsvp"><div class="bl-cap"><w-t data-wi="ch_last">${e(H.t("ch_last"))}</w-t></div><h2 class="bl-t">${H.W("rsvp_title")}</h2><div class="bl-card rv">${H.rsvp()}</div>${cal?`<div class="bl-btns">${cal}</div>`:""}<p class="bl-foot">${H.W("bl_foot")}</p></section>`;
 else h+=`<section class="bl-ch bl-c5 bl-short">${cal?`<div class="bl-btns">${cal}</div>`:""}<p class="bl-foot">${H.W("bl_foot")}</p></section>`;
 return h};
const CD_BL=(D,H)=>`<div class="bl-cd">${["d","h","m"].map(u=>`<div><b>${H.cd(u)}</b><span>${H.W({d:"days",h:"hours",m:"minutes"}[u])}</span></div>`).join("")}</div>`;

// ---- 5 POSTCARD v2: the curated travel journal ---------------------------
const STAMP=(D,c="red",big=0)=>`<div class="p2-stamp ${c}${big?" big":""}" aria-hidden="true"><div class="sf"><svg viewBox="0 0 80 60" preserveAspectRatio="xMidYMid slice"><rect width="80" height="60" fill="currentColor" opacity=".1"/><circle cx="58" cy="17" r="7" fill="none" stroke="currentColor" stroke-width=".9"/><path d="M0 44L14 30 22 36 36 18 50 34 58 28 80 44V60H0Z" fill="currentColor" opacity=".85"/><path d="M0 50C14 47 26 52 40 49S66 47 80 50" stroke="#fbf8f2" stroke-width=".8" fill="none"/><path d="M0 54C14 51 26 56 40 53S66 51 80 54" stroke="#fbf8f2" stroke-width=".6" fill="none" opacity=".7"/></svg><div class="st"><span>${c=="red"?"PAR AVION":"AMOR"}</span><b>${c=="red"?D.ini2:(D.yr||"♥")}</b></div></div></div>`;
let PMI=0;
const PM=(D,H,d)=>{const id="pm"+(PMI++),a=H.e(D.pmCity);return `<svg class="p2-pm" viewBox="0 0 260 120" aria-hidden="true" focusable="false"><defs><filter id="${id}f" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="${PMI*7}"/><feColorMatrix values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 -2.2 1.6"/><feComposite in="SourceGraphic" operator="in"/></filter><path id="${id}p" d="M60 60m-44 0a44 44 0 1 1 88 0a44 44 0 1 1-88 0"/></defs><g filter="url(#${id}f)" fill="none" stroke="currentColor"><circle cx="60" cy="60" r="52" stroke-width="2.2"/><circle cx="60" cy="60" r="35" stroke-width="1.2"/><text font-family="OSW,sans-serif" font-size="10.5" letter-spacing="3.2" fill="currentColor" stroke="none"><textPath href="#${id}p" startOffset="3%">${a} · PAR AVION · ${a} ·</textPath></text><text x="60" y="57" text-anchor="middle" font-family="OSW,sans-serif" font-size="13" letter-spacing="1.5" fill="currentColor" stroke="none">${H.e(d||D.pmDate)}</text>${D.time?`<text x="60" y="72" text-anchor="middle" font-family="OSW,sans-serif" font-size="8" letter-spacing="2" fill="currentColor" stroke="none">${H.e(D.time)}</text>`:""}${[0,1,2,3,4].map(i=>`<path d="M118 ${36+i*12}c12-6 24 6 36 0s24-6 36 0 24 6 36 0 18-5 26 0" stroke-width="2"/>`).join("")}</g></svg>`};
// No photo: an illustrated postcard front (sun, hills, water) with the initials.
const PCART=(D,H)=>`<svg class="ph pc-art" viewBox="0 0 600 400" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false"><rect width="600" height="400" fill="#efe5d2"/><circle cx="430" cy="150" r="70" fill="var(--red)" opacity=".85"/><path d="M0 270L90 190 160 235 270 130 380 240 450 200 600 280V400H0Z" fill="var(--blue)" opacity=".9"/><path d="M0 300L120 250 230 290 360 240 480 280 600 260V400H0Z" fill="#1d2a3a" opacity=".85"/>${[0,1,2].map(i=>`<path d="M0 ${330+i*22}C100 ${320+i*22} 200 ${342+i*22} 300 ${330+i*22}S500 ${318+i*22} 600 ${330+i*22}" stroke="#fbf8f2" stroke-width="${2-i*.5}" fill="none" opacity="${.8-i*.2}"/>`).join("")}<text x="40" y="96" font-family="DMS,serif" font-size="64" fill="#1d2a3a">${H.e(D.ini)}</text></svg>`;
R.postcard=(D,H)=>{const S=SECS(D),e=H.e;let n=0;const N2=(id,sub)=>`<div class="p2-cap"><span class="p2-no">${String(++n).padStart(2,"0")}</span><h2>${H.W({story:"t_story",day:"pc_itin",place:"pc_dest",photos:"pc_snap",notes:"pc_notes",rsvp:"nav_reply"}[id])}</h2>${sub?`<p>${sub}</p>`:""}</div>`;
 const front=HAS(D,0)?IMG(D,0):PCART(D,H),pi=HAS(D,0)?1:0,prints=D.photos.map((_,i)=>i).slice(pi);
 const S2=S.filter(s=>s!=="photos"||prints.length);
 let h=`<nav class="p2-nav"><b>${e(D.ini)}</b><div class="lk">${S2.filter(s=>s!=="rsvp").map((s,i)=>`<a href="#${s}" data-to="${s}"><i>0${i+1}</i>${H.W({story:"nav_story",day:"pc_itin",place:"pc_dest",photos:"pc_snap",notes:"nav_notes"}[s])}</a>`).join("")}</div>${D.F.rsvp?`<a class="p2-cta" href="#rsvp">${H.W("nav_reply")}</a>`:""}</nav>
<header class="p2-hero" id="top"><div class="p2-front rv"><div class="in">${front}</div>${STAMP(D,"red",1)}<div class="pmw">${PM(D,H)}</div></div>
<div class="p2-intro rv"><span class="p2-chip">Par avion · ${H.W("eyebrow")}</span><h1>${D.two?`${e(D.n[0])}<br><i>&amp;</i> ${e(D.n[1])}`:e(D.names)}</h1><p class="lede">${H.W("pc_lede")}</p>${D.hasDate||D.time||D.place?`<dl class="p2-facts">${D.hasDate?`<div><dt>${H.W("lbl_date")}</dt><dd>${H.date("long")}</dd></div>`:""}${D.time?`<div><dt>${H.W("lbl_time")}</dt><dd>${e(D.time)}</dd></div>`:""}${D.place?`<div><dt>${H.W("lbl_place")}</dt><dd>${e([D.venue,D.city].filter(Boolean).join(", ")||D.address)}</dd></div>`:""}</dl>`:""}<div class="p2-btns">${D.F.rsvp?`<a class="p2-btn k" href="#rsvp">${H.W("rsvp_link")}</a>`:""}${D.F.calendar&&D.hasDate?`<button type="button" class="p2-btn" onclick="downloadICS()">${H.W("add_cal")}</button>`:""}${D.F.card?`<button type="button" class="p2-btn" onclick="openCard()">${H.W("card")}</button>`:""}</div></div></header>`;
 for(const s of S2){
  if(s==="story")h+=`<section class="p2-sec" id="story">${N2("story",H.W("pc_letter_sub"))}<div class="p2-letter rv"><div class="hd"><span>${e([D.city,D.yr].filter(Boolean).join(", "))}</span><span class="air"></span></div><p class="sal">${H.W("pc_dear")}</p>${PARAS(D,H)}<p class="sig">${H.W("with_love")}<br>${e(D.names)}</p></div></section>`;
  if(s==="day")h+=`<section class="p2-sec" id="day">${N2("day",D.hasDate?H.date("long"):"")}<div class="p2-pass rv"><div class="m"><div class="top"><span>${H.W("pc_pass")}</span><span class="air"></span><span>${e(D.flight)}</span></div><div class="route"><div><small>${H.W("pc_from")}</small><b>${H.W("pc_home")}</b><span>${H.W("pc_wherever")}</span></div><div class="path" aria-hidden="true"><i></i><svg viewBox="0 0 24 24"><path d="M2 13l8-1 4-8h2l-2 8 6 1 2-3h2l-1 4 1 4h-2l-2-3-6 1 2 8h-2l-4-8-8-1z" fill="currentColor"/></svg><i></i></div><div class="to"><small>${H.W("pc_to")}</small><b>${e(D.toCode)}</b><span>${e(D.venue||D.city)}</span></div></div><ol class="sch n${Math.min(D.sched.length,4)}">${D.sched.map(x=>`<li><time>${e(x.time)}</time><b>${e(x.title)}</b>${x.desc?`<span>${e(x.desc)}</span>`:""}</li>`).join("")}</ol></div><div class="stub"><div><small>${H.W("pc_passenger")}</small><b>${H.W("pc_guest")}</b></div>${D.hasDate?`<div><small>${H.W("lbl_date")}</small><b>${e(D.dot)}</b></div>`:""}${D.time?`<div><small>${H.W("pc_boarding")}</small><b>${e(D.time)}</b></div>`:""}<div><small>${H.W("pc_seat")}</small><b>${H.W("pc_withus")}</b></div><div class="bar"></div></div></div></section>`;
  if(s==="place")h+=`<section class="p2-sec" id="place">${N2("place",e(D.address&&D.venue?D.address:""))}<div class="p2-dest rv"><div class="p2-map">${MAP(D,H,"#efe8da","#c9d6dc","#d9cfba","#b8402a","#1d2a3a")}<div class="fold"></div></div><div class="p2-venue"><h3>${e(D.venue||D.address)}</h3>${D.venue&&D.address?`<p>${e(D.address)}</p>`:""}<div class="p2-btns">${H.tools({a:"p2-btn k",b:"p2-btn"})}</div></div></div></section>`;
  if(s==="photos")h+=`<section class="p2-sec" id="photos">${N2("photos",H.W("pc_snap_sub"))}<div class="p2-prints rv n${Math.min(prints.length,3)}">${prints.map((p,i)=>`<figure style="--r:${[-2,1.2,-.6,1.6,-1.2,.8][i%6]}deg"><div class="pr">${IMG(D,p)}</div></figure>`).join("")}</div></section>`;
  if(s==="notes")h+=`<section class="p2-sec" id="notes">${N2("notes",H.W("pc_notes_sub"))}<div class="p2-notes rv"><div class="cols n${Math.min(D.det.length,3)}">${D.det.map(d=>`<div>${d[0]?`<h4>${e(d[0])}</h4>`:""}<p>${e(d[1])}</p></div>`).join("")}</div>${D.cd?DEP(D,H):""}</div></section>`;
  if(s==="rsvp")h+=(D.cd&&!S.includes("notes")?`<section class="p2-sec"><div></div><div class="p2-notes rv">${DEP(D,H)}</div></section>`:"")+`<section class="p2-sec p2-rsec" id="rsvp">${N2("rsvp","")}<div class="p2-reply rv"><div class="l"><span class="p2-chip">${H.W("pc_reply_card")}</span><h3>${H.W("pc_wish")}</h3><p>${H.W("pc_wish_desc")}</p><div class="from"><small>${H.W("pc_from")}</small><div>${e(D.names)}</div>${D.city?`<div>${e(D.city)}</div>`:""}</div></div><div class="r"><div class="corner"><div class="affix">${H.W("pc_affix")}</div>${STAMP(D,"blue")}<div class="pmw">${PM(D,H)}</div></div>${H.rsvp()}</div></div></section>`;
 }
 if(D.cd&&!S.includes("notes")&&!S.includes("rsvp"))h+=`<section class="p2-sec"><div></div><div class="p2-notes rv">${DEP(D,H)}</div></section>`;
 const cal=CAL(D,H,"p2-btn k","p2-btn");
 return h+`<footer class="p2-foot">${cal?`<div class="p2-btns" style="justify-content:center;margin-bottom:28px">${cal}</div>`:""}<span class="air"></span><p>${e([D.names,D.city,D.yr?ROM(+D.yr):""].filter(Boolean).join(" · "))}</p></footer>`};
const DEP=(D,H)=>`<div class="dep"><span>${H.W("pc_depart")}</span><b>${H.cd("d")}</b><span>${H.W("days")}</span><b>${H.cd("h")}</b><span>${H.W("hours")}</span><b>${H.cd("m")}</b><span>${H.W("minutes")}</span></div>`;

// ---- 6 GALLERY: the magazine issue ---------------------------------------
R.gallery=(D,H)=>{const S=SECS(D),e=H.e;const q=D.photos.map((_,i)=>i),take=()=>q.length?q.shift():-1;
 const cov=take(),toc=[];let k=0,pg=4;const kick=key=>`<div class="gl-kick">${String(++k).padStart(2,"0")} — ${H.W(key)}</div>`;
 const issue=`<span>Nº 1</span><span>${H.W("gl_issue")}</span>${D.season?`<span><w-t data-wi="${D.season}">${e(H.t(D.season))}</w-t> ${e(D.yr)}</span>`:""}`;
 let h=`<section class="gl-cover${cov<0?" np":""}" id="top">${cov<0?"":IMG(D,cov)}<div class="gl-mast"><div class="gl-iss">${issue}</div><div class="gl-logo">${D.two?`${e(D.n[0])} <i>&amp;</i> ${e(D.n[1])}`:e(D.names)}</div></div><div class="gl-lines"><b>${H.W("getting_married")}</b>${D.hasDate||D.place?`<p>${D.hasDate?H.date("long"):""}${D.hasDate&&D.place?"<br>":""}${e(D.venue||D.address)}</p>`:""}</div>${D.hasDate?`<div class="gl-code" aria-hidden="true"><div></div>${e(D.dot.replace(/\./g," "))}</div>`:""}</section>`;
 const body=[];
 for(const s of S){
  if(s==="story"){const im=take();toc.push(["t_story",pg,"story"]);body.push(`<section class="gl-spread${im<0?" one":""}" id="story">${im<0?"":`<div class="gl-pg img rv">${IMG(D,im)}<div class="gl-folio"><span>${String(pg).padStart(2,"0")}</span><span>${e(D.names)}</span></div></div>`}<div class="gl-pg rv">${kick("gl_feature")}<h2 class="gl-h">${H.W("t_story")}</h2><div class="gl-col${D.story.join(" ").length<420?" c1":""}">${PARAS(D,H)}</div><div class="gl-folio"><span>${e(D.names)}</span><span>${String(pg+1).padStart(2,"0")}</span></div></div></section>`);pg+=2}
  if(s==="day"){const im=take();toc.push(["t_day",pg,"day"]);body.push(`<section class="gl-spread${im<0?" one":""}" id="day"><div class="gl-pg rv">${kick("gl_agenda")}<h2 class="gl-h">${H.W("t_day")}</h2><ul class="gl-ag">${D.sched.map(x=>`<li><b>${e(x.time)}</b><div><h3>${e(x.title)}</h3>${x.desc?`<p>${e(x.desc)}</p>`:""}</div></li>`).join("")}</ul><div class="gl-folio"><span>${String(pg).padStart(2,"0")}</span><span>${D.hasDate?H.date("nowk"):""}</span></div></div>${im<0?"":`<div class="gl-pg img rv">${IMG(D,im)}<div class="gl-folio"><span></span><span>${String(pg+1).padStart(2,"0")}</span></div></div>`}</section>`);pg+=2}
  if(s==="place"){const im=take();toc.push(["t_place",pg,"place"]);body.push(`<section class="gl-band rv${im<0?" np":""}" id="place">${im<0?"":IMG(D,im)}<div class="t">${kick("gl_location")}<h2>${e(D.venue||D.address)}</h2>${D.venue&&D.address?`<p>${e(D.address)}</p>`:""}<div class="gl-tools">${H.tools({a:"gl-btn f",b:"gl-btn"})}</div></div><div class="gl-mapin">${MAP(D,H,"#fff","#e6e6e6","#d0d0d0","#111","#111")}</div></section>`);pg+=2}
  if(s==="photos"&&q.length){const ph=q.splice(0);toc.push(["gl_portfolio",pg,"photos"]);body.push(`<section class="gl-mos n${Math.min(ph.length,5)}" id="photos"><div class="hd rv">${kick("gl_portfolio")}<h2 class="gl-h">${H.W("t_photos")}</h2></div>${ph.map((p,i)=>`<figure class="${i<5?"abcde"[i]:"x"} rv">${IMG(D,p)}<figcaption>Fig. ${i+1}</figcaption></figure>`).join("")}</section>`);pg+=2}
  if(s==="notes"){toc.push(["t_notes",pg,"notes"]);body.push(`<section class="gl-notes rv n${Math.min(D.det.length+(D.cd?1:0),4)}" id="notes">${(()=>{const kk=String(++k).padStart(2,"0");return D.det.map(d=>`<div><div class="gl-kick">${kk} — <w-t data-wi="gl_notes">${e(H.t("gl_notes"))}</w-t></div>${d[0]?`<h4>${e(d[0])}</h4>`:""}<p>${e(d[1])}</p></div>`).join("")})()}${D.cd?CD_GL(D,H):""}</section>`);pg+=2}
  if(s==="rsvp"){if(D.cd&&!S.includes("notes"))body.push(`<section class="gl-notes rv n1 solo">${CD_GL(D,H)}</section>`);toc.push(["nav_reply",pg,"rsvp"]);body.push(`<section class="gl-back" id="rsvp"><div class="rv"><div class="gl-kick" style="opacity:.6">${String(++k).padStart(2,"0")} — ${H.W("gl_back")}</div><h2>${H.W("nav_reply")}</h2><div class="sub">${H.W("gl_one")}</div></div><div class="rv">${H.rsvp()}</div></section>`)}
 }
 if(D.cd&&!S.includes("notes")&&!S.includes("rsvp"))body.push(`<section class="gl-notes rv n1 solo">${CD_GL(D,H)}</section>`);
 if(toc.length>1)h+=`<section class="gl-toc rv"><h2>${H.W("gl_toc")}</h2><ol>${toc.map((t,i)=>`<li><b>${String(i+1).padStart(2,"0")}</b><a href="#${t[2]}">${H.W(t[0])}</a><span>p. ${String(t[1]).padStart(2,"0")}</span></li>`).join("")}</ol></section>`;
 const cal=CAL(D,H,"gl-btn f","gl-btn");
 return h+body.join("")+`${cal?`<div class="gl-cal">${cal}</div>`:""}<footer class="gl-colo"><span>${e(D.names)} · Nº 1</span><span>${H.W("with_love")}</span></footer>`};
const CD_GL=(D,H)=>`<div class="cd"><div class="gl-kick">${H.W("ey_count")}</div><b>${H.cd("d")}</b><p>${H.W("days_to_go")}</p></div>`;

// ---- Envelopes v2: one choreography per theme ----------------------------
const WRAP=(t,H,inner,ping)=>`<div class="env2 x-${t}" style="--fade:${(TOT[t]-450)/1000}s"><div class="x-bg"></div><div class="x-zoom"><div class="x-float">${inner}${ping?`<div class="x-ping" style="${ping}"><i></i><i></i></div>`:""}</div></div><div class="x-cue"><span>${H.W(CUE[t])}</span></div><div class="x-skip">${H.W("skip_tap")}</div></div>`;
const BLOB=(r=44,cx=50,cy=50,seed=3)=>{let p=[];const n=22;for(let i=0;i<n;i++){const a=i/n*Math.PI*2,k=r*(1+.045*Math.sin(a*3+seed)+.03*Math.sin(a*7+seed*2)+(i%5==0?.05:0));p.push([cx+k*Math.cos(a),cy+k*Math.sin(a)])}let d=`M${((p[0][0]+p[n-1][0])/2).toFixed(1)} ${((p[0][1]+p[n-1][1])/2).toFixed(1)}`;for(let i=0;i<n;i++){const q=p[i],nx=p[(i+1)%n];d+=`Q${q[0].toFixed(1)} ${q[1].toFixed(1)} ${((q[0]+nx[0])/2).toFixed(1)} ${((q[1]+nx[1])/2).toFixed(1)}`}return d+"Z"};
const CRACK="50,0 47,14 53,25 46,38 52,49 45,61 51,72 47,86 50,100";
const SEAL=(half,ini,cjk)=>{const clip=half==1?`0,0 ${CRACK} 0,100`:`100,0 ${CRACK} 100,100`,f=cjk?`font-family="serif" font-size="${ini.length>2?18:24}"`:`font-family="PIN,serif" font-size="${ini.length>2?26:34}"`,t=(fill,op,tr)=>`<text x="50" y="${cjk?59:62}" text-anchor="middle" ${f} fill="${fill}"${op?` opacity="${op}"`:""}${tr?` transform="${tr}"`:""}>${ini}</text>`;
 return `<svg viewBox="0 0 100 100"><defs><radialGradient id="wx${half}" cx="38%" cy="32%" r="75%"><stop offset="0" stop-color="#a5617d"/><stop offset=".45" stop-color="#7a3a55"/><stop offset="1" stop-color="#4c2236"/></radialGradient><radialGradient id="wr${half}" cx="60%" cy="65%" r="60%"><stop offset="0" stop-color="#5e2a42"/><stop offset="1" stop-color="#7d3e5a"/></radialGradient><clipPath id="cp${half}"><polygon points="${clip}"/></clipPath></defs><g clip-path="url(#cp${half})"><path d="${BLOB(47,50,50,2)}" fill="#4a2034" transform="translate(1.2 2)"/><path d="${BLOB(47,50,50,2)}" fill="url(#wx${half})"/><circle cx="50" cy="50" r="31" fill="url(#wr${half})"/><circle cx="50" cy="50" r="31" fill="none" stroke="#c98aa3" stroke-opacity=".35" stroke-width="1" transform="translate(.6 .8)"/><circle cx="50" cy="50" r="31" fill="none" stroke="#3a1527" stroke-opacity=".55" stroke-width="1.2"/>${t("#3a1527",".6","translate(-.8 -.8)")}${t("#d9a3b8",".55","translate(.8 .9)")}${t("#74364f")}<ellipse cx="34" cy="26" rx="14" ry="6" fill="#fff" opacity=".22" transform="rotate(-28 34 26)"/><ellipse cx="30" cy="24" rx="5" ry="2" fill="#fff" opacity=".5" transform="rotate(-28 30 24)"/></g></svg>`};
const TWBOW=`<svg viewBox="0 0 140 90" class="x-bow" aria-hidden="true"><defs><pattern id="rope" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(55)"><rect width="6" height="6" fill="#c3ad80"/><rect width="2.4" height="6" fill="#a08658"/></pattern></defs><g class="lo1"><path d="M70 40C52 18 26 16 24 30S50 46 70 40" fill="none" stroke="#7d6844" stroke-width="7.5" stroke-linecap="round" transform="translate(0 1.5)" opacity=".35"/><path d="M70 40C52 18 26 16 24 30S50 46 70 40" fill="none" stroke="url(#rope)" stroke-width="6" stroke-linecap="round"/></g><g class="lo2"><path d="M70 40C88 18 114 16 116 30S90 46 70 40" fill="none" stroke="#7d6844" stroke-width="7.5" stroke-linecap="round" transform="translate(0 1.5)" opacity=".35"/><path d="M70 40C88 18 114 16 116 30S90 46 70 40" fill="none" stroke="url(#rope)" stroke-width="6" stroke-linecap="round"/></g><g class="ta1"><path d="M68 42C60 56 50 66 40 84" fill="none" stroke="url(#rope)" stroke-width="5.5" stroke-linecap="round"/></g><g class="ta2"><path d="M72 42C80 58 92 68 98 86" fill="none" stroke="url(#rope)" stroke-width="5.5" stroke-linecap="round"/></g><g class="kn"><ellipse cx="70" cy="40" rx="8" ry="7" fill="url(#rope)" stroke="#7d6844" stroke-opacity=".5"/></g></svg>`;
const ENAMES=(D,H,a,b,cls="n",conn="a")=>D.two?`<div class="${cls}">${H.e(D.n[0])}</div><div class="${conn}">${H.W("and")}</div><div class="${cls}">${H.e(D.n[1])}</div>`:`<div class="${cls}">${H.e(D.names)}</div>`;
const PCBACK=(D,H,live)=>`<div class="x-rear"></div>${live?`<div class="x-letter pp"><span class="p2-chip">Par avion</span><b>${H.e(D.names)}</b><i>${H.W("getting_married")}</i><span class="d">${H.e([D.dot.replace(/\./g," · "),D.city].filter(Boolean).join(" — "))}</span></div>`:""}<svg class="x-pocket" viewBox="0 0 700 490" preserveAspectRatio="none" aria-hidden="true"><path d="M0 0L350 285 0 490Z" fill="#f6f1e7"/><path d="M700 0L350 285 700 490Z" fill="#f3eee3"/><path d="M0 490L350 245 700 490Z" fill="#f8f4ec"/><path d="M0 490L350 245 700 490" fill="none" stroke="#8a7f6c" stroke-opacity=".22" stroke-width="1.5"/><path d="M0 0L350 285M700 0L350 285" stroke="#8a7f6c" stroke-opacity=".16" stroke-width="1.2" fill="none"/></svg><div class="x-pkb"></div><div class="x-flap"><div class="fo"></div><div class="fi"></div></div><div class="x-stk">${H.e(D.ini)}</div>`;
E.letterpress=(D,H)=>WRAP("letterpress",H,`<div class="x-book"><div class="x-sh"></div><div class="x-page pp"><div class="k">${H.W("families")}</div>${ENAMES(D,H)}<div class="r"></div><div class="k">${H.W("request")}</div>${D.hasDate||D.city?`<div class="k s">${D.hasDate?H.date("long"):""}${D.hasDate&&D.city?" · ":""}${H.e(D.city)}</div>`:""}</div><div class="x-cover"><div class="x-face fr pp"><div class="frame"></div><div class="mono">${H.e(D.mono)}</div>${D.yr?`<div class="dt">${H.e(D.romanDate)}</div>`:""}</div><div class="x-face bk pp"><div class="lin"></div><div class="wl">${H.W("with_love")}<br>${H.e(D.ini)}</div></div></div></div>`,"right:-14px;top:50%");
E.modern=(D,H)=>WRAP("modern",H,`<div class="x-tk"><div class="x-sh"></div><div class="x-main"><div class="x-face fr"><div class="t"><span>ADMIT TWO</span><span>No. ${H.e(D.dd+D.mm||"0001")}</span></div><b>${D.two?`${H.e(D.n[0])}<br>&amp; ${H.e(D.n[1])}`:H.e(D.names)}</b><div class="t"><span>${H.e([D.dot,D.time].filter(Boolean).join(" — "))}</span><span>${H.e([D.venue,D.city].filter(Boolean).join(", "))}</span></div></div><div class="x-face bk"><b>${D.two?`${H.e(D.n[0])}<br><span>&amp;</span> ${H.e(D.n[1])}`:H.e(D.names)}</b><div class="dl">${H.e(D.dash)}</div></div></div><div class="x-stub"><small>${H.W("cue_md")} →</small><b>${D.hasDate?`${H.e(D.dd)}<br>${H.e(D.mm)}`:"♥"}</b><i></i></div></div>`,"right:12%;top:50%");
E.garden=(D,H)=>WRAP("garden",H,`<div class="x-gate"><div class="x-sh"></div><div class="x-inner pp"><div class="k">${H.W("marriage_of")}</div>${D.two?`<b>${H.e(D.n[0])}</b><i>&amp; ${H.e(D.n[1])}</i>`:`<b>${H.e(D.names)}</b>`}${D.hasDate||D.city?`<div class="d">${D.hasDate?H.date("long"):""}${D.hasDate&&D.city?" · ":""}${H.e(D.city)}</div>`:""}<div class="sp">${SPRIG("#8b9a72",.22)}</div></div><div class="x-pl"><div class="x-face fr pp"><div class="ln"></div></div><div class="x-face bk"></div></div><div class="x-pr"><div class="x-face fr pp"><div class="ln"></div><div class="spr">${SPRIG("#c9d3a8",.22)}</div></div><div class="x-face bk"></div></div><div class="x-tw l"></div><div class="x-tw r"></div>${TWBOW}<div class="x-tag"><i></i><div class="tg pp"><b>${H.e(D.ini)}</b>${D.hasDate?`<span>${H.e(D.romanShort)}</span>`:""}</div></div></div>`,"left:50%;top:50%");
E.bloom=(D,H)=>WRAP("bloom",H,`<div class="x-envl"><div class="x-sh"></div><div class="x-rear"></div><div class="x-letter pp"><div class="k">${H.W("families")}</div>${D.two?`<b>${H.e(D.n[0])}</b><i>${H.W("and")}</i><b>${H.e(D.n[1])}</b>`:`<b>${H.e(D.names)}</b>`}${D.hasDate||D.city?`<div class="d">${D.hasDate?H.date("nowk"):""}${D.hasDate&&D.city?" · ":""}${H.e(D.city)}</div>`:""}</div><svg class="x-pocket" viewBox="0 0 700 500" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="pk1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f6e1e1"/><stop offset="1" stop-color="#eccfd0"/></linearGradient><linearGradient id="pk2" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#efd4d5"/><stop offset="1" stop-color="#f7e4e4"/></linearGradient></defs><path d="M0 0L350 290 0 500Z" fill="url(#pk1)"/><path d="M700 0L350 290 700 500Z" fill="url(#pk1)"/><path d="M0 500L350 250 700 500Z" fill="url(#pk2)"/><path d="M0 500L350 250 700 500" fill="none" stroke="#b98a93" stroke-opacity=".28" stroke-width="1.5"/><path d="M0 0L350 290M700 0L350 290" stroke="#b98a93" stroke-opacity=".18" stroke-width="1.2"/></svg><div class="x-flap"><div class="fo"></div><div class="fi"></div></div><div class="x-seal"><div class="h h1">${SEAL(1,H.e(D.ini2),D.cjk)}</div><div class="h h2">${SEAL(2,H.e(D.ini2),D.cjk)}</div><div class="ck"></div><i class="cr c1"></i><i class="cr c2"></i><i class="cr c3"></i></div></div>`,"left:50%;top:60%");
E.postcard=(D,H)=>WRAP("postcard",H,`<div class="x-air"><div class="x-sh"></div><div class="x-live">${PCBACK(D,H,1)}</div><div class="x-flip"><div class="x-face fr pp"><span class="p2-chip">Par avion · Priority</span>${STAMP(D,"red")}${STAMP(D,"blue")}<div class="pmw">${PM(D,H)}</div><div class="addr"><i>${H.W("pc_to_fav")}</i><span>${H.W("pc_wherever")}</span><span>${H.e(D.names)}</span></div></div><div class="x-face bk">${PCBACK(D,H,0)}</div></div></div>`,"left:50%;top:50%");
E.gallery=(D,H)=>WRAP("gallery",H,`<div class="x-gw"><div class="x-sh"></div><div class="x-mag${HAS(D,0)?"":" np"}"><div class="ph-w">${HAS(D,0)?`<img class="ph" src="${D.photos[0]}" alt="" decoding="async">`:""}</div><div class="mh"><div class="iss"><span>Nº 1</span>${D.season?`<span><w-t data-wi="${D.season}">${H.e(H.t(D.season))}</w-t> ${H.e(D.yr)}</span>`:""}</div><b>${D.two?`${H.e(D.n[0])} <i>&amp;</i> ${H.e(D.n[1])}`:H.e(D.names)}</b></div></div><div class="x-sleeve"><div class="sheen"></div><div class="emb"><b>${H.W("gl_issue")}</b><span>Nº 1${D.yr?` · ${H.e(D.yr)}`:""}</span></div><small>${H.W("cue_gl")}</small></div></div>`,"left:50%;top:-4%");

// ---- Print cards (5x7 in / 7x5 in) with QR -------------------------------
C.letterpress=(D,H)=>`<div class="ic ic-lp"><div class="lp-mono">${H.e(D.mono)}</div><div class="lp-k">${H.W("families")}</div><div class="lp-hr"></div><div class="lp-names">${D.two?`<div class="lp-name">${H.e(D.n[0])}</div><div class="lp-and">${H.W("and")}</div><div class="lp-name">${H.e(D.n[1])}</div>`:`<div class="lp-name">${H.e(D.names)}</div>`}</div><div class="lp-hr"></div><p class="lp-it">${H.W("request")}</p><div class="lp-hr"></div><div class="lp-date">${D.hasDate?H.date("long"):""}${D.time?`<br>${H.e(D.time)}`:""}${D.place?`<br>${H.e([D.venue,D.city].filter(Boolean).join(" · ")||D.address)}`:""}</div>${H.qr}</div>`;
C.modern=(D,H)=>`<div class="ic ic-md"><div class="ic-hd"><span>${H.e(D.n.map(x=>[...x.trim()][0]||"").join("/"))}</span><span>${H.W("title")}</span><span>${H.e(D.yr)}</span></div><h1>${D.two?`${H.e(D.n[0])}<br>&amp; ${H.e(D.n[1])}`:H.e(D.names)}</h1>${D.hasDate?`<div class="ic-dt">${H.e(D.dash)}</div>`:""}<div class="ic-ft">${D.time?`<div><b>${H.W("lbl_time")}</b>${H.e(D.time)}</div>`:""}${D.place?`<div><b>${H.W("lbl_venue")}</b>${H.e(D.venue||D.address)}${D.venue&&D.address?`<br>${H.e(D.address)}`:""}</div>`:""}${H.qr}</div></div>`;
C.garden=(D,H)=>`<div class="ic ic-gd"><div class="ic-l"><div class="ic-spr">${SPRIG("#c9d3a8")}</div><div class="ic-k">${H.W("marriage_of")}</div><div class="ic-nm">${D.two?`${H.e(D.n[0])}<i>&amp; ${H.e(D.n[1])}</i>`:H.e(D.names)}</div></div><div class="ic-r"><div class="ic-k g">${H.W("plate")} I · ${H.W("title")}</div><p class="ic-p">${H.W("request")}${D.hasDate?` — ${H.date("long")}`:""}${D.time?`, ${H.e(D.time)}`:""}.</p><div class="gd-label">${[[D.venue,"lbl_venue"],[D.address,"lbl_address"]].filter(x=>x[0]).map(([v,k])=>`<div><small>${H.W(k)}</small>${H.e(v)}</div>`).join("")}</div>${H.qr}</div></div>`;
C.bloom=(D,H)=>`<div class="ic ic-bl">${BLOBS(.56)}<div class="bl-cap">${H.W("families")}</div><div class="bl-names">${D.two?`<div class="bl-name">${H.e(D.n[0])}</div><div class="bl-and">${H.W("and")}</div><div class="bl-name">${H.e(D.n[1])}</div>`:`<div class="bl-name">${H.e(D.names)}</div>`}</div><p class="bl-date">${H.W("invite_celebrate")}${D.hasDate||D.place?`<b>${D.hasDate?H.date("nowk"):""}${D.time?` · ${H.e(D.time)}`:""}${D.place?`<br>${H.e([D.venue,D.city].filter(Boolean).join(" · ")||D.address)}`:""}</b>`:""}</p>${H.qr}</div>`;
C.postcard=(D,H)=>`<div class="ic p2-ic"><div class="l"><span class="p2-chip">${H.W("eyebrow")}</span><h2>${D.two?`${H.e(D.n[0])} <i>&amp;</i> ${H.e(D.n[1])}`:H.e(D.names)}</h2><p>${H.W("pc_lede")}</p><div class="facts">${D.hasDate?`<div><small>${H.W("lbl_date")}</small>${H.date("nowk")}</div>`:""}${D.time?`<div><small>${H.W("lbl_time")}</small>${H.e(D.time)}</div>`:""}</div></div><div class="r">${STAMP(D,"red")}<div class="pmw">${PM(D,H)}</div><div class="lines">${[D.venue,D.address].filter(Boolean).map(x=>`<div>${H.e(x)}</div>`).join("")}${H.qr}</div></div><div class="edge"></div></div>`;
C.gallery=(D,H)=>`<div class="ic ic-gl${HAS(D,0)?"":" np"}"><div class="ic-top">${HAS(D,0)?`<img class="ph" src="${D.photos[0]}" alt="">`:""}<div class="ic-sc"></div><div class="ic-mh"><div class="ic-iss"><span>Nº 1</span><span>${D.season?`<w-t data-wi="${D.season}">${H.e(H.t(D.season))}</w-t> `:""}${H.e(D.yr)}</span></div><div class="ic-logo">${D.two?`${H.e(D.n[0])} <i>&amp;</i> ${H.e(D.n[1])}`:H.e(D.names)}</div></div></div><div class="ic-bt"><div><div class="gl-kick">${H.W("gl_issue")}</div><div class="ic-dt">${D.hasDate?H.date("long"):""}</div></div><div class="ic-in">${D.time?`${H.e(D.time)}<br>`:""}${H.e(D.venue||"")}${D.address?`<br>${H.e(D.address)}`:""}${H.qr}</div></div></div>`;

G.WBT={version:"30.1",TOT,FONTS,KEY,
 css:(t,o={})=>CSS.base+"\n"+CSS[t]+(o.env?"\n"+ENVCSS.common+"\n"+ENVCSS[t]+"\n"+ENVCSS.tail:""),
 page:(t,D,H)=>(PMI=0,R[t](D,H)),env:(t,D,H)=>E[t](D,H),card:(t,D,H)=>C[t](D,H)};
})(typeof window!=="undefined"?window:globalThis);
