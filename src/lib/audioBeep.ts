"use client";

// SPEC 9 Web Audio API: browsers block autoplaying sound, so an AudioContext
// can only be created from a user gesture (the "Salli äänimerkit" button).
// Beeps are generated with an oscillator — no audio files.

export interface BeepPlayer {
  playCalm: () => void;
  playUrgent: () => void;
  close: () => void;
}

function playTone(context: AudioContext, frequency: number, durationMs: number, startDelayMs = 0) {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = "sine";
  oscillator.frequency.value = frequency;
  oscillator.connect(gain);
  gain.connect(context.destination);

  const startAt = context.currentTime + startDelayMs / 1000;
  const stopAt = startAt + durationMs / 1000;

  // Short fade in/out avoids an audible click at the start/end of the tone.
  gain.gain.setValueAtTime(0, startAt);
  gain.gain.linearRampToValueAtTime(0.2, startAt + 0.01);
  gain.gain.linearRampToValueAtTime(0, stopAt);

  oscillator.start(startAt);
  oscillator.stop(stopAt);
}

/**
 * Must be called synchronously from a user gesture (click handler) — the
 * AudioContext is created and immediately resumed here, which is what
 * satisfies the browser's autoplay policy.
 */
export function createBeepPlayer(): BeepPlayer {
  const AudioContextClass =
    window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const context = new AudioContextClass();
  void context.resume();

  return {
    // 5-0% remaining: calm, single tone — a nudge, not an alarm.
    playCalm: () => playTone(context, 660, 180),
    // Overtime: two quick tones — noticeably more insistent, but SPEC 9
    // explicitly says "ei herätyskellomainen" (not alarm-clock-like), so
    // still just two short beeps, not a siren.
    playUrgent: () => {
      playTone(context, 880, 150);
      playTone(context, 880, 150, 220);
    },
    close: () => {
      void context.close();
    },
  };
}
