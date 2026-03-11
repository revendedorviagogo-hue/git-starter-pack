import { useRef, useCallback, useEffect } from "react";

/**
 * Professional looping notification alarm.
 * Plays a repeating two-tone alert until explicitly stopped.
 */
export const useNotificationSound = () => {
  const ctxRef = useRef<AudioContext | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isPlayingRef = useRef(false);

  const playTone = useCallback(() => {
    if (!ctxRef.current) return;
    const ctx = ctxRef.current;
    const now = ctx.currentTime;

    // --- First beep (high) ---
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(1046.5, now); // C6
    gain1.gain.setValueAtTime(0.18, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    osc1.start(now);
    osc1.stop(now + 0.12);

    // --- Second beep (higher) ---
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(1318.5, now + 0.15); // E6
    gain2.gain.setValueAtTime(0, now);
    gain2.gain.setValueAtTime(0.18, now + 0.15);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.27);
    osc2.start(now + 0.15);
    osc2.stop(now + 0.27);

    // --- Third beep (highest) ---
    const osc3 = ctx.createOscillator();
    const gain3 = ctx.createGain();
    osc3.connect(gain3);
    gain3.connect(ctx.destination);
    osc3.type = "sine";
    osc3.frequency.setValueAtTime(1568, now + 0.3); // G6
    gain3.gain.setValueAtTime(0, now);
    gain3.gain.setValueAtTime(0.22, now + 0.3);
    gain3.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
    osc3.start(now + 0.3);
    osc3.stop(now + 0.5);
  }, []);

  const startAlarm = useCallback(() => {
    if (isPlayingRef.current) return;
    isPlayingRef.current = true;

    try {
      ctxRef.current = new AudioContext();
    } catch {
      return;
    }

    // Play immediately, then repeat every 1.5s
    playTone();
    intervalRef.current = setInterval(() => {
      if (isPlayingRef.current) playTone();
    }, 1500);
  }, [playTone]);

  const stopAlarm = useCallback(() => {
    isPlayingRef.current = false;
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (ctxRef.current) {
      ctxRef.current.close().catch(() => {});
      ctxRef.current = null;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => stopAlarm();
  }, [stopAlarm]);

  return { startAlarm, stopAlarm, isPlayingRef };
};
