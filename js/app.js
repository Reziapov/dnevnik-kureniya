(() => {
 const KEY='smokingDiaryApp_v1';
 const defaultTimes=['09:00','10:30','12:00','13:30','15:00','16:30','18:00','19:30','21:00','22:30'];

 function getLocalDate(){
   const d = new Date();
   const year = d.getFullYear();
   const month = String(d.getMonth() + 1).padStart(2, '0');
   const day = String(d.getDate()).padStart(2, '0');
   return `${year}-${month}-${day}`;
 }

 let state={times:defaultTimes,checked:[],limit:10,note:'',history:[],dayStarted:(()=>{const d=new Date();
 return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;})(),editing:false};
 const $=id=>document.getElementById(id);
 const SUPABASE_URL='https://bpdkeogfijpcipauqktv.supabase.co';
 const SUPABASE_KEY='sb_publishable_TCnm7714eDOGW3NrYGD09w_JFu-S4OR';
 const cloud=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
 let currentUser=null, saveTimer=null, applyingCloud=false;
 function status(msg){$('syncStatus').textContent='Статус: '+msg;}
 async function saveCloud(){
  if(!currentUser||applyingCloud)return;
  const snapshot={...state,editing:false};
  status('сохраняю изменения…');
  const {error}=await cloud.from('smoking_diary').upsert({
   user_id:currentUser.id, entry_date:getLocalDate(), data:snapshot, updated_at:new Date().toISOString()
  },{onConflict:'user_id'});
  if(error){status('ошибка сохранения: '+error.message);return;}
  status('синхронизировано ✓');
 }
 async function loadCloud(){
   if (!currentUser) return;

   status('загружаю данные…');

   const { data, error } = await cloud
     .from('smoking_diary')
     .select('data')
     .eq('user_id', currentUser.id)
     .maybeSingle();

   if (error) {
     status('ошибка загрузки: ' + error.message);
     return;
   }

   if (
     data &&
     data.data &&
     Array.isArray(data.data.times) &&
     Array.isArray(data.data.checked) &&
     Array.isArray(data.data.history)
   ) {
     applyingCloud = true;

     state = { ...state, ...data.data, editing: false };

     const today = getLocalDate();

     if (state.dayStarted && state.dayStarted !== today) {
       state.history.push({
         day: state.history.length + 1,
         date: state.dayStarted,
         smoked: state.checked.length,
         limit: state.limit,
         note: state.note || ''
       });

       state.checked = [];
       state.note = '';
       state.dayStarted = today;
       state.editing = false;
     } else if (!state.dayStarted) {
       state.dayStarted = today;
     }

     persistLocalOnly();
     render();

     applyingCloud = false;

     await saveCloud();
     status('загружено из облака ✓');
   } else {
     await saveCloud();
   }
 }
 function persistLocalOnly(){try{localStorage.setItem(KEY,JSON.stringify(state));}catch(e){}}
 async function connectAccount(){
  const email=$('authEmail').value.trim(),password=$('authPassword').value;
  if(!email||!password){toast('Введи email и пароль дневника');return;}
  $('loginBtn').disabled=true;status('выполняю вход…');
  const {data,error}=await cloud.auth.signInWithPassword({email,password});
  $('loginBtn').disabled=false;
  if(error){status('не удалось войти: '+error.message);return;}
  currentUser=data.user;$('authEmail').disabled=true;$('authPassword').style.display='none';$('loginBtn').style.display='none';$('logoutBtn').style.display='block';
  await loadCloud();
 }
 async function disconnectAccount(){
  await cloud.auth.signOut();currentUser=null;
  $('authEmail').disabled=false;$('authPassword').style.display='block';$('loginBtn').style.display='block';$('logoutBtn').style.display='none';
  status('вышли из аккаунта. Локальная копия осталась на этом устройстве.');
 }
 function load(){
   try {
     const s = JSON.parse(localStorage.getItem(KEY));
     if (
       s &&
       Array.isArray(s.times) &&
       Array.isArray(s.checked) &&
       Array.isArray(s.history)
     ) {
       state = { ...state, ...s };
     }
   } catch (e) {}

   const today = getLocalDate();

   if (state.dayStarted && state.dayStarted !== today) {
     state.history.push({
       day: state.history.length + 1,
       date: state.dayStarted,
       smoked: state.checked.length,
       limit: state.limit,
       note: state.note || ''
     });

     state.checked = [];
     state.note = '';
     state.dayStarted = today;
     state.editing = false;
     persist();
   } else if (!state.dayStarted) {
     state.dayStarted = today;
   }
 }

 function persist(){persistLocalOnly();if(currentUser&&!applyingCloud){clearTimeout(saveTimer);saveTimer=setTimeout(()=>saveCloud(),500);}}
 function toast(msg){const t=$('toast');t.textContent=msg;t.style.display='block';clearTimeout(toast.timer);toast.timer=setTimeout(()=>t.style.display='none',2600);}
 function safeDate(d){try{return new Date(d+'T12:00:00').toLocaleDateString('ru-RU',{day:'numeric',month:'short',year:'numeric'});}catch(e){return d||'Без даты';}}

 function getScheduleTimes() {
   const times = [...state.times];
   const checkedIndexes = state.checked
     .filter(i => i >= 0 && i < times.length)
     .sort((a, b) => a - b);

   if (checkedIndexes.length === 0) {
     return times;
   }

   const lastChecked = checkedIndexes[checkedIndexes.length - 1];
   let previous = times[lastChecked];

   if (!previous || !/^\d{2}:\d{2}$/.test(previous)) {
     return times;
   }

   for (let i = lastChecked + 1; i < times.length; i++) {
     if (state.checked.includes(i)) {
       previous = times[i];
       continue;
     }

     let minutes =
       Number(previous.slice(0, 2)) * 60 +
       Number(previous.slice(3)) + 90;

     minutes %= 1440;

     times[i] =
       String(Math.floor(minutes / 60)).padStart(2, '0') +
       ':' +
       String(minutes % 60).padStart(2, '0');

     previous = times[i];
   }

   return times;
 }

 function renderSchedule(){
  const root=$('schedule');root.innerHTML='';
  const scheduleTimes = getScheduleTimes();
  scheduleTimes.forEach((time,i)=>{
   const row=document.createElement('div');row.className='item'+(state.checked.includes(i)?' done':'');
   const cb=document.createElement('input');cb.type='checkbox';cb.checked=state.checked.includes(i);cb.setAttribute('aria-label','Отметить сигарету '+(i+1));
   cb.addEventListener('change',()=>{state.checked=cb.checked?[...new Set([...state.checked,i])]:state.checked.filter(n=>n!==i);persist();render();});
   row.appendChild(cb);
   const details=document.createElement('div');details.className='details';
   if(state.editing){
    const inp=document.createElement('input');
    inp.type='time';inp.className='time-edit';inp.value=time||'09:00';
    inp.setAttribute('aria-label','Время сигареты '+(i+1));
    inp.style.display='block';inp.style.minHeight='42px';inp.style.color='#17221c';inp.style.background='#fff';
    inp.addEventListener('change',()=>{
      state.times[i] = inp.value;
      persist();
      renderSchedule();
    });
    details.appendChild(inp);
   } else {
    const t=document.createElement('span');t.className='time-label';
    t.textContent=time||'Время не задано';t.style.display='block';t.style.fontSize='17px';t.style.color='#17221c';
    details.appendChild(t);
   }
   const n=document.createElement('span');n.className='num';n.textContent='Сигарета № '+(i+1);details.appendChild(n);row.appendChild(details);
   if(state.editing){
    const del=document.createElement('button');
    del.type='button';del.textContent='Удалить';del.className='outline';
    del.setAttribute('aria-label','Удалить дополнительное время '+(i+1));
    del.style.marginLeft='auto';del.style.padding='8px 10px';del.style.fontSize='14px';del.style.flexShrink='0';
    del.addEventListener('click',()=>{
     if(state.times.length<=1){toast('Нужно оставить хотя бы одно время');return;}
     state.times.splice(i,1);
     state.checked=state.checked.filter(n=>n!==i).map(n=>n>i?n-1:n);
     persist();renderSchedule();render();
     toast('Время удалено');
    });
    row.appendChild(del);
   }
   if(state.checked.includes(i)){const mark=document.createElement('span');mark.textContent='✓';mark.style.color='#27824e';mark.style.fontWeight='800';row.appendChild(mark);}
   root.appendChild(row);
  });
  $('editBtn').textContent=state.editing?'Готово':'Изменить время';
  $('addTimeBtn').textContent=state.editing?'＋ Добавить ещё одно время':'＋ Добавить дополнительное время';
 }
 function render(){
  state.limit=Math.max(1,Math.min(20,Number(state.limit)||10));
  const count=state.checked.length,limit=state.limit;
  $('dateLabel').textContent=safeDate(state.dayStarted);
  $('smokedCount').textContent=count;$('plannedText').textContent='из '+limit+' запланированных';
  $('remaining').textContent=Math.max(0,limit-count);$('limitState').textContent=count>limit?'лимит превышен':'сигарет осталось';
  $('lessCount').textContent=20-count;$('reduction').textContent=Math.round((20-count)/20*100)+'%';
  $('progressBar').style.width=Math.min(100,count/limit*100)+'%';$('progressText').textContent=count+' из '+limit+' отмечено';
  $('limitInput').value=limit;$('note').value=state.note||'';
  renderSchedule();
  const hist=state.history;const total=hist.reduce((s,d)=>s+d.smoked,0);
  $('daysCount').textContent=hist.length+' '+(hist.length===1?'день':hist.length>=2&&hist.length<=4?'дня':'дней');
  $('average').textContent=hist.length?(total/hist.length).toFixed(1).replace('.',','):'—';
  $('totalDaysSmoked').textContent=total;
  $('emptyHistory').style.display=hist.length?'none':'block';
  const list=$('historyList');list.innerHTML='';
  [...hist].reverse().forEach(d=>{
   const entry=document.createElement('div');entry.className='history-entry';
   const head=document.createElement('div');head.className='row';
   const title=document.createElement('strong');title.textContent=safeDate(d.date)+' · День '+d.day;
   const pill=document.createElement('span');pill.className='pill'+(d.smoked>d.limit?' over':'');pill.textContent=d.smoked<=d.limit?'Лимит соблюдён':'Лимит превышен';
   head.append(title,pill);entry.appendChild(head);
   const p=document.createElement('p');p.textContent='Выкурено: '+d.smoked+' из '+d.limit+' · '+(d.smoked<=20?'на '+(20-d.smoked)+' меньше обычного':'на '+(d.smoked-20)+' больше обычного');entry.appendChild(p);
   if(d.note){const note=document.createElement('p');note.className='muted';note.textContent='Заметка: '+d.note;entry.appendChild(note);}
   list.appendChild(entry);
  });
 }
 $('editBtn').addEventListener('click',()=>{state.editing=!state.editing;persist();renderSchedule();$('editBtn').setAttribute('aria-pressed',String(state.editing));toast(state.editing?'Режим редактирования времени включён':'Время сохранено');});
 $('addTimeBtn').addEventListener('click',()=>{
  const last=state.times.length?state.times[state.times.length-1]:'09:00';
  let next='23:00';
  if(last && /^\\d{2}:\\d{2}$/.test(last)){
   const mins=Number(last.slice(0,2))*60+Number(last.slice(3))+30;
   next=mins>=1440?'23:00':String(Math.floor(mins/60)).padStart(2,'0')+':'+String(mins%60).padStart(2,'0');
  }
  state.times.push(next);
  state.editing=true;
  persist();renderSchedule();render();
  toast('Добавлено дополнительное время — при необходимости измени его');
 });
 $('limitInput').addEventListener('change',()=>{state.limit=Math.max(1,Math.min(20,Number($('limitInput').value)||10));persist();render();});
 $('note').addEventListener('input',()=>{state.note=$('note').value;persist();});
 $('resetChecks').addEventListener('click',()=>{if(confirm('Сбросить все отметки за текущий день? История не изменится.')){state.checked=[];persist();render();toast('Отметки сброшены');}});
 $('saveDay').addEventListener('click',()=>{
  if(!confirm('Сохранить '+state.checked.length+' сигарет за '+safeDate(state.dayStarted)+' и начать новый день?'))return;
  state.history.push({day:state.history.length+1,date:state.dayStarted,smoked:state.checked.length,limit:state.limit,note:state.note||''});
  state.checked=[];state.note='';const d=new Date();state.dayStarted=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;state.editing=false;persist();render();toast('Итог сохранён. Новый день начат.');
 });
 $('exportBtn').addEventListener('click', () => {
   const rows = [
     ['Дата', 'День', 'Выкурено', 'Лимит', 'Заметка'],
     [
       state.dayStarted,
       'Текущий день',
       state.checked.length,
       state.limit,
       state.note || ''
     ],
     ...state.history.map(day => [
       day.date,
       day.day,
       day.smoked,
       day.limit,
       day.note || ''
     ])
   ];

   const csv = '\uFEFF' + rows
     .map(row => row.map(value =>
       '"' + String(value).replace(/"/g, '""') + '"'
     ).join(';'))
     .join('\r\n');

   const blob = new Blob([csv], {
     type: 'text/csv;charset=utf-8;'
   });

   const url = URL.createObjectURL(blob);
   const a = document.createElement('a');
   a.href = url;
   a.download = 'dnevnik-kureniya-statistika.csv';
   a.click();

   setTimeout(() => URL.revokeObjectURL(url), 1000);
   toast('Статистика экспортирована в CSV');
 });
 $('importBtn').addEventListener('click',()=>$('importFile').click());
 $('importFile').addEventListener('change',async e=>{
  const f=e.target.files[0];if(!f)return;
  try{const s=JSON.parse(await f.text());if(!Array.isArray(s.times)||!Array.isArray(s.checked)||!Array.isArray(s.history))throw new Error();if(confirm('Заменить текущие данные данными из файла?')){state={...state,...s};persist();render();toast('Данные импортированы');}}catch(err){alert('Не удалось прочитать файл. Выбери резервную копию этого приложения.');}e.target.value='';
 });
 $('clearHistory').addEventListener('click',()=>{if(confirm('Удалить всю сохранённую историю? Это действие нельзя отменить. Рекомендуется сначала сделать экспорт.')){state.history=[];persist();render();toast('История удалена');}});
 $('loginBtn').addEventListener('click',connectAccount);
 $('logoutBtn').addEventListener('click',disconnectAccount);
 cloud.auth.getSession().then(async ({data})=>{if(data.session){currentUser=data.session.user;$('authEmail').value=currentUser.email||'';$('authEmail').disabled=true;$('authPassword').style.display='none';$('loginBtn').style.display='none';$('logoutBtn').style.display='block';await loadCloud();}});
 load();render();
})();