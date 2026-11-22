import type {AOI,CardRect,Geometry} from './types';
import type {GuideCard} from './cutoutCard';
import {archeryPlacement, archeryTargetPoint, archeryTiming, drawArcheryImpact, drawArcheryStory, hitArcheryStory} from './archeryNarrative';
import {drawCollageSubject,hitCollageSubject} from './cutoutMotion';
import {drawPaintedPose,hitPaintedPose,hasPaintedPoses} from './paintedPoses';
import {archerArrowPose} from './archerDetail';
import catalogue from './uciCatalogue.json' with {type:'json'};

export interface PaperGuideLayout {
  /** Absent from the archived two-sheet presentation. */
  style?:'single-board';
  reveal?:'explain-then-shoot'|'archer-release'|'arrow-detail'|'polo-swing'|'stepped-poses'|'landed-arrow';
  landedArrowLength?:number;
  impact?:{x:number;y:number};
  source:CardRect;
  art:CardRect;
  backing:CardRect;
  panel:CardRect;
  bounds:CardRect;
  viewport:{width:number;height:number};
  type:{pad:number;titleSize:number;bodySize:number;title:number[];body:number[]};
}

const clamp=(x:number,lo:number,hi:number)=>Math.max(lo,Math.min(hi,x));
const mix=(a:number,b:number,t:number)=>a+(b-a)*t;
const centerX=(r:CardRect)=>r.left+r.width/2;
const centerY=(r:CardRect)=>r.top+r.height/2;
function centered(x:number,y:number,w:number,h:number):CardRect{return {left:x-w/2,top:y-h/2,width:w,height:h}}
function interpolate(a:CardRect,b:CardRect,t:number):CardRect{
  return {left:mix(a.left,b.left,t),top:mix(a.top,b.top,t),width:mix(a.width,b.width,t),height:mix(a.height,b.height,t)};
}
const titleFont=(size:number)=>'600 '+size+'px "Songti SC","Noto Serif CJK SC","Microsoft YaHei",serif';
const bodyFont=(size:number,legacy:boolean)=>legacy
  ?'400 '+size+'px "PingFang SC","Microsoft YaHei",sans-serif'
  :'400 '+size+'px "Songti SC","Noto Serif CJK SC","Microsoft YaHei",serif';

function breaks(ctx:CanvasRenderingContext2D,text:string,width:number){
  const result:number[]=[];
  let line='';
  for(const ch of text){
    if(line && ctx.measureText(line+ch).width>width && !'，。！？、；：”）》'.includes(ch)){
      result.push(Array.from(line).length);line='';
    }
    line+=ch;
  }
  if(line)result.push(Array.from(line).length);
  return result;
}
function typography(ctx:CanvasRenderingContext2D,card:GuideCard,width:number,viewportWidth:number,legacy:boolean,compact=false){
  const pad=compact?14:clamp(width*.083,17,33);
  const titleSize=compact?clamp(viewportWidth*.018,19,23):clamp(viewportWidth*.023,22,36);
  const bodySize=compact?clamp(viewportWidth*.012,14,16):clamp(viewportWidth*.0135,15,20);
  // One spare ideograph also keeps closing punctuation on the previous line.
  const textWidth=width-pad*2;
  ctx.font=titleFont(titleSize);
  const title=breaks(ctx,card.title,textWidth-titleSize*.7);
  ctx.font=bodyFont(bodySize,legacy);
  const body=breaks(ctx,card.text,textWidth-bodySize*.7);
  return {pad,titleSize,bodySize,title,body};
}
function textHeight(t:PaperGuideLayout['type']){
  return t.title.length*t.titleSize*1.30+Math.round(t.bodySize*.82)+t.body.length*t.bodySize*1.68;
}

/** The arrow is a small detail of the bow. Place the reading board just above
 * the release hand, leaving the archer's head, hands and body visible. */
function arrowGuide(ctx:CanvasRenderingContext2D,card:GuideCard,g:Geometry,source:CardRect,
  width:number,v3Impact?:{x:number;y:number}):PaperGuideLayout{
  const vw=g.viewportWidth,vh=g.viewportHeight;
  const edge=clamp(vw*.015,8,18);
  const panelWidth=Math.min(vw-edge*2,clamp(vw*.22,228,305));
  const type=typography(ctx,card,panelWidth,vw,false,true);
  const panelHeight=Math.ceil(textHeight(type)+2*type.pad);
  const artH=width*source.height/source.width;
  const lift=clamp(g.height*.076,18,40)+9;
  const art=centered(centerX(source)-clamp(width*.3,9,20), centerY(source)-lift, width, artH);
  const left=clamp(art.left+width*.19,edge,vw-edge-panelWidth);
  const top=clamp(centerY(art)+12-panelHeight,edge,vh-edge-panelHeight);
  const panel={left,top,width:panelWidth,height:panelHeight};
  const minX=Math.min(art.left,left),minY=Math.min(art.top,top);
  const bounds={left:minX,top:minY,width:Math.max(left+panelWidth,art.left+width)-minX,
    height:Math.max(top+panelHeight,art.top+artH)-minY};
  return {style:'single-board',source,art,panel,backing:panel,bounds,type,viewport:{width:vw,height:vh},
    ...(v3Impact?{reveal:'explain-then-shoot',impact:v3Impact}:{reveal:'arrow-detail'})};
}

// The target-only presentation (random order or a direct P00 link) still needs
// the exact displayed shaft length from the archer's card on this viewport.
const archerEntry=catalogue.cards.find(c=>c.scene==='archery'&&c.node==='1:2')!;
const archerCard:GuideCard={id:'archery-figma-1-2',title:archerEntry.title,text:archerEntry.text,art:archerEntry,
  location:archerEntry.title,aoiIds:['figma-1-2'],source:archerEntry.image};
const archerArea:AOI={id:'figma-1-2',label:archerEntry.title,rect:archerEntry.rect as AOI['rect']};

/** Frozen viewport CSS pixels. The foreground is sized from its registered area in the original scene. */
export function makePaperGuide(ctx:CanvasRenderingContext2D,card:GuideCard,g:Geometry,aoi:AOI,edition?:'legacy'|'v3'):PaperGuideLayout{
  const vw=g.viewportWidth,vh=g.viewportHeight;
  const [x,y,w,h]=aoi.rect;
  const area={left:g.left+x*g.width,top:g.top+y*g.height,width:w*g.width,height:h*g.height};
  const shape=card.art?.shape;
  const aspect=shape?shape.width/shape.height:area.width/area.height;
  const cx=centerX(area),cy=centerY(area);
  const nativeW=Math.max(area.width,area.height*aspect);
  const placement=edition==='legacy'?{}:archeryPlacement(card,g);
  const source=placement.source??centered(cx,cy,nativeW,nativeW/aspect);
  source.left=clamp(source.left,0,vw-source.width);
  source.top=clamp(source.top,0,vh-source.height);
  if(placement.tip && placement.detailWidth)return arrowGuide(ctx,card,g,source,placement.detailWidth,edition==='v3'?placement.tip:undefined);
  // Reserve page margins and paper borders only where the original subject leaves room.
  const edgeX=clamp(vw*.018,8,24);
  const edgeY=clamp((vh-nativeW/aspect)*.12,1,clamp(vh*.035,8,24));
  const padX=clamp(vw*.014,10,22);
  const padY=clamp((vh-2*edgeY-nativeW/aspect)*.13,1,clamp(vh*.022,9,20));
  const safeW=vw-2*edgeX,safeH=vh-2*edgeY;
  const targetSize=clamp(Math.min(vw*.24,vh*.32),110,260);
  const archer=!edition&&card.id==='archery-figma-1-2';
  const poloClub=!edition&&card.id==='polo-figma-3-25';
  // This cutout is the club visible inside the rider's larger cutout.
  const desiredW=Math.max(nativeW*1.30,Math.min(1,aspect)*targetSize*(poloClub?.44:1));
  const seam=Math.min(25,padX+2);
  const minimumPanel=Math.min(224,safeW);
  const target=!edition&&card.id==='archery-figma-0-6';
  const landedArrowLength=target?archerArrowPose(makePaperGuide(ctx,archerCard,g,archerArea).art).length:0;
  const extraRatio=target?0:placement.rightSpace??0;
  // The shaft projects to the right of the bullseye. Leave at least its full
  // CSS-pixel length before the text column, including when the flag shrinks.
  const shaftRoom=landedArrowLength;
  const extra=desiredW/aspect*extraRatio+shaftRoom;
  const requiredArtW=edition!=='legacy'&&vw<520?desiredW:nativeW;
  const impact=archer?archeryTargetPoint(g):undefined;
  // A row must leave some space to the LEFT of the archer for his shot.
  // Stack the caption if a right-hand caption would put him behind the target.
  const archerStack=impact!==undefined && vw-edgeX-minimumPanel-desiredW-2*padX<impact.x+vw*.16;
  const stacked=archerStack || (edition==='legacy' && vw<520)
    || requiredArtW*(1+extraRatio/aspect)+2*padX+shaftRoom+minimumPanel-seam>safeW;
  const maxPanel=poloClub?clamp(vw*.23,228,310):clamp(vw*.29,258,445);
  const panelW=stacked?Math.min(safeW,510):clamp(safeW-desiredW-extra-2*padX+seam,minimumPanel,maxPanel);
  const type=typography(ctx,card,panelW,vw,edition==='legacy',poloClub);
  const minPanelH=Math.ceil(textHeight(type)+2*type.pad);
  const availableW=safeW-2*padX-(stacked?0:panelW-seam);
  const availableH=safeH-2*padY-(stacked?minPanelH-seam:0);
  const requestedW=stacked&&!archer&&!poloClub&&edition!=='legacy'&&vw<520?Math.max(desiredW,safeW*.78):desiredW;
  const artW=Math.max(1,Math.min(requestedW,(availableW-shaftRoom)/(1+extraRatio/aspect),availableH*aspect));
  const artH=artW/aspect;
  const mountW=artW+artH*extraRatio+2*padX+shaftRoom,mountH=artH+2*padY;
  const panelH=minPanelH;
  const totalW=stacked?Math.max(mountW,panelW):mountW+panelW-seam;
  const totalH=stacked?mountH+panelH-seam:Math.max(mountH,panelH);
  const bounds:CardRect={
    left:clamp(cx-(stacked?totalW:mountW)/2,edgeX,vw-edgeX-totalW),
    top:clamp(cy-(stacked?mountH:totalH)/2,edgeY,vh-edgeY-totalH),width:totalW,height:totalH,
  };
  const backing={left:bounds.left+(stacked?(totalW-mountW)/2:0),top:bounds.top+(stacked?0:(totalH-mountH)/2),width:mountW,height:mountH};
  const art={left:backing.left+padX,top:backing.top+padY,width:artW,height:artH};
  const panel={left:stacked?bounds.left+(totalW-panelW)/2:backing.left+mountW-seam,top:stacked?backing.top+mountH-seam:bounds.top+(totalH-panelH)/2,width:panelW,height:panelH};
  const layout={source,art,backing,panel,bounds,type,viewport:{width:vw,height:vh}};
  if(edition==='legacy')return layout;

  // A single field of pigment runs under both the art and the typesetting.
  // Wide groups overhang by less so the leftmost people keep their silhouette.
  if(stacked)art.left=archer?clamp(cx-artW/2,bounds.left,bounds.left+totalW-artW):bounds.left;
  const overhang=artW*(aspect>1.05?.065:aspect>.55?.18:.36);
  const left=stacked?Math.min(art.left+overhang,panel.left+type.pad*.65):art.left+overhang;
  const top=Math.min(art.top+artH*.07,panel.top);
  const bottom=Math.max(art.top+artH*.96,panel.top+panel.height);
  return {...layout,style:'single-board',backing:{left,top,width:bounds.left+bounds.width-left,height:bottom-top},
    ...(target?{reveal:'landed-arrow',landedArrowLength}:impact?{reveal:'archer-release',impact}:{reveal:!edition?poseReveal(card.id):undefined})};
}
function poseReveal(id:string):'polo-swing'|'stepped-poses'|undefined{
  if(id==='polo-figma-3-23')return 'polo-swing';
  if(hasPaintedPoses(id))return 'stepped-poses';
}

const finite=(n:unknown):n is number=>typeof n==='number' && Number.isFinite(n);
const rectValid=(v:unknown):v is CardRect=>{
  if(!v||typeof v!=='object')return false;
  const r=v as CardRect;
  return [r.left,r.top,r.width,r.height].every(finite)&&r.width>0&&r.height>0;
};
export function validPaperGuideLayout(value:unknown):value is PaperGuideLayout{
  if(!value||typeof value!=='object')return false;
  const l=value as PaperGuideLayout,t=l.type;
  const counts=(a:unknown)=>Array.isArray(a)&&a.length>0&&a.length<=200&&a.every(n=>Number.isInteger(n)&&n>0&&n<=2000);
  const plainReveal=l.reveal==='arrow-detail'||l.reveal==='polo-swing'||l.reveal==='stepped-poses'
    || (l.reveal==='landed-arrow'&&finite(l.landedArrowLength)&&l.landedArrowLength>0&&l.landedArrowLength<=32768);
  const hasTarget=(l.reveal==='archer-release'||l.reveal==='explain-then-shoot') && !!l.impact&&finite(l.impact.x)&&finite(l.impact.y);
  return (l.style===undefined||l.style==='single-board') && (l.reveal===undefined||l.style==='single-board'&&(plainReveal||hasTarget))
    && [l.source,l.art,l.backing,l.panel,l.bounds].every(rectValid) && !!l.viewport &&
    [l.viewport.width,l.viewport.height].every(n=>finite(n)&&n>0&&n<=32768) && !!t &&
    [t.pad,t.titleSize,t.bodySize].every(n=>finite(n)&&n>0&&n<=200) && counts(t.title)&&counts(t.body);
}

function ease(time:number,from:number,to:number){
  const p=clamp((time-from)/(to-from),0,1);
  return p*p*(3-2*p);
}
export function paperFrame(l:PaperGuideLayout,elapsed:number,duration:number,reduced=false){
  // For very short rehearsals, reserve the same entrance/exit proportions as the full presentation.
  const speed=Math.min(1,duration/2700);
  const t=reduced?1800:elapsed/Math.max(speed,.001);
  const flight=ease(t,160,1130);
  const unfold=ease(t,460,1350);
  const dropsBoard=l.reveal==='archer-release'||l.reveal==='polo-swing';
  const boardAlpha=dropsBoard||l.reveal==='explain-then-shoot'?archeryTiming(elapsed,duration,reduced).boardAlpha:1;
  const boardDrop=dropsBoard&&!reduced?(1-boardAlpha)*clamp(l.backing.height*.16,18,42):0;
  const subject=interpolate(l.source,l.art,flight);
  let backing=interpolate(l.source,l.backing,flight);
  if(l.style==='single-board'){
    // Start the reveal on the registered subject. Its leading edge travels right
    // across the cutout and on to the text; there is only one physical rectangle.
    const start=centerX(l.source);
    const left=mix(start,l.backing.left,flight);
    const right=mix(start,l.backing.left+l.backing.width,unfold);
    backing={...backing,left,width:Math.max(0,right-left)};
  }
  const left=mix(centerX(l.source),l.panel.left,flight);
  const top=clamp(mix(centerY(l.source)-l.panel.height/2,l.panel.top,flight),0,l.viewport.height-l.panel.height);
  backing.top+=boardDrop;
  const panel={left,top:top+boardDrop,width:l.panel.width*unfold,height:l.panel.height};
  const fadeOut=reduced&&l.style==='single-board'
    ?Number(elapsed<duration)
    :1-ease(elapsed,duration-(reduced?120:680)*speed,duration);
  return {subject,backing,panel,boardDrop,alpha:fadeOut,backingAlpha:boardAlpha*ease(t,195,745),panelAlpha:boardAlpha*ease(t,460,890),
    textAlpha:boardAlpha*ease(t,950,1520),light:1-ease(t,220,980),veil:boardAlpha*ease(t,0,620),motionMs:reduced?0:Math.max(0,elapsed-1050*speed)};
}

function rgb(hex:string){return [1,3,5].map(i=>parseInt(hex.slice(i,i+2),16))}
function tint(a:string,b:string,t:number){
  const c=rgb(a),d=rgb(b);return '#'+c.map((ch,i)=>Math.round(mix(ch,d[i],t)).toString(16).padStart(2,'0')).join('');
}
function brightness(hex:string){
  const c=rgb(hex).map(v=>{const s=v/255;return s<=.04045?s/12.92:((s+.055)/1.055)**2.4});
  return c[0]*.2126+c[1]*.7152+c[2]*.0722;
}
let paperGrain:HTMLCanvasElement|undefined;
function washPaper(ctx:CanvasRenderingContext2D,r:CardRect){
  if(!paperGrain){
    paperGrain=document.createElement('canvas');paperGrain.width=paperGrain.height=80;
    const grain=paperGrain.getContext('2d')!;
    const data=grain.createImageData(80,80);
    let seed=247;
    for(let i=0;i<data.data.length;i+=4){
      seed=(Math.imul(seed,1664525)+1013904223)>>>0;
      const value=seed&256?255:0;
      data.data[i]=data.data[i+1]=data.data[i+2]=value;
      data.data[i+3]=(seed>>>26)%9;
    }
    grain.putImageData(data,0,0);
  }
  const pattern=ctx.createPattern(paperGrain,'repeat');
  if(pattern){ctx.fillStyle=pattern;ctx.fillRect(r.left,r.top,r.width,r.height)}
}
function sheet(ctx:CanvasRenderingContext2D,r:CardRect,top:string,bottom:string){
  if(r.width<.5)return;
  const grd=ctx.createLinearGradient(r.left,r.top,r.left+r.width*.75,r.top+r.height);
  grd.addColorStop(0,top);grd.addColorStop(1,bottom);
  ctx.fillStyle=grd;ctx.fillRect(r.left,r.top,r.width,r.height);
  washPaper(ctx,r);
}
function paintLines(ctx:CanvasRenderingContext2D,text:string,lineLengths:number[],x:number,y:number,leading:number){
  const chars=Array.from(text);let offset=0;
  for(const length of lineLengths){
    ctx.fillText(chars.slice(offset,offset+length).join(''),x,y);offset+=length;y+=leading;
  }
  return y;
}
export function drawPaperGuide(ctx:CanvasRenderingContext2D,card:GuideCard,image:HTMLImageElement,l:PaperGuideLayout,elapsed:number,duration:number,reducedMotion=false){
  const f=paperFrame(l,elapsed,duration,reducedMotion);
  if(!f.alpha)return;
  const art=card.art!;
  ctx.save();
  ctx.globalAlpha*=f.alpha;
  // The distant scene remains visible while the target first catches the light.
  ctx.save();
  ctx.globalAlpha*=f.veil*.14;
  ctx.fillStyle='#2c241a';ctx.fillRect(0,0,l.viewport.width,l.viewport.height);
  ctx.restore();
  const light=brightness(art.board)>.24;
  const single=l.style==='single-board';
  const board=single?art.board:tint(art.board,light?'#e1c79a':'#292d26',light?.24:.27);
  if(single){
    if(f.backing.width>.5 && f.backingAlpha>0){
      ctx.save();ctx.globalAlpha*=f.backingAlpha;
      ctx.fillStyle=board;
      ctx.fillRect(f.backing.left,f.backing.top,f.backing.width,f.backing.height);
      ctx.restore();
    }
  }else if(f.backingAlpha>0){
    const mountLight=tint('#f8f1df',art.board,.08),mountDark=tint('#e9dfcb',art.board,.16);
    // Cast one shallow shadow for a single folded sheet. The pigment label is printed
    // directly into the mount; adjoining edges never cast shadows onto each other.
    ctx.save();ctx.globalAlpha*=f.backingAlpha;
    ctx.shadowColor='rgba(53,39,19,.23)';ctx.shadowBlur=8;ctx.shadowOffsetY=3;
    ctx.fillStyle=mountDark;ctx.beginPath();
    ctx.rect(f.backing.left,f.backing.top,f.backing.width,f.backing.height);
    if(f.panelAlpha>.025)ctx.rect(f.panel.left,f.panel.top,f.panel.width,f.panel.height);
    ctx.fill();ctx.restore();
    ctx.save();ctx.globalAlpha*=f.backingAlpha;
    sheet(ctx,f.backing,mountLight,mountDark);ctx.restore();
  }
  if(f.panel.width>.5){
    if(!single){
      ctx.save();ctx.globalAlpha*=f.panelAlpha;
      sheet(ctx,f.panel,tint(board,light?'#f1dfbb':'#6c6d57',.13),board);
      ctx.restore();
    }
    if(f.textAlpha>0){
      ctx.save();ctx.globalAlpha*=f.textAlpha;
      ctx.beginPath();ctx.rect(f.panel.left,f.panel.top,f.panel.width,f.panel.height);ctx.clip();
      if(single){ctx.beginPath();ctx.rect(f.backing.left,f.backing.top,f.backing.width,f.backing.height);ctx.clip()}
      const ty=l.type,tx=l.panel.left+ty.pad+4;
      let y=l.panel.top+f.boardDrop+(l.panel.height-textHeight(ty))/2;
      ctx.fillStyle=brightness(board)>.18?'#221c14':'#fffae9';ctx.textBaseline='top';ctx.font=titleFont(ty.titleSize);
      y=paintLines(ctx,card.title,ty.title,tx,y,ty.titleSize*1.30);
      ctx.font=bodyFont(ty.bodySize,!single);
      paintLines(ctx,card.text,ty.body,tx,y+Math.round(ty.bodySize*.82),ty.bodySize*1.68);
      ctx.restore();
    }
  }
  const s=f.subject;
  // Illuminate the actual alpha silhouette, including every separated cluster in a group.
  ctx.save();
  ctx.shadowBlur=f.light>0?8+f.light*9:5;
  ctx.shadowColor=f.light>.18?'#ffe6a1':'rgba(95,66,30,.38)';
  if(single && f.light<=.18){
    ctx.shadowColor=art.glow;
    ctx.shadowBlur=4;
    ctx.shadowOffsetX=clamp(s.height*.015,3,8);
    ctx.shadowOffsetY=clamp(s.height*.008,2,4);
  }else{
    ctx.shadowOffsetX=f.light>0?0:2;ctx.shadowOffsetY=f.light>0?0:3;
  }
  if(l.reveal==='explain-then-shoot' && f.backingAlpha===0 && elapsed>duration/2)ctx.shadowColor='transparent';
  if(f.light>.01)ctx.filter='brightness('+(1+.22*f.light)+')';
  if(l.reveal==='polo-swing'||l.reveal==='stepped-poses'){
    drawPaintedPose(ctx,card,image,s,elapsed,duration,reducedMotion);
  }else if(!single||!drawArcheryStory(ctx,card,image,l,s,elapsed,duration,reducedMotion)){
    drawCollageSubject(ctx,card,image,s,f.motionMs,reducedMotion,!single);
    if(single)drawArcheryImpact(ctx,card,s,l);
  }
  ctx.restore();ctx.restore();
}
function contains(r:CardRect,x:number,y:number){return x>=r.left && x<r.left+r.width && y>=r.top && y<r.top+r.height}
export function hitPaperGuide(x:number,y:number,card:GuideCard,l:PaperGuideLayout,elapsed:number,duration:number,reducedMotion=false){
  const f=paperFrame(l,elapsed,duration,reducedMotion);
  if(f.alpha<=.015)return false;
  if(f.backingAlpha>.025&&contains(f.backing,x,y))return true;
  if(!l.style&&f.panelAlpha>.025&&contains(f.panel,x,y))return true;
  if(l.reveal==='polo-swing'||l.reveal==='stepped-poses')return hitPaintedPose(card,f.subject,x,y,elapsed,duration,reducedMotion);
  const storyHit=l.style?hitArcheryStory(card,l,f.subject,x,y,elapsed,duration,reducedMotion):undefined;
  return storyHit??hitCollageSubject(card,f.subject,x,y,f.motionMs,reducedMotion,!l.style);
}
