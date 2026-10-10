// PCM playback in memory: seeking restarts the buffer at the requested offset.
globalThis.ZammadPcmPlayer = class extends EventTarget {
  static async create(blob, mime) {
    if (mime !== 'audio/wav') return null;
    const bytes = await blob.arrayBuffer();
    const view = new DataView(bytes);
    if (view.byteLength < 44 || view.getUint16(20, true) !== 1) return null;
    // Input comes from normalizePcm: canonical 44-byte PCM header.
    const channels = view.getUint16(22, true);
    const rate = view.getUint32(24, true);
    const bits = view.getUint16(34, true);
    const count = view.getUint32(40, true) / (channels * bits / 8);
    const buffer = new AudioBuffer({numberOfChannels: channels, length: count, sampleRate: rate});
    for (let channel = 0; channel < channels; channel++) {
      const output = buffer.getChannelData(channel);
      for (let frame = 0; frame < count; frame++) {
        const at = 44 + (frame * channels + channel) * bits / 8;
        let sample;
        if (bits === 8) sample = (view.getUint8(at) - 128) / 128;
        else if (bits === 16) sample = view.getInt16(at, true) / 32768;
        else if (bits === 24) {
          let value = view.getUint8(at) | view.getUint8(at + 1) << 8 | view.getUint8(at + 2) << 16;
          if (value & 0x800000) value -= 0x1000000;
          sample = value / 8388608;
        } else sample = view.getInt32(at, true) / 2147483648;
        output[frame] = sample;
      }
    }
    return new ZammadPcmPlayer(buffer);
  }
  constructor(buffer) {
    super();
    this.buffer = buffer;
    this.offset = 0;
    this.rate = 1;
    this.level = 1;
    this.playing = false;
    this.disposed = false;
    this.generation = 0;
  }
  get duration() { return this.buffer.duration; }
  get paused() { return !this.playing; }
  get currentTime() {
    return Math.min(this.duration, this.offset + (this.playing ? (this.context.currentTime - this.startedAt) * this.rate : 0));
  }
  set currentTime(value) {
    const wasPlaying = this.playing;
    this.stopSource();
    this.offset = Math.max(0, Math.min(this.duration, Number.isFinite(value) ? value : 0));
    if (wasPlaying && this.offset < this.duration) this.startSource();
    this.emit('seeked');
    this.emit('timeupdate');
    if (!this.playing) this.emit('pause');
  }
  get playbackRate() { return this.rate; }
  set playbackRate(value) {
    const time = this.currentTime;
    const wasPlaying = this.playing;
    this.stopSource();
    this.offset = time;
    this.rate = value;
    if (wasPlaying && this.offset < this.duration) this.startSource();
  }
  set volume(value) {
    this.level = Math.max(0, Math.min(1, value));
    if (this.gain) this.gain.gain.value = this.level;
  }
  emit(type) { this.dispatchEvent(new Event(type)); }
  async play() {
    const generation = ++this.generation;
    if (this.disposed || this.playing) return;
    if (!this.context) {
      this.context = new AudioContext();
      this.gain = this.context.createGain();
      this.gain.gain.value = this.level;
      this.gain.connect(this.context.destination);
    }
    await this.context.resume();
    if (this.disposed || generation !== this.generation) return;
    if (this.offset >= this.duration) this.offset = 0;
    this.startSource();
    this.emit('play');
  }
  startSource() {
    const source = this.context.createBufferSource();
    source.buffer = this.buffer;
    source.playbackRate.value = this.rate;
    source.connect(this.gain);
    source.onended = () => {
      if (this.source !== source) return;
      this.stopSource();
      this.offset = this.duration;
      this.emit('timeupdate');
      this.emit('ended');
      this.emit('pause');
    };
    this.source = source;
    this.startedAt = this.context.currentTime;
    this.playing = true;
    source.start(0, this.offset);
    this.timer = setInterval(() => this.emit('timeupdate'), 100);
  }
  stopSource() {
    clearInterval(this.timer);
    const source = this.source;
    this.source = null;
    this.playing = false;
    if (source) { source.onended = null; source.stop(); source.disconnect(); }
  }
  pause() {
    this.generation++;
    const time = this.currentTime;
    this.stopSource();
    this.offset = time;
    this.emit('pause');
    this.emit('timeupdate');
  }
  dispose() {
    this.pause();
    this.disposed = true;
    if (this.context) this.context.close().catch(() => {});
  }
};
