importScripts('i18n.js', 'settings.js');
const storageReady = chrome.storage.local.setAccessLevel({accessLevel: 'TRUSTED_CONTEXTS'}).then(async () => {
  const {uiLanguage} = await chrome.storage.local.get('uiLanguage');
  ZammadI18n.setLanguage(uiLanguage);
});
chrome.action.onClicked.addListener(() => chrome.runtime.openOptionsPage());
const busy = new Set();
async function allowedSender(sender) {
  try {
    if (sender.id !== chrome.runtime.id || !sender.tab) return false;
    await storageReady;
    const {zammad, uiLanguage} = await chrome.storage.local.get(['zammad', 'uiLanguage']);
    ZammadI18n.setLanguage(uiLanguage);
    return !!zammad && new URL(sender.url).origin === ZammadSettings.validate(zammad.origin).origin;
  } catch { return false; }
}
const scriptId = 'zammad-audio-player';
async function registerSite(origin) {
  const pattern = ZammadSettings.pattern(origin);
  if (!await chrome.permissions.contains({origins: [pattern]})) throw new Error(ZammadI18n.t('Autorizza prima il dominio Zammad nelle impostazioni.'));
  const script = {id: scriptId, matches: [pattern], js: ['i18n.js', 'pcm-player.js', 'content.js'], css: ['player.css'], runAt: 'document_idle', persistAcrossSessions: true};
  const existing = await chrome.scripting.getRegisteredContentScripts({ids: [scriptId]});
  if (existing.length) await chrome.scripting.updateContentScripts([script]);
  else await chrome.scripting.registerContentScripts([script]);
}
async function restoreSite() {
  await storageReady;
  const {zammad} = await chrome.storage.local.get('zammad');
  if (zammad) await registerSite(zammad.origin);
}
chrome.runtime.onInstalled.addListener(details => {
  restoreSite().catch(() => {});
  if (details.reason === 'install') chrome.runtime.openOptionsPage();
});
chrome.runtime.onStartup.addListener(() => restoreSite().catch(() => {}));
async function transcribe(message, sender) {
  if (!await allowedSender(sender)) throw new Error(ZammadI18n.t('Pagina Zammad non autorizzata.'));
  const attachment = new URL(message.url);
  if (attachment.origin !== new URL(sender.url).origin || !/^\/api\/v1\/ticket_attachment\/\d+\/\d+\/\d+\/?$/.test(attachment.pathname)) throw new Error(ZammadI18n.t('Allegato non valido.'));
  attachment.search = '?disposition=attachment';
  await storageReady;
  const {whisper} = await chrome.storage.local.get('whisper');
  if (!whisper) throw new Error(ZammadI18n.t('Apri Impostazioni e configura prima l’API Whisper.'));
  const settings = WhisperSettings.validate(whisper);
  if (!await chrome.permissions.contains({origins: [WhisperSettings.origin(settings.endpoint)]})) throw new Error(ZammadI18n.t('Apri Impostazioni e salva per autorizzare il server.'));
  const key = sender.tab.id + ':' + attachment.pathname;
  if (busy.has(key)) throw new Error(ZammadI18n.t('Trascrizione già in corso.'));
  busy.add(key);
  const controller = new AbortController();
  let timeout;
  try {
    // Each network operation has a deadline shorter than MV3's fetch response timeout.
    timeout = setTimeout(() => controller.abort(), 25000);
    const response = await fetch(attachment.href, {credentials: 'include', redirect: 'error', cache: 'no-store', signal: controller.signal});
    if (!response.ok) throw new Error(ZammadI18n.t('Impossibile leggere l’allegato da Zammad (HTTP ') + response.status + ').');
    const type = response.headers.get('content-type') || '';
    if (/html|json/i.test(type)) throw new Error(ZammadI18n.t('Zammad non ha restituito un audio. Verifica la sessione.'));
    if (Number(response.headers.get('content-length')) > 25 * 1024 * 1024) throw new Error(ZammadI18n.t('Allegato superiore a 25 MB.'));
    const blob = await response.blob();
    if (!blob.size || blob.size > 25 * 1024 * 1024) throw new Error(ZammadI18n.t('Allegato vuoto o superiore a 25 MB.'));
    clearTimeout(timeout);
    const form = new FormData();
    form.append('file', blob, message.mime === 'audio/mpeg' ? 'voicemail.mp3' : 'voicemail.wav');
    form.append('model', settings.model);
    form.append('response_format', 'json');
    if (settings.language) form.append('language', settings.language);
    timeout = setTimeout(() => controller.abort(), 25000);
    const result = await fetch(settings.endpoint, {method: 'POST', headers: settings.apiKey ? {Authorization: 'Bearer ' + settings.apiKey} : {}, body: form, credentials: 'omit', redirect: 'error', signal: controller.signal});
    if (!result.ok) throw new Error('API Whisper: HTTP ' + result.status + (result.status === 401 ? ZammadI18n.t(' — verifica la chiave.') : result.status === 429 ? ZammadI18n.t(' — limite richieste o credito esaurito.') : ZammadI18n.t('. Verifica endpoint e modello.')));
    const data = await result.json();
    if (typeof data.text !== 'string') throw new Error(ZammadI18n.t('Risposta API incompatibile: manca il campo text.'));
    return {ok: true, text: data.text};
  } catch (error) {
    if (error.name === 'AbortError') throw new Error(ZammadI18n.t('Tempo di attesa scaduto (25 secondi). Verifica il servizio prima di riprovare: la richiesta potrebbe essere già stata elaborata.'));
    throw error;
  } finally { clearTimeout(timeout); busy.delete(key); }
}
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (sender.id !== chrome.runtime.id) return;
  if (message?.type === 'za-set-language') {
    if (sender.url !== chrome.runtime.getURL('options.html')) return;
    (async () => {
      await storageReady;
      if (!['auto', 'it', 'en'].includes(message.language)) throw new Error('Invalid interface language.');
      await chrome.storage.local.set({uiLanguage: message.language});
      ZammadI18n.setLanguage(message.language);
      return {ok: true};
    })().then(reply, error => reply({ok: false, error: error.message}));
    return true;
  }
  if (message?.type === 'za-configure-site') {
    if (sender.url !== chrome.runtime.getURL('options.html')) return;
    (async () => {
      await storageReady;
      const settings = ZammadSettings.validate(message.origin);
      await registerSite(settings.origin);
      await chrome.storage.local.set({zammad: settings});
      return {ok: true};
    })().then(reply, error => reply({ok: false, error: error.message}));
    return true;
  }
  if (!['za-options', 'za-transcribe', 'za-locale'].includes(message?.type)) return;
  (async () => {
    if (!await allowedSender(sender)) throw new Error(ZammadI18n.t('Pagina Zammad non autorizzata. Ricarica il sito configurato.'));
    if (message.type === 'za-locale') return {ok: true, language: ZammadI18n.preference};
    if (message.type === 'za-options') {
      await chrome.runtime.openOptionsPage();
      return {ok: true};
    }
    return transcribe(message, sender);
  })().then(reply, error => reply({ok: false, error: error.message}));
  return true;
});
