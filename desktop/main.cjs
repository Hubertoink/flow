const {app,BrowserWindow,Menu,protocol,net,dialog,ipcMain}=require('electron');
const path=require('node:path');
const {pathToFileURL}=require('node:url');

app.setName('Flow!');
app.setPath('userData',path.join(app.getPath('appData'),'Flow!'));
protocol.registerSchemesAsPrivileged([{scheme:'flow',privileges:{standard:true,secure:true,supportFetchAPI:true,corsEnabled:true}}]);

let mainWindow=null,updater=null,updateState={status:'idle'};
function updateSupport(){
  if(!app.isPackaged)return {supported:false,reason:'Updates sind nur in der installierten App verfügbar.'};
  if(process.platform==='linux'&&!process.env.APPIMAGE)return {supported:false,reason:'Diese Installation wird über den Paketmanager aktualisiert (z. B. yay -Syu).'};
  if(!['win32','linux'].includes(process.platform))return {supported:false,reason:'Updates sind auf diesem System nicht verfügbar.'};
  return {supported:true};
}
function sendUpdate(patch){
  updateState={...updateState,...patch};
  if(mainWindow&&!mainWindow.isDestroyed())mainWindow.webContents.send('flow-update-status',updateState);
}
function getUpdater(){
  if(updater)return updater;
  ({autoUpdater:updater}=require('electron-updater'));
  updater.autoDownload=false;
  updater.autoInstallOnAppQuit=true;
  updater.on('checking-for-update',()=>sendUpdate({status:'checking',error:null}));
  updater.on('update-available',info=>sendUpdate({status:'available',latest:info.version,error:null}));
  updater.on('update-not-available',info=>sendUpdate({status:'current',latest:info.version,error:null}));
  updater.on('download-progress',progress=>sendUpdate({status:'downloading',percent:Math.round(progress.percent)}));
  updater.on('update-downloaded',info=>sendUpdate({status:'downloaded',latest:info.version,percent:100}));
  updater.on('error',error=>{console.error('Flow! Update fehlgeschlagen:',error);sendUpdate({status:'error',error:error.message});});
  return updater;
}
ipcMain.handle('flow-update',async(event,action)=>{
  if(!mainWindow||event.sender!==mainWindow.webContents)throw new Error('Unbekannter Absender');
  const support=updateSupport(),info=()=>({version:require('../package.json').version,...support,...updateState});
  if(action==='info')return info();
  if(!support.supported)throw new Error(support.reason);
  if(action==='check'){
    if(['checking','downloading'].includes(updateState.status))return info();
    sendUpdate({status:'checking',error:null});
    try{await getUpdater().checkForUpdates();}catch(error){sendUpdate({status:'error',error:error.message});}
    return info();
  }
  if(action==='download'){
    if(updateState.status!=='available')throw new Error('Kein Update zum Herunterladen verfügbar.');
    sendUpdate({status:'downloading',percent:0});
    getUpdater().downloadUpdate().catch(error=>sendUpdate({status:'error',error:error.message}));
    return info();
  }
  if(action==='install'){
    if(updateState.status!=='downloaded')throw new Error('Das Update ist noch nicht heruntergeladen.');
    setImmediate(()=>getUpdater().quitAndInstall(false,true));
    return info();
  }
  throw new Error('Unbekannte Update-Aktion: '+action);
});

function createWindow(){
  const window=new BrowserWindow({
    width:1440,height:960,minWidth:850,minHeight:650,title:'Flow!',
    autoHideMenuBar:true,
    titleBarStyle:'hidden',titleBarOverlay:{color:'#00000000',symbolColor:'#eceff6',height:40},
    backgroundColor:'#10151f',icon:path.join(__dirname,'..','dist','assets',process.platform==='win32'?'Flow__Logo.ico':'Flow!_Logo.png'),
    webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true,preload:path.join(__dirname,'preload.cjs')},
  });
  const updateTheme=(event,theme)=>{
    if(event.sender!==window.webContents)return;
    const colors={dark:'#eceff6',light:'#202a3a',catppuccin:'#cdd6f4'};
    if(!Object.hasOwn(colors,theme)){console.error('Flow! Unbekanntes Fensterdesign:',theme);return;}
    window.setTitleBarOverlay({symbolColor:colors[theme]});
    window.setBackgroundColor({dark:'#10151f',light:'#eef1f7',catppuccin:'#1e1e2e'}[theme]);
  };
  ipcMain.on('flow-theme',updateTheme);
  window.once('closed',()=>ipcMain.removeListener('flow-theme',updateTheme));
  mainWindow=window;
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
