const translatedNodes = [];
const walker = document.createTreeWalker(document.documentElement, NodeFilter.SHOW_TEXT);
while (walker.nextNode()) {
  const node = walker.currentNode;
  if (['SCRIPT', 'STYLE'].includes(node.parentElement?.tagName)) continue;
  const text = node.textContent.trim();
  if (Object.hasOwn(ZammadI18n.english, text)) translatedNodes.push({node, original: node.textContent, text});
}
const languagePlaceholder = document.getElementById('language').getAttribute('placeholder');
function applyLanguage() {
  document.documentElement.lang = ZammadI18n.language;
  document.title = ZammadI18n.t('Impostazioni Zammad Audio Player');
  for (const {node, original, text} of translatedNodes) node.textContent = original.replace(text, ZammadI18n.t(text));
  document.getElementById('language').placeholder = ZammadI18n.t(languagePlaceholder);
}
applyLanguage();
(async () => {
  try {
    const {uiLanguage} = await chrome.storage.local.get('uiLanguage');
    ZammadI18n.setLanguage(uiLanguage);
    document.getElementById('uiLanguage').value = ZammadI18n.preference;
    applyLanguage();
  } catch { /* Browser language remains the fallback. */ }
})();
document.getElementById('uiLanguage').addEventListener('change', async event => {
  const notice = document.getElementById('language-status');
  try {
    const result = await chrome.runtime.sendMessage({type: 'za-set-language', language: event.target.value});
    if (!result?.ok) throw new Error(result?.error || 'Unable to save language.');
    ZammadI18n.setLanguage(event.target.value);
    applyLanguage();
    document.getElementById('status').textContent = '';
    document.getElementById('zammad-status').textContent = '';
    notice.textContent = ZammadI18n.t('Lingua salvata. Ricarica Zammad per applicarla al player.');
  } catch (error) { notice.textContent = error.message; }
});
const fields = ['endpoint', 'model', 'language', 'apiKey'];
const status = document.getElementById('status');
(async () => {
  try {
    await chrome.storage.local.setAccessLevel({accessLevel: 'TRUSTED_CONTEXTS'});
    const {whisper} = await chrome.storage.local.get('whisper');
    const settings = {...WhisperSettings.defaults, ...whisper};
    for (const field of fields) document.getElementById(field).value = settings[field];
  } catch { status.textContent = ZammadI18n.t('Impossibile leggere le impostazioni.'); }
})();
document.getElementById('settings').addEventListener('submit', async event => {
  event.preventDefault();
  try {
    const input = Object.fromEntries(fields.map(field => [field, document.getElementById(field).value]));
    const settings = WhisperSettings.validate(input);
    const granted = await chrome.permissions.request({origins: [WhisperSettings.origin(settings.endpoint)]});
    if (!granted) throw new Error(ZammadI18n.t('Accesso al server non autorizzato: impostazioni non salvate.'));
    await chrome.storage.local.setAccessLevel({accessLevel: 'TRUSTED_CONTEXTS'});
    await chrome.storage.local.set({whisper: settings});
    status.textContent = ZammadI18n.t('Impostazioni salvate. Il pulsante Trascrivi invierà l’audio a ') + new URL(settings.endpoint).origin + '.';
  } catch (error) { status.textContent = error.message; }
});
document.getElementById('clear').addEventListener('click', async () => {
  try {
    const {whisper} = await chrome.storage.local.get('whisper');
    if (whisper) await chrome.storage.local.set({whisper: {...whisper, apiKey: ''}});
    document.getElementById('apiKey').value = '';
    status.textContent = ZammadI18n.t('Chiave eliminata.');
  } catch { status.textContent = ZammadI18n.t('Impossibile eliminare la chiave.'); }
});
const zammadStatus = document.getElementById('zammad-status');
(async () => {
  try {
    const {zammad} = await chrome.storage.local.get('zammad');
    document.getElementById('zammadOrigin').value = zammad?.origin || '';
  } catch { zammadStatus.textContent = ZammadI18n.t('Impossibile leggere il dominio Zammad.'); }
})();
document.getElementById('zammad-settings').addEventListener('submit', async event => {
  event.preventDefault();
  try {
    const settings = ZammadSettings.validate(document.getElementById('zammadOrigin').value);
    const granted = await chrome.permissions.request({origins: [ZammadSettings.pattern(settings.origin)]});
    if (!granted) throw new Error(ZammadI18n.t('Accesso al sito non autorizzato: dominio non salvato.'));
    const result = await chrome.runtime.sendMessage({type: 'za-configure-site', origin: settings.origin});
    if (!result?.ok) throw new Error(result?.error || ZammadI18n.t('Impossibile attivare il player.'));
    document.getElementById('zammadOrigin').value = settings.origin;
    zammadStatus.textContent = ZammadI18n.t('Player attivo su ') + settings.origin + ZammadI18n.t('. Ricarica le schede Zammad aperte.');
  } catch (error) { zammadStatus.textContent = error.message; }
});
