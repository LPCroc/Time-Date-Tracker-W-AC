// input.js — display toggle + sleep + advances on input + expose prose time toggles on the card
const modifier = (text) => {
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
  } catch {}

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
      for (let i=0;i<list.length;i++){
        const c = list[i];
        if (c && (c.key===key || c.keys===key)) { reg.idx=i; reg.created=true; break; }
      }
    }
    if (reg.idx !== -1 && typeof updateStoryCard === 'function') {
      try { updateStoryCard(reg.idx, key, entry, type, title, notes || ''); } catch {}
    } else if (!reg.created && typeof addStoryCard === 'function') {
      try { addStoryCard(key, entry, type, title, notes || ''); reg.created=true; } catch {}
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
};
modifier(text);
