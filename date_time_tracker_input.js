const modifier = (text) => {
  if (typeof TLInput === 'function') return TLInput(text);
  // graceful fallback so the run doesn’t crash if the library fails to load
  return { text };
};
modifier(text);
