

let wbHeroData="";
let wbGalleryData=[];

function escapeSiteText(value=""){
  return String(value).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
function deriveCustomizedNames(){
  for(let i=cart.length-1;i>=0;i--){
    const s=String(cart[i].customization||"");
    const first=s.split(/\n|\//)[0].trim();
    if(first.length<80 && (first.includes("&") || first.includes("和") || first.includes("+"))){
      return first.replace(/^设计文件：/,"").trim();
    }
  }
  const t=document.getElementById("coupleNames").textContent.trim();return t==="Amelia & Noah"?"":t; // the storefront sample name is not a real couple
}
function readFileAsDataURL(file){
  return new Promise((resolve,reject)=>{
    const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file);
  });
}
function parseSchedule(text){
  return String(text).split("\n").map(x=>x.trim()).filter(Boolean).map(line=>{
    const parts=line.split("|").map(x=>x.trim());
    return {time:parts[0]||"",title:parts[1]||"",desc:parts.slice(2).join(" | ")||""};
  });
}
let wbAccentTouched=false;
function weddingProfile(){
  return {
    sceneKey,
    sceneName:sceneData[sceneKey]?.name||sceneKey,
    sceneColors:sceneData[sceneKey]?.colors||["#d8cec2","#eadfd4","#c8b9ac","#c7b29c"],
    names:document.getElementById("wbNames").value.trim(),
    date:document.getElementById("wbDate").value,
    time:document.getElementById("wbTime").value,
    venue:document.getElementById("wbVenue").value.trim(),
    address:document.getElementById("wbAddress").value.trim(),
    mapUrl:document.getElementById("wbMapUrl").value.trim(),
    intro:document.getElementById("wbIntro").value.trim(),
    schedule:parseSchedule(document.getElementById("wbSchedule").value),
    rsvpEmail:document.getElementById("wbRsvpEmail").value.trim(),
    rsvpUrl:document.getElementById("wbRsvpUrl").value.trim(),
    note:document.getElementById("wbNote").value.trim(),
    accent:document.getElementById("wbAccent").value,
    accentCustom:wbAccentTouched,
    density:document.getElementById("wbDensity").value,
    heroAlign:document.getElementById("wbHeroAlign").value,
    radius:document.getElementById("wbRadius").value,
    layout:document.getElementById("wbLayout").value,
    palette:document.getElementById("wbPalette").value,
    plain:document.getElementById("wbPlain").checked,
    lang:document.getElementById("wbLang").value,
    rsvpMode:document.getElementById("wbRsvpMode").value,
    rsvpNotify:document.getElementById("wbRsvpNotify").checked,
    giftUrl:document.getElementById("wbGiftUrl").value.trim(),
    heroPhoto:wbHeroData,
    gallery:wbGalleryData,
    features:{
      countdown:document.getElementById("ftCountdown").checked,
      timeline:document.getElementById("ftTimeline").checked,
      map:document.getElementById("ftMap").checked,
      gallery:document.getElementById("ftGallery").checked,
      rsvp:document.getElementById("ftRsvp").checked,
      share:document.getElementById("ftShare").checked,
      calendar:document.getElementById("ftCalendar").checked,
      addressCopy:document.getElementById("ftAddressCopy").checked,
      envelope:document.getElementById("ftEnvelope").checked,
      card:document.getElementById("ftCard").checked
    }
  };
}
// ---- Wedding website generator: 6 page architectures (Letterpress card suite, Modern Swiss poster, Garden herbarium, Bloom chapters, Postcard travel journal, Gallery magazine) from one content model. Theme CSS/markup/envelopes/cards: assets/wedding/wb-themes.js (lazy). ----
const WEDDING_LAYOUTS=["letterpress","modern","garden","bloom","postcard","gallery"];
const WB_THEME_MAP={classic:{layout:"letterpress"},modern:{layout:"modern"},editorial:{layout:"modern"},minimal:{layout:"modern",plain:true},botanical:{layout:"garden",palette:"green"},olive:{layout:"garden",palette:"olive"},floral:{layout:"bloom"},watercolor:{layout:"bloom"},destination:{layout:"postcard"},gallery:{layout:"gallery"}};
function wbNormTheme(p){const cur=WEDDING_LAYOUTS.includes(p&&p.layout),m=cur?{layout:p.layout}:(WB_THEME_MAP[p&&p.layout]||{layout:"letterpress"});const layout=m.layout;const palette=layout==="garden"?(cur&&["green","olive"].includes(p.palette)?p.palette:(m.palette||(["green","olive"].includes(p&&p.palette)?p.palette:"green"))):"";const plain=layout==="modern"&&(!!m.plain||(cur&&p.plain===true));return {layout,palette,plain}}
// Self-hosted OFL woff2 subsets in /fonts (licenses alongside). Only the active theme's faces are emitted (latin unicode-range; CJK text falls back to system fonts).
const WB_FONTS={BOD:["BOD","bodoni-moda-latin.woff2","400 500","normal"],BODi:["BOD","bodoni-moda-italic-latin.woff2","400","italic"],COR:["COR","cormorant-garamond-latin-var.woff2","300 700","normal"],CORi:["COR","cormorant-garamond-italic-latin-var.woff2","300 700","italic"],ANT:["ANT","antonio-latin-var.woff2","100 700","normal"],INT:["INT","inter-latin-var.woff2","100 900","normal"],GIL:["GIL","gilda-display-latin.woff2","400","normal"],PIN:["PIN","pinyon-script-latin.woff2","400","normal"],PLA:["PLA","playfair-display-latin.woff2","400","normal"],PLAi:["PLA","playfair-display-italic-latin.woff2","400","italic"],DMS:["DMS","dm-serif-display-latin.woff2","400","normal"],DMSi:["DMS","dm-serif-display-italic-latin.woff2","400","italic"],JOS:["JOS","jost-latin-var.woff2","100 900","normal"],OSW:["OSW","oswald-latin-var.woff2","200 700","normal"],INS:["INS","instrument-serif-latin.woff2","400","normal"],INSi:["INS","instrument-serif-italic-latin.woff2","400","italic"],TEN:["TEN","tenor-sans-latin.woff2","400","normal"]};
const WB_UR="U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+20AC,U+2122,U+2212,U+FEFF,U+FFFD";
const wbFontCss=keys=>keys.map(k=>{const [f,u,w,s]=WB_FONTS[k];return `@font-face{font-family:"${f}";src:url(/fonts/${u}) format("woff2");font-weight:${w};font-style:${s};font-display:swap;unicode-range:${WB_UR}}`}).join("\n");
// Theme tokens used outside the page itself (share image, theme-color, builder thumbnails). Page CSS / markup live in assets/wedding/wb-themes.js.
const WB_THEME_BASE={
letterpress:{fonts:["BOD","BODi"],paper:"#fbf8f1",desk:"#d3ccbe",ink:"#1e2741",acc:"#1e2741",nm:"BOD",sans:"BOD",up:true,ls:".12em",key:"lp"},
modern:{fonts:["ANT","INT"],paper:"#f0efe9",desk:"#f0efe9",ink:"#0e0e0e",acc:"#d6f450",nm:"ANT",nmW:600,sans:"INT",up:true,ls:"-.02em",key:"md"},
garden:{fonts:["COR","CORi","GIL","TEN"],paper:"#f6f2e7",desk:"#38432f",ink:"#2c3126",acc:"#38432f",nm:"GIL",sans:"TEN",key:"gd"},
bloom:{fonts:["PLA","PLAi","PIN","JOS"],paper:"#fbefec",desk:"#fbefec",ink:"#4a2b3b",acc:"#e8a9b5",nm:"PIN",sans:"JOS",key:"bl"},
postcard:{fonts:["DMS","DMSi","JOS","OSW"],paper:"#f4efe6",desk:"#f4efe6",ink:"#1d2a3a",acc:"#b8402a",nm:"DMS",sans:"OSW",key:"pc"},
gallery:{fonts:["INS","INSi","TEN"],paper:"#ffffff",desk:"#121212",ink:"#121212",acc:"#121212",nm:"INS",sans:"TEN",key:"gl"}
};
const WB_PALETTES={garden:{olive:{paper:"#f5f1e3",desk:"#4f5233",ink:"#2e2f22",acc:"#4f5233"}},modern:{plain:{acc:"#0e0e0e"}}};
// Resolved theme for a profile (old theme values mapped; palette / plain applied).
function wbTheme(p){const n=wbNormTheme(p||{}),b=WB_THEME_BASE[n.layout];const v=n.layout==="garden"&&n.palette==="olive"?WB_PALETTES.garden.olive:n.plain?WB_PALETTES.modern.plain:{};return {...b,...v,...n}}
const WEDDING_THEMES=WB_THEME_BASE;
// Name parts: "A & B" -> ["A","B"]; CJK-aware length estimate drives the per-theme name fitting (CSS var --nl / --na).
function wbNameParts(names){const parts=String(names||"").split(/\s*[&+和]\s*|\s+(?:and|und)\s+/i).map(s=>s.trim()).filter(Boolean);return parts.length===2?parts:[String(names||"").trim()]}
const WB_CJK_RE=/[\u2E80-\u9FFF\uF900-\uFAFF\uFF00-\uFFEF\u3000-\u303F\uAC00-\uD7AF]/;
const wbLen=s=>{let n=0;for(const c of String(s||""))n+=WB_CJK_RE.test(c)?1.8:c===" "?.45:/[mwMW]/.test(c)?1.3:/[iljtfI.,'’]/.test(c)?.55:1;return Math.max(3,Math.round(n*10)/10)};
const wbRom=n=>{let s="";n=+n||0;for(const [v,r] of [[1000,"M"],[900,"CM"],[500,"D"],[400,"CD"],[100,"C"],[90,"XC"],[50,"L"],[40,"XL"],[10,"X"],[9,"IX"],[5,"V"],[4,"IV"],[1,"I"]])while(n>=v){s+=r;n-=v}return s};
// City for postmarks / boarding pass: the last address part without postcode (Chinese: up to the first 市/州/县).
function wbCity(addr){const a=String(addr||"").trim();if(!a)return "";if(WB_CJK_RE.test(a)&&!/[,，]/.test(a)){const m=a.match(/^(.{1,6}?[市州县])/);return m?m[1]:a.slice(0,4)}const seg=a.split(/[,，]/).map(s=>s.replace(/\b[A-Z]{0,2}-?\d{3,6}\b/g,"").trim()).filter(Boolean);return (seg[seg.length-1]||"").slice(0,24)}
const WEDDING_INVITE_I18N={
en:{eyebrow:"Wedding Invitation",scroll:"Scroll to discover",count_title:"Until we say “I do”",count_desc:"We cannot wait to celebrate this day with you.",days:"Days",hours:"Hours",minutes:"Minutes",seconds:"Seconds",schedule:"Wedding schedule",schedule_desc:"A simple guide to the celebration.",join:"Join us here",open_map:"Open map",copy_addr:"Copy address",add_cal:"Add to calendar",share:"Share",moments:"Moments we love",gallery_desc:"Click any photo to view it larger.",gallery_ph:"Upload wedding photos in the editor to replace this placeholder.",rsvp_title:"Will you join us?",rsvp_desc:"Please let us know by replying below.",name:"Your name",guests:"Number of guests",yes:"Joyfully accept",no:"Regretfully decline",dietary:"Dietary note (optional)",send:"Send RSVP",sending:"Sending…",thanks_yes:"Thank you! We can’t wait to celebrate with you.",thanks_no:"Thank you for letting us know — you will be missed.",preview_note:"Preview only — publish the site to collect RSVPs.",err:"Could not send. Please try again.",err_name:"Please enter your name.",err_att:"Please choose yes or no.",open_env:"Tap to open the invitation",skip:"Skip",invited:"You are invited",card:"Invitation card",print:"Print",close:"Close",gift:"Gift",copied:"Address copied",families:"Together with their families",request:"request the pleasure of your company",rsvp_link:"RSVP",contact:"E-mail or phone (optional, lets you update later)",updated:"Your RSVP has been updated.",err_contact:"Please check your e-mail or phone number.",err_rate:"Too many attempts. Please try again in a few minutes.",err_offline:"You seem to be offline. Please check your connection and try again.",err_long:"Some text is too long. Please shorten it.",ey_count:"Countdown",ey_day:"The Day",ey_venue:"Venue",ey_story:"Our Story",title:"Wedding Invitation",map:"Map",card_short:"Invitation card",share_short:"Share",gcal:"Google Calendar",apple_map:"Apple Maps",amap:"Amap",google_map:"Google Maps",wechat_hint:"WeChat cannot save calendar files. Tap ··· (top right) and choose “Open in browser”, or use the Google Calendar link.",privacy:"Only the couple can see your reply.",scan:"Scan to open the invitation",and:"and",celebrate:"at the celebration of their marriage",invite_celebrate:"invite you to celebrate their marriage",with_love:"With love",cd_in:"In",kindly_reply:"Kindly reply",nav_story:"Story",nav_day:"The day",nav_place:"Place",nav_photos:"Photos",nav_notes:"Notes",nav_reply:"Reply",t_story:"Our story",t_day:"The day",t_place:"The place",t_photos:"Moments",t_notes:"Good to know",t_began:"How it began",getting_married:"are getting married",lbl_date:"Date",lbl_time:"Time",lbl_venue:"Venue",lbl_address:"Address",lbl_place:"Place",lbl_cal:"Calendar",marriage_of:"The marriage of",plate:"Plate",days_to_go:"days to go",chapters:"Chapters",ch_pro:"Prologue",bl_cap:"A love story",bl_begin:"Begin the story",ch1:"Chapter one",ch2:"Chapter two",ch3:"Chapter three",ch4:"Chapter four",ch5:"Chapter five",ch6:"Chapter six",ch_last:"The last chapter",bl_foot:"— to be continued, together —",pc_lede:"are getting married — and would love you to make the trip.",pc_itin:"Itinerary",pc_dest:"Destination",pc_snap:"Snapshots",pc_notes:"Travel notes",pc_letter_sub:"A letter from the two of us",pc_dear:"Dear friends,",pc_pass:"Boarding pass",pc_from:"From",pc_to:"To",pc_home:"HOME",pc_wherever:"wherever you are",pc_passenger:"Passenger",pc_guest:"Our guest",pc_boarding:"Boarding",pc_seat:"Seat",pc_withus:"With us",pc_snap_sub:"Postcards we kept",pc_notes_sub:"Good to know",pc_depart:"Departure in",pc_reply_card:"Reply card",pc_wish:"Wish you were here?",pc_wish_desc:"Tell us who’s coming and anything we should know. We’ll save you a seat.",pc_affix:"Affix stamp",pc_to_fav:"To our favourite people",gl_issue:"The wedding issue",gl_feature:"Feature",gl_agenda:"Agenda",gl_location:"Location",gl_portfolio:"Portfolio",gl_notes:"Notes",gl_back:"Back cover",gl_one:"One reply per invitation",gl_toc:"In this issue",s_spring:"Spring",s_summer:"Summer",s_autumn:"Autumn",s_winter:"Winter",cue_lp:"Lift the cover",cue_md:"Tear the stub",cue_gd:"Pull the twine",cue_bl:"Break the seal",cue_pc:"Open the airmail",cue_gl:"Slide it out",skip_tap:"Tap to skip"},
zh:{eyebrow:"婚礼邀请",scroll:"向下滑动",count_title:"距离我们说“我愿意”",count_desc:"期待与你一起庆祝这一天。",days:"天",hours:"小时",minutes:"分钟",seconds:"秒",schedule:"婚礼流程",schedule_desc:"当天活动安排。",join:"婚礼地点",open_map:"打开地图",copy_addr:"复制地址",add_cal:"加入日历",share:"分享",moments:"我们的故事",gallery_desc:"点击照片可放大查看。",gallery_ph:"在编辑器中上传婚纱照以替换此占位图。",rsvp_title:"你会来参加吗？",rsvp_desc:"请在下方回复是否出席。",name:"您的姓名",guests:"出席人数",yes:"欣然出席",no:"遗憾缺席",dietary:"饮食需求（可选）",send:"提交回复",sending:"提交中…",thanks_yes:"谢谢！期待与你相见。",thanks_no:"谢谢告知，我们会想念你。",preview_note:"当前为预览，发布网站后即可收集回复。",err:"提交失败，请稍后再试。",err_name:"请填写姓名。",err_att:"请选择是否出席。",open_env:"轻触打开请柬",skip:"跳过",invited:"诚挚邀请",card:"邀请卡",print:"打印",close:"关闭",gift:"送上心意",copied:"地址已复制",families:"携双方家人",request:"诚邀您出席我们的婚礼",rsvp_link:"回复",contact:"邮箱或手机（可选，便于之后修改）",updated:"已更新你的回复。",err_contact:"请检查邮箱或手机号码格式。",err_rate:"提交次数过多，请几分钟后再试。",err_offline:"网络似乎已断开，请检查网络后重试。",err_long:"部分内容过长，请缩短后再提交。",ey_count:"倒计时",ey_day:"当天流程",ey_venue:"地点",ey_story:"我们的故事",title:"婚礼邀请",map:"地图",card_short:"邀请卡",share_short:"分享",gcal:"Google 日历",apple_map:"Apple 地图",amap:"高德地图",google_map:"Google 地图",wechat_hint:"微信内无法保存日历文件。请点击右上角“···”选择“在浏览器打开”后再加入日历。",privacy:"你的回复只有新人可见。",scan:"扫码打开电子请柬",and:"与",celebrate:"共同见证我们的婚礼",invite_celebrate:"诚邀您共同见证我们的婚礼",with_love:"满怀爱意",cd_in:"还有",kindly_reply:"敬请回复",nav_story:"故事",nav_day:"流程",nav_place:"地点",nav_photos:"相册",nav_notes:"须知",nav_reply:"回复",t_story:"我们的故事",t_day:"婚礼当天",t_place:"婚礼地点",t_photos:"美好瞬间",t_notes:"温馨提示",t_began:"故事的开始",getting_married:"要结婚啦",lbl_date:"日期",lbl_time:"时间",lbl_venue:"场地",lbl_address:"地址",lbl_place:"地点",lbl_cal:"日历",marriage_of:"诚邀您参加婚礼",plate:"图版",days_to_go:"天后相见",chapters:"章节",ch_pro:"序章",bl_cap:"一段爱的故事",bl_begin:"翻开故事",ch1:"第一章",ch2:"第二章",ch3:"第三章",ch4:"第四章",ch5:"第五章",ch6:"第六章",ch_last:"最后一章",bl_foot:"— 未完待续，携手同行 —",pc_lede:"要结婚啦——诚邀你踏上这趟旅程，与我们相聚。",pc_itin:"行程",pc_dest:"目的地",pc_snap:"旅途剪影",pc_notes:"旅行须知",pc_letter_sub:"我们写给你的一封信",pc_dear:"亲爱的朋友：",pc_pass:"登机牌",pc_from:"出发",pc_to:"到达",pc_home:"家",pc_wherever:"无论你在哪里",pc_passenger:"乘客",pc_guest:"我们的宾客",pc_boarding:"登机",pc_seat:"座位",pc_withus:"在我们身边",pc_snap_sub:"珍藏的明信片",pc_notes_sub:"出行前请看",pc_depart:"距离出发",pc_reply_card:"回执卡",pc_wish:"期待你的到来",pc_wish_desc:"告诉我们谁会来、有什么需要提前知道的，我们会为你留好座位。",pc_affix:"贴邮票处",pc_to_fav:"致我们最爱的人",gl_issue:"婚礼特刊",gl_feature:"专题",gl_agenda:"日程",gl_location:"地点",gl_portfolio:"影像",gl_notes:"须知",gl_back:"封底",gl_one:"每份请柬回复一次即可",gl_toc:"本期目录",s_spring:"春",s_summer:"夏",s_autumn:"秋",s_winter:"冬",cue_lp:"掀开封面",cue_md:"撕开票根",cue_gd:"解开麻绳",cue_bl:"揭开火漆",cue_pc:"拆开航空信",cue_gl:"抽出杂志",skip_tap:"轻触跳过"},
de:{eyebrow:"Hochzeitseinladung",scroll:"Nach unten scrollen",count_title:"Bis wir „Ja“ sagen",count_desc:"Wir freuen uns darauf, diesen Tag mit euch zu feiern.",days:"Tage",hours:"Stunden",minutes:"Minuten",seconds:"Sekunden",schedule:"Tagesablauf",schedule_desc:"Ein kurzer Überblick über unseren Hochzeitstag.",join:"Hier feiern wir",open_map:"Karte öffnen",copy_addr:"Adresse kopieren",add_cal:"In Kalender",share:"Teilen",moments:"Unsere Geschichte",gallery_desc:"Klickt auf ein Foto, um es größer anzusehen.",gallery_ph:"Ladet im Editor Hochzeitsfotos hoch, um diesen Platzhalter zu ersetzen.",rsvp_title:"Seid ihr dabei?",rsvp_desc:"Bitte gebt uns unten Bescheid.",name:"Euer Name",guests:"Anzahl Gäste",yes:"Wir kommen gern",no:"Leider nicht",dietary:"Ernährungshinweis (optional)",send:"Antwort senden",sending:"Wird gesendet…",thanks_yes:"Danke! Wir freuen uns auf euch.",thanks_no:"Danke für die Rückmeldung – ihr werdet uns fehlen.",preview_note:"Nur Vorschau – veröffentlicht die Seite, um Antworten zu sammeln.",err:"Senden fehlgeschlagen. Bitte erneut versuchen.",err_name:"Bitte Namen eingeben.",err_att:"Bitte Ja oder Nein wählen.",open_env:"Tippen, um die Einladung zu öffnen",skip:"Überspringen",invited:"Ihr seid eingeladen",card:"Einladungskarte",print:"Drucken",close:"Schließen",gift:"Geschenk",copied:"Adresse kopiert",families:"Gemeinsam mit unseren Familien",request:"laden wir euch herzlich zu unserer Hochzeit ein",rsvp_link:"Antworten",contact:"E-Mail oder Telefon (optional, für spätere Änderungen)",updated:"Eure Antwort wurde aktualisiert.",err_contact:"Bitte E-Mail oder Telefonnummer prüfen.",err_rate:"Zu viele Versuche. Bitte in ein paar Minuten erneut versuchen.",err_offline:"Keine Internetverbindung. Bitte Verbindung prüfen und erneut senden.",err_long:"Ein Text ist zu lang. Bitte kürzen.",ey_count:"Countdown",ey_day:"Der Tag",ey_venue:"Ort",ey_story:"Unsere Geschichte",title:"Hochzeitseinladung",map:"Karte",card_short:"Einladungskarte",share_short:"Teilen",gcal:"Google Kalender",apple_map:"Apple Karten",amap:"Amap",google_map:"Google Maps",wechat_hint:"In WeChat können keine Kalenderdateien gespeichert werden. Tippt oben rechts auf ··· und wählt „Im Browser öffnen“ oder nutzt den Google-Kalender-Link.",privacy:"Eure Antwort sehen nur wir als Brautpaar.",scan:"Scannen, um die Einladung zu öffnen",and:"und",celebrate:"zur Feier ihrer Hochzeit",invite_celebrate:"laden euch herzlich zu ihrer Hochzeit ein",with_love:"In Liebe",cd_in:"Noch",kindly_reply:"Um Antwort wird gebeten",nav_story:"Geschichte",nav_day:"Der Tag",nav_place:"Ort",nav_photos:"Fotos",nav_notes:"Hinweise",nav_reply:"Antwort",t_story:"Unsere Geschichte",t_day:"Der Tag",t_place:"Der Ort",t_photos:"Momente",t_notes:"Gut zu wissen",t_began:"Wie alles begann",getting_married:"heiraten",lbl_date:"Datum",lbl_time:"Zeit",lbl_venue:"Ort",lbl_address:"Adresse",lbl_place:"Ort",lbl_cal:"Kalender",marriage_of:"Die Hochzeit von",plate:"Tafel",days_to_go:"Tage noch",chapters:"Kapitel",ch_pro:"Prolog",bl_cap:"Eine Liebesgeschichte",bl_begin:"Die Geschichte beginnt",ch1:"Kapitel eins",ch2:"Kapitel zwei",ch3:"Kapitel drei",ch4:"Kapitel vier",ch5:"Kapitel fünf",ch6:"Kapitel sechs",ch_last:"Das letzte Kapitel",bl_foot:"— Fortsetzung folgt, gemeinsam —",pc_lede:"heiraten — und würden sich freuen, wenn ihr die Reise auf euch nehmt.",pc_itin:"Reiseplan",pc_dest:"Reiseziel",pc_snap:"Schnappschüsse",pc_notes:"Reisehinweise",pc_letter_sub:"Ein Brief von uns beiden",pc_dear:"Liebe Freunde,",pc_pass:"Bordkarte",pc_from:"Von",pc_to:"Nach",pc_home:"DAHEIM",pc_wherever:"wo immer ihr seid",pc_passenger:"Passagier",pc_guest:"Unser Gast",pc_boarding:"Boarding",pc_seat:"Platz",pc_withus:"Bei uns",pc_snap_sub:"Postkarten, die wir behalten haben",pc_notes_sub:"Gut zu wissen",pc_depart:"Abflug in",pc_reply_card:"Antwortkarte",pc_wish:"Seid ihr dabei?",pc_wish_desc:"Sagt uns, wer kommt und was wir wissen sollten. Wir halten euch einen Platz frei.",pc_affix:"Bitte frankieren",pc_to_fav:"An unsere Lieblingsmenschen",gl_issue:"Die Hochzeitsausgabe",gl_feature:"Reportage",gl_agenda:"Programm",gl_location:"Ort",gl_portfolio:"Portfolio",gl_notes:"Hinweise",gl_back:"Rückseite",gl_one:"Eine Antwort pro Einladung",gl_toc:"In dieser Ausgabe",s_spring:"Frühling",s_summer:"Sommer",s_autumn:"Herbst",s_winter:"Winter",cue_lp:"Deckblatt anheben",cue_md:"Abschnitt abreißen",cue_gd:"Schnur lösen",cue_bl:"Siegel brechen",cue_pc:"Luftpost öffnen",cue_gl:"Herausziehen",skip_tap:"Tippen zum Überspringen"}
};
function weddingInitials(names){const parts=String(names||"").split(/\s*[&+和]\s*|\s+(?:and|und)\s+/i).filter(Boolean);return (parts.slice(0,2).map(x=>[...x.trim()][0]||"").join("&")||"♥").toUpperCase()}
// Content model shared by all six themes: every section is optional and only drawn when it has content.
function wbData(p,lang,opts){
  const F0=p.features||{};
  const F={countdown:!!F0.countdown,timeline:!!F0.timeline,map:!!F0.map,gallery:!!F0.gallery,rsvp:!!F0.rsvp,share:!!F0.share,calendar:!!F0.calendar,addressCopy:!!F0.addressCopy,card:F0.card!==false,envelope:F0.envelope!==false};
  const names=String(p.names||"").trim(),n=wbNameParts(names),two=n.length===2;
  const hasDate=/^\d{4}-\d{2}-\d{2}$/.test(p.date||"")&&!isNaN(new Date(p.date+"T12:00:00"));
  const [Y,Mo,Dd]=hasDate?p.date.split("-"):["","",""];
  const ini=weddingInitials(names),firsts=n.map(x=>([...x.trim()][0]||"").toUpperCase()).filter(Boolean);
  const venue=String(p.venue||"").trim(),address=String(p.address||"").trim(),city=wbCity(address);
  const latin=s=>s.normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^A-Za-z]/g,"");
  const story=String(p.intro||"").split(/\n+/).map(s=>s.trim()).filter(Boolean);
  const det=String(p.note||"").split(/\n+/).map(s=>s.trim()).filter(Boolean).map(l=>{const m=l.match(/^([^:：]{1,32})[:：]\s*(.+)$/);return m?[m[1].trim(),m[2].trim()]:["",l]});
  const sched=(p.schedule||[]).filter(x=>x&&(x.time||x.title)).map(x=>({time:String(x.time||""),title:String(x.title||""),desc:String(x.desc||"")}));
  const photos=[...new Set([p.heroPhoto,...(p.gallery||[])].filter(x=>typeof x==="string"&&x))];
  const m=+Mo;
  return {lang,names,n,two,ini,ini2:ini.replace("&",""),mono:firsts.join("·")||"♥",cjk:WB_CJK_RE.test(names),
    yr:Y,dd:Dd,mm:Mo,dot:hasDate?`${Dd}.${Mo}.${Y}`:"",dash:hasDate?`${Dd}—${Mo}—${Y.slice(2)}`:"",
    romanDate:hasDate?`${wbRom(Dd)} · ${wbRom(Mo)} · ${wbRom(Y)}`:"",romanShort:hasDate?`${wbRom(Dd)} · ${wbRom(Mo)} · ${Y.slice(2)}`:"",
    season:hasDate?(m>=3&&m<=5?"s_spring":m<=8&&m>=6?"s_summer":m>=9&&m<=11?"s_autumn":"s_winter"):"",
    hasDate,time:String(p.time||""),venue,address,place:venue||address,city,story,sched,det,photos,F,cd:F.countdown&&hasDate,
    pmCity:(city?(WB_CJK_RE.test(city)?city:city.toUpperCase()):ini).slice(0,18),pmDate:hasDate?`${+Dd}·${wbRom(Mo)}·${Y.slice(2)}`:"♥",
    flight:(latin(ini).slice(0,2)||"AN")+" "+(hasDate?Mo+Dd:"0001"),toCode:city?(WB_CJK_RE.test(city)?city.slice(0,4):(latin(city).slice(0,3).toUpperCase()||"I DO")):"I DO",
    nl:Math.max(...n.map(wbLen)),na:wbLen(names),preview:!!opts.preview};
}
// Lazily loaded theme module (page architectures, envelopes, cards): /assets/wedding/wb-themes.js.
let wbThemesP=null;
function wbThemesReady(){if(window.WBT)return Promise.resolve(window.WBT);return wbThemesP||(wbThemesP=new Promise((res,rej)=>{const s=document.createElement("script");s.src=(location.protocol==="file:"?"":"/")+"assets/wedding/wb-themes.js?v=30.1";s.onload=()=>window.WBT?res(window.WBT):rej(new Error("wbt"));s.onerror=()=>{wbThemesP=null;s.remove();rej(new Error("wbt"))};document.head.appendChild(s)}))}
const WB_PRINT={letterpress:[0,.958],modern:[0,.958],garden:[1,.93],bloom:[0,.998],postcard:[1,.93],gallery:[0,.998]}; // [landscape, zoom to 127×178 mm]
function buildWeddingSite(p,opts={}){
  const WBT=window.WBT;if(!WBT)throw new Error("wedding themes not loaded");
  const e=escapeSiteText;
  const T=wbTheme(p),layout=T.layout;
  const lang=["zh","en","de"].includes(p.lang)?p.lang:"en";
  const D=wbData(p,lang,opts),F=D.F,L=WEDDING_INVITE_I18N[lang],tt=k=>L[k]??WEDDING_INVITE_I18N.en[k]??k;
  const dateIso=(D.hasDate?p.date:"2027-06-18")+"T"+(/^\d{2}:\d{2}$/.test(p.time||"")?p.time:"15:00")+":00";
  const loc=l=>l==="zh"?"zh-CN":l==="de"?"de-CH":"en-US",DF={long:{weekday:"long",year:"numeric",month:"long",day:"numeric"},nowk:{year:"numeric",month:"long",day:"numeric"},wk:{weekday:"long"}};
  const fmt=f=>D.hasDate?new Date(p.date+"T12:00:00").toLocaleDateString(loc(lang),DF[f]||DF.long):"";
  const readable=fmt("long");
  const mapQ=encodeURIComponent([p.venue,p.address].filter(Boolean).join(", ")||p.address||p.venue||"");
  const mapLinks={google:"https://www.google.com/maps/search/?api=1&query="+mapQ,apple:"https://maps.apple.com/?q="+mapQ,amap:"https://uri.amap.com/search?keyword="+mapQ+"&src=wedding-site&callnative=1"};
  // Chinese guests: Amap first (Google Maps is unreachable in mainland China); a custom link always wins.
  const mapUrl=p.mapUrl || (lang==="zh"?mapLinks.amap:mapLinks.google);
  const mapAlt=[["google","google_map"],["apple","apple_map"],["amap","amap"]].filter(([k])=>p.mapUrl||mapLinks[k]!==mapUrl);
  const calendarStart=dateIso.slice(0,10).replaceAll("-","")+"T"+dateIso.slice(11,16).replace(":","")+"00";
  const calendarEnd=dateIso.slice(0,10).replaceAll("-","")+"T235900";
  const gcalUrl="https://calendar.google.com/calendar/render?action=TEMPLATE&text="+encodeURIComponent((p.names||"")+" — "+WEDDING_INVITE_I18N[lang].title)+"&dates="+calendarStart+"/"+calendarEnd+"&location="+mapQ;
  D.mapUrl=mapUrl;
  const desc=[readable,p.venue,p.address].filter(Boolean).join(" · ");
  const rsvpMode=["builtin","email","link"].includes(p.rsvpMode)?p.rsvpMode:(p.rsvpUrl?"link":"builtin");
  const giftUrl=/^https:\/\/[^\s"'<>]+$/i.test(p.giftUrl||"")?p.giftUrl:"";
  const accent=/^#[0-9a-fA-F]{6}$/.test(p.accent||"")?p.accent:"";
  const W=k=>`<w-t data-wi="${k}">${e(tt(k))}</w-t>`; // inline custom element: theme "x span" rules never hit translated text
  const js=v=>JSON.stringify(v).replace(/</g,"\\u003c");
  const showEnvelope=F.envelope&&!opts.skipEnvelope;
  const gift=giftUrl?`<div class="rs-more"><a href="${e(giftUrl)}" target="_blank" rel="noopener">${W("gift")} ↗</a></div>`:"";
  const rsvpForm=()=>rsvpMode==="link"
    ?`<div class="rs rs-link"><button type="button" onclick="sendRSVP()">${W("rsvp_link")} ↗</button>${gift}<p class="privacy">${W("privacy")}</p></div>`
    :`<form class="rs" id="rsvpForm" onsubmit="return sendRSVP(event)" novalidate>
<label><span>${W("name")}</span><input id="rName" name="name" maxlength="80" autocomplete="name" required/></label>
<label><span>${W("contact")}</span><input id="rContact" name="contact" maxlength="120" autocomplete="email"/></label>
<div class="att" role="radiogroup"><label><input type="radio" name="attending" value="yes" checked/><span>${W("yes")}</span></label><label><input type="radio" name="attending" value="no"/><span>${W("no")}</span></label></div>
<div class="two"><label id="rPartyWrap"><span>${W("guests")}</span><select id="rGuests" name="party_size">${[1,2,3,4,5,6,7,8,9,10].map(n=>`<option>${n}</option>`).join("")}</select></label><label><span>${W("dietary")}</span><input id="rDiet" name="dietary" maxlength="300"/></label></div>
<input class="hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true"/>
<button id="rSend" type="submit">${W("send")}</button>${gift}
<p class="rsvp-msg" id="rMsg" role="status" aria-live="polite"></p><p class="privacy">${W("privacy")}</p></form>`;
  const tools=({a,b,only})=>{let s="";
    if(only!=="cal"){if(F.map&&D.place)s+=`<a class="${a}" href="${e(mapUrl)}" target="_blank" rel="noopener">${W("open_map")} ↗</a>`+mapAlt.map(([k,t])=>`<a class="${b} alt" href="${e(mapLinks[k])}" target="_blank" rel="noopener">${W(t)}</a>`).join("");
      if(F.addressCopy&&p.address)s+=`<button type="button" class="${b}" onclick="copyAddress()">${W("copy_addr")}</button>`}
    if(F.calendar&&D.hasDate)s+=`<button type="button" class="${only==="cal"?a:b}" onclick="downloadICS()">${W("add_cal")}</button><a class="${b} alt" id="gcalLink" href="${e(gcalUrl)}" target="_blank" rel="noopener">${W("gcal")}</a>`;
    if(only!=="cal"&&F.share)s+=`<button type="button" class="${b}" onclick="shareSite()">${W("share")}</button>`;
    return s+(F.calendar&&D.hasDate?`<p class="wx-hint" id="wxHint" hidden></p>`:"")};
  const H={e,W,t:tt,rsvp:rsvpForm,tools,
    date:f=>`<w-t data-wdate="${f}">${e(fmt(f))}</w-t>`,
    cd:(u,pad)=>`<w-t data-cd="${u}"${pad?` data-pad="${pad}"`:""}>--</w-t>`,
    cta:cls=>{const x=(F.rsvp?`<a class="${cls}" href="#rsvp">${W("rsvp_link")}</a>`:"")+(F.card?`<button type="button" class="${cls}" onclick="openCard()">${W("card")}</button>`:"");return x?`<div class="wb-cta">${x}</div>`:""},
    qr:`<div class="ic-qr"><div class="qr" id="cardQr" role="img" aria-label="${e(tt("scan"))}"></div><div class="url" id="cardUrl"></div></div>`};
  // Page first (resets per-page SVG ids), then envelope and card.
  const page=WBT.page(layout,D,H),envHtml=showEnvelope?WBT.env(layout,D,H):"",cardHtml=F.card?WBT.card(layout,D,H):"";
  const [land,pz]=WB_PRINT[layout];
  const vars=[`--nl:${D.nl}`,`--na:${D.na}`,`--pz:${pz}`];
  if(accent&&p.accentCustom&&!T.plain){if(layout==="modern")vars.push(`--lime:${accent}`);if(layout==="bloom")vars.push(`--pink:${accent}`);if(layout==="postcard")vars.push(`--red:${accent}`)}
  const bodyCls=["t-"+T.key,T.plain?"plain":"",T.palette==="olive"?"olive":"",D.cjk?"cjk":"","l-"+lang].filter(Boolean).join(" ");
  return `<!doctype html>
<html lang="${lang==="zh"?"zh-CN":lang}">
<head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${e(p.names)} — ${e(WEDDING_INVITE_I18N[lang].title)}</title>
<meta name="description" content="${e(desc)}"/>
<meta property="og:type" content="website"/><meta property="og:title" content="${e(p.names)} — ${e(WEDDING_INVITE_I18N[lang].title)}"/><meta property="og:description" content="${e(desc)}"/>
<meta property="og:url" content="__POD_PAGE_URL__"/><meta property="og:image" content="__POD_OG_IMAGE__"/><meta property="og:image:width" content="1200"/><meta property="og:image:height" content="630"/>
<meta name="robots" content="noindex,nofollow"/><meta name="twitter:card" content="summary_large_image"/><meta name="theme-color" content="${T.desk}"/>
<style>
${wbFontCss(T.fonts)}
${WBT.css(layout,{env:showEnvelope})}
@media print{@page{size:${land?"178mm 127mm":"127mm 178mm"};margin:0}}
</style>
<script>if(!matchMedia("(prefers-reduced-motion: reduce)").matches&&"IntersectionObserver" in window)document.documentElement.classList.add("mo")<\/script>
<link rel="stylesheet" href="mobile.css"></head>
<body class="${bodyCls}" style="${vars.join(";")}">
${showEnvelope?`<div class="env" id="env" role="button" tabindex="0" aria-label="${e(tt("open_env"))}">${envHtml}</div>`:""}
<div class="invite-lang" role="group" aria-label="Language"><button type="button" data-invite-lang="zh" lang="zh">中</button><button type="button" data-invite-lang="en" lang="en">EN</button><button type="button" data-invite-lang="de" lang="de">DE</button></div>
${page}
<div class="floating top" id="floatDock">
  ${F.map&&D.place?`<a href="${e(mapUrl)}" target="_blank" rel="noopener" title="${e(tt("map"))}" aria-label="${e(tt("map"))}" data-wi-label="map">⌖</a>`:""}
  ${F.rsvp?`<a href="#rsvp" title="RSVP" aria-label="RSVP">R</a>`:""}
  ${F.card?`<button type="button" onclick="openCard()" title="${e(tt("card_short"))}" aria-label="${e(tt("card_short"))}" data-wi-label="card_short">✉</button>`:""}
  ${F.share?`<button type="button" onclick="shareSite()" title="${e(tt("share_short"))}" aria-label="${e(tt("share_short"))}" data-wi-label="share_short">↗</button>`:""}
</div>
${F.card?`<div class="cardview" id="cardView" onclick="if(event.target===this)closeCard()"><div class="card-wrap">${cardHtml}<div class="card-actions"><button type="button" onclick="printCard()">${W("print")}</button><button type="button" onclick="closeCard()">${W("close")}</button></div></div></div>`:""}
<div class="lightbox" id="photoLightbox" onclick="this.classList.remove('open')"><img id="photoLightboxImage" alt=""/></div>
<script>
const M=${js(WEDDING_INVITE_I18N)},DATE_ISO=${js(dateIso)},HAS_DATE=${D.hasDate?"true":"false"},INVITE_ID="__POD_INVITE_ID__",API_BASE="__POD_API_BASE__",LIVE=/^[a-f0-9]{12}$/.test(INVITE_ID),PREVIEW=${opts.preview?"true":"false"},ENV_MS=${WBT.TOT[layout]};
${F.card&&typeof podQr==="function"?podQr.toString()+"\n"+podQrSvg.toString()+"\n":""}const RSVP_MODE=${js(rsvpMode)},RSVP_EMAIL=${js(p.rsvpEmail||"")},RSVP_URL=${js(p.rsvpUrl||"")};
let L=${js(lang)};const NAMES=${js(p.names||"")};
function tt(k){return (M[L]&&M[L][k])||M.en[k]||k}
const DF={long:{weekday:"long",year:"numeric",month:"long",day:"numeric"},nowk:{year:"numeric",month:"long",day:"numeric"},wk:{weekday:"long"}};
function setInviteLang(l){if(!M[l])l="en";L=l;document.documentElement.lang=l==="zh"?"zh-CN":l;document.body.classList.remove("l-zh","l-en","l-de");document.body.classList.add("l-"+l);document.title=NAMES+" — "+M[l].title;document.querySelectorAll("[data-wi]").forEach(e=>{const k=e.dataset.wi;if(M[l][k])e.textContent=M[l][k]});document.querySelectorAll("[data-wi-placeholder]").forEach(e=>{const k=e.dataset.wiPlaceholder;if(M[l][k])e.placeholder=M[l][k]});const d=new Date(DATE_ISO.slice(0,10)+"T12:00:00");if(HAS_DATE&&!isNaN(d)){const loc=l==="zh"?"zh-CN":l==="de"?"de-CH":"en-US";document.querySelectorAll("[data-wdate]").forEach(e=>e.textContent=d.toLocaleDateString(loc,DF[e.dataset.wdate]||DF.long))}document.querySelectorAll("[data-wi-label]").forEach(e=>{const k=e.dataset.wiLabel;if(M[l][k]){e.title=M[l][k];e.setAttribute("aria-label",M[l][k])}});document.querySelectorAll("[data-invite-lang]").forEach(b=>b.classList.toggle("active",b.dataset.inviteLang===l))}
{const fd=document.getElementById("floatDock");const sy=()=>fd&&fd.classList.toggle("top",scrollY<innerHeight*.5);addEventListener("scroll",sy,{passive:true});sy()}
const Q=new URLSearchParams(location.search);
document.querySelectorAll("[data-invite-lang]").forEach(b=>b.onclick=()=>setInviteLang(b.dataset.inviteLang));setInviteLang(M[Q.get("lang")]?Q.get("lang"):L);
// Envelope: first tap plays the theme's opening (CSS keyframes, transform/opacity only), a second tap skips; Esc closes; reduced motion = short fade.
const env=document.getElementById("env"),HS=()=>document.documentElement.classList.add("hs");if(!env)HS();
if(env){const s=env.querySelector(".env2"),RM=matchMedia("(prefers-reduced-motion: reduce)").matches;let tm=0;document.documentElement.classList.add("envon");
 const done=()=>{clearTimeout(tm);HS();document.documentElement.classList.remove("envon");env.classList.add("gone");setTimeout(()=>env.remove(),RM?0:380)};
 const open=()=>{if(s.classList.contains("open")){s.classList.add("skip");done();return}s.classList.add("open");tm=setTimeout(done,RM?480:ENV_MS+60)};
 if(Q.has("open")||Q.has("card")||location.hash==="#open"){env.remove();document.documentElement.classList.remove("envon");HS()} // ?card=1 (print link) goes straight to the card
 else{env.addEventListener("click",open);env.addEventListener("keydown",ev=>{if(ev.key==="Enter"||ev.key===" "){ev.preventDefault();open()}else if(ev.key==="Escape")done()});env.focus({preventScroll:true})}}
// Reveal on scroll (IntersectionObserver, transform/opacity). Reduced motion: everything static.
if(document.documentElement.classList.contains("mo")){const io=new IntersectionObserver(es=>es.forEach(x=>{if(x.isIntersecting){x.target.classList.add("in");io.unobserve(x.target)}}),{rootMargin:"0px 0px -6% 0px",threshold:.06});document.querySelectorAll(".rv").forEach(el=>io.observe(el))}
// Section index (sidebar / dots / nav) follows the scroll position.
{const links=[...document.querySelectorAll("[data-to]")];if(links.length&&"IntersectionObserver" in window){const io=new IntersectionObserver(es=>es.forEach(x=>{if(x.isIntersecting)links.forEach(a=>a.classList.toggle("on",a.dataset.to===x.target.id))}),{rootMargin:"-45% 0px -50% 0px"});new Set(links.map(a=>a.dataset.to)).forEach(id=>{const s=document.getElementById(id);if(s)io.observe(s)})}}
const gallery=${js(D.photos)};
function openLightbox(i){if(!gallery[i])return;document.getElementById("photoLightboxImage").src=gallery[i];document.getElementById("photoLightbox").classList.add("open")}
document.addEventListener("click",ev=>{const t=ev.target.closest&&ev.target.closest("[data-lb]");if(t)openLightbox(+t.dataset.lb)});
function copyAddress(){navigator.clipboard?.writeText(${js(p.address||"")}).catch(()=>{});alert(tt("copied"))}
function shareSite(){if(navigator.share)navigator.share({title:${js((p.names||"")+" Wedding")},url:location.href}).catch(()=>{});else navigator.clipboard?.writeText(location.href).catch(()=>{})}
function downloadICS(){
  // WeChat's in-app browser cannot save .ics files: explain how to open in the system browser instead.
  if(/MicroMessenger/i.test(navigator.userAgent)){const h=document.getElementById("wxHint");if(h){h.hidden=false;h.textContent=tt("wechat_hint")}else alert(tt("wechat_hint"));return}
  const esc=s=>String(s||"").replace(/\\\\/g,"\\\\\\\\").replace(/[,;]/g,m=>"\\\\"+m).replace(/\\r?\\n/g," ");
  const stamp=new Date().toISOString().replace(/[-:]/g,"").replace(/\\.\\d+/,"");
  const url=LIVE?location.href.split(/[?#]/)[0]:"";
  const ics=["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//POD Studio//Wedding Site//EN","CALSCALE:GREGORIAN","BEGIN:VEVENT","UID:"+(LIVE?INVITE_ID:"wedding-"+DATE_ISO.replace(/\\D/g,""))+"@wedding-site","DTSTAMP:"+stamp,"DTSTART:${calendarStart}","DTEND:${calendarEnd}","SUMMARY:"+esc(NAMES+" — "+tt("title")),"LOCATION:"+esc(${js([p.venue,p.address].filter(Boolean).join(", "))}),url?"URL:"+url:"",url?"DESCRIPTION:"+esc(url):"","END:VEVENT","END:VCALENDAR"].filter(Boolean).join("\\r\\n")+"\\r\\n";
  const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([ics],{type:"text/calendar;charset=utf-8"}));a.download="wedding.ics";document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1500)
}
function fitCard(){const ic=document.querySelector("#cardView .ic");if(!ic)return;ic.style.zoom="";const r=ic.getBoundingClientRect(),k=Math.min(1,(innerWidth-28)/r.width,(innerHeight-96)/r.height);if(k<1)ic.style.zoom=k.toFixed(3)}
function openCard(){const c=document.getElementById("cardView");if(!c)return;const u=document.getElementById("cardUrl"),link=LIVE?location.href.split(/[?#]/)[0]:"";if(u)u.textContent=link;const q=document.getElementById("cardQr");if(q&&link&&!q.innerHTML&&typeof podQrSvg==="function"){try{q.innerHTML=podQrSvg(link,getComputedStyle(q).color)}catch(e){}}c.classList.add("open");fitCard()}
addEventListener("resize",()=>{if(document.getElementById("cardView")?.classList.contains("open"))fitCard()});
function closeCard(){document.getElementById("cardView")?.classList.remove("open")}
function printCard(){document.body.classList.add("printing");setTimeout(()=>{window.print();document.body.classList.remove("printing")},50)}
if(Q.has("card"))openCard();
const form=document.getElementById("rsvpForm");
if(form){const sync=()=>document.getElementById("rPartyWrap").classList.toggle("off",form.elements.attending.value==="no");form.querySelectorAll("[name=attending]").forEach(r=>r.onchange=sync);sync()}
function rsvpMsg(t,ok){const m=document.getElementById("rMsg");if(m){m.textContent=t;m.className="rsvp-msg"+(ok?" ok":"")}}
async function sendRSVP(ev){
  ev&&ev.preventDefault();
  if(RSVP_MODE==="link"){if(RSVP_URL)window.open(RSVP_URL,"_blank","noopener");return false}
  const F_=form.elements,name=(F_.namedItem("name").value||"").trim(),attending=form.elements.attending.value,party=attending==="yes"?Number(F_.namedItem("party_size").value||1):0,dietary=(F_.namedItem("dietary").value||"").trim(),contact=(F_.namedItem("contact")?.value||"").trim();
  if(!name){rsvpMsg(tt("err_name"));F_.namedItem("name").focus();return false}
  if(attending!=="yes"&&attending!=="no"){rsvpMsg(tt("err_att"));return false}
  if(RSVP_MODE==="email"||(!LIVE&&RSVP_EMAIL&&!PREVIEW)){
    if(RSVP_EMAIL)location.href="mailto:"+encodeURIComponent(RSVP_EMAIL)+"?subject="+encodeURIComponent("Wedding RSVP — "+name)+"&body="+encodeURIComponent("Name: "+name+"\\nAttending: "+attending+"\\nGuests: "+party+"\\nDietary: "+dietary);
    return false}
  if(!LIVE){form.querySelectorAll("input,select,button").forEach(x=>x.disabled=true);rsvpMsg(tt(attending==="yes"?"thanks_yes":"thanks_no")+" ("+tt("preview_note")+")",true);return false}
  const btn=document.getElementById("rSend");btn.disabled=true;btn.textContent=tt("sending");
  try{
    const r=await fetch((/^https?:/.test(API_BASE)?API_BASE:"")+"/api/invitations/"+INVITE_ID+"/rsvp",{method:"POST",headers:{"Content-Type":"text/plain"},body:JSON.stringify({name,attending,party_size:party,dietary,contact,website:F_.namedItem("website").value})});
    const res=await r.json().catch(()=>({}));if(!r.ok){const c=res.error||"";const k=r.status===429?"err_rate":c==="invalid_contact"?"err_contact":c==="name_required"?"err_name":c==="attending_required"?"err_att":/too_long/.test(c)||r.status===413?"err_long":"err";const er=new Error(k);er.k=k;throw er}
    form.querySelectorAll("label,.att,.two,button,.rs-more").forEach(x=>x.style.display="none");rsvpMsg((res.updated?tt("updated")+" ":"")+tt(attending==="yes"?"thanks_yes":"thanks_no"),true);
  }catch(e){btn.disabled=false;btn.textContent=tt("send");const k=e.k||(navigator.onLine===false||e instanceof TypeError?"err_offline":"err");rsvpMsg(tt(k));if(k==="err_contact")F_.namedItem("contact").focus()}
  return false
}
${D.cd?`{const cds=[...document.querySelectorAll("[data-cd]")];const tick=()=>{const v=Math.max(0,new Date(DATE_ISO).getTime()-Date.now()),x={d:Math.floor(v/86400000),h:Math.floor(v/3600000)%24,m:Math.floor(v/60000)%60,s:Math.floor(v/1000)%60};cds.forEach(el=>{const n=String(x[el.dataset.cd]);el.textContent=el.dataset.pad?n.padStart(+el.dataset.pad,"0"):n})};tick();setInterval(tick,1000)}`:""}
<\/script>
</body></html>`;
}
// Share image (og:image, 1200×630) drawn with the active theme's self-hosted webfonts and palette.
const wbFontsLoaded={};
function wbEnsureFonts(T){
  const keys=(T&&T.fonts)||[];
  return Promise.all(keys.map(k=>wbFontsLoaded[k]||(wbFontsLoaded[k]=(async()=>{try{const [,u,w,st]=WB_FONTS[k];const ff=new FontFace("WBF-"+k,`url(/fonts/${u}) format("woff2")`,{weight:w,style:st,unicodeRange:WB_UR});document.fonts.add(ff);await ff.load()}catch(e){}})())));
}
async function renderWeddingShareCard(p){
  const T=wbTheme(p);await wbEnsureFonts(T);
  const W=1200,H=630,c=document.createElement("canvas");c.width=W;c.height=H;const x=c.getContext("2d");
  const lang=["zh","en","de"].includes(p.lang)?p.lang:"en",L=WEDDING_INVITE_I18N[lang];
  const serif=`"WBF-${T.nm}",${T.layout==="modern"?"Arial Narrow,Arial,sans-serif":"Georgia,serif"}`,sans=`"WBF-${T.sans}",Arial,sans-serif`;
  const ls=v=>{if("letterSpacing" in x)x.letterSpacing=v};
  const dark=T.layout==="garden"||T.layout==="gallery";
  x.fillStyle=dark?T.desk:T.paper;x.fillRect(0,0,W,H);
  const img=[p.heroPhoto,...(p.gallery||[])].find(Boolean);
  let left=W/2,cw=W;
  if(img){try{const im=new Image();im.src=img;await im.decode();const pw=T.layout==="modern"||T.layout==="gallery"?560:500,px=T.layout==="gallery"?W-pw:0;
    const s=Math.max(pw/im.width,H/im.height);x.save();x.beginPath();x.rect(px,0,pw,H);x.clip();x.drawImage(im,px+(pw-im.width*s)/2,(H-im.height*s)/2,im.width*s,im.height*s);x.restore();
    cw=W-pw;left=px?cw/2:pw+cw/2}catch(e){}}
  const ink=dark?"#f3efe4":T.ink;
  if(T.layout==="letterpress"){x.strokeStyle=ink;x.globalAlpha=.5;x.lineWidth=1;x.strokeRect(left-cw/2+26,26,cw-52,H-52);x.globalAlpha=.25;x.strokeRect(left-cw/2+33,33,cw-66,H-66);x.globalAlpha=1}
  if(T.layout==="modern"&&!T.plain){x.fillStyle=/^#[0-9a-fA-F]{6}$/.test(p.accent||"")&&p.accentCustom?p.accent:T.acc;x.fillRect(left-cw/2,H-120,cw,120)}
  if(T.layout==="postcard"){x.fillStyle=T.acc;for(let i=0;i<W;i+=40){x.fillRect(i,0,20,10);x.fillRect(i+20,H-10,20,10)}}
  const d=new Date((p.date||"2027-06-18")+"T12:00:00");const ds=isNaN(d)?(p.date||""):d.toLocaleDateString(lang==="zh"?"zh-CN":lang==="de"?"de-CH":"en-US",{year:"numeric",month:"long",day:"numeric"});
  x.textAlign="center";x.textBaseline="alphabetic";
  x.fillStyle=ink;x.globalAlpha=.75;x.font=`400 18px ${sans}`;ls("6px");x.fillText(L.eyebrow.toUpperCase(),left,170);ls("0px");x.globalAlpha=1;
  const names=T.up?(p.names||"").toUpperCase():(p.names||"");
  x.fillStyle=ink;let size=T.layout==="bloom"?120:T.up?84:96;
  const setF=()=>{x.font=`${T.nmW||400} ${size}px ${serif}`};setF();if(T.up)ls(T.layout==="letterpress"?"6px":"0px");while(x.measureText(names).width>cw-120&&size>34){size-=4;setF()}
  x.fillText(names,left,310);ls("0px");
  x.globalAlpha=.6;x.fillRect(left-40,358,80,1);x.globalAlpha=1;
  x.font=`400 18px ${sans}`;ls("5px");x.fillText([ds,p.time].filter(Boolean).join(" · ").toUpperCase(),left,430);ls("0px");
  x.globalAlpha=.7;x.font=`400 26px ${serif}`;let v=[p.venue,p.address].filter(Boolean).join(" · ");while(x.measureText(v).width>cw-100&&v.length>8)v=v.slice(0,-2);x.fillText(v,left,T.layout==="modern"&&!T.plain?480:485);x.globalAlpha=1;
  return c.toDataURL("image/jpeg",.88);
}
// Client-side photo compression: resize to a max long edge and export WebP (JPEG if the browser cannot encode WebP).
async function wbCompressImage(file,maxEdge){
  if(!/^image\/(jpeg|png|webp|bmp)$/i.test(file.type))return readFileAsDataURL(file);
  try{
    let src;try{src=await createImageBitmap(file,{imageOrientation:"from-image"})}catch(e){const u=URL.createObjectURL(file);src=new Image();src.src=u;await src.decode();URL.revokeObjectURL(u)}
    const w=src.width,h=src.height,k=Math.min(1,maxEdge/Math.max(w,h)),c=document.createElement("canvas");c.width=Math.round(w*k);c.height=Math.round(h*k);
    const x=c.getContext("2d");x.imageSmoothingQuality="high";x.drawImage(src,0,0,c.width,c.height);src.close?.();
    let out=c.toDataURL("image/webp",.8);if(!out.startsWith("data:image/webp"))out=c.toDataURL("image/jpeg",.82);
    return out.length*.75<file.size||k<1?out:readFileAsDataURL(file);
  }catch(e){return readFileAsDataURL(file)}
}
const wbKB=n=>n>1048576?(n/1048576).toFixed(1)+" MB":Math.round(n/1024)+" KB";
// Theme sample photos (repo assets) for the builder preview only; published only if the user clicks "用示例照片发布".
const WB_SAMPLE_PHOTOS={letterpress:"gifts.jpg",modern:"cream.webp",garden:"seasonal.jpg",bloom:"gifts.jpg",postcard:"cream.webp",gallery:"gifts.jpg"};
const wbSampleUrl=layout=>location.origin+"/assets/scenes/"+(WB_SAMPLE_PHOTOS[layout]||"gifts.jpg");
let wbPreviewEnvelopeShown=false;
function refreshWeddingPreview(ev){
  if(!window.WBT){wbThemesReady().then(()=>refreshWeddingPreview(ev)).catch(()=>showToast(wbT("网站模板加载失败，请检查网络后重试")));return}
  const p=wbWithExamples(weddingProfile());
  // Show the envelope intro on the first preview (or when its toggle changes); later edits jump straight to the site.
  const showEnv=!wbPreviewEnvelopeShown||ev?.target?.id==="ftEnvelope";wbPreviewEnvelopeShown=true;
  if(!p.heroPhoto&&document.getElementById("wbSamplePhoto")?.checked)p.heroPhoto=wbSampleUrl(p.layout);
  document.getElementById("builderPreview").srcdoc=buildWeddingSite(p,{preview:true,skipEnvelope:!showEnv});
}
function localizeBuilderOptions(){document.querySelectorAll("#siteBuilder option[data-i18n-opt]").forEach(o=>{o.textContent=window.WeddingI18n?.t?.(o.dataset.i18nOpt)||o.dataset.i18nOpt})}
window.addEventListener("wedding-language-change",localizeBuilderOptions);
// Drops share-image meta when there is no image, then blanks remaining publish placeholders (standalone download).
const wbStripPlaceholders=html=>html.replace(/<meta property="og:image" content="__POD_OG_IMAGE__"\/><meta property="og:image:width" content="1200"\/><meta property="og:image:height" content="630"\/>/,"").replace('content="summary_large_image"','content="summary"').replace(/__POD_[A-Z_]+__/g,"");
// Sample texts follow the guest language; only replaced while the field still holds an untouched sample.
const WB_SAMPLES={
 en:{intro:"With joyful hearts, we invite you to celebrate our wedding with us.",note:"Dress code: Garden formal. Please let us know about dietary requirements in your RSVP.",schedule:"14:30 | Guest Arrival | Welcome drinks & photo time\n15:30 | Ceremony | Wedding vows and ring exchange\n16:30 | Cocktail Hour | Drinks, music and garden photos\n18:00 | Dinner | Dinner and speeches\n20:00 | First Dance | Dance floor opens\n22:30 | Farewell | Thank you for celebrating with us"},
 zh:{intro:"怀着喜悦的心情，诚邀您与我们一起庆祝婚礼。",note:"着装建议：花园正装。如有饮食需求，请在回复中告诉我们。",schedule:"14:30 | 宾客签到 | 迎宾酒与合影\n15:30 | 婚礼仪式 | 宣誓与交换戒指\n16:30 | 鸡尾酒会 | 饮品、音乐与花园合影\n18:00 | 晚宴 | 晚宴与致辞\n20:00 | 第一支舞 | 舞池开放\n22:30 | 送客 | 感谢您的到来"},
 de:{intro:"Voller Freude laden wir euch ein, unsere Hochzeit mit uns zu feiern.",note:"Dresscode: Garden formal. Bitte teilt uns Ernährungswünsche in eurer Antwort mit.",schedule:"14:30 | Ankunft der Gäste | Begrüßungsdrink & Fotos\n15:30 | Trauung | Eheversprechen und Ringtausch\n16:30 | Apéro | Drinks, Musik und Gartenfotos\n18:00 | Abendessen | Essen und Reden\n20:00 | Eröffnungstanz | Die Tanzfläche ist eröffnet\n22:30 | Ausklang | Danke, dass ihr mit uns feiert"}};
// Samples follow the guest language as placeholders; an untouched sample left in a field (older drafts) is cleared so it is never published.
function wbApplySampleLang(){const l=document.getElementById("wbLang").value,t=WB_SAMPLES[l]||WB_SAMPLES.en;
 for(const [k,id] of [["intro","wbIntro"],["note","wbNote"],["schedule","wbSchedule"]]){const el=document.getElementById(id),v=el.value.trim();if(v&&Object.values(WB_SAMPLES).some(x=>x[k].trim()===v))el.value="";el.placeholder=t[k]}}
wbApplySampleLang();
function openWeddingBuilder(opts={}){
  document.getElementById("siteBuilder").classList.add("open");
  localizeBuilderOptions();wbPreviewEnvelopeShown=false;
  document.getElementById("builderSceneLabel").textContent=sceneData[sceneKey]?.name||sceneKey;
  document.getElementById("wbNames").value=deriveCustomizedNames();
  const c=sceneData[sceneKey]?.colors?.[3]||"#9a6d57";
  document.getElementById("wbAccent").value=/^#[0-9a-fA-F]{6}$/.test(c)?c:"#9a6d57";
  const saved=opts.skipDraft?null:localStorage.getItem("podWeddingSiteDraft");
  if(saved){try{const d=JSON.parse(saved);wbApplyProfile(d);if(/^[a-f0-9]{12}$/.test(d.inviteId||"")){wbInviteId=d.inviteId;wbInviteUrl=d.inviteUrl||"/generated/"+d.inviteId+".html"}}catch(e){}}
  wbGo(1);wbRenderCheck();
  refreshWeddingPreview();
}
document.getElementById("weddingSiteBtn").onclick=()=>openWeddingBuilder();
document.getElementById("builderClose").onclick=()=>document.getElementById("siteBuilder").classList.remove("open");
document.getElementById("builderRefresh").onclick=refreshWeddingPreview;
document.getElementById("builderSaveDraft").onclick=()=>{wbSaveDraft();showToast("婚礼网站草稿已保存在浏览器")};
document.getElementById("builderDownload").onclick=async()=>{
  try{await wbThemesReady()}catch(e){showToast(wbT("网站模板加载失败，请检查网络后重试"));return}
  const p=weddingProfile();const html=wbStripPlaceholders(buildWeddingSite(p));
  const blob=new Blob([html],{type:"text/html;charset=utf-8"});const a=document.createElement("a");
  const safe=(p.names||"wedding").replace(/[^a-zA-Z0-9\u4e00-\u9fff]+/g,"_");
  a.href=URL.createObjectURL(blob);a.download=safe+"_wedding_invitation.html";a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1500);
};
// ---- Publish: login required, stable URL (update in place), success card with share + QR ----
let wbInviteId="",wbInviteUrl="";
const wbT=x=>window.WeddingI18n?.t?.(x)||x; // builder UI language (zh/en/de)
const WB_EXAMPLES={names:"Amelia & Noah",venue:"The Garden House",address:"Münsterhof 8, 8001 Zürich",date:"2027-06-18"};
// Preview only: empty key fields show grey example values so the design never looks broken; publishing uses real values.
function wbWithExamples(p){const q={...p};for(const k of Object.keys(WB_EXAMPLES))if(!q[k])q[k]=WB_EXAMPLES[k];
 // Story / notes / schedule samples are textarea placeholders: shown in the preview only, never published.
 const t=WB_SAMPLES[q.lang]||WB_SAMPLES.en;if(!q.intro)q.intro=t.intro;if(!q.note)q.note=t.note;if(!(q.schedule||[]).length)q.schedule=parseSchedule(t.schedule);return q}
const WB_REQUIRED=[["wbNames","新人姓名"],["wbDate","婚礼日期"],["wbVenue","场地名称"]];
function wbMissing(){return WB_REQUIRED.filter(([id])=>!document.getElementById(id).value.trim())}
function wbRenderCheck(){
  const miss=new Set(wbMissing().map(x=>x[0]));const li=WB_REQUIRED.map(([id,t])=>`<li class="${miss.has(id)?"miss":""}" data-fix="${id}">${wbT(t)}${miss.has(id)?wbT("（必填）"):""}</li>`);
  li.push(`<li class="${wbHeroData?"":"miss opt"}" data-fix="wbHeroPhoto">${wbHeroData?wbT("主婚纱照"):wbT("主婚纱照（可选，建议上传）")}</li>`);
  document.getElementById("wbCheck").innerHTML=li.join("");
  document.getElementById("wbPubState").innerHTML=wbInviteId?`${wbT("已发布：")}<a href="${escapeSiteText(wbInviteUrl)}" target="_blank" rel="noopener">${escapeSiteText(location.origin+wbInviteUrl)}</a><br/>${wbT("再次发布会更新同一个链接，已收到的回复会保留。")}`:wbT("发布后会得到一个专属链接，宾客可在线回复 RSVP。发布需要登录，回复只有你能在「我的账户」看到。");
  document.getElementById("builderPublish").textContent=wbInviteId?wbT("更新网站"):wbT("发布网站");
  wbStepBtn();
}
function wbGo(n){
  n=Math.max(1,Math.min(3,n));const c=document.getElementById("wbControls");c.dataset.cur=n;c.scrollTop=0;
  document.querySelectorAll(".wb-steps [data-go]").forEach(b=>{const k=+b.dataset.go;b.classList.toggle("on",k===n);b.classList.toggle("done",k<n);k===n?b.setAttribute("aria-current","step"):b.removeAttribute("aria-current")});
  if(n===3)wbRenderCheck();wbStepBtn();
}
function wbStepBtn(){const n=+document.getElementById("wbControls").dataset.cur;document.getElementById("wbNext").textContent=n<3?wbT("下一步"):wbInviteId?wbT("更新网站"):wbT("发布网站")}
document.querySelectorAll(".wb-steps [data-go]").forEach(b=>b.onclick=()=>wbGo(+b.dataset.go));
document.getElementById("wbBack").onclick=()=>wbGo(+document.getElementById("wbControls").dataset.cur-1);
document.getElementById("wbNext").onclick=()=>{const n=+document.getElementById("wbControls").dataset.cur;if(n<3)wbGo(n+1);else wbPublish()};
document.getElementById("wbCheck").onclick=e=>{const id=e.target.closest("[data-fix]")?.dataset.fix;if(!id)return;wbGo(id==="wbHeroPhoto"?2:1);setTimeout(()=>document.getElementById(id).focus(),50)};
document.getElementById("wbStepDownload").onclick=()=>document.getElementById("builderDownload").click();
WB_REQUIRED.forEach(([id])=>document.getElementById(id).addEventListener("input",e=>e.target.classList.remove("wb-invalid")));
function wbSaveDraft(){const p=weddingProfile();localStorage.setItem("podWeddingSiteDraft",JSON.stringify({...p,heroPhoto:/^https?:/.test(p.heroPhoto)?p.heroPhoto:"",gallery:(p.gallery||[]).filter(x=>/^https?:/.test(x)),inviteId:wbInviteId,inviteUrl:wbInviteUrl}))}
async function wbSend(p,html,og_image){
  const url=wbInviteId?"/api/invitations?id="+encodeURIComponent(wbInviteId):"/api/invitations";
  return fetch(url,{method:wbInviteId?"PUT":"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({profile:p,html,og_image})});
}
async function wbPublish(){
  const miss=wbMissing();
  if(miss.length){wbGo(1);miss.forEach(([id])=>document.getElementById(id).classList.add("wb-invalid"));document.getElementById(miss[0][0]).focus();showToast(wbT("请先填写：")+miss.map(x=>wbT(x[1])).join(", "));return}
  if(location.protocol==="file:"||!window.PODAuth){showToast(wbT("发布需要启动项目服务端；也可以先下载 HTML"));return}
  // Sign in / register first (the auth sheet resolves after login), then continue publishing automatically.
  try{await PODAuth.require()}catch(e){showToast(wbT("登录后才能发布网站，回复会保存在你的账户里"));return}
  const btns=[document.getElementById("builderPublish"),document.getElementById("wbNext")];btns.forEach(b=>{b.disabled=true});const label=btns[0].textContent;btns[0].textContent=wbT("发布中…");
  try{
    await wbThemesReady();const p=weddingProfile();const html=buildWeddingSite(p);
    let og_image="";try{og_image=await renderWeddingShareCard(p)}catch(e){}
    let r=await wbSend(p,html,og_image);
    if(r.status===401){await PODAuth.require();r=await wbSend(p,html,og_image)}
    if(r.status===404&&wbInviteId){wbInviteId="";wbInviteUrl="";r=await wbSend(p,html,og_image)} // site no longer ours/deleted → publish a new one
    if(!r.ok){const er=new Error("http");er.status=r.status;throw er}
    const data=await r.json();
    wbInviteId=data.id;wbInviteUrl=data.url;wbSaveDraft();wbShowSuccess(data);wbRenderCheck();
  }catch(e){
    showToast(e.status===429?wbT("发布太频繁，请稍后再试（每小时有次数限制）"):e.status===413?wbT("照片总大小超出上限，请减少相册图片后再发布"):e.status?"发布失败（"+e.status+"），请稍后重试":e.message==="auth_cancelled"?wbT("登录后才能发布网站"):wbT("无法连接服务端，请稍后重试；也可以先下载 HTML"));
  }finally{btns.forEach(b=>{b.disabled=false});btns[0].textContent=wbInviteId?wbT("更新网站"):wbT("发布网站");wbStepBtn()}
}
function wbShowSuccess(data){
  const full=location.origin+data.url,names=document.getElementById("wbNames").value.trim();
  document.getElementById("wbSuccessTitle").textContent=data.updated?wbT("网站已更新"):wbT("网站已发布");
  document.getElementById("wbSuccessSub").textContent=data.updated?wbT("链接保持不变，宾客刷新即可看到新内容，已收到的回复都在。"):wbT("把链接发给宾客吧。之后修改再发布，链接保持不变。");
  document.getElementById("wbSuccessUrl").value=full;
  document.getElementById("wbWa").href="https://wa.me/?text="+encodeURIComponent(names+" ♥ "+full);
  document.getElementById("wbOpen").href=data.url;
  try{document.getElementById("wbQr").innerHTML=podQrSvg(full)}catch(e){document.getElementById("wbQr").textContent=""}
  document.getElementById("wbSuccess").hidden=false;document.getElementById("wbCopy").focus();
}
document.getElementById("wbCopy").onclick=async()=>{const i=document.getElementById("wbSuccessUrl");try{await navigator.clipboard.writeText(i.value);document.getElementById("wbCopy").textContent=wbT("已复制 ✓")}catch{i.select();document.execCommand?.("copy")}setTimeout(()=>document.getElementById("wbCopy").textContent=wbT("复制链接"),1800)};
document.getElementById("wbSuccessClose").onclick=()=>{document.getElementById("wbSuccess").hidden=true};
document.getElementById("wbSuccess").addEventListener("keydown",e=>{if(e.key==="Escape")document.getElementById("wbSuccess").hidden=true});
document.getElementById("builderPublish").onclick=wbPublish;
// Fill the builder from a saved draft or a published site's stored profile (photos as URLs).
function wbApplyProfile(s){
  if(s&&s.layout){const n=wbNormTheme(s);s={...s,layout:n.layout};document.getElementById("wbPalette").value=n.palette||"green";document.getElementById("wbPlain").checked=n.plain}
  ["names","date","time","venue","address","mapUrl","intro","rsvpEmail","rsvpUrl","note","accent","density","heroAlign","radius","layout","lang","rsvpMode","giftUrl"].forEach(k=>{
    const el=document.getElementById("wb"+k.charAt(0).toUpperCase()+k.slice(1));if(el&&s[k]!=null)el.value=s[k]});
  if(Array.isArray(s.schedule))document.getElementById("wbSchedule").value=s.schedule.map(x=>`${x.time} | ${x.title} | ${x.desc}`).join("\n");
  if(typeof s.rsvpNotify==="boolean")document.getElementById("wbRsvpNotify").checked=s.rsvpNotify;
  wbAccentTouched=s.accentCustom===true;
  wbSyncThemePicker();
  const ft={countdown:"ftCountdown",timeline:"ftTimeline",map:"ftMap",gallery:"ftGallery",rsvp:"ftRsvp",share:"ftShare",calendar:"ftCalendar",addressCopy:"ftAddressCopy",envelope:"ftEnvelope",card:"ftCard"};
  if(s.features)for(const [k,id] of Object.entries(ft))if(typeof s.features[k]==="boolean")document.getElementById(id).checked=s.features[k];
  if(typeof s.heroPhoto==="string"&&/^https?:/.test(s.heroPhoto)){wbHeroData=s.heroPhoto;document.getElementById("wbHeroStatus").textContent="已发布的照片"}
  if(Array.isArray(s.gallery)&&s.gallery.every(x=>/^https?:/.test(x))&&s.gallery.length){wbGalleryData=s.gallery;document.getElementById("wbGalleryStatus").textContent=s.gallery.length+" 张已发布的照片"}
 wbApplySampleLang();
}
// Account page "编辑" opens /?edit=<id>: load that site (owner only) and keep updating the same URL.
async function wbOpenForEdit(id){
  try{await PODAuth.require();const r=await fetch("/api/invitations/"+encodeURIComponent(id)+"/edit");if(!r.ok)throw new Error(r.status);const d=await r.json();
    openWeddingBuilder({skipDraft:true});if(d.profile)wbApplyProfile(d.profile);wbInviteId=d.id;wbInviteUrl=d.url;wbRenderCheck();refreshWeddingPreview();showToast("正在编辑已发布的网站，再次发布会更新同一链接");
  }catch(e){showToast("无法打开这个网站进行编辑")}
}
{const ed=new URLSearchParams(location.search).get("edit");if(/^[a-f0-9]{12}$/.test(ed||""))addEventListener("load",()=>wbOpenForEdit(ed))}
document.getElementById("wbHeroPhoto").onchange=async e=>{
  const f=e.target.files?.[0];if(!f)return;wbHeroData=await wbCompressImage(f,1600);
  document.getElementById("wbHeroStatus").textContent=`${f.name} · ${wbKB(f.size)} → ${wbKB(wbHeroData.length*.75)}`;refreshWeddingPreview();
};
document.getElementById("wbSamplePhoto").onchange=refreshWeddingPreview;
document.getElementById("wbUseSample").onclick=()=>{const l=document.getElementById("wbLayout").value;wbHeroData=wbSampleUrl(l);document.getElementById("wbHeroStatus").textContent="示例照片 · "+(WB_SAMPLE_PHOTOS[l]||"gifts.jpg");refreshWeddingPreview()};
document.querySelectorAll(".preview-device button").forEach(b=>b.onclick=()=>{document.querySelectorAll(".preview-device button").forEach(x=>x.classList.toggle("on",x===b));document.querySelector(".builder-preview-wrap").classList.toggle("phone",b.dataset.device==="phone")});
document.getElementById("wbGallery").onchange=async e=>{
  const files=[...(e.target.files||[])].slice(0,12);
  wbGalleryData=await Promise.all(files.map(f=>wbCompressImage(f,1200)));
  const before=files.reduce((n,f)=>n+f.size,0),after=wbGalleryData.reduce((n,d)=>n+d.length*.75,0);
  document.getElementById("wbGalleryStatus").textContent=files.length?`${files.length} 张图片 · ${wbKB(before)} → ${wbKB(after)}：`+files.map(f=>f.name).join("、"):"未上传相册";
  refreshWeddingPreview();
};
["wbNames","wbDate","wbTime","wbVenue","wbAddress","wbMapUrl","wbIntro","wbSchedule","wbRsvpEmail","wbRsvpUrl","wbNote","wbAccent","wbDensity","wbHeroAlign","wbRadius","wbLayout","wbLang","wbRsvpMode","wbRsvpNotify","wbGiftUrl",
 "ftEnvelope","ftCard","ftCountdown","ftTimeline","ftMap","ftGallery","ftRsvp","ftShare","ftCalendar","ftAddressCopy"].forEach(id=>{
  const el=document.getElementById(id);if(el)el.addEventListener("change",refreshWeddingPreview);
});
// Theme picker: 6 thumbnail cards (drawn from each theme's own tokens) + palette (garden) / plain (modern) toggles.
const WB_THEME_LABEL={letterpress:"凸版请柬组",modern:"瑞士海报",garden:"植物标本",bloom:"花语篇章",postcard:"旅行手账",gallery:"杂志特刊"};
// Thumbnails: a miniature of each theme's page architecture, set in its own display face.
function wbThumb(k){const T=wbTheme({layout:k,palette:document.getElementById("wbPalette").value,plain:document.getElementById("wbPlain").checked}),f=`font-family:'WBF-${T.nm}',serif;`;
 const art={letterpress:`<svg viewBox="0 0 100 60" preserveAspectRatio="none"><rect width="100" height="60" fill="#d3ccbe"/><rect x="30" y="5" width="40" height="52" fill="#fbf8f1"/><rect x="33" y="8" width="34" height="46" fill="none" stroke="#1e2741" stroke-width=".4"/><rect x="8" y="16" width="18" height="24" fill="#fbf8f1" transform="rotate(-5 17 28)"/><rect x="75" y="20" width="18" height="24" fill="#fbf8f1" transform="rotate(4 84 32)"/></svg>`,
  modern:`<svg viewBox="0 0 100 60" preserveAspectRatio="none"><rect width="100" height="60" fill="#f0efe9"/>${[1,2,3,4,5].map(i=>`<path d="M${i*16.6} 0V60" stroke="#0e0e0e" stroke-opacity=".12" stroke-width=".4"/>`).join("")}<rect y="47" width="100" height="7" fill="#0e0e0e"/>${T.plain?"":`<rect x="66" y="30" width="26" height="12" fill="#d6f450"/>`}</svg>`,
  garden:`<svg viewBox="0 0 100 60" preserveAspectRatio="none"><rect width="100" height="60" fill="${T.paper}"/><rect width="42" height="60" fill="${T.desk}"/>${[14,22,30,38,46].map(y=>`<path d="M50 ${y}H92" stroke="#2c3126" stroke-opacity=".25" stroke-width=".6"/>`).join("")}<path d="M36 58C34 40 38 24 33 6" stroke="#c9d3a8" stroke-width=".6" fill="none" opacity=".7"/></svg>`,
  bloom:`<svg viewBox="0 0 100 60" preserveAspectRatio="none"><rect width="100" height="60" fill="#fbefec"/><circle cx="18" cy="12" r="22" fill="#f4b8c1" opacity=".55"/><circle cx="86" cy="50" r="20" fill="#f6cfb6" opacity=".6"/><circle cx="70" cy="10" r="12" fill="#dcc9ea" opacity=".6"/>${[18,26,34,42].map(y=>`<circle cx="95" cy="${y}" r="1" fill="#4a2b3b" opacity=".45"/>`).join("")}</svg>`,
  postcard:`<svg viewBox="0 0 100 60" preserveAspectRatio="none"><rect width="100" height="60" fill="#f4efe6"/><g transform="rotate(-3 28 32)"><rect x="6" y="12" width="44" height="34" fill="#fbf8f2"/><rect x="9" y="15" width="38" height="28" fill="#2b4f7a" opacity=".8"/><circle cx="38" cy="23" r="5" fill="#b8402a"/></g><rect x="40" y="6" width="11" height="13" fill="#fbf8f2" stroke="#b8402a" stroke-width=".6" stroke-dasharray="1 .8"/></svg>`,
  gallery:`<svg viewBox="0 0 100 60" preserveAspectRatio="none"><defs><linearGradient id="tgl" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5b544b"/><stop offset="1" stop-color="#151515"/></linearGradient></defs><rect width="100" height="60" fill="url(#tgl)"/><path d="M6 13H94" stroke="#fff" stroke-opacity=".6" stroke-width=".4"/><rect x="80" y="48" width="14" height="6" fill="#fff"/></svg>`}[k];
 const st={letterpress:`color:#1e2741;font-size:12px;letter-spacing:.14em;text-transform:uppercase;`,modern:`color:#0e0e0e;font-weight:600;font-size:26px;text-transform:uppercase;letter-spacing:-.02em;justify-self:start;align-self:start;margin:6px 0 0 7px;`,garden:`color:#efe9d8;font-size:18px;justify-self:start;margin-left:8px;`,bloom:`color:#4a2b3b;font-size:24px;`,postcard:`color:#1d2a3a;font-size:17px;justify-self:end;margin-right:8px;`,gallery:`color:#fff;font-size:22px;letter-spacing:-.03em;justify-self:start;align-self:start;margin:12px 0 0 6px;`}[k];
 return `<div class="th" style="background:${T.paper}">${art}<b style="${f}${st}">A&amp;N</b></div>`}
function wbSyncThemePicker(){const cur=document.getElementById("wbLayout").value,t=k=>window.WeddingI18n?.t?.(k)||k,box=document.getElementById("wbThemes");if(!box)return;
 box.innerHTML=WEDDING_LAYOUTS.map(k=>`<button type="button" class="wb-theme" role="radio" data-theme="${k}" aria-checked="${k===cur}" tabindex="${k===cur?0:-1}">${wbThumb(k)}<span>${t(WB_THEME_LABEL[k])}</span></button>`).join("");
 const pal=document.getElementById("wbPalette").value;document.getElementById("wbPalWrap").hidden=cur!=="garden";document.getElementById("wbPlainWrap").hidden=cur!=="modern";
 document.querySelectorAll("#wbPalWrap button").forEach(b=>{b.setAttribute("role","radio");b.setAttribute("aria-checked",b.dataset.pal===pal);b.textContent=t(b.dataset.i18n)});
 const pl=document.querySelector("#wbPlainWrap span");if(pl)pl.textContent=t(pl.dataset.i18n)}
function wbPickTheme(k){const sel=document.getElementById("wbLayout");if(sel.value!==k){sel.value=k;sel.dispatchEvent(new Event("change"))}wbSyncThemePicker();document.querySelector(`.wb-theme[data-theme="${k}"]`)?.focus()}
document.getElementById("wbThemes").addEventListener("click",e=>{const b=e.target.closest(".wb-theme");if(b)wbPickTheme(b.dataset.theme)});
document.getElementById("wbThemes").addEventListener("keydown",e=>{const i=WEDDING_LAYOUTS.indexOf(document.getElementById("wbLayout").value),d={ArrowRight:1,ArrowDown:1,ArrowLeft:-1,ArrowUp:-1}[e.key];if(d){e.preventDefault();wbPickTheme(WEDDING_LAYOUTS[(i+d+6)%6])}});
document.getElementById("wbPalWrap").addEventListener("click",e=>{const b=e.target.closest("button");if(!b)return;document.getElementById("wbPalette").value=b.dataset.pal;wbSyncThemePicker();refreshWeddingPreview()});
document.getElementById("wbAccent").addEventListener("input",()=>{wbAccentTouched=true});
document.getElementById("wbPlain").addEventListener("change",()=>{wbSyncThemePicker();refreshWeddingPreview()});
document.getElementById("wbLayout").addEventListener("change",wbSyncThemePicker);
window.addEventListener("wedding-language-change",wbSyncThemePicker);
const wbThumbFonts=()=>{wbThemesReady().catch(()=>{});return Promise.all(WEDDING_LAYOUTS.map(k=>wbEnsureFonts({fonts:[WB_THEME_BASE[k].nm]}))).then(wbSyncThemePicker)};document.getElementById("weddingSiteBtn").addEventListener("click",wbThumbFonts,{once:true});if(/[?&]edit=/.test(location.search))addEventListener("load",wbThumbFonts);wbSyncThemePicker();
// Live preview while typing (debounced) instead of only on blur/change.
{let wbT=0;["wbNames","wbDate","wbTime","wbVenue","wbAddress","wbMapUrl","wbIntro","wbSchedule","wbNote","wbGiftUrl","wbRsvpEmail","wbRsvpUrl"].forEach(id=>document.getElementById(id)?.addEventListener("input",()=>{clearTimeout(wbT);wbT=setTimeout(refreshWeddingPreview,250)}))}
document.getElementById("wbLang").addEventListener("change",()=>{wbApplySampleLang();refreshWeddingPreview()});

