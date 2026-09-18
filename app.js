(function(){
  var $=function(s){return document.querySelector(s)}, $$=function(s){return Array.from(document.querySelectorAll(s))};
  var yen=function(n){return '¥'+Math.round(Number(n||0)).toLocaleString('ja-JP')};
  var SEATS=['C01','C02','C03','C04','C05','C06','T1-01','T1-02','T1-03','T1-04','T2-01','T2-02','T3-01','T3-02'];
  var TABLES={T1:['T1-01','T1-02','T1-03','T1-04'],T2:['T2-01','T2-02'],T3:['T3-01','T3-02']};
  var LABEL={ordered:'受付',preparing:'準備中',served:'提供済',paid:'会計済'};
  function load(k,d){try{var v=localStorage.getItem(k);return v?JSON.parse(v):d}catch(e){return d}}
  function save(k,v){try{localStorage.setItem(k,JSON.stringify(v));return true}catch(e){return false}}
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(m){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]})}
  function time(v){var d=new Date(v);return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0')}
  var sales=load('ippukuSales',window.SALES_DATA||[]), orders=load('ippukuOrders',[]), inventory=load('ippukuInventory',[]), reserves=load('ippukuReserves',[]);
  var promos=load('ippukuPromos',[
    {product:'コーヒー',tag:'いっぷくおすすめ',headline:'まずは、ほっと一杯。',copy:'喫煙時間のお供に。ゆっくり過ごしたい時の定番です。',active:true},
    {product:'キャラメルマキアート',tag:'甘めが好きな方へ',headline:'少し贅沢な一杯を。',copy:'ゆっくり過ごしたい時におすすめのカフェメニューです。',active:true}
  ]);
  var selectedSeat='', orderFilter='all', cart=[], customerCategory='all', inventoryShopFilter='all', customerSeat=new URLSearchParams(location.search).get('seat')||load('ippukuCustomerSeat','')||'';
  var seatAccess={}, seatAccessMeta={}, customerSeatOpen=true, customerDrinkSatisfied=false, customerSeatTimer=null;
  var INVENTORY_SEED_VERSION=4;
  var INVENTORY_SEED=[
    {name:'ガムシロップ',stock:'',min:6,unit:'個',source:'スタンバイ'},
    {name:'コーヒーフレッシュ',stock:'',min:20,unit:'個',source:'スタンバイ'},
    {name:'スティックシュガー',stock:'',min:20,unit:'本',source:'スタンバイ'},
    {name:'マドラー',stock:'',min:20,unit:'本',source:'スタンバイ'},
    {name:'ストロー',stock:'',min:20,unit:'本',source:'スタンバイ'},
    {name:'プラカップ',stock:'',min:30,unit:'個',source:'スタンバイ'},
    {name:'花見糖',stock:'',min:1,unit:'本',source:'スタンバイ'},
    {name:'コーヒーゼリー',stock:'',min:1,unit:'タッパー',source:'スタンバイ'},
    {name:'チーズケーキ（冷蔵庫）',stock:'',min:4,unit:'個',source:'スタンバイ'},
    {name:'ベリーソース',stock:'',min:0.5,unit:'本',source:'スタンバイ'},
    {name:'ゆず蜜原液',stock:'',min:0.5,unit:'本',source:'スタンバイ'},
    {name:'チョコチーノ原液',stock:'',min:1,unit:'本',source:'スタンバイ'},
    {name:'抹茶原液',stock:'',min:1,unit:'本',source:'スタンバイ'},
    {name:'ホイップ',stock:'',min:1,unit:'袋',source:'スタンバイ'},
    {name:'アイスコーヒー',stock:'',min:3,unit:'本',source:'スタンバイ'},
    {name:'アイスティー',stock:'',min:1,unit:'本',source:'スタンバイ'},
    {name:'コーラ',stock:'',min:4,unit:'本',source:'スタンバイ'},
    {name:'みかんジュース',stock:'',min:4,unit:'本',source:'スタンバイ'},
    {name:'りんご',stock:'',min:4,unit:'本',source:'スタンバイ'},
    {name:'モンスター',stock:'',min:4,unit:'本',source:'スタンバイ'},
    {name:'ペリエ',stock:'',min:4,unit:'本',source:'スタンバイ'},
    {name:'炭酸水',stock:'',min:2,unit:'本',source:'スタンバイ'},
    {name:'ポパイサンド',stock:'',min:3,unit:'個',source:'スタンバイ'},
    {name:'あんバターサンド',stock:'',min:3,unit:'個',source:'スタンバイ'},
    {name:'チーズケーキ（冷凍庫）',stock:'',min:2,unit:'個',source:'スタンバイ'},

    {name:'紅茶 Twining',stock:'',min:3,unit:'pack/各種',source:'買出し・棚1'},
    {name:'ココア',stock:'',min:2,unit:'袋',source:'買出し・棚2'},
    {name:'抹茶',stock:'',min:2,unit:'袋',source:'買出し・棚2'},
    {name:'ルイボス',stock:'',min:20,unit:'bag',source:'買出し・棚2'},
    {name:'紅茶（日東）',stock:'',min:20,unit:'bag',source:'買出し・棚2'},
    {name:'インスタントコーヒー',stock:'',min:0.25,unit:'袋',source:'買出し・棚3'},
    {name:'コーヒー豆',stock:2,min:3,unit:'袋',source:'買出し・棚3',note:'手書き現在数 2'},
    {name:'ゼラチン',stock:'',min:0.25,unit:'袋',source:'買出し・棚3'},
    {name:'ナッツ',stock:'',min:5,unit:'袋',source:'買出し・棚3'},
    {name:'マジックソルト',stock:'',min:2,unit:'袋',source:'買出し・棚4'},
    {name:'チョコソース',stock:'',min:1,unit:'本',source:'買出し・棚4'},
    {name:'キャラメルソース',stock:'',min:1,unit:'本',source:'買出し・棚4'},
    {name:'花見糖',stock:'',min:0.5,unit:'袋',source:'買出し・棚4'},
    {name:'上白糖',stock:'',min:0.5,unit:'袋',source:'買出し・棚4'},
    {name:'プラカップ',stock:'',min:5,unit:'包（50cup）',source:'買出し・棚4'},
    {name:'ストロー',stock:'',min:50,unit:'本',source:'買出し・棚5'},

    {name:'ペリエ',stock:'',min:15,unit:'本',source:'買出し・冷蔵庫'},
    {name:'コーラ',stock:'',min:5,unit:'本',source:'買出し・冷蔵庫'},
    {name:'りんご炭酸',stock:'',min:10,unit:'本',source:'買出し・冷蔵庫'},
    {name:'モンスター',stock:'',min:15,unit:'本',source:'買出し・冷蔵庫'},
    {name:'炭酸水',stock:'',min:5,unit:'本',source:'買出し・冷蔵庫'},
    {name:'みかん',stock:'',min:5,unit:'本',source:'買出し・冷蔵庫'},
    {name:'牛乳',stock:'',min:3,unit:'本',source:'買出し・冷蔵庫'},

    {name:'カフェラテ原液',stock:1,min:3,unit:'本',source:'買出し・シンク下',note:'手書き現在数 1'},
    {name:'キャラマキ原液',stock:2,min:2,unit:'本',source:'買出し・シンク下',note:'手書き現在数 2'},

    {name:'パン（ホットサンド）',stock:'',min:3,unit:'袋（各）',source:'買出し・冷蔵庫チルド'},
    {name:'チーズ',stock:'',min:10,unit:'枚',source:'買出し・冷蔵庫チルド'},
    {name:'マヨネーズ',stock:'',min:0.25,unit:'本',source:'買出し・冷蔵庫チルド'},
    {name:'バター風味',stock:'',min:0.5,unit:'箱',source:'買出し・冷蔵庫チルド'},

    {name:'アイスクリーム',stock:'',min:0.25,unit:'箱',source:'買出し・冷凍庫'},
    {name:'ホイップクリーム',stock:'',min:3,unit:'袋',source:'買出し・冷凍庫'},
    {name:'ワッフル',stock:'',min:5,unit:'個',source:'買出し・冷凍庫'},
    {name:'チーズケーキ',stock:'',min:2,unit:'個',source:'買出し・冷凍庫'},
    {name:'ほうれん草',stock:'',min:0.3,unit:'袋',source:'買出し・冷凍庫'},
    {name:'きのこ',stock:'',min:2,unit:'袋（125g×2）',source:'買出し・冷凍庫'},
    {name:'ハム',stock:'',min:3,unit:'袋',source:'買出し・冷凍庫'},

    {name:'ゆず蜜',stock:'',min:0.25,unit:'瓶',source:'買出し・野菜室'},
    {name:'ジャム（ブルーベリー）',stock:'',min:0.25,unit:'瓶',source:'買出し・野菜室'},
    {name:'あんこ',stock:'',min:0.25,unit:'瓶',source:'買出し・野菜室'},
    {name:'ライター用オイル',stock:'',min:1,unit:'本',source:'買出し・その他'}
  ];

  function inventoryKey(x){return String(x.name||'')+'|'+String(x.source||'')}
  var INVENTORY_SHOP_DEFAULTS={
    '紅茶（日東）|買出し・棚2':'イオン',
    'ゼラチン|買出し・棚3':'ネット',
    'ナッツ|買出し・棚3':'コストコ',
    'ストロー|買出し・棚5':'アスクル',
    'ペリエ|買出し・冷蔵庫':'ネット',
    'りんご炭酸|買出し・冷蔵庫':'ネット',
    'モンスター|買出し・冷蔵庫':'ネット',
    '炭酸水|買出し・冷蔵庫':'コストコ',
    'アイスクリーム|買出し・冷凍庫':'イオン',
    'きのこ|買出し・冷凍庫':'コストコ',
    'ライター用オイル|買出し・その他':'Mr.Max'
  };
  INVENTORY_SEED.forEach(function(x){
    x.shop=INVENTORY_SHOP_DEFAULTS[inventoryKey(x)]||x.shop||'';
  });

  if(load('ippukuInventorySeedVersion',0)<INVENTORY_SEED_VERSION){
    if(!inventory.length){
      inventory=INVENTORY_SEED.map(function(x){return Object.assign({},x)});
    }else{
      var existingByKey={};
      inventory.forEach(function(x){existingByKey[inventoryKey(x)]=x});
      INVENTORY_SEED.forEach(function(seed){
        var old=existingByKey[inventoryKey(seed)];
        if(old){
          if(!old.shop&&seed.shop)old.shop=seed.shop;
          if(old.min===undefined||old.min===null)old.min=seed.min;
          if(!old.unit)old.unit=seed.unit;
        }else{
          inventory.push(Object.assign({},seed));
        }
      });
    }
    save('ippukuInventory',inventory);
    save('ippukuInventorySeedVersion',INVENTORY_SEED_VERSION);
  }

  var audioCtx=null, alarmTimer=null, alarmActive=false, soundEnabled=false;
  var orderChannel=null;
  try{if('BroadcastChannel' in window)orderChannel=new BroadcastChannel('ippuku-orders')}catch(e){}

  function updateSoundButton(){
    var b=$('#enableOrderSound'); if(!b)return;
    b.textContent=soundEnabled?'🔔 通知音ON中':'🔕 通知音ON';
    b.classList.toggle('sound-on',soundEnabled);
  }
  async function ensureAudio(){
    var Ctx=window.AudioContext||window.webkitAudioContext;
    if(!Ctx)return false;
    try{
      if(!audioCtx)audioCtx=new Ctx();
      if(audioCtx.state!=='running')await audioCtx.resume();
      return audioCtx.state==='running';
    }catch(e){return false}
  }
  function alarmBeep(){
    if(!soundEnabled||!audioCtx)return;
    var now=audioCtx.currentTime;
    [880,1320].forEach(function(freq,idx){
      var osc=audioCtx.createOscillator(), gain=audioCtx.createGain();
      osc.type='square'; osc.frequency.setValueAtTime(freq,now);
      gain.gain.setValueAtTime(0.0001,now);
      gain.gain.exponentialRampToValueAtTime(idx===0?0.72:0.5,now+0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001,now+0.34);
      osc.connect(gain); gain.connect(audioCtx.destination);
      osc.start(now); osc.stop(now+0.36);
    });
  }
  function startOrderAlarm(order){
    if(!order||document.body.classList.contains('customer-mode'))return;
    var overlay=$('#orderAlarm');
    if(!overlay)return;
    $('#alarmSeat').textContent=order.seat||'--';
    $('#alarmSummary').innerHTML=(order.items||[]).slice(0,5).map(function(i){return '<div><span>'+esc(i.displayName||i.name)+' ×'+i.qty+'</span><strong>'+yen(i.price*i.qty)+'</strong></div>'}).join('')+(order.total!=null?'<p>合計 '+yen(order.total)+'</p>':'');
    overlay.classList.add('show'); overlay.setAttribute('aria-hidden','false');
    document.body.classList.add('alarm-ringing');
    alarmActive=true;
    try{if(navigator.vibrate)navigator.vibrate([450,180,450,180,700])}catch(e){}
    if(soundEnabled){
      ensureAudio().then(function(ok){
        if(!ok)return;
        alarmBeep();
        if(alarmTimer)clearInterval(alarmTimer);
        alarmTimer=setInterval(function(){if(alarmActive)alarmBeep()},850);
      });
    }
  }
  function stopOrderAlarm(){
    alarmActive=false;
    if(alarmTimer){clearInterval(alarmTimer);alarmTimer=null}
    var overlay=$('#orderAlarm'); if(overlay){overlay.classList.remove('show');overlay.setAttribute('aria-hidden','true')}
    document.body.classList.remove('alarm-ringing');
    try{if(navigator.vibrate)navigator.vibrate(0)}catch(e){}
  }
  async function enableOrderSound(){
    var ok=await ensureAudio();
    if(!ok){
      alert('この端末では通知音を利用できません。端末のメディア音量も確認してください。');
      return;
    }
    soundEnabled=true; updateSoundButton();
    alarmBeep();
    setTimeout(alarmBeep,420);
  }
  function findOrderBySignal(sig){
    var latestOrders=load('ippukuOrders',[]);
    return latestOrders.find(function(o){return String(o.id)===String(sig.id)})||{id:sig.id,seat:sig.seat,items:sig.items||[],total:sig.total||0};
  }
  function handleOrderSignal(raw){
    try{
      var sig=typeof raw==='string'?JSON.parse(raw):raw;
      if(!sig||!sig.id)return;
      orders=load('ippukuOrders',orders); renderAll();
      startOrderAlarm(findOrderBySignal(sig));
    }catch(e){}
  }


  var backendReady=false, backendChecked=false, serverOrdersInitialized=false, serverSeenIds=new Set(), serverSyncTimer=null;

  async function apiRequest(path,options){
    try{
      var res=await fetch(path,Object.assign({cache:'no-store',headers:{'content-type':'application/json'}},options||{}));
      var data=null;
      try{data=await res.json()}catch(e){}
      if(!res.ok)return {ok:false,status:res.status,data:data};
      return {ok:true,status:res.status,data:data};
    }catch(e){
      return {ok:false,status:0,data:null};
    }
  }

  async function syncOrdersFromServer(initial){
    if(!backendReady||document.body.classList.contains('customer-mode'))return;
    var result=await apiRequest('/api/orders?limit=200');
    if(!result.ok||!result.data||!Array.isArray(result.data.orders))return;
    var incoming=result.data.orders;
    var fresh=[];
    if(serverOrdersInitialized&&!initial){
      fresh=incoming.filter(function(o){return !serverSeenIds.has(String(o.id))});
    }
    orders=incoming;
    save('ippukuOrders',orders);
    serverSeenIds=new Set(incoming.map(function(o){return String(o.id)}));
    serverOrdersInitialized=true;
    renderAll();
    if(fresh.length){
      fresh.sort(function(a,b){return new Date(b.createdAt)-new Date(a.createdAt)});
      startOrderAlarm(fresh[0]);
    }
  }

  async function detectBackend(){
    var result=await apiRequest('/api/health');
    backendChecked=true;
    backendReady=!!(result.ok&&result.data&&result.data.database);
    if(backendReady){
      await loadSeatAccess();
      await syncOrdersFromServer(true);
      if(!serverSyncTimer)serverSyncTimer=setInterval(function(){syncOrdersFromServer(false)},2000);
      if(document.body.classList.contains('customer-mode'))startCustomerSeatWatch();
    }
    return backendReady;
  }

  async function setOrderStatus(order,status){
    var old=order.status;
    order.status=status;
    save('ippukuOrders',orders);
    renderAll();
    if(!backendReady)return;
    var result=await apiRequest('/api/orders/'+encodeURIComponent(order.id),{
      method:'PATCH',
      body:JSON.stringify({status:status})
    });
    if(!result.ok){
      order.status=old;
      save('ippukuOrders',orders);
      renderAll();
      alert('注文状態を更新できませんでした。通信状態を確認してください。');
      return;
    }
    await syncOrdersFromServer(true);
  }

  async function removeOrderById(id){
    var previous=orders.slice();
    orders=orders.filter(function(x){return String(x.id)!==String(id)});
    save('ippukuOrders',orders);
    renderAll();
    if(!backendReady)return true;
    var result=await apiRequest('/api/orders/'+encodeURIComponent(id),{method:'DELETE'});
    if(!result.ok){
      orders=previous;
      save('ippukuOrders',orders);
      renderAll();
      alert('注文を削除できませんでした。通信状態を確認してください。');
      return false;
    }
    await syncOrdersFromServer(true);
    return true;
  }


  async function loadSeatAccess(){
    if(!backendReady)return;
    var result=await apiRequest('/api/seats');
    if(result.ok&&result.data&&result.data.seats){
      seatAccess=result.data.seats;
      seatAccessMeta=result.data.details||{};
      renderSeats();
      if(selectedSeat)renderSeatDetail(selectedSeat);
    }
  }

  async function setSeatOpen(seat,open){
    if(!backendReady){
      alert('サーバーに接続できていないため変更できません。');
      return;
    }
    var result=await apiRequest('/api/seats/'+encodeURIComponent(seat),{
      method:'PATCH',
      body:JSON.stringify({open:open})
    });
    if(!result.ok){
      alert('席の注文受付状態を変更できませんでした。');
      return;
    }
    seatAccess[seat]=open;
    seatAccessMeta[seat]={open:open,updatedAt:result.data&&result.data.updatedAt?result.data.updatedAt:new Date().toISOString()};
    renderSeats();
    renderSeatDetail(seat);
  }

  async function refreshCustomerSeatAccess(showMessage){
    if(!customerSeat||!backendReady)return true;
    var result=await apiRequest('/api/seats/'+encodeURIComponent(customerSeat));
    if(!result.ok)return true;
    var wasOpen=customerSeatOpen;
    customerSeatOpen=result.data.open!==false;
    customerDrinkSatisfied=result.data.drinkOrdered===true;
    var note=$('#seatClosedNotice');
    if(note)note.style.display=customerSeatOpen?'none':'block';
    var checkout=$('#checkoutBtn');
    if(checkout){
      checkout.disabled=!customerSeatOpen;
      checkout.textContent=customerSeatOpen?'注文内容を確認':'この席は注文受付終了';
    }
    $$('.menu-card-tap,.promo-add,.cling-order-btn').forEach(function(b){b.disabled=!customerSeatOpen});
    if(showMessage&&wasOpen&&!customerSeatOpen){
      alert('この席の注文受付は終了しました。');
    }
    return customerSeatOpen;
  }

  function startCustomerSeatWatch(){
    if(customerSeatTimer){clearInterval(customerSeatTimer);customerSeatTimer=null}
    if(!customerSeat||!backendReady)return;
    refreshCustomerSeatAccess(false);
    customerSeatTimer=setInterval(function(){refreshCustomerSeatAccess(true)},4000);
  }

  function stopCustomerSeatWatch(){
    if(customerSeatTimer){clearInterval(customerSeatTimer);customerSeatTimer=null}
  }

  function page(name){
    $$('.page').forEach(function(p){p.classList.toggle('active',p.dataset.page===name)});
    $$('.nav-item').forEach(function(b){b.classList.toggle('active',b.dataset.go===name)});
    $('#bottomNav').style.display=name==='customer'?'none':'flex'; $('.topbar').style.display=name==='customer'?'none':'flex'; document.body.classList.toggle('customer-mode',name==='customer');
    var t={dashboard:'店舗ダッシュボード',seats:'座席・注文管理',orders:'注文一覧',analytics:'売上分析',inventory:'在庫・発注',reserve:'取り置き管理',settings:'設定'};
    if(t[name]) $('#pageTitle').textContent=t[name];
    if(name==='seats') renderSeats(); if(name==='orders') renderOrders(); if(name==='analytics') renderAnalytics(); if(name==='inventory') renderInventory(); if(name==='reserve') renderReserves(); if(name==='customer'){renderCustomer();startCustomerSeatWatch()}else{stopCustomerSeatWatch()}
    window.scrollTo(0,0);
  }
  $$('[data-go]').forEach(function(b){b.onclick=function(){page(b.dataset.go)}}); $('#openCustomer').onclick=function(){if(location.hash!=='#order')location.hash='order';page('customer')}; $('#refreshBtn').onclick=renderAll;
  $('#enableOrderSound').onclick=enableOrderSound;
  $('#stopOrderAlarm').onclick=stopOrderAlarm;
  updateSoundButton();
  window.addEventListener('storage',function(e){if(e.key==='ippukuOrderSignal'&&e.newValue)handleOrderSignal(e.newValue)});
  if(orderChannel)orderChannel.onmessage=function(e){handleOrderSignal(e.data)};

  function renderDashboard(){
    var s=sales.reduce(function(a,p){return a+Number(p.sales||0)},0), g=sales.reduce(function(a,p){return a+Number(p.grossProfit||0)},0), u=sales.reduce(function(a,p){return a+Number(p.units||0)},0);
    $('#metricSales').textContent=yen(s); $('#metricProfit').textContent=yen(g); $('#metricUnits').textContent=u.toLocaleString(); $('#metricProducts').textContent=sales.length+'商品'; $('#metricMargin').textContent=s?'粗利率 '+(g/s*100).toFixed(1)+'%':'-';
    var active=orders.filter(function(o){return o.status!=='paid'}); $('#occupiedCount').textContent=new Set(active.map(function(o){return o.seat})).size+' / 14'; $('#pendingCount').textContent=orders.filter(function(o){return o.status==='ordered'||o.status==='preparing'}).length; $('#reserveCount').textContent=reserves.length;
    var today=new Date().toDateString(); $('#todayOrderSales').textContent=yen(orders.filter(function(o){return new Date(o.createdAt).toDateString()===today}).reduce(function(a,o){return a+o.total},0));
    var top=sales.slice().sort(function(a,b){return b.grossProfit-a.grossProfit}).slice(0,5); $('#topProfitList').innerHTML=top.length?top.map(function(p,i){return '<div class="rank-row"><span class="rank-num">'+(i+1)+'</span><div><b>'+esc(p.name)+'</b><small>'+esc(p.category)+' ・ '+Number(p.units||0).toLocaleString()+'点</small></div><strong>'+yen(p.grossProfit)+'</strong></div>'}).join(''):'<p class="note">分析画面からAirレジCSVを読み込んでください。</p>';
    var f=sales.filter(function(p){return p.sales>0&&p.grossProfit>0&&p.margin>=35&&p.units>=10}).sort(function(a,b){return b.grossProfit-a.grossProfit}).slice(0,4); $('#focusList').innerHTML=f.map(function(p){return '<div class="focus-item"><b>'+esc(p.name)+'</b><span>粗利 '+yen(p.grossProfit)+' / 粗利率 '+p.margin+'% / '+p.units+'点</span></div>'}).join('');
  }

  function latest(seat){return orders.filter(function(o){return o.seat===seat&&o.status!=='paid'}).sort(function(a,b){return new Date(b.createdAt)-new Date(a.createdAt)})[0]}

  function noOrderInfo(seat){
    var meta=seatAccessMeta[seat];
    if(!meta||meta.open===false||!meta.updatedAt)return null;
    var started=new Date(meta.updatedAt).getTime();
    if(!isFinite(started))return null;
    var hasOrder=orders.some(function(o){return o.seat===seat&&new Date(o.createdAt).getTime()>=started});
    if(hasOrder)return null;
    var mins=Math.floor((Date.now()-started)/60000);
    return mins>=10?{minutes:mins}:null;
  }

  function renderNoOrderAlerts(){
    var box=$('#noOrderAlertList');if(!box)return;
    var alerts=SEATS.map(function(seat){var info=noOrderInfo(seat);return info?{seat:seat,minutes:info.minutes}:null}).filter(Boolean);
    if(!alerts.length){box.style.display='none';box.innerHTML='';return}
    box.style.display='block';
    box.innerHTML='<div class="no-order-alert-title"><strong>⚠ ワンドリンク未注文</strong><span>着席から10分以上</span></div>'+
      '<div class="no-order-alert-seats">'+alerts.map(function(x){return '<button data-no-order-seat="'+esc(x.seat)+'">'+esc(x.seat)+' <small>'+x.minutes+'分</small></button>'}).join('')+'</div>'+
      '<p>注文が入っていない席です。ワンドリンクのご案内をしてください。</p>';
    $$('[data-no-order-seat]').forEach(function(b){
      b.onclick=function(){
        selectedSeat=b.dataset.noOrderSeat;renderSeats();
        var d=$('#seatDetail');if(d)d.scrollIntoView({behavior:'smooth',block:'start'});
      };
    });
  }

  function renderSeats(){
    $$('.seat').forEach(function(b){
      var seat=b.dataset.seat,o=latest(seat),isOpen=seatAccess[seat]!==false,wait=noOrderInfo(seat);
      b.dataset.status=!isOpen?'closed':(wait?'noorder':(o?o.status:'free'));
      b.classList.toggle('selected',selectedSeat===seat);
      b.innerHTML=esc(seat)+(!isOpen?'<br><small>注文停止</small>':(wait?'<br><small>⚠ 未注文 '+wait.minutes+'分</small>':(o?'<br><small>'+LABEL[o.status]+'</small>':'')));
    });
    renderNoOrderAlerts();
    if(selectedSeat) renderSeatDetail(selectedSeat);
  }
  $$('.seat').forEach(function(b){b.onclick=function(){selectedSeat=b.dataset.seat;renderSeats()}});
  $$('.table-box').forEach(function(b){b.onclick=function(){var ss=TABLES[b.dataset.table], os=orders.filter(function(o){return ss.indexOf(o.seat)>=0&&o.status!=='paid'});showModal('<h3>'+b.dataset.table+' テーブル</h3>'+(os.length?os.map(orderHtml).join(''):'<p class="note">現在の注文はありません。</p>')+'<div class="modal-actions"><button class="ghost" data-close>閉じる</button></div>')}});
  function renderSeatDetail(seat){
    var box=$('#seatDetail');
    var seatOrders=orders
      .filter(function(o){return o.seat===seat})
      .sort(function(a,b){return new Date(b.createdAt)-new Date(a.createdAt)});
    var activeOrders=seatOrders.filter(function(o){return o.status!=='paid'});
    var paidOrders=seatOrders.filter(function(o){return o.status==='paid'}).slice(0,10);

    if(!seatOrders.length){
      var isOpen=seatAccess[seat]!==false;
      box.innerHTML='<div class="detail-head"><h3>'+esc(seat)+'</h3><span class="status-chip '+(isOpen?'':'closed')+'">'+(isOpen?'空席・受付中':'注文停止中')+'</span></div>'+
        '<div class="seat-access-control '+(isOpen?'open':'closed')+'"><div><strong>'+(isOpen?'この席は注文受付中':'この席は注文停止中')+'</strong><span>'+(isOpen?'退店したら停止してください。':'次のお客様が着席したら「着席・注文受付開始」を押してください。')+'</span></div><button class="'+(isOpen?'danger-btn':'primary-btn')+'" id="toggleSeatAccess">'+(isOpen?'退店・注文を停止':'着席・注文受付開始')+'</button></div>'+
        '<div class="empty-detail"><strong>注文はありません</strong><span>この席の注文が入ると、ここに履歴として残ります。</span><button class="primary-btn" id="seatDemo">この席にデモ注文</button></div>';
      $('#toggleSeatAccess').onclick=function(){setSeatOpen(seat,!isOpen)};
      $('#seatDemo').onclick=function(){demo(seat)};
      return;
    }

    var activeTotal=activeOrders.reduce(function(sum,o){return sum+Number(o.total||0)},0);
    var isOpen=seatAccess[seat]!==false;

    function seatOrderBlock(o,index,isPaid){
      return '<article class="seat-order-history '+(index===0&&!isPaid?'latest-order':'')+'">'+
        '<div class="seat-order-history-head"><div>'+
          '<div class="seat-order-time">'+time(o.createdAt)+(index===0&&!isPaid?' <span class="latest-badge">最新</span>':'')+'</div>'+
          '<small>注文ID '+esc(String(o.id).slice(-8))+'</small>'+
        '</div><span class="status-chip '+o.status+'">'+(LABEL[o.status]||o.status)+'</span></div>'+
        '<div class="order-items">'+(o.items||[]).map(function(i){return '<div class="order-line"><span>'+esc(i.displayName||i.name)+' ×'+i.qty+'</span><strong>'+yen(i.price*i.qty)+'</strong></div>'}).join('')+'</div>'+
        '<div class="detail-total"><span>この注文</span><strong>'+yen(o.total)+'</strong></div>'+
        (o.note?'<p class="note">メモ：'+esc(o.note)+'</p>':'')+
        (!isPaid?'<div class="status-row">'+['ordered','preparing','served','paid'].map(function(s){return '<button class="status-btn '+(o.status===s?'active':'')+'" data-seat-order-id="'+esc(o.id)+'" data-seat-order-status="'+s+'">'+LABEL[s]+'</button>'}).join('')+'</div>':'')+
      '</article>';
    }

    box.innerHTML=
      '<div class="detail-head"><div><h3>'+esc(seat)+'</h3><span class="detail-meta">現在の注文 '+activeOrders.length+'件</span></div><span class="status-chip '+(isOpen?(activeOrders[0]?activeOrders[0].status:'paid'):'closed')+'">'+(isOpen?(activeOrders.length?'注文あり':'注文受付中'):'注文停止中')+'</span></div>'+
      '<div class="seat-access-control '+(isOpen?'open':'closed')+'"><div><strong>'+(isOpen?'この席は注文受付中':'この席は注文停止中')+'</strong><span>'+(isOpen?'退店したら停止してください。停止後はお客様のスマホから注文できません。':'次のお客様が着席したら「着席・注文受付開始」を押してください。')+'</span></div><button class="'+(isOpen?'danger-btn':'primary-btn')+'" id="toggleSeatAccess">'+(isOpen?'退店・注文を停止':'着席・注文受付開始')+'</button></div>'+
      (activeOrders.length?'<div class="seat-running-total"><span>現在の席合計</span><strong>'+yen(activeTotal)+'</strong></div>':'')+
      '<div class="seat-history-section"><div class="seat-history-title"><strong>現在の注文</strong><span>'+activeOrders.length+'件</span></div>'+
      (activeOrders.length?activeOrders.map(function(o,i){return seatOrderBlock(o,i,false)}).join(''):'<p class="note">未会計の注文はありません。</p>')+
      '</div>'+
      (paidOrders.length?'<div class="seat-history-section paid-history"><div class="seat-history-title"><strong>過去の注文</strong><span>直近'+paidOrders.length+'件</span></div>'+paidOrders.map(function(o,i){return seatOrderBlock(o,i,true)}).join('')+'</div>':'');

    var toggle=$('#toggleSeatAccess');
    if(toggle)toggle.onclick=function(){setSeatOpen(seat,!isOpen)};
    $$('[data-seat-order-id]').forEach(function(b){
      b.onclick=function(){
        var o=orders.find(function(x){return String(x.id)===String(b.dataset.seatOrderId)});
        if(o)setOrderStatus(o,b.dataset.seatOrderStatus);
      };
    });
  }
  function orderHtml(o){return '<div class="order-card"><div class="order-seat">'+esc(o.seat)+'</div><div><b>'+o.items.map(function(i){return esc(i.displayName||i.name)+' ×'+i.qty}).join('、')+'</b><p>'+time(o.createdAt)+' ・ '+o.items.reduce(function(a,i){return a+(i.category==='Fee'?0:i.qty)},0)+'点 ・ '+yen(o.total)+'</p></div><div class="order-card-actions"><span class="status-chip '+o.status+'">'+LABEL[o.status]+'</span><button class="danger-link" data-delete-order="'+esc(o.id)+'">削除</button></div></div>'}
  function renderOrders(){var l=orders.slice().sort(function(a,b){return new Date(b.createdAt)-new Date(a.createdAt)});if(orderFilter!=='all')l=l.filter(function(o){return o.status===orderFilter});$('#ordersList').innerHTML=l.length?l.map(orderHtml).join(''):'<div class="panel note">注文はまだありません。</div>';bindOrderDeleteButtons()}
  $$('[data-order-filter]').forEach(function(b){b.onclick=function(){orderFilter=b.dataset.orderFilter;$$('[data-order-filter]').forEach(function(x){x.classList.toggle('active',x===b)});renderOrders()}}); $('#demoOrderBtn').onclick=function(){demo(SEATS[Math.floor(Math.random()*SEATS.length)])};
  function deleteOrderById(id){
    var o=orders.find(function(x){return String(x.id)===String(id)});
    if(!o)return;
    showModal('<h3>注文を削除しますか？</h3><p class="note">席 '+esc(o.seat)+' / '+o.items.map(function(i){return esc(i.displayName||i.name)+' ×'+i.qty}).join('、')+'</p><p class="delete-warning">この操作は取り消せません。</p><div class="modal-actions"><button class="ghost" data-close>戻る</button><button class="danger-btn" id="confirmDeleteOrder">削除する</button></div>',function(){
      $('#confirmDeleteOrder').onclick=function(){
        closeModal();
        removeOrderById(id);
        if(selectedSeat)renderSeats();
      };
    });
  }
  function bindOrderDeleteButtons(){
    $$('[data-delete-order]').forEach(function(b){
      b.onclick=function(e){e.stopPropagation();deleteOrderById(b.dataset.deleteOrder)};
    });
  }

  function demo(seat){var m=(window.MENU_DATA||[]).slice(0,8);if(!m.length)return;var p=[m[Math.floor(Math.random()*m.length)],m[Math.floor(Math.random()*m.length)]],items=p.map(function(x){return {name:x.name,price:x.price,qty:1}}),o={id:String(Date.now()),seat:seat,status:'ordered',items:items,total:items.reduce(function(a,i){return a+i.price*i.qty},0),createdAt:new Date().toISOString(),note:''};orders.push(o);save('ippukuOrders',orders);selectedSeat=seat;renderAll();startOrderAlarm(o)}


  function renderStrategy(){
    var summary=$('#strategySummary'), cards=$('#strategyCards');
    if(!summary||!cards)return;
    if(!sales.length){
      summary.innerHTML='<div class="strategy-empty">Airレジの商品別売上CSVを読み込むと、強化すべき商品・カテゴリーを自動提案します。</div>';
      cards.innerHTML=''; return;
    }
    var cats={};
    sales.forEach(function(p){
      var k=p.category||'未設定';
      if(!cats[k])cats[k]={name:k,sales:0,profit:0,units:0,products:0};
      cats[k].sales+=Number(p.sales||0);cats[k].profit+=Number(p.grossProfit||0);cats[k].units+=Number(p.units||0);cats[k].products++;
    });
    var ca=Object.keys(cats).map(function(k){var x=cats[k];x.margin=x.sales?x.profit/x.sales*100:0;return x});
    var topProfitCat=ca.slice().sort(function(a,b){return b.profit-a.profit})[0];
    var highMarginCat=ca.filter(function(x){return x.sales>0}).sort(function(a,b){return b.margin-a.margin})[0];

    var positive=sales.filter(function(p){return p.sales>0&&p.grossProfit>0});
    var maxProfit=Math.max.apply(null,positive.map(function(p){return p.grossProfit}).concat([1]));
    var maxUnits=Math.max.apply(null,positive.map(function(p){return p.units}).concat([1]));
    var scored=positive.map(function(p){
      var margin=Math.max(0,Math.min(100,Number(p.margin||0)))/100;
      var profitScore=p.grossProfit/maxProfit, unitScore=p.units/maxUnits;
      var score=profitScore*.5+margin*.3+unitScore*.2;
      return {p:p,score:score};
    }).sort(function(a,b){return b.score-a.score});

    var heroes=scored.filter(function(x){return x.p.margin>=35}).slice(0,4).map(function(x){return x.p});
    var traffic=positive.filter(function(p){return p.margin<20&&p.units>=20}).sort(function(a,b){return b.units-a.units}).slice(0,3);
    var premium=positive.filter(function(p){return p.margin>=35&&p.units<80&&p.grossProfit>=30000}).sort(function(a,b){return b.grossProfit-a.grossProfit}).slice(0,3);
    var weak=sales.filter(function(p){return Number(p.units||0)<=3&&Number(p.grossProfit||0)<5000}).sort(function(a,b){return a.grossProfit-b.grossProfit}).slice(0,4);

    summary.innerHTML=
      '<div><span>利益の柱</span><strong>'+esc(topProfitCat.name)+'</strong><small>粗利 '+yen(topProfitCat.profit)+' / 粗利率 '+topProfitCat.margin.toFixed(1)+'%</small></div>'+
      '<div><span>高粗利カテゴリー</span><strong>'+esc(highMarginCat.name)+'</strong><small>粗利率 '+highMarginCat.margin.toFixed(1)+'%</small></div>'+
      '<div><span>優先強化商品</span><strong>'+(heroes[0]?esc(heroes[0].name):'-')+'</strong><small>'+(heroes[0]?'粗利 '+yen(heroes[0].grossProfit)+' / '+heroes[0].units+'点':'データ不足')+'</small></div>';

    function items(arr){
      return arr.length?'<ul>'+arr.map(function(p){return '<li><b>'+esc(p.name)+'</b><span>売上 '+yen(p.sales)+' / 粗利 '+yen(p.grossProfit)+' / '+p.units+'点</span></li>'}).join('')+'</ul>':'<p class="note">該当商品なし</p>';
    }
    cards.innerHTML=
      '<article class="strategy-card priority"><div class="strategy-icon">↑</div><div><h4>最優先で強化</h4><p>粗利と販売数の両方が強い商品。欠品を避け、メニュー上部・店内POP・SNSで露出を増やす。</p>'+items(heroes)+'</div></article>'+
      '<article class="strategy-card traffic"><div class="strategy-icon">＋</div><div><h4>集客商品として活用</h4><p>販売数は多いが粗利が低い商品。値下げではなく、高粗利ドリンク・軽食・喫煙具のセット提案につなげる。</p>'+items(traffic)+'</div></article>'+
      '<article class="strategy-card premium"><div class="strategy-icon">◆</div><div><h4>高単価商品の接客強化</h4><p>粗利は大きいが販売数がまだ少ない商品。スタッフ提案、実物展示、Instagramで魅力を説明して成約率を上げる。</p>'+items(premium)+'</div></article>'+
      '<article class="strategy-card review"><div class="strategy-icon">−</div><div><h4>仕入れを見直す</h4><p>期間中の販売数・粗利が小さい商品。棚を圧迫するなら追加仕入れを止め、売り切って入替候補にする。</p>'+items(weak)+'</div></article>';
  }

  function verdict(p){if(p.grossProfit>=100000&&p.margin>=35)return ['強化候補','focus'];if(p.grossProfit<=0||(p.units<=2&&p.sales<10000))return ['見直し','review'];return ['維持','keep']}
  function renderAnalytics(){renderStrategy();var top=sales.slice().sort(function(a,b){return b.grossProfit-a.grossProfit}).slice(0,10);$('#profitTable').innerHTML=top.map(function(p,i){return '<div class="rank-row"><span class="rank-num">'+(i+1)+'</span><div><b>'+esc(p.name)+'</b><small>'+esc(p.category)+' / 粗利率 '+p.margin+'%</small></div><strong>'+yen(p.grossProfit)+'</strong></div>'}).join('');var c={};sales.forEach(function(p){var k=p.category||'未設定';if(!c[k])c[k]={sales:0,profit:0,units:0};c[k].sales+=p.sales;c[k].profit+=p.grossProfit;c[k].units+=p.units});var a=Object.keys(c).map(function(k){return {name:k,sales:c[k].sales,profit:c[k].profit,units:c[k].units}}).sort(function(x,y){return y.profit-x.profit}),max=Math.max.apply(null,a.map(function(x){return x.profit}).concat([1]));$('#categoryBars').innerHTML=a.slice(0,8).map(function(x){return '<div class="bar-row"><div class="bar-label"><span>'+esc(x.name)+'</span><b>'+yen(x.profit)+'</b></div><div class="bar-track"><div class="bar-fill" style="width:'+Math.max(2,x.profit/max*100)+'%"></div></div><div class="bar-sub">売上 '+yen(x.sales)+' / '+x.units.toLocaleString()+'点</div></div>'}).join('');renderProductTable()}
  function renderProductTable(){var q=($('#productSearch').value||'').toLowerCase(),l=sales.filter(function(p){return (p.name+' '+p.category).toLowerCase().indexOf(q)>=0}).sort(function(a,b){return b.grossProfit-a.grossProfit}).slice(0,150);$('#productTableBody').innerHTML=l.map(function(p){var v=verdict(p);return '<tr><td><b>'+esc(p.name)+'</b></td><td>'+esc(p.category)+'</td><td>'+yen(p.sales)+'</td><td>'+Number(p.units||0).toLocaleString()+'</td><td>'+yen(p.grossProfit)+'</td><td>'+p.margin+'%</td><td><span class="tag '+v[1]+'">'+v[0]+'</span></td></tr>'}).join('')}
  $('#productSearch').oninput=renderProductTable;
  $('#csvInput').onchange=function(e){var f=e.target.files[0];if(!f)return;var r=new FileReader();r.onload=function(){try{var rows=parseCSV(r.result),h=rows[0].map(function(x){return x.trim()}),ix=function(n){return h.indexOf(n)},num=function(row,n){return Number(String(row[ix(n)]||'0').replace(/,/g,''))||0};var m=rows.slice(1).filter(function(row){return row[ix('商品名')]}).map(function(row){var s=num(row,'販売総売上'),g=num(row,'粗利総額'),u=num(row,'販売商品数');return {name:row[ix('商品名')],category:row[ix('カテゴリー')]||'未設定',sales:s,grossProfit:g,units:u,margin:s?Number((g/s*100).toFixed(1)):0}});if(m.length){sales=m;save('ippukuSales',sales);alert(m.length+'商品を読み込みました');renderAll()}}catch(err){alert('CSVを読み込めませんでした')}};r.readAsText(f,'Shift_JIS')};
  function parseCSV(t){var out=[],row=[],v='',q=false;for(var i=0;i<t.length;i++){var c=t[i],n=t[i+1];if(q){if(c==='"'&&n==='"'){v+='"';i++}else if(c==='"')q=false;else v+=c}else{if(c==='"')q=true;else if(c===','){row.push(v);v=''}else if(c==='\n'){row.push(v.replace(/\r$/,''));out.push(row);row=[];v=''}else v+=c}}if(v||row.length){row.push(v);out.push(row)}return out}

  function knownInventoryShops(){
    var preferred=['イオン','ネット','コストコ','アスクル','Mr.Max','コスモス','業務スーパー'];
    var used=[];
    inventory.forEach(function(x){
      var s=String(x.shop||'').trim();
      if(s&&used.indexOf(s)<0)used.push(s);
    });
    used.sort(function(a,b){
      var ai=preferred.indexOf(a),bi=preferred.indexOf(b);
      if(ai<0)ai=999;if(bi<0)bi=999;
      return ai===bi?a.localeCompare(b,'ja'):ai-bi;
    });
    return used;
  }

  function inventoryShopLabel(x){
    return String(x.shop||'').trim()||'未設定';
  }

  function renderInventory(){
    var inventoryList=$('#inventoryList');
    var filterBox=$('#inventoryShopFilters');
    if(!inventoryList)return;

    var shops=knownInventoryShops();
    var filterItems=['all'].concat(shops);
    if(inventory.some(function(x){return !String(x.shop||'').trim()}))filterItems.push('__unset__');

    if(filterBox){
      filterBox.innerHTML=filterItems.map(function(s){
        var label=s==='all'?'すべて':(s==='__unset__'?'未設定':s);
        return '<button class="inventory-shop-filter '+(inventoryShopFilter===s?'active':'')+'" data-inventory-shop="'+esc(s)+'">'+esc(label)+'</button>';
      }).join('');
      $$('[data-inventory-shop]').forEach(function(b){
        b.onclick=function(){inventoryShopFilter=b.dataset.inventoryShop;renderInventory()};
      });
    }

    var rows=inventory.map(function(x,i){return {x:x,i:i}}).filter(function(row){
      if(inventoryShopFilter==='all')return true;
      if(inventoryShopFilter==='__unset__')return !String(row.x.shop||'').trim();
      return String(row.x.shop||'').trim()===inventoryShopFilter;
    });

    var groups={};
    rows.forEach(function(row){
      var k=inventoryShopLabel(row.x);
      if(!groups[k])groups[k]=[];
      groups[k].push(row);
    });

    var order=Object.keys(groups).sort(function(a,b){
      if(a==='未設定')return 1;if(b==='未設定')return -1;
      var pref=['イオン','ネット','コストコ','アスクル','Mr.Max','コスモス','業務スーパー'];
      var ai=pref.indexOf(a),bi=pref.indexOf(b);
      if(ai<0)ai=999;if(bi<0)bi=999;
      return ai===bi?a.localeCompare(b,'ja'):ai-bi;
    });

    if(!rows.length){
      inventoryList.innerHTML='<div class="panel note">この購入先の商品はありません。</div>';
      return;
    }

    inventoryList.innerHTML=order.map(function(shop){
      var cards=groups[shop].map(function(row){
        var x=row.x,i=row.i;
        var hasStock=x.stock!==''&&x.stock!==null&&x.stock!==undefined&&!isNaN(Number(x.stock));
        var stock=hasStock?Number(x.stock):null;
        var low=hasStock&&stock<=Number(x.min||0);
        var meta=(x.source?esc(x.source)+' / ':'')+'基準 '+x.min+esc(x.unit)+(x.note?' / '+esc(x.note):'');
        return '<div class="inventory-card">'+
          '<div class="inventory-main"><div class="inventory-card-title"><b>'+esc(x.name)+'</b><span class="inventory-shop-badge">'+esc(shop)+'</span></div>'+
          '<small>'+meta+(low?' ・ 補充/買出し推奨':'')+'</small></div>'+
          '<input class="stock-input" type="number" step="0.01" placeholder="現在庫" value="'+(hasStock?stock:'')+'" data-stock="'+i+'">'+
          '<span class="status '+(!hasStock?'waiting':(low?'waiting':'ok'))+'">'+(!hasStock?'未入力':stock+esc(x.unit))+'</span>'+
          '<button class="inventory-edit-btn" data-edit-inventory="'+i+'">編集</button>'+
        '</div>';
      }).join('');
      return '<section class="inventory-shop-group"><div class="inventory-shop-head"><h3>'+esc(shop)+'</h3><span>'+groups[shop].length+'品</span></div>'+cards+'</section>';
    }).join('');

    $$('[data-stock]').forEach(function(inp){
      inp.onchange=function(){
        var v=inp.value.trim();
        inventory[Number(inp.dataset.stock)].stock=v===''?'':Number(v);
        save('ippukuInventory',inventory);
        renderInventory();
      };
    });
    $$('[data-edit-inventory]').forEach(function(b){
      b.onclick=function(){openInventoryEditor(Number(b.dataset.editInventory))};
    });
  }

  function inventoryShopOptions(){
    var shops=['イオン','ネット','コストコ','アスクル','Mr.Max','コスモス','業務スーパー'];
    knownInventoryShops().forEach(function(s){if(shops.indexOf(s)<0)shops.push(s)});
    return shops.map(function(s){return '<option value="'+esc(s)+'"></option>'}).join('');
  }

  function openInventoryEditor(index){
    var isNew=index<0;
    var x=isNew?{name:'',stock:'',min:0,unit:'個',source:'',shop:''}:inventory[index];
    showModal(
      '<h3>'+(isNew?'在庫商品を追加':'在庫商品を編集')+'</h3>'+
      '<div class="form-row"><label>商品名</label><input id="invName" value="'+esc(x.name||'')+'"></div>'+
      '<div class="form-row"><label>購入先</label><input id="invShop" list="inventoryShopChoices" placeholder="例：イオン / コストコ / ネット" value="'+esc(x.shop||'')+'"><datalist id="inventoryShopChoices">'+inventoryShopOptions()+'</datalist></div>'+
      '<div class="form-row"><label>保管場所・チェック場所</label><input id="invSource" placeholder="例：冷凍庫 / 棚3" value="'+esc(x.source||'')+'"></div>'+
      '<div class="inventory-edit-grid">'+
        '<div class="form-row"><label>現在庫</label><input id="invStock" type="number" step="0.01" value="'+(x.stock===''?'':Number(x.stock||0))+'"></div>'+
        '<div class="form-row"><label>補充・買出し基準</label><input id="invMin" type="number" step="0.01" value="'+Number(x.min||0)+'"></div>'+
        '<div class="form-row"><label>単位</label><input id="invUnit" value="'+esc(x.unit||'個')+'"></div>'+
      '</div>'+
      '<div class="modal-actions">'+
        (!isNew?'<button class="danger-btn" id="deleteInventoryItem">削除</button>':'')+
        '<button class="ghost" data-close>取消</button><button class="primary-btn" id="saveInv">保存</button>'+
      '</div>',
      function(){
        $('#saveInv').onclick=function(){
          var stockValue=$('#invStock').value.trim();
          var item={
            name:$('#invName').value.trim()||'未設定',
            shop:$('#invShop').value.trim(),
            source:$('#invSource').value.trim(),
            stock:stockValue===''?'':Number(stockValue),
            min:Number($('#invMin').value)||0,
            unit:$('#invUnit').value.trim()||'個'
          };
          if(!isNew&&x.note)item.note=x.note;
          if(isNew)inventory.push(item);else inventory[index]=item;
          save('ippukuInventory',inventory);
          closeModal();renderInventory();
        };
        var del=$('#deleteInventoryItem');
        if(del)del.onclick=function(){
          if(!confirm('この在庫商品を削除しますか？'))return;
          inventory.splice(index,1);
          save('ippukuInventory',inventory);
          closeModal();renderInventory();
        };
      }
    );
  }

  function buildInventoryLineText(){
    var low=inventory.filter(function(x){
      var has=x.stock!==''&&x.stock!==null&&x.stock!==undefined&&!isNaN(Number(x.stock));
      return has&&Number(x.stock)<=Number(x.min||0);
    });
    var now=new Date();
    var date=(now.getMonth()+1)+'/'+now.getDate();
    var lines=['【いっぷく 在庫連絡 '+date+'】'];

    function addGroup(title,list){
      if(!list.length)return;
      lines.push('', '▼'+title);
      list.forEach(function(x){
        lines.push('・'+x.name+'　現在 '+Number(x.stock)+x.unit+' / 基準 '+x.min+x.unit);
      });
    }

    var refill=low.filter(function(x){return String(x.source||'').indexOf('スタンバイ')===0});
    var buy=low.filter(function(x){return String(x.source||'').indexOf('スタンバイ')!==0});
    var byShop={};
    buy.forEach(function(x){
      var shop=inventoryShopLabel(x);
      if(!byShop[shop])byShop[shop]=[];
      byShop[shop].push(x);
    });
    Object.keys(byShop).sort(function(a,b){
      if(a==='未設定')return 1;if(b==='未設定')return -1;
      return a.localeCompare(b,'ja');
    }).forEach(function(shop){
      addGroup(shop==='未設定'?'購入先未設定':shop+'で購入',byShop[shop]);
    });
    addGroup('店内補充が必要',refill);

    if(!low.length)lines.push('', '現在、基準以下の在庫はありません。');
    return lines.join('\n');
  }

  async function copyTextToClipboard(text){
    try{
      if(navigator.clipboard&&navigator.clipboard.writeText){
        await navigator.clipboard.writeText(text);
        return true;
      }
    }catch(e){}
    try{
      var ta=document.createElement('textarea');
      ta.value=text;ta.style.position='fixed';ta.style.opacity='0';
      document.body.appendChild(ta);ta.focus();ta.select();
      var ok=document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    }catch(e){return false}
  }

  function openInventoryLineCopy(){
    var text=buildInventoryLineText();
    showModal(
      '<h3>LINE用 在庫リスト</h3>'+
      '<p class="note">不足品を購入先ごとにまとめています。未入力の商品は含みません。</p>'+
      '<textarea id="inventoryLineText" class="line-copy-text" readonly>'+esc(text)+'</textarea>'+
      '<div class="modal-actions"><button class="ghost" data-close>閉じる</button><button class="ghost" id="shareInventoryLine">共有</button><button class="primary-btn" id="copyInventoryLine">まとめてコピー</button></div>',
      function(){
        $('#copyInventoryLine').onclick=async function(){
          var txt=$('#inventoryLineText').value;
          var ok=await copyTextToClipboard(txt);
          if(ok){
            this.textContent='コピーしました ✓';
            var b=this;setTimeout(function(){b.textContent='まとめてコピー'},1200);
          }else{
            $('#inventoryLineText').focus();$('#inventoryLineText').select();
            alert('自動コピーできなかったので、表示された文章を長押ししてコピーしてください。');
          }
        };
        $('#shareInventoryLine').onclick=async function(){
          var txt=$('#inventoryLineText').value;
          if(navigator.share){
            try{await navigator.share({text:txt});return}catch(e){if(e&&e.name==='AbortError')return}
          }
          var ok=await copyTextToClipboard(txt);
          alert(ok?'共有機能が使えないためコピーしました。LINEに貼り付けてください。':'文章を長押ししてコピーしてください。');
        };
      }
    );
  }
  var inventoryLineBtn=$('#inventoryLineBtn');
  if(inventoryLineBtn)inventoryLineBtn.onclick=openInventoryLineCopy;

  var addInventoryBtn=$('#addInventoryBtn');
  if(addInventoryBtn)addInventoryBtn.onclick=function(){openInventoryEditor(-1)};

  function renderReserves(){$('#reserveList').innerHTML=reserves.length?reserves.map(function(r,i){return '<div class="reserve-card"><div><b>'+esc(r.item)+' ×'+r.qty+'</b><small>'+esc(r.name||'お客様')+' / 来店 '+esc(r.date)+' '+esc(r.time||'')+'</small></div><span class="status waiting">'+esc(r.date)+'</span><button class="ghost" data-del-res="'+i+'">完了</button></div>'}).join(''):'<div class="panel note">取り置きはありません。</div>';$$('[data-del-res]').forEach(function(b){b.onclick=function(){reserves.splice(Number(b.dataset.delRes),1);save('ippukuReserves',reserves);renderAll()}})}
  $('#addReserveBtn').onclick=function(){showModal('<h3>取り置き追加</h3><div class="form-row"><label>お客様名</label><input id="resName"></div><div class="form-row"><label>商品・銘柄</label><input id="resItem"></div><div class="form-row"><label>個数</label><input id="resQty" type="number" value="1"></div><div class="form-row"><label>来店日</label><input id="resDate" type="date"></div><div class="form-row"><label>時間</label><input id="resTime" type="time"></div><div class="modal-actions"><button class="ghost" data-close>取消</button><button class="primary-btn" id="saveRes">追加</button></div>',function(){$('#saveRes').onclick=function(){reserves.push({name:$('#resName').value,item:$('#resItem').value||'未設定',qty:Number($('#resQty').value)||1,date:$('#resDate').value,time:$('#resTime').value});save('ippukuReserves',reserves);closeModal();renderAll()}})};


  function normName(v){return String(v||'').replace(/[・･\s　]/g,'').toLowerCase()}
  function promoProduct(name){var n=normName(name);return (window.MENU_DATA||[]).find(function(x){return normName(x.name)===n})}
  function autoPromoCandidates(){
    var menu=window.MENU_DATA||[];
    var matched=sales.filter(function(p){return menu.some(function(m){return normName(m.name)===normName(p.name)})&&p.sales>0&&p.grossProfit>0})
      .sort(function(a,b){
        var as=(a.grossProfit||0)*0.55+(a.units||0)*80+Math.max(0,a.margin||0)*300;
        var bs=(b.grossProfit||0)*0.55+(b.units||0)*80+Math.max(0,b.margin||0)*300;
        return bs-as;
      }).slice(0,4);
    return matched.map(function(p){return p.name});
  }
  function defaultPromoCopy(name){
    var m=promoProduct(name), cat=m?m.category:'';
    if(cat==='Snack')return {tag:'一緒にどうぞ',headline:'小腹が空いたら、これ。',copy:'ドリンクと相性のいい一品です。ひと休みのお供にどうぞ。'};
    if(cat==='Café'||cat==='Relax'||cat==='Refresh')return {tag:'いっぷくおすすめ',headline:'もう一杯、ゆっくり。',copy:'喫煙時間のお供に。ゆっくり過ごしたい時におすすめです。'};
    return {tag:'スタッフおすすめ',headline:'今、試してほしい一品。',copy:'いっぷくからのおすすめです。ぜひ一度お試しください。'};
  }
  function activePromos(){
    var list=promos.filter(function(p){return p.active!==false&&promoProduct(p.product)});
    if(list.length)return list.slice(0,3);
    var auto=autoPromoCandidates();
    if(!auto.length)auto=(window.MENU_DATA||[]).slice(0,2).map(function(x){return x.name});
    return auto.slice(0,3).map(function(name){var c=defaultPromoCopy(name);return {product:name,tag:c.tag,headline:c.headline,copy:c.copy,active:true}});
  }
  function renderCustomerPromos(){
    var box=$('#customerPromo'); if(!box)return;
    var ps=activePromos();
    var cling=promoProduct('The Cling Lighter ガチャ');
    box.style.display='block';
    box.innerHTML=
      '<article class="cling-promo"><div class="cling-kicker">当店おすすめ！</div><h3>The Cling Lighter</h3><p>開閉時に鳴る音が魅力のライターです。<strong>タバコ試し吸い棚にサンプルを置いています。</strong> 実際に手に取って、ぜひ音を鳴らしてみてください。</p><div class="cling-try-note"><span>🔊 SAMPLE</span><b>試し吸い棚で音を体験できます</b><small>料金・購入方法も棚に詳しく掲示しています。</small></div><div class="cling-price-grid"><div><span>ガチャ・ランダム</span><strong>¥10,000</strong></div><div><span>指名買い</span><strong>¥15,000〜¥20,000</strong></div></div><button class="cling-order-btn" id="clingGachaAdd">ガチャで注文 ¥10,000</button><small>※ 指名買いはサンプル棚の料金案内をご確認いただくか、スタッフへお声がけください。</small></article>'+
      (ps.length?'<div class="promo-title-row"><div><span class="eyebrow">RECOMMENDED</span><h3>今、いっぷくでおすすめ</h3></div><small>気になったらそのまま追加できます</small></div><div class="promo-scroll">'+ps.map(function(p,i){var m=promoProduct(p.product);return '<article class="promo-card"><span class="promo-tag">'+esc(p.tag||'おすすめ')+'</span><div class="promo-copy"><h3>'+esc(p.headline||p.product)+'</h3><p>'+esc(p.copy||'ぜひ一度お試しください。')+'</p></div><div class="promo-product"><div><b>'+esc(p.product)+'</b><strong>'+yen(m?m.price:0)+'</strong></div><button class="promo-add" data-promo-add="'+esc(p.product)+'">これを注文 ＋</button></div></article>'}).join('')+'</div>':'');
    var clingBtn=$('#clingGachaAdd');
    if(clingBtn&&cling)clingBtn.onclick=function(){addMenuItem(cling,function(){clingBtn.textContent='追加しました ✓';setTimeout(function(){clingBtn.textContent='ガチャで注文 ¥10,000'},900)})};
    $$('[data-promo-add]').forEach(function(b){b.onclick=function(){var m=promoProduct(b.dataset.promoAdd);if(!m)return;addMenuItem(m,function(){b.textContent='追加しました ✓';setTimeout(function(){b.textContent='これを注文 ＋'},900)})}});
    refreshCustomerSeatAccess(false);
  }
  function renderPromoManager(){
    var menu=window.MENU_DATA||[];
    var candidates=autoPromoCandidates();
    var rows=promos.map(function(p,i){return '<div class="promo-manage-row"><div><b>'+esc(p.product)+'</b><small>'+esc(p.tag||'おすすめ')+' / '+esc(p.headline||'')+'</small></div><button class="ghost" data-edit-promo="'+i+'">編集</button><button class="ghost" data-del-promo="'+i+'">削除</button></div>'}).join('');
    showModal('<h3>販促POP管理</h3><p class="note">ここで登録した商品を、お客様のモバイルオーダー上部で目立たせます。粗利などの内部情報はお客様には表示しません。</p>'+
      (candidates.length?'<div class="promo-suggest"><b>分析からの候補</b><p>'+candidates.map(function(n){return '<button class="filter" data-auto-promo="'+esc(n)+'">'+esc(n)+'</button>'}).join(' ')+'</p></div>':'')+
      '<div class="promo-manage-list">'+(rows||'<p class="note">POPはまだありません。</p>')+'</div><div class="modal-actions"><button class="ghost" data-close>閉じる</button><button class="primary-btn" id="addPromo">＋ POP追加</button></div>',function(){
        $('#addPromo').onclick=function(){editPromo(-1)};
        $$('[data-edit-promo]').forEach(function(b){b.onclick=function(){editPromo(Number(b.dataset.editPromo))}});
        $$('[data-del-promo]').forEach(function(b){b.onclick=function(){promos.splice(Number(b.dataset.delPromo),1);save('ippukuPromos',promos);closeModal();renderPromoManager()}});
        $$('[data-auto-promo]').forEach(function(b){b.onclick=function(){var n=b.dataset.autoPromo;if(!promos.some(function(p){return p.product===n})){var c=defaultPromoCopy(n);promos.push({product:n,tag:c.tag,headline:c.headline,copy:c.copy,active:true});save('ippukuPromos',promos)}closeModal();renderPromoManager()}});
      });
  }
  function editPromo(index){
    var menu=window.MENU_DATA||[], current=index>=0?promos[index]:null, selected=current?current.product:(menu[0]?menu[0].name:'');
    var c=current||defaultPromoCopy(selected);
    showModal('<h3>'+(index>=0?'POPを編集':'POPを追加')+'</h3><div class="form-row"><label>宣伝する商品</label><select id="promoProduct">'+menu.map(function(m){return '<option '+(m.name===selected?'selected':'')+'>'+esc(m.name)+'</option>'}).join('')+'</select></div><div class="form-row"><label>小見出し</label><input id="promoTag" value="'+esc(c.tag||'')+'" placeholder="例：スタッフおすすめ"></div><div class="form-row"><label>大きな見出し</label><input id="promoHeadline" value="'+esc(c.headline||'')+'" placeholder="例：まずは、ほっと一杯。"></div><div class="form-row"><label>宣伝文</label><input id="promoCopy" value="'+esc(c.copy||'')+'" placeholder="商品の魅力を短く"></div><div class="modal-actions"><button class="ghost" data-close>取消</button><button class="primary-btn" id="savePromo">保存</button></div>',function(){
      $('#promoProduct').onchange=function(){var d=defaultPromoCopy(this.value);$('#promoTag').value=d.tag;$('#promoHeadline').value=d.headline;$('#promoCopy').value=d.copy};
      $('#savePromo').onclick=function(){var p={product:$('#promoProduct').value,tag:$('#promoTag').value||'おすすめ',headline:$('#promoHeadline').value||$('#promoProduct').value,copy:$('#promoCopy').value||'ぜひ一度お試しください。',active:true};if(index>=0)promos[index]=p;else promos.push(p);save('ippukuPromos',promos);closeModal();};
    });
  }

  function renderCustomer(){if(!customerSeat){showModal('<h3>席番号を選択</h3><div class="form-row"><select id="seatSelect">'+SEATS.map(function(s){return '<option>'+s+'</option>'}).join('')+'</select></div><div class="modal-actions"><button class="primary-btn" id="seatChoose">この席で注文</button></div>',function(){$('#seatChoose').onclick=function(){customerSeat=$('#seatSelect').value;save('ippukuCustomerSeat',customerSeat);closeModal();renderCustomer()}})}$('#customerSeat').textContent=customerSeat||'未選択';renderCustomerMenu();try{renderCustomerPromos()}catch(e){console.error('promo render failed',e)}renderCart()}
  function menuMeta(x){
    var parts=[];
    if(x.badges&&x.badges.length)parts.push(x.badges.join(' / '));
    if(x.description)parts.push(x.description);
    return parts.join(' ・ ');
  }
  function cartKey(item,optionText){return item.name+'||'+(optionText||'')}
  function pushCart(item,optionText,priceDelta){
    var key=cartKey(item,optionText),f=cart.find(function(y){return y.key===key});
    var finalPrice=Number(item.price||0)+Number(priceDelta||0);
    if(f)f.qty++;
    else cart.push({key:key,name:item.name,displayName:item.name+(optionText?' / '+optionText:''),category:item.category,price:finalPrice,basePrice:item.price,qty:1,option:optionText||'',nightFeeExempt:item.nightFeeExempt===true});
    renderCart();
  }
  function addMenuItem(item,done){
    if(!customerSeatOpen){alert('この席の注文受付は終了しました。');return}
    if(!item.choices||!item.choices.length){
      pushCart(item,item.fixedOption||'',0); if(done)done(); return;
    }
    var selected=[],step=0,totalDelta=0;
    function chooseStep(){
      var group=item.choices[step];
      showModal(
        '<div class="choice-step"><span class="eyebrow">STEP '+(step+1)+' / '+item.choices.length+'</span><h3>'+esc(item.name)+'</h3><p class="choice-label">'+esc(group.label)+'</p>'+
        '<div class="choice-grid">'+group.options.map(function(o){var label=typeof o==='string'?o:o.label;var delta=typeof o==='string'?0:Number(o.priceDelta||0);return '<button class="choice-btn" data-choice="'+esc(label)+'" data-delta="'+delta+'">'+esc(label)+(delta>0?'<small> +'+yen(delta)+'</small>':'')+'</button>'}).join('')+'</div>'+
        '<div class="choice-current">'+(selected.length?'選択中：'+selected.map(function(x){return esc(x.label)+' '+esc(x.value)}).join(' / '):'')+'</div>'+
        '<div class="modal-actions"><button class="ghost" data-close>キャンセル</button></div>',
        function(){
          $$('[data-choice]').forEach(function(b){
            b.onclick=function(){
              selected.push({label:group.label,value:b.dataset.choice});
              totalDelta+=Number(b.dataset.delta||0);
              step++;
              if(step<item.choices.length){chooseStep();return}
              var text=selected.map(function(x){return x.label+': '+x.value}).join(' / ');
              pushCart(item,text,totalDelta);closeModal();if(done)done();
            };
          });
        }
      );
    }
    chooseStep();
  }

  function renderCustomerMenu(){
    var all=window.MENU_DATA||[],cats=[];
    all.forEach(function(x){if(cats.indexOf(x.category)<0)cats.push(x.category)});
    var labels={all:'すべて','Café':'Café','Relax':'Relax','Refresh':'Refresh','Food':'軽食','Dessert':'スイーツ','Snack':'Snack','Gacha':'ガチャ','Lighter':'ライター'};
    var filters=[{key:'all',label:'すべて'}].concat(cats.map(function(c){return {key:c,label:labels[c]||c}}));
    $('#customerCategoryFilters').innerHTML=filters.map(function(f){return '<button class="customer-filter '+(customerCategory===f.key?'active':'')+'" data-customer-filter="'+esc(f.key)+'">'+esc(f.label)+'</button>'}).join('');
    $$('[data-customer-filter]').forEach(function(b){b.onclick=function(){customerCategory=b.dataset.customerFilter;renderCustomerMenu()}});
    var m=customerCategory==='all'?all:all.filter(function(x){return x.category===customerCategory});
    $('#customerMenu').innerHTML=m.map(function(x){
      var idx=all.findIndex(function(y){return y===x}),meta=menuMeta(x);
      return '<article class="menu-card '+(x.image?'with-photo':'')+'"><button class="menu-card-tap" data-add="'+idx+'" aria-label="'+esc(x.name)+'を追加">'+(x.image?'<div class="menu-photo-wrap"><img class="menu-photo" src="'+esc(x.image)+'" alt="'+esc(x.name)+'" loading="lazy"></div>':'')+'<div><small>'+esc(labels[x.category]||x.category)+'</small><h3>'+esc(x.name)+'</h3>'+(meta?'<p class="menu-meta">'+esc(meta)+'</p>':'')+'</div><div class="menu-bottom"><strong>'+yen(x.price)+(x.name==='濃厚バニラアイス'?'<small class="price-note">〜</small>':'')+'</strong><span class="add-btn">＋</span></div></button></article>';
    }).join('');
    $$('[data-add]').forEach(function(b){b.onclick=function(){var x=all[Number(b.dataset.add)];addMenuItem(x,function(){b.classList.add('just-added');setTimeout(function(){b.classList.remove('just-added')},350)})}});
  }

  function isNightChargeTime(){
    try{
      var parts=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Tokyo',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date());
      var wd=(parts.find(function(p){return p.type==='weekday'})||{}).value||'';
      var h=Number((parts.find(function(p){return p.type==='hour'})||{}).value||0);
      var m=Number((parts.find(function(p){return p.type==='minute'})||{}).value||0);
      var mins=h*60+m;
      if(wd==='Fri')return mins>=1260;
      if(wd==='Sat')return mins<60||mins>=1260;
      if(wd==='Sun')return mins<60;
      return false;
    }catch(e){
      return false;
    }
  }
  function cartHasDrink(items){
    return items.some(function(i){return i.category==='Café'||i.category==='Relax'||i.category==='Refresh'});
  }
  function cartHasFoodLike(items){
    return items.some(function(i){return i.category==='Food'||i.category==='Dessert'||i.category==='Snack'});
  }
  function upsellItems(){
    var menu=window.MENU_DATA||[];
    return ['ポパイサンド','あんバターサンド','チーズケーキ'].map(function(name){
      return menu.find(function(x){return x.name===name});
    }).filter(Boolean);
  }
  function renderDrinkUpsell(){
    var box=$('#drinkUpsellBanner');if(!box)return;
    var show=cartHasDrink(cart)&&!cartHasFoodLike(cart);
    box.style.display=show?'block':'none';
    if(!show){box.innerHTML='';return}
    var items=upsellItems();
    box.innerHTML='<div class="drink-upsell-head"><div><span>ご一緒にどうですか？</span><strong>ドリンクと一緒に軽食・スイーツも</strong></div><small>タップで追加できます</small></div>'+
      '<div class="drink-upsell-scroll">'+items.map(function(x){
        return '<button class="drink-upsell-card" data-upsell-add="'+esc(x.name)+'">'+
          (x.image?'<img src="'+esc(x.image)+'" alt="">':'')+
          '<span><b>'+esc(x.name)+'</b><small>'+yen(x.price)+'</small></span><i>＋</i></button>';
      }).join('')+'</div>';
    $$('[data-upsell-add]').forEach(function(b){
      b.onclick=function(){
        var item=(window.MENU_DATA||[]).find(function(x){return x.name===b.dataset.upsellAdd});
        if(!item)return;
        pushCart(item,'',0);
        renderDrinkUpsell();
      };
    });
  }
  function cartAmounts(items){
    var subtotal=items.reduce(function(a,i){return a+Number(i.price||0)*Number(i.qty||0)},0);
    var feeBase=items.reduce(function(a,i){
      if(i.nightFeeExempt===true||i.name==='ZIPPOガチャ'||i.name==='The Cling Lighter ガチャ')return a;
      return a+Number(i.price||0)*Number(i.qty||0);
    },0);
    var nightFee=isNightChargeTime()?Math.round(feeBase*.10):0;
    return {subtotal:subtotal,nightFeeBase:feeBase,nightFee:nightFee,total:subtotal+nightFee};
  }
  function renderCart(){
    var q=cart.reduce(function(a,i){return a+i.qty},0),a=cartAmounts(cart);
    $('#cartSummary').textContent=q+'点 / '+yen(a.total);
    renderDrinkUpsell();
  }
  function signalNewOrderSafely(order){
    setTimeout(function(){
      try{
        var signal={id:order.id,seat:order.seat,items:order.items,total:order.total,ts:Date.now()};
        localStorage.setItem('ippukuOrderSignal',JSON.stringify(signal));
        if(orderChannel)try{orderChannel.postMessage(signal)}catch(e){}
      }catch(e){console.error('order signal failed',e)}
    },0);
  }
  async function openCartModal(){
    if(backendReady){
      var allowed=await refreshCustomerSeatAccess(false);
      if(!allowed){alert('この席の注文受付は終了しました。');return}
    }
    if(!cart.length){alert('商品を選んでください');return}
    if(!customerDrinkSatisfied&&!cartHasDrink(cart)){
      alert('当店はワンドリンクオーダー制です。先にドリンクを1杯以上お選びください。');
      return;
    }
    function draw(){
      var amounts=cartAmounts(cart);
      var upsellHtml='';
      if(cartHasDrink(cart)&&!cartHasFoodLike(cart)){
        var u=upsellItems();
        upsellHtml='<section class="checkout-upsell"><div class="checkout-upsell-title"><span>あと1品いかがですか？</span><strong>ドリンクと相性のいいおすすめ</strong></div><div class="checkout-upsell-grid">'+u.map(function(x){
          return '<button data-checkout-upsell="'+esc(x.name)+'">'+(x.image?'<img src="'+esc(x.image)+'" alt="">':'')+'<span><b>'+esc(x.name)+'</b><small>'+yen(x.price)+'</small></span><i>＋</i></button>';
        }).join('')+'</div></section>';
      }
      $('#modal').innerHTML='<h3>注文内容</h3><div class="cart-edit-list">'+cart.map(function(i,idx){return '<div class="cart-edit-row"><div class="cart-edit-info"><b>'+esc(i.displayName||i.name)+'</b><small>'+yen(i.price)+' / 1点</small></div><div class="cart-qty"><button class="qty-btn" data-cart-dec="'+idx+'">−</button><strong>'+i.qty+'</strong><button class="qty-btn" data-cart-inc="'+idx+'">＋</button></div><div class="cart-line-total">'+yen(i.price*i.qty)+'</div><button class="cart-remove" data-cart-remove="'+idx+'">削除</button></div>'}).join('')+'</div>'+upsellHtml+
        '<div class="checkout-totals"><div><span>商品小計</span><strong>'+yen(amounts.subtotal)+'</strong></div>'+
        (amounts.nightFee?'<div class="night-fee-line"><span>深夜料金（金・土 21時以降 10%）</span><strong>＋'+yen(amounts.nightFee)+'</strong></div>':'<div class="night-fee-info">金・土の21:00〜翌1:00は深夜料金10%が加算されます。ZIPPOガチャ・Clingガチャは対象外です。</div>')+
        '<div class="detail-total"><span>合計</span><strong>'+yen(amounts.total)+'</strong></div></div>'+
        '<div class="form-row"><label>スタッフへのメモ</label><input id="orderNote" placeholder="例：氷少なめ"></div><div class="modal-actions"><button class="ghost" data-close>戻る</button><button class="primary-btn" id="submitOrder">注文する</button></div>';
      $$('[data-close]').forEach(function(b){b.onclick=closeModal});
      $$('[data-cart-dec]').forEach(function(b){b.onclick=function(){var i=Number(b.dataset.cartDec);cart[i].qty--;if(cart[i].qty<=0)cart.splice(i,1);renderCart();if(!cart.length){closeModal();return}draw()}});
      $$('[data-cart-inc]').forEach(function(b){b.onclick=function(){cart[Number(b.dataset.cartInc)].qty++;renderCart();draw()}});
      $$('[data-cart-remove]').forEach(function(b){b.onclick=function(){cart.splice(Number(b.dataset.cartRemove),1);renderCart();if(!cart.length){closeModal();return}draw()}});
      $$('[data-checkout-upsell]').forEach(function(b){b.onclick=function(){
        var item=(window.MENU_DATA||[]).find(function(x){return x.name===b.dataset.checkoutUpsell});
        if(!item)return;
        pushCart(item,'',0);
        draw();
      }});
      $('#submitOrder').onclick=async function(){
        if(!customerSeat){
          alert('席番号を選択してください。');
          return;
        }
        if(!cart.length){
          alert('商品を選んでください。');
          closeModal();
          return;
        }
        var btn=$('#submitOrder');
        if(btn){btn.disabled=true;btn.textContent='送信中…'}
        try{
          var amounts=cartAmounts(cart);
          var t=amounts.total;
          var noteEl=$('#orderNote');
          var payload={
            seat:customerSeat,
            items:cart.map(function(i){return Object.assign({},i)}),
            note:noteEl?noteEl.value:''
          };
          var newOrder;
          if(!backendReady){
            await detectBackend();
          }
          if(!backendReady){
            throw new Error('BACKEND_OFFLINE');
          }
          var result=await apiRequest('/api/orders',{
            method:'POST',
            body:JSON.stringify(payload)
          });
          if(result.status===409&&result.data&&result.data.error==='DRINK_REQUIRED'){
            throw new Error('DRINK_REQUIRED');
          }
          if(result.status===403&&result.data&&result.data.error==='SEAT_CLOSED'){
            customerSeatOpen=false;
            refreshCustomerSeatAccess(false);
            throw new Error('SEAT_CLOSED');
          }
          if(!result.ok||!result.data||!result.data.order)throw new Error('SERVER_ORDER_FAILED');
          newOrder=result.data.order;
          if(cartHasDrink(payload.items))customerDrinkSatisfied=true;
          orders=[newOrder].concat(orders.filter(function(x){return String(x.id)!==String(newOrder.id)}));
          save('ippukuOrders',orders);
          cart=[];
          renderCart();
          closeModal();
          renderAll();
          showModal(
            '<div class="order-success"><div class="order-success-mark">✓</div><h3>注文を受け付けました</h3><p>席番号 <strong>'+esc(customerSeat)+'</strong></p><p class="note">お会計の際は1階へ行き、席番号を1階スタッフにお伝えください。</p><div class="modal-actions"><button class="primary-btn" data-close>閉じる</button></div></div>'
          );
        }catch(e){
          console.error('order submit failed',e);
          if(btn){btn.disabled=false;btn.textContent='注文する'}
          if(e&&e.message==='SEAT_CLOSED'){
            closeModal();
            alert('この席の注文受付は終了しました。スタッフへお声がけください。');
          }else if(e&&e.message==='DRINK_REQUIRED'){
            alert('当店はワンドリンクオーダー制です。ドリンクを1杯以上ご注文ください。');
          }else if(e&&e.message==='BACKEND_OFFLINE'){
            alert('現在、注文サーバーに接続できません。注文は送信されていません。スタッフへお声がけください。');
          }else{
            alert('注文を送信できませんでした。注文は確定していません。スタッフへお声がけください。');
          }
        }
      };
    }
    showModal('<div></div>',draw);
  }
  $('#checkoutBtn').onclick=openCartModal;
  $('#managePromos').onclick=renderPromoManager;
  $('#showQrLinks').onclick=function(){var p=$('#qrLinksPanel');p.style.display=p.style.display==='none'?'block':'none';var base=location.href.split('?')[0].split('#')[0];$('#qrLinks').innerHTML=SEATS.map(function(s){return '<div class="qr-link"><b>'+s+'</b><br>'+base+'?seat='+encodeURIComponent(s)+'#order</div>'}).join('')};
  function showModal(html,after){$('#modal').innerHTML=html;$('#modalBackdrop').classList.add('show');$$('[data-close]').forEach(function(b){b.onclick=closeModal});if(after)after()} function closeModal(){$('#modalBackdrop').classList.remove('show')} $('#modalBackdrop').onclick=function(e){if(e.target===$('#modalBackdrop'))closeModal()};
  function renderAll(){renderDashboard();renderOrders();renderAnalytics();renderInventory();renderReserves();renderSeats()}
  renderAll();
  detectBackend();
  function syncRoute(){
    if(location.hash==='#order'||new URLSearchParams(location.search).has('seat'))page('customer');
  }
  window.addEventListener('hashchange',syncRoute);
  syncRoute();
})();
