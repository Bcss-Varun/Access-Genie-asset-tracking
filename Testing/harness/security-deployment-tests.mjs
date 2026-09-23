// Isolated Stage 5 harness: no application .env or live estate is used.
import assert from 'node:assert/strict';
import {before,after,test} from 'node:test';
import {randomBytes,createHmac} from 'node:crypto';
import {once} from 'node:events';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import mongoose from 'mongoose';
import {MongoMemoryServer} from 'mongodb-memory-server';
let database,server,api,models,app;
const password='Stage5-test-password!';
const sessions={};
async function request(session,path,method='GET',body,headers={}) {
 const response=await fetch(api+path,{method,headers:{'Content-Type':'application/json',...(session?.token?{Authorization:`Bearer ${session.token}`} :{}),...(session?.cookie?{Cookie:session.cookie}:{}),...headers},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
 const raw=await response.text();let json;try{json=JSON.parse(raw)}catch{json=raw}
 return {status:response.status,body:json,headers:response.headers,cookie:response.headers.get('set-cookie')?.split(';')[0]};
}
async function ok(session,path,method,body,status=200){const r=await request(session,path,method,body);assert.equal(r.status,status,JSON.stringify(r.body));return r.body?.data;}
async function login(id,pw=password){const r=await request(null,'/auth/login','POST',{email:`${id}@stage5.test`,password:pw});assert.equal(r.status,200,JSON.stringify(r.body));return {token:r.body.data.accessToken,cookie:r.cookie,challenge:r.body.data.challengeToken};}
function totp(secret,at=Date.now()) {const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';let bits=0,value=0,bytes=[];for(const ch of secret){value=(value<<5)|alphabet.indexOf(ch);bits+=5;if(bits>=8){bytes.push((value>>>(bits-8))&255);bits-=8;}}const counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(at/30000)));const mac=createHmac('sha1',Buffer.from(bytes)).update(counter).digest();const offset=mac[19]&15;return String((mac.readUInt32BE(offset)&0x7fffffff)%1000000).padStart(6,'0');}
before(async()=>{
 Object.assign(process.env,{DOTENV_CONFIG_PATH:'/dev/null',NODE_ENV:'test',LOG_LEVEL:'error',MONGODB_DB_NAME:'access_genie_stage5',BCRYPT_ROUNDS:'4',JWT_ACCESS_SECRET:randomBytes(48).toString('hex'),JWT_REFRESH_SECRET:randomBytes(48).toString('hex'),COOKIE_SECURE:'false',COOKIE_SAME_SITE:'lax',API_PREFIX:'/api/v1',CORS_ORIGIN:'http://127.0.0.1:5173',RATE_LIMIT_MAX:'10000',AUTH_RATE_LIMIT_MAX:'10000'});
 database=await MongoMemoryServer.create({binary:{downloadDir:join(tmpdir(),'access-genie-mongodb-binaries')},instance:{ip:'127.0.0.1'}});process.env.MONGODB_URI=database.getUri();
 await (await import('../../backend/src/config/db.ts')).connectDb();models=await import('../../backend/src/models/index.ts');
 await Promise.all(Object.values(mongoose.models).map(m=>m.init()));
 await models.ScopeNodeModel.create([{_id:'ORG',name:'Test organization',level:'org'},{_id:'FA',name:'Facility A',level:'facility',parentId:'ORG'},{_id:'FB',name:'Facility B',level:'facility',parentId:'ORG'}]);
 const {MODULE_KEYS}=await import('@access-genie/shared');
 await models.RoleGrant.create({_id:'facility_manager',modules:MODULE_KEYS,actions:Object.fromEntries(MODULE_KEYS.map(m=>[m,['view']])),updatedAt:new Date()});
 for(const [id,roleId,homeScopeId] of [['admin','super_admin','ORG'],['operator','org_admin','FA'],['foreign','org_admin','FB'],['reader','facility_manager','FA'],['tech','technician','FA'],['session','org_admin','FA'],['mfa','org_admin','FA']]) await models.User.create({_id:id,name:id,email:`${id}@stage5.test`,passwordHash:password,initials:id.slice(0,2),roleId,homeScopeId,title:'Stage 5 user'});
 const {createApp}=await import('../../backend/src/app.ts');app=createApp();server=app.listen(0,'127.0.0.1');await once(server,'listening');api=`http://127.0.0.1:${server.address().port}/api/v1`;
 for(const id of ['admin','operator','foreign','reader','tech'])sessions[id]=await login(id);
},{timeout:120000});
after(async()=>{if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}await mongoose.disconnect();if(database)await database.stop();});

test('logout invalidates the existing access token as well as refresh',async()=>{
 const s=await login('session');await ok(s,'/auth/logout','POST',{});
 assert.equal((await request(s,'/auth/me')).status,401);
 assert.equal((await request(s,'/auth/refresh','POST',{})).status,401);
});
test('only one concurrent refresh succeeds, rotation preserves the session ID and rejects replay',async()=>{
 const s=await login('session');const rows=await ok(s,'/auth/sessions');const current=rows.find(r=>r.current);assert.ok(current);
 const results=await Promise.all(Array.from({length:6},()=>request(s,'/auth/refresh','POST',{})));
 assert.equal(results.filter(r=>r.status===200).length,1);
 assert.ok(results.every(r=>[200,401].includes(r.status)),JSON.stringify(results));
 const next=results.find(r=>r.status===200);const rotated={token:next.body.data.accessToken,cookie:next.cookie};
 assert.equal((await ok(rotated,'/auth/sessions')).find(r=>r.current).id,current.id);
 assert.equal((await request(s,'/auth/refresh','POST',{})).status,401);
 await ok(rotated,'/auth/logout','POST',{});
});
test('password changes invalidate prior access and refresh credentials',async()=>{
 const s=await login('session');await ok(s,'/auth/change-password','POST',{currentPassword:password,newPassword:'Stage5-new-password!'});
 assert.equal((await request(s,'/auth/me')).status,401);
 assert.equal((await request(s,'/auth/refresh','POST',{})).status,401);
 const fresh=await login('session','Stage5-new-password!');await ok(fresh,'/auth/change-password','POST',{currentPassword:'Stage5-new-password!',newPassword:password});
});
test('read-only permission overrides refuse work-order actions and shared configuration writes',async()=>{
 for(const [path,method,body] of [['/work-orders/WO-absent/status','POST',{status:'In Progress'}],['/tracking/devices','POST',{name:'Forbidden radio',role:'Tag',technology:'BLE',facility:'Facility A'}],['/org-settings','PATCH',{name:'Forbidden'}],['/pm-schedules/run-automation','POST',{}]]) assert.equal((await request(sessions.reader,path,method,body)).status,403,path);
});
test('a workspace-only account can read its inbox without maintenance grants',async()=>{
 await models.User.create({_id:'minimal',name:'Minimal',email:'minimal@stage5.test',passwordHash:password,initials:'MI',roleId:'security_officer',homeScopeId:'FA',title:'Minimal'});
 await models.RoleGrant.create({_id:'security_officer',modules:['workspace'],actions:{workspace:['view']},updatedAt:new Date()});
 (await import('../../backend/src/services/roleGrant.service.ts')).invalidateRoleGrants();
 const s=await login('minimal');assert.equal((await request(s,'/notifications')).status,200);assert.equal((await request(s,'/tracking/workspace')).status,403);
});
test('facility administrators cannot reset another facility or platform administrator password',async()=>{
 assert.equal((await request(sessions.operator,'/users/foreign/password','PATCH',{password:'Unwanted-password5!'})).status,404);
 assert.equal((await request(sessions.operator,'/users/admin/password','PATCH',{password:'Unwanted-password5!'})).status,404);
});
test('cookie-authenticated mutations reject an untrusted Origin',async()=>{
 const s=await login('session');const r=await request(s,'/auth/refresh','POST',{}, {Origin:'https://attacker.invalid'});assert.equal(r.status,403);assert.equal(r.headers.get('access-control-allow-origin'),null);
});
test('MFA challenge cannot be redeemed concurrently more than once',async()=>{
 const s=await login('mfa');const setup=await ok(s,'/auth/mfa/setup','POST',{});const enabled=await ok(s,'/auth/mfa/enable','POST',{code:totp(setup.secret)});assert.equal(enabled.recoveryCodes.length,8);
 const challenge=await login('mfa');assert.ok(challenge.challenge);assert.equal(challenge.token,undefined);assert.equal(challenge.cookie,undefined);
 const results=await Promise.all(Array.from({length:4},()=>request(null,'/auth/mfa/verify','POST',{challengeToken:challenge.challenge,code:enabled.recoveryCodes[0]})));
 assert.equal(results.filter(r=>r.status===200).length,1);
 assert.ok(results.every(r=>[200,401].includes(r.status)),JSON.stringify(results));
 const second=await login('mfa');assert.equal((await request(null,'/auth/mfa/verify','POST',{challengeToken:second.challenge,code:enabled.recoveryCodes[0]})).status,401);
});

test('logout-all and single-session revocation invalidate access immediately',async()=>{
 const a=await login('session'),b=await login('session');
 const rows=await ok(b,'/auth/sessions');const current=rows.find(r=>r.current);
 await ok(a,`/auth/sessions/${current.id}/revoke`,'POST',{});
 assert.equal((await request(b,'/auth/me')).status,401);
 assert.equal((await request(a,'/auth/me')).status,200);
 await ok(a,'/auth/logout-all','POST',{});
 assert.equal((await request(a,'/auth/me')).status,401);
});
test('JWT claims, signature, expiry and session owner are enforced',async()=>{
 const jwt=(await import('jsonwebtoken')).default;const s=await login('session');const decoded=jwt.decode(s.token);
 for(const patch of [{sub:'foreign'},{typ:'refresh'},{sid:undefined},{iss:'wrong'},{aud:'wrong'},{exp:1}]) {
  const token=jwt.sign({...decoded,...patch},process.env.JWT_ACCESS_SECRET);assert.equal((await request({token},'/auth/me')).status,401);
 }
 const token=jwt.sign(decoded,'an-untrusted-signing-secret');assert.equal((await request({token},'/auth/me')).status,401);
 assert.equal((await request(null,'/auth/me')).status,401);
});
test('suspended accounts and foreign session revocation are refused',async()=>{
 const s=await login('session');await models.User.updateOne({_id:'session'},{$set:{status:'suspended'}});
 assert.equal((await request(s,'/auth/me')).status,403);
 assert.equal((await request(s,'/auth/refresh','POST',{})).status,403);
 await models.User.updateOne({_id:'session'},{$set:{status:'active'}});
 const foreign=(await ok(sessions.foreign,'/auth/sessions')).find(r=>r.current);
 assert.equal((await request(sessions.operator,`/auth/sessions/${foreign.id}/revoke`,'POST',{})).status,404);
 assert.equal((await request(sessions.foreign,'/auth/me')).status,200);
});
test('role, user, scope and shared-platform administration stay inside their boundaries',async()=>{
 const users=await ok(sessions.operator,'/users');assert.ok(users.every(u=>u.homeScopeId==='FA'&&u.roleId!=='super_admin'));
 assert.equal((await request(sessions.operator,'/users/foreign')).status,404);
 assert.equal((await request(sessions.operator,'/users/tech','PATCH',{roleId:'super_admin'})).status,403);
 assert.equal((await request(sessions.operator,'/users/tech','PATCH',{homeScopeId:'FB'})).status,403);
 assert.equal((await request(sessions.operator,'/users/roles/technician','PATCH',{modules:['admin']})).status,403);
 assert.equal((await request(sessions.operator,'/scope/FB','PATCH',{name:'Intrusion'})).status,404);
 assert.ok((await ok(sessions.operator,'/scope')).every(r=>r.id==='FA'));
 for(const path of ['/api-keys','/API-KEYS','/webhooks','/backups','/integrations'])assert.equal((await request(sessions.operator,path)).status,403,path);
 assert.equal((await request(sessions.operator,'/org-settings','PATCH',{name:'Intrusion'})).status,403);
});
test('notifications cannot be read or marked through another user ID',async()=>{
 await models.Notification.create({_id:'N-stage5-foreign',userId:'foreign',title:'Private',body:'Private',category:'System',type:'info',at:new Date(),read:false});
 assert.equal((await request(sessions.operator,'/notifications/N-stage5-foreign/read','POST',{})).status,404);
 await ok(sessions.operator,'/notifications/read-all','POST',{});
 assert.equal((await models.Notification.findById('N-stage5-foreign')).read,false);
 assert.ok(!(await ok(sessions.operator,'/notifications')).some(n=>n.id==='N-stage5-foreign'));
});
test('view-only grants deny mutation families before payload validation',async()=>{
 for(const [method,path] of [['POST','/work-orders'],['PATCH','/work-orders/WO-missing'],['DELETE','/work-orders/WO-missing'],['POST','/inspections'],['POST','/inspection-templates'],['POST','/assets'],['POST','/custody'],['POST','/alert-rules'],['PATCH','/users/tech'],['POST','/scope'],['POST','/insights/I-missing/action'],['POST','/pm-schedules'],['POST','/tracking/devices'],['POST','/asset-documents']]) {
  assert.equal((await request(sessions.reader,path,method,{})).status,403,`${method} ${path}`);
 }
});
test('empty view permissions take effect in both direct routes and dataset slices',async()=>{
 await models.RoleGrant.updateOne({_id:'facility_manager'},{$set:{'actions.assets':[]}});
 assert.equal((await request(sessions.reader,'/assets')).status,403);
 assert.deepEqual((await ok(sessions.reader,'/dataset')).assets,[]);
 await models.RoleGrant.updateOne({_id:'facility_manager'},{$set:{'actions.assets':['view']}});
});
test('personas are private by default and credentialed CORS accepts only configured origins',async()=>{
 assert.deepEqual(await ok(null,'/auth/personas'),[]);
 const allowed=await request(null,'/auth/login','OPTIONS',undefined,{Origin:'http://127.0.0.1:5173','Access-Control-Request-Method':'POST'});
 assert.equal(allowed.status,204);assert.equal(allowed.headers.get('access-control-allow-origin'),'http://127.0.0.1:5173');assert.equal(allowed.headers.get('access-control-allow-credentials'),'true');
 const s=await login('session');const raw=await request(s,'/auth/refresh','POST',{});const cookie=raw.headers.get('set-cookie');assert.match(cookie,/HttpOnly/i);assert.match(cookie,/Path=\/api\/v1\/auth/);assert.match(cookie,/SameSite=Lax/i);
});
test('MFA attempts expire, are bounded, and pending challenges die after password reset',async()=>{
 const {MfaChallenge}=models;
 const expired=await login('mfa');await MfaChallenge.updateMany({userId:'mfa'},{$set:{expiresAt:new Date(0)}});
 assert.equal((await request(null,'/auth/mfa/verify','POST',{challengeToken:expired.challenge,code:'000000'})).status,401);
 const limited=await login('mfa');for(let i=0;i<6;i++)assert.equal((await request(null,'/auth/mfa/verify','POST',{challengeToken:limited.challenge,code:'invalid-code'})).status,401);
 const pending=await login('mfa');await ok(sessions.admin,'/users/mfa/password','PATCH',{password:'Stage5-reset-password!'});
 assert.equal((await request(null,'/auth/mfa/verify','POST',{challengeToken:pending.challenge,code:'000000'})).status,401);
});

test('invalid and unsafe environment settings refuse startup',async()=>{
 const {spawnSync}=await import('node:child_process');
 for(const overrides of [{NODE_ENV:'production',COOKIE_SECURE:'false'},{CORS_ORIGIN:'*'},{COOKIE_SAME_SITE:'none',COOKIE_SECURE:'false'},{JWT_ACCESS_TTL:'0s'},{JWT_REFRESH_TTL:'99999999999999d'},{PORT:'65536'},{API_PREFIX:'//api/'},{CORS_ORIGIN:'https://example.test/path'},{NODE_ENV:'production',COOKIE_SECURE:'true',ENABLE_DEMO_PERSONAS:'true'}]) {
  const r=spawnSync(process.execPath,['--import','tsx','--eval',"import('./backend/src/config/env.ts')"],{env:{...process.env,...overrides},encoding:'utf8',timeout:15000});
  assert.equal(r.status,1,JSON.stringify(overrides));assert.doesNotMatch(r.stderr,new RegExp(process.env.JWT_ACCESS_SECRET));
 }
});
test('compiled production API starts, serves health and secure cookies, and exits cleanly',async()=>{
 await mongoose.connection.collection('ratelimithits').deleteMany({});
 const {spawn}=await import('node:child_process');const net=await import('node:net');
 const probe=net.createServer();probe.listen(0,'127.0.0.1');await once(probe,'listening');const port=probe.address().port;await new Promise(r=>probe.close(r));
 const child=spawn(process.execPath,['backend/dist/index.js'],{env:{...process.env,NODE_ENV:'production',PORT:String(port),HOST:'127.0.0.1',COOKIE_SECURE:'true',COOKIE_SAME_SITE:'strict',CORS_ORIGIN:'https://app.example.test',AUTH_RATE_LIMIT_MAX:'2'},stdio:['ignore','pipe','pipe']});
 let output='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);const exited=once(child,'exit');
 try {
  let health;
  for(let i=0;i<100;i++){try{health=await fetch(`http://127.0.0.1:${port}/health`);if(health.ok)break;}catch{/* The child may not have bound its socket yet. */}await new Promise(r=>setTimeout(r,100));}
  assert.equal(health?.status,200,output);assert.equal((await health.json()).data.environment,'production');
  const res=await fetch(`http://127.0.0.1:${port}/api/v1/auth/login`,{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://app.example.test'},body:JSON.stringify({email:'session@stage5.test',password})});
  assert.equal(res.status,200);const cookie=res.headers.get('set-cookie');assert.match(cookie,/Secure/);assert.match(cookie,/HttpOnly/);assert.match(cookie,/SameSite=Strict/);
  assert.equal(res.headers.get('access-control-allow-origin'),'https://app.example.test');
  let denied;for(let i=0;i<3;i++)denied=await fetch(`http://127.0.0.1:${port}/api/v1/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'session@stage5.test',password:'incorrect'})});
  assert.equal(denied.status,429);
 }finally{child.kill('SIGTERM');const [code]=await exited;assert.equal(code,0,output);}
},{timeout:30000});

test('unavailable backups return an error without fabricating a completed row',async()=>{
 const before=await models.Backup.countDocuments();
 assert.equal((await request(sessions.admin,'/backups','POST',{})).status,501);
 assert.equal(await models.Backup.countDocuments(),before);
});
test('MFA TOTP replay is refused across distinct login challenges',async()=>{
 await models.User.create({_id:'totp',name:'TOTP user',email:'totp@stage5.test',passwordHash:password,initials:'TO',roleId:'technician',homeScopeId:'FA',title:'MFA tester'});
 const s=await login('totp');const setup=await ok(s,'/auth/mfa/setup','POST',{});
 await ok(s,'/auth/mfa/enable','POST',{code:totp(setup.secret)});
 const a=await login('totp'),b=await login('totp');const code=totp(setup.secret,Date.now()+30000);
 const results=await Promise.all([a,b].map(c=>request(null,'/auth/mfa/verify','POST',{challengeToken:c.challenge,code})));
 assert.deepEqual(results.map(r=>r.status).sort(),[200,401]);
 const winner=results.find(r=>r.status===200);const active={token:winner.body.data.accessToken,cookie:winner.cookie};
 const me=await ok(active,'/auth/me');assert.equal(me.user.mfaEnabled,true);assert.equal(me.user.mfaSecret,undefined);assert.equal(me.user.mfaRecoveryCodes,undefined);
});
test('foreign workflow writes are refused and scoped audit/directory reads exclude neighbors',async()=>{
 const wf=await ok(sessions.admin,'/approval-workflows','POST',{name:'Private workflow',trigger:'asset_transfer',status:'Active',scopeId:'FB',steps:[{order:1,name:'Approval',approverRole:'org_admin'}]},201);
 assert.equal((await request(sessions.operator,`/approval-workflows/${wf.id}`,'PATCH',{name:'Intrusion'})).status,404);
 assert.equal((await request(sessions.operator,`/approval-workflows/${wf.id}`,'DELETE')).status,404);
 assert.ok(!(await ok(sessions.operator,'/approval-workflows')).some(r=>r.id===wf.id));
 await models.AuditLog.create({actor:'foreign@stage5.test',action:'test',target:'private',category:'Security',scopeId:'FB'});
 const rows=await ok(sessions.operator,'/audit');assert.ok(!rows.some(r=>r.target==='private'));
 const data=await ok(sessions.operator,'/dataset');assert.ok(data.users.every(u=>u.homeScopeId==='FA'));
});
test('database connection failure stops the compiled API instead of serving a demo estate',async()=>{
 const {spawnSync}=await import('node:child_process');
 const result=spawnSync(process.execPath,['backend/dist/index.js'],{env:{...process.env,MONGODB_URI:'mongodb://127.0.0.1:1',MONGODB_SERVER_SELECTION_TIMEOUT_MS:'500'},encoding:'utf8',timeout:10000});
 assert.equal(result.status,1);assert.match(result.stderr+result.stdout,/Failed to start server|connect/i);
});


test('permission payloads and nonexistent home scopes fail validation without changing records',async()=>{
 assert.equal((await request(sessions.admin,'/users/roles/technician/permissions','PATCH',{permissions:{assets:'approve'}})).status,422);
 assert.equal((await request(sessions.admin,'/users/tech','PATCH',{homeScopeId:'MISSING'})).status,400);
 assert.equal((await models.User.findById('tech')).homeScopeId,'FA');
});

test('a restricted administrator cannot grant actions beyond their own permissions',async()=>{
 await models.RoleGrant.create({_id:'org_admin',modules:(await import('@access-genie/shared')).MODULE_KEYS,actions:{assets:['view']},updatedAt:new Date()});
 const grants=await import('../../backend/src/services/roleGrant.service.ts');grants.invalidateRoleGrants();
 try {assert.equal((await request(sessions.operator,'/users/tech','PATCH',{roleId:'technician'})).status,403);}
 finally {await models.RoleGrant.deleteOne({_id:'org_admin'});grants.invalidateRoleGrants();}
});

test('browser security settings, reload, password change and backup availability are truthful',async()=>{
 const {mkdtemp,rm}=await import('node:fs/promises');const {fileURLToPath}=await import('node:url');const net=await import('node:net');
 const {createServer}=await import('vite');const {default:react}=await import('@vitejs/plugin-react');const {default:tailwindcss}=await import('@tailwindcss/vite');const {Browser}=await import('./cdp.mjs');
 const profile=await mkdtemp(join(tmpdir(),'ag-stage5-browser-'));let vite,browser,page;
 try{
  vite=await createServer({configFile:false,envFile:false,root:fileURLToPath(new URL('../../frontend',import.meta.url)),cacheDir:join(profile,'vite-cache'),plugins:[react(),tailwindcss()],resolve:{alias:{'@':fileURLToPath(new URL('../../frontend/src',import.meta.url))}},define:{'import.meta.env.VITE_API_URL':JSON.stringify('/api/v1')},server:{host:'127.0.0.1',port:0,proxy:{'/api':{target:new URL(api).origin}}},logLevel:'error'});
  await vite.listen();const web=`http://127.0.0.1:${vite.httpServer.address().port}`;
  const socket=net.createServer().listen(0,'127.0.0.1');await once(socket,'listening');const port=socket.address().port;await new Promise(r=>socket.close(r));browser=await Browser.launch({port,userDataDir:profile});page=await browser.page();
  await page.nav(web+'/login');assert.ok(await page.waitForSelector('#login-email',20000));
  await page.fill('#login-email','admin@stage5.test');await page.fill('#login-password',password);await page.click('button[type="submit"]');assert.ok(await page.waitForSelector('#main',30000));
  await page.nav(web+'/admin/users');assert.ok(await page.waitForText('Users & Roles',20000));
  await page.clickText('#main button','+ Invite User');assert.ok(await page.waitForText('Invite a user',10000));
  await page.fill('#invite-name','Browser Role User');await page.fill('#invite-email','browser-role@stage5.test');await page.fill('#invite-title','Field Technician');await page.fill('#invite-password','BrowserRole123!');
  await page.eval(`const s=document.querySelector('#invite-role');s.value='technician';s.dispatchEvent(new Event('change',{bubbles:true}));`);
  await page.click('[role="dialog"] button[type="submit"]');assert.ok(await page.waitForText('Browser Role User can now sign in',20000));
  const created=await models.User.findOne({email:'browser-role@stage5.test'}).lean();assert.ok(created);assert.equal(created.roleId,'technician');
  const createdHref=await page.eval(`const row=[...document.querySelectorAll('#main tbody tr')].find(e=>e.textContent.includes('browser-role@stage5.test'));return row?.querySelector('a')?.getAttribute('href');`);assert.equal(createdHref,`/admin/users/${created._id}`);
  await page.click('button[aria-label="Account menu"]');await page.clickText('[role="menu"] button','Sign out');assert.ok(await page.waitForSelector('#login-email',15000));
  await page.fill('#login-email','browser-role@stage5.test');await page.fill('#login-password','BrowserRole123!');await page.click('button[type="submit"]');assert.ok(await page.waitForSelector('#main',20000));
  assert.match(await page.text(),/Technician/);
  await page.nav(web+'/tracking');assert.ok(await page.waitForSelector('#main',15000));assert.doesNotMatch(await page.text(),/Access denied|do not have access/i);
  await page.nav(web+'/assets');assert.ok(await page.waitForSelector('#main',15000));assert.doesNotMatch(await page.text(),/Access denied|do not have access/i);
  await page.nav(web+'/analytics');assert.ok(await page.waitForText('You do not have access to this module',15000));
  await page.nav(web+'/admin/users');assert.ok(await page.waitForText('You do not have access to this module',15000));
  await page.click('button[aria-label="Account menu"]');await page.clickText('[role="menu"] button','Sign out');assert.ok(await page.waitForSelector('#login-email',15000));
  await page.fill('#login-email','admin@stage5.test');await page.fill('#login-password',password);await page.click('button[type="submit"]');assert.ok(await page.waitForSelector('#main',20000));
  await models.User.deleteOne({_id:created._id});
  await page.nav(web+'/settings/security');assert.ok(await page.waitForText('Change password',20000));assert.match(await page.text(),/Saved device labels/);assert.doesNotMatch(await page.text(),/MFA and passkeys/);
  await page.nav(web+'/admin/data');assert.ok(await page.waitForText('Backup unavailable',15000));assert.match(await page.text(),/do not prove a restorable backup/);
  await page.nav(web+'/settings/security');assert.ok(await page.waitForSelector('#cur-pw',15000));
  await page.fill('#cur-pw',password);await page.fill('#new-pw','Stage5-browser-new!');await page.fill('#cf-pw','Stage5-browser-new!');await page.click('button[type="submit"]');
  assert.ok(await page.waitForSelector('#login-email',15000),'Password change signs out the browser');
  assert.equal((await request(sessions.admin,'/auth/me')).status,401);
  await page.fill('#login-email','admin@stage5.test');await page.fill('#login-password','Stage5-browser-new!');await page.click('button[type="submit"]');assert.ok(await page.waitForSelector('#main',15000));
  await page.nav(web+'/settings/security');assert.ok(await page.waitForText('Change password',15000));
  assert.deepEqual(page.pageErrors,[]);
 }finally{page?.ws.close();if(browser)await browser.close();if(vite)await vite.close();await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
},{timeout:90000});
