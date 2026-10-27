export const STORAGE_KEY = 'pumpy.v1';
export const blankState = () => ({version:1,onboarded:false,choices:{},active:null,history:[],revision:0});
export function eligible(catalog, choices, mode='random', body='', equipment='') {
  const bodies = Array.isArray(body) ? body : body ? [body] : [];
  const gear = Array.isArray(equipment) ? equipment : equipment ? [equipment] : [];
  return catalog.filter(e => choices[e.id] !== 'disliked' && (mode !== 'favorites' || choices[e.id] === 'favorite') && (!bodies.length || bodies.includes(e.bodyPart)) && (!gear.length || gear.includes(e.equipment)));
}
export function shuffle(items, random=Math.random) {
  const a=[...items]; for(let i=a.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[a[i],a[j]]=[a[j],a[i]];} return a;
}
export function generate(catalog,choices,mode,count,body='',equipment='',random=Math.random) {
  const groups=new Map();
  for(const e of shuffle(eligible(catalog,choices,mode,body,equipment),random)) {if(!groups.has(e.bodyPart))groups.set(e.bodyPart,[]);groups.get(e.bodyPart).push(e);}
  const keys=shuffle([...groups.keys()],random), result=[];
  while(result.length<Math.max(0,Math.min(12,count))) {
    let added=false; for(const key of keys) {if(result.length>=count)break;const e=groups.get(key).pop();if(e){result.push(e);added=true;}}
    if(!added)break;
  }
  return result;
}
export function replacements(catalog,choices,workout,entry) {
  const current=catalog.find(e=>e.id===entry.exerciseID), occupied=new Set(workout.exercises.map(e=>e.exerciseID));
  const score=e=>(e.bodyPart===current?.bodyPart?2:0)+(e.equipment===current?.equipment?1:0);
  return eligible(catalog,choices,workout.mode).filter(e=>!occupied.has(e.id)).sort((a,b)=>score(b)-score(a)||a.name.localeCompare(b.name));
}
export function parseWeight(text) {
  const t=text.trim().replace(',','.'); if(!t)return null;
  if(!/^\d+(\.\d{0,2})?$/.test(t))throw new Error('Укажи вес от 0 до 2000 кг, до двух знаков после запятой.');
  const n=Number(t); if(!Number.isFinite(n)||n<0||n>2000)throw new Error('Вес должен быть от 0 до 2000 кг.');return n;
}
export function newWorkout(ids,mode,choices,catalog) {
  const allowed=new Set(eligible(catalog,choices,mode).map(e=>e.id));
  const selected=[...new Set(ids)].filter(id=>allowed.has(id)).slice(0,12);
  if(!selected.length)throw new Error('Нет подходящих упражнений. Измени фильтры или добавь избранные.');
  return {id:crypto.randomUUID(),date:new Date().toISOString(),finishedAt:null,mode,index:0,exercises:selected.map(exerciseID=>({exerciseID,sets:Array.from({length:3},()=>({reps:10,weight:null,done:false}))}))};
}
export function replaceEntry(workout,index,id,catalog,choices) {
  if(!replacements(catalog,choices,workout,workout.exercises[index]).some(e=>e.id===id))throw new Error('Это упражнение больше не подходит для замены.');
  return {...workout,exercises:workout.exercises.map((e,i)=>i===index?{exerciseID:id,sets:e.sets.map(()=>({reps:10,weight:null,done:false}))}:e)};
}
export function stats(w) {const sets=w.exercises.flatMap(e=>e.sets).filter(s=>s.done);return {done:sets.length,total:w.exercises.reduce((n,e)=>n+e.sets.length,0),volume:sets.reduce((n,s)=>n+(s.weight??0)*s.reps,0)};}
export function previousWeight(history,id,setIndex) {for(const w of history){const s=w.exercises.find(e=>e.exerciseID===id)?.sets[setIndex];if(s&&s.weight!==null)return s.weight;}return null;}
export function validateBackup(data,catalog) {
  const ids=new Set(catalog.map(e=>e.id));
  if(!data||data.version!==1||typeof data.onboarded!=='boolean'||!data.choices||Array.isArray(data.choices)||!Array.isArray(data.history)||data.history.length>1000)throw new Error('Это не резервная копия Pumpy или её формат не поддерживается.');
  const choices={};for(const [id,p] of Object.entries(data.choices)){if(!ids.has(id)||!['favorite','disliked','neutral'].includes(p))throw new Error('Некорректные предпочтения в копии.');choices[id]=p;}
  const parseWorkout=(w,finished)=>{
    if(!w||typeof w.id!=='string'||!['favorites','random','custom'].includes(w.mode)||!Number.isFinite(Date.parse(w.date))||!Array.isArray(w.exercises)||!w.exercises.length||w.exercises.length>12||!Number.isInteger(w.index)||w.index<0||w.index>=w.exercises.length||(finished?!Number.isFinite(Date.parse(w.finishedAt)):w.finishedAt!==null))throw new Error('Некорректная тренировка в копии.');
    const seen=new Set();
    const exercises=w.exercises.map(e=>{
      if(!ids.has(e.exerciseID)||seen.has(e.exerciseID)||!Array.isArray(e.sets)||e.sets.length!==3)throw new Error('Некорректное упражнение в копии.');seen.add(e.exerciseID);
      return {exerciseID:e.exerciseID,sets:e.sets.map(s=>{
        if(!Number.isInteger(s.reps)||s.reps<1||s.reps>999||typeof s.done!=='boolean'||(s.weight!==null&&(typeof s.weight!=='number'||!Number.isFinite(s.weight)||s.weight<0||s.weight>2000)))throw new Error('Некорректные подходы в копии.');
        return {reps:s.reps,weight:s.weight,done:s.done};
      })};
    });
    return {id:w.id,date:w.date,finishedAt:w.finishedAt,mode:w.mode,index:w.index,exercises};
  };
  return {version:1,onboarded:data.onboarded,choices,active:data.active===null?null:parseWorkout(data.active,false),history:data.history.map(w=>parseWorkout(w,true)),revision:Number.isSafeInteger(data.revision)?data.revision:0};
}
