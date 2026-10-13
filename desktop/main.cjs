const {app,BrowserWindow,Menu,protocol,net,dialog}=require('electron');
const path=require('node:path');
const {pathToFileURL}=require('node:url');

app.setName('Flow!');
app.setPath('userData',path.join(app.getPath('appData'),'Flow!'));
protocol.registerSchemesAsPrivileged([{scheme:'flow',privileges:{standard:true,secure:true,supportFetchAPI:true,corsEnabled:true}}]);

function createWindow(){
  const window=new BrowserWindow({
    width:1440,height:960,minWidth:850,minHeight:650,title:'Flow! - JugendPlan',
    backgroundColor:'#10151f',icon:path.join(__dirname,'..','dist','assets',process.platform==='win32'?'Flow__Logo.ico':'Flow!_Logo.png'),
    webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true},
  });
  window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  window.webContents.on('will-navigate',(event,url)=>{if(url!=='flow://app/index.html'&&url!=='flow://app/')event.preventDefault();});
  window.webContents.on('will-attach-webview',event=>event.preventDefault());
  window.webContents.session.setPermissionRequestHandler((_contents,_permission,callback)=>callback(false));
  window.webContents.session.on('will-download',(_event,item)=>{
    item.setSaveDialogOptions({title:'Flow! Export speichern',defaultPath:path.join(app.getPath('downloads'),path.basename(item.getFilename()))});
  });
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {label:'Datei',submenu:[{label:'Drucken',accelerator:'Ctrl+P',click:()=>window.webContents.print()}, {type:'separator'},{role:'quit',label:'Beenden'}]},
    {label:'Bearbeiten',submenu:[{role:'undo',label:'Rückgängig'},{role:'redo',label:'Wiederholen'},{type:'separator'},{role:'cut',label:'Ausschneiden'},{role:'copy',label:'Kopieren'},{role:'paste',label:'Einfügen'},{role:'selectAll',label:'Alles auswählen'}]},
    {label:'Ansicht',submenu:[{role:'reload',label:'Neu laden'},{role:'togglefullscreen',label:'Vollbild'}]},
  ]));
  window.loadURL('flow://app/index.html').catch(error=>{console.error('Flow! konnte nicht starten:',error);dialog.showErrorBox('Flow! Start fehlgeschlagen',error.message);app.exit(1);});
  return window;
}

const ready=app.whenReady().then(()=>{
  const root=path.resolve(__dirname,'..','dist');
  protocol.handle('flow',request=>{
    const url=new URL(request.url);
    if(url.hostname!=='app'||!['GET','HEAD'].includes(request.method))return new Response('Forbidden',{status:403});
    let pathname;
    try{pathname=decodeURIComponent(url.pathname);}catch{return new Response('Invalid URL',{status:400});}
    const file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname)),relative=path.relative(root,file);
    if(relative.startsWith('..')||path.isAbsolute(relative))return new Response('Forbidden',{status:403});
    return net.fetch(pathToFileURL(file).href).catch(error=>{console.error('Flow! Ressource nicht verfügbar:',error);return new Response('Not found',{status:404});});
  });
  return createWindow();
});
app.on('window-all-closed',()=>app.quit());
module.exports={ready};
