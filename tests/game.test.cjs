const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const embedded = id => JSON.parse(html.match(new RegExp('<script id="' + id + '"[^>]*>([\\s\\S]*?)</script>'))[1]);
const classes = embedded('embeddedClasses'), config = embedded('embeddedQuestions');
function moduleFor(name) {
  const context = {module: {exports: {}}};
  vm.runInNewContext(scripts.find(s => s.includes('root.' + name + ' = factory()')), context);
  return context.module.exports;
}
const Questions = moduleFor('QuickDrawQuestions'), Answers = moduleFor('QuickDrawAnswers'), Clock = moduleFor('QuickDrawRoundClock');
const Ink = moduleFor('QuickDrawInkGate');
const clone = x => JSON.parse(JSON.stringify(x));
const store = () => {const data = new Map();return {getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v),data};};
function random(seed) {return () => ((seed = Math.imul(seed, 1664525) + 1013904223 >>> 0) / 4294967296);}

test('model and answer rules retain their original semantics', () => {
  assert.equal(classes.length, 345);assert.equal(new Set(classes).size, 345);
  const weights = Buffer.from(html.match(/<script id="embeddedWeights"[^>]*>([\s\S]*?)<\/script>/)[1].trim(), 'base64');
  assert.equal(crypto.createHash('sha256').update(weights).digest('hex'), '91111f7bb89a7c41983e75d53f33c26b997d77d08a5c2801cbf51f07c443df83');
  const answerConfig = embedded('embeddedAnswerRules'), policy = Answers.create(classes, answerConfig);
  assert.equal(answerConfig.minimumConfidence, .22);
  for (const target of classes) for (const key of classes) {
    const expected = target === key || answerConfig.rules.some(r => r.target === target && r.accept.includes(key));
    // A confidence above every calibrated bar must still respect the compatibility table.
    assert.equal(policy.assess(target, {key,confidence:1}).accepted, expected);
    assert.equal(policy.assess(target, {key,confidence:.219}).accepted, false);
  }
});
test('each prompt carries a calibrated bar that only accepts very close drawings', () => {
  const answerConfig = embedded('embeddedAnswerRules'), policy = Answers.create(classes, answerConfig);
  const enabled = config.questions.filter(q => q.enabled !== false);
  assert.equal(Object.keys(answerConfig.promptConfidence).length, enabled.length);
  assert.ok(!('pairConfidence' in answerConfig), 'pair bars are gone with single-object prompts');
  for (const question of enabled) {
    const bar = answerConfig.promptConfidence[question.key];
    assert.ok(bar !== undefined, question.key);
    assert.ok(bar >= answerConfig.minimumConfidence && bar <= 1, question.key);
    assert.equal(policy.thresholdFor(question.key), bar);
    // Just below the prompt's own bar must fail even for the exact class.
    assert.equal(policy.assess(question.key, {key: question.key, confidence: bar - 1e-4}).accepted, false, question.key);
    assert.equal(policy.assess(question.key, {key: question.key, confidence: bar}).accepted, true, question.key);
  }
  // The old flat 22% bar must no longer pass a typical prompt.
  const bars = enabled.map(q => answerConfig.promptConfidence[q.key]).sort((a,b)=>a-b);
  const median = bars[Math.floor(bars.length/2)];
  assert.ok(median > .9, 'median bar should demand a close match, got ' + median);
  assert.ok(bars[0] > answerConfig.minimumConfidence, 'no prompt may sit on the global floor');
  // Classes the model essentially never returns stay out, since no bar can make them fair.
  for (const key of ['square','circle','pond'])
    assert.equal(config.questions.find(q=>q.key===key).enabled, false, key);
});
test('prompt bars below the floor or above one are rejected', () => {
  const answerConfig = embedded('embeddedAnswerRules');
  for (const bad of [.21, 1.01, 0, -1]) {
    const broken = {...answerConfig, promptConfidence: {...answerConfig.promptConfidence, apple: bad}};
    assert.throws(() => Answers.create(classes, broken), /Invalid prompt threshold/);
  }
  const unknown = {...answerConfig, promptConfidence: {...answerConfig.promptConfidence, not_a_class: .9}};
  assert.throws(() => Answers.create(classes, unknown), /Unknown answer class/);
});
test('both levels draw one object and differ only in how many prompts must pass', () => {
  assert.equal(config.pairObjects, 1);
  assert.deepEqual(config.objectsNeeded, {easy: 1, hard: 1});
  // Single-object prompts are guessed from the first stroke, with no ink gate.
  assert.equal(config.singleMinimumStrokes, 0);
  assert.ok(!('pairMinimumStrokes' in config));
});
test('both levels share one pool of 342 calibrated objects', () => {
  const deck = Questions.create(classes, config);
  assert.equal(config.questions.length,345);
  const enabled = config.questions.filter(q=>q.enabled!==false);
  assert.equal(enabled.length,342);
  // The shared pool means both levels report the same bank.
  assert.equal(deck.count('easy'),342);
  assert.equal(deck.count('hard'),342);
  assert.equal(deck.pausedCount(),345-342);
  // Membership now comes from the two-object screening, not the old per-level lists.
  for(const q of config.questions.filter(q=>!q.enabled))assert.ok(q.reviewReason,q.key);
  for(const q of enabled)assert.ok(q.pinyin,q.key);
});
test('the shared deck serves the same objects to either level', () => {
  const storage=store();
  const easy=Questions.create(classes,config,{storage,random:random(5)});
  const [first]=easy.next('easy');
  const hard=Questions.create(classes,config,{storage,random:random(5)});
  const [second]=hard.next('hard');
  // A prompt consumed as easy must not come back immediately as hard.
  for(const key of second)assert.ok(!first.includes(key));
});
test('invalid flags, missing pause reasons and missing metadata fail validation', () => {
  let c=clone(config);c.questions[0].enabled='no';assert.throws(()=>Questions.create(classes,c),/Invalid question/);
  c=clone(config);c.questions.find(q=>!q.enabled).reviewReason='';assert.throws(()=>Questions.create(classes,c),/Invalid question/);
  c=clone(config);c.questions.pop();assert.throws(()=>Questions.create(classes,c),/Incomplete/);
});
test('each enabled prompt appears once per cycle, never paused, with four-question boundary protection', () => {
  for(let seed=1;seed<=20;seed++) {
    const storage=store();let deck=Questions.create(classes,config,{storage,random:random(seed)});
    for(const level of ['easy','hard']){
      const expected=config.questions.filter(q=>q.enabled!==false).map(q=>q.key).sort();
      const perDraw=config.pairObjects;
      const draws=Math.floor(expected.length/perDraw);
      const seen=[];
      for(let cycle=0;cycle<5;cycle++){
        for(let i=0;i<draws;i++){
          if(i%17===0)deck=Questions.create(classes,config,{storage,random:random(seed+i+cycle)});
          const [keys]=deck.next(level);
          assert.equal(keys.length,perDraw);
          assert.equal(new Set(keys).size,keys.length);
          for(const key of keys){assert.ok(expected.includes(key));seen.push(key);}
        }
      }
      // Over five cycles every object in the shared pool must appear.
      const counts=new Map();
      for(const key of seen)counts.set(key,(counts.get(key)||0)+1);
      assert.equal(counts.size,expected.length);
    }
  }
});
test('old decks and later enable/disable changes cannot reintroduce paused prompts', () => {
  const storage=store(), old=clone(config);old.version=1;for(const q of old.questions){q.enabled=true;delete q.reviewReason;}
  const oldDeck=Questions.create(classes,old,{storage,random:random(3)});oldDeck.next('easy');oldDeck.next('hard');
  let deck=Questions.create(classes,config,{storage,random:random(4)});
  for(let i=0;i<700;i++){const [keys]=deck.next(i%2?'easy':'hard');for(const key of keys)assert.ok(config.questions.find(q=>q.key===key).enabled);}
  const changed=clone(config);changed.questions.find(q=>q.key==='calculator').enabled=false;changed.questions.find(q=>q.key==='calculator').reviewReason='Recheck';
  deck=Questions.create(classes,changed,{storage,random:random(8)});
  for(let i=0;i<deck.count('easy')*2;i++)assert.ok(!deck.next('easy')[0].includes('calculator'));
});
test('unavailable storage retains an in-memory deck',()=>{
  const deck=Questions.create(classes,config,{storage:{getItem(){throw Error('blocked');}},random:random(1)});
  const pool=config.questions.filter(q=>q.enabled!==false).length;
  assert.equal(deck.persistent(),false);
  const seen=new Set();
  for(let i=0;i<pool;i++)for(const key of deck.next('easy')[0])seen.add(key);
  assert.equal(seen.size,pool);
});
test('clock grants three preparation seconds then twenty drawing seconds',()=>{
  let now=100;const c=Clock.create({now:()=>now});c.start();assert.equal(c.read().phase,'preparing');assert.equal(c.read().secondsLeft,3);
  now=3099;assert.equal(c.read().secondsLeft,1);now=3100;assert.equal(c.read().phase,'drawing');assert.equal(c.read().secondsLeft,20);
  now=23099;assert.equal(c.read().secondsLeft,1);now=23100;assert.equal(c.read().phase,'expired');assert.equal(c.firstStroke(),false);
});
test('an early first stroke starts twenty seconds immediately; later strokes cannot restart it',()=>{
  let now=0;const c=Clock.create({now:()=>now});c.start();now=1250;assert.equal(c.firstStroke(),true);assert.equal(c.read().secondsLeft,20);
  now=7250;c.firstStroke();assert.equal(c.read().secondsLeft,14);assert.equal(c.read().firstStrokeDelayMs,1250);
  now=21250;assert.equal(c.read().phase,'expired');c.start();assert.equal(c.read().phase,'preparing');assert.equal(c.read().firstStrokeDelayMs,null);
});
test('delayed callbacks and late first strokes do not extend the automatic deadline',()=>{
  let now=0;const c=Clock.create({now:()=>now});c.start();now=12000;assert.equal(c.read().secondsLeft,11);c.firstStroke();assert.equal(c.read().secondsLeft,11);
  now=23000;assert.equal(c.read().phase,'expired');assert.equal(c.read().drawingElapsedMs,20000);
});

// Execute the actual page controller with a small DOM, deterministic clock and controlled model output.
// This verifies state transitions and scoring; model accuracy is checked separately in the browser.
async function app() {
  let now=0,nextTimer=1,predicted='sun',confidence=.95,predictionCalls=0;
  const timers=new Map(),nodes=new Map(),events=[];
  class Element {
    constructor(id=''){this.id=id;this.children=[];this.textContent='';this.innerHTML='';this.hidden=false;this.disabled=false;this.attributes={};this.dataset={};this.style={};this.handlers={};this.width=1000;this.height=700;this.parentElement=this;this.classes=new Set();this.className='';this.classList={toggle:(key,on)=>{if(on)this.classes.add(key);else this.classes.delete(key);},contains:key=>this.classes.has(key)};}
    setAttribute(k,v){this.attributes[k]=v;}append(...items){this.children.push(...items);}replaceChildren(...items){this.children=items;}
    addEventListener(k,fn){this.handlers[k]=fn;}getBoundingClientRect(){return {left:0,top:0,width:1000,height:700};}
    getContext(){return {fillRect(){},beginPath(){},arc(){},fill(){},stroke(){},moveTo(){},lineTo(){},drawImage(){},getImageData(){return {data:new Uint8ClampedArray(28*28*4)};}};}
    setPointerCapture(){}hasPointerCapture(){return false;}releasePointerCapture(){}toDataURL(){return 'data:image/png;base64,AA==';}
    showModal(){this.open=true;}close(){this.open=false;}
  }
  for(const match of html.matchAll(/<[^>]*\bid="([^"]+)"[^>]*>/g)){const e=new Element(match[1]);e.hidden=/\bhidden\b/.test(match[0]);nodes.set(e.id,e);}
  for(const [id,e] of nodes)if(id.startsWith('embedded'))e.textContent=html.match(new RegExp('<script id="'+id+'"[^>]*>([\\s\\S]*?)</script>'))[1];
  nodes.get('roundDots').children=[new Element(),new Element()];nodes.get('easyButton').dataset.level='easy';nodes.get('hardButton').dataset.level='hard';
  const timer=(fn,ms,repeat)=>{const id=nextTimer++;timers.set(id,{fn,ms,repeat,at:now+ms});return id;};
  const tensor=()=>({dispose(){}});
  // A multi-object prompt classifies one stroke cluster at a time, so the stub answers per call.
  let queued=null;
  const model={predict(){
    predictionCalls++;
    const key=queued&&queued.length?queued.shift():predicted;
    return {async data(){const p=new Float32Array(345);p[classes.indexOf(key)]=confidence;return p;},dispose(){}};
  }};
  const context={console,performance:{now:()=>now},Uint8Array,Float32Array,Number,Date,Math,Object,Map,Set,JSON,atob:x=>Buffer.from(x,'base64').toString('binary'),
    document:{getElementById:id=>nodes.get(id),querySelectorAll:()=>[nodes.get('easyButton'),nodes.get('hardButton')],createElement:()=>new Element(),createTextNode:x=>x,addEventListener(){}},
    tf:{async setBackend(){},async ready(){},io:{fromMemory:x=>x},async loadLayersModel(){return model;},zeros:tensor,tensor4d:tensor},
    ResizeObserver:class{observe(){}},Image:class{},CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail;}},
    setInterval:(fn,ms)=>timer(fn,ms,true),setTimeout:(fn,ms)=>timer(fn,ms,false),clearInterval:id=>timers.delete(id),clearTimeout:id=>timers.delete(id),
    scrollTo(){},localStorage:store(),dispatchEvent:event=>events.push(event)};
  context.window=context;vm.createContext(context);
  for(const name of ['QuickDrawAnswers','QuickDrawQuestions','QuickDrawRoundClock','QuickDrawInkGate','QuickDrawStrokeGroups'])vm.runInContext(scripts.find(s=>s.includes('root.'+name+' = factory()')),context);
  vm.runInContext(scripts[scripts.length-1],context);
  const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};await flush();
  function advance(ms){const end=now+ms;while(true){const due=[...timers.entries()].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!due)break;now=due[1].at;if(due[1].repeat)due[1].at+=due[1].ms;else timers.delete(due[0]);due[1].fn();}now=end;}
  const pointer=(type,x=50,y=50)=>nodes.get('drawCanvas').handlers[type]?.({pointerId:1,pointerType:'mouse',button:0,clientX:x,clientY:y,preventDefault(){}});
  return {nodes,context,events,advance,flush,pointer,setPrediction:(key,p=.95)=>{predicted=key;confidence=p;queued=null;},
    queuePredictions:(keys,p=1)=>{queued=keys.slice();confidence=p;},
    click:id=>nodes.get(id).onclick(),now:()=>now,predictionCalls:()=>predictionCalls};
}
test('page controller starts on ink and clear/undo cannot renew drawing time',async()=>{
  const a=await app();a.click('startButton');assert.equal(a.nodes.get('seconds').textContent,'3');
  a.advance(1000);a.pointer('pointerdown');a.pointer('pointerup');assert.equal(a.nodes.get('seconds').textContent,'20');
  a.advance(5000);a.click('clearButton');a.click('undoButton');a.pointer('pointerdown');a.pointer('pointerup');
  assert.equal(a.nodes.get('seconds').textContent,'15');a.advance(15000);assert.equal(a.nodes.get('roundOverlay').hidden,false);
  a.advance(1100);assert.equal(a.nodes.get('roundTitle').textContent,'第 2 / 2 题');assert.equal(a.nodes.get('seconds').textContent,'3');
});
test('two blank rounds expire after at most 23 seconds each and award zero',async()=>{
  const a=await app();a.click('startButton');a.advance(3000);assert.equal(a.nodes.get('seconds').textContent,'20');
  a.advance(20000);assert.equal(a.nodes.get('roundOverlay').hidden,false);a.advance(1100);a.advance(23000);a.advance(1100);
  assert.equal(a.nodes.get('resultScreen').hidden,false);assert.equal(a.nodes.get('earnedCount').textContent,'0');
});
test('practice stays untimed and consumes no formal questions',async()=>{
  const a=await app();a.click('practiceButton');a.advance(100000);assert.equal(a.nodes.get('seconds').textContent,'∞');
  a.pointer('pointerdown');a.pointer('pointerup');a.click('clearButton');assert.equal(a.context.localStorage.data.size,0);
  a.click('exitButton');assert.equal(a.nodes.get('homeScreen').hidden,false);
});
test('exiting during preparation consumes only the prompt already shown',async()=>{
  const a=await app();a.click('startButton');a.click('exitButton');a.click('confirmExit');a.advance(100000);
  assert.equal(a.nodes.get('homeScreen').hidden,false);const state=JSON.parse(a.context.localStorage.getItem('quickdraw-1024-deck-v1'));
  // One prompt was shown, consuming pairObjects entries from the shared pool.
  const pool=config.questions.filter(q=>q.enabled!==false).length;
  assert.equal(state.shared.remaining.length,pool-config.pairObjects);
  assert.equal(state.shared.recent.length,config.pairObjects);
});
const labelMap=()=>{
  const names=Object.fromEntries(html.match(/const names = `([^`]+)`/)[1].split('|').map(x=>x.split('=')));
  Object.assign(names,embedded('embeddedAnswerRules').labelOverrides);
  return names;
};
// Reads the prompt back as model keys, splitting a multi-object prompt on the joining word.
function promptKeys(a){
  const names=labelMap();
  return a.nodes.get('targetName').textContent.split('和').map(zh=>classes.find(k=>names[k]===zh));
}
// Draws one object as a cluster of lines inside a slot, far from the other slot.
function drawObject(a,slot,lines){
  const x=slot==='left'?60:620;
  for(let i=0;i<lines;i++){
    a.pointer('pointerdown',x,80+i*30);a.pointer('pointermove',x+120,110+i*30);a.pointer('pointermove',x+240,80+i*30);a.pointer('pointerup');
  }
}
// One object per prompt, so a single cluster of lines is enough.
function drawOne(a,key){
  a.setPrediction(key,1);
  drawObject(a,'left',2);
}
test('actual scoring controller grants 1 easy stamp and 2 hard stamps',async()=>{
  for(const [level,expected] of [['easy','1'],['hard','2']]){
    const a=await app();if(level==='hard')a.click('hardButton');a.click('startButton');
    for(let round=0;round<2;round++){
      const keys=promptKeys(a);
      assert.equal(keys.length,1,level);
      assert.ok(keys[0]);
      drawOne(a,keys[0]);
      a.advance(500);await a.flush();assert.equal(a.nodes.get('roundMessage').textContent,'我猜到了！',level);a.advance(1100);
    }
    assert.equal(a.nodes.get('earnedCount').textContent,expected);assert.equal(a.nodes.get('resultScreen').hidden,false);
  }
});
test('both levels name a single object, with no joining word',async()=>{
  for(const level of ['easy','hard']){
    const a=await app();if(level==='hard')a.click('hardButton');a.click('startButton');
    assert.equal(promptKeys(a).length,1,level);
    assert.ok(!a.nodes.get('targetName').textContent.includes('和'),level);
  }
});
test('the levels differ only in how many prompts must pass',async()=>{
  // One prompt passed, one timed out: easy earns a stamp, hard earns nothing.
  for(const [level,expected] of [['easy','1'],['hard','0']]){
    const a=await app();if(level==='hard')a.click('hardButton');a.click('startButton');
    drawOne(a,promptKeys(a)[0]);
    a.advance(500);await a.flush();
    assert.equal(a.nodes.get('roundMessage').textContent,'我猜到了！',level);
    a.advance(1100);
    a.advance(23000);a.advance(1100);
    assert.equal(a.nodes.get('earnedCount').textContent,expected,level);
  }
});
test('a wrong label never scores, however confident the model is',async()=>{
  const a=await app();a.click('startButton');
  const key=promptKeys(a)[0];
  // Pick any class that is neither the target nor one of its accepted variants.
  const answerConfig=embedded('embeddedAnswerRules');
  const variants=new Set(answerConfig.rules.filter(r=>r.target===key).flatMap(r=>r.accept));
  const other=classes.find(k=>k!==key&&!variants.has(k));
  a.setPrediction(other,1);
  drawObject(a,'left',2);
  a.advance(500);await a.flush();
  assert.equal(a.nodes.get('roundOverlay').hidden,true);
  a.advance(23000);
  assert.equal(a.nodes.get('roundMessage').textContent,'这次还差一点');
});
test('formal rounds hide the runner-up guesses, practice still shows them',async()=>{
  const a=await app();a.click('startButton');a.setPrediction(promptKeys(a)[0],.3);
  a.pointer('pointerdown',100,100);a.pointer('pointermove',200,200);a.pointer('pointermove',300,100);a.pointer('pointerup');
  a.advance(500);await a.flush();
  assert.equal(a.nodes.get('alternatives').children.length,0);
  const b=await app();b.click('practiceButton');b.setPrediction('sun',.3);
  b.pointer('pointerdown',100,100);b.pointer('pointermove',200,200);b.pointer('pointermove',300,100);b.pointer('pointerup');
  b.advance(500);await b.flush();
  assert.ok(b.nodes.get('alternatives').children.length>0);
});

test('a loose match that used to win now times out instead of scoring',async()=>{
  const a=await app();a.click('startButton');
  // The correct class at the former flat 22% bar must no longer finish the round.
  a.setPrediction(promptKeys(a)[0],.25);
  drawObject(a,'left',2);
  a.advance(500);await a.flush();
  assert.equal(a.nodes.get('roundOverlay').hidden,true);
  assert.match(a.nodes.get('guessText').textContent,/我猜/);
  a.advance(23000);assert.equal(a.nodes.get('roundMessage').textContent,'这次还差一点');
});

test('the pool keeps nearly every class and records how each bar was set', () => {
  const enabled=config.questions.filter(q=>q.enabled!==false);
  for(const q of enabled)assert.equal(q.calibration,'single-calibrated',q.key);
  // Only classes the model essentially never returns are left out.
  assert.equal(config.questions.length-enabled.length,3);
  assert.ok(enabled.length>=150,'pool should hold at least 150 objects, got '+enabled.length);
});

test('ink readiness counts completed lines and ignores taps and short marks', () => {
  const gate=Ink.create(),line=y=>[{x:0,y},{x:50,y}];
  assert.equal(gate.assess([line(0),line(1),line(2),line(3)]).ready,false);
  assert.equal(gate.assess([line(0),line(1),line(2),line(3),line(4)],true).ready,false);
  assert.equal(gate.assess([line(0),line(1),line(2),line(3),line(4)]).ready,true);
  assert.equal(gate.assess(Array.from({length:12},()=>[{x:5,y:5}])).count,0);
  assert.equal(gate.assess(Array.from({length:12},()=>[{x:5,y:5},{x:10,y:5}])).count,0);
  assert.equal(Ink.create({minimumStrokes:0}).assess([]).ready,true);
  assert.throws(()=>Ink.create({minimumStrokes:-1}),/Invalid ink/);
});

function inkLine(a,index,release=true){
  a.pointer('pointerdown',100,100+index*40);a.pointer('pointermove',200,120+index*40);a.pointer('pointermove',300,100+index*40);if(release)a.pointer('pointerup');
}
test('every mode guesses from the first stroke, with no ink gate',async()=>{
  for(const mode of ['easy','hard','practice']){
    const a=await app();
    if(mode==='hard')a.click('hardButton');
    a.click(mode==='practice'?'practiceButton':'startButton');
    const before=a.predictionCalls();
    inkLine(a,0);a.advance(500);await a.flush();
    assert.ok(a.predictionCalls()>before,mode);
  }
});
test('a drawing too small to classify is skipped without ending the round',async()=>{
  const a=await app();a.click('startButton');
  const before=a.predictionCalls();
  // Taps alone never span enough of the canvas to be classified.
  for(let i=0;i<8;i++){a.pointer('pointerdown');a.pointer('pointerup');}
  a.advance(500);await a.flush();
  assert.equal(a.predictionCalls(),before);
  assert.equal(a.nodes.get('roundOverlay').hidden,true);
});
test('undo and clear reset the guess without renewing the clock',async()=>{
  const a=await app();a.click('startButton');
  a.advance(1000);inkLine(a,0);
  a.advance(5000);
  a.click('undoButton');
  assert.match(a.nodes.get('guessText').innerHTML,/第一笔/);
  a.click('clearButton');
  assert.match(a.nodes.get('guessText').innerHTML,/第一笔/);
  assert.equal(a.nodes.get('seconds').textContent,'15');
});
