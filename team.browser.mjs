import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {existsSync} from 'node:fs';

export async function runBrowserTests({url,email,password}){
  const executablePath=process.env.FLOW_TEST_BROWSER||['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Google/Chrome/Application/chrome.exe','/usr/bin/chromium','/usr/bin/google-chrome',chromium.executablePath()].find(existsSync);
  if(!executablePath)throw new Error('FLOW_TEST_BROWSER muss auf Chromium, Chrome oder Edge zeigen.');
  const browser=await chromium.launch({executablePath,headless:true});
  let activePage,observedErrors=[];
  try{
    const context=await browser.newContext(),page=await context.newPage(),errors=[];
    activePage=page;observedErrors=errors;
    page.on('pageerror',error=>errors.push(error.message));
    await page.goto(url);await page.getByLabel('E-Mail',{exact:true}).fill(email);await page.getByLabel('Passwort',{exact:true}).fill(password);await page.getByRole('button',{name:'Anmelden',exact:true}).click();
    await page.locator('#team-user-toggle').waitFor();await page.waitForFunction(()=>!document.body.classList.contains('team-saving'));
    await page.locator('#next').click();
    await page.locator('.token').filter({hasText:'Admin Test'}).click();await page.locator('.day-cell').first().press('Enter');
    await page.waitForFunction(()=>data.shifts.some(s=>s.person===window.flowTeam.bootstrap.member.personId)&&!document.body.classList.contains('team-saving'));
    const ownShift=await page.evaluate(()=>data.shifts.find(s=>s.person===window.flowTeam.bootstrap.member.personId).id);
    await page.locator(`[data-shift="${ownShift}"]`).hover();await page.locator(`[data-shift="${ownShift}"] .team-shift-lock`).click();await page.locator('#team-shift-lock').selectOption('times');
    await page.waitForFunction(id=>data.shifts.find(s=>s.id===id)?.lock==='times'&&!document.body.classList.contains('team-saving'),ownShift);
    await page.locator(`[data-shift="${ownShift}"] .shift-edit`).click();await page.locator('[data-type=flex]').click();await page.waitForFunction(()=>!document.body.classList.contains('team-saving'));await page.locator('#task-label').fill('Browser-Aufgabe');await page.locator('#task-label').press('Tab');
    await page.waitForFunction(()=>data.shifts.some(s=>s.segments.some(t=>t.label==='Browser-Aufgabe'))&&!document.body.classList.contains('team-saving'));
    await page.locator('#toolkit-form .primary-button').click();await page.waitForFunction(()=>!document.body.classList.contains('team-saving'));
    assert(await page.locator(`[data-shift="${ownShift}"] .team-lock-label`).isVisible());
    await page.locator('#more').click();await page.locator('[data-action=image]').click();const pngDownload=page.waitForEvent('download');await page.locator('#start-export').click();const png=await pngDownload;assert(png.suggestedFilename().endsWith('.png'));await page.locator('#export-form').waitFor({state:'hidden'});
    await page.reload();await page.locator('#team-user-toggle').waitFor();
    await page.locator('#team-user-toggle').click();await page.locator('#team-management').click();await page.getByRole('button',{name:'Rechte & Konto'}).first().waitFor();
    await page.getByRole('button',{name:'Rechte & Konto'}).first().click();
    const choice=page.locator('input[name=viewDrafts]');assert((await choice.boundingBox()).width<=20);await page.screenshot({path:'.flow-local/rights-layout.png',fullPage:true});await page.locator('#modal-close').click();
    await page.locator('#team-user-toggle').click();await page.locator('#team-account').click();
    const lastPassword=await page.locator('#team-password-form input[name=repeat]').boundingBox(),savePassword=await page.locator('#team-password-form button[type=submit]').boundingBox();assert(savePassword.y-lastPassword.y-lastPassword.height>=16);await page.screenshot({path:'.flow-local/account-layout.png',fullPage:true});await page.locator('#modal-close').click();
    await page.locator('#team-user-toggle').click();await page.locator('#team-management').click();
    await page.locator('#team-invite').click();await page.locator('#team-invitation-form input[name=name]').fill('Browser User');await page.locator('#team-invitation-form input[name=email]').fill('browser@example.org');await page.getByRole('button',{name:'Einladung erstellen'}).click();
    await page.locator('#new-invitation-link').waitFor();const link=await page.locator('#new-invitation-link').inputValue();
    const invitedContext=await browser.newContext(),invited=await invitedContext.newPage();invited.on('pageerror',error=>errors.push(error.message));await invited.goto(link);await invited.getByLabel('Dein Passwort',{exact:true}).fill('Browser-Passwort-2026!');await invited.getByLabel('Passwort wiederholen').fill('Browser-Passwort-2026!');await invited.getByRole('button',{name:'Einladung annehmen'}).click();await invited.locator('#team-user-toggle').waitFor();await invited.locator('#team-user-toggle').click();assert(!await invited.locator('#team-management').isVisible());
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
  }catch(error){if(activePage){console.error('Browserdiagnose:',JSON.stringify({errors:observedErrors,state:await activePage.evaluate(()=>({banner:document.querySelector('#team-error-banner')?.textContent,status:document.querySelector('#team-status')?.textContent,saving:document.body.className,shifts:typeof data==='undefined'?[]:data.shifts.map(s=>({id:s.id,lock:s.lock}))})).catch(()=>({}))}));await activePage.screenshot({path:'.flow-local/browser-failure.png',fullPage:true}).catch(()=>{});}throw error;}finally{await browser.close();}
}
