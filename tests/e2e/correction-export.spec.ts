import {test,expect} from '@playwright/test';

test('correction is exported separately, stays reproducible, and never rewrites raw samples or quality',async({page})=>{
  await page.goto('/');
  const result=await page.evaluate(async()=>{
    const fixturePath='/tests/correctionExportFixture.ts',exportPath='/src/export.ts',rendererPath='/src/correctionRender.ts';
    const {correctionExportFixture}=await import(/* @vite-ignore */fixturePath);
    const {buildExportFiles,buildTextExportFiles,canvasPNG}=await import(/* @vite-ignore */exportPath);
    const {renderCorrectedHeatmap,renderCorrectedScanpath}=await import(/* @vite-ignore */rendererPath);
    const session=correctionExportFixture();
    const before=JSON.stringify(session);
    const rawFiles=buildTextExportFiles(session);
    const files=await buildExportFiles(session);
    const decode=(name:string)=>new TextDecoder().decode(files[name]);
    const snapshot=JSON.parse(decode('session.json'));
    const correction=JSON.parse(decode('correction.json'));
    const parse=(csv:string)=>{
      const table:string[][]=[];let row:string[]=[],cell='',quoted=false;
      for(let i=0;i<csv.length;i++){
        const c=csv[i];
        if(c==='"'){if(quoted&&csv[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}
        else if(c===','&&!quoted){row.push(cell);cell='';}
        else if((c==='\r'||c==='\n')&&!quoted){if(c==='\r'&&csv[i+1]==='\n')i++;row.push(cell);table.push(row);row=[];cell='';}
        else cell+=c;
      }
      if(cell||row.length){row.push(cell);table.push(row);}
      return table;
    };
    const rows=parse(decode('gaze_samples_corrected.csv').replace(/^\ufeff/,''));
    const columns=rows.shift()!;
    const get=(row:number,key:string)=>rows[row][columns.indexOf(key)];
    const equals=(a:Uint8Array,b:Uint8Array)=>a.length===b.length&&a.every((v:number,i:number)=>v===b[i]);
    const heatmap=await canvasPNG(await renderCorrectedHeatmap(snapshot,snapshot.config.paintings[0],correction.parameters.heatmap,false,correction.plan));
    const scanpath=await canvasPNG(await renderCorrectedScanpath(snapshot,snapshot.config.paintings[0],correction.parameters.scanpath,{},correction.plan));
    const sizes=correction.renders.map((render:{file:string;width:number;height:number})=>{
      const png=files[render.file] as Uint8Array;
      const view=new DataView(png.buffer,png.byteOffset,png.byteLength);
      return [view.getUint32(16),view.getUint32(20),render.width,render.height];
    });
    return {
      names:Object.keys(files),unchanged:JSON.stringify(session)===before,originalSamplesEqual:JSON.stringify(snapshot.samples)===JSON.stringify(session.samples),
      rawCsvEqual:equals(rawFiles['gaze_samples.csv'],files['gaze_samples.csv']),rawQuality:snapshot.quality,recordedQuality:correction.originalQuality,
      rowCount:rows.length,middle:{x:get(2,'correctedViewportX'),y:get(2,'correctedViewportY'),rawX:get(2,'rawViewportX'),rawY:get(2,'rawViewportY'),applied:get(2,'correctionApplied')},
      nullRow:{x:get(1,'correctedViewportX'),y:get(1,'correctedViewportY'),rawX:get(1,'rawViewportX'),applied:get(1,'correctionApplied')},
      identicalHeatmap:equals(heatmap,files['heatmap_A_corrected.png']),identicalScanpath:equals(scanpath,files['scanpath_A_corrected.png']),sizes,
      metadataAvailable:snapshot.exportMetadata.correction.derivedFilesAvailable,
    };
  });
  expect(result.names).toHaveLength(13);
  expect(result.names).toEqual(expect.arrayContaining(['gaze_samples.csv','session.json','heatmap_A.png','scanpath_A.png','heatmap_B.png','scanpath_B.png','gaze_samples_corrected.csv','correction.json','heatmap_A_corrected.png','scanpath_A_corrected.png']));
  expect(result.names).not.toContain('heatmap_B_corrected.png');
  expect(result.names).not.toContain('scanpath_B_corrected.png');
  expect(result.unchanged).toBe(true);expect(result.originalSamplesEqual).toBe(true);expect(result.rawCsvEqual).toBe(true);
  expect(result.rawQuality).toBe('low_quality');expect(result.recordedQuality).toBe('low_quality');
  expect(result.rowCount).toBe(4);expect(result.middle).toEqual({x:'600',y:'400',rawX:'650',rawY:'390',applied:'true'});
  expect(result.nullRow).toEqual({x:'',y:'',rawX:'',applied:'false'});
  expect(result.identicalHeatmap).toBe(true);expect(result.identicalScanpath).toBe(true);expect(result.metadataAvailable).toBe(true);
  for(const [width,height,recordedWidth,recordedHeight] of result.sizes)expect([width,height]).toEqual([recordedWidth,recordedHeight]);
});
