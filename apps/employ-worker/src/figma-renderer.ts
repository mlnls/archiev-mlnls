import type { Resume, ResumeTheme } from "./resume";

/**
 * 포트폴리오 페이지에 이미 있는 실제 이미지. 모델은 이 목록에서 id만 고릅니다.
 * 파일에서 지워져도 렌더러가 건너뛰므로 이력서는 그대로 만들어집니다.
 */
export const FIGMA_IMAGES = {
  "readum-stage": { nodes: ["411:967"], about: "Readum(Depromeet) 데모데이 발표 현장 사진" },
  "jeju-autoscaling": { nodes: ["411:863"], about: "제주이어드림 피크 트래픽 Auto Scaling 흐름도" },
  "ip-block": { nodes: ["411:886"], about: "제주이어드림 실제 사용자 IP 기반 차단 흐름도" },
  "pwa-push": { nodes: ["411:933"], about: "좋아하면 숭리는 FCM 푸시 알림 구조도" },
  "marketd-monorepo": { nodes: ["411:790"], about: "마켓:D 모노레포 디렉터리 구조" },
  "marketd-ota": { nodes: ["411:815"], about: "마켓:D 변경 종류별 배포 경로(WebView, OTA, 스토어) 구조도" },
  "lighthouse": { nodes: ["411:674", "411:675"], about: "법률신문 법조인대관 Lighthouse 개선 전후 화면" },
  "ga-report": { nodes: ["411:700"], about: "법률신문 법조인대관 GA4 이벤트 리포트 화면" },
  "bundle-coverage": { nodes: ["411:754"], about: "법무법인 로벡스 번들 커버리지 분석 화면" },
} as const;
export type FigmaImageId = keyof typeof FIGMA_IMAGES;
export const FIGMA_IMAGE_IDS = Object.keys(FIGMA_IMAGES) as [FigmaImageId, ...FigmaImageId[]];

/** 연락처는 Claude에게 보내지 않습니다. 스크립트가 파일 안의 글자를 읽어 그대로 옮깁니다 */
const CONTACT_NODE = "411:561";

const ACCENTS: Record<ResumeTheme, string> = {
  impact: "#1F4FE0",
  system: "#0B7A68",
  product: "#E0431A",
  builder: "#6B3FD4",
};

const digits = (s: string) => (s.match(/\d[\d,.]*/g) ?? []).map((n) => n.replace(/[,.]+$/, "").replace(/,/g, ""));

/** 프로필에 없는 숫자가 그래프로 그려지지 않게 합니다 */
export function backedByProfile(text: string, profileText: string) {
  const known = new Set(digits(profileText));
  return digits(text).every((n) => known.has(n));
}

export interface FigmaDoc {
  frameName: string;
  fileKey: string;
  company: string;
  position: string;
  accent: string;
  contactNode: string;
  theme: ResumeTheme;
  resume: Omit<Resume, "design" | "tailoringNotes" | "gaps">;
  design: Resume["design"];
  images: Record<string, string[]>;
}

/** 모델이 만든 값 중 그릴 수 없거나 근거 없는 것을 걸러 냅니다 */
export function buildFigmaDoc(resume: Resume, job: { company: string; title: string }, fileKey: string, profileText: string, date = new Date()): FigmaDoc {
  const { design, tailoringNotes: _notes, gaps: _gaps, ...rest } = resume;
  const backed = (s: string) => backedByProfile(s, profileText);
  const clean: Resume["design"] = {
    ...design,
    metrics: design.metrics.filter((m) => backed(`${m.value} ${m.from ?? ""}`)).slice(0, 4),
    featured: design.featured.slice(0, 3).map((f) => ({
      ...f,
      bars: f.bars.filter((b) => b.before > 0 && b.after > 0 && backed(`${b.beforeText} ${b.afterText}`)).slice(0, 3),
    })),
  };
  const images: Record<string, string[]> = {};
  for (const f of clean.featured) if (f.imageId) images[f.imageId] = [...FIGMA_IMAGES[f.imageId].nodes];
  return {
    frameName: `${job.company.replace(/"/g, "")} - ${date.toISOString().slice(0, 10)}`,
    fileKey,
    company: job.company,
    position: job.title,
    accent: ACCENTS[design.theme],
    contactNode: CONTACT_NODE,
    theme: design.theme,
    // 모델이 이름 칸에 직무를 덧붙이면 머리글이 페이지 밖으로 밀립니다
    resume: { ...rest, title: rest.title.split(/\s*[·|/,–—]\s*|\s+-\s+/)[0]! },
    design: clean,
    images,
  };
}

/** use_figma에 그대로 넘기는 코드. 도중에 실패하면 만들던 프레임을 지워 다시 실행해도 안전합니다 */
export function buildFigmaScript(doc: FigmaDoc): string {
  return `const D=${JSON.stringify(doc)};\n${RENDERER}`;
}

const RENDERER = String.raw`const F='Gothic A1',WT={4:'Regular',5:'Medium',6:'SemiBold',7:'Bold',8:'ExtraBold',9:'Black'};
for(const s of Object.values(WT))await figma.loadFontAsync({family:F,style:s});
const hex=h=>({r:parseInt(h.slice(1,3),16)/255,g:parseInt(h.slice(3,5),16)/255,b:parseInt(h.slice(5,7),16)/255});
const paint=h=>[{type:'SOLID',color:hex(h)}];
const INK='#111111',MUT='#6F6F6F',RULE='#E4E4E4',SOFT='#F5F5F3',WHITE='#FFFFFF',A=D.accent,W=794,H=1123,M=56,CW=W-M*2,R=D.resume,G=D.design;
function T(s,o={}){const t=figma.createText();t.fontName={family:F,style:WT[o.w||4]};t.characters=String(s);t.fontSize=o.s||11.5;t.fills=paint(o.c||INK);t.lineHeight={unit:'PERCENT',value:o.lh||155};t.letterSpacing={unit:'PERCENT',value:o.ls==null?-1:o.ls};return t}
function B(dir,o={}){const f=figma.createAutoLayout(dir,{itemSpacing:o.gap||0});f.fills=o.fill?paint(o.fill):[];f.clipsContent=false;if(o.p!=null){f.paddingTop=f.paddingBottom=f.paddingLeft=f.paddingRight=o.p}if(o.py!=null){f.paddingTop=f.paddingBottom=o.py}if(o.px!=null){f.paddingLeft=f.paddingRight=o.px}if(o.r)f.cornerRadius=o.r;if(o.name)f.name=o.name;return f}
function fill(p,c,grow){p.appendChild(c);c.layoutSizingHorizontal='FILL';if(c.type==='TEXT')c.textAutoResize='HEIGHT';if(grow)c.layoutGrow=1;return c}
function P(p,s,o){return fill(p,T(s,o))}
function cols(p,sizes,gap){const r=B('HORIZONTAL',{gap});fill(p,r);return sizes.map(z=>{const c=B('VERTICAL',{gap:0});r.appendChild(c);if(z===0){c.layoutSizingHorizontal='FILL'}else{c.resize(z,c.height||1);c.layoutSizingHorizontal='FIXED'}return c})}
function rule(p,c,h){const r=figma.createRectangle();r.resize(10,h||1);r.fills=paint(c||RULE);fill(p,r);r.layoutSizingVertical='FIXED';return r}
function stack(p,gap){const s=B('VERTICAL',{gap});fill(p,s);return s}
async function pic(p,id,w,maxH){const out=[];for(const n of D.images[id]||[]){const src=await figma.getNodeByIdAsync(n);if(!src||!('fills' in src))continue;out.push(src)}if(!out.length)return false;const g=8,each=(w-g*(out.length-1))/out.length,row=B('HORIZONTAL',{gap:g});p.appendChild(row);for(const src of out){let iw=each,ih=each*src.height/src.width;if(maxH&&ih>maxH){ih=maxH;iw=maxH*src.width/src.height}const r=figma.createRectangle();r.resize(iw,ih);r.fills=src.fills;r.cornerRadius=4;r.name='이미지 '+id;row.appendChild(r)}return true}
function bars(p,items,w){for(const b of items){const box=stack(p,3);P(box,b.label,{s:10.5,w:6});const m=Math.max(b.before,b.after),big=w-96;for(const [v,txt,c,tw] of [[b.before,b.beforeText,'#C9C9C6',5],[b.after,b.afterText,A,8]]){const r=B('HORIZONTAL',{gap:6});r.counterAxisAlignItems='CENTER';box.appendChild(r);const b2=figma.createRectangle();b2.resize(Math.max(3,big*v/m),11);b2.fills=paint(c);r.appendChild(b2);r.appendChild(T(txt,{s:10,w:tw,lh:120,c:tw===8?A:MUT}))}}}
function flow(p,steps,dark){const r=B('HORIZONTAL',{gap:6});fill(p,r);r.counterAxisAlignItems='CENTER';steps.slice(0,5).forEach((s,i)=>{if(i){r.appendChild(T('→',{s:13,w:5,lh:100,c:dark?'#FFFFFF':MUT}))}const hot=i===steps.length-1;const b=B('VERTICAL',{gap:2,py:10,px:10,r:4,fill:hot?A:dark?'#26262A':SOFT});r.appendChild(b);b.layoutSizingHorizontal='FILL';b.layoutSizingVertical='HUG';P(b,s.label,{s:10.5,w:7,lh:135,c:hot||dark?WHITE:INK});if(s.note)P(b,s.note,{s:9,lh:135,c:hot?WHITE:dark?'#B8B8BC':MUT})})}
const page=figma.root.children.find(p=>p.name==='Resumes')||(()=>{const p=figma.createPage();p.name='Resumes';return p})();
await figma.setCurrentPageAsync(page);
const X=page.children.reduce((m,n)=>Math.max(m,n.x+n.width),-120)+120;
const root=B('HORIZONTAL',{gap:32});root.name=D.frameName;root.x=X;root.y=0;page.appendChild(root);
try{
let pg,body,head,heroImg=null,compact=false,pages=[],bodies=[];
function newPage(first){pg=figma.createFrame();pg.name=String(pages.length+1);pg.resize(W,H);pg.fills=paint(WHITE);pg.layoutMode='VERTICAL';pg.primaryAxisSizingMode='FIXED';pg.counterAxisSizingMode='FIXED';pg.clipsContent=true;root.appendChild(pg);pages.push(pg);body=null;if(!first){const h=B('HORIZONTAL',{px:M});fill(pg,h);h.paddingTop=32;h.paddingBottom=20;h.primaryAxisAlignItems='SPACE_BETWEEN';h.appendChild(T(R.title+' ↗',{s:11,w:8,lh:120}));h.appendChild(T(D.company,{s:10,lh:120,c:MUT}))}body=B('VERTICAL',{gap:0,px:M});fill(pg,body);bodies.push(body)}
const limit=()=>H-44;
function fits(){return pg.children.reduce((s,c)=>s+c.height,0)<=limit()}
function place(block,gapBefore){const before=body.children.length;if((before||pages.length===1)&&gapBefore){block.paddingTop=gapBefore}fill(body,block);if(!fits()&&before){block.paddingTop=0;newPage();fill(body,block)}return block}
function heading(p,label,note){const h=B('HORIZONTAL',{gap:8});fill(p,h);h.counterAxisAlignItems='BASELINE';h.primaryAxisAlignItems='SPACE_BETWEEN';h.paddingBottom=4;h.appendChild(T(label,{s:12.5,w:8,lh:130,ls:-1.5}));if(note)h.appendChild(T(note,{s:9.5,lh:130,c:MUT}));const r=rule(p,INK,1.5);return r}
async function draw(){newPage(true);
head=B('VERTICAL',{gap:0,px:M});fill(pg,head);head.paddingTop=48;head.paddingBottom=0;pg.insertChild(0,head);
const top=B('HORIZONTAL',{gap:12});fill(head,top);top.primaryAxisAlignItems='SPACE_BETWEEN';top.counterAxisAlignItems='MAX';
const nm=B('VERTICAL',{gap:6});top.appendChild(nm);nm.appendChild(T(R.title+' ↗',{s:40,w:9,lh:110,ls:-4}));const nmr=figma.createRectangle();nmr.resize(10,3);nmr.fills=paint(INK);nm.appendChild(nmr);nmr.layoutSizingHorizontal='FILL';
const cn=await figma.getNodeByIdAsync(D.contactNode);
const cb=B('VERTICAL',{gap:0});cb.counterAxisAlignItems='MAX';top.appendChild(cb);if(cn&&cn.type==='TEXT'){for(const l of cn.characters.split('\n'))cb.appendChild(T(l,{s:10.5,w:7,lh:150,ls:0}))}cb.appendChild(T(D.company+' · '+D.position,{s:9.5,lh:160,c:A,w:6}));
await hero();for(const fn of order)await fn()}
function statement(p,c,s){return P(p,G.statement,{s:s||30,w:8,lh:128,ls:-3.5,c:c||INK})}
async function hero(){const t=D.theme;if(t==='system'&&G.heroFlow.length>1){const band=B('VERTICAL',{gap:20,py:30,px:M,fill:'#141417'});fill(pg,band);pg.insertChild(1,band);band.paddingTop=30;head.paddingBottom=26;body.paddingTop=4;P(band,G.focusLabel,{s:10.5,w:7,c:'#7BE3CC',ls:0});statement(band,WHITE,28);flow(band,G.heroFlow,true);return}
const h=B('VERTICAL',{gap:18});h.paddingTop=34;const img=G.featured.find(f=>f.imageId&&D.images[f.imageId]);
P(h,G.focusLabel,{s:10.5,w:7,c:A,ls:0});
if(t==='product'&&img){heroImg=img.imageId;const[l,r]=cols(h,[0,300],24);statement(l,INK,27);const row=stack(l,12);row.paddingTop=14;for(const m of G.metrics.slice(0,3)){const x=B('HORIZONTAL',{gap:10});x.counterAxisAlignItems='CENTER';fill(row,x);x.appendChild(T(m.value,{s:24,w:9,c:A,lh:110,ls:-3}));fill(x,T(m.label,{s:10.5,w:5,lh:135}))}await pic(r,img.imageId,300,300)}
else{statement(h);if(t==='impact'||t==='builder'){const list=G.metrics.slice(0,3);if(list.length){const cs=cols(h,list.map(()=>0),16);list.forEach((m,i)=>{const c=cs[i];c.itemSpacing=5;rule(c,INK,1.5);const v=P(c,m.from?m.from+'→'+m.value:m.value,{s:m.from?36:42,w:9,c:A,lh:112,ls:-4});v.textAutoResize='HEIGHT';P(c,m.label,{s:11,w:7,lh:140});if(m.context)P(c,m.context,{s:9.5,c:MUT,lh:140})})}}}
fill(body,h)}
function fit(){if(!G.fit.length)return;const s=B('VERTICAL',{gap:0});heading(s,'이 포지션과 맞닿은 지점',D.company);G.fit.slice(0,5).forEach(f=>{const[a,b]=cols(s,[186,0],20);const row=a.parent;row.paddingTop=row.paddingBottom=9;P(a,f.requirement,{s:11,w:7,lh:145});P(b,f.evidence,{s:11,lh:150});rule(s)});place(s,30)}
async function caseStudies(){let i=0;for(const f of G.featured){i++;const s=B('VERTICAL',{gap:10});if(i===1)heading(s,'핵심 사례',G.focusLabel);const k=B('HORIZONTAL',{gap:8});k.counterAxisAlignItems='CENTER';fill(s,k);k.appendChild(T(String(i).padStart(2,'0'),{s:10.5,w:9,c:A,lh:120,ls:0}));k.appendChild(T(f.project,{s:10.5,w:6,c:MUT,lh:120}));P(s,f.title,{s:17,w:8,lh:135,ls:-2.5});
const hasPic=f.imageId&&f.imageId!==heroImg&&D.images[f.imageId],hasBars=f.bars.length>0,hasFlow=f.flow.length>1;
const copy=(p)=>{for(const [l,t] of [['문제',f.problem],['해결',f.action],['결과',f.result]]){if(!t)continue;const[a,b]=cols(p,[28,0],8);a.parent.paddingBottom=6;P(a,l,{s:10,w:8,c:l==='결과'?A:MUT,lh:165,ls:0});P(b,t,{s:11,lh:155,w:l==='결과'?6:4})}};
const srcs=hasPic?await Promise.all(D.images[f.imageId].map(n=>figma.getNodeByIdAsync(n))):[];const wide=srcs[0]&&srcs.length===1&&srcs[0].width/srcs[0].height>2.4;
if(hasPic&&wide){copy(s);await pic(s,f.imageId,CW)}
else if(hasPic||hasBars){const[a,b]=cols(s,[0,270],22);copy(a);b.itemSpacing=12;if(hasBars)bars(b,f.bars,270);if(hasPic)await pic(b,f.imageId,270,hasBars?140:230)}
else copy(s);
if(hasFlow){flow(s,f.flow,false)}
place(s,i===1?32:26)}}
function skills(){if(!R.skills.length)return;const s=B('VERTICAL',{gap:6});heading(s,'기술');s.paddingTop=0;const hi=new Set(G.emphasisSkills.map(x=>x.toLowerCase()));for(const g of R.skills){const[a,b]=cols(s,[110,0],12);P(a,g.label,{s:10.5,w:7,lh:160});const line=g.items.join(', '),t=P(b,line,{s:10.5,lh:160,c:MUT});let at=0;for(const it of g.items){if(hi.has(it.toLowerCase())){t.setRangeFontName(at,at+it.length,{family:F,style:'Bold'});t.setRangeFills(at,at+it.length,paint(A))}at+=it.length+2}}place(s,28)}
function others(){const shown=new Set(G.featured.map(f=>f.project));let first=true;for(const e of R.experience){const s=B('VERTICAL',{gap:6});if(first)heading(s,'경력');first=false;const r=B('HORIZONTAL',{});fill(s,r);r.primaryAxisAlignItems='SPACE_BETWEEN';r.appendChild(T(e.company+' · '+e.role,{s:11.5,w:8,lh:140}));r.appendChild(T(e.period,{s:10,c:MUT,lh:140}));const rest=e.projects.filter(p=>!shown.has(p.name));let holder=s;for(const p of rest){const it=stack(holder,2);it.paddingTop=4;P(it,p.name,{s:11,w:7,lh:145});for(const b of compact?p.bullets.slice(0,1):p.bullets)P(it,'– '+b,{s:10.5,lh:152,c:'#333333'});if(holder===s){place(s,28)}holder=B('VERTICAL',{});place(holder,6)}if(!rest.length)place(s,28);if(holder!==s&&!holder.children.length)holder.remove()}}
function activities(){let first=true;const shown=new Set(G.featured.map(f=>f.project));for(const a of R.activities){if(shown.has(a.name))continue;const s=B('VERTICAL',{gap:2});if(first)heading(s,'활동');const r=B('HORIZONTAL',{});if(first){r.paddingTop=4}fill(s,r);r.primaryAxisAlignItems='SPACE_BETWEEN';r.appendChild(T(a.name+' · '+a.role,{s:11,w:7,lh:145}));r.appendChild(T(a.period,{s:10,c:MUT,lh:145}));for(const b of compact?a.bullets.slice(0,1):a.bullets)P(s,'– '+b,{s:10.5,lh:152,c:'#333333'});place(s,first?28:10);first=false}}
function foot(){const lists=[['학력',R.education],['자격',R.certifications]].filter(x=>x[1].length);if(!lists.length)return;const s=B('VERTICAL',{});const cs=cols(s,lists.map(()=>0),24);lists.forEach(([t,l],i)=>{cs[i].itemSpacing=5;heading(cs[i],t);for(const x of l)P(cs[i],x,{s:10.5,lh:152})});for(let i=0;i<pages.length;i++){pg=pages[i];body=bodies[i];s.paddingTop=body.children.length?28:0;fill(body,s);if(fits())return}s.paddingTop=0;newPage();fill(body,s)}
const order={impact:[fit,caseStudies,skills,others,activities,foot],system:[skills,fit,caseStudies,others,activities,foot],product:[caseStudies,fit,activities,others,skills,foot],builder:[fit,caseStudies,others,skills,activities,foot]}[D.theme];
await draw();
if(pages.length>1&&pages[pages.length-1].children.reduce((s,c)=>s+c.height,0)<280){pages.forEach(p=>p.remove());pages=[];bodies=[];compact=true;await draw()}
pages.forEach((p,i)=>{const n=T((i+1)+' / '+pages.length,{s:9,c:MUT,lh:100,ls:0});p.appendChild(n);n.layoutPositioning='ABSOLUTE';n.x=M;n.y=H-30});
return{url:'https://www.figma.com/design/'+D.fileKey+'?node-id='+root.id.replace(':','-'),pages:pages.length,id:root.id,ids:pages.map(p=>p.id)};
}catch(e){root.remove();throw e}`;
