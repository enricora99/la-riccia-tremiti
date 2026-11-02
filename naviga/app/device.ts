// Funzioni del telefono: suono d'avviso, vibrazione, schermo sempre acceso, bussola.

// ——— Suono: generato con Web Audio (nessun file da scaricare). Va "sbloccato" con un tocco.
let ctx: AudioContext | null = null;
export function unlockAudio() {
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return;
  ctx ??= new AC();
  if (ctx.state === 'suspended') void ctx.resume();
}
export function beep(kind: 'warning' | 'danger') {
  if (!ctx) return;
  const tones = kind === 'danger' ? [880, 660, 880, 660] : [740, 990];
  const t0 = ctx.currentTime + 0.02;
  tones.forEach((f, i) => {
    const o = ctx!.createOscillator(), g = ctx!.createGain();
    o.type = 'square';
    o.frequency.value = f;
    const s = t0 + i * 0.22;
    g.gain.setValueAtTime(0.0001, s);
    g.gain.exponentialRampToValueAtTime(0.25, s + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, s + 0.18);
    o.connect(g).connect(ctx!.destination);
    o.start(s);
    o.stop(s + 0.2);
  });
  // vibrazione solo dove esiste (Android); su iOS il web non può vibrare
  navigator.vibrate?.(kind === 'danger' ? [300, 120, 300, 120, 300] : [200, 100, 200]);
}

// ——— Schermo sempre acceso (Screen Wake Lock), riattivato quando l'app torna in primo piano
export function keepScreenOn(onUnsupported: () => void) {
  const nav = navigator as Navigator & { wakeLock?: { request(type: 'screen'): Promise<{ release(): Promise<void> }> } };
  if (!nav.wakeLock) { onUnsupported(); return; }
  const request = () => nav.wakeLock!.request('screen').catch(() => onUnsupported());
  void request();
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void request(); });
}

// ——— Bussola: su iOS serve un permesso esplicito chiesto con un tocco
type IOSOrientation = typeof DeviceOrientationEvent & { requestPermission?: () => Promise<'granted' | 'denied'> };
export async function startCompass(onHeading: (deg: number | null) => void): Promise<boolean> {
  const DOE = window.DeviceOrientationEvent as IOSOrientation | undefined;
  if (!DOE) return false;
  if (typeof DOE.requestPermission === 'function') {
    try { if ((await DOE.requestPermission()) !== 'granted') return false; } catch { return false; }
  }
  let got = false;
  const handler = (e: DeviceOrientationEvent & { webkitCompassHeading?: number }) => {
    let h: number | null = null;
    if (typeof e.webkitCompassHeading === 'number') h = e.webkitCompassHeading; // iOS: già rispetto al nord
    else if (e.absolute && e.alpha != null) h = (360 - e.alpha) % 360; // Android: orientamento assoluto
    if (h == null) return;
    // compensa la rotazione dello schermo
    const so = (screen.orientation?.angle ?? 0);
    got = true;
    onHeading((h + so + 360) % 360);
  };
  const ev = 'ondeviceorientationabsolute' in window ? 'deviceorientationabsolute' : 'deviceorientation';
  window.addEventListener(ev, handler as EventListener);
  // se dopo 2 secondi non arriva nulla di utile, la bussola non c'è
  await new Promise((r) => setTimeout(r, 2000));
  if (!got) { window.removeEventListener(ev, handler as EventListener); return false; }
  return true;
}
