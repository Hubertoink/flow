import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {readFile as read} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {emptyPlan} from './server/model.mjs';

const executablePath=process.env.FLOW_TEST_BROWSER||['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Google/Chrome/Application/chrome.exe',chromium.executablePath()].find(existsSync);
const browser=await chromium.launch({executablePath,headless:true});
try{
  const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  const bootstrap={plan:emptyPlan(),preferences:{},revision:1,periods:[],member:{userId:'test',name:'Test',role:'admin'},organization:'Test',version:'test'};
  let entries=Array.from({length:60},(_,i)=>({id:String(i),revision:60-i,action:'plan.change',actorName:'Test',createdAt:new Date().toISOString(),summary:['Test change'],canUndo:true})),calls=[];
  await page.addInitScript(value=>window.flowTeam={bootstrap:value,initialPlan:value.plan},bootstrap);
  await page.route('http://flow.test/**',async route=>{
    const path=new URL(route.request().url()).pathname;
    if(path==='/api/audit')return route.fulfill({json:entries});
    if(path==='/api/bootstrap')return route.fulfill({json:bootstrap});
    if(path==='/api/plan/undo'){
      const {auditId}=route.request().postDataJSON();calls.push(auditId);
      const old=entries.find(e=>e.id===auditId),redo=old.canRedo;
      old.canUndo=false;old.canRedo=false;old.undone=true;
      entries.unshift({...old,id:'operation-'+calls.length,revision:60+calls.length,action:redo?'plan.redo':'plan.undo',canUndo:!!redo,canRedo:!redo,undone:false});
      return route.fulfill({json:{...bootstrap,revision:++bootstrap.revision,auditId:entries[0].id}});
    }
    try{const file=path==='/'?'index.html':path.slice(1);return route.fulfill({body:file==='index.html'?(await read('dist/'+file,'utf8')).replace('<script src="icons.js">','<script src="team-client.js"></script><script src="icons.js">'):await read('dist/'+file),contentType:file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'application/octet-stream'});}catch{return route.fulfill({status:404});}
  });
  await page.goto('http://flow.test/');
  await page.addStyleTag({path:'dist/team.css'});
  await page.evaluate(()=>flowTeam.init());
  await page.waitForFunction(()=>!document.querySelector('#team-undo').disabled);
  assert(await page.locator('#team-redo').isDisabled());
  await page.keyboard.press('Control+z');
  await page.waitForFunction(()=>!document.querySelector('#team-redo').disabled);
  await page.locator('#team-redo').click();
  await page.waitForFunction(()=>!document.querySelector('#team-undo').disabled);
  assert.deepEqual(calls,['0','operation-1']);
  await page.evaluate(()=>{const input=document.createElement('input');input.id='test-input';document.body.append(input);input.focus();});
  await page.keyboard.type('Hello');await page.keyboard.press('Control+z');
  assert.equal(calls.length,2);
  await page.locator('#team-user-toggle').click();await page.locator('#team-history').click();
  const header=page.locator('#modal .modal-top'),before=await header.boundingBox();
  await page.locator('.team-dialog-body').evaluate(el=>el.scrollTop=500);
  assert.equal((await header.boundingBox()).y,before.y);
  assert(await page.locator('.team-dialog-body').evaluate(el=>el.scrollTop>0));
  await page.evaluate(()=>document.querySelector('#modal').close());
  for(const width of [1920,1366,1000,800]){
    await page.setViewportSize({width,height:900});
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth),`Layout at ${width}px`);
  }
  assert.deepEqual(errors,[]);
  console.log('PASS: toolbar undo/redo, keyboard shortcut, native input undo, fixed history header.');
}finally{await browser.close();}
