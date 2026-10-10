(() => {
  'use strict';
  const players = new Map();
  const audioExtension = /\.(wav|mp3)\b/i;
  function attachment(link) {
    let url;
    try { url = new URL(link.getAttribute('href'), location.href); } catch { return null; }
    if (url.origin !== location.origin || !/^\/api\/v1\/ticket_attachment\/\d+\/\d+\/\d+\/?$/.test(url.pathname)) return null;
    const hints = [link.textContent, link.getAttribute('download'), link.title, link.getAttribute('aria-label'), ...Array.from(link.querySelectorAll('[title]'), node => node.title)];
    const type = (link.getAttribute('type') || '').toLowerCase();
    const name = hints.find(hint => hint && audioExtension.test(hint));
    if (!name && !['audio/wav', 'audio/x-wav', 'audio/wave', 'audio/mpeg'].includes(type)) return null;
    return {url: url.href, name: name ? name.trim() : 'Allegato audio', mime: /\.mp3\b/i.test(name || '') || type === 'audio/mpeg' ? 'audio/mpeg' : 'audio/wav'};
  }
  async function describeAudio(blob, mime) {
    if (mime !== 'audio/wav') return 'MP3';
    const buffer = await blob.arrayBuffer();
    const view = new DataView(buffer);
    const tag = offset => String.fromCharCode(...new Uint8Array(buffer, offset, 4));
    if (buffer.byteLength < 12 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE') {
      throw new Error('Il file ricevuto non ha un’intestazione WAV RIFF valida. Verifica che l’allegato scaricato sia riproducibile.');
    }
    for (let offset = 12; offset + 8 <= buffer.byteLength;) {
      const size = view.getUint32(offset + 4, true);
      if (offset + 8 + size > buffer.byteLength) throw new Error('Il file WAV è incompleto o danneggiato.');
      if (tag(offset) === 'fmt ' && size >= 16) {
        const codec = view.getUint16(offset + 8, true);
        const codecs = {1: 'PCM', 2: 'Microsoft ADPCM', 3: 'IEEE float', 6: 'A-law', 7: 'µ-law', 17: 'IMA ADPCM', 49: 'GSM 6.10', 65534: 'WAVE extensible'};
        return 'WAV: ' + (codecs[codec] || 'codec ' + codec) + ' (codice ' + codec + '), ' + view.getUint32(offset + 12, true) + ' Hz, ' + view.getUint16(offset + 10, true) + ' canali, ' + view.getUint16(offset + 22, true) + ' bit';
      }
      offset += 8 + size + (size % 2);
    }
    throw new Error('Il file WAV non contiene una descrizione del formato valida.');
  }
  async function normalizePcm(blob, mime) {
    if (mime !== 'audio/wav') return blob;
    const buffer = await blob.arrayBuffer();
    const view = new DataView(buffer);
    let format = null;
    const chunks = [];
    for (let offset = 12; offset + 8 <= buffer.byteLength;) {
      const tag = String.fromCharCode(...new Uint8Array(buffer, offset, 4));
      const size = view.getUint32(offset + 4, true);
      if (offset + 8 + size > buffer.byteLength) throw new Error('Il file WAV è incompleto o danneggiato.');
      if (tag === 'fmt ' && size >= 16) format = {codec: view.getUint16(offset + 8, true), channels: view.getUint16(offset + 10, true), rate: view.getUint32(offset + 12, true), bits: view.getUint16(offset + 22, true)};
      if (tag === 'data') chunks.push(new Uint8Array(buffer, offset + 8, size));
      offset += 8 + size + (size % 2);
    }
    if (!format || format.codec !== 1) return blob;
    if (!chunks.length) throw new Error('Il WAV non contiene campioni audio.');
    const {channels, rate, bits} = format;
    if (!channels || !rate || ![8, 16, 24, 32].includes(bits)) throw new Error('Parametri PCM non validi.');
    const align = channels * bits / 8;
    const size = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    if (!size || size % align) throw new Error('I campioni PCM sono vuoti o incompleti.');
    const header = new ArrayBuffer(44);
    const output = new DataView(header);
    const bytes = new Uint8Array(header);
    for (const [offset, text] of [[0, 'RIFF'], [8, 'WAVE'], [12, 'fmt '], [36, 'data']]) {
      for (let i = 0; i < text.length; i++) bytes[offset + i] = text.charCodeAt(i);
    }
    output.setUint32(4, 36 + size + (size % 2), true);
    output.setUint32(16, 16, true);
    output.setUint16(20, 1, true);
    output.setUint16(22, channels, true);
    output.setUint32(24, rate, true);
    output.setUint32(28, rate * align, true);
    output.setUint16(32, align, true);
    output.setUint16(34, bits, true);
    output.setUint32(40, size, true);
    return new Blob([header, ...chunks, ...(size % 2 ? [new Uint8Array(1)] : [])], {type: 'audio/wav'});
  }
  function addSeekControls(audio) {
    const row = document.createElement('div');
    row.className = 'za-seek';
    row.hidden = true;
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '0';
    slider.max = '0';
    slider.step = '0.1';
    slider.value = '0';
    slider.disabled = true;
    slider.setAttribute('aria-label', 'Posizione audio in secondi');
    const time = document.createElement('span');
    time.className = 'za-time';
    const formatTime = value => {
      const seconds = Math.floor(Number.isFinite(value) ? Math.max(0, value) : 0);
      return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
    };
    function update() {
      const ready = Number.isFinite(audio.duration) && audio.duration > 0;
      slider.disabled = !ready;
      slider.max = ready ? String(audio.duration) : '0';
      slider.value = String(ready ? Math.min(audio.currentTime, audio.duration) : 0);
      time.textContent = formatTime(audio.currentTime) + ' / ' + formatTime(audio.duration);
      slider.setAttribute('aria-valuetext', time.textContent);
    }
    function seekTo(value) {
      if (!Number.isFinite(audio.duration) || audio.duration <= 0) return;
      audio.currentTime = Math.max(0, Math.min(audio.duration, value));
      update();
    }
    slider.addEventListener('input', () => seekTo(Number(slider.value)));
    row.append(slider, time);
    for (const delta of [-10, 10]) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = (delta > 0 ? '+' : '−') + '10 s';
      button.setAttribute('aria-label', delta > 0 ? 'Avanti di dieci secondi' : 'Indietro di dieci secondi');
      button.addEventListener('click', () => seekTo(audio.currentTime + delta));
      row.append(button);
    }
    for (const event of ['loadedmetadata', 'durationchange', 'timeupdate', 'seeked', 'emptied']) audio.addEventListener(event, update);
    update();
    return row;
  }
  function addPlayer(link, info) {
    const panel = document.createElement('div');
    panel.className = 'za-player';
    // Stop Zammad's delegated toggle handlers while preserving native controls.
    for (const event of ['click', 'dblclick', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'touchstart', 'touchend', 'keydown', 'keyup', 'input', 'change']) {
      panel.addEventListener(event, event => event.stopPropagation());
    }
    const heading = document.createElement('div');
    heading.className = 'za-title';
    heading.textContent = info.name.match(/.*\.(?:wav|mp3)\b/i)?.[0] || info.name;
    heading.title = info.name;
    const fileType = document.createElement('span');
    fileType.className = 'za-filetype';
    fileType.textContent = info.mime === 'audio/mpeg' ? 'MP3' : 'WAV';
    const header = document.createElement('div');
    header.className = 'za-header';
    const headingGroup = document.createElement('div');
    headingGroup.className = 'za-heading-group';
    const caption = document.createElement('div');
    caption.className = 'za-caption';
    caption.textContent = 'Messaggio vocale';
    headingGroup.append(caption, heading);
    header.append(headingGroup, fileType);
    const load = document.createElement('button');
    load.type = 'button';
    load.className = 'za-load';
    load.textContent = 'Riprova caricamento';
    load.hidden = true;
    const audio = document.createElement('audio');
    audio.controls = true;
    audio.preload = 'auto';
    audio.hidden = true;
    audio.setAttribute('aria-label', 'Riproduci ' + info.name);
    const label = document.createElement('label');
    label.className = 'za-speed';
    label.textContent = 'Velocità ';
    const speed = document.createElement('select');
    for (const value of [1, 1.5, 2]) {
      const option = document.createElement('option');
      option.value = String(value);
      option.textContent = value + '×';
      speed.append(option);
    }
    label.append(speed);
    label.hidden = true;
    const status = document.createElement('div');
    status.className = 'za-status';
    status.setAttribute('role', 'status');
    let pcm = null;
    const seekTarget = {
      get duration() { return (pcm || audio).duration; },
      get currentTime() { return (pcm || audio).currentTime; },
      set currentTime(value) { (pcm || audio).currentTime = value; },
      addEventListener(type, handler) { audio.addEventListener(type, handler); }
    };
    const seekControls = addSeekControls(seekTarget);
    const pcmControls = document.createElement('div');
    pcmControls.className = 'za-pcm-controls';
    pcmControls.hidden = true;
    const playPause = document.createElement('button');
    playPause.type = 'button';
    playPause.textContent = 'Riproduci';
    playPause.addEventListener('click', async () => {
      if (!pcm) return;
      try {
        if (pcm.paused) await pcm.play(); else pcm.pause();
      } catch (error) { status.textContent = 'Riproduzione non riuscita: ' + error.message; }
    });
    const volumeLabel = document.createElement('label');
    volumeLabel.textContent = 'Volume ';
    volumeLabel.className = 'za-volume';
    const volume = document.createElement('input');
    volume.type = 'range';
    volume.min = '0'; volume.max = '1'; volume.step = '0.01'; volume.value = '1';
    volume.setAttribute('aria-label', 'Volume');
    volume.addEventListener('input', () => { if (pcm) pcm.volume = Number(volume.value); });
    volumeLabel.append(volume);
    pcmControls.append(playPause, volumeLabel);
    const actions = document.createElement('div');
    actions.className = 'za-actions';
    const transcribe = document.createElement('button');
    transcribe.type = 'button';
    transcribe.className = 'za-transcribe-button';
    transcribe.textContent = 'Trascrivi';
    transcribe.title = 'Invia questo allegato al servizio Whisper configurato';
    const options = document.createElement('button');
    options.type = 'button';
    options.className = 'za-options-button';
    options.textContent = 'Impostazioni';
    const transcriptStatus = document.createElement('div');
    transcriptStatus.setAttribute('role', 'status');
    transcriptStatus.className = 'za-transcript-status';
    const transcript = document.createElement('textarea');
    transcript.className = 'za-transcript';
    transcript.readOnly = true;
    transcript.hidden = true;
    transcript.rows = 2;
    function fitTranscript() {
      if (transcript.hidden || !panel.isConnected) return;
      transcript.style.height = 'auto';
      transcript.style.height = Math.min(240, Math.max(64, transcript.scrollHeight + 2)) + 'px';
    }
    transcript.setAttribute('aria-label', 'Trascrizione del messaggio vocale');
    const copy = document.createElement('button');
    copy.type = 'button';
    copy.textContent = 'Copia testo';
    copy.hidden = true;
    actions.append(transcribe, options, copy);
    const toolbar = document.createElement('div');
    toolbar.className = 'za-toolbar';
    toolbar.append(load, actions);
    panel.append(header, toolbar, audio, pcmControls, seekControls, label, status, transcriptStatus, transcript);
    options.addEventListener('click', async () => {
      try {
        const result = await chrome.runtime.sendMessage({type: 'za-options'});
        if (!result?.ok) throw new Error(result?.error || 'Impossibile aprire le impostazioni.');
      } catch (error) { transcriptStatus.textContent = error.message; }
    });
    transcribe.addEventListener('click', async () => {
      transcribe.disabled = true;
      transcriptStatus.textContent = 'Trascrizione in corso…';
      try {
        const result = await chrome.runtime.sendMessage({type: 'za-transcribe', url: info.url, mime: info.mime});
        if (!result?.ok) throw new Error(result?.error || 'Trascrizione interrotta. Verifica il servizio prima di riprovare.');
        if (!panel.isConnected) return;
        transcript.value = result.text;
        transcript.hidden = false;
        fitTranscript();
        copy.hidden = !result.text;
        transcriptStatus.textContent = result.text ? '' : 'Nessun testo riconosciuto.';
      } catch (error) {
        if (panel.isConnected) transcriptStatus.textContent = error.message;
      } finally { transcribe.disabled = false; }
    });
    copy.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(transcript.value);
        transcriptStatus.textContent = 'Testo copiato.';
      } catch {
        transcript.focus();
        transcript.select();
        transcriptStatus.textContent = 'Testo selezionato: premi Ctrl+C per copiarlo.';
      }
    });
    // Avoid inserting a player inside an existing link or button.
    const anchor = link.closest('a') || link;
    anchor.insertAdjacentElement('afterend', panel);
    const state = {panel, audio, controller: null, objectUrl: null, url: info.url};
    let previousWidth = 0;
    const resizeObserver = new ResizeObserver(entries => {
      const width = entries[0].contentRect.width;
      if (width !== previousWidth) { previousWidth = width; fitTranscript(); }
    });
    resizeObserver.observe(panel);
    state.resizeObserver = resizeObserver;
    players.set(link, state);
    speed.addEventListener('change', () => { (pcm || audio).playbackRate = Number(speed.value); });
    audio.addEventListener('play', () => {
      for (const other of players.values()) if (other !== state) { other.audio.pause(); other.pcm?.pause(); }
    });
    audio.addEventListener('error', () => {
      if (!panel.isConnected) return;
      if (!state.inlineAttempted) {
        state.inlineAttempted = true;
        const inline = new URL(info.url);
        inline.searchParams.set('disposition', 'inline');
        audio.src = inline.href;
        audio.load();
        status.textContent = 'Provo la riproduzione diretta da Zammad…';
        return;
      }
      status.textContent = 'Riproduzione non riuscita. ' + (state.format || 'Formato non rilevato') + '. Errore browser: ' + (audio.error?.code || 'sconosciuto') + '. ' + (audio.error?.message || '') + (state.cspBlocked ? ' La policy di sicurezza della pagina ha bloccato una sorgente audio.' : '') + ' Puoi scaricare il file dal collegamento originale.';
    });
    audio.addEventListener('loadedmetadata', () => { status.textContent = ''; });
    state.status = status;
    async function loadAudio() {
      if (state.controller || state.ready || !panel.isConnected) return;
      load.hidden = true;
      load.disabled = true;
      status.textContent = 'Caricamento audio…';
      const controller = new AbortController();
      state.controller = controller;
      const timeout = setTimeout(() => controller.abort(), 60000);
      try {
        const response = await fetch(info.url, {credentials: 'same-origin', mode: 'same-origin', redirect: 'error', cache: 'no-store', signal: controller.signal});
        if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? 'Sessione scaduta o accesso negato. Accedi nuovamente a Zammad.' : 'Download non riuscito (HTTP ' + response.status + ').');
        const type = (response.headers.get('content-type') || '').toLowerCase();
        if (type.includes('text/html') || type.includes('json')) throw new Error('Zammad non ha restituito un file audio. Verifica la sessione e i permessi.');
        const blob = await response.blob();
        if (!blob.size) throw new Error('L’allegato è vuoto.');
        state.format = await describeAudio(blob, info.mime);
        const playable = await normalizePcm(blob, info.mime);
        if (!panel.isConnected) return;
        pcm = await ZammadPcmPlayer.create(playable, info.mime);
        if (!panel.isConnected) { pcm?.dispose(); return; }
        if (pcm) {
          state.pcm = pcm;
          state.ready = true;
          pcm.playbackRate = Number(speed.value);
          for (const type of ['timeupdate', 'seeked', 'pause', 'play', 'ended']) {
            pcm.addEventListener(type, () => {
              playPause.textContent = pcm.paused ? 'Riproduci' : 'Pausa';
              audio.dispatchEvent(new Event(type));
            });
          }
          pcmControls.hidden = false;
          seekControls.hidden = false;
          label.hidden = false;
          load.hidden = true;
          status.textContent = '';
          audio.dispatchEvent(new Event('loadedmetadata'));
          return;
        }
        state.objectUrl = URL.createObjectURL(playable.slice(0, playable.size, info.mime));
        audio.src = state.objectUrl;
        audio.playbackRate = Number(speed.value);
        audio.hidden = false;
        seekControls.hidden = false;
        label.hidden = false;
        load.hidden = true;
        status.textContent = '';
        audio.load();
        state.ready = true;
      } catch (error) {
        if (panel.isConnected) {
          status.textContent = error.name === 'AbortError' ? 'Caricamento interrotto o scaduto. Riprova.' : error.message;
          load.hidden = false;
        }
      } finally {
        clearTimeout(timeout);
        state.controller = null;
        load.disabled = false;
      }
    }
    load.addEventListener('click', loadAudio);
    void loadAudio();
  }
  function dispose(state) {
    state.controller?.abort();
    state.resizeObserver?.disconnect();
    state.pcm?.dispose();
    state.audio.pause();
    state.audio.removeAttribute('src');
    state.audio.load();
    if (state.objectUrl) URL.revokeObjectURL(state.objectUrl);
    state.panel.remove();
  }
  function scan() {
    for (const [link, state] of players) {
      const info = link.isConnected ? attachment(link) : null;
      if (!info || !state.panel.isConnected || info.url !== state.url) {
        dispose(state);
        players.delete(link);
      }
    }
    for (const link of document.querySelectorAll('a[href*="/ticket_attachment/"]')) {
      if (players.has(link)) continue;
      const info = attachment(link);
      if (info) addPlayer(link, info);
    }
  }
  document.addEventListener('securitypolicyviolation', event => {
    if (event.disposition !== 'enforce' || event.effectiveDirective !== 'media-src') return;
    for (const state of players.values()) {
      if (event.blockedURI === state.audio.src || (event.blockedURI === 'blob' && state.audio.src.startsWith('blob:'))) {
        state.cspBlocked = true;
      }
    }
  });
  let scheduled = false;
  const observer = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => { scheduled = false; scan(); }, 100);
  });
  observer.observe(document.body, {childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['href', 'title', 'download', 'aria-label', 'type']});
  scan();
  window.addEventListener('pagehide', () => {
    for (const state of players.values()) dispose(state);
    players.clear();
  });
})();
