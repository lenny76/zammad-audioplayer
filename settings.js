globalThis.WhisperSettings = {
  defaults: {endpoint: 'https://api.openai.com/v1/audio/transcriptions', model: 'whisper-1', language: 'it', apiKey: ''},
  validate(input) {
    const endpoint = new URL(input.endpoint.trim());
    const octets = endpoint.hostname.split('.');
    const isPrivateLan = octets.length === 4 && octets[0] === '192' && octets[1] === '168' && octets.every(value => /^\d{1,3}$/.test(value) && Number(value) <= 255);
    const isLoopback = ['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname);
    if (endpoint.protocol !== 'https:' && !(endpoint.protocol === 'http:' && (isPrivateLan || isLoopback))) throw new Error(ZammadI18n.t('Usa HTTPS; HTTP è ammesso solo per localhost e indirizzi 192.168.x.x.'));
    if (endpoint.username || endpoint.password || endpoint.search || endpoint.hash) throw new Error(ZammadI18n.t('Endpoint senza credenziali, parametri o frammenti URL.'));
    const model = input.model.trim();
    const language = input.language.trim().toLowerCase();
    if (!model) throw new Error(ZammadI18n.t('Indica il modello.'));
    if (language && !/^[a-z]{2}$/.test(language)) throw new Error(ZammadI18n.t('Lingua: codice a due lettere, oppure vuoto per riconoscimento automatico.'));
    return {endpoint: endpoint.href, model, language, apiKey: input.apiKey.trim()};
  },
  origin(endpoint) {
    const settings = this.validate({...this.defaults, endpoint});
    return new URL(settings.endpoint).origin + '/*';
  }
};
// Zammad is configured separately so transcription remains optional.
globalThis.ZammadSettings = {
  validate(value) {
    const url = new URL(value.trim());
    WhisperSettings.validate({...WhisperSettings.defaults, endpoint: url.href});
    if (url.pathname !== '/') throw new Error(ZammadI18n.t('Indica solo l’indirizzo base di Zammad, senza percorsi ticket o API.'));
    return {origin: url.origin};
  },
  pattern(origin) { return this.validate(origin).origin + '/*'; }
};
