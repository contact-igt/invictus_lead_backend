import { reconcileAllBirthwaveAttention } from "./birthwaveAttention.service.js";

let started = false;
export const startBirthwaveAttentionScheduler = () => {
  if (started) return;
  started = true;
  const minutes = Math.max(1, Number(process.env.BIRTHWAVE_ATTENTION_SCAN_INTERVAL_MINUTES) || 5);
  const tick = async () => { try { await reconcileAllBirthwaveAttention(); } catch (error) { console.error("[Birthwave Attention] reconciliation failed", error?.message || error); } };
  setInterval(tick, minutes * 60 * 1000).unref?.();
  console.log(`Birthwave Needs Attention reconciliation started (every ${minutes} minutes).`);
};
