import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {existsSync} from 'node:fs';

export async function runBrowserTests({url,email,password}){
  const executablePath=process.env.FLOW_TEST_BROWSER||['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Google/Chrome/Application/chrome.exe','/usr/bin/chromium','/usr/bin/google-chrome',chromium.executablePath()].find(existsSync);
  if(!executablePath)throw new Error('FLOW_TEST_BROWSER muss auf Chromium, Chrome oder Edge zeigen.');
  const browser=await chromium.launch({executablePath,headless:true});
  let activePage,observedErrors=[];
  try{
    const context=await browser.newContext(),page=await context.newPage(),errors=[],assetRequests=[];
    activePage=page;observedErrors=errors;
    page.on('pageerror',error=>errors.push(error.message));
    page.on('request',request=>{const asset=new URL(request.url());if(/\.(css|js)$/.test(asset.pathname))assetRequests.push(asset);});
    await page.goto(url);await page.getByLabel('E-Mail',{exact:true}).fill(email);await page.getByLabel('Passwort',{exact:true}).fill(password);await page.getByRole('button',{name:'Anmelden',exact:true}).click();
    await page.locator('#team-user-toggle').waitFor();await page.waitForFunction(()=>!document.body.classList.contains('team-saving'));
    assert.equal(await page.locator('#team-version').textContent(),await page.evaluate(()=>'v'+flowTeam.bootstrap.version));
    assert.equal(await page.locator('#team-status svg').count(),1);
    const releaseVersion=await page.evaluate(()=>flowTeam.bootstrap.version);
    assert(assetRequests.length>=10);for(const asset of assetRequests)assert.equal(asset.searchParams.get('v'),releaseVersion,'Every stylesheet and script must bypass legacy cached URLs');
    for(const width of [1920,1366,1000,800]){
      await page.setViewportSize({width,height:900});
      await page.waitForFunction(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth&&document.documentElement.scrollHeight<=document.documentElement.clientHeight);
    }
    await page.setViewportSize({width:1366,height:768});await page.screenshot({path:'.flow-local/footer-version.png',fullPage:true});
    await page.setViewportSize({width:1280,height:720});
    await page.locator('#team-status').focus();await page.waitForFunction(()=>!document.querySelector('#flow-tooltip').hidden&&document.querySelector('#flow-tooltip').textContent==='Gespeichert');
    await page.locator('#settings-button').click();await page.locator('#settings-tab-breaks').click();await page.locator('#break-form .primary-button').click();
    await page.waitForFunction(()=>document.querySelector('#toast')?.matches(':popover-open'));
    assert(await page.locator('#modal #toast').isVisible());
    assert(await page.evaluate(()=>{const el=document.querySelector('#toast'),r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}));
    await page.screenshot({path:'.flow-local/toast-over-dialog.png',fullPage:true});
    await page.locator('#modal-close').click();await page.waitForFunction(()=>document.querySelector('#toast').parentElement===document.body&&document.querySelector('#toast').matches(':popover-open'));
    await page.locator('#settings-button').click();await page.waitForFunction(()=>document.querySelector('#toast').parentElement===document.querySelector('#modal'));await page.locator('#modal-close').click();
    await page.locator('#next').click();
    await page.locator('.token').filter({hasText:'Admin Test'}).click();await page.locator('.day-cell').first().press('Enter');
    await page.waitForFunction(()=>data.shifts.some(s=>s.person===window.flowTeam.bootstrap.member.personId)&&!document.body.classList.contains('team-saving'));
    const ownShift=await page.evaluate(()=>data.shifts.find(s=>s.person===window.flowTeam.bootstrap.member.personId).id);
    const publication=page.locator('#team-week-state');
    assert.equal(await publication.textContent(),'Entwurf');assert(await publication.isEnabled());
    const weekLock=page.locator('#team-week-lock-toggle'),shiftLockBefore=await page.evaluate(id=>getShift(id).lock,ownShift);
    assert.equal(await weekLock.getAttribute('aria-pressed'),'false');
    await weekLock.click();await page.waitForFunction(()=>document.querySelector('#team-week-lock-toggle').getAttribute('aria-pressed')==='true'&&!document.body.classList.contains('team-saving'));
    assert.equal(await publication.textContent(),'Entwurf');
    assert(await page.locator(`[data-shift="${ownShift}"]`).evaluate(el=>el.classList.contains('team-readonly')));
    assert.equal(await page.evaluate(id=>getShift(id).lock,ownShift),shiftLockBefore);
    await page.screenshot({path:'.flow-local/footer-week-lock.png',fullPage:true});
    const lockBefore=await page.evaluate(()=>flowTeam.bootstrap.periods.find(p=>p.week===dateKey(week))?.timesLocked||false);
    await publication.click();await page.waitForFunction(()=>document.querySelector('#team-week-state').textContent==='Veröffentlicht'&&!document.body.classList.contains('team-saving'));
    assert.equal(await publication.getAttribute('aria-pressed'),'true');
    assert.equal(await page.evaluate(()=>flowTeam.bootstrap.periods.find(p=>p.week===dateKey(week))?.timesLocked||false),lockBefore);
    await publication.click();await page.waitForFunction(()=>document.querySelector('#team-week-state').textContent==='Entwurf'&&!document.body.classList.contains('team-saving'));
    await weekLock.click();await page.waitForFunction(()=>document.querySelector('#team-week-lock-toggle').getAttribute('aria-pressed')==='false'&&!document.body.classList.contains('team-saving'));
    assert.equal(await publication.textContent(),'Entwurf');
    assert.equal(await page.evaluate(id=>getShift(id).lock,ownShift),shiftLockBefore);
    const lockBounds=await weekLock.boundingBox(),publicationBounds=await publication.boundingBox();
    assert(lockBounds.x+lockBounds.width<=publicationBounds.x,'Weekly lock stays left of publication');
    await page.locator('.day-head').first().click();
    await page.waitForFunction(()=>!document.querySelector('#timeline').getAnimations().length);
    let releaseSave;
    const saveGate=new Promise(resolve=>releaseSave=resolve);
    const delaySave=async route=>{const response=await route.fetch();await saveGate;await route.fulfill({response});};
    await page.route('**/api/plan/commands',delaySave);
    try{
      const shift=page.locator(`[data-shift="${ownShift}"]`),rect=await shift.boundingBox();
      const start=await page.evaluate(id=>getShift(id).start,ownShift);
      await page.mouse.move(rect.x+rect.width/2,rect.y+22);await page.mouse.down();
      await page.mouse.move(rect.x+rect.width/2+50,rect.y+22,{steps:8});await page.mouse.up();
      await page.waitForFunction(()=>document.body.classList.contains('team-saving'));
      assert.equal(await page.locator('#team-status').getAttribute('data-tooltip'),'Wird gespeichert …');
      assert.equal(await page.locator('#app').evaluate(el=>getComputedStyle(el).opacity),'1','Saving must not fade the canvas');
      assert.notEqual(await page.evaluate(id=>getShift(id).start,ownShift),start);
      const node=await shift.elementHandle();
      releaseSave();await page.waitForFunction(()=>!document.body.classList.contains('team-saving'));
      assert.equal(await page.locator('#team-status').getAttribute('data-tooltip'),'Gespeichert');
      assert(await node.evaluate(el=>el.isConnected),'Save acknowledgement must preserve the rendered shift');
    }finally{releaseSave();await page.unroute('**/api/plan/commands',delaySave);}
    const lockButton=()=>page.locator(`[data-shift="${ownShift}"] .team-shift-lock`),lockMenu=page.locator('#team-shift-lock-menu');
    await lockButton().click();assert.equal(await lockMenu.locator('[aria-checked=true]').count(),1);assert.equal(await lockMenu.locator('[data-lock=open]').getAttribute('aria-checked'),'true');
    assert(!await page.locator('#modal').isVisible());assert.equal(await lockMenu.locator('select').count(),0);
    const anchorRect=await lockButton().boundingBox(),menuRect=await lockMenu.boundingBox();assert(Math.abs(menuRect.y-anchorRect.y-anchorRect.height-6)<1,'Menu sits directly below the lock icon');
    await page.screenshot({path:'.flow-local/shift-lock-menu.png',fullPage:true});
    await page.keyboard.press('Escape');assert.equal(await lockMenu.count(),0);assert(await lockButton().evaluate(el=>el===document.activeElement));
    await lockButton().click();await lockButton().click();assert.equal(await lockMenu.count(),0,'Clicking the icon again closes the menu');
    await lockButton().click();await page.locator('.footer-label').click();assert.equal(await lockMenu.count(),0);
    await lockButton().click();await lockMenu.locator('[data-lock=times]').click();
    await page.waitForFunction(id=>data.shifts.find(s=>s.id===id)?.lock==='times'&&!document.body.classList.contains('team-saving'),ownShift);
    await lockButton().click();assert.equal(await lockMenu.locator('[aria-checked=true]').count(),1);assert.equal(await lockMenu.locator('[data-lock=times]').getAttribute('aria-checked'),'true');
    await page.keyboard.press('ArrowDown');assert.equal(await page.evaluate(()=>document.activeElement.dataset.lock),'all');await page.keyboard.press('Home');assert.equal(await page.evaluate(()=>document.activeElement.dataset.lock),'open');await page.keyboard.press('Escape');
    await page.locator(`[data-shift="${ownShift}"] .shift-edit`).click();await page.locator('[data-type=flex]').click();await page.waitForFunction(()=>!document.body.classList.contains('team-saving'));await page.locator('#task-label').fill('Browser-Aufgabe');await page.locator('#task-label').press('Tab');
    await page.waitForFunction(()=>data.shifts.some(s=>s.segments.some(t=>t.label==='Browser-Aufgabe'))&&!document.body.classList.contains('team-saving'));
    await page.locator('#toolkit-form .primary-button').click();await page.waitForFunction(()=>!document.body.classList.contains('team-saving'));
    await page.locator(`[data-shift="${ownShift}"] .segment`).dblclick();
    assert.equal(await page.locator('#task-label').inputValue(),'Browser-Aufgabe');
    for(const size of [{width:1000,height:520},{width:1280,height:720}]){
      await page.setViewportSize(size);
      await page.waitForFunction(()=>{const r=document.querySelector('#detail').getBoundingClientRect();return r.left>=11&&r.top>=11&&r.right<=innerWidth-11&&r.bottom<=innerHeight-11;});
      await page.locator('#detail').evaluate(el=>el.scrollTop=el.scrollHeight);
      assert(await page.locator('#toolkit-form .primary-button').isVisible());
      await page.locator('#detail').evaluate(el=>el.scrollTop=0);
    }
    const oldColor=await page.locator('#task-color').inputValue();
    await page.locator('.random-color').click();
    await page.waitForFunction(()=>!document.body.classList.contains('team-saving'));
    assert.notEqual(await page.locator('#task-color').inputValue(),oldColor);
    const startText=await page.locator('#tool-start').inputValue(),parts=startText.split(':').map(Number),endMinutes=parts[0]*60+parts[1]+15;
    await page.locator('#tool-end').fill(String(Math.floor(endMinutes/60)).padStart(2,'0')+':'+String(endMinutes%60).padStart(2,'0'));
    await page.locator('#toolkit-form .primary-button').click();
    await page.waitForFunction(()=>!document.body.classList.contains('team-saving'));
    await page.waitForFunction(()=>[...document.querySelectorAll('.activity-outside:not([hidden])')].some(el=>el.textContent.includes('Browser-Aufgabe')));
    await page.screenshot({path:'.flow-local/task-outside-label.png',fullPage:true});
    await page.locator(`[data-shift="${ownShift}"] .shift-edit`).click();
    await page.waitForFunction(id=>!document.querySelector(`[data-shift="${id}"]`).classList.contains('editing'),ownShift);
    await page.locator(`[data-shift="${ownShift}"]`).evaluate(async el=>{await Promise.all(el.getAnimations({subtree:true}).map(a=>a.finished.catch(()=>{})));});
    const taskRect=await page.locator(`[data-shift="${ownShift}"] .segment`).boundingBox();
    await page.mouse.click(taskRect.x+taskRect.width/2,taskRect.y+taskRect.height/2,{button:'right'});
    assert.equal(await page.locator('#task-label').inputValue(),'Browser-Aufgabe');

    await page.getByRole('button',{name:'Aufgabe löschen',exact:true}).click();
    await page.waitForFunction(id=>getShift(id)?.segments.length===0&&!document.body.classList.contains('team-saving'),ownShift);
    assert(await page.locator(`[data-shift="${ownShift}"]`).isVisible(),'Deleting a task must retain its shift');
    await page.locator('#toast button').click();
    await page.waitForFunction(id=>getShift(id)?.segments.some(t=>t.label==='Browser-Aufgabe')&&!document.body.classList.contains('team-saving'),ownShift);
    assert(await page.locator(`[data-shift="${ownShift}"] .team-lock-label`).isVisible());
    await checkLockIndicator(page,ownShift);
    await page.locator('#team-user-toggle').click();await page.locator('#team-history').click();await page.locator('.team-audit-entry').first().waitFor();
    await page.screenshot({path:'.flow-local/audit-compact.png',fullPage:true});
    await page.setViewportSize({width:390,height:844});
    assert(await page.locator('#modal').evaluate(el=>el.scrollWidth<=el.clientWidth),'History must fit a narrow viewport');
    await page.screenshot({path:'.flow-local/audit-compact-mobile.png',fullPage:true});
    await page.setViewportSize({width:1280,height:720});await page.locator('#modal-close').click();
    await page.locator('#more').click();await page.locator('[data-action=image]').click();const pngDownload=page.waitForEvent('download');await page.locator('#start-export').click();const png=await pngDownload;assert(png.suggestedFilename().endsWith('.png'));await page.locator('#export-form').waitFor({state:'hidden'});
    await page.reload();await page.locator('#team-user-toggle').waitFor();
    await page.locator('#team-user-toggle').click();await page.locator('#team-management').click();await page.getByRole('button',{name:'Rechte & Konto'}).first().waitFor();
    const fixedDefault=page.locator('#team-default-lock-form input[name=fixed]');
    await fixedDefault.check();await page.locator('#team-default-lock-form button').click();
    await page.waitForFunction(()=>flowTeam.bootstrap.plan.settings.defaultShiftLock==='times'&&!document.body.classList.contains('team-saving'));
    await fixedDefault.uncheck();await page.locator('#team-default-lock-form button').click();
    await page.waitForFunction(()=>flowTeam.bootstrap.plan.settings.defaultShiftLock==='open'&&!document.body.classList.contains('team-saving'));
    await page.getByRole('button',{name:'Rechte & Konto'}).first().click();
    const choice=page.locator('input[name=viewDrafts]');assert((await choice.boundingBox()).width<=20);await page.screenshot({path:'.flow-local/rights-layout.png',fullPage:true});await page.locator('#modal-close').click();
    await page.locator('#team-user-toggle').click();await page.locator('#team-account').click();
    const lastPassword=await page.locator('#team-password-form input[name=repeat]').boundingBox(),savePassword=await page.locator('#team-password-form button[type=submit]').boundingBox();assert(savePassword.y-lastPassword.y-lastPassword.height>=16);await page.screenshot({path:'.flow-local/account-layout.png',fullPage:true});await page.locator('#modal-close').click();
    await page.locator('#team-user-toggle').click();await page.locator('#team-management').click();
    await page.locator('#team-invite').click();await page.locator('#team-invitation-form input[name=name]').fill('Browser User');await page.locator('#team-invitation-form input[name=email]').fill('browser@example.org');await page.getByRole('button',{name:'Einladung erstellen'}).click();
    await page.locator('#new-invitation-link').waitFor();const link=await page.locator('#new-invitation-link').inputValue();
    const invitedContext=await browser.newContext(),invited=await invitedContext.newPage();invited.on('pageerror',error=>errors.push(error.message));await invited.goto(link);await invited.getByLabel('Dein Passwort',{exact:true}).fill('Browser-Passwort-2026!');await invited.getByLabel('Passwort wiederholen').fill('Browser-Passwort-2026!');await invited.getByRole('button',{name:'Einladung annehmen'}).click();await invited.locator('#team-user-toggle').waitFor();await invited.locator('#team-user-toggle').click();assert(!await invited.locator('#team-management').isVisible());
    assert(await invited.locator('#team-week-lock-toggle').isDisabled());
    await invited.locator('#team-account').click();await invited.locator('#team-logout').click();await invited.getByRole('button',{name:'Anmelden',exact:true}).waitFor();
    assert.deepEqual(errors,[],'Browserfehler: '+errors.join('; '));
    await page.locator('#modal-close').click();await page.locator('#team-user-toggle').click();await page.screenshot({path:'.flow-local/team-preview.png',fullPage:true});
    await page.setViewportSize({width:390,height:844});assert(await page.locator('#team-user-toggle').isVisible());assert(await page.locator('#team-account').isVisible());
    await page.setViewportSize({width:1280,height:720});await page.locator('#team-user-toggle').click();
    const exportedPlan=await page.evaluate(()=>JSON.stringify(planTransfer()));await page.locator('#more').click();await page.locator('[data-action=import]').click();await page.locator('#team-import-form input[type=file]').setInputFiles({name:'Flow-Testplan.json',mimeType:'application/json',buffer:Buffer.from(exportedPlan)});await page.waitForFunction(()=>document.querySelector('#team-import-preview')?.textContent.includes('Mitarbeitende'));await page.locator('#team-import-form input[name=confirmed]').check();await page.locator('#team-import-form [type=submit]').click();await page.locator('#team-import-form').waitFor({state:'hidden'});
    const marcContext=await browser.newContext(),marcPage=await marcContext.newPage();marcPage.on('pageerror',error=>errors.push(error.message));await marcPage.goto(url);await marcPage.getByLabel('E-Mail',{exact:true}).fill('marc@example.org');await marcPage.getByLabel('Passwort',{exact:true}).fill(password);await marcPage.getByRole('button',{name:'Anmelden',exact:true}).click();await marcPage.locator('#team-user-toggle').waitFor();await marcPage.waitForFunction(()=>!document.body.classList.contains('team-saving'));
    await marcPage.locator('#week-number').click();await marcPage.locator('#next').click();await marcPage.locator('#copy-badge').click();await marcPage.locator('.day-cell').first().click({position:{x:30,y:120}});await marcPage.waitForFunction(()=>data.shifts.filter(s=>s.date>=dateKey(week)&&s.date<=dateKey(addDays(week,6))).some(s=>s.person==='marc-test')&&!document.body.classList.contains('team-saving'));
    const copied=await marcPage.evaluate(()=>data.shifts.filter(s=>s.date>=dateKey(week)&&s.date<=dateKey(addDays(week,6))));assert(copied.some(s=>s.person==='bufdi-test'));assert(!copied.some(s=>s.person==='lee-test'));assert(copied.filter(s=>s.person==='marc-test'||s.person==='bufdi-test').every(s=>s.lock==='open'));
    assert.deepEqual(errors,[]);
    console.log('PASS: Browser-Anmeldung, Schichterstellung, Zeitsperre mit freier Aufgabenplanung, Speicherung/Neuladen, Einladung, Mitarbeiterzugang, Abmeldung und schmale Ansicht.');
  }catch(error){console.error(error);if(activePage){console.error('Browserdiagnose:',JSON.stringify({errors:observedErrors,state:await activePage.evaluate(()=>({banner:document.querySelector('#team-error-banner')?.textContent,status:document.querySelector('#team-status')?.textContent,saving:document.body.className,shifts:typeof data==='undefined'?[]:data.shifts.map(s=>({id:s.id,lock:s.lock}))})).catch(()=>({}))}));await activePage.screenshot({path:'.flow-local/browser-failure.png',fullPage:true}).catch(()=>{});}throw error;}finally{await browser.close();}
}

async function checkLockIndicator(page,id){
  const original=await page.evaluate(id=>({shift:structuredClone(getShift(id)),editing,theme:data.settings.theme}),id);
  try{
    for(const theme of ['dark','light','catppuccin'])for(const expanded of [false,true])for(const offset of [null,0,0.25,4]){
      await page.evaluate(({id,theme,expanded,offset,original})=>{
        const s=getShift(id);s.lock='times';s.segments=offset===null?[]:[{...original.shift.segments[0],offset,duration:s.length-offset}];
        data.settings.theme=theme;applyTheme();editing=expanded?id:null;renderTimeline();
      },{id,theme,expanded,offset,original});
      const shift=page.locator(`[data-shift="${id}"]`),badge=shift.locator('.team-lock-label');
      // A compact week column must retain the indicator inside its own shift.
      await shift.evaluate(el=>el.style.width='125px');
      const bounds=await shift.boundingBox(),lock=await badge.boundingBox(),name=await shift.locator('.shift-meta').boundingBox();
      assert(lock.x>=bounds.x&&lock.y>=name.y+name.height&&lock.x+lock.width<=bounds.x+bounds.width&&lock.y+lock.height<=bounds.y+bounds.height,'Lock stays inside the shift below its name');
      if(offset!==null&&!expanded){const caption=await shift.locator('.task-caption').boundingBox();assert(caption.x>=lock.x+lock.width+4,'Task captions leave space for the lock');}
      assert.equal(await badge.getAttribute('aria-label'),'Zeiten fixiert');assert.equal((await badge.textContent()).trim(),'');
      const badgeStyle=await badge.evaluate(el=>({color:getComputedStyle(el).color,muted:getComputedStyle(el).getPropertyValue('--muted').trim(),background:getComputedStyle(el).backgroundColor}));
      assert.notEqual(badgeStyle.background,'rgb(255, 240, 241)','Lock uses theme colors instead of a bright warning badge');
      await badge.hover();await page.waitForFunction(()=>!document.querySelector('#flow-tooltip').hidden&&document.querySelector('#flow-tooltip').textContent==='Zeiten fixiert');
      if(theme==='dark'&&!expanded&&offset===0)await page.screenshot({path:'.flow-local/shift-lock-indicator.png',fullPage:true});
    }
    await page.evaluate(id=>{getShift(id).lock='all';renderTimeline();},id);
    assert.equal(await page.locator(`[data-shift="${id}"] .team-lock-label`).getAttribute('aria-label'),'Vollständig fixiert');
    await page.evaluate(id=>{getShift(id).lock='open';renderTimeline();},id);
    assert.equal(await page.locator(`[data-shift="${id}"] .team-lock-label`).count(),0);
  }finally{
    await page.evaluate(({id,original})=>{Object.assign(getShift(id),original.shift);editing=original.editing;data.settings.theme=original.theme;applyTheme();renderTimeline();},{id,original});
  }
}
