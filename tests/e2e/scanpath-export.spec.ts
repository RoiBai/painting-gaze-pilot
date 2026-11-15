import {test,expect} from '@playwright/test';

test('estimated trajectory PNG is rebuilt exactly from JSON and retains gaps before thinning',async({page})=>{
 await page.goto('/');
 const result=await page.evaluate(async()=>{
  const fixturePath='/tests/dataFixtures.ts',exportPath='/src/export.ts',scanpathPath='/src/scanpath.ts';
  const {sessionFixture,sampleFixture}=await import(/* @vite-ignore */fixturePath);
  const {buildExportFiles,canvasPNG}=await import(/* @vite-ignore */exportPath);
  const {renderScanpath,buildScanpath,defaultScanpath,SCANPATH_HEADER_PX,SCANPATH_FOOTER_PX}=await import(/* @vite-ignore */scanpathPath);
  const session=sessionFixture();
  const svg='<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><rect width="1200" height="800" fill="#eeeeee"/></svg>';
  for(const painting of session.config.paintings)painting.image='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);
  session.scanpath={...defaultScanpath,width:320};
  session.samples=[0,50,100,150,200,250].map((time,index)=>sampleFixture({sampleIndex:index,callbackTimeMs:time,imageNormX:.1+index*.12,imageNormY:.3+index*.04,...(index===2?{predictionAvailable:false,viewportX:null,viewportY:null,imageX:null,imageY:null,imageNormX:null,imageNormY:null}:{})}));
  session.timings=[{trialId:'A-1',paintingId:'A',startedMs:0,endedMs:500,wallMs:500,activeMs:500,status:'completed'}];
  const before=JSON.stringify(session.samples);
  const files=await buildExportFiles(session);
  const exported=JSON.parse(new TextDecoder().decode(files['session.json']));
  const regenerated=await canvasPNG(await renderScanpath(exported,exported.config.paintings[0],exported.scanpath));
  const png=files['scanpath_A.png'] as Uint8Array;
  const dv=new DataView(png.buffer,png.byteOffset,png.byteLength);
  const model=buildScanpath(exported,'A',exported.scanpath);
  return {exact:png.length===regenerated.length&&png.every((value:number,index:number)=>value===regenerated[index]),size:[dv.getUint32(16),dv.getUint32(20)],expectedSize:[320,Math.round(320*800/1200)+SCANPATH_HEADER_PX+SCANPATH_FOOTER_PX],counts:exported.exportMetadata.scanpathRenders.map((r:{sourceCount:number;displayedCount:number;segmentCount:number})=>[r.sourceCount,r.displayedCount,r.segmentCount]),segments:model.segments.map((segment:{sampleIndex:number}[])=>segment.map(p=>p.sampleIndex)),unmodified:JSON.stringify(session.samples)===before,params:exported.scanpath};
 });
 expect(result.exact).toBe(true);expect(result.unmodified).toBe(true);expect(result.size).toEqual(result.expectedSize);
 expect(result.counts).toEqual([[5,4,2],[0,0,0]]);expect(result.segments).toEqual([[0,1],[3,5]]);expect(result.params.displayIntervalMs).toBe(200);expect(result.params.maxGapMs).toBe(250);
});
