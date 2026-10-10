import fs from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';
export async function runTests() {
  const code=await fs.readFile(new URL('../i18n.js',import.meta.url),'utf8');
  const sandbox={navigator:{language:'it-IT'}};
  vm.runInNewContext(code,sandbox);
  const ui=sandbox.ZammadI18n;
  assert.equal(ui.t('Riproduci'),'Riproduci');
  ui.setLanguage('en'); assert.equal(ui.t('Riproduci'),'Play'); assert.equal(ui.t('Trascrivi'),'Transcribe');
  ui.setLanguage('it'); assert.equal(ui.t('Trascrivi'),'Trascrivi');
  sandbox.navigator.language='de-DE'; ui.setLanguage('auto'); assert.equal(ui.language,'en');
  sandbox.navigator.language='it-CH'; ui.setLanguage('auto'); assert.equal(ui.language,'it');
  ui.setLanguage('unsupported'); assert.equal(ui.preference,'auto');
  for(const [original,english] of Object.entries(ui.english)) {assert.ok(original.length);assert.ok(english.length);}
  ui.setLanguage('en');
  for(const file of ['content.js','settings.js','options.js','background.js']) {
    const source=await fs.readFile(new URL('../'+file,import.meta.url),'utf8');
    new vm.Script(source);
    let matched = 0;
    for(const match of source.matchAll(/ZammadI18n[.]t[(]('.*?')[)]/g)) {
      matched++;
      const key=vm.runInNewContext(match[1]);
      assert.ok(Object.hasOwn(ui.english,key),file+': missing translation '+key);
    }
    assert.ok(matched > 0, file + ': no translated strings found');
    for (const original of Object.keys(ui.english)) {
      const literal = "'" + original + "'";
      let start = 0, at;
      while ((at = source.indexOf(literal, start)) !== -1) {
        assert.equal(source.slice(Math.max(0, at - 13), at), 'ZammadI18n.t(', file + ': untranslated literal ' + original);
        start = at + literal.length;
      }
    }
  }
  const en=JSON.parse(await fs.readFile(new URL('../_locales/en/messages.json',import.meta.url),'utf8'));
  const it=JSON.parse(await fs.readFile(new URL('../_locales/it/messages.json',import.meta.url),'utf8'));
  assert.deepEqual(Object.keys(en),Object.keys(it));
  return 'PASS: Italian/English selection, browser fallback, translation completeness, localized metadata, JavaScript syntax.';
}
if(typeof process!=='undefined'&&process.argv[1]&&import.meta.url===(await import('node:url')).pathToFileURL(process.argv[1]).href)console.log(await runTests());
