import {loadCutout,type GuideCard} from './cutoutCard';
import {prepareArcherDetail,prepareBowDraw,archerArrowPose,drawArrowRim,drawBowArcher,drawBowGrip,drawReleasedArcher,drawReleasedArrow,hitArrowRim,hitDrawingArcher,hitReleasedArcher,hitReleasedArrow,type ArrowPose} from './archerDetail';
import type {PaperGuideLayout} from './paperGuide';
import {hitCollageSubject} from './cutoutMotion';
import catalogue from './uciCatalogue.json' with {type:'json'};
import type {CardRect,Geometry} from './types';

const arrowId='archery-figma-1-6';
const targetId='archery-figma-0-6';
const archer=catalogue.cards.find(c=>c.scene==='archery'&&c.node==='1:2')!;
// Reserve the document's definition of 侯 for the target card.
export const archerGuide:GuideCard={id:'archery-figma-1-2',title:archer.title,text:archer.text.replace(/^“侯”即箭靶。/,''),art:archer,
  location:archer.title,aoiIds:['figma-1-2'],source:archer.image};
const arrow=catalogue.cards.find(c=>c.scene==='archery'&&c.node==='1:6')!;
const arrowCard:GuideCard={id:arrowId,aoiIds:['figma-1-6'],location:arrow.title,title:arrow.title,text:arrow.text,source:arrow.image,art:arrow};
let arrowImage:HTMLImageElement|undefined;
let paperSilhouette:HTMLCanvasElement|undefined;

export async function prepareArcheryStory(card:GuideCard,prior=false,focused=false,independent=false):Promise<void>{
  if(independent&&(card.id===archerGuide.id||card.id===arrowId||card.id===targetId))await loadArrowIllustration();
  if(focused&&card.id==='archery-figma-1-2'){
    prepareBowDraw(await loadCutout(archer));
    return;
  }
  if(focused&&card.id===arrowId){
    prepareArcherDetail(await loadCutout(archer));
    return;
  }
  if(card.id===targetId&&!prior){
    prepareArcherDetail(await loadCutout(archer));
    return;
  }
  if(card.id!==targetId&&card.id!==arrowId)return;
  await loadArrowIllustration();
}
async function loadArrowIllustration(){
  arrowImage=await loadCutout(arrow);
  if(!paperSilhouette){
    const mask=document.createElement('canvas');
    mask.width=arrowImage.naturalWidth;mask.height=arrowImage.naturalHeight;
    const ctx=mask.getContext('2d')!;
    ctx.drawImage(arrowImage,0,0);
    ctx.globalCompositeOperation='source-in';ctx.fillStyle='#ffdfaa';ctx.fillRect(0,0,mask.width,mask.height);
    paperSilhouette=mask;
  }
}

interface Point {x:number;y:number}
interface Placement {source?:CardRect;tip?:Point;detailWidth?:number;rightSpace?:number}
type Layout=Pick<PaperGuideLayout,'source'|'art'|'impact'|'landedArrowLength'|'reveal'|'bowBox'|'arrowSprite'>;
type Shaft={x:number;y:number;length:number;angle:number};

// Landmarks in the full 6888 × 1966 crop, independent of the padded acquisition
// AOIs. Measurements are in original painting pixels, including the shaft length.
const hand={x:4120,y:1098},bullseye={x:1631,y:915},paintedLength=156;
const focusScale=1.6;
const trajectory=Math.atan2(hand.y-bullseye.y,hand.x-bullseye.x);
const aspect=arrow.shape.width/arrow.shape.height;
export function archeryTargetPoint(g:Geometry):Point{
  return {x:g.left+bullseye.x*g.width/6888,y:g.top+bullseye.y*g.height/1966};
}

export function releasedPose(subject:CardRect,impact:Point,elapsed:number,duration:number,reduced:boolean):ArrowPose|null{
  const t=elapsed/duration;
  if(t<(reduced?.70:.72))return null;
  const from=archerArrowPose(subject);
  const progress=reduced?1:ramp(t,.72,.88);
  const angle=Math.atan2(from.y-impact.y,from.x-impact.x);
  return {x:mix(from.x,impact.x,progress),y:mix(from.y,impact.y,progress),
    length:from.length,angle:mix(from.angle,angle,Math.min(1,progress*4))};
}
export function archeryPlacement(card:GuideCard,g:Geometry):Placement{
  if(card.id===targetId)return {rightSpace:.20};
  if(card.id!==arrowId)return {};
  const w=g.width/6888,h=g.height/1966;
  const width=paintedLength*w,height=width/aspect;
  return {
    source:{left:g.left+hand.x*w,top:g.top+hand.y*h-height/2,width,height},
    detailWidth:Math.max(width,Math.min(60,Math.max(30,width*focusScale))),
    tip:{x:g.left+bullseye.x*w,y:g.top+bullseye.y*h},
  };
}

const mix=(a:number,b:number,t:number)=>a+(b-a)*t;
function ramp(t:number,start:number,end:number){return Math.max(0,Math.min(1,(t-start)/(end-start)))}
function smooth(t:number){return t*t*(3-2*t)}

export function focusedArrowLength(handLength:number,viewportWidth:number){
  return Math.min(viewportWidth*.35,Math.max(Math.min(150,viewportWidth*.27),handLength*2.15));
}

export function focusedArrowPose(l:Layout,elapsed:number,duration:number,reduced:boolean):ArrowPose{
  const start=archerArrowPose(l.bowBox!);
  const fraction=elapsed/Math.max(1,duration);
  const zoom=reduced?1:smooth(ramp(fraction,0,.15));
  const travel=reduced?Number(fraction>=.70):ramp(fraction,.72,.88);
  const x=mix(start.x,l.art.left,zoom),y=mix(start.y,l.art.top+l.art.height/2,zoom);
  return {x:mix(x,l.impact!.x,travel),y:mix(y,l.impact!.y,travel),
    length:mix(start.length,l.art.width,zoom),angle:mix(start.angle*(1-zoom),trajectory,Math.min(1,travel*4))};
}
function archerContextAlpha(elapsed:number,duration:number,reduced:boolean){
  return reduced?0:1-smooth(ramp(elapsed/Math.max(1,duration),.01,.15));
}

// At normal study speed the text finishes fading at 7 s. The painted shaft
// settles back at the hand before its one-way, constant-scale flight begins.
export function archeryTiming(elapsed:number,duration:number,reduced:boolean){
  const t=elapsed/Math.max(1,duration);
  if(reduced){
    const landed=Number(t>=.7);
    return {boardAlpha:1-landed,reveal:1,returnToBow:landed,travel:landed,aim:landed};
  }
  return {
    boardAlpha:1-smooth(ramp(t,.64,.70)),
    reveal:smooth(ramp(t,.023,.11)),
    returnToBow:smooth(ramp(t,.70,.77)),
    aim:smooth(ramp(t,.77,.79)),
    travel:ramp(t,.79,.90),
  };
}

export function archeryFlight(layout:Layout,elapsed:number,duration:number,reduced:boolean){
  const {source,art}=layout;
  const timing=archeryTiming(elapsed,duration,reduced);
  const origin={x:source.left,y:source.top+source.height/2};
  const end=layout.impact??{
    x:origin.x+(bullseye.x-hand.x)*source.width/paintedLength,
    y:origin.y+(bullseye.y-hand.y)*source.width/paintedLength,
  };
  const lifted=timing.reveal*(1-timing.returnToBow);
  const liftedX=mix(origin.x,art.left,lifted);
  const liftedY=mix(origin.y,art.top+art.height/2,lifted);
  const shaft:Shaft={
    x:mix(liftedX,end.x,timing.travel),
    y:mix(liftedY,end.y,timing.travel),
    length:mix(source.width,art.width,lifted),
    angle:trajectory*timing.aim,
  };
  return {shaft,end,readingContrast:timing.reveal*timing.boardAlpha};
}

// The original roundel is 100 px across. Match the same shaft-to-roundel ratio
// as the target grows. The exported target has a 105 px disk spanning x=67..172.
export function lodgedArrow(subject:CardRect):Shaft{
  return {
    x:subject.left+subject.width*(121/172),
    y:subject.top+subject.height*(378/896),
    length:subject.width*(105/172)*(paintedLength/100),
    angle:trajectory,
  };
}
const outlineWidth=.65;
const rimOffsets=[[-.65,0],[.65,0],[0,-.65],[0,.65]] as const;
function drawShaft(ctx:CanvasRenderingContext2D,image:HTMLImageElement,shaft:Shaft,readingContrast=0){
  const height=shaft.length/aspect;
  ctx.save();ctx.translate(shaft.x,shaft.y);ctx.rotate(shaft.angle);
  // The fine painted shaft can be thinner than one screen pixel. Give its
  // existing centerline enough ink to survive resampling at the original size.
  ctx.shadowColor='transparent';ctx.shadowBlur=0;ctx.filter='none';
  if(readingContrast>0){
    // A hairline paper-colored edge distinguishes the lifted bronze shaft from
    // the pigment board. It fades with the copy, leaving only original ink in flight.
    ctx.save();ctx.globalAlpha*=readingContrast*.92;
    if(paperSilhouette){
      for(const [dx,dy] of rimOffsets)ctx.drawImage(paperSilhouette,dx,-height/2+dy,shaft.length,height);
    }
    ctx.lineWidth=1.5;ctx.strokeStyle='#ffdfaa';
    ctx.beginPath();ctx.moveTo(shaft.length*.02,.32);ctx.lineTo(shaft.length*.97,.32);ctx.stroke();
    ctx.restore();
  }
  if(height<2.5){
    ctx.strokeStyle='rgba(69,44,24,.72)';ctx.lineWidth=outlineWidth;
    ctx.beginPath();ctx.moveTo(shaft.length*.06,0);ctx.lineTo(shaft.length*.89,0);ctx.stroke();
  }
  ctx.drawImage(image,0,-height/2,shaft.length,height);
  ctx.restore();
}
function hitShaft(x:number,y:number,shaft:Shaft,readingContrast=0){
  const height=shaft.length/aspect;
  const dx=x-shaft.x,dy=y-shaft.y,cos=Math.cos(shaft.angle),sin=Math.sin(shaft.angle);
  const u=dx*cos+dy*sin,v=dy*cos-dx*sin;
  if(readingContrast>.025&&u>=shaft.length*.02&&u<=shaft.length*.97&&Math.abs(v-.32)<=.75)return true;
  if(height<2.5&&u>=shaft.length*.06&&u<=shaft.length*.89&&Math.abs(v)<=outlineWidth/2)return true;
  const rect={left:0,top:-height/2,width:shaft.length,height};
  if(hitCollageSubject(arrowCard,rect,u,v,0,true))return true;
  return readingContrast>.025&&rimOffsets.some(([dx,dy])=>hitCollageSubject(arrowCard,rect,u-dx,v-dy,0,true));
}

// Figma 1:6 is already point-left. Pin the first metal pixel (0,17) to the
// trajectory and map the nock at x=767 to the requested tip-to-tail length.
function registerCatalogueArrow(pose:ArrowPose):Shaft{
  const scale=pose.length/767;
  const dx=-.5*scale,dy=-1.5*scale,cos=Math.cos(pose.angle),sin=Math.sin(pose.angle);
  return {...pose,x:pose.x+dx*cos-dy*sin,y:pose.y+dx*sin+dy*cos,length:768*scale};
}
function drawCatalogueArrow(ctx:CanvasRenderingContext2D,pose:ArrowPose,contrast=0){
  if(!arrowImage)throw Error('羽箭抠图尚未载入。');
  drawShaft(ctx,arrowImage,registerCatalogueArrow(pose),contrast);
}
function hitCatalogueArrow(pose:ArrowPose,x:number,y:number,contrast=0){
  return hitShaft(x,y,registerCatalogueArrow(pose),contrast);
}

export function drawArcheryStory(ctx:CanvasRenderingContext2D,card:GuideCard,image:HTMLImageElement,layout:Layout,
  subject:CardRect,elapsed:number,duration:number,reduced:boolean):boolean{
  if(layout.reveal==='archer-draw'){
    drawBowArcher(ctx,subject,elapsed,duration,reduced,layout.arrowSprite?drawCatalogueArrow:undefined);
    return true;
  }
  if(layout.reveal==='arrow-release'){
    const alpha=archerContextAlpha(elapsed,duration,reduced);
    const pose=focusedArrowPose(layout,elapsed,duration,reduced);
    const contrast=(1-alpha)*archeryTiming(elapsed,duration,reduced).boardAlpha;
    if(!layout.arrowSprite){
      drawArrowRim(ctx,pose,contrast);
      drawReleasedArrow(ctx,pose);
    }
    if(alpha>0){
      ctx.save();ctx.globalAlpha*=alpha;drawReleasedArcher(ctx,layout.bowBox!);ctx.restore();
    }
    if(layout.arrowSprite){
      drawCatalogueArrow(ctx,pose,contrast);
      if(alpha>0){
        ctx.save();ctx.globalAlpha*=alpha;drawBowGrip(ctx,layout.bowBox!,3);ctx.restore();
      }
    }
    return true;
  }
  if(layout.reveal==='archer-release'&&layout.impact){
    const released=releasedPose(subject,layout.impact,elapsed,duration,reduced);
    if(!released)return false;
    drawReleasedArcher(ctx,subject);
    drawReleasedArrow(ctx,released);
    return true;
  }
  if(layout.reveal==='arrow-detail')return false;
  if(card.id!==arrowId)return false;
  const {shaft,readingContrast}=archeryFlight(layout,elapsed,duration,reduced);
  drawShaft(ctx,image,shaft,readingContrast);
  return true;
}
function targetPose(subject:CardRect,layout:Layout):ArrowPose{
  const tip=lodgedArrow(subject);
  return {...tip,length:layout.landedArrowLength??tip.length};
}
export function drawArcheryImpact(ctx:CanvasRenderingContext2D,card:GuideCard,subject:CardRect,layout:Layout){
  if(card.id!==targetId)return;
  if(layout.arrowSprite)drawCatalogueArrow(ctx,targetPose(subject,layout));
  else if(layout.reveal==='landed-arrow')drawReleasedArrow(ctx,targetPose(subject,layout));
  else if(arrowImage)drawShaft(ctx,arrowImage,lodgedArrow(subject));
}
export function hitArcheryStory(card:GuideCard,layout:Layout,subject:CardRect,x:number,y:number,
  elapsed:number,duration:number,reduced:boolean):boolean|undefined{
  if(layout.reveal==='archer-draw')return hitDrawingArcher(card,subject,x,y,elapsed,duration,reduced,layout.arrowSprite?hitCatalogueArrow:hitReleasedArrow);
  if(layout.reveal==='arrow-release'){
    const pose=focusedArrowPose(layout,elapsed,duration,reduced);
    const alpha=archerContextAlpha(elapsed,duration,reduced);
    const contrast=(1-alpha)*archeryTiming(elapsed,duration,reduced).boardAlpha;
    if(layout.arrowSprite){
      if(hitCatalogueArrow(pose,x,y,contrast))return true;
    }else if(hitReleasedArrow(pose,x,y)||(contrast>.025&&hitArrowRim(pose,x,y)))return true;
    // The fading contextual silhouette is the archer's cutout, not the
    // detached arrow entry whose gaze region and alpha mask are different.
    return alpha>.025&&hitReleasedArcher(archerGuide,layout.bowBox!,x,y);
  }
  if(layout.reveal==='archer-release'&&layout.impact){
    const released=releasedPose(subject,layout.impact,elapsed,duration,reduced);
    return released?hitReleasedArcher(card,subject,x,y)||hitReleasedArrow(released,x,y):undefined;
  }
  if(layout.reveal==='arrow-detail')return undefined;
  if(card.id===arrowId){
    const {shaft,readingContrast}=archeryFlight(layout,elapsed,duration,reduced);
    return hitShaft(x,y,shaft,readingContrast);
  }
  if(layout.reveal==='landed-arrow'){
    const hit=layout.arrowSprite?hitCatalogueArrow:hitReleasedArrow;
    return hit(targetPose(subject,layout),x,y)||undefined;
  }
  if(card.id===targetId&&hitShaft(x,y,lodgedArrow(subject)))return true;
  return undefined;
}
