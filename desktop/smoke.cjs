const {app}=require('electron');
(async()=>{
  const {ready}=require('./main.cjs');
  app.setPath('userData',process.env.FLOW_SMOKE_USER_DATA);
  try{
    const window=await ready;
    await new Promise((resolve,reject)=>{
      if(!window.webContents.isLoading())return resolve();
      window.webContents.once('did-finish-load',resolve);
      window.webContents.once('did-fail-load',(_event,code,message)=>reject(new Error(`${code}: ${message}`)));
    });
    const result=await window.webContents.executeJavaScript(`(async()=>{
      if(typeof require!=='undefined')throw new Error('Node APIs exposed');
      if(document.querySelectorAll('.token').length!==4)throw new Error('App did not render');
      if(!document.querySelector('.brand-logo').naturalWidth)throw new Error('Logo did not load');
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
      localStorage.setItem('flow-smoke-persistence','ok');
      return {origin:location.origin,excelBytes:bytes.length,logo:document.querySelector('.brand-logo').naturalWidth};
    })()`);
    window.reload();await new Promise(resolve=>window.webContents.once('did-finish-load',resolve));
    const persisted=await window.webContents.executeJavaScript(`localStorage.getItem('flow-smoke-persistence')`);
    if(persisted!=='ok')throw new Error('Local storage did not survive reload');
    console.log('PASS: desktop launch, isolated renderer, local assets, XLSX, PNG and persistence.',JSON.stringify(result));
    window.destroy();app.exit(0);
  }catch(error){console.error(error);app.exit(1);}
})();
