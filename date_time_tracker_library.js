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
    if (cachedHash === undefined) { cachedHash = '' }
    if (cachedTextLink === undefined) { cachedCharValidator = '' }
    if (isRetry === undefined) { isRetry = false }
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

function TLInput(text) {
    // input.js — display toggle + sleep + advances on input + expose prose time toggles on the card
    if (typeof state !== 'object' || state === null) return { text };

    TimeLib.init(state);
    TimeLib.setRateFromCard(state, storyCards);
    TimeLib.applyManualFromCard(state, info, storyCards);

    // Read toggles from Time & Day card (defaults)
    const readToggle = (label, def) => {
        const list = Array.isArray(storyCards) ? storyCards : [];
        const card = list.find(c => c && (c.key === 'timeAndDay' || c.keys === 'timeAndDay'));
        let val = typeof state[label] === 'boolean' ? state[label] : def;
        if (card) {
            const raw = (typeof card.entry === 'string') ? card.entry : (typeof card.value === 'string' ? card.value : '');
            const m = new RegExp(label + '\\s*:\\s*(true|false)', 'i').exec(raw);
            if (m) val = m[1].toLowerCase() === 'true';
        }
        state[label] = val;
        return val;
    };
    const showTime = readToggle('Display Time', true);
    // New toggles for prose handling:
    const lockProseTime = readToggle('Lock Prose Time', true);
    const hideProseTime = readToggle('Hide Prose Time', false);

    // Sleep command: "sleep till next morning/day"
    try {
        const sleepRe = /\b(sleep|nap|rest)\s+(till|until)\s+(next\s+)?(morning|day)\b/i;
        const m = sleepRe.exec(text || '');
        if (m) {
            const beforeMin = state.clockMinutes;
            const beforeDay = state.dayNumber;
            state.dayNumber = (state.dayNumber || 1) + 1;
            state.clockMinutes = 8 * 60; // 08:00
            state._manualPending = true;
            state._manualJump = { fromMin: beforeMin, fromDay: beforeDay, toMin: state.clockMinutes, toDay: state.dayNumber };

            const stripped = (text || '').replace(sleepRe, '').trim();
            text = stripped.length ? stripped : "You go to sleep.";
        }
    } catch { }

    // Advance on player input
    const res = TimeLib.handlePlayerInputTurn(state, info);
    const d = TimeLib.display(state);

    // Update cards (no debug)
    state._cards = state._cards || {};
    const ensure = (key, entry, type, title, notes) => {
        state._cards[key] = state._cards[key] || { idx: -1, created: false };
        const reg = state._cards[key];
        const list = Array.isArray(storyCards) ? storyCards : null;
        if (list && reg.idx === -1) {
            for (let i = 0; i < list.length; i++) {
                const c = list[i];
                if (c && (c.key === key || c.keys === key)) { reg.idx = i; reg.created = true; break; }
            }
        }
        if (reg.idx !== -1 && typeof updateStoryCard === 'function') {
            try { updateStoryCard(reg.idx, key, entry, type, title, notes || ''); } catch { }
        } else if (!reg.created && typeof addStoryCard === 'function') {
            try { addStoryCard(key, entry, type, title, notes || ''); reg.created = true; } catch { }
        }
    };

    ensure(
        'timeAndDay',
        `Time: ${d.timeStr} (${d.phase}), Day #: ${d.dayNum}
Display Time: ${showTime ? 'true' : 'false'}
Lock Prose Time: ${lockProseTime ? 'true' : 'false'}
Hide Prose Time: ${hideProseTime ? 'true' : 'false'}`,
        'Time and Day',
        'Time and Day',
        ''
    );

    ensure(
        'actionRate',
        `Minutes per action: ${state.minutesPerAction}`,
        'Action Rate',
        'Action Rate',
        `Type "sleep till next morning" in a Do action → time jumps to 08:00am next day.`
    );

    const prefix = showTime ? `Time (${d.timeStr}) (${d.phase}), Day (${d.dayNum}) ` : '';
    return { text: prefix + text };
}

function TLContext(text) {
    isRetry = getIsRetry(text);
    cacheContextVAL(text);
    // context.js — header shown only when Display Time is true; primes retry/erase guard
    if (typeof state !== 'object' || state === null) return { text };

    TimeLib.init(state);
    TimeLib.setRateFromCard(state, storyCards);
    TimeLib.applyManualFromCard(state, info, storyCards);

    // Prime suppression on rewind/erase (so next Continue won't advance)
    try {
        const tid = TimeLib.getTurnId(info, state);
        const last = (state._time && typeof state._time.lastSeen === 'number') ? state._time.lastSeen : -1;
        if (tid < last) {
            state._suppressNextAdvance = true;
            if (state._time && state._time.history) {
                Object.keys(state._time.history).forEach(k => { if (+k > tid) delete state._time.history[k]; });
            }
            // Do not set lastSeen here; Output will record the actual snapshot it shows
        }
    } catch { }

    // Display toggle
    const readDisplayToggle = () => {
        const list = Array.isArray(storyCards) ? storyCards : [];
        const card = list.find(c => c && (c.key === 'timeAndDay' || c.keys === 'timeAndDay'));
        let show = typeof state.displayTimeEnabled === 'boolean' ? state.displayTimeEnabled : true;
        if (card) {
            const raw = (typeof card.entry === 'string') ? card.entry : (typeof card.value === 'string' ? card.value : '');
            const m = /Display\s*Time:\s*(true|false)/i.exec(raw);
            if (m) show = m[1].toLowerCase() === 'true';
        }
        state.displayTimeEnabled = show;
        return show;
    };
    const showTime = readDisplayToggle();

    const d = TimeLib.display(state);
    if (!showTime) return { text };
    return { text: `[Time: ${d.timeStr} (${d.phase}), Day #: ${d.dayNum}] ` + text };
}

function TLOutput(text) {
    // output.js — Continue can advance; Retry/Erase never advance;
    // only narrate forward manual edits when visible; lock/hide time in prose
    if (typeof state !== 'object' || state === null) return { text };

    TimeLib.init(state);
    TimeLib.setRateFromCard(state, storyCards);
    TimeLib.applyManualFromCard(state, info, storyCards);

    const res = TimeLib.handleViewTurn(state, info);
    const d = TimeLib.display(state);

    // Read toggles from card (defaults)
    const readToggle = (label, def) => {
        const list = Array.isArray(storyCards) ? storyCards : [];
        const card = list.find(c => c && (c.key === 'timeAndDay' || c.keys === 'timeAndDay'));
        let val = typeof state[label] === 'boolean' ? state[label] : def;
        if (card) {
            const raw = (typeof card.entry === 'string') ? card.entry : (typeof card.value === 'string' ? card.value : '');
            const m = new RegExp(label + '\\s*:\\s*(true|false)', 'i').exec(raw);
            if (m) val = m[1].toLowerCase() === 'true';
        }
        state[label] = val;
        return val;
    };
    const showTime = readToggle('Display Time', true);
    const lockProse = readToggle('Lock Prose Time', true);
    const hideProse = readToggle('Hide Prose Time', false);

    // Build canonical time strings
    const hhmm = d.timeStr; // "HH:MM" 24h
    const [H, M] = hhmm.split(':').map(n => parseInt(n, 10));
    const hour12 = ((H % 12) || 12);
    const ampm = H >= 12 ? 'pm' : 'am';
    const canonical12 = `${hour12}:${String(M).padStart(2, '0')}${ampm}`;

    // Optionally sanitize AI prose for time mentions before we add our footer/narration
    if (hideProse || lockProse) {
        // 12-hour like "4:28pm" or "04:28 pm"
        const re12 = /\b(0?[1-9]|1[0-2]):[0-5]\d\s?(?:am|pm)\b/gi;
        // 24-hour like "16:28"
        const re24 = /\b([01]?\d|2[0-3]):[0-5]\d\b/g;

        if (hideProse) {
            text = text.replace(re12, '').replace(re24, '');
            // collapse double spaces after removals
            text = text.replace(/\s{2,}/g, ' ');
        } else if (lockProse) {
            text = text.replace(re12, canonical12).replace(re24, hhmm);
        }
    }

    // Update cards (no debug)
    state._cards = state._cards || {};
    const ensure = (key, entry, type, title, notes) => {
        state._cards[key] = state._cards[key] || { idx: -1, created: false };
        const reg = state._cards[key];
        const list = Array.isArray(storyCards) ? storyCards : null;
        if (list && reg.idx === -1) {
            for (let i = 0; i < list.length; i++) { const c = list[i]; if (c && (c.key === key || c.keys === key)) { reg.idx = i; reg.created = true; break; } }
        }
        if (reg.idx !== -1 && typeof updateStoryCard === 'function') { try { updateStoryCard(reg.idx, key, entry, type, title, notes || ''); } catch { } }
        else if (!reg.created && typeof addStoryCard === 'function') { try { addStoryCard(key, entry, type, title, notes || ''); reg.created = true; } catch { } }
    };

    ensure(
        'timeAndDay',
        `Time: ${d.timeStr} (${d.phase}), Day #: ${d.dayNum}
Display Time: ${showTime ? 'true' : 'false'}
Lock Prose Time: ${lockProse ? 'true' : 'false'}
Hide Prose Time: ${hideProse ? 'true' : 'false'}`,
        'Time and Day',
        'Time and Day',
        ''
    );
    ensure(
        'actionRate',
        `Minutes per action: ${state.minutesPerAction}`,
        'Action Rate',
        'Action Rate',
        `Type "sleep till next morning" in a Do action → time jumps to 08:00am next day.`
    );

    // Narrate ONLY forward manual edits (no rewinds), only if display is ON
    let narration = '';
    if (showTime && res && res.reason === 'manual' && res.jump) {
        const { fromMin, toMin, fromDay, toDay } = res.jump;
        const MINUTES_PER_DAY = 1440;
        let delta = (toDay - fromDay) * MINUTES_PER_DAY + (toMin - fromMin);
        while (delta < 0) delta += MINUTES_PER_DAY; // normalize to forward movement

        if (delta > 0) {
            const fmt = (mins0) => {
                let mins = Math.abs(mins0), days = Math.floor(mins / MINUTES_PER_DAY); mins %= MINUTES_PER_DAY;
                const hrs = Math.floor(mins / 60), mns = mins % 60, parts = [];
                if (days) parts.push(`${days} day${days === 1 ? '' : 's'}`);
                if (hrs) parts.push(`${hrs} hour${hrs === 1 ? '' : 's'}`);
                if (mns) parts.push(`${mns} minute${mns === 1 ? '' : 's'}`);
                return parts.join(' ') || '0 minutes';
            };
            narration = `\n\n⏳ ${fmt(delta)} have passed.`;
        }
    }

    const footer = showTime ? `\n\n[Time: ${d.timeStr} (${d.phase}), Day #: ${d.dayNum}]` : '';
    return { text: `${text}${narration}${footer}` };
}
function cacheContextVAL(text) {
    cachedHash = hash(text);
    cachedCharLink = getTextLink(text);
})
function hash(str) {  //credits to lewdleah for of hash function
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = ((31 * hash) + str.charCodeAt(i)) % 65536;
    }
    return hash.toString(36);
}
function getTextLink(str) {
    return str[0] + str[1] + str[str.length - 2] + str[str.length - 1]
}
function getIsRetry(text) {
    if (cachedHash === undefined || cachedCharLink === undefined) return false;
    const hash = hash(text);
    const link = getTextLink(text);
    return (hash === cachedHash && link === cachedCharLink);

}