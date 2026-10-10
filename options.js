const fields = ['endpoint', 'model', 'language', 'apiKey'];
const status = document.getElementById('status');
(async () => {
  try {
    await chrome.storage.local.setAccessLevel({accessLevel: 'TRUSTED_CONTEXTS'});
    const {whisper} = await chrome.storage.local.get('whisper');
    const settings = {...WhisperSettings.defaults, ...whisper};
    for (const field of fields) document.getElementById(field).value = settings[field];
  } catch { status.textContent = 'Impossibile leggere le impostazioni.'; }
})();
document.getElementById('settings').addEventListener('submit', async event => {
  event.preventDefault();
  try {
    const input = Object.fromEntries(fields.map(field => [field, document.getElementById(field).value]));
    const settings = WhisperSettings.validate(input);
    const granted = await chrome.permissions.request({origins: [WhisperSettings.origin(settings.endpoint)]});
    if (!granted) throw new Error('Accesso al server non autorizzato: impostazioni non salvate.');
    await chrome.storage.local.setAccessLevel({accessLevel: 'TRUSTED_CONTEXTS'});
    await chrome.storage.local.set({whisper: settings});
    status.textContent = 'Impostazioni salvate. Il pulsante Trascrivi invierà l’audio a ' + new URL(settings.endpoint).origin + '.';
  } catch (error) { status.textContent = error.message; }
});
document.getElementById('clear').addEventListener('click', async () => {
  try {
    const {whisper} = await chrome.storage.local.get('whisper');
    if (whisper) await chrome.storage.local.set({whisper: {...whisper, apiKey: ''}});
    document.getElementById('apiKey').value = '';
    status.textContent = 'Chiave eliminata.';
  } catch { status.textContent = 'Impossibile eliminare la chiave.'; }
});
const zammadStatus = document.getElementById('zammad-status');
(async () => {
  try {
    const {zammad} = await chrome.storage.local.get('zammad');
    document.getElementById('zammadOrigin').value = zammad?.origin || '';
  } catch { zammadStatus.textContent = 'Impossibile leggere il dominio Zammad.'; }
})();
document.getElementById('zammad-settings').addEventListener('submit', async event => {
  event.preventDefault();
  try {
    const settings = ZammadSettings.validate(document.getElementById('zammadOrigin').value);
    const granted = await chrome.permissions.request({origins: [ZammadSettings.pattern(settings.origin)]});
    if (!granted) throw new Error('Accesso al sito non autorizzato: dominio non salvato.');
    const result = await chrome.runtime.sendMessage({type: 'za-configure-site', origin: settings.origin});
    if (!result?.ok) throw new Error(result?.error || 'Impossibile attivare il player.');
    document.getElementById('zammadOrigin').value = settings.origin;
    zammadStatus.textContent = 'Player attivo su ' + settings.origin + '. Ricarica le schede Zammad aperte.';
  } catch (error) { zammadStatus.textContent = error.message; }
});
