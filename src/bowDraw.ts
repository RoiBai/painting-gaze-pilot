import type {ArrowPose} from './archerDetail';
import type {CardRect} from './types';

// The museum image records the final, fully drawn pose. Work backwards from
// it in the transparent cutout's own coordinates. Each patch tapers to zero
// before the cap, face, robe, quiver and legs, which stay registered.
function patch(x:number,y:number,cx:number,cy:number,rx:number,ry:number){
  const dx=(x-cx)/rx,dy=(y-cy)/ry;
  const weight=Math.max(0,1-dx*dx-dy*dy);
  return weight*weight;
}
export function bowSample(x:number,y:number,slack:number){
  const hand=patch(x,y,93,225,212,247);
  const elbow=patch(x,y,566,172,129,117);
  const upperTip=patch(x,y,271,38,67,85);
  const lowerTip=patch(x,y,239,455,82,123);
  return {x:x+slack*(-46*hand+50*elbow+20*(upperTip+lowerTip)),
    y:y+slack*(-10*hand-23*elbow+4*lowerTip)};
}

const slackByFrame=[1,.62,.27,0] as const;
export function bowDrawIndex(elapsed:number,duration:number,reduced:boolean){
  if(reduced)return 3;
  const phase=elapsed/Math.max(1,duration);
  if(phase<.18)return 0;
  if(phase<.29)return 1;
  if(phase<.41)return 2;
  return 3;
}
export function bowDrawSlack(index:number){return slackByFrame[index]}
export function arrowAtDraw(pose:ArrowPose,box:CardRect,index:number):ArrowPose{
  const slack=bowDrawSlack(index);
  return {...pose,x:pose.x-43*slack*box.width/728,y:pose.y+4*slack*box.height/896};
}

// Bake just the moving upper part once per source image. The sprites and
// offline gaze hit test use the same destination-to-source coordinates.
export function drawingPoses(figure:HTMLCanvasElement):HTMLCanvasElement[]{
  const w=figure.width,h=510;
  const original=figure.getContext('2d')!.getImageData(0,0,w,h);
  return slackByFrame.slice(0,-1).map((slack,index)=>{
    const pose=document.createElement('canvas');pose.width=w;pose.height=figure.height;
    pose.dataset.archerLayer='draw-'+index;
    const ctx=pose.getContext('2d')!;
    ctx.drawImage(figure,0,0);
    const result=new ImageData(new Uint8ClampedArray(original.data),w,h);
    for(let y=0;y<h;y++)for(let x=0;x<651;x++){
      const source=bowSample(x,y,slack);
      const sx=Math.round(source.x),sy=Math.round(source.y);
      if(sx===x&&sy===y)continue;
      const i=(y*w+x)*4;
      if(sx<0||sy<0||sx>=w||sy>=h){result.data.fill(0,i,i+4);continue}
      const j=(sy*w+sx)*4;
      result.data[i]=original.data[j];result.data[i+1]=original.data[j+1];
      result.data[i+2]=original.data[j+2];result.data[i+3]=original.data[j+3];
    }
    ctx.putImageData(result,0,0);
    return pose;
  });
}
