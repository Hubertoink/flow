const {app}=require('electron');
(async()=>{
  const {ready}=require('./main.cjs');
  app.setPath('userData',process.env.FLOW_SMOKE_USER_DATA);
  try{
    const window=await ready;
    if(window.getTitle()!=='Flow!')throw new Error('Incorrect desktop title');
    await new Promise((resolve,reject)=>{
      if(!window.webContents.isLoading())return resolve();
      window.webContents.once('did-finish-load',resolve);
      window.webContents.once('did-fail-load',(_event,code,message)=>reject(new Error(`${code}: ${message}`)));
    });
    for(const [theme,color] of [['light','#eef1f7'],['catppuccin','#1e1e2e'],['dark','#10151f']]){
      await window.webContents.executeJavaScript(`(async()=>{
        openSettings();document.querySelector('#theme').value='${theme}';
        document.querySelector('#theme').dispatchEvent(new Event('change'));
        document.querySelector('#modal').close();
        await new Promise(resolve=>setTimeout(resolve,50));
      })()`);
      if(window.getBackgroundColor().toLowerCase()!==color)throw new Error('Desktop window theme was not applied: '+theme);
    }
    if(window.isMenuBarVisible())throw new Error('Native menu bar should start hidden');
    for(const [width,height] of [[850,650],[1440,960]]){
      window.setSize(width,height);
      await window.webContents.executeJavaScript(`(async()=>{
        const settle=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
        for(const value of [.75,1,1.75]){
          setZoom(value);await settle();
          const scroll=document.querySelector('#grid-scroll');
          if(scroll.scrollHeight>scroll.clientHeight)throw new Error('Empty canvas has vertical overflow at zoom '+value+': '+scroll.scrollHeight+'/'+scroll.clientHeight);
        }
        setZoom(1);await settle();
        const head=document.querySelector('.day-head').getBoundingClientRect(),title=document.querySelector('.day-title').getBoundingClientRect(),times=document.querySelector('.hours').getBoundingClientRect();
        if(head.height!==60||title.top-head.top>12||times.top-title.bottom<10)throw new Error('Incorrect compact day header spacing');
        const original=data.shifts;
        data.shifts=[{id:'overflow-smoke',person:data.people[0].id,date:dateKey(week),start:8,length:8,y:1000,segments:[]}];
        renderTimeline();await settle();
        const scroll=document.querySelector('#grid-scroll');
        if(scroll.scrollHeight<=scroll.clientHeight)throw new Error('Long canvas is not scrollable');
        data.shifts=original;renderTimeline();await settle();
      })()`);
    }
    const result=await window.webContents.executeJavaScript(`(async()=>{
      if(typeof require!=='undefined')throw new Error('Node APIs exposed');
      if(!document.documentElement.classList.contains('desktop'))throw new Error('Desktop drag region not enabled');
      if(document.querySelector('.wordmark').textContent!=='Flow!')throw new Error('Incorrect app branding');
      if(getComputedStyle(document.querySelector('.topbar')).getPropertyValue('app-region')!=='drag')throw new Error('Missing window drag region');
      if(document.querySelectorAll('.token').length!==4)throw new Error('App did not render');
      if(typeof window.flowDesktop?.updateInfo!=='function'||'ipcRenderer' in window.flowDesktop)throw new Error('Desktop bridge missing or too broad');
      const updateInfo=await window.flowDesktop.updateInfo();
      if(updateInfo.version!=='${require('../package.json').version}'||updateInfo.supported!==false)throw new Error('Unexpected update info: '+JSON.stringify(updateInfo));
      if(await window.flowDesktop.checkForUpdates().then(()=>true,()=>false))throw new Error('Dev build must not check for updates');
      const settingsButton=document.querySelector('.header-actions #settings-button');
      if(!settingsButton)throw new Error('Settings button missing from the header');
      settingsButton.click();
      const updatesTab=document.querySelector('#settings-tab-updates');
      if(!document.querySelector('#modal').open||!updatesTab)throw new Error('Header settings button did not open the settings dialog');
      updatesTab.click();
      const dialogBox=document.querySelector('#modal').getBoundingClientRect(),nav=document.querySelector('.settings-nav').getBoundingClientRect();
      if(!/Installierte Version/.test(document.querySelector('#update-panel').textContent)||!document.querySelector('.update-note'))throw new Error('Update tab did not render');
      if(dialogBox.width<700||nav.width<150||nav.height<150)throw new Error('Settings navigation layout broken: '+JSON.stringify({dialog:dialogBox.width,nav:[nav.width,nav.height]}));
      document.querySelector('#modal-close').click();
      const beforeWeekCopy=structuredClone(data.shifts),sourceWeek=new Date(week);
      data.shifts=[{id:'week-smoke',person:data.people[0].id,date:dateKey(addDays(week,6)),start:10,length:4,y:32,segments:[{id:'week-smoke-task',type:'project',offset:1,duration:2}]}];
      persist();refresh();
      const weekButton=document.querySelector('#week-number');
      if(getComputedStyle(weekButton).getPropertyValue('app-region')==='drag')throw new Error('Week copy button is not clickable in the title bar');
      weekButton.click();
      if(!document.querySelector('#copy-badge.week-copy-badge'))throw new Error('Week copy pill missing');
      document.querySelector('#next').click();
      const transferData=new DataTransfer();
      document.querySelector('#copy-badge').dispatchEvent(new DragEvent('dragstart',{bubbles:true,dataTransfer:transferData}));
      document.querySelector('.day-head').dispatchEvent(new DragEvent('dragover',{bubbles:true,cancelable:true,dataTransfer:transferData}));
      if(!document.querySelector('.week-copy-hint')||!document.querySelector('.week-copy-target'))throw new Error('Whole-week drop preview missing');
      document.querySelector('.day-cell').dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:transferData}));
      const pasted=data.shifts.find(s=>s.id!=='week-smoke');
      if(!pasted||pasted.date!==dateKey(addDays(week,6))||pasted.segments[0].id==='week-smoke-task')throw new Error('Week drop did not preserve Sunday or renew task IDs');
      document.querySelector('#toast button').click();
      if(data.shifts.length!==1)throw new Error('Week paste undo failed');
      document.querySelector('#dismiss-copy').click();data.shifts=beforeWeekCopy;week=sourceWeek;persist();refresh();
      if(!document.querySelector('.brand-logo').naturalWidth)throw new Error('Logo did not load');
      for(const background of backgrounds){
        const image=new Image();image.src='assets/'+background.file;await image.decode();
        if(!image.naturalWidth)throw new Error('Background did not load: '+background.id);
      }
      data.settings.background='forest';applyBackground();
      if(getComputedStyle(document.querySelector('.board'),'::before').filter!=='blur(12px)')throw new Error('Canvas background is not softened');
      for(const selector of ['.topbar','.dock','.footer']){
        const style=getComputedStyle(document.querySelector(selector));
        if(style.backgroundColor!=='rgba(0, 0, 0, 0)'||parseFloat(style.borderTopWidth)!==0)throw new Error('Unexpected background tile: '+selector);
      }
      const snapshot=weeklyExportSnapshot(false),bytes=await buildWeeklyWorkbook(snapshot).xlsx.writeBuffer();
      if(bytes[0]!==80||bytes[1]!==75)throw new Error('Invalid Excel workbook');
      const date=dateKey(week);
      snapshot.shifts=[{id:'smoke',person:data.people[0].id,date,start:8,length:8,y:32,segments:[{id:'smoke-task',type:'project',offset:0,duration:8}]}];
      for(const expanded of [false,true]){
        const originalDownload=download,originalToBlob=htmlToImage.toBlob;
        let imageBlob,point;
        download=blob=>{imageBlob=blob;};
        htmlToImage.toBlob=async(root,options)=>{
          const task=root.querySelector('.segment').getBoundingClientRect(),rect=root.getBoundingClientRect();
          point={x:Math.floor((task.right-rect.left-15)*options.pixelRatio),y:Math.floor((task.bottom-rect.top-8)*options.pixelRatio)};
          return originalToBlob(root,options);
        };
        try{
          await exportCanvasPNG(snapshot,expanded);
          if(!imageBlob||imageBlob.size<1000)throw new Error('Invalid canvas image');
          const bitmap=await createImageBitmap(imageBlob),canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;
          const ctx=canvas.getContext('2d');ctx.drawImage(bitmap,0,0);
          const pixel=ctx.getImageData(point.x,point.y,1,1).data;
          bitmap.close();if(pixel[0]!==133||pixel[1]!==185||pixel[2]!==226)throw new Error('Missing task pixels in canvas image: '+[...pixel]);
          if(document.querySelector('.canvas-export'))throw new Error('Export DOM not cleaned up');
        }finally{download=originalDownload;htmlToImage.toBlob=originalToBlob;}
      }
      const transfer=planTransfer();transfer.plan.people[0].name='Import-Test';
      transfer.plan.settings.breakRules=[{after:6,minutes:30}];
      storeImportedPlan(readPlanTransfer(JSON.stringify(transfer)));
      if(data.people[0].name!=='Import-Test'||!localStorage.getItem(PLAN_RECOVERY_KEY))throw new Error('Plan transfer failed');
      localStorage.setItem('flow-smoke-persistence','ok');
      return {origin:location.origin,excelBytes:bytes.length,logo:document.querySelector('.brand-logo').naturalWidth};
    })()`);
    window.reload();await new Promise(resolve=>window.webContents.once('did-finish-load',resolve));
    const persisted=await window.webContents.executeJavaScript(`localStorage.getItem('flow-smoke-persistence')`);
    if(persisted!=='ok')throw new Error('Local storage did not survive reload');
    await window.webContents.executeJavaScript(`(()=>{
      if(data.people[0].name!=='Import-Test'||data.settings.breakRules[0].minutes!==30)throw new Error('Imported plan did not survive reload');
      if(!document.documentElement.classList.contains('has-background')||data.settings.background!=='forest')throw new Error('Background did not survive reload');
      const previous=readPlanTransfer(localStorage.getItem(PLAN_RECOVERY_KEY));storeImportedPlan(previous,false);
      if(data.people[0].name==='Import-Test')throw new Error('Import recovery failed');
    })()`);
    console.log('PASS: desktop launch, isolated renderer, week copy/drop/undo, local assets, XLSX, PNG, plan transfer/recovery and persistence.',JSON.stringify(result));
    window.destroy();app.exit(0);
  }catch(error){console.error(error);app.exit(1);}
})();
