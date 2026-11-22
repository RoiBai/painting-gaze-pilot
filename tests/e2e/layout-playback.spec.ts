import {expect,test} from '@playwright/test';
import {pilotConfig} from '../../src/pilotMaterials';
import {storedSessions} from './helpers';

test('P00 turns off eye tracking and opens a single scene without consent, camera or survey',async({page})=>{
  await page.addInitScript(()=>{
    Object.defineProperty(navigator.mediaDevices,'getUserMedia',{value:()=>{
      document.documentElement.dataset.cameraRequested='true';
      throw Error('No camera in layout playback');
    }});
  });
  await page.goto('/?participant=P00');
  const tracking=page.getByRole('checkbox',{name:'记录眼动',exact:true});
  await expect(tracking).toBeChecked();
  await tracking.uncheck();
  await page.getByRole('radio',{name:'只试一景',exact:true}).check();
  await page.getByRole('combobox',{name:/^试用场景/}).selectOption('ming-xingle-cuju');
  await expect(page.getByRole('combobox',{name:/^讲解方式/}).locator('option')).toHaveText(['顺序讲解','随机讲解']);
  await expect(page.getByRole('checkbox',{name:'参与同意'})).toHaveCount(0);
  await expect(page.getByRole('textbox',{name:'你的主要学习或工作领域是什么？'})).toHaveCount(0);
  await page.getByRole('button',{name:/开始排版预览/}).click();
  const player=page.getByRole('main',{name:'P00 免眼动排版预览'});
  const painting=pilotConfig.paintings[0];
  await expect(player).toHaveAttribute('data-card',painting.cards[0].id);
  await expect(player.getByRole('combobox',{name:/^场景/}).locator('option')).toHaveCount(1);
  await player.getByRole('button',{name:'暂停',exact:true}).click();
  await player.getByRole('button',{name:'下一张'}).click();
  await expect(player).toHaveAttribute('data-card',painting.cards[1].id);
  await player.getByRole('button',{name:'隐藏工具'}).click();
  await expect(player.getByRole('navigation')).toHaveCount(0);
  await player.getByRole('button',{name:'显示工具'}).click();
  await expect(page.locator('html')).not.toHaveAttribute('data-camera-requested','true');
  await expect.poll(()=>storedSessions(page)).toEqual([]);
  await expect(page.getByRole('heading',{name:'观看感受'})).toHaveCount(0);
  await player.getByRole('link',{name:'退出预览'}).click();
  await expect(tracking).not.toBeChecked();
  await tracking.check();
  await expect(page.getByRole('checkbox',{name:'参与同意'})).toBeVisible();
});

test('direct P00 link plays all 22 cards in scene-wise random decks without opening storage or camera',async({page})=>{
  await page.addInitScript(()=>{
    Object.defineProperty(indexedDB,'open',{value:()=>{
      document.documentElement.dataset.storageRequested='true';
      throw Error('No database in layout playback');
    }});
    Object.defineProperty(navigator.mediaDevices,'getUserMedia',{value:()=>{
      document.documentElement.dataset.cameraRequested='true';
      throw Error('No camera in layout playback');
    }});
  });
  const fixed=new Date('2026-11-22T18:00:00Z');
  await page.clock.install({time:fixed});
  await page.clock.pauseAt(new Date(fixed.getTime()+1000));
  await page.goto('/?participant=P00&preview=layout&order=random');
  const player=page.getByRole('main',{name:'P00 免眼动排版预览'});
  await expect(player).toBeVisible();
  await expect(player.getByRole('combobox',{name:/^讲解方式/})).toHaveValue('random');
  // Freeze before navigation, then render several real frames in each reading period.
  await page.clock.runFor(3000);
  const seen:string[][]=[];
  for(const scene of pilotConfig.paintings){
    const sceneIds=[];
    for(const _ of scene.cards){
      await expect(player).toHaveAttribute('data-scene',scene.paintingId);
      await expect(player).toHaveAttribute('data-card',/.+/);
      sceneIds.push((await player.getAttribute('data-card'))!);
      await page.clock.fastForward(11700);
      await page.clock.runFor(300);
    }
    expect(sceneIds.slice().sort()).toEqual(scene.cards.map(c=>c.id).sort());
    seen.push(sceneIds);
  }
  expect(seen.flat()).not.toEqual(pilotConfig.paintings.flatMap(p=>p.cards.map(c=>c.id)));
  await expect(page.getByRole('heading',{name:'本轮预览已结束'})).toBeVisible();
  await expect(page.locator('html')).not.toHaveAttribute('data-storage-requested','true');
  await expect(page.locator('html')).not.toHaveAttribute('data-camera-requested','true');
  expect(await page.evaluate(()=>[sessionStorage.length,localStorage.length])).toEqual([0,0]);
  await page.getByRole('button',{name:'重新播放'}).click();
  await expect(player.getByRole('combobox',{name:/^场景/})).toHaveValue('ming-xingle-cuju');
});

test('participant links cannot select layout playback or disable eye tracking',async({page})=>{
  await page.goto('/?participant=P01&preview=layout&scene=ming-xingle-polo&order=random');
  await expect(page.getByLabel('匿名参与者编号')).toHaveValue('P01');
  await expect(page.getByRole('checkbox',{name:'记录眼动'})).toHaveCount(0);
  await expect(page.getByRole('main',{name:'P00 免眼动排版预览'})).toHaveCount(0);
  await expect(page.getByRole('button',{name:/同意并进入摄像头准备/})).toBeVisible();
});


test('P00 links start on the requested detail and ignore details belonging to other scenes',async({page})=>{
  const entry='/?participant=P00&preview=layout&scene=ming-xingle-cuju';
  const player=page.getByRole('main',{name:'P00 免眼动排版预览'});
  for(const id of ['cuju-figma-3-17','cuju-figma-1-5']){
    await page.goto(entry+'&card='+id);
    await expect(player).toHaveAttribute('data-card',id);
    await expect(player.getByRole('combobox',{name:/^讲解部位/})).toHaveValue(id);
  }
  await page.goto(entry+'&card=polo-figma-0-3');
  await expect(player).toBeVisible();
  await expect(player.getByRole('combobox',{name:/^讲解部位/})).toHaveValue(pilotConfig.paintings[0].cards[0].id);
});

test('the six cuju cards use the selected boards and only animate the pavilion detail and the kick',async({page})=>{
  const fixed=new Date('2026-11-23T08:00:00Z');
  await page.clock.install({time:fixed});
  await page.clock.pauseAt(new Date(fixed.getTime()+1000));
  const root=page.locator('main.layout-playback');
  for(const card of pilotConfig.paintings[0].cards){
    await page.goto('/?participant=P00&preview=layout&scene=ming-xingle-cuju&card='+card.id);
    await expect(root).toHaveAttribute('data-card',card.id);
    const canvas=root.locator('canvas');
    await page.clock.runFor(2010);
    // The entrance has finished. The same exact pigment should run behind the
    // illustration and the text, including the large gaps in the group portrait.
    const score=await canvas.evaluate((el,board)=>{
      const canvas=el as HTMLCanvasElement,ctx=canvas.getContext('2d')!;
      const data=ctx.getImageData(0,0,canvas.width,canvas.height).data;
      let pigment=0;
      for(let i=0;i<data.length;i+=4){
        if(data[i]===board[0]&&data[i+1]===board[1]&&data[i+2]===board[2]&&data[i+3]===255)pigment++;
      }
      return pigment/(canvas.width*canvas.height);
    },[1,3,5].map(i=>parseInt(card.art!.board.slice(i,i+2),16)));
    expect(score,card.title).toBeGreaterThan(.015);
    const before=await canvas.evaluate(el=>(el as HTMLCanvasElement).toDataURL());
    await page.clock.runFor(1000);
    const after=await canvas.evaluate(el=>(el as HTMLCanvasElement).toDataURL());
    const shouldMove=['cuju-figma-1-5','cuju-figma-1-4'].includes(card.id);
    expect(before!==after,card.title).toBe(shouldMove);
  }
});
