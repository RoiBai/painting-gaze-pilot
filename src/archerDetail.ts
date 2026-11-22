import {hitCollageSubject} from './cutoutMotion';
import type {GuideCard} from './cutoutCard';
import type {CardRect} from './types';

export interface ArrowPose {x:number;y:number;length:number;angle:number}

// Registration in the 728 × 896 Figma archer cutout. The tip and the last
// visible part of the shaft at the cheek are the ends of the painted arrow.
const tipX=2,tipY=203,tailX=291,tailY=197;
const inkLength=Math.hypot(tailX-tipX,tailY-tipY);
const inkAngle=Math.atan2(tailY-tipY,tailX-tipX);
const shaftWidth=294,shaftHeight=26;
const originX=3,originY=13;
let layers:{image:HTMLImageElement;figure:HTMLCanvasElement;shaft:HTMLCanvasElement}|undefined;

export function archerArrowPose(box:CardRect):ArrowPose{
  const dx=(tailX-tipX)*box.width/728,dy=(tailY-tipY)*box.height/896;
  return {x:box.left+tipX*box.width/728,y:box.top+tipY*box.height/896,
    length:Math.hypot(dx,dy),angle:Math.atan2(dy,dx)};
}

// Cut around the painted head and shaft, stopping at both edges of the bow
// grip and at the cheek. The hand, sleeve, quiver and bowstring stay intact.
function belongsToReleasedPiece(x:number,y:number){
  if(x<0||x>=tailX)return false;
  if(x<59)return y>=191 && y<215-Math.max(0,x-40)*.46;
  const center=201-(x-80)*.021;
  return x>=80 && y>=center-4.5 && y<center+3.4;
}

function layer(width:number,height:number){
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;return canvas;
}

export function prepareArcherDetail(image:HTMLImageElement):void{
  if(layers?.image===image)return;
  if(image.naturalWidth!==728||image.naturalHeight!==896)throw Error('弓手素材尺寸与箭的位置不一致。');
  const figure=layer(728,896);
  figure.dataset.archerLayer='released';
  const ctx=figure.getContext('2d')!;
  ctx.drawImage(image,0,0);
  const stripY=190,strip=layer(tailX,26),piece=strip.getContext('2d')!;
  const remaining=ctx.getImageData(0,stripY,strip.width,strip.height);
  const detached=piece.createImageData(strip.width,strip.height);
  for(let y=0;y<strip.height;y++)for(let x=0;x<strip.width;x++){
    if(!belongsToReleasedPiece(x+.5,stripY+y+.5))continue;
    const i=(y*strip.width+x)*4;
    detached.data.set(remaining.data.subarray(i,i+4),i);
    remaining.data.fill(0,i,i+4);
  }
  ctx.putImageData(remaining,0,stripY);
  piece.putImageData(detached,0,0);
  // The grip conceals this short stretch. Continue it with ink taken from
  // the adjacent exposed shaft, leaving both hands in the figure layer.
  piece.drawImage(image,109,196,21,9,59,7,21,9);
  const shaft=layer(shaftWidth,shaftHeight);
  shaft.dataset.archerLayer='shaft';
  const sc=shaft.getContext('2d')!;
  sc.translate(originX,originY);sc.rotate(-inkAngle);
  sc.drawImage(strip,-tipX,stripY-tipY);
  layers={image,figure,shaft};
}

export function drawReleasedArcher(ctx:CanvasRenderingContext2D,box:CardRect):void{
  if(!layers)throw Error('弓手图层尚未载入。');
  ctx.drawImage(layers.figure,box.left,box.top,box.width,box.height);
}

export function drawReleasedArrow(ctx:CanvasRenderingContext2D,pose:ArrowPose):void{
  if(!layers)throw Error('羽箭图层尚未载入。');
  const scale=pose.length/inkLength;
  ctx.save();ctx.translate(pose.x,pose.y);ctx.rotate(pose.angle);
  ctx.drawImage(layers.shaft,-originX*scale,-originY*scale,shaftWidth*scale,shaftHeight*scale);
  ctx.restore();
}

export function hitReleasedArcher(card:GuideCard,box:CardRect,x:number,y:number):boolean{
  if(belongsToReleasedPiece((x-box.left)*728/box.width,(y-box.top)*896/box.height))return false;
  return hitCollageSubject(card,box,x,y,0,true);
}

// Upper and lower ink edge of the straightened white arrowhead. These small
// contours also work for archived samples before the browser decodes the art.
const inkContour=[
  [-1,-1,2],[1,-4,5],[5,-7,7],[12,-9,10],[22,-9,10],
  [34,-8,10],[44,-6,8],[53,-5,6],[57,-5,4],
  [59,-2,2],[76,-2,2],[88,-2,2],[196,-2,1.8],[289,-1.8,1.8],
] as const;

export function hitReleasedArrow(pose:ArrowPose,x:number,y:number):boolean{
  if(pose.length<=0)return false;
  const dx=x-pose.x,dy=y-pose.y,cos=Math.cos(pose.angle),sin=Math.sin(pose.angle);
  const scale=inkLength/pose.length;
  const u=(dx*cos+dy*sin)*scale,v=(-dx*sin+dy*cos)*scale;
  if(u<inkContour[0][0])return false;
  for(let i=1;i<inkContour.length;i++){
    const [u1,top1,bottom1]=inkContour[i];
    if(u>u1)continue;
    const [u0,top0,bottom0]=inkContour[i-1];
    const t=(u-u0)/(u1-u0);
    return v>=top0+(top1-top0)*t && v<=bottom0+(bottom1-bottom0)*t;
  }
  return false;
}
