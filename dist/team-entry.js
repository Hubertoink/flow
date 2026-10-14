(() => {
  const releaseVersion=new URL(document.currentScript?.src||location.href).searchParams.get('v');
  const entry=document.querySelector('#team-entry');
  const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  async function request(url,body){const response=await fetch(url,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined,credentials:'same-origin'});const result=await response.json();if(!response.ok)throw new Error(result.message||'Die Anfrage ist fehlgeschlagen.');return result;}
  const card=(title,content)=>{entry.innerHTML=`<div class="auth-card"><div class="auth-brand"><img src="assets/Flow!_Logo.png" alt="" width="54" height="54"><span>Flow<b>!</b></span></div><h1>${title}</h1>${content}<p id="auth-error" class="form-error" role="alert"></p></div>`;};
  const input=(label,key,type='text',extra='')=>`<label><span class="field-label">${label}</span><input name="${key}" type="${type}" required ${extra}></label>`;
  function wire(fn){const form=entry.querySelector('form');form.onsubmit=async e=>{e.preventDefault();const button=form.querySelector('button[type=submit]'),error=document.querySelector('#auth-error');button.disabled=true;error.textContent='';try{await fn(Object.fromEntries(new FormData(form)));}catch(cause){error.textContent=cause.message;}finally{if(button.isConnected)button.disabled=false;}};}
  function login(message=''){
    card('Dein Team. Dein Plan.',`<p class="auth-intro">Melde dich an, um Schichten und Aufgaben gemeinsam zu planen.</p>${message?`<p class="auth-message">${escape(message)}</p>`:''}<form>${input('E-Mail','email','email','autocomplete="username"')}${input('Passwort','password','password','autocomplete="current-password"')}<button type="submit" class="primary-button">Anmelden</button></form><button id="forgot-password" class="subtle-button">Passwort vergessen?</button>`);
    document.querySelector('#forgot-password').onclick=forgot;
    wire(async body=>{const result=await request('/api/auth/sign-in/email',body);if(result.twoFactorRedirect)return challenge();await launch();});
  }
  function challenge(){
    let backup=false;
    card('Anmeldung bestätigen',`<p>Gib den sechsstelligen Code aus deiner Authenticator-App ein.</p><form>${input('Bestätigungscode','code','text','inputmode="numeric" autocomplete="one-time-code"')}<button type="submit" class="primary-button">Bestätigen</button></form><button id="backup-code" class="subtle-button">Wiederherstellungscode verwenden</button>`);
    document.querySelector('#backup-code').onclick=()=>{backup=!backup;entry.querySelector('label .field-label').textContent=backup?'Wiederherstellungscode':'Bestätigungscode';entry.querySelector('input').inputMode=backup?'text':'numeric';};
    wire(async body=>{await request(backup?'/api/auth/two-factor/verify-backup-code':'/api/auth/two-factor/verify-totp',{...body,trustDevice:false});await launch();});
  }
  function forgot(){card('Passwort zurücksetzen',`<p>Du erhältst einen Link an deine hinterlegte E-Mail-Adresse.</p><form>${input('E-Mail','email','email','autocomplete="username"')}<button type="submit" class="primary-button">Link anfordern</button></form><button id="login-back" class="subtle-button">Zur Anmeldung</button>`);document.querySelector('#login-back').onclick=()=>login();wire(async body=>{await request('/api/auth/request-password-reset',{...body,redirectTo:location.origin+'/?reset=1'});login('Falls ein passendes Konto existiert, wurde ein Passwortlink angefordert.');});}
  function reset(token){card('Neues Passwort festlegen',`<p>Verwende mindestens 12 Zeichen.</p><form>${input('Neues Passwort','newPassword','password','minlength="12" maxlength="128" autocomplete="new-password"')}${input('Passwort wiederholen','repeat','password','minlength="12" autocomplete="new-password"')}<button type="submit" class="primary-button">Passwort speichern</button></form>`);wire(async body=>{if(body.newPassword!==body.repeat)throw new Error('Die Passwörter stimmen nicht überein.');await request('/api/auth/reset-password',{token,newPassword:body.newPassword});history.replaceState(null,'','/');login('Passwort gespeichert. Bitte melde dich erneut an.');});}
  function setup(){
    card('Willkommen bei Flow!',`<p class="auth-intro">Richte dein Team und das erste Admin-Konto ein. Den Einrichtungsschlüssel findest du in der lokalen Konfiguration oder den Container-Einstellungen.</p><form>${input('Einrichtungsschlüssel','token','password','autocomplete="off"')}${input('Team / Einrichtung','organization')}${input('Dein Name','name','text','autocomplete="name"')}${input('Deine E-Mail','email','email','autocomplete="username"')}${input('Dein Passwort','password','password','minlength="12" maxlength="128" autocomplete="new-password"')}${input('Passwort wiederholen','repeat','password','minlength="12" autocomplete="new-password"')}<p class="modal-note">Mindestens 12 Zeichen. Du kannst später weitere Admins einladen.</p><button type="submit" class="primary-button">Team einrichten</button></form>`);
    wire(async body=>{if(body.password!==body.repeat)throw new Error('Die Passwörter stimmen nicht überein.');delete body.repeat;await request('/api/setup',body);await request('/api/auth/sign-in/email',{email:body.email,password:body.password});await launch();});
  }
  async function invitation(token){
    const inv=await request('/api/invitations/inspect',{token});card('Du bist eingeladen',`<p>Willkommen, <strong>${escape(inv.name)}</strong>. Dein Konto wird für <strong>${escape(inv.email)}</strong> angelegt.</p><form>${input('Dein Passwort','password','password','minlength="12" maxlength="128" autocomplete="new-password"')}${input('Passwort wiederholen','repeat','password','minlength="12" autocomplete="new-password"')}<p class="modal-note">Mindestens 12 Zeichen.</p><button type="submit" class="primary-button">Einladung annehmen</button></form>`);
    wire(async body=>{if(body.password!==body.repeat)throw new Error('Die Passwörter stimmen nicht überein.');await request('/api/invitations/accept',{token,password:body.password});history.replaceState(null,'','/');await request('/api/auth/sign-in/email',{email:inv.email,password:body.password});await launch();});
  }
  async function script(src){await new Promise((resolve,reject)=>{const element=document.createElement('script');element.src=src;element.onload=resolve;element.onerror=()=>reject(new Error('Die Oberfläche konnte nicht geladen werden.'));document.body.append(element);});}
  async function launch(){
    const bootstrap=await request('/api/bootstrap');
    const response=await fetch('/app-shell',{cache:'no-store'});if(!response.ok)throw new Error('Die Planungsoberfläche konnte nicht geladen werden.');
    const shell=new DOMParser().parseFromString(await response.text(),'text/html');shell.querySelectorAll('script').forEach(s=>s.remove());
    document.body.innerHTML=shell.body.innerHTML;document.title=bootstrap.organization+' · Flow!';window.flowTeam={initialPlan:{...bootstrap.plan,settings:{...bootstrap.plan.settings,...bootstrap.preferences}},bootstrap};
    const version=releaseVersion||bootstrap.version;
    for(const src of ['team-client.js','icons.js','app.js','canvas.js','projects.js','vendor/exceljs.min.js','vendor/html-to-image.js','exports.js'])await script(`${src}?v=${encodeURIComponent(version)}`);
    window.flowTeam.init();
  }
  (async()=>{try{const params=new URLSearchParams(location.search),fragment=new URLSearchParams(location.hash.slice(1)),token=fragment.get('invite');if(token)return await invitation(token);if(params.get('token'))return reset(params.get('token'));const status=await request('/api/status');if(!status.ready)return setup();try{await launch();}catch(error){if(document.querySelector('#team-entry'))login();else throw error;}}catch(error){card('Flow! ist gerade nicht erreichbar',`<p>${escape(error.message)}</p><button id="retry-entry" class="primary-button">Erneut versuchen</button>`);document.querySelector('#retry-entry').onclick=()=>location.assign('/');}})();
})();
