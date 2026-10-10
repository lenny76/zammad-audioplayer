import fs from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { Blob } from 'node:buffer';
export async function runTests() {
  const engineCode = await fs.readFile(new URL('../pcm-player.js', import.meta.url), 'utf8');
  const content = await fs.readFile(new URL('../content.js', import.meta.url), 'utf8');
  new vm.Script(content);
  let context;
  const sources = [];
  class Buffer {
    constructor({numberOfChannels, length, sampleRate}) { this.duration = length / sampleRate; this.channels = Array.from({length:numberOfChannels}, () => new Float32Array(length)); }
    getChannelData(channel) { return this.channels[channel]; }
  }
  class Context {
    constructor() { context = this; this.currentTime = 0; }
    async resume() {}
    async close() { this.closed = true; }
    createGain() { return {gain:{value:1}, connect(){}}; }
    createBufferSource() {
      const source = {playbackRate:{value:1}, connect(){}, start(_when, offset){this.offset = offset;}, stop(){this.stopped=true;}, disconnect(){}};
      sources.push(source); return source;
    }
  }
  class TestEvent { constructor(type) { this.type = type; } }
  class TestEventTarget {
    constructor() { this.listeners = new Map(); }
    addEventListener(type, handler) { if (!this.listeners.has(type)) this.listeners.set(type, []); this.listeners.get(type).push(handler); }
    dispatchEvent(event) { for (const handler of this.listeners.get(event.type) || []) handler(event); return true; }
  }
  const sandbox = {EventTarget: TestEventTarget, Event: TestEvent, Blob, AudioBuffer:Buffer, AudioContext:Context, setInterval:()=>1, clearInterval(){}};
  vm.runInNewContext(engineCode, sandbox);
  const wav = new ArrayBuffer(44 + 8000 * 60 * 2);
  const view = new DataView(wav);
  view.setUint16(20,1,true); view.setUint16(22,1,true); view.setUint32(24,8000,true); view.setUint16(34,16,true); view.setUint32(40,wav.byteLength-44,true);
  view.setInt16(44,-32768,true); view.setInt16(46,16384,true);
  const player = await sandbox.ZammadPcmPlayer.create(new Blob([wav]), 'audio/wav');
  assert.equal(player.duration,60);
  assert.equal(player.buffer.channels[0][0],-1);
  assert.equal(player.buffer.channels[0][1],0.5);
  await player.play();
  assert.equal(sources.at(-1).offset,0);
  context.currentTime=3;
  assert.equal(player.currentTime,3);
  player.currentTime=25;
  assert.equal(sources.at(-1).offset,25, 'Seeking must start a new audio source at the requested second');
  assert.equal(sources.at(-2).stopped,true);
  context.currentTime=5;
  assert.equal(player.currentTime,27);
  player.playbackRate=2;
  assert.equal(sources.at(-1).offset,27);
  context.currentTime=7;
  assert.equal(player.currentTime,31);
  player.pause();
  assert.equal(player.currentTime,31);
  player.currentTime=12;
  assert.equal(player.paused,true);
  await player.play();
  assert.equal(sources.at(-1).offset,12);
  class Element {
    constructor(){this.children=[];this.events={};}
    append(...items){this.children.push(...items);}
    setAttribute(){}
    addEventListener(type,fn){(this.events[type]??=[]).push(fn);}
    emit(type){for(const fn of this.events[type]||[])fn();}
  }
  const helper = content.slice(content.indexOf('  function addSeekControls('),content.indexOf('  function addPlayer('));
  const seekFactory=vm.runInNewContext('(function(){'+helper+';return addSeekControls;})()', {document:{createElement:()=>new Element()}});
  const row=seekFactory(player);
  const [slider,,back,forward]=row.children;
  slider.value='40'; slider.emit('input');
  assert.equal(sources.at(-1).offset,40, 'Actual slider handler must seek the audio source');
  back.emit('click'); assert.equal(sources.at(-1).offset,30);
  forward.emit('click'); assert.equal(sources.at(-1).offset,40);
  player.currentTime=3; back.emit('click'); assert.equal(player.currentTime,0);
  player.currentTime=55; forward.emit('click'); assert.equal(player.currentTime,60); assert.equal(player.paused,true);
  await player.play(); assert.equal(sources.at(-1).offset,0, 'Play after end restarts');
  sources.at(-1).onended(); assert.equal(player.currentTime,60); assert.equal(player.paused,true);
  player.dispose(); assert.equal(context.closed,true);
  assert.equal(await sandbox.ZammadPcmPlayer.create(new Blob([]),'audio/mpeg'),null);
  return 'PASS: PCM decoding, duration, seek restarts audio at requested offset, real slider and ±10 handlers, pause/resume, rate changes, bounds, end/restart, cleanup, MP3 fallback, JS syntax.';
}
if (typeof process !== 'undefined' && process.argv[1] && import.meta.url === (await import('node:url')).pathToFileURL(process.argv[1]).href) console.log(await runTests());
