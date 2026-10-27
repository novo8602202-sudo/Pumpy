import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {blankState,eligible,generate,replacements,parseWeight,newWorkout,replaceEntry,stats,previousWeight,validateBackup} from '../dist/core.mjs';
const c=Array.from({length:8},(_,i)=>({id:String(i+1),name:'Exercise '+i,bodyPart:i<4?'Грудь':'Спина',equipment:i%2?'Гантели':'Штанга'}));
test('favorites never fall back to neutral, including empty favorites',()=>{
  for(let i=0;i<100;i++)assert.deepEqual(generate(c,{'1':'favorite','2':'disliked'},'favorites',6).map(e=>e.id),['1']);
  assert.deepEqual(generate(c,{},'favorites',6),[]);
});
test('random excludes disliked, deduplicates, respects filters and count',()=>{
  for(let i=0;i<100;i++){
    const result=generate(c,{'1':'disliked'},'random',12,'Грудь','Штанга');assert.deepEqual(result.map(e=>e.id),['3']);
    const full=generate(c,{'1':'disliked'},'random',6);assert.equal(full.length,6);assert.equal(new Set(full.map(e=>e.id)).size,6);assert.ok(!full.some(e=>e.id==='1'));
  }
});
test('new workouts have empty weights, rejected IDs removed',()=>{
  const w=newWorkout(['1','1','2','unknown'],'favorites',{'1':'favorite'},c);assert.equal(w.exercises.length,1);assert.ok(w.exercises[0].sets.every(s=>s.weight===null));assert.throws(()=>newWorkout(['2'],'favorites',{},c));
});
test('multiple muscles and equipment use OR within each filter and AND across filters',()=>{
  assert.deepEqual(eligible(c,{},'random',['Грудь','Спина'],['Гантели']).map(e=>e.id),['2','4','6','8']);
  assert.deepEqual(eligible(c,{},'random',['Грудь'],['Гантели','Штанга']).map(e=>e.id),['1','2','3','4']);
  assert.equal(eligible(c,{},'random',[],[]).length,8);
  assert.equal(eligible(c,{},'random',['Несуществующая'],['Гантели']).length,0);
  assert.deepEqual(eligible(c,{'2':'favorite','6':'disliked'},'favorites',['Грудь','Спина'],['Гантели','Штанга']).map(e=>e.id),['2']);
});
test('generated multi-filter workout covers both available muscle groups without exclusions or duplicates',()=>{
  for(let i=0;i<100;i++){
    const result=generate(c,{'2':'disliked'},'random',4,['Грудь','Спина'],['Гантели']);
    assert.deepEqual(new Set(result.map(e=>e.id)),new Set(['4','6','8']));
    assert.equal(new Set(result.map(e=>e.bodyPart)).size,2);
    assert.equal(result.length,3);
  }
});
test('replacement only resets selected exercise and respects mode',()=>{
  const choices={'1':'favorite','2':'favorite','3':'favorite','4':'disliked'};const w=newWorkout(['1','2'],'favorites',choices,c);
  w.exercises[0].sets[0].weight=82.5;w.exercises[0].sets[0].done=true;w.exercises[1].sets[1].weight=40;
  assert.deepEqual(replacements(c,choices,w,w.exercises[0]).map(e=>e.id),['3']);
  const replaced=replaceEntry(w,0,'3',c,choices);assert.equal(replaced.exercises[0].sets[0].weight,null);assert.equal(replaced.exercises[1].sets[1].weight,40);assert.equal(w.exercises[0].sets[0].weight,82.5);assert.throws(()=>replaceEntry(w,0,'4',c,choices));
});
test('decimal comma, dot, empty, manual zero; rejects invalid input',()=>{
  assert.equal(parseWeight(''),null);assert.equal(parseWeight('82,5'),82.5);assert.equal(parseWeight('82.5'),82.5);assert.equal(parseWeight('0'),0);
  for(const value of ['-1','NaN','Infinity','2001','abc','1e2','3.456'])assert.throws(()=>parseWeight(value));
});
test('history retains per-set weights; summary counts only completed sets',()=>{
  const w=newWorkout(['1'],'random',{},c);w.exercises[0].sets[0]={reps:10,weight:82.5,done:true};w.exercises[0].sets[1].weight=90;
  assert.equal(stats(w).volume,825);assert.equal(stats(w).done,1);assert.equal(previousWeight([w],'1',0),82.5);assert.equal(previousWeight([w],'2',0),null);
});
test('backup round trip preserves choices, active session and finished history',()=>{
  const s=blankState();s.onboarded=true;s.choices={'1':'favorite','2':'disliked'};s.active=newWorkout(['1'],'favorites',s.choices,c);s.active.exercises[0].sets[1].weight=82.5;
  const past=newWorkout(['3'],'random',{},c);past.finishedAt=new Date().toISOString();s.history.push(past);
  assert.deepEqual(validateBackup(JSON.parse(JSON.stringify(s)),c),s);
});
test('corrupt imports rejected',()=>{
  assert.throws(()=>validateBackup({},c));const s=blankState();s.choices={'BAD':'favorite'};assert.throws(()=>validateBackup(s,c));s.choices={};s.active=newWorkout(['1'],'random',{},c);s.active.exercises[0].sets[0].weight=-10;assert.throws(()=>validateBackup(s,c));
});
test('catalog includes 1324 unique complete records',async()=>{
  const all=JSON.parse(await readFile(new URL('../dist/exercises.json',import.meta.url),'utf8'));assert.equal(all.length,1324);assert.equal(new Set(all.map(e=>e.id)).size,1324);assert.ok(all.every(e=>e.name&&e.instructions&&e.bodyPart&&e.equipment));
});
