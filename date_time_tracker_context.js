// context.js — header shown only when Display Time is true; primes retry/erase guard
const modifier = (text) => {
  if (typeof state !== 'object' || state === null) return { text };

  TimeLib.init(state);
  TimeLib.setRateFromCard(state, storyCards);
  TimeLib.applyManualFromCard(state, info, storyCards);

  // Prime suppression on rewind/erase (so next Continue won't advance)
  try {
    const tid  = TimeLib.getTurnId(info, state);
    const last = (state._time && typeof state._time.lastSeen === 'number') ? state._time.lastSeen : -1;
    if (tid < last) {
      state._suppressNextAdvance = true;
      if (state._time && state._time.history) {
        Object.keys(state._time.history).forEach(k => { if (+k > tid) delete state._time.history[k]; });
      }
      // Do not set lastSeen here; Output will record the actual snapshot it shows
    }
  } catch {}

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
};
modifier(text);
