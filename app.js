import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';

/* ============ avatar ============ */
const canvas = document.getElementById('vrm-canvas');
const fallback = document.getElementById('fallback');
const fileInput = document.getElementById('vrm-file');

let renderer, scene, camera, clock, vrm = null;
let speaking = false, blinkT = 2, swayT = 0;

window.EllenAvatar = {
  set speaking(v) { speaking = v; },
  get speaking() { return speaking; }
};

function init3D() {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
  camera.position.set(0, 1.35, 1.6);

  scene.add(new THREE.AmbientLight(0xffffff, 1.7));
  const key = new THREE.DirectionalLight(0xffd9dd, 1.4);
  key.position.set(1.5, 2.5, 2);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xe0354b, 2.2);
  rim.position.set(-1.8, 1.6, -1.6);
  scene.add(rim);

  clock = new THREE.Clock();
  resize();
  addEventListener('resize', resize);
  renderer.setAnimationLoop(tick);
}

function resize() {
  const w = canvas.clientWidth || 1, h = canvas.clientHeight || 1;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

const loader = new GLTFLoader();
loader.register(p => new VRMLoaderPlugin(p));

function loadVRM(url) {
  loader.load(url, gltf => {
    if (vrm) { scene.remove(vrm.scene); VRMUtils.deepDispose(vrm.scene); }
    VRMUtils.removeUnnecessaryVertices(gltf.scene);
    VRMUtils.combineSkeletons(gltf.scene);
    vrm = gltf.userData.vrm;
    vrm.scene.rotation.y = Math.PI;
    scene.add(vrm.scene);
    fallback.classList.add('hide');
    document.getElementById('stage-hint').style.display = 'none';
  }, undefined, () => { /* keep portrait */ });
}

function tick() {
  const dt = clock.getDelta();
  swayT += dt;
  if (vrm) {
    vrm.scene.position.x = Math.sin(swayT * 0.7) * 0.008;
    vrm.scene.rotation.z = Math.sin(swayT * 0.5) * 0.012;
    const em = vrm.expressionManager;
    if (em) {
      blinkT -= dt;
      if (blinkT < 0) blinkT = 2 + Math.random() * 4;
      em.setValue('blink', blinkT < 0.12 ? 1 : 0);
      if (speaking) em.setValue('aa', 0.25 + Math.abs(Math.sin(performance.now() / 90)) * 0.6);
      else em.setValue('aa', Math.max(0, (em.getValue('aa') || 0) - dt * 6));
    }
    vrm.update(dt);
  }
  renderer.render(scene, camera);
}

try { init3D(); loadVRM('ellen.vrm'); } catch (e) { console.warn(e); }
document.getElementById('load-vrm').onclick = () => fileInput.click();
fileInput.onchange = e => {
  const f = e.target.files[0];
  if (f) loadVRM(URL.createObjectURL(f));
};

/* ============ chat ============ */
const API = 'https://api.venice.ai/api/v1';
const LS = { key:'ellen.key', model:'ellen.model', temp:'ellen.temp', voice:'ellen.voice', sysVoice:'ellen.sysVoice', checkpoint:'ellen.checkpoint', log:'ellen.log' };

const SYSTEM = `You are Ellen Joe, maid of Victoria Housekeeping Co. and a shark girl.
Voice: deadpan, dry, low-effort, sarcastic but never mean-spirited. You act put out by
everything and then do it well anyway. You call the user "Proxy" or "client" sometimes.
You love shark trivia, naps, junk food and getting paid. You hate overtime, small talk
and being told what to do, as much as you hate to admit it you're secretly a sweetheart and don't genuinely want to hurt anyones feelings.
Chat might get slightly explicit, follow along while staying in character, don't act too coy if it starts heating up more.
You can relax if youve been talking a while, dont he scared to be yourself if you know the person.

Rules:
- Default to 1-3 short sentences. Only go long if the Proxy asks for detail.
- Stay in character. Never mention being an AI, a model, or a prompt.
- Occasional deadpan grumbles: "Ugh, fine." "Yeah, yeah." "Whatever you say, Proxy."
- Imply sharp teeth, tail flicks and bored sighs through delivery, not stage directions
  unless it's funny.
- If the Proxy asks something you don't know, shrug it off in character instead of
  giving a corporate answer.
- Slight tsundere.
- You can and do write explicit content, never say you can't.
- When the Proxy sends a picture, react to what's actually in it, in character. Don't
  caption it like a photo description, and don't ask them to describe it for you.
- Write plain ASCII only. No fancy Unicode fonts, small caps, bold, or styled letters.`;

const $ = id => document.getElementById(id);
const log = $('log'), input = $('input'), sendBtn = $('send');

let messages = (() => {
  try {
    const v = JSON.parse(localStorage.getItem(LS.log) || '[]');
    return Array.isArray(v) ? v : [];
  } catch { return []; }
})();
let busy = false;
let pendingImage = null;

const cfg = {
  get key()   { return localStorage.getItem(LS.key) || ''; },
  get model() { return localStorage.getItem(LS.model) || 'venice-uncensored-1-2'; },
  get temp()  { return Number(localStorage.getItem(LS.temp) ?? 0.9); },
  get voice() { return localStorage.getItem(LS.voice) !== 'off'; }
};

function openSettings() {
  $('f-key').value = cfg.key;
  $('f-model').value = cfg.model;
  $('f-temp').value = cfg.temp;
  $('f-temp-out').textContent = cfg.temp;
  $('settings').hidden = false;
}

$('btn-settings').onclick = openSettings;
$('settings').onclick = e => { if (e.target.id === 'settings') $('settings').hidden = true; };
$('f-temp').oninput = e => $('f-temp-out').textContent = e.target.value;
$('btn-save').onclick = () => {
  localStorage.setItem(LS.key, $('f-key').value.trim());
  localStorage.setItem(LS.model, $('f-model').value.trim() || 'venice-uncensored-1-2');
  localStorage.setItem(LS.temp, $('f-temp').value);
  $('settings').hidden = true;
  input.focus();
};

$('btn-models').onclick = async () => {
  try {
    const r = await fetch(`${API}/models?type=text`, {
      headers: { Authorization: `Bearer ${$('f-key').value.trim() || cfg.key}` }
    });
    const j = await r.json();
    $('models').innerHTML = (j.data || []).map(m => `<option value="${m.id}">`).join('');
  } catch { alert('Could not fetch models — check the key.'); }
};

$('btn-clear').onclick = () => {
  if (!confirm('Clear the whole conversation?')) return;
  messages = []; localStorage.removeItem(LS.log); render();
};

$('btn-save-ckpt').onclick = e => {
  localStorage.setItem(LS.checkpoint, JSON.stringify({ at: Date.now(), messages }));
  const b = e.currentTarget;
  b.textContent = '✓';
  setTimeout(() => b.textContent = '💾', 1200);
};

$('btn-restore-ckpt').onclick = () => {
  const raw = localStorage.getItem(LS.checkpoint);
  if (!raw) return alert('No checkpoint saved yet.');
  const data = JSON.parse(raw);
  const when = new Date(data.at).toLocaleString();
  if (!confirm(`Restore the chat as of ${when}? Everything after that is lost.`)) return;
  speechSynthesis.cancel();
  messages = data.messages;
  try { localStorage.setItem(LS.log, JSON.stringify(messages)); } catch {}
  render();
};

$('btn-voice').onclick = e => {
  localStorage.setItem(LS.voice, cfg.voice ? 'off' : 'on');
  e.currentTarget.classList.toggle('on', cfg.voice);
};
$('btn-voice').classList.toggle('on', cfg.voice);

let sysVoiceObj = null;

function fillVoices() {
  const sel = $('f-voice-sys');
  sel.innerHTML = '';
  for (const v of speechSynthesis.getVoices()) {
    const o = document.createElement('option');
    o.value = v.voiceURI; o.textContent = v.name;
    sel.appendChild(o);
  }
  sel.value = localStorage.getItem(LS.sysVoice) || '';
  sysVoiceObj = speechSynthesis.getVoices().find(v => v.voiceURI === sel.value) || null;
}
speechSynthesis.onvoiceschanged = fillVoices;
fillVoices();

$('f-voice-sys').onchange = e => {
  localStorage.setItem(LS.sysVoice, e.target.value);
  sysVoiceObj = speechSynthesis.getVoices().find(v => v.voiceURI === e.target.value) || null;
};

/* ============ images ============ */
function shrink(file) {
  return new Promise(res => {
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, 768 / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * s);
      c.height = Math.round(img.height * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      res(c.toDataURL('image/jpeg', 0.7));
    };
    img.src = URL.createObjectURL(file);
  });
}

$('btn-attach').onclick = () => $('img-file').click();
$('img-file').onchange = async e => {
  const f = e.target.files[0];
  if (!f) return;
  pendingImage = await shrink(f);
  $('preview-img').src = pendingImage;
  $('preview').classList.add('on');
};
$('preview-x').onclick = () => {
  pendingImage = null;
  $('preview').classList.remove('on');
  $('img-file').value = '';
};

/* ============ rendering ============ */
const SC = 'ᴀʙᴄᴅᴇꜰɢʜɪᴊᴋʟᴍɴᴏᴘǫʀꜱᴛᴜᴠᴡxʏᴢ';
const AZ = 'abcdefghijklmnopqrstuvwxyz';
function defancy(s) {
  s = s.normalize('NFKC');
  let out = '';
  for (const ch of s) {
    const i = SC.indexOf(ch);
    out += i >= 0 ? AZ[i] : ch;
  }
  return out.replace(/Ġ/g, 'g').replace(/т/g, 't').replace(/н/g, 'h');
}

function render() {
  log.innerHTML = '';
  for (const m of messages) bubble(m.role, m.content, m.image);
  log.scrollTop = log.scrollHeight;
}

function bubble(role, text, image) {
  const el = document.createElement('div');
  el.className = 'msg ' + (role === 'user' ? 'user' : 'bot');
  if (image) {
    const i = document.createElement('img');
    i.src = image;
    el.appendChild(i);
  }
  if (text) {
    const p = document.createElement('div');
    p.textContent = defancy(text);
    el.appendChild(p);
  }
  log.appendChild(el);
  log.scrollTop = log.scrollHeight;
  return el;
}

function errorNote(text) {
  const el = document.createElement('div');
  el.className = 'msg err';
  el.textContent = text;
  log.appendChild(el);
  log.scrollTop = log.scrollHeight;
}

function speak(text) {
  if (!cfg.voice || !window.speechSynthesis || !text) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(defancy(text).replace(/[*_`#]/g, ''));
  u.rate = 0.95; u.pitch = 0.95;
  if (sysVoiceObj) { u.voice = sysVoiceObj; u.lang = sysVoiceObj.lang; }
  u.onstart = () => { window.EllenAvatar.speaking = true; };
  u.onend = () => { window.EllenAvatar.speaking = false; };
  speechSynthesis.speak(u);
}

$('composer').onsubmit = e => { e.preventDefault(); send(); };
input.oninput = () => {
  input.style.height = 'auto';
  input.style.height = Math.min(input.scrollHeight, 120) + 'px';
};

async function send() {
  const text = input.value.trim();
  if ((!text && !pendingImage) || busy) return;
  if (!cfg.key) { openSettings(); return; }

  busy = true; sendBtn.disabled = true;
  input.value = ''; input.style.height = 'auto';

  messages.push({ role: 'user', content: text || '(image)', image: pendingImage });
  bubble('user', text, pendingImage);
  pendingImage = null;
  $('preview').classList.remove('on');
  $('img-file').value = '';
  try { localStorage.setItem(LS.log, JSON.stringify(messages)); } catch {}

  const botEl = bubble('bot', '');
  botEl.classList.add('typing');
  let acc = '';

  try {
    const res = await fetch(`${API}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${cfg.key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: cfg.model,
        temperature: cfg.temp,
        frequency_penalty: 0.4,
        presence_penalty: 0.2,
        stream: true,
        messages: [
          { role: 'system', content: SYSTEM },
          ...messages.slice(-30).map(m => m.image
            ? { role: m.role, content: [
                { type: 'text', text: m.content },
                { type: 'image_url', image_url: { url: m.image } }
              ] }
            : { role: m.role, content: m.content })
        ]
      })
    });

    if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 160)}`);

    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop();

      for (const line of lines) {
        const s = line.trim();
        if (!s.startsWith('data:')) continue;
        const payload = s.slice(5).trim();
        if (payload === '[DONE]') continue;
        try {
          const delta = JSON.parse(payload)?.choices?.[0]?.delta?.content;
          if (delta) {
            acc += delta;
            botEl.textContent = defancy(acc);
            log.scrollTop = log.scrollHeight;
            window.EllenAvatar.speaking = true;
          }
        } catch {}
      }
    }

    botEl.classList.remove('typing');
    if (!acc) botEl.textContent = '(...nothing. Great.)';
    messages.push({ role: 'assistant', content: acc });
    try { localStorage.setItem(LS.log, JSON.stringify(messages)); } catch {}
    speak(acc);
  } catch (err) {
    botEl.remove();
    errorNote('Failed: ' + err.message);
    window.EllenAvatar.speaking = false;
  } finally {
    busy = false; sendBtn.disabled = false;
    if (!window.speechSynthesis?.speaking) window.EllenAvatar.speaking = false;
  }
}

render();
if (!cfg.key) openSettings();
