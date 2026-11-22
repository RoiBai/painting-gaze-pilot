import {expect,test,type Page} from '@playwright/test';
import {consentAndStart,storedSessions} from './helpers';

// Replace only camera I/O in the isolated test tab. P00 uses the participant
// calibration, trial scheduler, gaze hit testing and IndexedDB persistence.
async function watchArchery(page:Page,first:'archer'|'target'){
  await page.goto('/?participant=P00');
  await page.evaluate(async startAt=>{
    function loadedModule(name:string){
      const resource=performance.getEntriesByType('resource').find(row=>new URL(row.name).pathname==='/src/'+name+'.ts');
      if(!resource)throw Error('Missing Vite test module '+name);
      return import(/* @vite-ignore */resource.name);
    }
    const {WebGazerAdapter}=await loadedModule('webgazerAdapter');
    const {pilotConfig}=await loadedModule('pilotMaterials');
    pilotConfig.calibrationClicks=1;
    Object.assign(pilotConfig.validation,{targetDurationMs:300,settleMs:60,minSamplesPerTarget:3});
    let timer=0,arrowOnset:number|undefined;
    WebGazerAdapter.prototype.train=()=>{};
    WebGazerAdapter.prototype.resetCalibration=async()=>{};
    WebGazerAdapter.prototype.stop=()=>clearInterval(timer);
    WebGazerAdapter.prototype.start=async function(){
      this.onStatus({status:'tracking',faceDetected:true,message:'Playwright camera fixture'});
      timer=window.setInterval(()=>{
        const now=performance.now(),mark=document.querySelector('.gaze-target');
        const image=document.querySelector<HTMLImageElement>('.stimulus img');
        let x=2,y=2;
        if(mark){
          const box=mark.getBoundingClientRect();
          x=box.left+box.width/2;y=box.top+box.height/2;
        }else if(image?.naturalWidth){
          const card=document.querySelector<HTMLElement>('.pilot-card')?.dataset.card;
          if(card==='archery-figma-1-6')arrowOnset??=now;
          const arrowAge=arrowOnset===undefined?-1:now-arrowOnset;
          const followsShot=card==='archery-figma-1-6'&&arrowAge>=7300&&arrowAge<=8700;
          let position=[.62,.63]; // Green archer's torso in the long scroll.
          if(startAt==='target'||followsShot)position=[1631/6888,915/1966];
          else if(arrowAge>=7300)position=[.42,.44]; // Empty painting after the shot.
          const box=image.getBoundingClientRect();
          const scale=Math.min(box.width/image.naturalWidth,box.height/image.naturalHeight);
          const w=image.naturalWidth*scale,h=image.naturalHeight*scale;
          x=box.left+(box.width-w)/2+position[0]*w;
          y=box.top+(box.height-h)/2+position[1]*h;
        }
        this.onSample({callbackTimeMs:now,libraryElapsedMs:now,x,y});
      },25);
    };
  },first);
  await page.getByRole('radio',{name:'只试一景',exact:true}).check();
  await page.getByRole('combobox',{name:/^试用场景/}).selectOption('ming-xingle-archery');
  await page.getByRole('combobox',{name:/^讲解方式/}).selectOption('gaze');
  await page.clock.install();
  await consentAndStart(page);
  await page.getByRole('button',{name:'启用 / 重试摄像头'}).click();
  await page.getByRole('button',{name:'开始九点校准'}).click();
  for(let i=0;i<9;i++)await page.getByRole('button',{name:'校准目标'}).click();
  await page.getByRole('button',{name:'继续',exact:true}).click();
  await page.getByRole('button',{name:'继续',exact:true}).click();
  await expect(page.locator('.stimulus img')).toBeVisible();
}

test('P00 selects archer then arrow on fresh torso dwells, without crediting the flight as target selection',async({page})=>{
  await watchArchery(page,'archer');
  await expect(page.locator('.pilot-card[data-card="archery-figma-1-2"] canvas')).toBeVisible();
  await page.clock.runFor(12200);
  await expect(page.locator('.pilot-card[data-card="archery-figma-1-6"] canvas')).toBeVisible();
  await page.clock.runFor(14000);
  await expect.poll(async()=>(await storedSessions(page))[0]?.cardExposures?.length).toBe(3);
  const session=(await storedSessions(page))[0];
  expect(session.pilot).toMatchObject({practice:true,plan:[{paintingId:'ming-xingle-archery',condition:'gaze'}]});
  const [person,arrow,after]=session.cardExposures!;
  expect(person).toMatchObject({selectionSource:'gaze',selectionReason:'shared-region-archer-first',selectionAoiId:'figma-1-2'});
  expect(arrow).toMatchObject({selectionSource:'gaze',selectionReason:'shared-region-arrow-follow-up',selectionAoiId:'figma-1-2'});
  for(const e of [person,arrow]){
    expect(e.dwellMs).toBeGreaterThanOrEqual(1100);
    expect(e.validSelectionSamples).toBeGreaterThanOrEqual(5);
  }
  expect(session.samples.some(s=>s.cardExposureId===arrow.exposureId&&s.imageAoiId==='figma-0-6')).toBe(true);
  expect(arrow.paper?.arrowLandedAtMs).toBeGreaterThan(arrow.shownMs);
  expect(arrow.paper!.arrowLandedAtMs!).toBeLessThan(arrow.hiddenMs!);
  expect(after).toMatchObject({selectionSource:'fallback',selectionReason:'no-stable-eligible-aoi',dwellMs:0});
  expect(session.cardExposures!.some(e=>e.cardId==='archery-figma-0-6'&&e.selectionSource==='gaze')).toBe(false);
});

test('P00 can open the target first by looking at the bullseye during free viewing',async({page})=>{
  await watchArchery(page,'target');
  await expect(page.locator('.pilot-card[data-card="archery-figma-0-6"] canvas')).toBeVisible();
  await page.clock.runFor(1100);
  const recorded=(await storedSessions(page))[0].cardExposures!;
  expect(recorded).toHaveLength(1);
  expect(recorded[0]).toMatchObject({cardId:'archery-figma-0-6',selectionSource:'gaze',
    selectionAoiId:'figma-0-6',selectionReason:'recent-stable-eligible-aoi',paper:{layout:{reveal:'unshot-target'}}});
});
