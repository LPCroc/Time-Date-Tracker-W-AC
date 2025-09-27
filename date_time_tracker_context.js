
// DTT 1.4.8
// Context modifier below:
const modifier = (text) => {
    text = TimeAndDay.Hooks.onContext(text);
    [text, stop] = AutoCards("context", text, stop);
    return { text, stop };
};
modifier(text);
