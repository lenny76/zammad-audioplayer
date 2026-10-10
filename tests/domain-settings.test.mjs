import fs from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';
export async function runTests() {
  const settings = await fs.readFile(new URL('../settings.js', import.meta.url), 'utf8');
  const bg = await fs.readFile(new URL('../background.js', import.meta.url), 'utf8');
  let listener;
  let stored = {};
  let scripts = [];
  let grants = new Set();
  const sandbox = {URL, setTimeout, clearTimeout, AbortController,
    chrome: {
      runtime: {id:'test',getURL:file=>'chrome-extension://test/'+file,openOptionsPage:async()=>{},onMessage:{addListener(fn){listener=fn;}},onInstalled:{addListener(){}},onStartup:{addListener(){}}},
      action:{onClicked:{addListener(){}}},
      storage:{local:{setAccessLevel:async()=>{},get:async()=>stored,set:async data=>Object.assign(stored,data)}},
      permissions:{contains:async({origins})=>origins.every(origin=>grants.has(origin))},
      scripting:{getRegisteredContentScripts:async()=>scripts,registerContentScripts:async items=>{scripts=items;},updateContentScripts:async items=>{scripts=items;}}
    },
    importScripts(){vm.runInContext(settings,sandbox);},
    fetch(){throw new Error('Network must not be used in this test');}
  };
  vm.createContext(sandbox); vm.runInContext(bg,sandbox);
  const W = sandbox.ZammadSettings;
  assert.equal(W.validate('https://tickets.example.org/').origin,'https://tickets.example.org');
  assert.equal(W.validate('http://192.168.1.5:8000').origin,'http://192.168.1.5:8000');
  for(const url of ['https://tickets.example.org/#ticket/1','https://tickets.example.org/api/v1','https://name:pass@tickets.example.org','http://public.example.org','file:///tmp']) assert.throws(()=>W.validate(url));
  const options={id:'test',url:'chrome-extension://test/options.html'};
  const send=(message,sender)=>new Promise(resolve=>{assert.equal(listener(message,sender,resolve),true);});
  let result=await send({type:'za-configure-site',origin:'https://tickets.example.org'},options);
  assert.equal(result.ok,false); assert.equal(stored.zammad,undefined);
  grants.add('https://tickets.example.org/*');
  result=await send({type:'za-configure-site',origin:'https://tickets.example.org'},options);
  assert.equal(result.ok,true); assert.equal(stored.zammad.origin,'https://tickets.example.org');
  assert.deepEqual(Array.from(scripts[0].matches),['https://tickets.example.org/*']);
  assert.deepEqual(Array.from(scripts[0].js),['pcm-player.js','content.js']);
  assert.equal(scripts[0].persistAcrossSessions,true);
  const sender={id:'test',url:'https://tickets.example.org/#ticket/1',tab:{id:1}};
  assert.equal((await send({type:'za-options'},sender)).ok,true);
  assert.equal((await send({type:'za-options'},{...sender,url:'https://other.example.org/'})).ok,false);
  assert.equal((await send({type:'za-transcribe',url:'https://evil.example.org/api/v1/ticket_attachment/1/2/3'},sender)).ok,false);
  assert.equal(listener({type:'za-configure-site',origin:'https://evil.example.org'},sender,()=>{}),undefined);
  grants.add('https://new.example.org/*');
  assert.equal((await send({type:'za-configure-site',origin:'https://new.example.org'},options)).ok,true);
  assert.equal(scripts.length,1); assert.deepEqual(Array.from(scripts[0].matches),['https://new.example.org/*']);
  assert.equal((await send({type:'za-options'},sender)).ok,false,'Old domain must no longer be accepted');
  const manifest=JSON.parse(await fs.readFile(new URL('../manifest.json', import.meta.url),'utf8'));
  assert.equal(manifest.content_scripts,undefined); assert.equal(manifest.host_permissions,undefined);
  assert.equal(manifest.permissions.includes('scripting'),true);
  for(const file of ['content.js','pcm-player.js','background.js','settings.js','options.js'])new vm.Script(await fs.readFile(new URL('../'+file, import.meta.url),'utf8'));
  return 'PASS: domain validation, exact-host permission, denied configuration, dynamic registration/update, authorized sender, external attachment rejection, options-only configuration, old-domain rejection, manifest and syntax.';
}
if (typeof process !== 'undefined' && process.argv[1] && import.meta.url === (await import('node:url')).pathToFileURL(process.argv[1]).href) console.log(await runTests());
