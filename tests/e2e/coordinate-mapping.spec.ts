import {test,expect} from '@playwright/test';

// Isolated Playwright context, no real camera or user records. Artificial screen
// positions are used only in memory to check rendering, never persisted/exported.
test.use({viewport:{width:1440,height:900},deviceScaleFactor:2});

test('both long scenes preserve DOM geometry and left/centre/right positions at DPR 2',async({page})=>{
  await page.addInitScript(()=>{
    const target=window as any;
    target.__coordinateAuditBoxes=[];
    new MutationObserver(()=>{
      const image=document.querySelector('.stimulus img') as HTMLImageElement|null;
      if(!image)return;
      const box=image.getBoundingClientRect();
      const state={src:image.getAttribute('src'),visibility:getComputedStyle(image).visibility,left:box.left,top:box.top,width:box.width,height:box.height};
      const list=target.__coordinateAuditBoxes;
      if(JSON.stringify(list.at(-1))!==JSON.stringify(state))list.push(state);
    }).observe(document,{childList:true,subtree:true,attributes:true,attributeFilter:['style','class']});
  });
  await page.goto('/');
  await page.getByRole('button',{name:'研究者设置',exact:true}).click();
  await page.getByText('替换材料和完整配置（JSON）').click();
  const config=await page.evaluate(async()=>{
    const path='/src/study.ts';
    const {defaultConfig}=await import(/* @vite-ignore */path);
    return {...defaultConfig,durationSeconds:5,calibrationClicks:1,validation:{...defaultConfig.validation,targetDurationMs:150,settleMs:50}};
  });
  await page.getByRole('textbox',{name:'完整配置 JSON'}).fill(JSON.stringify(config));
  await page.getByRole('button',{name:'校验并载入配置'}).click();
  await page.getByRole('button',{name:'返回开始页'}).click();
  await page.getByRole('checkbox').check();
  await page.getByRole('button',{name:/同意并进入/}).click();
  await page.getByText('摄像头无法工作？').click();
  await page.getByRole('button',{name:/仅试用流程/}).click();
  for(let index=0;index<9;index++)await page.getByRole('button',{name:'校准目标'}).click();
  await page.getByRole('button',{name:'研究者：标记低质量后继续'}).click();

  for(let scene=0;scene<2;scene++){
    await page.getByRole('button',{name:'研究者：标记低质量后继续'}).click();
    await expect(page.locator('.stimulus img')).toBeVisible();
    await expect(page.locator('.experiment-header')).toHaveCount(0);
    await expect.poll(()=>page.evaluate(async(index)=>{
      const path='/src/storage.ts';const {listSessions}=await import(/* @vite-ignore */path);
      return (await listSessions())[0]?.geometries.length;
    },scene)).toBe(scene+1);

    const audit=await page.evaluate(async(index)=>{
      const storagePath='/src/storage.ts',geometryPath='/src/geometry.ts',heatmapPath='/src/heatmap.ts',scanpathPath='/src/scanpath.ts',fixturePath='/tests/dataFixtures.ts';
      const [{listSessions},{mapPoint},{heatmapSize,buildDensity,renderHeatmap},{defaultScanpath,renderScanpath,scanpathColor,SCANPATH_HEADER_PX},{sessionFixture,sampleFixture}]=await Promise.all([
        import(/* @vite-ignore */storagePath),import(/* @vite-ignore */geometryPath),import(/* @vite-ignore */heatmapPath),import(/* @vite-ignore */scanpathPath),import(/* @vite-ignore */fixturePath),
      ]);
      const recorded=(await listSessions())[0];
      const geometry=recorded.geometries[index];
      const painting=recorded.config.paintings.find((value:any)=>value.paintingId===geometry.paintingId);
      const image=document.querySelector('.stimulus img') as HTMLImageElement;
      const box=image.getBoundingClientRect();
      const style=getComputedStyle(image);
      // Independent DOM calculation: intrinsic aspect ratio + actual content box.
      const scale=Math.min(box.width/image.naturalWidth,box.height/image.naturalHeight);
      const displayed={left:box.left+(box.width-image.naturalWidth*scale)/2,top:box.top+(box.height-image.naturalHeight*scale)/2,width:image.naturalWidth*scale,height:image.naturalHeight*scale};
      const points=[{u:.1,v:.25},{u:.5,v:.5},{u:.9,v:.75}];
      const fixture=sessionFixture('coordinate-render-fixture-only');
      fixture.config=structuredClone(recorded.config);fixture.config.paintings=[painting];fixture.order=[painting.paintingId];
      fixture.geometries=[geometry];fixture.heatmap={...fixture.heatmap,width:1000,kernelPx:8,opacity:1};
      fixture.timings=[{trialId:'coordinate-only',paintingId:painting.paintingId,startedMs:0,endedMs:300,wallMs:300,activeMs:300,status:'completed'}];
      fixture.samples=points.map((point,pointIndex)=>{
        const x=displayed.left+point.u*displayed.width,y=displayed.top+point.v*displayed.height;
        return sampleFixture({sessionId:fixture.sessionId,participantId:fixture.participantId,paintingId:painting.paintingId,trialId:'coordinate-only',sampleIndex:pointIndex,callbackTimeMs:20+pointIndex*100,viewportX:x,viewportY:y,...mapPoint(x,y,geometry)});
      });
      const size=heatmapSize(painting,fixture.heatmap);
      const heatmap=await renderHeatmap(fixture,painting,fixture.heatmap);
      const path=await renderScanpath(fixture,painting,{...defaultScanpath,width:1000,opacity:1,pointRadius:6,numberEvery:0,displayIntervalMs:0});
      const rendered=fixture.samples.map((sample:any,pointIndex:number)=>{
        const density=buildDensity([sample],size.width,size.height,3);
        let peak=0;for(let pixel=1;pixel<density.values.length;pixel++)if(density.values[pixel]>density.values[peak])peak=pixel;
        const x=Math.round(points[pointIndex].u*(size.width-1)),y=Math.round(points[pointIndex].v*(size.height-1));
        return {normX:sample.imageNormX,normY:sample.imageNormY,peakX:peak%size.width,peakY:Math.floor(peak/size.width),expectedX:x,expectedY:y,
          heatmapPixel:Array.from(heatmap.getContext('2d')!.getImageData(x,166+y,1,1).data),
          scanpathPixel:Array.from(path.getContext('2d')!.getImageData(x,SCANPATH_HEADER_PX+y,1,1).data),
          expectedScanpathColor:scanpathColor(sample.callbackTimeMs,300)};
      });
      return {geometry,displayed,source:[image.naturalWidth,image.naturalHeight],dpr:devicePixelRatio,fit:style.objectFit,position:style.objectPosition,border:style.borderWidth,padding:style.padding,
        stages:(window as any).__coordinateAuditBoxes.filter((state:any)=>state.src===image.getAttribute('src')),
        size,rendered,persistedSampleCount:recorded.samples.length};
    },scene);

    expect(audit.source).toEqual(scene===0?[6888,1966]:[5900,1966]);
    expect(audit.dpr).toBe(2);expect(audit.fit).toBe('contain');expect(audit.position).toBe('50% 50%');
    expect(audit.border).toBe('0px');expect(audit.padding).toBe('0px');
    for(const key of ['left','top','width','height'] as const)expect(audit.geometry[key]).toBeCloseTo(audit.displayed[key],8);
    expect(audit.stages.some((stage:any)=>stage.visibility==='hidden')).toBe(true);
    expect(audit.stages.some((stage:any)=>stage.visibility==='visible')).toBe(true);
    for(const stage of audit.stages)expect([stage.left,stage.top,stage.width,stage.height]).toEqual([0,0,1440,900]);
    expect(audit.persistedSampleCount).toBe(0);
    for(const [index,point] of audit.rendered.entries()){
      expect(point.normX).toBeCloseTo([.1,.5,.9][index],10);
      expect(point.normY).toBeCloseTo([.25,.5,.75][index],10);
      // Half-pixel centres may tie between neighbouring raster pixels.
      expect(Math.abs(point.peakX-point.expectedX)).toBeLessThanOrEqual(1);
      expect(Math.abs(point.peakY-point.expectedY)).toBeLessThanOrEqual(1);
      expect(point.heatmapPixel[0]).toBeGreaterThan(180);expect(point.heatmapPixel[1]).toBeLessThan(80);expect(point.heatmapPixel[2]).toBeLessThan(80);
      expect(point.scanpathPixel.slice(0,3)).toEqual(point.expectedScanpathColor);
    }
    console.log(JSON.stringify({check:'synthetic coordinate audit; not gaze data',source:audit.source,dpr:audit.dpr,displayed:audit.displayed,output:audit.size,normalX:audit.rendered.map((point:{normX:number})=>point.normX),peakX:audit.rendered.map((point:{peakX:number})=>point.peakX)}));

    await page.getByRole('button',{name:'没见过',exact:true}).click();
    for(let index=0;index<2;index++)await page.getByRole('button',{name:'跳过此题',exact:true}).click();
    for(let index=0;index<2;index++)await page.getByRole('button',{name:'读完了，继续 →',exact:true}).click();
    for(let index=0;index<2;index++)await page.getByRole('button',{name:'跳过此题',exact:true}).click();
  }
  await expect(page.getByRole('heading',{name:'最后，聊聊这次体验'})).toBeVisible();
  for(let index=0;index<1+config.paintings.flatMap((painting:any)=>painting.interview).length;index++)await page.getByRole('button',{name:'跳过此题',exact:true}).click();
  await expect(page.getByRole('heading',{name:'测试已完成，谢谢参与'})).toBeVisible();
});
