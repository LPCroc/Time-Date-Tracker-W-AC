const modifier = (text) => {
  if (typeof TLContext === 'function') return TLContext(text);
  return { text };
};
modifier(text);
