// output.js — Continue can advance; Retry/Erase never advance;
// only narrate forward manual edits when visible; lock/hide time in prose
const modifier = (text) => {
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
  const showTime     = readToggle('Display Time', true);
  const lockProse    = readToggle('Lock Prose Time', true);
  const hideProse    = readToggle('Hide Prose Time', false);

  // Build canonical time strings
  const hhmm = d.timeStr; // "HH:MM" 24h
  const [H, M] = hhmm.split(':').map(n => parseInt(n,10));
  const hour12 = ((H % 12) || 12);
  const ampm   = H >= 12 ? 'pm' : 'am';
  const canonical12 = `${hour12}:${String(M).padStart(2,'0')}${ampm}`;

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
      for (let i=0;i<list.length;i++){ const c=list[i]; if (c && (c.key===key || c.keys===key)) { reg.idx=i; reg.created=true; break; } }
    }
    if (reg.idx !== -1 && typeof updateStoryCard === 'function') { try { updateStoryCard(reg.idx, key, entry, type, title, notes || ''); } catch {} }
    else if (!reg.created && typeof addStoryCard === 'function') { try { addStoryCard(key, entry, type, title, notes || ''); reg.created=true; } catch {} }
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
        if (days) parts.push(`${days} day${days===1?'':'s'}`);
        if (hrs)  parts.push(`${hrs} hour${hrs===1?'':'s'}`);
        if (mns)  parts.push(`${mns} minute${mns===1?'':'s'}`);
        return parts.join(' ') || '0 minutes';
      };
      narration = `\n\n⏳ ${fmt(delta)} have passed.`;
    }
  }

  const footer = showTime ? `\n\n[Time: ${d.timeStr} (${d.phase}), Day #: ${d.dayNum}]` : '';
  return { text: `${text}${narration}${footer}` };
};
modifier(text);
