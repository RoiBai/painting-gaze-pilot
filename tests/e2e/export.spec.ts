import {test,expect} from '@playwright/test';

test('export PNGs are exactly reproducible from the exported samples and parameters',async({page})=>{
  await page.goto('/');
  const result=await page.evaluate(async()=>{
    const fixturePath='/tests/dataFixtures.ts',exportPath='/src/export.ts',heatmapPath='/src/heatmap.ts';
    const {sessionFixture,sampleFixture}=await import(/* @vite-ignore */ fixturePath);
    const {buildExportFiles,canvasPNG}=await import(/* @vite-ignore */ exportPath);
    const {renderHeatmap}=await import(/* @vite-ignore */ heatmapPath);
    const session=sessionFixture();
    const svg='<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><rect width="1200" height="800" fill="#eeeeee"/></svg>';
    for(const painting of session.config.paintings)painting.image='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);
    session.samples=[sampleFixture(),sampleFixture({phase:'pre'}),sampleFixture({paused:true}),sampleFixture({insideImage:false,imageNormX:1.8})];
    session.timings=[{trialId:'A-1',paintingId:'A',startedMs:0,endedMs:1000,wallMs:1000,activeMs:1000,status:'completed'}];
    const files=await buildExportFiles(session);
    const exported=JSON.parse(new TextDecoder().decode(files['session.json']));
    const regenerated=await canvasPNG(await renderHeatmap(exported,exported.config.paintings[0],exported.heatmap,false));
    const png=files['heatmap_A.png'] as Uint8Array;
    const dv=new DataView(png.buffer,png.byteOffset,png.byteLength);
    return {files:Object.keys(files),exact:png.length===regenerated.length&&png.every((v:number,i:number)=>v===regenerated[i]),size:[dv.getUint32(16),dv.getUint32(20)],counts:exported.exportMetadata.heatmapRenders.map((x:{sampleCount:number})=>x.sampleCount),prefix:[...png.slice(0,8)]};
  });
  expect(result.files).toEqual(['gaze_samples.csv','phase_events.csv','responses.csv','validation.csv','session.json','heatmap_A.png','scanpath_A.png','heatmap_B.png','scanpath_B.png']);
  expect(result.exact).toBe(true);
  expect(result.size).toEqual([320,459]);
  expect(result.counts).toEqual([1,0]);
  expect(result.prefix).toEqual([137,80,78,71,13,10,26,10]);
});
