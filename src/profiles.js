// Design profiles: one saved look of the venue.
//   theme · every theme's finish scheme · walls turned to glass · time of day, sky, clouds, quality, doors · (camera)
// Kept entirely client-side so it works the same from a local folder or a static host (GitHub Pages):
//   * this browser: named profiles + an autosave of the current state in localStorage (per site / browser);
//   * disk: download / save-as a .json file (File System Access API where available) and open it again;
//   * link: the profile compressed into the URL fragment (#p=…), so it travels with the link and never hits a server.
const LIST = 'skybrew.profiles.v1', CUR = 'skybrew.profile.autosave.v1';
export const PROFILE_VERSION = 6;   // 2: Bali floor default changed · 3: Riviera pods floor = hall terrazzo (themes.migrateSchemes) · 4: quality kept is the one you chose · 5: crowd on by default · 6: Riviera at 20:00 by default (main.js)

const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } },
};
export function listProfiles() { return store.get(LIST) || []; }
export function saveProfile(p) {
  const list = listProfiles().filter((x) => x.name !== p.name); list.unshift(p);
  return store.set(LIST, list.slice(0, 50));
}
export function deleteProfile(name) { store.set(LIST, listProfiles().filter((x) => x.name !== name)); }
export function autosave(p) { store.set(CUR, p); }
export function loadAutosave() { return store.get(CUR); }
export function storageAvailable() { try { localStorage.setItem('skybrew.t', '1'); localStorage.removeItem('skybrew.t'); return true; } catch { return false; } }

export function validate(p) {
  if (!p || typeof p !== 'object' || !['skybrew-twin', 'mykonos-twin'].includes(p.app)) throw new Error('Not a Skybrew twin profile');   // mykonos-twin: saved before the rename
  if ((p.v || 1) > PROFILE_VERSION) throw new Error(`Profile was saved by a newer version (v${p.v})`);
  return p;
}

// ---- files
export async function saveToDisk(p) {
  const name = `${(p.name || 'profile').replace(/[^\w\- ]+/g, '').trim() || 'profile'}.skybrew.json`;
  const text = JSON.stringify(p, null, 2);
  if (window.showSaveFilePicker) {
    try {
      const h = await window.showSaveFilePicker({ suggestedName: name, types: [{ description: 'Twin profile', accept: { 'application/json': ['.json'] } }] });
      const w = await h.createWritable(); await w.write(text); await w.close(); return h.name;
    } catch (e) { if (e.name === 'AbortError') return null; }
  }
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' })); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  return name;
}
export function openFile() {
  return new Promise((resolve, reject) => {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json,application/json';
    inp.onchange = async () => { const f = inp.files[0]; if (!f) return resolve(null); try { resolve(validate(JSON.parse(await f.text()))); } catch (e) { reject(e); } };
    inp.click();
  });
}

// ---- share links: deflate + base64url in the fragment
const b64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64url = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
async function pipe(bytes, Stream) { return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new Stream('deflate-raw'))).arrayBuffer()); }
export async function toLink(p) {
  const json = new TextEncoder().encode(JSON.stringify(p));
  const body = window.CompressionStream ? `z${b64url(await pipe(json, CompressionStream))}` : `j${b64url(json)}`;
  const u = new URL(location.href); u.hash = `p=${body}`; u.searchParams.delete('theme'); return u.toString();
}
export async function fromHash(hash = location.hash) {
  const m = /[#&]p=([zj])([\w-]+)/.exec(hash); if (!m) return null;
  const bytes = unb64url(m[2]);
  const json = m[1] === 'z' ? await pipe(bytes, DecompressionStream) : bytes;
  return validate(JSON.parse(new TextDecoder().decode(json)));
}
