import {loadCutout,type GuideCard} from './cutoutCard';
import {hitCollageSubject} from './cutoutMotion';
import catalogue from './uciCatalogue.json' with {type:'json'};
import type {CardRect,Geometry} from './types';

const arrowId='archery-figma-1-6';
const targetId='archery-figma-0-6';
const arrow=catalogue.cards.find(c=>c.scene==='archery'&&c.node==='1:6')!;
const target=catalogue.cards.find(c=>c.scene==='archery'&&c.node==='0:6')!;
const arrowCard:GuideCard={id:arrowId,aoiIds:['figma-1-6'],location:arrow.title,title:arrow.title,text:arrow.text,source:arrow.image,art:arrow};
let targetImage:HTMLImageElement|undefined;
let arrowImage:HTMLImageElement|undefined;

export async function prepareArcheryStory(card:GuideCard):Promise<void>{
  if(card.id===arrowId)targetImage=await loadCutout(target);
  if(card.id===targetId)arrowImage=await loadCutout(arrow);
}

interface Point {x:number;y:number}
interface Placement {source?:CardRect;tip?:Point;rightSpace?:number}
type Layout={source:CardRect;art:CardRect};
type Shaft={x:number;y:number;length:number;angle:number};

// Measured in the original 6888 × 1966 scene. The arrow's acquisition AOI
// includes empty space above/below it and would give the shaft a false size.
export function archeryPlacement(card:GuideCard,g:Geometry):Placement{
  if(card.id===targetId)return {rightSpace:.32};
  if(card.id!==arrowId)return {};
  const w=g.width/6888,h=g.height/1966;
  const width=156*w,height=width*arrow.shape.height/arrow.shape.width;
  return {
    source:{left:g.left+4120*w,top:g.top+1098*h-height/2,width,height},
    tip:{x:g.left+1631*w,y:g.top+915*h},
  };
}

const clamp=(x:number)=>Math.max(0,Math.min(1,x));
const mix=(a:number,b:number,t:number)=>a+(b-a)*t;
export function archeryFlight(layout:Layout,elapsed:number,duration:number,reduced:boolean){
  // Hold on the painted bow, fly once, then leave the shaft in place to read.
  const time=elapsed/Math.max(.001,Math.min(1,duration/3400));
  const progress=reduced?1:clamp((time-950)/1180);
  const end={x:layout.art.left,y:layout.art.top+layout.art.height/2};
  const start={x:layout.source.left,y:layout.source.top+layout.source.height/2};
  const horizontal=end.x-start.x,vertical=end.y-start.y;
  const angle=Math.atan2(-vertical,Math.max(1,-horizontal));
  const shaft:Shaft={
    x:mix(start.x,end.x,progress),y:mix(start.y,end.y,progress),
    angle:angle*Math.min(1,progress*5),
    length:mix(layout.source.width,layout.art.width,progress),
  };
  const radius=Math.max(7,Math.min(21,layout.art.width*.067));
  return {shaft,end,radius,diskAlpha:reduced?1:clamp((time-550)/650)};
}

// The motif's center is (121,378) in the full 172 × 896 target cutout.
// Use the same painted circle for arrival and the subsequent target detail.
function lodged(subject:CardRect):Shaft{
  return {
    x:subject.left+subject.width*(121/172),
    y:subject.top+subject.height*(378/896),
    length:subject.height*.32,
    angle:Math.atan2(1098-915,4120-1631),
  };
}
function drawShaft(ctx:CanvasRenderingContext2D,image:HTMLImageElement,shaft:Shaft){
  const height=shaft.length*arrow.shape.height/arrow.shape.width;
  ctx.save();ctx.translate(shaft.x,shaft.y);ctx.rotate(shaft.angle);
  ctx.drawImage(image,0,-height/2,shaft.length,height);
  ctx.restore();
}
function hitShaft(x:number,y:number,shaft:Shaft){
  const height=shaft.length*arrow.shape.height/arrow.shape.width;
  const dx=x-shaft.x,dy=y-shaft.y,cos=Math.cos(shaft.angle),sin=Math.sin(shaft.angle);
  return hitCollageSubject(arrowCard,{left:0,top:-height/2,width:shaft.length,height},
    dx*cos+dy*sin,dy*cos-dx*sin,0,true);
}

export function drawArcheryStory(ctx:CanvasRenderingContext2D,card:GuideCard,image:HTMLImageElement,layout:Layout,
  _subject:CardRect,elapsed:number,duration:number,reduced:boolean):boolean{
  if(card.id!==arrowId)return false;
  const {shaft,end,radius,diskAlpha}=archeryFlight(layout,elapsed,duration,reduced);
  if(targetImage&&diskAlpha>0){
    // Crop the roundel from the imported painting. A circular clip excludes
    // the pieces of the pole attached immediately above and below it.
    ctx.save();ctx.globalAlpha*=diskAlpha;
    ctx.beginPath();ctx.arc(end.x,end.y,radius,0,Math.PI*2);ctx.clip();
    ctx.drawImage(targetImage,67,324,106,108,end.x-radius,end.y-radius,2*radius,2*radius);
    ctx.restore();
  }
  drawShaft(ctx,image,shaft);
  return true;
}
export function drawArcheryImpact(ctx:CanvasRenderingContext2D,card:GuideCard,subject:CardRect){
  if(card.id===targetId&&arrowImage)drawShaft(ctx,arrowImage,lodged(subject));
}
export function hitArcheryStory(card:GuideCard,layout:Layout,subject:CardRect,x:number,y:number,
  elapsed:number,duration:number,reduced:boolean):boolean|undefined{
  if(card.id===arrowId){
    const {shaft,end,radius,diskAlpha}=archeryFlight(layout,elapsed,duration,reduced);
    return hitShaft(x,y,shaft)||(diskAlpha>.025&&Math.hypot(x-end.x,y-end.y)<radius);
  }
  if(card.id===targetId&&hitShaft(x,y,lodged(subject)))return true;
  return undefined;
}
