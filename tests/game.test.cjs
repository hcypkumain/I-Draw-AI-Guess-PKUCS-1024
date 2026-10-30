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
test('each enabled prompt carries a calibrated confidence bar that only accepts very close drawings', () => {
  const answerConfig = embedded('embeddedAnswerRules'), policy = Answers.create(classes, answerConfig);
  const enabled = config.questions.filter(q => q.enabled !== false);
  assert.equal(Object.keys(answerConfig.promptConfidence).length, enabled.length);
  for (const question of enabled) {
    const bar = answerConfig.promptConfidence[question.key];
    assert.ok(bar >= answerConfig.minimumConfidence && bar <= 1, question.key);
    assert.equal(policy.thresholdFor(question.key), bar);
    // Just below the prompt's own bar must fail even for the exact class.
    assert.equal(policy.assess(question.key, {key: question.key, confidence: bar - 1e-4}).accepted, false, question.key);
    assert.equal(policy.assess(question.key, {key: question.key, confidence: bar}).accepted, true, question.key);
  }
  // The old flat 22% bar must no longer pass a typical prompt.
  const median = Object.values(answerConfig.promptConfidence).sort((a,b)=>a-b)[Math.floor(enabled.length/2)];
  assert.ok(median > .9, 'median bar should demand a close match, got ' + median);
  for (const key of ['square','circle','line'])
    assert.equal(config.questions.find(q=>q.key===key).enabled, false, key + ' is unrecognisable and must stay paused');
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
test('345 metadata entries produce 186 easy, 50 selected hard, and 109 paused prompts', () => {
  const deck = Questions.create(classes, config);
  assert.equal(config.questions.length,345);assert.equal(deck.count('easy'),186);assert.equal(deck.count('hard'),50);assert.equal(deck.pausedCount(),109);
  for(const key of ['calculator','piano','palm_tree','camera','cactus','washing_machine']){const q=config.questions.find(q=>q.key===key);assert.equal(q.level,'easy');assert.equal(q.enabled,true);}
  for(const key of ['ant','crocodile','spider','lobster','keyboard','dragon','animal_migration','camouflage','The_Mona_Lisa','aircraft_carrier'])assert.equal(config.questions.find(q=>q.key===key).enabled,false);
  for(const q of config.questions.filter(q=>!q.enabled))assert.ok(q.reviewReason);
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
      const expected=config.questions.filter(q=>q.enabled&&q.level===level).map(q=>q.key).sort();
      const recent=[];
      for(let cycle=0;cycle<5;cycle++){
        const actual=[];
        for(let i=0;i<expected.length;i++){
          if(i%17===0)deck=Questions.create(classes,config,{storage,random:random(seed+i+cycle)});
          const [key]=deck.next(level);assert.ok(!recent.includes(key));recent.push(key);if(recent.length>4)recent.shift();actual.push(key);
        }
        assert.deepEqual(actual.sort(),expected);
      }
    }
  }
});
test('old decks and later enable/disable changes cannot reintroduce paused prompts', () => {
  const storage=store(), old=clone(config);old.version=1;for(const q of old.questions){q.enabled=true;delete q.reviewReason;}
  const oldDeck=Questions.create(classes,old,{storage,random:random(3)});oldDeck.next('easy');oldDeck.next('hard');
  let deck=Questions.create(classes,config,{storage,random:random(4)});
  for(let i=0;i<700;i++){const [key]=deck.next(i%2?'easy':'hard');assert.ok(config.questions.find(q=>q.key===key).enabled);}
  const changed=clone(config);changed.questions.find(q=>q.key==='calculator').enabled=false;changed.questions.find(q=>q.key==='calculator').reviewReason='Recheck';
  deck=Questions.create(classes,changed,{storage,random:random(8)});
  for(let i=0;i<deck.count('easy')*2;i++)assert.notEqual(deck.next('easy')[0],'calculator');
});
test('unavailable storage retains an in-memory deck',()=>{
  const deck=Questions.create(classes,config,{storage:{getItem(){throw Error('blocked');}},random:random(1)});
  assert.equal(deck.persistent(),false);const seen=new Set();for(let i=0;i<186;i++)seen.add(deck.next('easy')[0]);assert.equal(seen.size,186);
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
  const model={predict(){predictionCalls++;return {async data(){const p=new Float32Array(345);p[classes.indexOf(predicted)]=confidence;return p;},dispose(){}};}};
  const context={console,performance:{now:()=>now},Uint8Array,Float32Array,Number,Date,Math,Object,Map,Set,JSON,atob:x=>Buffer.from(x,'base64').toString('binary'),
    document:{getElementById:id=>nodes.get(id),querySelectorAll:()=>[nodes.get('easyButton'),nodes.get('hardButton')],createElement:()=>new Element(),createTextNode:x=>x,addEventListener(){}},
    tf:{async setBackend(){},async ready(){},io:{fromMemory:x=>x},async loadLayersModel(){return model;},zeros:tensor,tensor4d:tensor},
    ResizeObserver:class{observe(){}},Image:class{},CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail;}},
    setInterval:(fn,ms)=>timer(fn,ms,true),setTimeout:(fn,ms)=>timer(fn,ms,false),clearInterval:id=>timers.delete(id),clearTimeout:id=>timers.delete(id),
    scrollTo(){},localStorage:store(),dispatchEvent:event=>events.push(event)};
  context.window=context;vm.createContext(context);
  for(const name of ['QuickDrawAnswers','QuickDrawQuestions','QuickDrawRoundClock','QuickDrawInkGate'])vm.runInContext(scripts.find(s=>s.includes('root.'+name+' = factory()')),context);
  vm.runInContext(scripts[scripts.length-1],context);
  const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};await flush();
  function advance(ms){const end=now+ms;while(true){const due=[...timers.entries()].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!due)break;now=due[1].at;if(due[1].repeat)due[1].at+=due[1].ms;else timers.delete(due[0]);due[1].fn();}now=end;}
  const pointer=(type,x=50,y=50)=>nodes.get('drawCanvas').handlers[type]?.({pointerId:1,pointerType:'mouse',button:0,clientX:x,clientY:y,preventDefault(){}});
  return {nodes,context,events,advance,flush,pointer,setPrediction:(key,p=.95)=>{predicted=key;confidence=p;},click:id=>nodes.get(id).onclick(),now:()=>now,predictionCalls:()=>predictionCalls};
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
  assert.equal(state.easy.remaining.length,185);assert.equal(state.easy.recent.length,1);assert.equal(state.hard.remaining.length,0);
});
test('actual scoring controller grants 1 easy stamp and 2 hard stamps',async()=>{
  for(const [level,expected] of [['easy','1'],['hard','2']]){
    const a=await app();if(level==='hard')a.click('hardButton');a.click('startButton');
    for(let round=0;round<2;round++){
      const zh=a.nodes.get('targetName').textContent;
      const names=Object.fromEntries(html.match(/const names = `([^`]+)`/)[1].split('|').map(x=>x.split('=')));Object.assign(names,embedded('embeddedAnswerRules').labelOverrides);
      const key=classes.find(k=>names[k]===zh);assert.ok(key);a.setPrediction(key,1);
      for(let stroke=0;stroke<(level==='hard'?5:1);stroke++){
        a.pointer('pointerdown',100,100+stroke*35);a.pointer('pointermove',200,200+stroke*35);a.pointer('pointermove',300,100+stroke*35);a.pointer('pointerup');
      }
      a.advance(500);await a.flush();assert.equal(a.nodes.get('roundMessage').textContent,'我猜到了！');a.advance(1100);
    }
    assert.equal(a.nodes.get('earnedCount').textContent,expected);assert.equal(a.nodes.get('resultScreen').hidden,false);
  }
});

test('a loose match that used to win now times out instead of scoring',async()=>{
  const a=await app();a.click('startButton');
  const names=Object.fromEntries(html.match(/const names = `([^`]+)`/)[1].split('|').map(x=>x.split('=')));
  Object.assign(names,embedded('embeddedAnswerRules').labelOverrides);
  const key=classes.find(k=>names[k]===a.nodes.get('targetName').textContent);
  // The correct class at the former 22% bar must no longer finish the round.
  a.setPrediction(key,.25);
  a.pointer('pointerdown',100,100);a.pointer('pointermove',200,200);a.pointer('pointermove',300,100);a.pointer('pointerup');
  a.advance(500);await a.flush();
  assert.equal(a.nodes.get('roundOverlay').hidden,true);
  assert.match(a.nodes.get('guessText').textContent,/我猜/);
  a.advance(23000);assert.equal(a.nodes.get('roundMessage').textContent,'这次还差一点');
});

test('hard mode draws the fifty reviewed prompts and excludes quick outline examples', () => {
  const expected=["cow","horse","angel","flamingo","campfire","house_plant","harp","guitar","penguin","bridge","bus","crab","school_bus","train","dresser","tractor","bee","lighthouse","chandelier","bicycle","sink","stereo","owl","giraffe","elephant","parachute","kangaroo","tennis_racquet","lion","syringe","stove","scorpion","sea_turtle","bulldozer","cannon","zebra","windmill","speedboat","fireplace","barn","helicopter","mermaid","squirrel","monkey","ambulance","parrot","hedgehog","calendar","passport","church"].sort();
  const actual=config.questions.filter(q=>q.enabled&&q.level==='hard').map(q=>q.key).sort();
  assert.deepEqual(actual,expected);
  assert.equal(config.hardMinimumStrokes,5);
  for(const key of ['palm_tree','aircraft_carrier','calculator','piano','camera','cactus','megaphone','octagon'])assert.ok(!actual.includes(key));
  for(const key of actual){const q=config.questions.find(q=>q.key===key);assert.equal(q.expandedScreen.sampleCount,32);assert.ok(q.expandedScreen.medianTotalStrokes>=5);}
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
test('hard inference is never called before the fifth meaningful stroke is released',async()=>{
  const a=await app();a.click('hardButton');a.click('startButton');const before=a.predictionCalls();
  for(let i=0;i<4;i++){inkLine(a,i);a.advance(500);await a.flush();assert.equal(a.predictionCalls(),before);}
  assert.match(a.nodes.get('guessNote').textContent,/4 \/ 5/);
  inkLine(a,4,false);a.advance(500);await a.flush();assert.equal(a.predictionCalls(),before);
  a.pointer('pointerup');a.advance(500);await a.flush();assert.equal(a.predictionCalls(),before+1);
});
test('dots cannot open hard analysis, and undo/clear reduce the required ink progress',async()=>{
  const a=await app();a.click('hardButton');a.click('startButton');const before=a.predictionCalls();
  for(let i=0;i<8;i++){a.pointer('pointerdown');a.pointer('pointerup');}
  a.advance(500);await a.flush();assert.equal(a.predictionCalls(),before);assert.match(a.nodes.get('guessNote').textContent,/0 \/ 5/);
  for(let i=0;i<5;i++)inkLine(a,i);a.advance(500);await a.flush();assert.equal(a.predictionCalls(),before+1);
  a.click('undoButton');assert.match(a.nodes.get('guessNote').textContent,/4 \/ 5/);
  a.advance(500);await a.flush();assert.equal(a.predictionCalls(),before+1);
  a.click('clearButton');assert.match(a.nodes.get('guessNote').textContent,/0 \/ 5/);
});
test('easy and free practice still infer with one stroke, including practice after selecting hard',async()=>{
  for(const mode of ['easy','practice']){
    const a=await app();if(mode==='practice')a.click('hardButton');a.click(mode==='practice'?'practiceButton':'startButton');
    const before=a.predictionCalls();inkLine(a,0);a.advance(500);await a.flush();assert.equal(a.predictionCalls(),before+1);
  }
});
