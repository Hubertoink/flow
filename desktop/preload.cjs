const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('flowDesktop',{
  updateInfo:()=>ipcRenderer.invoke('flow-update','info'),
  checkForUpdates:()=>ipcRenderer.invoke('flow-update','check'),
  downloadUpdate:()=>ipcRenderer.invoke('flow-update','download'),
  installUpdate:()=>ipcRenderer.invoke('flow-update','install'),
  onUpdateStatus:callback=>{
    const listener=(_event,state)=>callback(state);
    ipcRenderer.on('flow-update-status',listener);
    return ()=>ipcRenderer.removeListener('flow-update-status',listener);
  },
});
window.addEventListener('DOMContentLoaded',()=>{
  document.documentElement.classList.add('desktop');
  const updateTheme=()=>ipcRenderer.send('flow-theme',document.documentElement.dataset.theme);
  new MutationObserver(updateTheme).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
  updateTheme();
});
