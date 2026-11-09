// Variables used by Scriptable.
// icon-color: blue; icon-glyph: truck;
/**
 * FordWidget — single-file Scriptable widget (North American FordPass profile).
 * Official source and instructions: https://github.com/rushilpunu/FordWidget
 * Only install it from there, and read it first (see SECURITY & PRIVACY).
 * MIT License, Copyright (c) 2026 rushilpunu. See LICENSE in the repository.
 *
 * SETUP
 * 1. Copy this file into Scriptable as FordWidget. Run it IN THE APP first.
 * 2. Enter your VIN and badge, then choose Connect FordConnect / FordPass.
 *    FordConnect needs your own approved developer application, Client ID,
 *    Client Secret, and EXACT registered HTTPS redirect URI. Register at
 *    https://developer.ford.com/developer-na and grant telemetry categories.
 *    Use an HTTPS callback you control. This script intercepts the callback in
 *    WebView before navigation; no callback server or third-party relay is used.
 *    If Ford rejects your callback registration, resolve that with Ford first.
 * 3. Sign in in the Ford WebView, finish consent/MFA, then tap Close when the
 *    page says "Signed in". Typing the password in setup is optional: it only
 *    prefills Ford's login page for that sign-in and is never saved. Only the
 *    username and Ford's tokens are kept, in the iOS Keychain.
 *    Never paste bearer tokens, passwords, or secrets into widget parameters.
 * 4. Choose Fetch telemetry. Add a Scriptable Home Screen widget (small, medium,
 *    large) or Lock Screen widget, select FordWidget, and set "When Interacting"
 *    to Run Script. Parameter: words like "buttons", "-photo", "fuel tires lock".
 *    Tap the widget to open the menu; widget buttons open Scriptable and every
 *    command asks for confirmation there.
 *    Examples (actual script name is generated automatically):
 *      scriptable:///run?scriptName=FordWidget&action=start
 *      scriptable:///run?scriptName=FordWidget&action=stop
 *      scriptable:///run?scriptName=FordWidget&action=lock
 *      scriptable:///run?scriptName=FordWidget&action=unlock
 *      scriptable:///run?scriptName=FordWidget&action=refresh  (wake request)
 *      scriptable:///run?scriptName=FordWidget&action=fetch    (cloud GET only)
 *      scriptable:///run?scriptName=FordWidget&action=selftest (offline checks)
 *
 * TRUCK PHOTO
 * - After FordPass is connected, "Fetch telemetry" also downloads the photo Ford
 *   shows for your VIN in the FordPass app (refreshed every 30 days) and caches
 *   it next to the telemetry cache. Order: FordPass garage profile image, then
 *   Ford's image service. Menu > Vehicle photo picks a view angle (1-5), a photo
 *   from your library (worst case; a cut-out PNG with no background looks best),
 *   or the plain icon. URL: scriptable:///run?scriptName=FordWidget&action=photo
 *
 * SECURITY & PRIVACY (read before installing)
 * - Unofficial. Uses Ford's private FordPass app API the same way open-source
 *   projects (ha-fordpass) do. Ford can change or block it at any time, and using
 *   it may be against Ford's terms. You use it at your own risk.
 * - Read the code before running it, and only from a source you trust. A changed
 *   copy could send your Ford login anywhere. The only hosts contacted are
 *   login.ford.com, *.ford.com, api.autonomic.ai (Ford's vehicle cloud) and,
 *   only for the Remote start temperature line, api.open-meteo.com (location
 *   rounded to ~1 km, no account).
 * - Scriptable's Keychain is shared by ALL scripts in the app. Any other script
 *   you install can read FordWidget's tokens, and those tokens can unlock and
 *   start your vehicle. Don't install Scriptable scripts you haven't read. To
 *   revoke access, use Menu > Sign out of Ford and change your Ford password.
 * - Anything (a web page, a QR code) can open a scriptable:// link to this script.
 *   That's why every command shows a confirmation alert first. Only tap "Send
 *   command" if you started it.
 * - When asking for help, don't post your VIN, location or screenshots of
 *   View details. Errors never include tokens or passwords.
 * - Remote start: only when the vehicle is parked outdoors, never in a garage.
 *
 * BEHAVIOR / LIMITS
 * - Widgets draw from the cache and never send commands. One exception: the
 *   EVENING CHECK. The first widget refresh after the chosen hour (default 9 PM)
 *   reads the vehicle's last cloud state once (read-only, does not wake the modem),
 *   at most twice per evening, 6 s timeouts, and notifies you about problems.
 *   iOS decides exactly when widgets refresh, so the time is approximate.
 * - Remote start shows a live countdown (iOS ticks it). Right after Start it is an
 *   estimate (SETTINGS.startMinutes); Ford's remoteStartCountdownTimer replaces it.
 * - Lock Screen widgets: circular (Parameter fuel | lock | tires), rectangular
 *   (status | tires | parked) and inline. A running engine overrides the circle.
 * - Local FordWidget/ford_vehicle_cache.json contains normalized telemetry,
 *   timestamps, cooldowns, and command receipts, never secrets. It holds the
 *   truck's parked coordinates only while "Parked location" is on (Customize).
 *   Keep the filename/directory if updating the script. Cache is device-local.
 * - Missing/unsupported measurements stay unknown. Oil/fuel are not invented;
 *   12V SOC never substitutes the high-voltage traction battery SOC.
 * - Last updated is the OLDEST known timestamp among displayed measurements;
 *   the app's details sheet shows each field's timestamp and source.
 * - Commands need an authorized modem and compatible vehicle/account. A receipt
 *   means accepted, NOT physically completed. Remote start first sends Lock and
 *   polls cloud status (8 x 5s) for that lock command to succeed before starting.
 * - Commands are never automatically retried after a timeout; outcome may be
 *   unknown. Wake requests have a 15-minute cooldown. No periodic modem polling.
 * - Script.setWidget + refreshAfterDate requests a timeline update. Scriptable
 *   has no public force-reload API; iOS decides when the Home Screen redraws.
 * - Private APIs can change or be blocked, including region/login policies.
 *   This is not a Ford-supported client or a guarantee of production service.
 *   Do not treat cached lock/door readings as a live security guarantee.
 *
 * FordPass login/app ID/token hosts match marq24/ha-fordpass (config_flow.py,
 * fordpass_bridge.py, const.py) as read 2026-11-07.
 * ROUTES CHECKED AGAINST (2026-11-06; no authenticated vehicle validation):
 * https://github.com/marq24/ha-fordconnect-query
 *   const.py, application_credentials.py, fordpass_handler.py
 * https://github.com/itchannel/fordpass-ha
 *   custom_components/fordpass/fordpass_new.py
 * FordConnect: GET https://api.vehicle.ford.com/fcon-query/v1/telemetry
 * FordPass: GET /v1/telemetry/sources/fordpass/vehicles/{vin}
 *           POST /v1/command/vehicles/{vin}/commands (type + wakeUp)
 * Older /vehicles/v5/{vin}/doors/lock and /engine/start endpoints use PUT/DELETE,
 * NOT the POST routes sometimes quoted online; they are deliberately not used.
 */

const SETTINGS = Object.freeze({
  officialAuth: 'https://api.vehicle.ford.com/fcon-public/v1/auth/init',
  officialToken: 'https://api.vehicle.ford.com/dah2vb2cprod.onmicrosoft.com/oauth2/v2.0/token?p=B2C_1A_FCON_AUTHORIZE',
  officialBase: 'https://api.vehicle.ford.com/fcon-query/v1',
  login: 'https://login.ford.com',
  tenant: '4566605f-43a7-400a-946e-89cc9fdb0bd7',
  policy: 'B2C_1A_SignInSignUp_en-US',
  mobileClient: '09852200-05fd-41f6-8c21-d36d3497dc64',
  applicationId: 'BFE8C5ED-D687-4C19-A5DD-F92CDFC4503A',
  mobileRedirect: 'fordapp://userauthorized',
  guard: 'https://api.foundational.ford.com/api',
  autonomic: 'https://api.autonomic.ai/v1',
  autonomicToken: 'https://accounts.autonomic.ai/v1/auth/oidc/token',
  fetchInterval: 5 * 60 * 1000,
  wakeInterval: 15 * 60 * 1000,
  commandInterval: 30 * 1000,
  // Timer.schedule takes MILLISECONDS. ~40s covers a typical sleeping-modem lock ack.
  lockPollAttempts: 8,
  lockPollDelay: 5000,
  lease: 15 * 60 * 1000,
  // FordPass lets owners pick the run time; until telemetry reports the real timer we
  // show this as an estimate. Ford's countdown metric replaces it on the next read.
  startMinutes: 15,
  lowTire: 30,
  homeRadius: 150,
  timeout: 12,
  // Vehicle photo sources (both need the FordPass CAT token). Checked 2026-11-07:
  // the old public www.digitalservices.ford.com image host no longer resolves.
  garage: 'https://api.vehicle.ford.com/api/fpcpl-user-garage-service/v1/user/garage',
  imageService: 'https://api.mps.ford.com/api/imageservice/data',
  imageMaxAge: 30 * 24 * 3600000,
  // Widgets have a small memory budget; never store a full-resolution photo.
  imageMaxWidth: 640,
});
const COMMANDS = Object.freeze({ lock: 'lock', unlock: 'unlock', start: 'remoteStart',
  stop: 'cancelRemoteStart', refresh: 'statusRefresh' });
const FIELD_NAMES = Object.freeze({ fuel: 'Fuel %', range: 'DTE (mi)', battery: '12V SOC %',
  batteryHealth: '12V health', oil: 'Oil life %', odometer: 'Odometer (mi)',
  fl: 'Front left PSI', fr: 'Front right PSI', rl: 'Rear left PSI', rr: 'Rear right PSI',
  lock: 'Locks', doors: 'Doors / hood', outsideTemp: 'Outside temp', position: 'Parked location',
  remoteStart: 'Remote start', ignition: 'Ignition' });
const now = () => Date.now();
const uid = () => UUID.string().replace(/-/g, '').toLowerCase();
const form = obj => Object.keys(obj).filter(k => obj[k] !== undefined)
  .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(obj[k])}`).join('&');
const vinOK = v => /^[A-HJ-NPR-Z0-9]{17}$/.test(v || '');
const secretKey = name => `FordWidget.v1.${name}`;
function secretGet(name) {
  const key = secretKey(name);
  return Keychain.contains(key) ? JSON.parse(Keychain.get(key)) : null;
}
function secretSet(name, value) { Keychain.set(secretKey(name), JSON.stringify(value)); }
function secretRemove(name) { if (Keychain.contains(secretKey(name))) Keychain.remove(secretKey(name)); }
function parkedLocationEnabled(prefs = secretGet('vehicle')) {
  return !!prefs && !(prefs.widget && prefs.widget.show && prefs.widget.show.parked === false);
}
function clearCachedLocation(cache) {
  if (cache && typeof cache === 'object') {
    if (cache.fields && typeof cache.fields === 'object') delete cache.fields.position;
    delete cache.place;
  }
  return cache;
}
function requireApp() {
  if (config.runsInWidget || !config.runsInApp) throw new Error('Open this script in the Scriptable app.');
}
function query(url) {
  const out = Object.create(null);
  const part = (url.split('?')[1] || '').split('#')[0];
  for (const pair of part.split('&').filter(Boolean)) {
    const at = pair.indexOf('=');
    const key = decodeURIComponent((at < 0 ? pair : pair.slice(0, at)).replace(/\+/g, ' '));
    if (Object.prototype.hasOwnProperty.call(out, key)) throw new Error('Duplicate OAuth parameter.');
    out[key] = decodeURIComponent((at < 0 ? '' : pair.slice(at + 1)).replace(/\+/g, ' '));
  }
  return out;
}
function callbackMatches(url, redirect) {
  return url.split(/[?#]/)[0].replace(/\/$/, '') === redirect.replace(/\/$/, '');
}
// Accepts the bare address or Chrome's whole "Failed to launch '…'" console line.
function extractRedirect(text) {
  const m = String(text || '').match(/fordapp:\/\/userauthorized[^\s'"]*/i);
  return m ? m[0] : String(text || '').trim();
}
// Login errors are useless without Ford's reason; show it, minus anything token-like.
function authDetail(raw) {
  let d = null;
  try { d = JSON.parse(raw); } catch (_) { return ''; }
  const text = [d && d.error, d && (d.error_description || d.message || d.description)].filter(v => typeof v === 'string').join(': ');
  return text ? ' ' + text.replace(/[A-Za-z0-9_\-.]{40,}/g, '…').replace(/\s+/g, ' ').slice(0, 180) : '';
}
function finite(value) {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && !value.trim()) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
function bounded(value, max) { const n = finite(value); return n !== null && n >= 0 && n <= max ? n : null; }
function timestamp(value) {
  const t = typeof value === 'number' ? value : Date.parse(value);
  return Number.isFinite(t) && t > 0 && t <= now() + 60000 ? t : null;
}
function age(at) {
  if (!at) return 'unknown';
  const minutes = Math.max(0, Math.floor((now() - at) / 60000));
  return minutes < 60 ? `${minutes}m ago` : minutes < 1440 ? `${Math.floor(minutes / 60)}h ago` : `${Math.floor(minutes / 1440)}d ago`;
}
async function message(title, body) {
  console.log(`${title}: ${body}`);
  try { const a = new Alert(); a.title = title; a.message = body; a.addAction('OK'); await a.presentAlert(); }
  catch (_) {
    // Alerts can fail while Scriptable is still coming to the foreground (e.g. launched from Safari).
    const n = new Notification(); n.title = title; n.body = body;
    try { await n.schedule(); } catch (__) { /* the console log above remains */ }
  }
}
async function input(title, description, fields) {
  const a = new Alert(); a.title = title; a.message = description;
  fields.forEach(f => f.secret ? a.addSecureTextField(f.label, f.value || '') : a.addTextField(f.label, f.value || ''));
  a.addAction('Save'); a.addCancelAction('Cancel');
  if (await a.presentAlert() < 0) return null;
  return fields.map((f, i) => f.secret ? a.textFieldValue(i) : a.textFieldValue(i).trim());
}

// SHA-256 is used only for PKCE. No third-party service sees the verifier.
function sha256(bytes) {
  const k = [], h = [];
  for (let n = 2; k.length < 64; n++) {
    let prime = true;
    for (let d = 2; d * d <= n; d++) if (n % d === 0) { prime = false; break; }
    if (prime) { if (h.length < 8) h.push((Math.sqrt(n) % 1 * 0x100000000) | 0);
      k.push((Math.pow(n, 1 / 3) % 1 * 0x100000000) | 0); }
  }
  const b = bytes.slice(), bits = b.length * 8;
  b.push(128); while (b.length % 64 !== 56) b.push(0);
  for (let i = 7; i >= 0; i--) b.push(i >= 4 ? 0 : (bits >>> (i * 8)) & 255);
  const rotr = (v, n) => (v >>> n) | (v << (32 - n));
  for (let offset = 0; offset < b.length; offset += 64) {
    const w = [];
    for (let i = 0; i < 64; i++) {
      if (i < 16) { const j = offset + i * 4; w[i] = (b[j] << 24) | (b[j + 1] << 16) | (b[j + 2] << 8) | b[j + 3]; }
      else { const x = w[i - 15], y = w[i - 2];
        w[i] = (w[i - 16] + (rotr(x, 7) ^ rotr(x, 18) ^ (x >>> 3)) + w[i - 7] + (rotr(y, 17) ^ rotr(y, 19) ^ (y >>> 10))) | 0; }
    }
    let [a, c, d, e, f, g, j, l] = h;
    for (let i = 0; i < 64; i++) {
      const t1 = (l + (rotr(f, 6) ^ rotr(f, 11) ^ rotr(f, 25)) + ((f & g) ^ (~f & j)) + k[i] + w[i]) | 0;
      const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & c) ^ (a & d) ^ (c & d))) | 0;
      l = j; j = g; g = f; f = (e + t1) | 0; e = d; d = c; c = a; a = (t1 + t2) | 0;
    }
    [a, c, d, e, f, g, j, l].forEach((v, i) => { h[i] = (h[i] + v) | 0; });
  }
  return h.flatMap(v => [v >>> 24, (v >>> 16) & 255, (v >>> 8) & 255, v & 255]);
}
// Pure JS so PKCE does not depend on Scriptable's Data byte helpers.
function base64url(bytes) {
  const abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] || 0) << 8) | (bytes[i + 2] || 0);
    out += abc[(n >> 18) & 63] + abc[(n >> 12) & 63];
    if (i + 1 < bytes.length) out += abc[(n >> 6) & 63];
    if (i + 2 < bytes.length) out += abc[n & 63];
  }
  return out;
}
function challenge(verifier) {
  return base64url(sha256(Array.from(verifier, c => c.charCodeAt(0))));
}

class LocalStore {
  constructor() {
    this.fm = FileManager.local();
    this.dir = this.fm.joinPath(this.fm.documentsDirectory(), 'FordWidget');
    this.path = this.fm.joinPath(this.dir, 'ford_vehicle_cache.json');
    this.lockPath = this.fm.joinPath(this.dir, 'app.lock');
    this.owner = null;
  }
  readFile(path) { try { return JSON.parse(this.fm.readString(path)); } catch (_) { return null; } }
  read() {
    for (const path of [this.path, this.path + '.bak']) {
      const c = this.readFile(path);
      if (c && c.version === 1 && vinOK(c.vin) && c.fields && typeof c.fields === 'object')
        return parkedLocationEnabled() ? c : clearCachedLocation(c);
    }
    return null;
  }
// Move the actual lock before deciding which record may be removed. FileManager
// has no compare-and-delete operation; a mismatched owner must be restored with
// a no-clobber copy or retained at the displaced path for safe recovery.
  retireLease(expected) {
    const displaced = this.lockPath + '.retired.' + uid();
    let moved = false;
    const restore = () => {
      if (!moved || !this.fm.fileExists(displaced)) return;
      try {
        this.fm.copy(displaced, this.lockPath);
        if (this.fm.readString(this.lockPath) === this.fm.readString(displaced)) this.fm.remove(displaced);
      } catch (_) { /* Keep the displaced record; never overwrite a new owner. */ }
    };
    try {
      if (this.fm.fileExists(displaced)) return false;
      this.fm.move(this.lockPath, displaced); moved = true;
      if (JSON.stringify(this.readFile(displaced)) !== JSON.stringify(expected)) { restore(); return false; }
      this.fm.remove(displaced);
      return true;
    } catch (_) { restore(); return false; }
  }
  async acquire() {
    requireApp();
    if (!this.fm.fileExists(this.dir)) this.fm.createDirectory(this.dir, true);
    const old = this.readFile(this.lockPath);
    if (this.fm.fileExists(this.lockPath)) {
      if (old && old.until > now() && !old.background) {
        // A force-quit leaves the lock behind; only the person at the phone can tell.
        const a = new Alert(); a.title = 'FordWidget is already running';
        a.message = `A run ${old.started ? 'started ' + age(old.started) : 'from earlier'} did not finish. If you closed Scriptable or it got stuck, take over. If another FordWidget run is open right now, cancel.`;
        a.addDestructiveAction('Take over'); a.addCancelAction('Cancel');
        if (await a.presentAlert() < 0) throw new Error('Canceled. Another run still owns the app session.');
      }
      if (!this.retireLease(old)) throw new Error('Another run owns the app session. Try again later.');
    }
    const owner = uid(), temp = this.lockPath + '.' + owner;
    this.fm.writeString(temp, JSON.stringify({ owner, started: now(), until: now() + SETTINGS.lease }));
    // Native copy refuses an existing destination: concurrent app runs fail closed.
    try { this.fm.copy(temp, this.lockPath); this.owner = owner; this.assertLease(); }
    catch (_) { this.owner = null; throw new Error('Another run owns the app session. Try again later.'); }
    finally { try { if (this.fm.fileExists(temp)) this.fm.remove(temp); } catch (_) {} }
  }
  // Evening check from the widget: never waits, never takes an app run's lock.
  acquireBackground() {
    if (!this.fm.fileExists(this.dir)) return false;
    const old = this.readFile(this.lockPath);
    if (this.fm.fileExists(this.lockPath)) {
      if (old && old.until > now()) return false;
      if (!this.retireLease(old)) return false;
    }
    const owner = uid(), temp = this.lockPath + '.' + owner;
    this.fm.writeString(temp, JSON.stringify({ owner, started: now(), until: now() + 90000, background: true }));
    try {
      this.fm.copy(temp, this.lockPath); this.owner = owner; this.background = true; this.assertLease();
      return true;
    } catch (_) { this.owner = null; this.background = false; return false; }
    finally { try { if (this.fm.fileExists(temp)) this.fm.remove(temp); } catch (_) {} }
  }
  assertLease() {
    if (!this.background) requireApp();
    const l = this.readFile(this.lockPath);
    if (!this.owner || !l || l.owner !== this.owner || l.until <= now()) throw new Error('App session expired. Run the script again.');
    // Ownership is immutable until release/takeover/expiry. A stale run must
    // never rewrite this shared file and restore itself over a newer owner.
  }
  release() {
    const l = this.readFile(this.lockPath);
    if (this.owner && l && l.owner === this.owner) this.retireLease(l);
    this.owner = null; this.background = false;
  }
  imagePath(vin, custom) { return this.fm.joinPath(this.dir, `vehicle_${vin}${custom ? '_custom' : ''}.png`); }
  vehicleImage(prefs) {
    if (!prefs || !vinOK(prefs.vin) || prefs.imageMode === 'off') return null;
    const paths = [this.imagePath(prefs.vin, false)];
    if (prefs.imageMode === 'custom') paths.unshift(this.imagePath(prefs.vin, true));
    for (const path of paths) {
      try { if (this.fm.fileExists(path)) { const img = this.fm.readImage(path); if (img) return img; } } catch (_) { /* fall through */ }
    }
    return null;
  }
  writeImage(vin, custom, image) {
    this.assertLease();
    const path = this.imagePath(vin, custom), temp = path.replace(/\.png$/, `.${this.owner}.png`);
    this.fm.writeImage(temp, image);
    if (this.fm.fileExists(path)) this.fm.remove(path);
    this.fm.move(temp, path);
  }
  write(value) {
    this.assertLease();
    if (!parkedLocationEnabled()) { this.purgeLocation(); clearCachedLocation(value); }
    const temp = this.path + '.' + this.owner;
    this.fm.writeString(temp, JSON.stringify(value));
    if (this.fm.fileExists(this.path)) {
      if (this.fm.fileExists(this.path + '.bak')) this.fm.remove(this.path + '.bak');
      this.fm.copy(this.path, this.path + '.bak');
      this.fm.remove(this.path);
    }
    this.fm.move(temp, this.path);
  }
  purgeLocation() {
    this.assertLease();
    let failed = false;
    for (const path of [this.path, this.path + '.bak']) {
      if (!this.fm.fileExists(path)) continue;
      try {
        const c = this.readFile(path);
        if (!c || typeof c !== 'object') this.fm.remove(path);
        else if ((c.fields && Object.prototype.hasOwnProperty.call(c.fields, 'position')) ||
          Object.prototype.hasOwnProperty.call(c, 'place')) this.fm.writeString(path, JSON.stringify(clearCachedLocation(c)));
      } catch (_) {
        // If sanitizing fails, remove that copy rather than leave old coordinates recoverable.
        try { this.fm.remove(path); } catch (__) { failed = true; }
      }
    }
    if (failed) throw new Error('Saved location could not be removed. Try turning Parked location off again.');
  }
}

class APIError extends Error {
  constructor(message, status = 0) { super(message); this.status = status; }
}
class FordAuthManager {
  constructor(store) { this.store = store; this.timeout = SETTINGS.timeout; }
  mobileHeaders(token) {
    return { 'Application-Id': SETTINGS.applicationId, Authorization: `Bearer ${token}` };
  }
  gate(name) {
    const g = secretGet('gate.' + name);
    if (g && g.next > now()) throw new APIError(`${name}: cooling down; try again in ${Math.ceil((g.next - now()) / 60000)} minutes.`);
  }
  async request(name, url, method = 'GET', body = null, headers = {}, encoded = false, allowArray = false) {
    this.store.assertLease(); this.gate(name);
    const r = new Request(url); r.method = method; r.timeoutInterval = this.timeout;
    // Scriptable copies `headers` on assignment: build the complete object first,
    // because mutating r.headers afterwards is silently dropped (Ford answered 415).
    r.headers = Object.assign({ Accept: 'application/json' },
      /^https:\/\/[^/]*\.ford\.com\//i.test(url) ? { 'User-Agent': 'okhttp/4.12.0' } : {},
      body !== null ? { 'Content-Type': encoded ? 'application/x-www-form-urlencoded' : 'application/json' } : {},
      headers);
    // Never follow redirects carrying credentials to another origin.
    r.onRedirect = () => null;
    if (body !== null) r.body = encoded ? form(body) : JSON.stringify(body);
    let status = 0;
    try {
      const raw = await r.loadString();
      this.store.assertLease();
      status = r.response ? r.response.statusCode : 0;
      if (status < 200 || status >= 300) throw new APIError(`${name}: HTTP ${status}.${name.startsWith('auth.') ? authDetail(raw) : ''}`, status);
      let data;
      try { data = raw.trim() ? JSON.parse(raw) : {}; }
      catch (_) { throw new APIError(`${name}: invalid JSON response.`, status); }
      if (!data || typeof data !== 'object' || (Array.isArray(data) && !allowArray)) throw new APIError(`${name}: invalid response shape.`, status);
      secretRemove('gate.' + name);
      return data;
    } catch (e) {
      this.backoff(name, status, r, headers);
      // Never surface a raw server body, request URL, password, or token.
      throw e instanceof APIError ? e : new APIError(`${name}: connection failed or timed out; outcome may be unknown.`);
    }
  }
  backoff(name, status, r, headers) {
    // An older run's response must not change the current run's gates or tokens.
    this.store.assertLease();
    if (status === 401) {
      for (const tokenName of ['official', 'mobile', 'autonomic']) {
        const saved = secretGet('token.' + tokenName);
        if (saved && (headers.Authorization === `Bearer ${saved.access}` || headers['auth-token'] === saved.access)) {
          saved.expires = 0; secretSet('token.' + tokenName, saved);
        }
      }
    }
    const prior = secretGet('gate.' + name) || { failures: 0 };
    const failures = Math.min(prior.failures + 1, 10);
    let delay = Math.min(6 * 3600000, 60000 * Math.pow(2, failures - 1));
    const rh = r.response && r.response.headers || {};
    const key = Object.keys(rh).find(k => k.toLowerCase() === 'retry-after');
    const retry = key ? String(rh[key]) : '';
    if (retry) {
      const seconds = finite(retry);
      const until = seconds === null ? Date.parse(retry) : now() + seconds * 1000;
      if (Number.isFinite(until)) delay = Math.max(delay, until - now());
    }
    if (status === 401 || status === 403 || status === 400) delay = Math.max(delay, 15 * 60000);
    secretSet('gate.' + name, { failures, next: now() + delay });
  }
  async requestImage(name, url, headers = {}) {
    this.store.assertLease(); this.gate(name);
    const r = new Request(url); r.method = 'GET'; r.timeoutInterval = this.timeout;
    r.headers = Object.assign({ Accept: 'image/png,image/webp,image/*;q=0.9,application/json;q=0.5' }, headers);
    if (headers['auth-token']) r.onRedirect = () => null;
    let status = 0;
    try {
      const data = await r.load();
      this.store.assertLease();
      status = r.response ? r.response.statusCode : 0;
      if (status < 200 || status >= 300) throw new APIError(`${name}: HTTP ${status}.`, status);
      const rh = r.response && r.response.headers || {};
      const key = Object.keys(rh).find(k => k.toLowerCase() === 'content-type');
      secretRemove('gate.' + name);
      return { data, type: key ? String(rh[key]).toLowerCase() : '' };
    } catch (e) {
      this.backoff(name, status, r, headers);
      throw e instanceof APIError ? e : new APIError(`${name}: connection failed or timed out.`);
    }
  }
  saveToken(name, data, previous = null) {
    this.store.assertLease();
    const seconds = finite(data.expires_in);
    if (typeof data.access_token !== 'string' || !data.access_token || seconds === null || seconds <= 60)
      throw new Error(`${name}: missing access token or usable expiry.`);
    const token = { access: data.access_token, refresh: data.refresh_token || (previous && previous.refresh) || null,
      expires: now() + seconds * 1000 };
    secretSet('token.' + name, token); return token.access;
  }
  async token(name) {
    this.store.assertLease();
    const saved = secretGet('token.' + name);
    if (saved && saved.expires > now() + 60000) return saved.access;
    let data;
    if (name === 'autonomic') {
      const mobile = await this.token('mobile');
      data = await this.request('auth.autonomic', SETTINGS.autonomicToken, 'POST', {
        subject_token: mobile, subject_issuer: 'fordpass', client_id: 'fordpass-prod',
        grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
        subject_token_type: 'urn:ietf:params:oauth:token-type:jwt',
      }, {}, true);
    } else {
      if (!saved || !saved.refresh) throw new Error(`Connect ${name === 'official' ? 'FordConnect' : 'FordPass'} in the app first.`);
      if (name === 'official') {
        const c = secretGet('official');
        if (!c) throw new Error('Configure FordConnect first.');
        data = await this.request('auth.official', SETTINGS.officialToken, 'POST', {
          grant_type: 'refresh_token', refresh_token: saved.refresh, client_id: c.clientId, client_secret: c.clientSecret,
        }, {}, true);
      } else {
        data = await this.request('auth.mobile', SETTINGS.guard + '/token/v2/cat-with-refresh-token', 'POST',
          { refresh_token: saved.refresh }, { 'Application-Id': SETTINGS.applicationId });
      }
    }
    return this.saveToken(name, data, saved);
  }
  async oauth(url, redirect, state, credentials = null) {
    requireApp();
    const w = new WebView(); let captured = null, failure = null;
    w.shouldAllowRequest = r => {
      // B2C pages may load about:blank frames; everything else must be HTTPS.
      if (!callbackMatches(r.url, redirect)) return /^(https:\/\/|about:)/i.test(r.url);
      if (captured || failure) return false;
      try {
        const p = query(r.url);
        if (p.error) throw new Error('Ford declined authorization.');
        if (!p.code || p.state !== state) throw new Error('OAuth callback failed state validation.');
        captured = p.code;
      } catch (e) { failure = e; }
      // A WebView cannot dismiss itself, and JS alert() is not shown inside it,
      // so replace Ford's stuck spinner with a page that says what to do next.
      const ok = !failure;
      Timer.schedule(100, false, () => w.loadHTML(`<meta name="viewport" content="width=device-width,initial-scale=1">
        <body style="font:17px -apple-system,sans-serif;text-align:center;padding:80px 24px;color:#111">
        <h2>${ok ? 'Signed in' : 'Sign-in failed'}</h2>
        <p>${ok ? 'Tap <b>Close</b> at the top to finish connecting FordPass.' : 'Tap <b>Close</b> and try again.'}</p></body>`).catch(() => {}));
      return false;
    };
    const loading = w.loadURL(url);
    if (credentials) {
      // Fill only the exact Ford login origin; never auto-submit or bypass MFA.
      const js = `(function(){if(location.origin!==${JSON.stringify(SETTINGS.login)})return;
        const u=document.querySelector('input[name="signInName"],input[type="email"]');
        const p=document.querySelector('input[type="password"]');
        for(const pair of [[u,${JSON.stringify(credentials.username)}],[p,${JSON.stringify(credentials.password)}]]){
          if(pair[0]&&pair[1]){pair[0].value=pair[1];pair[0].dispatchEvent(new Event('input',{bubbles:true}));}}
      })()`;
      loading.then(() => w.evaluateJavaScript(js)).catch(() => {});
    } else loading.catch(() => {});
    await w.present(false);
    this.store.assertLease();
    if (failure) throw failure;
    if (!captured) throw new Error('Authorization canceled. No credentials were exchanged.');
    return captured;
  }
  async signIn(url, redirect, state, credentials) {
    const a = new Alert(); a.title = 'Sign in to Ford';
    a.message = 'Sign in inside Scriptable. When the page says “Signed in”, tap Close. If it stays on Ford’s “Signing in” spinner for over 20 seconds, tap Close anyway: the login usually went through.';
    a.addAction('Sign in here'); a.addAction('Sign in on another device'); a.addCancelAction('Cancel');
    const choice = await a.presentAlert();
    if (choice < 0) return null;
    if (choice === 0) return this.oauth(url, redirect, state, credentials);
    Pasteboard.copy(url);
    await message('Login link copied', 'With Universal Clipboard, paste it on your Mac in Chrome or Brave:\n\n' +
      '1. Open a new tab, then DevTools (⌥⌘I) BEFORE signing in. Network tab: tick Preserve log, type userauthorized in the filter.\n' +
      '2. Paste the link in the address bar and sign in (finish MFA).\n' +
      '3. The page stays on “Signing in”. That is expected.\n' +
      '4. In Network, click the request named like ?code=… or check the Console for Failed to launch \'fordapp://…\'. ' +
      'Copy the full fordapp://userauthorized/?code=… address (Headers → Request URL, or the Location header of the request before it).\n' +
      '5. Come back and paste it within about 10 minutes. Keep Scriptable open meanwhile.');
    const values = await input('Paste Ford redirect', 'Paste the full address that starts with fordapp://userauthorized', [{ label: 'fordapp://userauthorized/?code=…' }]);
    if (!values) return null;
    const pasted = extractRedirect(values[0]);
    if (!callbackMatches(pasted, redirect)) throw new Error('That is not a fordapp://userauthorized address.');
    const p = query(pasted);
    if (p.error) throw new Error('Ford declined authorization.');
    if (!p.code || (p.state && p.state !== state)) throw new Error('The pasted address is missing its code or belongs to a different login attempt.');
    return p.code;
  }
  async connectOfficial() {
    const old = secretGet('official') || {};
    const values = await input('FordConnect application', 'Use your approved Ford developer application and exact registered HTTPS callback.', [
      { label: 'Client ID', value: old.clientId }, { label: 'Client Secret', secret: true },
      { label: 'Registered HTTPS redirect URI', value: old.redirect },
    ]);
    if (!values) return;
    const [clientId, clientSecret, redirect] = values;
    if (!clientId || !clientSecret || !/^https:\/\/[^/?#\s@]+(?:\/[^?#\s]*)?$/.test(redirect))
      throw new Error('Client ID, secret, and a registered HTTPS URI without a query or fragment are required.');
    const state = uid().slice(0, 16), c = { clientId, clientSecret, redirect };
    const code = await this.oauth(SETTINGS.officialAuth + '?' + form({ response_type: 'code', client_id: clientId, redirect_uri: redirect, state }), redirect, state);
    const data = await this.request('auth.official', SETTINGS.officialToken, 'POST', {
      grant_type: 'authorization_code', client_id: clientId, client_secret: clientSecret, redirect_uri: redirect, code,
    }, {}, true);
    if (!data.access_token) throw new Error('FordConnect did not return an access token.');
    const garage = await this.request('garage.official', SETTINGS.officialBase + '/garage', 'GET', null,
      { Authorization: `Bearer ${data.access_token}` });
    const vehicle = secretGet('vehicle');
    if (!vehicle || String(garage.vin || '').toUpperCase() !== vehicle.vin)
      throw new Error('FordConnect consent belongs to a different vehicle. Reconnect and select the configured VIN.');
    this.saveToken('official', data); secretSet('official', c);
    await message('FordConnect connected', 'Choose Fetch telemetry to populate the widget.');
  }
  async connectMobile() {
    for (const name of ['auth.b2c', 'auth.mobile', 'auth.autonomic']) secretRemove('gate.' + name);
    const old = secretGet('credentials') || {};
    const values = await input('FordPass login', 'Prefills Ford’s login form for this sign-in. Only the username is saved. Complete MFA/consent in the next screen. Leave password blank to enter it there.', [
      { label: 'FordPass username', value: old.username }, { label: 'Password (optional)', secret: true },
    ]);
    if (!values) return;
    const credentials = { username: values[0], password: values[1] };
    // Only the username is remembered. The password prefills this one sign-in and is never stored.
    secretSet('credentials', { username: credentials.username });
    const verifier = uid() + uid(), state = uid();
    const base = `${SETTINGS.login}/${SETTINGS.tenant}/${SETTINGS.policy}/oauth2/v2.0`;
    const url = `${base}/authorize?redirect_uri=${SETTINGS.mobileRedirect}&response_type=code&max_age=3600` +
      `&code_challenge=${challenge(verifier)}&code_challenge_method=S256&scope=%20${SETTINGS.mobileClient}%20openid` +
      `&client_id=${SETTINGS.mobileClient}&ui_locales=en-US&language_code=en-US` +
      `&ford_application_id=${SETTINGS.applicationId}&country_code=USA&state=${state}`;
    const code = await this.signIn(url, SETTINGS.mobileRedirect, state, credentials);
    if (!code) return;
    const b2c = await this.request('auth.b2c', base + '/token', 'POST', {
      client_id: SETTINGS.mobileClient, scope: `${SETTINGS.mobileClient} openid`, redirect_uri: SETTINGS.mobileRedirect,
      grant_type: 'authorization_code', resource: '', code, code_verifier: verifier,
    }, {}, true);
    if (!b2c.access_token) throw new Error('Ford login did not return an access token.');
    const mobile = await this.request('auth.mobile', SETTINGS.guard + '/token/v2/cat-with-b2c-access-token', 'POST',
      { idpToken: b2c.access_token }, { 'Application-Id': SETTINGS.applicationId });
    this.saveToken('mobile', mobile); secretRemove('token.autonomic');
    await message('FordPass connected', 'Commands are now available for compatible, authorized vehicles.');
  }
}

// Door/lock aggregates retain their component readings. An unchanged old hood
// timestamp must not prevent a newer door transition from changing the display.
// These are measurement times, never the time a cloud response was fetched.
function componentTime(value) {
  const at = timestamp(value);
  return at !== null && at <= now() ? at : null;
}
function componentReading(old, incoming, kind) {
  if (!old) return incoming;
  const unsafe = reading => ['OPEN', 'AJAR', 'UNLOCKED'].includes(reading.value);
  // Unidentified entries (including overflow evidence) are not the same
  // physical component. Later unnamed safe/unknown values cannot close one.
  if (incoming.id === 'UNIDENTIFIED') {
    if (unsafe(old) && !unsafe(incoming)) return old;
    if (!unsafe(old) && unsafe(incoming)) return incoming;
  }
  const a = old.at || 0, b = incoming.at || 0;
  // An undated unsafe reading cannot be proven older, so it may not lose to a dated safe one.
  if (!b && unsafe(incoming) && !unsafe(old)) return incoming;
  if (b < a) return old;
  if (kind === 'doors' && incoming.value === 'UNKNOWN' && (unsafe(old) || old.unresolvedUnsafe))
    incoming = Object.assign({}, incoming, { unresolvedUnsafe: true });
  if (kind === 'lock' && !incoming.latch && old.latch)
    incoming = Object.assign({}, incoming, { latch: old.latch, value: old.latch === 'MECHANICAL' ? 'IGNORED' : incoming.value });
  if (b > 0 && b === a && incoming.latch === 'MECHANICAL') return incoming;
  const rank = value => ['OPEN', 'AJAR', 'UNLOCKED'].includes(value) ? 2 : value === 'UNKNOWN' ? 1 : 0;
  if (b > a || b === a && rank(incoming.value) > rank(old.value)) return incoming;
  return old;
}
function componentIdentity(entry, hood = false) {
  if (hood) return 'HOOD';
  if (!entry || typeof entry !== 'object' || typeof entry.vehicleDoor !== 'string') return 'UNIDENTIFIED';
  const aliases = { LEFT_FRONT: 'FRONT_LEFT', RIGHT_FRONT: 'FRONT_RIGHT', LEFT_REAR: 'REAR_LEFT', RIGHT_REAR: 'REAR_RIGHT' };
  const door = aliases[entry.vehicleDoor] || entry.vehicleDoor;
  if (!/^[A-Z_]{1,40}$/.test(door)) return 'UNIDENTIFIED';
  if (['UNSPECIFIED_DOOR', 'UNKNOWN_DOOR'].includes(door)) return 'UNIDENTIFIED';
  if (!['UNSPECIFIED_FRONT', 'UNSPECIFIED_REAR'].includes(door)) return door;
  const selectors = [entry.vehicleSide, entry.vehicleOccupantRole].filter(value => ['DRIVER', 'PASSENGER'].includes(value));
  return selectors.length && selectors.every(value => value === selectors[0]) ? door + '|' + selectors[0] : 'UNIDENTIFIED';
}
function componentAdd(readings, incoming, kind) {
  const found = readings.findIndex(reading => reading.id === incoming.id);
  if (found >= 0) { readings[found] = componentReading(readings[found], incoming, kind); return false; }
  if (readings.length < 64) { readings.push(incoming); return false; }
  let marker = readings.findIndex(reading => reading.id === 'UNIDENTIFIED');
  if (marker < 0) marker = readings.findIndex(reading => !['HOOD', 'ALL_DOORS'].includes(reading.id));
  const evidence = [readings[marker], incoming], unsafe = evidence.filter(reading => ['OPEN', 'AJAR', 'UNLOCKED'].includes(reading.value));
  const selected = (unsafe.length ? unsafe : evidence).reduce((chosen, reading) => (reading.at || 0) > (chosen.at || 0) ? reading : chosen);
  readings[marker] = { id: 'UNIDENTIFIED', value: unsafe.length ? selected.value : 'UNKNOWN', at: selected.at, source: selected.source,
    latch: null, unresolvedUnsafe: evidence.some(reading => reading.unresolvedUnsafe || ['OPEN', 'AJAR'].includes(reading.value)) };
  return true;
}
function componentPacket(kind, entries, source, fetchedAt, doorList = false, hood = false) {
  const readings = [];
  let truncated = false;
  for (const item of entries.slice(0, 64)) {
    const entry = item.entry, id = componentIdentity(entry, item.hood);
    const latchValues = kind === 'lock' && entry ? [entry.doorLatchType, entry.tags && entry.tags.DOOR_LATCH_TYPE] : [];
    const latch = latchValues.includes('MECHANICAL') ? 'MECHANICAL' : latchValues.includes('ELECTRONIC') ? 'ELECTRONIC' : null;
    const mechanical = latch === 'MECHANICAL';
    if (mechanical && id === 'UNIDENTIFIED') continue;
    const allowed = kind === 'lock' ? ['LOCKED', 'DOUBLE_LOCKED', 'UNLOCKED'] : ['CLOSED', 'OPEN', 'AJAR'];
    let value = mechanical ? 'IGNORED' : entry && allowed.includes(entry.value) ? entry.value : 'UNKNOWN';
    // An unnamed closed component cannot establish which previously open door
    // closed. Keep it unknown instead of assigning identity by array position.
    if (id === 'UNIDENTIFIED' && !['OPEN', 'AJAR', 'UNLOCKED', 'IGNORED'].includes(value)) value = 'UNKNOWN';
    const incoming = { id, value, at: componentTime(entry && entry.updateTime), source, latch,
      unresolvedUnsafe: kind === 'doors' && ['OPEN', 'AJAR'].includes(value) };
    truncated = componentAdd(readings, incoming, kind) || truncated;
  }
  if (entries.length > 64) {
    componentAdd(readings, { id: 'UNIDENTIFIED', value: 'UNKNOWN', at: null, source, latch: null }, kind); truncated = true;
  }
  return componentField(kind, { version: 1, readings, doorList, hood, truncated, legacy: null }, fetchedAt);
}
function componentResult(kind, readings) {
  const active = readings.filter(reading => reading.value !== 'IGNORED');
  const result = (value, selected, contributors = selected ? [selected] : []) => {
    const item = selected || null;
    const measured = contributors.length && contributors.every(reading => typeof reading.at === 'number' &&
      Number.isFinite(reading.at) && reading.at > 0 && reading.at <= now());
    return { value, at: item && item.at || null, source: item && item.source || null,
      measurementAt: measured && item ? item.at : null };
  };
  const newest = list => list.reduce((chosen, item) => !chosen || (item.at || 0) > (chosen.at || 0) ? item : chosen, null);
  const oldest = list => list.length && list.every(item => item.at) ? list.reduce((chosen, item) => !chosen || item.at < chosen.at ? item : chosen, null) : null;
  const individual = active.filter(item => item.id !== 'ALL_DOORS'), all = kind === 'lock' && active.find(item => item.id === 'ALL_DOORS');
  if (all) {
    const newer = individual.filter(item => !all.at || !item.at || item.at >= all.at);
    const unlocked = newer.filter(item => item.value === 'UNLOCKED');
    if (unlocked.length) return result('Unlocked', newest(unlocked));
    const unknown = newer.filter(item => item.value === 'UNKNOWN');
    if (unknown.length) return result('Unknown', newest(unknown));
    // The feed does not declare a complete physical lock inventory. Individual
    // locked readings cannot clear or freshen a whole-vehicle aggregate.
    const value = all.value === 'UNLOCKED' ? 'Unlocked' : ['LOCKED', 'DOUBLE_LOCKED'].includes(all.value) ? 'Locked' : 'Unknown';
    return result(value, all, value === 'Locked' ? active : [all]);
  }
  const allDoors = kind === 'doors' && active.find(item => item.id === 'ALL_DOORS');
  if (allDoors) {
    const hood = active.find(item => item.id === 'HOOD');
    const newer = active.filter(item => item.id !== 'ALL_DOORS' && (item.id === 'HOOD' || !allDoors.at || !item.at || item.at >= allDoors.at));
    const unsafe = newer.filter(item => ['OPEN', 'AJAR'].includes(item.value));
    if (['OPEN', 'AJAR'].includes(allDoors.value)) unsafe.push(allDoors);
    if (unsafe.length) return result('Ajar', newest(unsafe));
    const unknown = newer.filter(item => item.value === 'UNKNOWN');
    if (allDoors.value === 'UNKNOWN') unknown.push(allDoors);
    if (unknown.length || !hood) return result('Unknown', newest(unknown));
    return result('Closed', oldest([allDoors, hood]), active);
  }
  const unsafe = active.filter(item => kind === 'lock' ? item.value === 'UNLOCKED' : ['OPEN', 'AJAR'].includes(item.value));
  if (unsafe.length) return result(kind === 'lock' ? 'Unlocked' : 'Ajar', newest(unsafe));
  const unknown = active.filter(item => item.value === 'UNKNOWN');
  if (unknown.length || !active.length) return result('Unknown', newest(unknown));
  return result(kind === 'lock' ? 'Locked' : 'Closed', oldest(active), active);
}
function componentField(kind, components, fetchedAt) {
  let derived = componentResult(kind, components.readings);
  if (kind === 'doors' && (!components.doorList || !components.hood) && derived.value === 'Closed')
    derived = { value: 'Unknown', at: null, source: derived.source, measurementAt: null };
  const legacy = components.legacy;
  if (legacy) {
    const covers = item => item && componentTime(item.at) !== null && (!legacy.at || item.at >= legacy.at);
    const whole = components.readings.find(item => item.id === 'ALL_DOORS'), hood = components.readings.find(item => item.id === 'HOOD');
    const wholeHealthy = covers(whole) && (kind === 'lock' ? ['LOCKED', 'DOUBLE_LOCKED'].includes(whole.value) :
      whole.value === 'CLOSED' && covers(hood) && hood.value === 'CLOSED');
    const legacyHealthy = legacy.value === (kind === 'lock' ? 'Locked' : 'Closed');
    if (wholeHealthy || legacyHealthy && componentTime(derived.at) !== null && (!legacy.at || derived.at >= legacy.at)) components.legacy = null;
    else if (legacyHealthy) derived = { value: legacy.value, at: legacy.at, source: legacy.source, measurementAt: legacy.measurementAt || null };
    else if (!(derived.value === (kind === 'lock' ? 'Unlocked' : 'Ajar') && componentTime(derived.at) !== null && (!legacy.at || derived.at >= legacy.at)))
      derived = { value: 'Unknown', at: null, source: legacy.source, measurementAt: null };
  }
  return Object.assign(derived, { fetchedAt, componentStatus: components });
}
function mergeComponentField(kind, previous, official, mobile) {
  const components = { version: 1, readings: [], doorList: false, hood: false, truncated: false, legacy: null };
  let fetchedAt = null;
  for (const [index, field] of [previous, official, mobile].entries()) {
    if (!field || typeof field !== 'object') continue;
    if (typeof field.fetchedAt === 'number' && Number.isFinite(field.fetchedAt)) fetchedAt = Math.max(fetchedAt || 0, field.fetchedAt);
    const packet = field.componentStatus;
    if (!packet || packet.version !== 1 || !Array.isArray(packet.readings)) {
      if (index === 0) components.legacy = { value: field.value, at: componentTime(field.at), source: field.source,
        measurementAt: typeof field.measurementAt === 'number' && field.measurementAt > 0 && field.measurementAt <= now() ? timestamp(field.measurementAt) : null };
      continue;
    }
    if (index === 0 && packet.legacy) components.legacy = {
      value: packet.legacy.value, at: componentTime(packet.legacy.at),
      source: ['FordPass', 'FordConnect'].includes(packet.legacy.source) ? packet.legacy.source : null,
      measurementAt: typeof packet.legacy.measurementAt === 'number' && packet.legacy.measurementAt > 0 && packet.legacy.measurementAt <= now() ? timestamp(packet.legacy.measurementAt) : null
    };
    components.doorList = components.doorList || packet.doorList === true;
    components.hood = components.hood || packet.hood === true;
    components.truncated = components.truncated || packet.truncated === true;
    for (const reading of packet.readings.slice(0, 64)) {
      const allowed = kind === 'lock' ? ['LOCKED', 'DOUBLE_LOCKED', 'UNLOCKED', 'UNKNOWN', 'IGNORED'] : ['CLOSED', 'OPEN', 'AJAR', 'UNKNOWN'];
      if (!reading || typeof reading.id !== 'string' || !/^[A-Z_]{1,40}(?:\|(?:DRIVER|PASSENGER))?$/.test(reading.id) || !allowed.includes(reading.value) ||
          reading.id === 'UNIDENTIFIED' && reading.value === 'IGNORED') continue;
      const incoming = { id: reading.id, value: reading.value, at: componentTime(reading.at),
        source: ['FordPass', 'FordConnect'].includes(reading.source) ? reading.source : null,
        latch: kind === 'lock' && ['MECHANICAL', 'ELECTRONIC'].includes(reading.latch) ? reading.latch : null,
        unresolvedUnsafe: kind === 'doors' && (reading.unresolvedUnsafe === true || ['OPEN', 'AJAR'].includes(reading.value)) };
      components.truncated = componentAdd(components.readings, incoming, kind) || components.truncated;
    }
    if (packet.readings.length > 64) {
      componentAdd(components.readings, { id: 'UNIDENTIFIED', value: 'UNKNOWN', at: null, source: null, latch: null }, kind); components.truncated = true;
    }
  }
  return componentField(kind, components, fetchedAt);
}

// FordConnect and the modern FordPass payload both use the Autonomic metrics schema.
function normalize(payload, vin, source, fetchedAt) {
  const root = payload && (payload.vehicleStatus || payload);
  if (!root || !root.metrics || typeof root.metrics !== 'object') throw new Error(`${source}: unsupported telemetry schema.`);
  if (root.vin && String(root.vin).toUpperCase() !== vin) throw new Error('Telemetry VIN does not match configured vehicle.');
  const m = root.metrics, out = {};
  const put = (key, value, entry) => {
    if (value === null || value === undefined) return;
    out[key] = { value, at: timestamp(entry && entry.updateTime) || timestamp(root.updateTime) || null, source, fetchedAt };
  };
  for (const [field, key, max] of [['fuel', 'fuelLevel', 100], ['oil', 'oilLifeRemaining', 100], ['battery', 'batteryStateOfCharge', 100]]) {
    const e = m[key]; put(field, bounded(e && e.value, max), e);
  }
  for (const [field, key] of [['range', 'fuelRange'], ['odometer', 'odometer']]) {
    const e = m[key], v = bounded(e && e.value, 1e8);
    const unit = String(e && (e.unit || e.unitSymbol) || 'km').toLowerCase();
    const factor = ['km', 'kilometer', 'kilometers'].includes(unit) ? 0.621371192 : ['mi', 'mile', 'miles'].includes(unit) ? 1 : null;
    put(field, v !== null && factor !== null ? v * factor : null, e);
  }
  const health = m.batteryLoadStatus;
  if (health && (!health.vehicleBattery || health.vehicleBattery === 'PRIMARY_BATTERY') && typeof health.value === 'string')
    put('batteryHealth', health.value, health);
  const positions = { FRONT_LEFT: 'fl', FRONT_RIGHT: 'fr', REAR_LEFT: 'rl', REAR_RIGHT: 'rr', LEFT_FRONT: 'fl', RIGHT_FRONT: 'fr', LEFT_REAR: 'rl', RIGHT_REAR: 'rr' };
  for (const t of Array.isArray(m.tirePressure) ? m.tirePressure : []) {
    const field = positions[t.vehicleWheel], v = bounded(t.value, 2000);
    const unit = String(t.unit || t.unitSymbol || 'kPa').toLowerCase();
    const factor = unit === 'kpa' ? 1 / 6.894757293 : unit === 'bar' ? 14.5037738 : unit === 'psi' ? 1 : null;
    if (field) put(field, v !== null && factor !== null ? bounded(v * factor, 150) : null, t);
  }
  if (Array.isArray(m.doorLockStatus) && m.doorLockStatus.length)
    out.lock = componentPacket('lock', m.doorLockStatus.map(entry => ({ entry })), source, fetchedAt);
  const doorList = Array.isArray(m.doorStatus), doors = (doorList ? m.doorStatus.map(entry => ({ entry })) : [])
    .concat(m.hoodStatus ? [{ entry: m.hoodStatus, hood: true }] : []);
  if (doors.length) out.doors = componentPacket('doors', doors, source, fetchedAt, doorList && m.doorStatus.length > 0, !!m.hoodStatus);
  const temp = m.outsideTemperature, celsius = temp ? finite(temp.value) : null;
  put('outsideTemp', celsius !== null && celsius > -60 && celsius < 70 ? celsius : null, temp);
  const pos = m.position, loc = pos && pos.value && pos.value.location;
  if (loc) {
    const lat = finite(loc.lat), lon = finite(loc.lon);
    if (lat !== null && lon !== null && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && (lat || lon)) put('position', { lat, lon }, pos);
  }
  // Ford's countdown is seconds remaining as of the metric's own updateTime.
  const rs = m.remoteStartCountdownTimer, rsv = rs ? finite(rs.value) : null;
  if (rsv !== null) {
    const from = timestamp(rs.updateTime) || timestamp(root.updateTime) || fetchedAt;
    put('remoteStart', { until: rsv > 0 ? from + rsv * 1000 : 0 }, rs);
  }
  const ign = m.ignitionStatus;
  if (ign && typeof ign.value === 'string') put('ignition', ign.value.toUpperCase(), ign);
  if (!Object.keys(out).length) throw new Error(`${source}: no supported telemetry measurements.`);
  return out;
}
function mergeFields(previous, official, mobile) {
  const result = Object.assign({}, previous);
  for (const key of Object.keys(FIELD_NAMES)) {
    const a = official[key], b = mobile[key];
    if (['lock', 'doors'].includes(key) && [previous[key], a, b].some(field => field && field.componentStatus)) {
      result[key] = mergeComponentField(key, previous[key], a, b); continue;
    }
    const candidate = a && b ? ((b.at || 0) > (a.at || 0) ? b : a) : a || b;
    if (!candidate) continue;
    const old = result[key];
    if (!old || !old.at || (candidate.at && candidate.at >= old.at)) result[key] = candidate;
  }
  return result;
}

function meters(a, b) {
  const r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return 12742000 * Math.asin(Math.sqrt(h));
}
const fahrenheit = c => Math.round(c * 9 / 5 + 32);
function nightSettings(prefs) {
  const n = (prefs && prefs.night) || {};
  return { enabled: n.enabled !== false, hour: Number.isInteger(n.hour) ? n.hour : 21, notifyOk: !!n.notifyOk };
}
// What the evening check reports. Only readings Ford actually sent are judged.
function alertSettings(prefs) {
  const a = (prefs && prefs.alerts) || {};
  const valid = (v, fallback, max) => Number.isFinite(v) && v >= 0 && v <= max ? v : fallback;
  return { enabled: Object.assign({ lock: true, doors: true, tires: true, fuel: true, oil: true, battery: true, engine: true }, a.enabled || {}),
    tire: valid(a.tire, SETTINGS.lowTire, 100), fuel: valid(a.fuel, 15, 100), oil: valid(a.oil, 10, 100), battery: valid(a.battery, 50, 100), attention: a.attention === true };
}
function nightProblems(f, prefs) {
  const options = alertSettings(prefs), enabled = options.enabled;
  const v = k => f[k] && f[k].value !== null && f[k].value !== undefined ? f[k].value : null;
  const out = [];
  if (enabled.lock && v('lock') === 'Unlocked') out.push('Unlocked');
  if (enabled.doors && v('doors') === 'Ajar') out.push('Door, hood or tailgate open');
  const low = ['fl', 'fr', 'rl', 'rr'].filter(k => finite(v(k)) !== null && v(k) < options.tire);
  if (enabled.tires && low.length) out.push('Low tire ' + low.map(k => `${k.toUpperCase()} ${Math.round(v(k))} psi`).join(', '));
  if (enabled.fuel && finite(v('fuel')) !== null && v('fuel') < options.fuel) out.push(`Fuel ${Math.round(v('fuel'))}%`);
  if (enabled.oil && finite(v('oil')) !== null && v('oil') <= options.oil) out.push(`Oil life ${Math.round(v('oil'))}%`);
  const health = v('batteryHealth');
  if (enabled.battery && finite(v('battery')) !== null && v('battery') < options.battery) out.push(`12V battery ${Math.round(v('battery'))}%`);
  else if (enabled.battery && typeof health === 'string' && /LOW|WEAK|BAD|CRITICAL|REPLACE/i.test(health)) out.push('12V battery ' + health.toLowerCase().replace(/_/g, ' '));
  const rs = v('remoteStart');
  if (enabled.engine && rs && rs.until > now()) out.push('Engine running (remote start)');
  return out;
}
// A fresh cloud response can contain only fuel or another unrelated metric.
// Confirm each security reading's own measurement time before an all-good notice.
function nightSecurityFresh(fields, at = now()) {
  return [['lock', 'Locked'], ['doors', 'Closed']].every(([key, value]) => {
    const reading = fields && fields[key], time = reading && reading.measurementAt;
    return reading && reading.value === value && typeof time === 'number' && Number.isFinite(time) &&
      time > 0 && time <= at && time >= at - 5 * 60000;
  });
}

// Only Ford's own hosts may receive the FordPass token when downloading images.
function isFordHost(url) { return /^https:\/\/(?:[a-z0-9-]+\.)*ford\.com(?::\d{1,5})?(?:[/?#]|$)/i.test(url || ''); }
function findVehicleImageUrl(garage, vin) {
  const list = Array.isArray(garage) ? garage
    : (garage && garage.userVehicles && garage.userVehicles.vehicleDetails) || (garage && (garage.vehicles || garage.vehicleProfile)) || [];
  const v = (Array.isArray(list) ? list : []).find(x => x && String(x.vin || x.VIN || '').toUpperCase() === vin);
  const p = v && (v.profile || v);
  const url = p && (p.vehicleImage || p.vehicleImageUrl || p.imageUrl);
  return typeof url === 'string' && /^https:\/\//i.test(url) ? url : null;
}
// The image service may answer with bytes, a link, or base64 inside JSON.
function findImageRef(node, depth = 0) {
  if (depth > 5 || node === null || node === undefined) return null;
  if (typeof node === 'string') {
    if (/^https:\/\//i.test(node)) return { url: node };
    const b = node.replace(/^data:image\/[a-z+]+;base64,/i, '');
    return b.length > 1000 && /^[A-Za-z0-9+/=\s]+$/.test(b) ? { base64: b } : null;
  }
  if (typeof node === 'object') for (const v of Object.values(node)) { const f = findImageRef(v, depth + 1); if (f) return f; }
  return null;
}
function downscale(img, maxWidth) {
  const s = img.size;
  if (s.width <= maxWidth) return img;
  const d = new DrawContext(); d.size = new Size(maxWidth, Math.round(s.height * maxWidth / s.width));
  d.opaque = false; d.respectScreenScale = false;
  d.drawImageInRect(img, new Rect(0, 0, d.size.width, d.size.height));
  return d.getImage();
}

class FordAPIClient {
  constructor(auth, store, prefs) { this.auth = auth; this.store = store; this.prefs = prefs; }
  async mobileTelemetry() {
    const token = await this.auth.token('autonomic');
    return this.auth.request('telemetry.mobile', `${SETTINGS.autonomic}/telemetry/sources/fordpass/vehicles/${this.prefs.vin}`, 'GET', null, this.auth.mobileHeaders(token));
  }
  async getVehicleStatus() {
    this.store.assertLease();
    let c = this.store.read();
    if (!c || c.vin !== this.prefs.vin) c = { version: 1, vin: this.prefs.vin, fields: {} };
    if (c.nextFetch > now()) return { cache: c, note: 'Cloud reads are cooling down. Showing cached data.' };
    c.nextFetch = now() + SETTINGS.fetchInterval; this.store.write(c);
    let official = {}, mobile = {}, errors = [];
    if (secretGet('token.official')) {
      try {
        const token = await this.auth.token('official');
        const raw = await this.auth.request('telemetry.official', SETTINGS.officialBase + '/telemetry', 'GET', null, { Authorization: `Bearer ${token}` });
        official = normalize(raw, this.prefs.vin, 'FordConnect', now());
      } catch (e) { errors.push(e.message); }
    }
    if (Object.keys(official).length < Object.keys(FIELD_NAMES).length && secretGet('token.mobile')) {
      try { mobile = normalize(await this.mobileTelemetry(), this.prefs.vin, 'FordPass', now()); }
      catch (e) { errors.push(e.message); }
    }
    if (!Object.keys(official).length && !Object.keys(mobile).length) {
      c.notice = errors.join('\n') || 'Connect FordConnect or FordPass first.';
      this.store.write(c); return { cache: c, note: c.notice + '\nShowing cached data.' };
    }
    c.fields = mergeFields(c.fields, official, mobile); c.fetchedAt = now();
    // Parked location is opt-out; when off, no coordinates are kept at all.
    if (!widgetOptions(this.prefs, '').show.parked) { delete c.fields.position; delete c.place; }
    c.notice = errors.join('\n'); this.store.write(c);
    return { cache: c, note: errors.length ? 'Some sources failed; available telemetry was saved.\n' + c.notice : 'Cloud telemetry saved. This did not wake the modem.' };
  }
  // Street name for the parked spot. Apple's geocoder, app runs only, only when the vehicle moved.
  async updatePlace() {
    this.store.assertLease();
    const c = this.store.read(), p = c && c.fields && c.fields.position && c.fields.position.value;
    if (!p || (c.place && meters(c.place, p) < 50 && c.place.label)) return;
    let label = null;
    try {
      const g = (await Location.reverseGeocode(p.lat, p.lon) || [])[0];
      if (g) label = [g.subThoroughfare && g.thoroughfare ? `${g.subThoroughfare} ${g.thoroughfare}` : g.thoroughfare || g.name, g.locality]
        .filter(Boolean).join(', ') || null;
    } catch (_) { /* keep coordinates only */ }
    c.place = { lat: p.lat, lon: p.lon, label, at: now() }; this.store.write(c);
  }
  async fetchImage(name, url, headers, depth = 0) {
    const { data, type } = await this.auth.requestImage(name, url, headers);
    let img = /json|text/.test(type) ? null : Image.fromData(data);
    if (!img) {
      let ref = null;
      try { ref = findImageRef(JSON.parse(data.toRawString())); } catch (_) { /* not JSON */ }
      if (ref && ref.base64) img = Image.fromData(Data.fromBase64String(ref.base64));
      else if (ref && ref.url && depth === 0) return this.fetchImage(name + '.link', ref.url, isFordHost(ref.url) ? headers : {}, 1);
    }
    if (!img || !img.size || img.size.width < 40) throw new Error(`${name}: response was not a usable image.`);
    return downscale(img, SETTINGS.imageMaxWidth);
  }
  async updateVehicleImage(force = false) {
    this.store.assertLease();
    const vin = this.prefs.vin, angle = this.prefs.imageAngle || null;
    let c = this.store.read();
    if (!c || c.vin !== vin) c = { version: 1, vin, fields: {} };
    const meta = c.image;
    if (!force && meta && meta.angle === angle && meta.at > now() - SETTINGS.imageMaxAge &&
      this.store.fm.fileExists(this.store.imagePath(vin, false))) return null;
    if (!secretGet('token.mobile')) throw new Error('Connect FordPass first. Ford only serves your vehicle’s photo to a signed-in account.');
    const h = { 'auth-token': await this.auth.token('mobile'), 'Application-Id': SETTINGS.applicationId };
    const garage = async () => {
      const g = await this.auth.request('image.garage', SETTINGS.garage, 'GET', null,
        Object.assign({ countryCode: 'USA', locale: 'en-US' }, h), false, true);
      const url = findVehicleImageUrl(g, vin);
      if (!url) throw new Error('FordPass garage has no photo link for this VIN.');
      return { img: await this.fetchImage('image.profile', url, isFordHost(url) ? h : {}), source: 'FordPass garage' };
    };
    const service = async () => {
      const view = angle || 4;
      for (const size of ['full', 'thumbnail']) {
        try {
          const img = await this.fetchImage('image.service.' + size, SETTINGS.imageService + '?' + form({ key: `${vin}-${view}-${size}` }), h);
          return { img, source: `Ford image service (view ${view})` };
        } catch (e) { if (size === 'thumbnail') throw e; }
      }
    };
    // A chosen angle can only come from the image service; the garage photo has one fixed view.
    const errors = [];
    for (const attempt of angle ? [service, garage] : [garage, service]) {
      try {
        const found = await attempt();
        this.store.writeImage(vin, false, found.img);
        c.image = { angle, source: found.source, at: now() }; this.store.write(c);
        return found.source;
      } catch (e) { errors.push(e.message); }
    }
    throw new Error('Ford did not return a photo for this truck.\n' + errors.join('\n'));
  }
  receipt(data) {
    const state = String(data.currentStatus || data.status || '').toLowerCase();
    if (['failed', 'failure', 'expired', 'rejected', 'error'].includes(state)) throw new Error('Ford rejected the command.');
    if (typeof data.id !== 'string' || !data.id) throw new Error('No command receipt returned; outcome unknown. Do not retry immediately.');
    return { id: data.id, state: state || 'accepted' };
  }
  async postCommand(vin, command, token) {
    this.store.assertLease();
    const data = await this.auth.request('commands', `${SETTINGS.autonomic}/command/vehicles/${vin}/commands`, 'POST',
      { properties: {}, tags: {}, type: COMMANDS[command], wakeUp: true }, this.auth.mobileHeaders(token));
    return this.receipt(data);
  }
  async sendCommand(vin, command) {
    this.store.assertLease();
    if (vin !== this.prefs.vin || !vinOK(vin) || !Object.prototype.hasOwnProperty.call(COMMANDS, command)) throw new Error('Invalid VIN or command.');
    const token = await this.auth.token('autonomic');
    this.auth.gate('commands');
    let c = this.store.read() || { version: 1, vin, fields: {} };
    if (c.vin !== vin) throw new Error('Cache vehicle mismatch.');
    if (c.commandAfter > now()) throw new Error('A command was just sent. Wait at least 30 seconds.');
    if (command === 'refresh' && c.wakeAfter > now()) throw new Error('Wake cooldown active. Wait 15 minutes between wake attempts.');
    if (command === 'start' && c.fields.doors && (c.fields.doors.value === 'Ajar' ||
        c.fields.doors.componentStatus && (c.fields.doors.componentStatus.legacy && c.fields.doors.componentStatus.legacy.value === 'Ajar' ||
          c.fields.doors.value === 'Unknown' && c.fields.doors.componentStatus.readings.some(reading => reading.unresolvedUnsafe))))
      throw new Error('Door/hood status is ajar or a prior ajar reading is unresolved. Check the vehicle before remote start.');
    // Persist before dispatch: a killed process or ambiguous timeout must not replay.
    c.commandAfter = now() + SETTINGS.commandInterval;
    if (command === 'refresh') c.wakeAfter = now() + SETTINGS.wakeInterval;
    c.lastCommand = { action: command, at: now(), outcome: 'Dispatching; outcome unknown' }; this.store.write(c);
    try {
      let receipt;
      if (command === 'start') {
        const lock = await this.postCommand(vin, 'lock', token);
        c.lastCommand = { action: 'start', at: now(), outcome: 'Lock accepted; engine not started', id: lock.id }; this.store.write(c);
        let locked = ['success', 'succeeded', 'completed'].includes(lock.state);
        for (let attempt = 0; !locked && attempt < SETTINGS.lockPollAttempts; attempt++) {
          await new Promise(resolve => Timer.schedule(SETTINGS.lockPollDelay, false, resolve));
          const raw = await this.mobileTelemetry();
          const state = raw.states && raw.states.lockCommand;
          if (state && state.commandId === lock.id) {
            const result = String(state.value && state.value.toState || '').toLowerCase();
            if (['failed', 'expired', 'rejected'].includes(result)) throw new Error('Lock failed. Engine start was not sent.');
            locked = result === 'success';
          }
        }
        if (!locked) throw new Error('Lock completion was not confirmed. Engine start was not sent. Check FordPass before trying again.');
        receipt = await this.postCommand(vin, 'start', token);
      } else receipt = await this.postCommand(vin, command, token);
      c.lastCommand = { action: command, at: now(), id: receipt.id, outcome: 'Accepted; completion unverified' };
      // Estimated until Ford's own countdown arrives with the next read.
      if (command === 'start') c.startRun = { at: now(), until: now() + SETTINGS.startMinutes * 60000, estimated: true };
      // Stop acceptance isn't engine-off telemetry: keep the countdown until newer telemetry or expiry.
      c.nextFetch = 0; this.store.write(c);
      return `${command === 'refresh' ? 'Wake/status refresh' : command} request accepted by Ford.\nReceipt: ${receipt.id}\nVehicle completion is unverified. Fetch telemetry later to check.`;
    } catch (e) {
      c.lastCommand.outcome = e.message; this.store.write(c); throw e;
    }
  }
}

// Display options: app-wide defaults from Customize widgets, overridable per widget
// through its Parameter, e.g. "controls", "fuel tires lock", "-photo", "bar".
const METRICS = Object.freeze({ photo: 'Vehicle photo', fuel: 'Fuel & range', battery: '12V battery', tires: 'Tire pressures',
  oil: 'Oil life', lock: 'Lock state', odometer: 'Odometer', doors: 'Doors', temp: 'Outside temperature',
  parked: 'Parked location' });
const METRIC_ALIASES = Object.freeze({ picture: 'photo', image: 'photo', truck: 'photo', range: 'fuel', '12v': 'battery',
  tire: 'tires', tpms: 'tires', psi: null, locks: 'lock', odo: 'odometer', miles: 'odometer', door: 'doors',
  weather: 'temp', temperature: 'temp', location: 'parked', gps: 'parked', map: 'parked' });
// Lock Screen widgets show one view each, picked by the first view word in Parameter.
const ACCESSORY_VIEWS = ['fuel', 'lock', 'tires', 'parked', 'status'];
function widgetOptions(prefs, parameter) {
  const base = (prefs && prefs.widget) || {};
  const show = Object.assign(Object.fromEntries(Object.keys(METRICS).map(k => [k, true])), base.show || {});
  const opts = { design: Object.assign({ small: 'classic', medium: 'classic', large: 'classic' }, base.design || {}), layout: { medium: base.medium || 'status', large: 'controls' }, unit: base.unit === 'bar' ? 'bar' : 'psi', vin: null, view: null };
  const only = [];
  for (const raw of String(parameter || '').toLowerCase().split(/[\s,;]+/).filter(Boolean)) {
    if (vinOK(raw.toUpperCase())) { opts.vin = raw.toUpperCase(); continue; }
    if (['classic', 'dashboard', 'showcase'].includes(raw)) { opts.design = { small: raw, medium: raw, large: raw }; continue; }
    if (raw === 'controls' || raw === 'buttons') { opts.layout.medium = opts.layout.large = 'controls'; continue; }
    if (raw === 'status' || raw === 'info') { opts.layout.medium = opts.layout.large = 'status'; opts.view = opts.view || 'status'; continue; }
    if (raw === 'bar' || raw === 'psi') { opts.unit = raw; continue; }
    const hide = /^(-|no-?)/.test(raw), word = raw.replace(/^(-|no-?)/, '');
    const key = Object.prototype.hasOwnProperty.call(METRICS, word) ? word : METRIC_ALIASES[word];
    if (!key) continue;
    if (!hide && !opts.view && ACCESSORY_VIEWS.includes(key)) opts.view = key;
    if (hide) show[key] = false; else only.push(key);
  }
  // Naming metrics in the Parameter means "show only these".
  if (only.length) for (const k of Object.keys(show)) show[k] = only.includes(k);
  opts.show = show;
  // A widget parameter cannot override the app-wide location privacy choice.
  if (!parkedLocationEnabled(prefs)) opts.show.parked = false;
  return opts;
}

class WidgetRenderer {
  constructor(prefs, cache, parameter = '') {
    this.prefs = prefs || {}; this.cache = cache || {}; this.fields = this.cache.fields || {};
    this.opts = widgetOptions(this.prefs, parameter);
    // Disk read only: widgets never download the photo.
    this.image = this.prefs.vin && this.opts.show.photo ? new LocalStore().vehicleImage(this.prefs) : null;
    this.ink = Color.dynamic(new Color('102237'), new Color('EDF4FF'));
    this.muted = Color.dynamic(new Color('516173'), new Color('A7B5C9'));
    this.accent = Color.dynamic(new Color('0065BA'), new Color('69B9FF'));
    this.panel = Color.dynamic(new Color('E8EFF7'), new Color('1C2A3C'));
    this.run = Color.dynamic(new Color('C2410C'), new Color('EA580C'));
  }
  on(key) { return this.opts.show[key]; }
  // A start estimate wins over older telemetry; newer telemetry wins. Ignore legacy until:0 stop markers.
  remote() {
    const f = this.fields.remoteStart, est = this.cache.startRun;
    const tel = f && f.value ? f : null;
    if (est && est.until > 0 && (!tel || (tel.at || 0) < est.at)) return est.until > now() ? { until: est.until, estimated: !!est.estimated } : null;
    return tel && tel.value.until > now() ? { until: tel.value.until, estimated: false } : null;
  }
  place() {
    const p = this.value('position');
    if (!p || !this.on('parked')) return null;
    const home = this.prefs.home;
    const near = home && meters(home, p) <= SETTINGS.homeRadius;
    const known = this.cache.place && meters(this.cache.place, p) < 50 ? this.cache.place.label : null;
    return { label: near ? 'Home' : known || `${p.lat.toFixed(4)}, ${p.lon.toFixed(4)}`, home: !!near,
      at: this.fields.position.at, url: `https://maps.apple.com/?${form({ ll: `${p.lat},${p.lon}`, q: this.prefs.name || 'Ford' })}` };
  }
  temp() { const t = finite(this.value('outsideTemp')); return t === null ? '—' : `${fahrenheit(t)}°F`; }
  nextRefresh() {
    let t = now() + 15 * 60000;
    const r = this.remote(); if (r) t = Math.min(t, r.until + 5000);
    const night = nightSettings(this.prefs);
    if (night.enabled) { const d = new Date(); d.setHours(night.hour, 1, 0, 0); if (d.getTime() > now()) t = Math.min(t, d.getTime()); }
    return t;
  }
  // Live countdown: iOS ticks the timer itself, no refreshes needed. Tap = Stop.
  runningBadge(stack, size = 11, full = false) {
    const r = this.remote(); if (!r) return false;
    const b = stack.addStack(); b.centerAlignContent(); b.spacing = 5; b.setPadding(4, 8, 4, 8); b.cornerRadius = 9;
    b.backgroundColor = this.run; b.url = this.url('stop');
    this.symbol(b, 'engine.combustion.fill', size + 1, Color.white());
    if (full) this.text(b, r.estimated ? 'Running · est.' : 'Running', size, true, Color.white());
    const t = b.addDate(new Date(r.until)); t.applyTimerStyle();
    t.font = Font.boldMonospacedSystemFont(size); t.textColor = Color.white(); t.lineLimit = 1;
    if (full) { b.addSpacer(); this.text(b, 'Tap to stop', size - 1, false, Color.white()); }
    return true;
  }
  parkedRow(stack, size = 11) {
    const pl = this.place(); if (!pl) return;
    const row = stack.addStack(); row.centerAlignContent(); row.spacing = 5; row.url = pl.url;
    this.symbol(row, pl.home ? 'house.fill' : 'mappin.and.ellipse', size + 1);
    this.text(row, `Parked · ${pl.label}`, size, true);
    row.addSpacer(); this.text(row, age(pl.at), size - 1, false, this.muted);
  }
  url(action = '') { return `scriptable:///run?${form({ scriptName: Script.name(), action })}`; }
  value(key) { const f = this.fields[key]; return f && f.value !== null && f.value !== undefined ? f.value : null; }
  number(key, suffix = '') { const n = finite(this.value(key)); return n === null ? '—' : `${Math.round(n)}${suffix}`; }
  tire(key) {
    const n = finite(this.value(key));
    return n === null ? '—' : this.opts.unit === 'bar' ? (n * 0.0689476).toFixed(1) : String(Math.round(n));
  }
  text(stack, content, size = 12, bold = false, color = this.ink) {
    const t = stack.addText(String(content)); t.font = bold ? Font.boldSystemFont(size) : Font.systemFont(size);
    t.textColor = color; t.lineLimit = 1; t.minimumScaleFactor = 0.65; return t;
  }
  symbol(stack, name, size = 16, tint = this.accent) {
    const s = SFSymbol.named(name) || SFSymbol.named('car.fill');
    const i = stack.addImage(s.image); i.imageSize = new Size(size, size); i.tintColor = tint; return i;
  }
  truck(stack, w, h) {
    if (!this.on('photo')) return null;
    if (!this.image) return this.symbol(stack, 'car.side.fill', h);
    const s = this.image.size, k = Math.min(w / s.width, h / s.height);
    const i = stack.addImage(this.image); i.imageSize = new Size(Math.round(s.width * k), Math.round(s.height * k));
    if (this.prefs.imageMode === 'custom') i.cornerRadius = 8;
    return i;
  }
  pill(stack, label, symbol) {
    const p = stack.addStack(); p.centerAlignContent(); p.spacing = 4; p.setPadding(4, 6, 4, 6);
    p.backgroundColor = this.panel; p.cornerRadius = 7;
    if (symbol) this.symbol(p, symbol, 12);
    this.text(p, label, 10, true); return p;
  }
  lockPill(stack) {
    if (this.on('lock')) this.pill(stack, this.value('lock') || 'Unknown', this.value('lock') === 'Locked' ? 'lock.fill' : 'lock.open.fill');
  }
  batteryPill(stack) {
    if (!this.on('battery')) return;
    const battery = this.value('battery');
    this.pill(stack, `12V ${battery !== null ? this.number('battery', '%') : this.value('batteryHealth') || 'Unknown'}`, 'battery.100');
  }
  gauge(stack, width = 132) {
    const d = new DrawContext(); d.size = new Size(width, 7); d.opaque = false; d.respectScreenScale = true;
    d.setFillColor(this.panel); d.fillRect(new Rect(0, 0, width, 7));
    const fuel = bounded(this.value('fuel'), 100);
    if (fuel !== null && fuel > 0) { d.setFillColor(fuel < 15 ? new Color('DB5D3F') : this.accent); d.fillRect(new Rect(0, 0, width * fuel / 100, 7)); }
    const i = stack.addImage(d.getImage()); i.imageSize = new Size(width, 7);
  }
  fuel(stack, width) {
    if (!this.on('fuel')) return;
    this.text(stack, `Fuel ${this.number('fuel', '%')} · ${this.number('range', ' mi')}`, 12, true);
    this.gauge(stack, width);
  }
  tires(stack, size) {
    if (!this.on('tires')) return;
    this.text(stack, `TIRES · ${this.opts.unit.toUpperCase()}`, 9, true, this.muted);
    for (const pair of [['fl', 'fr'], ['rl', 'rr']]) {
      const tr = stack.addStack(); tr.spacing = 12;
      for (const key of pair) {
        const cell = tr.addStack(); cell.layoutVertically();
        this.text(cell, key.toUpperCase(), 8, false, this.muted);
        this.text(cell, this.tire(key), size, true);
      }
    }
  }
  extras(stack, size = 11, max = 9, parked = true) {
    const lines = [];
    if (this.on('oil')) lines.push(`Oil ${this.number('oil', '%')}`);
    if (this.on('odometer')) lines.push(`Odometer ${this.number('odometer', ' mi')}`);
    if (this.on('doors')) lines.push(`Doors ${this.value('doors') || 'Unknown'}`);
    if (this.on('temp')) lines.push(`Outside ${this.temp()}`);
    const pl = parked && this.place(); if (pl) lines.push(`Parked · ${pl.label}`);
    lines.slice(0, max).forEach(l => this.text(stack, l, size, true));
  }
  buttons(stack, cols, w, h) {
    const actions = [['lock', 'Lock', 'lock.fill'], ['unlock', 'Unlock', 'lock.open.fill'],
      this.remote() ? ['stop', 'Stop', 'stop.circle.fill'] : ['start', 'Start', 'power'], ['refresh', 'Refresh', 'arrow.clockwise']].filter(a => !this.prefs.compatibility || this.prefs.compatibility.commands[a[0]] !== false);
    const grid = stack.addStack(); grid.layoutVertically(); grid.spacing = 6;
    for (let i = 0; i < actions.length; i += cols) {
      const row = grid.addStack(); row.spacing = 6;
      for (const [action, label, icon] of actions.slice(i, i + cols)) {
        const b = row.addStack(); b.layoutVertically(); b.size = new Size(w, h); b.centerAlignContent();
        b.backgroundColor = this.panel; b.cornerRadius = 10; b.url = this.url(action);
        const top = b.addStack(); top.addSpacer(); this.symbol(top, icon, 15); top.addSpacer();
        b.addSpacer(3);
        const bottom = b.addStack(); bottom.addSpacer(); this.text(bottom, label, 10, true); bottom.addSpacer();
      }
    }
  }
  ring(fraction) {
    const S = 120, d = new DrawContext(); d.size = new Size(S, S); d.opaque = false; d.respectScreenScale = true;
    const arc = (from, to, color) => {
      const p = new Path(), r = S / 2 - 9;
      for (let i = 0; i <= 64; i++) {
        const a = (from + (to - from) * i / 64) * Math.PI / 180, pt = new Point(S / 2 + r * Math.cos(a), S / 2 + r * Math.sin(a));
        if (i) p.addLine(pt); else p.move(pt);
      }
      d.addPath(p); d.setStrokeColor(color); d.setLineWidth(11); d.strokePath();
    };
    arc(135, 405, new Color('#FFFFFF', 0.28));
    if (fraction > 0) arc(135, 135 + 270 * Math.min(1, fraction), Color.white());
    return d.getImage();
  }
  bar(width, fraction) {
    const d = new DrawContext(); d.size = new Size(width, 5); d.opaque = false; d.respectScreenScale = true;
    d.setFillColor(new Color('#FFFFFF', 0.3)); d.fillRect(new Rect(0, 0, width, 5));
    if (fraction > 0) { d.setFillColor(Color.white()); d.fillRect(new Rect(0, 0, width * Math.min(1, fraction), 5)); }
    return d.getImage();
  }
  centered(w, build) { const row = w.addStack(); row.addSpacer(); build(row); row.addSpacer(); return row; }
  buildAccessory(family, notice) {
    const w = new ListWidget(); w.url = this.url(); w.refreshAfterDate = new Date(this.nextRefresh());
    const white = Color.white(), r = this.remote(), fuel = bounded(this.value('fuel'), 100);
    const locked = this.value('lock'), lockIcon = locked === 'Unlocked' ? 'lock.open.fill' : 'lock.fill';
    const tiny = (stack, t, size, bold = false) => this.text(stack, t, size, bold, white);
    if (family === 'accessoryInline') {
      // One symbol + one line above the clock.
      const line = r ? `Running until ${new Date(r.until).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
        : `${this.number('fuel', '%')} · ${this.number('range', ' mi')} · ${locked || '—'}`;
      w.addImage(SFSymbol.named(r ? 'engine.combustion.fill' : 'fuelpump.fill').image); w.addText(line);
      return w;
    }
    if (family === 'accessoryCircular') {
      const view = this.opts.view || 'fuel';
      w.addSpacer();
      if (r && view !== 'lock') {
        w.addAccessoryWidgetBackground = true;
        this.centered(w, row => this.symbol(row, 'engine.combustion.fill', 15, white));
        this.centered(w, row => { const t = row.addDate(new Date(r.until)); t.applyTimerStyle(); t.font = Font.boldMonospacedSystemFont(12); t.textColor = white; t.centerAlignText(); });
      } else if (view === 'lock') {
        w.addAccessoryWidgetBackground = true;
        this.centered(w, row => this.symbol(row, lockIcon, 22, white));
        this.centered(w, row => tiny(row, locked || '—', 9, true));
      } else if (view === 'tires') {
        w.addAccessoryWidgetBackground = true;
        const known = ['fl', 'fr', 'rl', 'rr'].filter(k => finite(this.value(k)) !== null);
        const low = known.sort((a, b) => this.value(a) - this.value(b))[0];
        this.centered(w, row => tiny(row, low ? this.tire(low) : '—', 19, true));
        this.centered(w, row => tiny(row, low ? `${low.toUpperCase()} ${this.opts.unit.toUpperCase()}` : 'TIRES', 8, true));
      } else {
        w.backgroundImage = this.ring(fuel === null ? 0 : fuel / 100);
        this.centered(w, row => this.symbol(row, 'fuelpump.fill', 11, white));
        this.centered(w, row => tiny(row, fuel === null ? '—' : String(Math.round(fuel)), 20, true));
      }
      w.addSpacer();
      return w;
    }
    // accessoryRectangular
    const view = this.opts.view || 'status';
    if (view === 'tires') {
      const head = w.addStack(); this.symbol(head, 'tirepressure', 11, white); head.addSpacer(4); tiny(head, `Tires · ${this.opts.unit.toUpperCase()}`, 12, true);
      for (const pair of [['fl', 'fr'], ['rl', 'rr']]) {
        const row = w.addStack();
        for (const k of pair) {
          const v = finite(this.value(k)), flag = v !== null && v < alertSettings(this.prefs).tire && alertSettings(this.prefs).enabled.tires ? ' !' : '';
          tiny(row, `${k.toUpperCase()} ${this.tire(k)}${flag}`, 13, !!flag); row.addSpacer();
        }
      }
    } else if (view === 'parked') {
      const pl = this.place();
      const head = w.addStack(); this.symbol(head, pl && pl.home ? 'house.fill' : 'mappin.and.ellipse', 11, white); head.addSpacer(4);
      tiny(head, 'Parked', 12, true); head.addSpacer(); tiny(head, pl ? age(pl.at) : '', 10);
      const t = w.addText(pl ? pl.label : 'Location not reported'); t.font = Font.semiboldSystemFont(13); t.textColor = white; t.lineLimit = 2; t.minimumScaleFactor = 0.7;
      if (pl) w.url = pl.url;
    } else {
      const head = w.addStack(); head.centerAlignContent();
      this.symbol(head, 'car.side.fill', 12, white); head.addSpacer(4);
      tiny(head, this.prefs.name || 'Ford', 13, true); head.addSpacer();
      if (this.on('lock')) this.symbol(head, lockIcon, 11, white);
      w.addSpacer(3);
      const fuelRow = w.addStack(); fuelRow.centerAlignContent();
      const img = fuelRow.addImage(this.bar(70, fuel === null ? 0 : fuel / 100)); img.imageSize = new Size(70, 5);
      fuelRow.addSpacer(6); tiny(fuelRow, `${this.number('fuel', '%')} · ${this.number('range', ' mi')}`, 12, true);
      w.addSpacer(3);
      if (r) {
        const row = w.addStack(); row.centerAlignContent(); this.symbol(row, 'engine.combustion.fill', 10, white); row.addSpacer(4);
        const t = row.addDate(new Date(r.until)); t.applyTimerStyle(); t.font = Font.boldMonospacedSystemFont(11); t.textColor = white;
      } else tiny(w, notice || `Updated ${age(this.oldest())}`, 10);
    }
    return w;
  }
  oldest() {
    const times = Object.values(this.fields).filter(f => f && f.value !== null && f.value !== undefined && f.value !== 'Unknown').map(f => f.at);
    return times.length && times.every(Boolean) ? Math.min(...times) : null;
  }
  frame(padding) {
    const w = new ListWidget();
    w.backgroundColor = Color.dynamic(new Color('F8FAFD'), new Color('101B2B'));
    w.setPadding(...padding); w.url = this.url();
    w.refreshAfterDate = new Date(this.nextRefresh());
    return w;
  }
  footer(notice) {
    const issues = alertSettings(this.prefs).attention ? nightProblems(this.fields, this.prefs) : [];
    return issues.length ? `⚠ ${issues[0]}${issues.length > 1 ? ` +${issues.length - 1}` : ''} · ${age(this.oldest())}` : (notice || `Updated ${age(this.oldest())}`);
  }
  buildSmall(notice) {
    const w = this.frame([12, 12, 10, 12]);
    const top = w.addStack(); top.centerAlignContent(); top.spacing = 6;
    this.truck(top, 64, 24);
    this.text(top, this.prefs.name || 'Ford', 13, true);
    w.addSpacer(6);
    if (this.on('fuel')) {
      this.text(w, `Fuel ${this.number('fuel', '%')}`, 15, true);
      this.text(w, this.number('range', ' mi'), 11, false, this.muted);
    } else this.extras(w, 13, 3);
    w.addSpacer(4);
    if (!this.runningBadge(w, 11)) this.lockPill(w);
    w.addSpacer();
    this.text(w, this.footer(notice), 9, false, this.muted);
    return w;
  }
  // Alternative layouts use only cached readings and the same action handlers as Classic.
  buildDesign(family, design, notice) {
    const w = this.frame([12, 14, 10, 14]);
    w.backgroundColor = Color.dynamic(new Color('E6E8EB'), new Color('101B30'));
    const isSmall = family === 'small', isLarge = family === 'large';
    const headline = row => {
      const col = row.addStack(); col.layoutVertically(); col.spacing = 3;
      this.text(col, this.prefs.name || 'Ford', isSmall ? 14 : 17, true);
      if (this.on('fuel')) this.text(col, `${this.number('range', ' mi')} to E / ${this.number('fuel', '%')}`, isSmall ? 11 : 14, false, this.muted);
      if (this.on('odometer')) this.text(col, `Odometer: ${this.number('odometer', ' mi')}`, 10, false, this.muted);
      return col;
    };
    const info = (stack, label, value) => {
      this.text(stack, label, isSmall ? 9 : 11, true);
      this.text(stack, value, isSmall ? 10 : 12, true, this.accent);
    };
    const status = stack => {
      if (this.on('lock')) info(stack, 'Locks', this.value('lock') || 'Unknown');
      if (this.on('doors')) info(stack, 'Doors', this.value('doors') || 'Unknown');
      if (this.on('oil')) info(stack, 'Oil life', this.number('oil', '%'));
      if (this.on('battery')) info(stack, '12V battery', this.value('battery') !== null ? this.number('battery', '%') : this.value('batteryHealth') || 'Unknown');
    };
    if (isSmall) {
      if (design === 'showcase') {
        headline(w); w.addSpacer(4);
        if (!this.runningBadge(w, 9)) this.lockPill(w);
        w.addSpacer(); this.centered(w, row => this.truck(row, 116, 42));
      } else {
        const row = w.addStack(); row.spacing = 6;
        const left = row.addStack(); left.layoutVertically(); left.spacing = 4;
        this.truck(left, 70, 32);
        if (this.on('fuel')) { this.text(left, this.number('fuel', '%'), 13, true); this.gauge(left, 65); this.text(left, this.number('range', ' mi'), 10); }
        const right = row.addStack(); right.layoutVertically(); right.spacing = 2; status(right);
      }
    } else if (design === 'showcase' && !isLarge) {
      const row = w.addStack(); row.spacing = 8; headline(row); row.addSpacer(); this.truck(row, 120, 54);
      w.addSpacer(4); this.parkedRow(w, 10); w.addSpacer(); this.buttons(w, 4, 62, 38);
    } else {
      const head = w.addStack(); head.spacing = 8; headline(head); head.addSpacer(); this.truck(head, isLarge ? 140 : 95, isLarge ? 60 : 40);
      if (this.on('fuel')) { w.addSpacer(4); this.gauge(w, isLarge ? 250 : 180); }
      w.addSpacer(5);
      const row = w.addStack(); row.spacing = 12;
      const left = row.addStack(); left.layoutVertically(); left.spacing = 2; status(left);
      if (this.on('tires')) { const middle = row.addStack(); middle.layoutVertically(); middle.spacing = 2; this.tires(middle, isLarge ? 13 : 11); }
      if (isLarge && this.on('temp')) { const right = row.addStack(); right.layoutVertically(); info(right, 'Outside', this.temp()); }
      if (isLarge) {
        w.addSpacer(5); this.parkedRow(w, 10);
        if (this.remote()) { w.addSpacer(4); this.runningBadge(w, 10, true); }
        w.addSpacer(); this.buttons(w, 4, 65, 38);
      }
    }
    w.addSpacer();
    const known = Object.values(this.fields).some(f => f && f.value !== null && f.value !== undefined);
    const state = notice || (!known ? 'Open Scriptable to set up / fetch' : this.cache.notice ? 'Cached · source unavailable' : '');
    this.text(w, this.footer(state ? `Updated ${age(this.oldest())} · ${state}` : ''), 9, false, this.muted);
    return w;
  }
  build(family = 'medium', notice = '') {
    const designFamily = family === 'extraLarge' ? 'large' : family;
    if (['small', 'medium', 'large'].includes(designFamily) && this.opts.design[designFamily] !== 'classic' && ['dashboard', 'showcase'].includes(this.opts.design[designFamily])) return this.buildDesign(designFamily, this.opts.design[designFamily], notice);
    if (family === 'small') return this.buildSmall(notice);
    if (String(family).startsWith('accessory')) return this.buildAccessory(family, notice);
    const large = family === 'large' || family === 'extraLarge';
    const controls = this.opts.layout[large ? 'large' : 'medium'] === 'controls';
    const w = this.frame([12, 14, 10, 14]);
    const row = w.addStack(); row.layoutHorizontally(); row.spacing = 14;
    const left = row.addStack(); left.layoutVertically(); left.spacing = 4;
    this.text(left, this.prefs.name || 'Ford', 17, true);
    if (!large && controls) {
      // Medium + controls: compact status on the left, a 2x2 button grid on the right.
      if (!this.runningBadge(left, 11)) this.truck(left, 124, 34);
      this.fuel(left, 124);
      this.lockPill(left);
      row.addSpacer();
      this.buttons(row, 2, 66, 50);
    } else {
      // Medium: the countdown takes the photo's place while the engine runs.
      if (large || !this.runningBadge(left, 11)) this.truck(left, large ? 150 : 124, large ? 62 : 38);
      this.fuel(left, 132);
      this.batteryPill(left);
      const right = row.addStack(); right.layoutVertically(); right.spacing = 5;
      this.tires(right, large ? 18 : 16);
      if (large || !this.on('tires')) this.extras(right, 11, large ? 4 : 5, !large);
      else if (this.on('oil')) this.text(right, `Oil ${this.number('oil', '%')}`, 11, true);
      this.lockPill(right);
      if (large) {
        w.addSpacer(8); this.parkedRow(w);
        if (this.remote()) { w.addSpacer(6); this.runningBadge(w, 12, true); }
      }
      if (large && controls) { w.addSpacer(8); this.buttons(w, 4, 70, 46); }
    }
    w.addSpacer();
    const known = Object.values(this.fields).filter(f => f && f.value !== null && f.value !== undefined);
    const status = notice || (!known.length ? 'Open Scriptable to set up / fetch' : this.cache.notice ? 'Cached · source unavailable' : '');
    this.text(w, this.footer(`Last updated: ${age(this.oldest())}${status ? ' · ' + status : ''}`), 9, false, status ? this.ink : this.muted);
    return w;
  }
}

class AppController {
  constructor() { this.store = new LocalStore(); this.auth = new FordAuthManager(this.store); }
  async setupVehicle() {
    const old = secretGet('vehicle') || {};
    const values = await input('Vehicle setup', 'One vehicle. Changing VIN clears saved telemetry and disconnects FordConnect consent for the old vehicle.', [
      { label: '17-character VIN', value: old.vin }, { label: 'Badge / name', value: old.name || 'Ford' },
    ]);
    if (!values) return null;
    const vin = values[0].toUpperCase(), name = values[1] || 'Ford';
    if (!vinOK(vin)) throw new Error('Enter a valid 17-character VIN (no I, O, Q).');
    if (old.vin && old.vin !== vin) {
      secretRemove('token.official');
      this.store.write({ version: 1, vin, fields: {} });
    }
    // Photo choices belong to the VIN; a new truck starts from Ford's photo again.
    const prefs = Object.assign({}, old.vin === vin ? old : {}, { vin, name }); secretSet('vehicle', prefs); return prefs;
  }
  async compatibility(prefs) {
    selfTest();
    await message('Self-test passed', 'Offline script checks passed. Next, check available vehicle features.');
    let c = this.store.read() || { fields: {} }, note = 'Using saved readings.';
    if (secretGet('token.official') || secretGet('token.mobile')) {
      try { const result = await new FordAPIClient(this.auth, this.store, prefs).getVehicleStatus(); c = result.cache; note = result.note; }
      catch (e) { note = 'Cloud check failed: ' + e.message + '\nUsing saved readings.'; }
    } else note = 'Connect FordPass or FordConnect and rerun this check for cloud suggestions.';
    const fields = c.fields || {};
    const mapping = { fuel: ['fuel', 'range'], battery: ['battery'], tires: ['fl', 'fr', 'rl', 'rr'], oil: ['oil'], lock: ['lock'], odometer: ['odometer'], doors: ['doors'], temp: ['outsideTemp'], parked: ['position'] };
    const previous = prefs.compatibility;
    const cfg = prefs.widget || {}, show = Object.assign({}, cfg.show || {});
    if (!previous) for (const k of Object.keys(mapping)) {
      if (show[k] === undefined) show[k] = mapping[k].some(f => fields[f] && fields[f].value != null);
    }
    const commands = Object.assign({ lock: true, unlock: true, start: true, stop: true, refresh: true }, previous && previous.commands || {});
    const verified = Object.assign({}, previous && previous.verified || {});
    await message('Compatibility check', note + '\n\nReported readings are suggested. Missing readings are unverified, not proof of incompatibility. Select what is available in your Ford app.');
    const labels = { lock: 'Lock', unlock: 'Unlock', start: 'Remote start', stop: 'Remote stop', refresh: 'Wake / refresh' };
    for (;;) {
      const a = new Alert(); a.title = 'Vehicle features';
      a.message = 'Tap to select or deselect features. Commands are unverified until tested. Your selections can be changed later.';
      const keys = Object.keys(mapping), actions = Object.keys(labels);
      keys.forEach(k => a.addAction(`${show[k] ? '✓' : '○'} ${METRICS[k]}${mapping[k].some(f => fields[f] && fields[f].value != null) ? ' · reported' : ' · unverified'}`));
      actions.forEach(k => a.addAction(`${commands[k] ? '✓' : '○'} ${labels[k]} · ${verified[k] ? 'owner confirmed' : 'unverified'}`));
      a.addAction('Enable reported readings'); a.addAction('Test a command…'); a.addCancelAction('Done');
      const i = await a.presentSheet();
      if (i < 0) break;
      if (i < keys.length) show[keys[i]] = !show[keys[i]];
      else if (i < keys.length + actions.length) { const k = actions[i - keys.length]; commands[k] = !commands[k]; }
      else if (i === keys.length + actions.length) {
        for (const k of keys) if (mapping[k].some(f => fields[f] && fields[f].value != null)) show[k] = true;
      } else {
        const t = new Alert(); t.title = 'Optional command test'; t.message = 'Each test sends a real command after a separate confirmation. Check the vehicle yourself. Start only outdoors.';
        actions.forEach(k => t.addAction(labels[k])); t.addCancelAction('Cancel');
        const n = await t.presentSheet();
        if (n >= 0) {
          const k = actions[n];
          const sent = await this.action(k, prefs, true);
          if (sent) {
            const v = new Alert(); v.title = 'Did the vehicle complete it?'; v.message = 'Ford accepting a request does not confirm completion. Check your vehicle before answering.';
            v.addAction('Yes, completed'); v.addAction('No / unsure'); v.addCancelAction('Cancel');
            const answer = await v.presentAlert();
            if (answer >= 0) verified[k] = answer === 0;
          }
        }
      }
      prefs.widget = Object.assign({}, cfg, { show }); prefs.compatibility = { commands, verified }; secretSet('vehicle', prefs);
    }
    prefs.widget = Object.assign({}, cfg, { show }); prefs.compatibility = { commands, verified }; secretSet('vehicle', prefs);
  }
  async details(prefs) {
    const c = this.store.read() || {}, f = c.fields || {};
    const show = (k, v) => k === 'outsideTemp' ? `${fahrenheit(v)}°F`
      : k === 'position' ? (c.place && c.place.label) || `${v.lat.toFixed(5)}, ${v.lon.toFixed(5)}`
      : k === 'remoteStart' ? (v.until > now() ? `Running until ${new Date(v.until).toLocaleTimeString()}` : 'Off')
      : typeof v === 'number' ? Math.round(v * 10) / 10 : v;
    const lines = Object.keys(FIELD_NAMES).map(k => {
      const item = f[k];
      const value = item && item.value !== null && item.value !== undefined ? show(k, item.value) : null;
      return `${FIELD_NAMES[k]}: ${value === null || value === undefined ? 'Unknown' : value}\n${item ? `${item.source} · ${item.at ? new Date(item.at).toLocaleString() : 'measurement time unknown'}` : 'Not reported'}`;
    });
    const photo = prefs.imageMode === 'off' ? 'Icon (photo off)' : prefs.imageMode === 'custom' ? 'From your Photos'
      : c.image && c.image.source ? `${c.image.source} · ${age(c.image.at)}` : 'Not downloaded yet';
    lines.push(`Vehicle photo: ${photo}`);
    const n = c.night;
    lines.push(`Evening check: ${!nightSettings(prefs).enabled ? 'Off' : n && n.done ? `${n.problems.length ? n.problems.join(', ') : n.securityFresh === true ? 'All good' : 'Limited status; current lock/door readings not confirmed'} · ${age(n.at)}` : 'Not run yet'}`);
    if (c.lastCommand) lines.push(`Last request: ${c.lastCommand.action}\n${c.lastCommand.outcome} · ${age(c.lastCommand.at)}`);
    await message(prefs.name, lines.join('\n\n'));
  }
  async truckPhoto(prefs) {
    const api = new FordAPIClient(this.auth, this.store, prefs);
    const a = new Alert(); a.title = 'Vehicle photo';
    a.message = 'Use the picture Ford shows for your VIN in the FordPass app, or pick your own. A cut-out PNG with no background looks best on the widget.';
    ['Download from Ford', 'Download from Ford: choose view', 'Choose from Photos…', 'Use simple truck icon'].forEach(l => a.addAction(l));
    a.addCancelAction('Cancel');
    const choice = await a.presentSheet();
    if (choice < 0) return;
    if (choice <= 1) {
      let angle = null;
      if (choice === 1) {
        const v = new Alert(); v.title = 'Choose a view';
        v.message = 'Ford renders views 1-5. View 4 is the usual FordPass angle. Some vehicles only have one view.';
        for (let n = 1; n <= 5; n++) v.addAction(`View ${n}${n === 4 ? ' (default)' : ''}`);
        v.addCancelAction('Cancel');
        const pick = await v.presentSheet();
        if (pick < 0) return;
        angle = pick + 1;
      }
      Object.assign(prefs, { imageMode: 'auto', imageAngle: angle }); secretSet('vehicle', prefs);
      try { await message('Vehicle photo', `Downloaded from ${await api.updateVehicleImage(true)}.`); }
      catch (e) { await message('Vehicle photo not available', e.message + '\n\nYou can choose a picture from Photos instead.'); return; }
    } else if (choice === 2) {
      let img;
      try { img = await Photos.fromLibrary(); } catch (_) { return; }
      this.store.writeImage(prefs.vin, true, downscale(img, SETTINGS.imageMaxWidth));
      prefs.imageMode = 'custom'; secretSet('vehicle', prefs);
    } else { prefs.imageMode = 'off'; secretSet('vehicle', prefs); }
    await new WidgetRenderer(prefs, this.store.read()).build('medium').presentMedium();
  }
  async nightlyCheck(prefs) {
    const night = nightSettings(prefs), d = new Date();
    if (!night.enabled || d.getHours() < night.hour || !(secretGet('token.mobile') || secretGet('token.official'))) return null;
    const today = d.toDateString(), before = this.store.read(), n = before && before.night;
    if (n && n.date === today && (n.done || n.tries >= 2 || n.next > now())) return null;
    if (!this.store.acquireBackground()) return null;
    this.auth.timeout = 6;
    try {
      let c = this.store.read();
      if (!c || c.vin !== prefs.vin) return null;
      // At most two attempts per evening, 30 minutes apart; never a retry loop.
      c.night = { date: today, tries: n && n.date === today ? n.tries + 1 : 1, next: now() + 30 * 60000, done: false };
      c.nextFetch = 0; this.store.write(c);
      c = (await new FordAPIClient(this.auth, this.store, prefs).getVehicleStatus()).cache;
      if (!c.fetchedAt || c.fetchedAt < now() - 5 * 60000) return c;
      const problems = nightProblems(c.fields, prefs);
      const securityFresh = nightSecurityFresh(c.fields);
      c.night = Object.assign({}, c.night, { done: true, at: now(), problems, securityFresh }); this.store.write(c);
      if (problems.length || night.notifyOk) {
        const note = new Notification(); note.title = `${prefs.name || 'Ford'} · evening check`;
        note.body = problems.length ? problems.join(' · ') + ' · Check reading ages in FordWidget.' : securityFresh ? 'Locked and closed; no problems in the reported readings.'
          : 'No enabled alerts found in available readings. Current lock/door status could not be confirmed.';
        note.openURL = new WidgetRenderer(prefs, c).url();
        try { await note.schedule(); } catch (_) { /* the widget still shows the result */ }
      }
      return c;
    } catch (e) { console.log('Evening check failed: ' + e.message); return null; }
    finally { this.auth.timeout = SETTINGS.timeout; this.store.release(); }
  }
  async parked(prefs) {
    const c = this.store.read() || {}, r = new WidgetRenderer(prefs, c), pl = r.place();
    if (!pl) { await message('Parked location', 'Ford has not reported a location yet, or Parked location is off in Customize widgets. Run Fetch telemetry.'); return; }
    const a = new Alert(); a.title = `Parked · ${pl.label}`; a.message = `Reported ${age(pl.at)}. ${pl.home ? 'This is your saved Home.' : ''}`;
    a.addAction('Open in Maps'); a.addAction('Save this spot as Home');
    if (prefs.home) a.addDestructiveAction('Clear Home');
    a.addCancelAction('Close');
    const i = await a.presentAlert();
    if (i === 0) Safari.open(pl.url);
    if (i === 1) { const p = c.fields.position.value; prefs.home = { lat: p.lat, lon: p.lon }; secretSet('vehicle', prefs); await message('Home saved', 'The widget will say “Parked · Home” when the vehicle is within about 150 m of here.'); }
    if (i === 2) { delete prefs.home; secretSet('vehicle', prefs); }
  }
  // No weather service polling: the vehicle reports its own outside temperature.
  async startWeather() {
    const f = (this.store.read() || {}).fields || {}, t = f.outsideTemp, p = f.position && f.position.value;
    const hint = deg => deg <= 40 ? ' Cold: a full run warms the cabin.' : deg >= 85 ? ' Hot: a full run cools the cabin.' : '';
    if (t && t.at && t.at > now() - 2 * 3600000) return `Outside ${fahrenheit(t.value)}°F (vehicle sensor, ${age(t.at)}).${hint(fahrenheit(t.value))}`;
    if (p) {
      try {
        // Only when the vehicle's reading is old: one request, ~1 km-rounded position, no key, no account.
        const r = new Request('https://api.open-meteo.com/v1/forecast?' + form({ latitude: p.lat.toFixed(2), longitude: p.lon.toFixed(2),
          current: 'temperature_2m', temperature_unit: 'fahrenheit' }));
        r.timeoutInterval = 5;
        const j = await r.loadJSON();
        const v = finite(j && j.current && j.current.temperature_2m);
        if (v !== null) return `Outside about ${Math.round(v)}°F near the vehicle (Open-Meteo, now).${hint(Math.round(v))}`;
      } catch (_) { /* no temperature line */ }
    }
    return t ? `Outside ${fahrenheit(t.value)}°F (vehicle sensor, ${age(t.at)}).` : '';
  }
  async chooseDesign(prefs) {
    const sizes = ['small', 'medium', 'large'], designs = ['classic', 'showcase', 'dashboard'];
    const sizePicker = new Alert(); sizePicker.title = 'Widget gallery · choose size';
    sizes.forEach(s => sizePicker.addAction(s[0].toUpperCase() + s.slice(1)));
    sizePicker.addCancelAction('Cancel');
    const selected = await sizePicker.presentSheet(); if (selected < 0) return;
    const family = sizes[selected];
    for (;;) {
      const cfg = prefs.widget || {}, saved = Object.assign({ small: 'classic', medium: 'classic', large: 'classic' }, cfg.design || {});
      const picker = new Alert(); picker.title = `${family[0].toUpperCase() + family.slice(1)} design`;
      picker.message = 'Classic: balanced status. Showcase: vehicle and controls. Dashboard: detailed readings. Tap a design to preview it, then Close and Use design.';
      designs.forEach(d => picker.addAction(`${saved[family] === d ? '✓ ' : ''}${d[0].toUpperCase() + d.slice(1)}`));
      picker.addCancelAction('Done'); const choice = await picker.presentSheet(); if (choice < 0) return;
      const design = designs[choice], previewPrefs = Object.assign({}, prefs, { widget: Object.assign({}, cfg, { design: Object.assign({}, saved, { [family]: design }) }) });
      const preview = new WidgetRenderer(previewPrefs, this.store.read()).build(family);
      if (family === 'small') await preview.presentSmall();
      else if (family === 'medium') await preview.presentMedium();
      else await preview.presentLarge();
      const confirm = new Alert(); confirm.title = `Use ${design}?`; confirm.message = `Apply this design to ${family} widgets. You can change it again later.`;
      confirm.addAction('Use design'); confirm.addCancelAction('Keep current');
      if (await confirm.presentAlert() === 0) { prefs.widget = previewPrefs.widget; secretSet('vehicle', prefs); return; }
    }
  }
  async alertOptions(prefs) {
    const names = { lock: 'Unlocked', doors: 'Door / hood / tailgate open', tires: 'Low tire pressure', fuel: 'Low fuel', oil: 'Low oil life', battery: 'Low 12V battery', engine: 'Remote start running' };
    for (;;) {
      const settings = alertSettings(prefs), keys = Object.keys(names);
      const a = new Alert(); a.title = 'Alerts & attention';
      a.message = 'Evening notifications use these conditions. Attention shows the first matching cached reading on widgets with its age. Missing readings are not treated as healthy. iOS controls refresh timing.';
      keys.forEach(k => a.addAction(`${settings.enabled[k] ? '✓' : '○'} ${names[k]}`));
      a.addAction(`Tire threshold: below ${settings.tire} psi`);
      a.addAction(`Fuel threshold: below ${settings.fuel}%`);
      a.addAction(`Oil threshold: at or below ${settings.oil}%`);
      a.addAction(`Battery threshold: below ${settings.battery}%`);
      a.addAction(`Widget attention: ${settings.attention ? 'On' : 'Off'}`);
      a.addCancelAction('Done'); const i = await a.presentSheet(); if (i < 0) return;
      const next = Object.assign({}, prefs.alerts || {});
      if (i < keys.length) next.enabled = Object.assign({}, settings.enabled, { [keys[i]]: !settings.enabled[keys[i]] });
      else if (i < keys.length + 4) {
        const key = ['tire', 'fuel', 'oil', 'battery'][i - keys.length], max = 100;
        const values = await input('Alert threshold', `Enter a number from 0 to ${max}${key === 'tire' ? ' psi' : '%'}.`, [{ label: key, value: String(settings[key]) }]);
        if (!values) continue;
        const n = finite(values[0]);
        if (n === null || n < 0 || n > max) { await message('Invalid threshold', `Enter a number from 0 to ${max}.`); continue; }
        next[key] = n;
      } else next.attention = !settings.attention;
      prefs.alerts = next; secretSet('vehicle', prefs);
    }
  }
  async customize(prefs) {
    for (;;) {
      const o = widgetOptions(prefs, ''), cfg = prefs.widget || {};
      const a = new Alert(); a.title = 'Customize widgets';
      a.message = 'Applies to every FordWidget widget. To change one widget, edit it and type words in Parameter: "controls", "fuel tires lock", "-photo", "bar". Lock Screen: "fuel", "lock", "tires" (circle) or "status", "tires", "parked" (rectangle).\n\nEvening check: the first widget refresh after the set hour reads the vehicle’s last state once and notifies you of problems.';
      const keys = Object.keys(METRICS);
      keys.forEach(k => a.addAction(`${o.show[k] ? '✓' : '○'}  ${METRICS[k]}`));
      a.addAction(`Medium layout: ${o.layout.medium === 'controls' ? 'Buttons' : 'Status'}`);
      a.addAction(`Tire units: ${o.unit.toUpperCase()}`);
      const night = nightSettings(prefs);
      a.addAction(`Evening check: ${night.enabled ? `from ${night.hour > 12 ? night.hour - 12 : night.hour} PM` : 'Off'}`);
      a.addAction(`Evening “all good” notice: ${night.notifyOk ? 'On' : 'Off'}`);
      a.addAction('Preview small'); a.addAction('Preview medium'); a.addAction('Preview large');
      a.addCancelAction('Done');
      const i = await a.presentSheet();
      if (i < 0) return;
      const show = Object.assign({}, cfg.show);
      if (i < keys.length) show[keys[i]] = !o.show[keys[i]];
      const next = Object.assign({}, cfg, { show });
      if (i === keys.length) next.medium = o.layout.medium === 'controls' ? 'status' : 'controls';
      if (i === keys.length + 1) next.unit = o.unit === 'bar' ? 'psi' : 'bar';
      prefs.widget = next;
      if (i === keys.length + 2) {
        // Off → 8 PM → 9 PM → 10 PM → 11 PM → Off
        const order = [null, 20, 21, 22, 23], cur = night.enabled ? night.hour : null;
        const nxt = order[(order.indexOf(cur) + 1) % order.length];
        prefs.night = Object.assign({}, prefs.night, nxt === null ? { enabled: false } : { enabled: true, hour: nxt });
      }
      if (i === keys.length + 3) prefs.night = Object.assign({}, prefs.night, { notifyOk: !night.notifyOk });
      secretSet('vehicle', prefs);
      if (!parkedLocationEnabled(prefs)) this.store.purgeLocation();
      const r = () => new WidgetRenderer(prefs, this.store.read());
      if (i === keys.length + 4) await r().build('small').presentSmall();
      if (i === keys.length + 5) await r().build('medium').presentMedium();
      if (i === keys.length + 6) await r().build('large').presentLarge();
    }
  }
  async signOut() {
    const a = new Alert(); a.title = 'Sign out of Ford';
    a.message = 'Removes the saved username, Ford tokens and FordConnect app secret from this phone. Telemetry cache, photo and widget settings stay.';
    a.addDestructiveAction('Sign out'); a.addCancelAction('Cancel');
    if (await a.presentAlert() < 0) return;
    for (const name of ['credentials', 'official', 'token.official', 'token.mobile', 'token.autonomic']) secretRemove(name);
    await message('Signed out', 'Connect FordPass again to use commands.');
  }
  async notify(body) {
    const n = new Notification(); n.title = 'FordWidget'; n.body = body; n.openURL = new WidgetRenderer().url();
    try { await n.schedule(); } catch (_) { /* The foreground alert remains available if notifications are denied. */ }
    await message('FordWidget', body);
  }
  async action(action, prefs, compatibilityTest = false) {
    const api = new FordAPIClient(this.auth, this.store, prefs);
    if (action === 'photo') { await this.truckPhoto(prefs); return; }
    if (action === 'parked') { await this.parked(prefs); return; }
    if (action === 'fetch') {
      const result = await api.getVehicleStatus();
      await api.updatePlace();
      if ((prefs.imageMode || 'auto') === 'auto' && secretGet('token.mobile')) {
        try { const source = await api.updateVehicleImage(false); if (source) result.note += `\nVehicle photo downloaded from ${source}.`; }
        catch (e) { result.note += '\nVehicle photo: ' + e.message.split('\n')[0]; }
      }
      await message('Telemetry', result.note); return;
    }
    if (!Object.prototype.hasOwnProperty.call(COMMANDS, action)) throw new Error('Unknown action.');
    if (!compatibilityTest && prefs.compatibility && prefs.compatibility.commands[action] === false) throw new Error('This command is disabled in Vehicle features.');
    const a = new Alert(); a.title = `${action === 'refresh' ? 'Wake vehicle' : action.toUpperCase()} · ${prefs.name}`;
    const weather = action === 'start' ? await this.startWeather() : '';
    a.message = action === 'start' ? `${weather ? weather + '\n\n' : ''}Use only with the vehicle safely parked outdoors. Sends Lock, confirms that command, then requests engine start.` : action === 'refresh' ? 'Requests a modem wake/status refresh. Updated readings may take time. Limited to one attempt per 15 minutes.' : `Send ${action} to your vehicle?\n\nOnly continue if you tapped this in FordWidget.`;
    if (prefs.compatibility && !prefs.compatibility.verified[action]) a.message += '\n\nUnverified for this vehicle.';
    a.addAction('Send command'); a.addCancelAction('Cancel');
    if (await a.presentAlert() < 0) return;
    let result;
    let sent = false;
    try { result = await api.sendCommand(prefs.vin, action); sent = true; }
    catch (e) { result = 'Command not confirmed.\n' + e.message; }
    // Build a new timeline from actual telemetry, never predicted command effects.
    Script.setWidget(new WidgetRenderer(prefs, this.store.read()).build('large'));
    await this.notify(result);
    return sent;
  }
  async run() {
    if (config.runsInWidget) {
      // Keep this branch ahead of all setup and authentication prompts.
      let c = this.store.read(); const prefs = secretGet('vehicle');
      const parameter = String(args.widgetParameter || '').trim();
      const pinned = widgetOptions(prefs, parameter).vin;
      const mismatch = pinned && (!prefs || pinned !== prefs.vin);
      const valid = !mismatch && prefs && c && c.vin === prefs.vin;
      // The one exception to "widgets never use the network": one read per evening.
      if (valid) c = await this.nightlyCheck(prefs) || c;
      Script.setWidget(new WidgetRenderer(prefs, valid ? c : null, parameter).build(config.widgetFamily || 'medium', mismatch ? 'Widget VIN does not match setup' : ''));
      return;
    }
    console.log(`FordWidget start · app=${config.runsInApp} widget=${config.runsInWidget} action=${args.queryParameters.action || 'menu'}`);
    requireApp();
    if (args.queryParameters.action === 'selftest') { selfTest(); await message('Self-test', 'All offline checks passed. No network calls or commands.'); return; }
    await this.store.acquire();
    try {
      if (!parkedLocationEnabled()) this.store.purgeLocation();
      const saved = secretGet('credentials');
      if (saved && saved.password !== undefined) secretSet('credentials', { username: saved.username });
      let prefs = secretGet('vehicle');
      if (!prefs) { prefs = await this.setupVehicle(); if (prefs) await this.compatibility(prefs); }
      if (!prefs) return;
      const action = args.queryParameters.action;
      if (action) { await this.action(action, prefs); return; }
      const menu = new Alert(); menu.title = prefs.name; menu.message = 'Telemetry reads do not wake the vehicle. Refresh sends an explicit wake request.';
      const items = [
        ['Fetch telemetry', () => this.action('fetch', prefs)],
        ['Lock', () => this.action('lock', prefs)],
        ['Unlock', () => this.action('unlock', prefs)],
        ['Remote start', () => this.action('start', prefs)],
        ['Remote stop', () => this.action('stop', prefs)],
        ['Wake / refresh', () => this.action('refresh', prefs)],
        ['View details', () => this.details(prefs)],
        ['Parked location', () => this.parked(prefs)],
        ['Customize widgets', () => this.customize(prefs)],
        ['Widget gallery', () => this.chooseDesign(prefs)],
        ['Alerts & attention', () => this.alertOptions(prefs)],
        ['Vehicle photo', () => this.truckPhoto(prefs)],
        ['Connect FordPass', () => this.auth.connectMobile()],
        ['Connect FordConnect', () => this.auth.connectOfficial()],
        ['Vehicle features / compatibility', () => this.compatibility(prefs)],
        ['Vehicle setup', async () => { prefs = await this.setupVehicle() || prefs; }],
        ['Sign out of Ford', () => this.signOut()],
        ['Run self-test', async () => { selfTest(); await message('Self-test', 'All offline checks passed. No network calls or commands.'); }],
      ];
      items.forEach(([label]) => menu.addAction(label)); menu.addCancelAction('Close');
      const choice = await menu.presentSheet();
      if (choice >= 0) await items[choice][1]();
      Script.setWidget(new WidgetRenderer(prefs, this.store.read()).build('large'));
    } finally { this.store.release(); }
  }
}

function selfTest() {
  const assert = (condition, label) => { if (!condition) throw new Error('Self-test failed: ' + label); };
  assert(challenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk') === 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM', 'RFC 7636 PKCE');
  assert(finite(null) === null && finite('') === null && finite(false) === null, 'missing values');
  assert(vinOK('1FTFW1E50JFA00001') && !vinOK('1FTFW1E50JFA0000I'), 'VIN validation');
  const vin = '1FTFW1E50JFA00001', time = '2025-01-02T00:00:00Z';
  const raw = { vin, metrics: {
    fuelLevel: { value: 0, updateTime: time }, fuelRange: { value: 100, updateTime: time },
    oilLifeRemaining: { value: 0, updateTime: time }, xevBatteryStateOfCharge: { value: 90 },
    tirePressure: [{ value: 241.3165, vehicleWheel: 'FRONT_LEFT', updateTime: time }],
    doorLockStatus: [{ value: 'UNKNOWN', vehicleDoor: 'ALL_DOORS' }], doorStatus: [{ value: 'UNKNOWN' }],
  } };
  const f = normalize(raw, vin, 'FordConnect', now());
  assert(f.fuel.value === 0 && f.oil.value === 0, 'zero fuel/oil');
  assert(Math.abs(f.fl.value - 35) < 0.01 && Math.abs(f.range.value - 62.137) < 0.01, 'units');
  assert(!f.battery && f.lock.value === 'Unknown' && f.doors.value === 'Unknown', 'unknown is not healthy/locked/closed');
  assert(f.fuel.at === Date.parse(time), 'measurement age');
  assert(!normalize({ metrics: { fuelLevel: { value: 10 } } }, vin, 'FordPass', now()).fuel.at, 'unknown timestamp');
  const old = { fuel: { value: 50, at: now(), source: 'FordPass' } };
  assert(mergeFields(old, f, {}).fuel.value === 50, 'stale server sample cannot overwrite newer cache');
  let rejected = false; try { normalize(raw, '1FTFW1E50JFA00002', 'FordConnect', now()); } catch (_) { rejected = true; }
  assert(rejected, 'cross-vehicle rejection');
  assert(query('https://example.test/cb?code=a%2Bb&state=x').code === 'a+b', 'OAuth URL decoding');
  assert(!callbackMatches('https://example.test/cb-evil?code=x', 'https://example.test/cb'), 'callback boundary');
  rejected = false; try { query('https://example.test/?state=a&state=b'); } catch (_) { rejected = true; }
  assert(rejected, 'duplicate OAuth state');
  const t0 = Date.parse('2025-01-02T00:00:00Z');
  const extra = normalize({ vin, metrics: { outsideTemperature: { value: -2, updateTime: time },
    position: { value: { location: { lat: 42.31, lon: -83.21 } }, updateTime: time },
    remoteStartCountdownTimer: { value: 600, updateTime: time }, ignitionStatus: { value: 'on' } } }, vin, 'FordPass', now());
  assert(extra.outsideTemp.value === -2 && fahrenheit(-2) === 28, 'outside temperature');
  assert(extra.position.value.lat === 42.31 && extra.position.value.lon === -83.21, 'parked position');
  assert(extra.remoteStart.value.until === t0 + 600000 && extra.ignition.value === 'ON', 'remote start timer');
  assert(Math.abs(meters({ lat: 42.31, lon: -83.21 }, { lat: 42.311, lon: -83.21 }) - 111) < 2, 'distance');
  const probs = nightProblems({ lock: { value: 'Unlocked' }, rr: { value: 26 }, fl: { value: 35 }, fuel: { value: 9 } });
  assert(probs.length === 3 && probs[0] === 'Unlocked' && /RR 26 psi/.test(probs[1]), 'evening problems');
  assert(nightProblems({ lock: { value: 'Locked' }, fl: { value: 35 } }).length === 0, 'evening all good');
  assert(nightProblems({ fuel: { value: 20 } }, { alerts: { fuel: 25 } }).length === 1, 'custom fuel threshold');
  assert(nightProblems({ fuel: { value: 5 } }, { alerts: { enabled: { fuel: false } } }).length === 0, 'disabled fuel alert');
  assert(!alertSettings({}).attention && alertSettings({ alerts: { attention: true } }).attention, 'attention opt in');
  assert(widgetOptions({}, 'lock').view === 'lock' && widgetOptions({}, 'parked').view === 'parked', 'lock screen views');
  const rr = new WidgetRenderer({}, { fields: { remoteStart: { value: { until: now() + 60000 }, at: now() - 1000 } }, startRun: { at: now() - 500, until: 0 } });
  assert(rr.remote() && rr.remote().until > now(), 'unconfirmed stop does not hide running telemetry');
  const stopped = new WidgetRenderer({}, { fields: { remoteStart: { value: { until: 0 }, at: now() } }, startRun: { at: now() - 500, until: now() + 60000, estimated: true } });
  assert(stopped.remote() === null, 'newer stopped telemetry ends the start estimate');
  let o = widgetOptions({ widget: { medium: 'controls', unit: 'bar', show: { photo: false } } }, '');
  assert(o.layout.medium === 'controls' && o.unit === 'bar' && !o.show.photo && o.show.tires, 'saved widget options');
  o = widgetOptions({}, 'fuel, tires lock psi');
  assert(o.show.fuel && o.show.tires && o.show.lock && !o.show.oil && !o.show.photo && o.unit === 'psi', 'parameter: show only');
  assert(widgetOptions({ widget: { design: { small: 'showcase' } } }, '').design.small === 'showcase', 'saved design');
  assert(widgetOptions({}, 'dashboard').design.large === 'dashboard', 'design parameter override');
  o = widgetOptions({}, 'buttons -photo no-oil 1FTFW1E50JFA00001');
  assert(o.layout.medium === 'controls' && !o.show.photo && !o.show.oil && o.show.fuel && o.vin === '1FTFW1E50JFA00001', 'parameter: hide, layout, VIN');
  assert(authDetail('{"error":"invalid_grant","error_description":"AADB2C90080: The provided grant has expired."}') === ' invalid_grant: AADB2C90080: The provided grant has expired.', 'login error detail');
  assert(!authDetail('{"error":"x","error_description":"' + 'a'.repeat(60) + '"}').includes('aaaaaaaaaa'), 'no token-like text in errors');
  assert(extractRedirect(`Failed to launch 'fordapp://userauthorized/?code=ab.c-1&state=s1' because the scheme does not have a registered handler.`) === 'fordapp://userauthorized/?code=ab.c-1&state=s1', 'pasted console line');
  assert(callbackMatches('fordapp://userauthorized/?code=x', 'fordapp://userauthorized'), 'redirect with trailing slash');
  assert(findVehicleImageUrl([{ vin: '1FTFW1E50JFA00002' }, { vin, profile: { vehicleImage: 'https://img.ford.com/v.png' } }], vin) === 'https://img.ford.com/v.png', 'garage photo link');
  assert(findVehicleImageUrl([{ vin, profile: { vehicleImage: 'http://img.ford.com/v.png' } }], vin) === null, 'photo link must be HTTPS');
  assert(isFordHost('https://img.ford.com/x') && !isFordHost('https://ford.com.evil.io/x') && !isFordHost('https://evilford.com/') &&
    !isFordHost('https://img.ford.com:x@evil.io/') && !isFordHost('https://img.ford.com@evil.io/'), 'token host boundary');
  assert(findImageRef({ data: { imageUrl: 'https://a.ford.com/i.png' } }).url === 'https://a.ford.com/i.png', 'image link in JSON');
}

try { await new AppController().run(); }
catch (e) {
  if (config.runsInWidget) {
    const w = new ListWidget(); w.addText('FordWidget'); w.addText('Open Scriptable to repair setup/cache.'); Script.setWidget(w);
  } else await message('FordWidget', e.message || 'Unable to complete this run.');
}
Script.complete();
