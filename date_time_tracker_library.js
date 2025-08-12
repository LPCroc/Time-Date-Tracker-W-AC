// library.js (Continue advances; Retry/Erase suppressed; manual-jump; updated day-part windows)
(function () {
  const VERSION = "TimeLib 1.3.1 (continue-advance + retry-guard)";
  const DAY_START_MINUTES = 8 * 60;   // 08:00
  const MINUTES_PER_DAY   = 24 * 60;
  const DEFAULT_RATE_MIN  = 10;

  function init(state) {
    if (!state || typeof state !== 'object') return;
    if (typeof state.clockMinutes !== 'number') state.clockMinutes = DAY_START_MINUTES;
    if (typeof state.dayNumber !== 'number') state.dayNumber = 1;
    if (typeof state.minutesPerAction !== 'number') state.minutesPerAction = DEFAULT_RATE_MIN;
    if (!state._time) state._time = { history:{}, lastSeen:-1, lastInputSeen:-1 };
    if (typeof state._suppressNextAdvance !== 'boolean') state._suppressNextAdvance = false;
  }

  function setRateFromCard(state, storyCards) {
    try {
      const list = Array.isArray(storyCards) ? storyCards : [];
      const card = list.find(c => c && (c.key === 'actionRate' || c.keys === 'actionRate'));
      const entry = card && (typeof card.entry === 'string') ? card.entry : (typeof card.value === 'string' ? card.value : '');
      if (!entry) return;
      const m = entry.match(/\b(\d{1,3})\b/);
      if (m) state.minutesPerAction = Math.max(1, Math.min(180, parseInt(m[1],10)));
    } catch {}
  }

  function addMinutes(state, delta) {
    const before = state.clockMinutes;
    let cur = before + delta;
    let wrapped = false;
    if (cur >= MINUTES_PER_DAY) { cur = cur % MINUTES_PER_DAY; wrapped = true; }
    if (cur < 0) { cur = ((cur % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY; wrapped = true; }
    state.clockMinutes = cur;
    if (wrapped) state.dayNumber = (state.dayNumber || 1) + 1;
    return { before, after: cur, wrapped };
  }

  function format(mins) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    const pad = (n)=>String(n).padStart(2,'0');
    return `${pad(h)}:${pad(m)}`;
  }

  // UPDATED DAY-PART WINDOWS:
  // Morning:   06:00–11:59
  // Afternoon: 12:00–16:59
  // Evening:   17:00–19:59
  // Night:     20:00–05:59  (wraps through midnight)
  function phaseFor(mins) {
    if (mins >= 6*60 && mins < 12*60) return 'Morning';
    if (mins >= 12*60 && mins < 17*60) return 'Afternoon';
    if (mins >= 17*60 && mins < 20*60) return 'Evening';
    return 'Night'; // 20:00–23:59 and 00:00–05:59
  }

  function display(state) {
    const timeStr = format(state.clockMinutes);
    return { timeStr, phase: phaseFor(state.clockMinutes), dayNum: state.dayNumber || 1 };
  }

  function getTurnId(info, state) {
    if (info && typeof info.actionCount === 'number') return info.actionCount;
    state._time._fallbackTid = (state._time._fallbackTid || 0) + 1;
    return state._time._fallbackTid;
  }

  // Adopt manual edits from Time & Day card for this turn
  function applyManualFromCard(state, info, storyCards) {
    try {
      const list = Array.isArray(storyCards) ? storyCards : [];
      const card = list.find(c => c && (c.key === 'timeAndDay' || c.keys === 'timeAndDay'));
      const txt = card && (typeof card.entry === 'string' ? card.entry : (typeof card.value === 'string' ? card.value : ''));
      if (!txt) return false;

      const tm = /Time:\s*(\d{1,2}):(\d{2})/i.exec(txt);
      const dy = /Day\s*#:\s*(\d+)/i.exec(txt);

      const beforeMin = state.clockMinutes;
      const beforeDay = state.dayNumber;

      let changed = false, afterMin = beforeMin, afterDay = beforeDay;

      if (tm) {
        const hh = parseInt(tm[1],10), mm = parseInt(tm[2],10);
        const mins = (isNaN(hh)||isNaN(mm)) ? null : (hh*60 + mm);
        if (mins != null && mins !== state.clockMinutes) { afterMin = mins; changed = true; }
      }
      if (dy) {
        const d = parseInt(dy[1],10);
        if (!isNaN(d) && d !== state.dayNumber) { afterDay = d; changed = true; }
      }

      if (changed) {
        state.clockMinutes = afterMin;
        state.dayNumber    = afterDay;
        state._manualPending = true;
        state._manualJump = { fromMin: beforeMin, fromDay: beforeDay, toMin: afterMin, toDay: afterDay };
      }
      return changed;
    } catch { return false; }
  }

  // Player input (Do/Say/Story) advances
  function handlePlayerInputTurn(state, info) {
    init(state);
    const tid = getTurnId(info, state);

    if (tid <= state._time.lastInputSeen) {
      return { tid, ticked:false, reason:'dup-input' };
    }

    if (state._manualPending) {
      const jump = state._manualJump || null;
      state._time.history[tid] = { after: state.clockMinutes, day: state.dayNumber, reason:'manual', jump };
      state._time.lastSeen = Math.max(state._time.lastSeen, tid);
      state._time.lastInputSeen = tid;
      state._manualPending = false;
      return { tid, ticked:false, reason:'manual', jump };
    }

    const span = addMinutes(state, state.minutesPerAction);
    state._time.history[tid] = { after: state.clockMinutes, day: state.dayNumber, reason:'advance-input' };
    state._time.lastSeen = Math.max(state._time.lastSeen, tid);
    state._time.lastInputSeen = tid;
    return { tid, ticked:true, reason:'advance-input', added: state.minutesPerAction, before: span.before, after: span.after };
  }

  // Continue/Retry/Erase are handled here (no player text)
  function handleViewTurn(state, info) {
    init(state);
    const tid  = getTurnId(info, state);
    const last = state._time.lastSeen;

    if (state._manualPending) {
      const jump = state._manualJump || null;
      state._time.history[tid] = { after: state.clockMinutes, day: state.dayNumber, reason:'manual', jump };
      state._time.lastSeen = Math.max(state._time.lastSeen, tid);
      state._manualPending = false;
      return { tid, ticked:false, reason:'manual', jump };
    }

    // Retry/Erase detected → never tick next view turn
    if (tid < last) {
      state._suppressNextAdvance = true;
      if (state._time && state._time.history) {
        Object.keys(state._time.history).forEach(k => { if (+k > tid) delete state._time.history[k]; });
      }
      state._time.lastSeen = tid;
      return { tid, ticked:false, reason:'rewind' };
    }

    if (tid === last) {
      return { tid, ticked:false, reason:'same' };
    }

    // New view turn → Continue or Retry’s +1 variant
    if (state._suppressNextAdvance) {
      state._suppressNextAdvance = false;
      state._time.history[tid] = { after: state.clockMinutes, day: state.dayNumber, reason:'retry-suppress' };
      state._time.lastSeen = tid;
      return { tid, ticked:false, reason:'retry-suppress' };
    }

    // Continue advances
    const span = addMinutes(state, state.minutesPerAction);
    state._time.history[tid] = { after: state.clockMinutes, day: state.dayNumber, reason:'advance-continue' };
    state._time.lastSeen = tid;
    return { tid, ticked:true, reason:'advance-continue', added: state.minutesPerAction, before: span.before, after: span.after };
  }

  // Export
  globalThis.TimeLib = {
    VERSION,
    init,
    setRateFromCard,
    addMinutes,
    format,
    phaseFor,
    display,
    getTurnId,
    applyManualFromCard,
    handlePlayerInputTurn,
    handleViewTurn,
  };
})();
