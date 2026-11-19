import type {Painting} from './types';
import type {GazeRegion,ReviewWindow,SegmentPoint} from './pilotSegments';

export const regionColors = {card:'#c3452d',painting:'#165fa4',other:'#75428d'} as const;
export const regionLabels:Record<GazeRegion,string>={card:'卡片',painting:'画面',other:'其他位置',offscreen:'视口外',missing:'缺少有效观测'};

function wrapText(context:CanvasRenderingContext2D,text:string,x:number,y:number,width:number,leading:number){
  let line='';
  for(const char of text){
    if(line && context.measureText(line+char).width>width){
      context.fillText(line,x,y);
      line='';
      y+=leading;
    }
    line+=char;
  }
  if(line)context.fillText(line,x,y);
  return y+leading;
}

/** All inputs are the original viewport CSS coordinates; apply one uniform transform to the entire frame. */
export function drawSegment(canvas:HTMLCanvasElement,image:HTMLImageElement,painting:Painting,window:ReviewWindow,points:SegmentPoint[],until:number,live=false){
  const g=window.geometry;
  if(!g)return;
  const scale=Math.min(1,1600/g.viewportWidth,1200/g.viewportHeight);
  const width=Math.max(1,Math.round(g.viewportWidth*scale)),height=Math.max(1,Math.round(g.viewportHeight*scale));
  if(canvas.width!==width || canvas.height!==height){canvas.width=width;canvas.height=height}
  const ctx=canvas.getContext('2d');
  if(!ctx)return;
  ctx.setTransform(width/g.viewportWidth,0,0,height/g.viewportHeight,0,0);
  ctx.fillStyle='#eeede8';
  ctx.fillRect(0,0,g.viewportWidth,g.viewportHeight);
  ctx.drawImage(image,g.left,g.top,g.width,g.height);
  if(window.exposure){
    const {left,top,width:cardWidth,height:cardHeight}=window.exposure.rect;
    const card=painting.cards.find(c=>c.id===window.exposure!.cardId);
    ctx.save();
    ctx.beginPath();ctx.roundRect(left,top,cardWidth,cardHeight,6);
    ctx.fillStyle='#fffdf6';ctx.fill();ctx.strokeStyle='#8a786a';ctx.lineWidth=1.5;ctx.stroke();ctx.clip();
    if(card){
      ctx.textBaseline='top';ctx.fillStyle='#25372e';ctx.font='600 21px "Songti SC",serif';
      const bodyY=wrapText(ctx,card.title,left+20,top+16,cardWidth-40,28)+6;
      ctx.font='16px "PingFang SC",sans-serif';
      wrapText(ctx,card.text,left+20,bodyY,cardWidth-40,25.6);
    }
    ctx.restore();
  }
  let last:SegmentPoint|undefined;
  for(const point of points){
    if(point.sample.callbackTimeMs>until)break;
    if(point.region==='missing'||point.region==='offscreen'){last=undefined;continue}
    const x=point.sample.viewportX!,y=point.sample.viewportY!;
    const color=regionColors[point.region];
    if(last&&point.connects){
      ctx.beginPath();ctx.moveTo(last.sample.viewportX!,last.sample.viewportY!);ctx.lineTo(x,y);
      ctx.strokeStyle=color;ctx.globalAlpha=.78;ctx.lineWidth=2.4;ctx.stroke();
    }
    ctx.beginPath();ctx.arc(x,y,3.1,0,2*Math.PI);
    ctx.fillStyle=color;ctx.globalAlpha=.9;ctx.fill();
    last=point;
  }
  ctx.globalAlpha=1;
  if(last && live && until-last.sample.callbackTimeMs<=150){
    ctx.beginPath();ctx.arc(last.sample.viewportX!,last.sample.viewportY!,9,0,2*Math.PI);
    ctx.strokeStyle='white';ctx.lineWidth=4;ctx.stroke();ctx.lineWidth=2;ctx.strokeStyle='#202420';ctx.stroke();
  }
}
