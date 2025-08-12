// date_time_tracker_library.js
// Single "Time and Day" card (Display Time + Minutes per action).
// Continue & Do/Say advance; Retry/Undo/Erase never advance (guarded).
// Sleep phrase: "sleep till next morning" -> 08:00 next day.
// Day parts: Morning 06:00–11:59, Afternoon 12:00–16:59, Evening 17:00–19:59, Night 20:00–05:59.
// Output always shows time footer (if Display Time: true). Input/Context show nothing.

(function () {
  const VERSION = "DTT 1.4.7 (retry-guard + output footer all)";
  const KEY_TIME   = 'timeAndDay';
  const TITLE_TIME = 'Time and Day';
  const TYPE_TIME  = 'Time and Day';

  const MIN_PER_DAY       = 1440;
  const DAY_START_MINUTES = 8 * 60; // 08:00
  const DEFAULT_RATE_MIN  = 10;

  // ---------- helpers ----------
  const pad2 = (n) => String(n).padStart(2,'0');
  const formatHHMM = (mins) => `${pad2(Math.floor(mins/60))}:${pad2(mins%60)}`;
  const phaseFor = (mins) =>
    (mins >= 360 && mins < 720)  ? 'Morning'   :
    (mins < 1020)                ? 'Afternoon' :
    (mins < 1200)                ? 'Evening'   :
                                   'Night';
  const esc = (s)=>s.replace(/[-/\\^$*+?.()|[\]{}]/g,'\\$&');
  const parseBoolLine=(raw,label,def)=>{
    const m=new RegExp(esc(label)+'\\s*:\\s*(true|false)','i').exec(raw||'');
    return m?m[1].toLowerCase()==='true':def;
  };
  const parseNumberLine=(raw,label,def)=>{
    const m=new RegExp(esc(label)+'\\s*:\\s*(\\d{1,3})','i').exec(raw||'');
    if(!m) return def; const n=+m[1];
    return Number.isNaN(n)?def:Math.max(1,Math.min(180,n));
  };

  // ---------- state ----------
  function init(state){
    if(!state||typeof state!=='object') return;
    if(typeof state.clockMinutes!=='number') state.clockMinutes=DAY_START_MINUTES;
    if(typeof state.dayNumber!=='number') state.dayNumber=1;
    if(typeof state.minutesPerAction!=='number') state.minutesPerAction=DEFAULT_RATE_MIN;
    if(!state._dtt) state._dtt={history:{},lastSeen:-1,lastInputSeen:-1};
    if(typeof state._suppressNextAdvance!=='boolean') state._suppressNextAdvance=false;
  }
  function getTurnId(info,state){
    if(info&&typeof info.actionCount==='number') return info.actionCount;
    state._dtt._fallbackTid=(state._dtt._fallbackTid||0)+1;
    return state._dtt._fallbackTid;
  }
  function addMinutes(state,delta){
    const before=state.clockMinutes; let cur=before+delta; let wrapped=false;
    if(cur>=MIN_PER_DAY){cur%=MIN_PER_DAY; wrapped=true;}
    if(cur<0){cur=((cur%MIN_PER_DAY)+MIN_PER_DAY)%MIN_PER_DAY; wrapped=true;}
    state.clockMinutes=cur; if(wrapped) state.dayNumber=(state.dayNumber||1)+1;
    return {before,after:cur,wrapped};
  }
  function display(state){ return { timeStr:formatHHMM(state.clockMinutes), phase:phaseFor(state.clockMinutes), dayNum:state.dayNumber||1 }; }

  // ---------- card ----------
  function findTimeCardIndex(storyCards){
    const list=Array.isArray(storyCards)?storyCards:[];
    for(let i=0;i<list.length;i++){const c=list[i]; if(c&&(c.key===KEY_TIME||c.keys===KEY_TIME)) return i;}
    return -1;
  }
  function ensureTimeCard(state,storyCards,showLine,rate,d){
    state._cards=state._cards||{};
    state._cards[KEY_TIME]=state._cards[KEY_TIME]||{idx:-1,created:false};
    const reg=state._cards[KEY_TIME];
    const entry =
`Time: ${d.timeStr} (${d.phase}), Day #: ${d.dayNum}
Display Time: ${showLine}
Minutes per action: ${rate}`;
    const notes=`Type "sleep till next morning" in a Do action → time jumps to 08:00am next day.`;
    const list=Array.isArray(storyCards)?storyCards:[]; const idx=(reg.idx>=0)?reg.idx:findTimeCardIndex(list);
    if(idx>=0&&typeof updateStoryCard==='function'){
      try{ updateStoryCard(idx,KEY_TIME,entry,TYPE_TIME,TITLE_TIME,notes); reg.idx=idx; reg.created=true; }catch{}
    }else if(!reg.created&&typeof addStoryCard==='function'){
      try{ addStoryCard(KEY_TIME,entry,TYPE_TIME,TITLE_TIME,notes); reg.created=true; reg.idx=findTimeCardIndex(list);}catch{}
    }
  }
  function readSettings(state,storyCards){
    let show=(typeof state.displayTimeEnabled==='boolean')?state.displayTimeEnabled:true;
    let rate=(typeof state.minutesPerAction==='number')?state.minutesPerAction:DEFAULT_RATE_MIN;
    const list=Array.isArray(storyCards)?storyCards:[]; const idx=findTimeCardIndex(list);
    const card=(idx>=0)?list[idx]:null; const raw=card?(typeof card.entry==='string'?card.entry:(typeof card.value==='string'?card.value:'')):'';
    if(raw){ show=parseBoolLine(raw,'Display Time',show); rate=parseNumberLine(raw,'Minutes per action',rate); }
    state.displayTimeEnabled=show; state.minutesPerAction=rate; return {show,rate};
  }
  function applyManualFromCard(state,storyCards){
    try{
      const list=Array.isArray(storyCards)?storyCards:[]; const idx=findTimeCardIndex(list);
      if(idx<0) return false; const card=list[idx];
      const txt=(typeof card.entry==='string')?card.entry:(typeof card.value==='string'?card.value:''); if(!txt) return false;
      const tm=/Time:\s*(\d{1,2}):(\d{2})/i.exec(txt), dy=/Day\s*#:\s*(\d+)/i.exec(txt);
      const beforeMin=state.clockMinutes, beforeDay=state.dayNumber; let changed=false, afterMin=beforeMin, afterDay=beforeDay;
      if(tm){ const hh=+tm[1], mm=+tm[2]; const mins=(Number.isNaN(hh)||Number.isNaN(mm))?null:(hh*60+mm); if(mins!=null&&mins!==state.clockMinutes){afterMin=mins; changed=true;} }
      if(dy){ const d=+dy[1]; if(!Number.isNaN(d)&&d!==state.dayNumber){afterDay=d; changed=true;} }
      if(changed){
        state.clockMinutes=afterMin; state.dayNumber=afterDay;
        state._manualPending=true; state._manualJump={fromMin:beforeMin,fromDay:beforeDay,toMin:afterMin,toDay:afterDay};
      }
      return changed;
    }catch{ return false; }
  }

  // ---------- intent ----------
  function maybeSleepCommand(state,text){
    try{
      const re=/\b(sleep|nap|rest)\s+(till|until)\s+(next\s+)?(morning|day)\b/i; const m=re.exec(text||'');
      if(!m) return {text, slept:false};
      const bM=state.clockMinutes, bD=state.dayNumber;
      state.dayNumber=(state.dayNumber||1)+1; state.clockMinutes=8*60;
      state._manualPending=true; state._manualJump={fromMin:bM,fromDay:bD,toMin:state.clockMinutes,toDay:state.dayNumber};
      const stripped=(text||'').replace(re,'').trim();
      return {text: stripped.length?stripped:"You go to sleep.", slept:true};
    }catch{ return {text, slept:false}; }
  }

  // ---------- turns ----------
  function handlePlayerInputTurn(state,info){
    init(state);
    const tid=getTurnId(info,state);
    if(tid<=state._dtt.lastInputSeen) return {tid,ticked:false,reason:'dup-input'};
    if(state._manualPending){
      const j=state._manualJump||null;
      state._dtt.history[tid]={after:state.clockMinutes,day:state.dayNumber,reason:'manual',jump:j};
      state._dtt.lastSeen=Math.max(state._dtt.lastSeen,tid); state._dtt.lastInputSeen=tid; state._manualPending=false;
      return {tid,ticked:false,reason:'manual',jump:j};
    }
    const span=addMinutes(state,state.minutesPerAction);
    state._dtt.history[tid]={after:state.clockMinutes,day:state.dayNumber,reason:'advance-input'};
    state._dtt.lastSeen=Math.max(state._dtt.lastSeen,tid); state._dtt.lastInputSeen=tid;
    return {tid,ticked:true,reason:'advance-input',added:state.minutesPerAction,before:span.before,after:span.after};
  }

  // >>> patched to block the “first retry moves time” case
  function handleViewTurn(state,info){
    init(state);
    const tid=getTurnId(info,state);
    const last=state._dtt.lastSeen;

    if(state._manualPending){
      const j=state._manualJump||null;
      state._dtt.history[tid]={after:state.clockMinutes,day:state.dayNumber,reason:'manual',jump:j};
      state._dtt.lastSeen=Math.max(state._dtt.lastSeen,tid); state._manualPending=false;
      return {tid,ticked:false,reason:'manual',jump:j};
    }

    if(tid<last){
      state._suppressNextAdvance=true;
      if(state._dtt&&state._dtt.history){ Object.keys(state._dtt.history).forEach(k=>{ if(+k>tid) delete state._dtt.history[k]; }); }
      state._dtt.lastSeen=tid;
      return {tid,ticked:false,reason:'rewind'};
    }

    if(tid===last){
      return {tid,ticked:false,reason:'same'};
    }

    // New view turn. If previous turn advanced on INPUT, treat this as a retry and suppress once.
    const lastSnap=state._dtt.history[last]||null;
    if(lastSnap && lastSnap.reason==='advance-input' && !state._dtt.history[tid]){
      state._dtt.history[tid]={after:state.clockMinutes,day:state.dayNumber,reason:'retry-after-input'};
      state._dtt.lastSeen=tid;
      return {tid,ticked:false,reason:'retry-after-input'};
    }

    if(state._suppressNextAdvance){
      state._suppressNextAdvance=false;
      state._dtt.history[tid]={after:state.clockMinutes,day:state.dayNumber,reason:'retry-suppress'};
      state._dtt.lastSeen=tid;
      return {tid,ticked:false,reason:'retry-suppress'};
    }

    const span=addMinutes(state,state.minutesPerAction);
    state._dtt.history[tid]={after:state.clockMinutes,day:state.dayNumber,reason:'advance-continue'};
    state._dtt.lastSeen=tid;
    return {tid,ticked:true,reason:'advance-continue',added:state.minutesPerAction,before:span.before,after:span.after};
  }

  // ---------- public API ----------
  function TLInput(text, s=globalThis.state, i=globalThis.info, sc=globalThis.storyCards){
    init(s);
    const settings=readSettings(s,sc);
    const sleepRes=maybeSleepCommand(s,text); text=sleepRes.text;
    applyManualFromCard(s,sc);
    handlePlayerInputTurn(s,i);
    const d=display(s);
    ensureTimeCard(s,sc,settings.show?'true':'false',s.minutesPerAction,d);
    // no input header
    return { text };
  }

  function TLContext(text, s=globalThis.state, i=globalThis.info, sc=globalThis.storyCards){
    init(s);
    const settings=readSettings(s,sc);
    applyManualFromCard(s,sc);
    try{
      const tid=getTurnId(i,s), last=(s._dtt&&typeof s._dtt.lastSeen==='number')?s._dtt.lastSeen:-1;
      if(tid<last){
        s._suppressNextAdvance=true;
        if(s._dtt&&s._dtt.history){ Object.keys(s._dtt.history).forEach(k=>{ if(+k>tid) delete s._dtt.history[k]; }); }
      }
    }catch{}
    const d=display(s);
    ensureTimeCard(s,sc,settings.show?'true':'false',s.minutesPerAction,d);
    return { text };
  }

  // Always show footer on Output if Display Time is true; advancing is controlled by handleViewTurn
  function TLOutput(text, s=globalThis.state, i=globalThis.info, sc=globalThis.storyCards){
    init(s);
    const settings=readSettings(s,sc);
    applyManualFromCard(s,sc);
    handleViewTurn(s,i); // decides whether time advances; we show footer regardless
    const d=display(s);
    ensureTimeCard(s,sc,(s.displayTimeEnabled?'true':'false'),s.minutesPerAction,d);
    if(settings.show){
      return { text: `${text}\n\n[Time: ${d.timeStr} (${d.phase}), Day #: ${d.dayNum}]` };
    }
    return { text };
  }

  // export
  globalThis.TLInput   = TLInput;
  globalThis.TLContext = TLContext;
  globalThis.TLOutput  = TLOutput;
  globalThis.DTT = { VERSION, TLInput, TLContext, TLOutput };
})();
