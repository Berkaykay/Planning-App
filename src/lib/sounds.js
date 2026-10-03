// Notification sounds. The built-in ones are synthesized (no files needed); imported ones are
// files in the app's data folder, served to the page as planner-sound://<name>.
import { BUILTIN_SOUNDS } from './store.js';

export const SOUND_LABELS = { chime: 'Soft chime', bell: 'Bell', pop: 'Pop', none: 'No sound' };

export const soundLabel = (sound) => SOUND_LABELS[sound] ?? (sound?.startsWith('file:') ? sound.slice(5) : sound);

let context = null;
const audio = () => (context ??= new AudioContext());

// One soft note: a sine tone that fades in quickly and rings out.
function note(ctx, freq, start, length, volume, type = 'sine') {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(volume, start + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
  osc.connect(gain).connect(ctx.destination);
  osc.start(start);
  osc.stop(start + length + 0.05);
}

const SYNTHS = {
  chime: (ctx, v) => {
    const t = ctx.currentTime;
    note(ctx, 880, t, 0.6, v * 0.5);
    note(ctx, 1318.5, t + 0.14, 0.9, v * 0.4);
  },
  bell: (ctx, v) => {
    const t = ctx.currentTime;
    note(ctx, 660, t, 1.6, v * 0.5);
    note(ctx, 1320, t, 1.0, v * 0.18);
    note(ctx, 1980, t, 0.6, v * 0.08);
  },
  pop: (ctx, v) => {
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.setValueAtTime(520, t);
    osc.frequency.exponentialRampToValueAtTime(980, t + 0.08);
    gain.gain.setValueAtTime(v * 0.6, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.2);
  },
};

// Plays `sound` ('chime' | 'bell' | 'pop' | 'none' | 'file:<name>') at `volume` (0–1).
// Resolves when it has started; never throws (a missing file just stays silent).
export async function playSound(sound, volume = 0.7) {
  try {
    if (!sound || sound === 'none') return false;
    if (sound.startsWith('file:')) {
      const el = new Audio(`planner-sound://sounds/${encodeURIComponent(sound.slice(5))}`);
      el.volume = Math.max(0, Math.min(1, volume));
      await el.play();
      return true;
    }
    if (!BUILTIN_SOUNDS.includes(sound) || !SYNTHS[sound]) return false;
    const ctx = audio();
    if (ctx.state === 'suspended') await ctx.resume();
    SYNTHS[sound](ctx, Math.max(0, Math.min(1, volume)));
    return true;
  } catch {
    return false;
  } finally {
    // Lets the tests see which sound was asked for.
    window.__plannerLastSound = sound;
  }
}
