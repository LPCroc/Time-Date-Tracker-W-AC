const modifier = (text) => {
  if (typeof TLOutput === 'function') return TLOutput(text);
  return { text };
};
modifier(text);
