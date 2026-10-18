// Minimal QR Code encoder (byte mode, ECC level M, versions 1–10), written for this project. Based on the public QR spec (ISO/IEC 18004).
function podQr(text){
 const data=[...new TextEncoder().encode(String(text))];
 const T=[[16,10,1,0],[28,16,1,0],[44,26,1,0],[32,18,2,0],[43,24,2,0],[27,16,4,0],[31,18,4,0],[38,22,2,2],[36,22,3,2],[43,26,4,1]];// [dataPerShortBlock, ecPerBlock, shortBlocks, longBlocks]
 const AL=[[],[6,18],[6,22],[6,26],[6,30],[6,34],[6,22,38],[6,24,42],[6,26,46],[6,28,50]];
 let v=0;for(;v<10;v++){const [d,,s,l]=T[v];if(4+(v<9?8:16)+data.length*8<=(d*s+(d+1)*l)*8)break}
 if(v>=10)throw new Error("qr_too_long");
 const [dn,en,sb,lb]=T[v],ver=v+1,size=ver*4+17,cap=dn*sb+(dn+1)*lb;
 const bits=[];const put=(x,n)=>{for(let i=n-1;i>=0;i--)bits.push((x>>>i)&1)};
 put(4,4);put(data.length,ver<10?8:16);data.forEach(b=>put(b,8));put(0,Math.min(4,cap*8-bits.length));while(bits.length%8)bits.push(0);
 const cw=[];for(let i=0;i<bits.length;i+=8)cw.push(parseInt(bits.slice(i,i+8).join(""),2));for(let p=0;cw.length<cap;p++)cw.push(p%2?0x11:0xEC);
 const mul=(x,y)=>{let z=0;for(let i=7;i>=0;i--){z=(z<<1)^((z>>>7)*0x11D);z^=((y>>>i)&1)*x}return z};
 const div=Array(en).fill(0);div[en-1]=1;let root=1;for(let i=0;i<en;i++){for(let j=0;j<en;j++){div[j]=mul(div[j],root);if(j+1<en)div[j]^=div[j+1]}root=mul(root,2)}
 const rs=blk=>{const r=Array(en).fill(0);for(const b of blk){const f=b^r.shift();r.push(0);for(let i=0;i<en;i++)r[i]^=mul(div[i],f)}return r};
 const blocks=[];let k=0;for(let b=0;b<sb+lb;b++){const n=dn+(b<sb?0:1);const d=cw.slice(k,k+n);k+=n;blocks.push([d,rs(d)])}
 const all=[];for(let i=0;i<=dn;i++)for(const [d] of blocks)if(i<d.length)all.push(d[i]);for(let i=0;i<en;i++)for(const [,e] of blocks)all.push(e[i]);
 const M=Array.from({length:size},()=>Array(size).fill(false)),F=Array.from({length:size},()=>Array(size).fill(false));
 const set=(x,y,d)=>{M[y][x]=d;F[y][x]=true};
 for(let i=0;i<size;i++){set(6,i,i%2==0);set(i,6,i%2==0)}
 for(const [cx,cy] of [[3,3],[size-4,3],[3,size-4]])for(let dy=-4;dy<=4;dy++)for(let dx=-4;dx<=4;dx++){const x=cx+dx,y=cy+dy,dd=Math.max(Math.abs(dx),Math.abs(dy));if(x>=0&&x<size&&y>=0&&y<size)set(x,y,dd!=2&&dd!=4)}
 const al=AL[v];for(const ay of al)for(const ax of al){if((ax==6&&ay==6)||(ax==6&&ay==al.at(-1))||(ax==al.at(-1)&&ay==6))continue;for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++)set(ax+dx,ay+dy,Math.max(Math.abs(dx),Math.abs(dy))!=1)}
 const fmt=mask=>{const d=(0<<3)|mask;let r=d;for(let i=0;i<10;i++)r=(r<<1)^((r>>>9)*0x537);const b=((d<<10)|r)^0x5412,g=i=>((b>>>i)&1)==1;
  for(let i=0;i<=5;i++)set(8,i,g(i));set(8,7,g(6));set(8,8,g(7));set(7,8,g(8));for(let i=9;i<15;i++)set(14-i,8,g(i));
  for(let i=0;i<8;i++)set(size-1-i,8,g(i));for(let i=8;i<15;i++)set(8,size-15+i,g(i));set(8,size-8,true)};
 fmt(0);
 if(ver>=7){let r=ver;for(let i=0;i<12;i++)r=(r<<1)^((r>>>11)*0x1F25);const b=(ver<<12)|r;for(let i=0;i<18;i++){const d=((b>>>i)&1)==1,a=size-11+i%3,c=Math.floor(i/3);set(a,c,d);set(c,a,d)}}
 let i=0;for(let right=size-1;right>=1;right-=2){if(right==6)right=5;for(let vert=0;vert<size;vert++)for(let j=0;j<2;j++){const x=right-j,up=((right+1)&2)==0,y=up?size-1-vert:vert;if(!F[y][x]&&i<all.length*8){M[y][x]=((all[i>>>3]>>>(7-(i&7)))&1)==1;i++}}}
 const MS=[(x,y)=>(x+y)%2==0,(x,y)=>y%2==0,(x,y)=>x%3==0,(x,y)=>(x+y)%3==0,(x,y)=>(Math.floor(x/3)+Math.floor(y/2))%2==0,(x,y)=>x*y%2+x*y%3==0,(x,y)=>(x*y%2+x*y%3)%2==0,(x,y)=>((x+y)%2+x*y%3)%2==0];
 const apply=m=>{for(let y=0;y<size;y++)for(let x=0;x<size;x++)if(!F[y][x]&&MS[m](x,y))M[y][x]=!M[y][x]};
 const score=()=>{let p=0,dark=0;for(let y=0;y<size;y++){for(const line of [M[y],M.map(r=>r[y])]){let run=1;for(let x=1;x<size;x++){if(line[x]==line[x-1]){run++;if(run==5)p+=3;else if(run>5)p++}else run=1}}}
  for(let y=0;y<size-1;y++)for(let x=0;x<size-1;x++){const c=M[y][x];if(c==M[y][x+1]&&c==M[y+1][x]&&c==M[y+1][x+1])p+=3}
  for(const r of M)for(const c of r)dark+=c;return p+Math.floor(Math.abs(dark*20-size*size*10)/(size*size))*10};
 let best=0,bs=Infinity;for(let m=0;m<8;m++){apply(m);fmt(m);const s=score();if(s<bs){bs=s;best=m}apply(m)}
 apply(best);fmt(best);return M}
function podQrSvg(text,dark){const M=podQr(text),n=M.length+8;let d="";M.forEach((r,y)=>r.forEach((c,x)=>{if(c)d+=`M${x+4} ${y+4}h1v1h-1z`}));return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges" role="img" aria-label="QR code"><rect width="${n}" height="${n}" fill="#fff"/><path d="${d}" fill="${dark||"#000"}"/></svg>`}
