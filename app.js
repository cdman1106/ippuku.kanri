(function(){
  var $=function(s){return document.querySelector(s)}, $$=function(s){return Array.from(document.querySelectorAll(s))};
  var yen=function(n){return '¥'+Math.round(Number(n||0)).toLocaleString('ja-JP')};
  var SEATS=['C01','C02','C03','C04','C05','C06','T1-01','T1-02','T1-03','T1-04','T2-01','T2-02','T3-01','T3-02'];
  var TABLES={T1:['T1-01','T1-02','T1-03','T1-04'],T2:['T2-01','T2-02'],T3:['T3-01','T3-02']};
  var LABEL={ordered:'受付',preparing:'準備中',served:'提供済',paid:'会計済'};
  function load(k,d){try{var v=localStorage.getItem(k);return v?JSON.parse(v):d}catch(e){return d}}
  function save(k,v){localStorage.setItem(k,JSON.stringify(v))}
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(m){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]})}
  function time(v){var d=new Date(v);return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0')}
  var sales=load('ippukuSales',window.SALES_DATA||[]), orders=load('ippukuOrders',[]), inventory=load('ippukuInventory',[]), reserves=load('ippukuReserves',[]);
  var promos=load('ippukuPromos',[
    {product:'コーヒー',tag:'いっぷくおすすめ',headline:'まずは、ほっと一杯。',copy:'喫煙時間のお供に。ゆっくり過ごしたい時の定番です。',active:true},
    {product:'キャラメルマキアート',tag:'甘めが好きな方へ',headline:'少し贅沢な一杯を。',copy:'ゆっくり過ごしたい時におすすめのカフェメニューです。',active:true}
  ]);
  var selectedSeat='', orderFilter='all', cart=[], customerCategory='all', customerSeat=new URLSearchParams(location.search).get('seat')||localStorage.getItem('ippukuCustomerSeat')||'';
  if(!inventory.length) inventory=[{name:'コーヒー豆',stock:4,min:2,unit:'袋'},{name:'ホットサンド用パン',stock:18,min:10,unit:'枚'},{name:'紙コップ',stock:52,min:30,unit:'個'}];

  var audioCtx=null, alarmTimer=null, alarmActive=false, soundEnabled=false;
  var orderChannel=null;
  try{if('BroadcastChannel' in window)orderChannel=new BroadcastChannel('ippuku-orders')}catch(e){}

  function updateSoundButton(){
    var b=$('#enableOrderSound'); if(!b)return;
    b.textContent=soundEnabled?'🔔 通知音ON中':'🔕 通知音ON';
    b.classList.toggle('sound-on',soundEnabled);
  }
  function ensureAudio(){
    var Ctx=window.AudioContext||window.webkitAudioContext;
    if(!Ctx)return false;
    if(!audioCtx)audioCtx=new Ctx();
    if(audioCtx.state==='suspended')audioCtx.resume();
    return true;
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
      ensureAudio(); alarmBeep();
      if(alarmTimer)clearInterval(alarmTimer);
      alarmTimer=setInterval(function(){if(alarmActive)alarmBeep()},850);
    }
  }
  function stopOrderAlarm(){
    alarmActive=false;
    if(alarmTimer){clearInterval(alarmTimer);alarmTimer=null}
    var overlay=$('#orderAlarm'); if(overlay){overlay.classList.remove('show');overlay.setAttribute('aria-hidden','true')}
    document.body.classList.remove('alarm-ringing');
    try{if(navigator.vibrate)navigator.vibrate(0)}catch(e){}
  }
  function enableOrderSound(){
    if(!ensureAudio()){
      alert('この端末では通知音を利用できません。');
      return;
    }
    soundEnabled=true; updateSoundButton();
    alarmBeep();
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


  function page(name){
    $$('.page').forEach(function(p){p.classList.toggle('active',p.dataset.page===name)});
    $$('.nav-item').forEach(function(b){b.classList.toggle('active',b.dataset.go===name)});
    $('#bottomNav').style.display=name==='customer'?'none':'flex'; $('.topbar').style.display=name==='customer'?'none':'flex'; document.body.classList.toggle('customer-mode',name==='customer');
    var t={dashboard:'店舗ダッシュボード',seats:'座席・注文管理',orders:'注文一覧',analytics:'売上分析',inventory:'在庫・発注',reserve:'取り置き管理',settings:'設定'};
    if(t[name]) $('#pageTitle').textContent=t[name];
    if(name==='seats') renderSeats(); if(name==='orders') renderOrders(); if(name==='analytics') renderAnalytics(); if(name==='inventory') renderInventory(); if(name==='reserve') renderReserves(); if(name==='customer') renderCustomer();
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
  function renderSeats(){
    $$('.seat').forEach(function(b){var o=latest(b.dataset.seat);b.dataset.status=o?o.status:'free';b.classList.toggle('selected',selectedSeat===b.dataset.seat);b.innerHTML=esc(b.dataset.seat)+(o?'<br><small>'+LABEL[o.status]+'</small>':'')});
    if(selectedSeat) renderSeatDetail(selectedSeat);
  }
  $$('.seat').forEach(function(b){b.onclick=function(){selectedSeat=b.dataset.seat;renderSeats()}});
  $$('.table-box').forEach(function(b){b.onclick=function(){var ss=TABLES[b.dataset.table], os=orders.filter(function(o){return ss.indexOf(o.seat)>=0&&o.status!=='paid'});showModal('<h3>'+b.dataset.table+' テーブル</h3>'+(os.length?os.map(orderHtml).join(''):'<p class="note">現在の注文はありません。</p>')+'<div class="modal-actions"><button class="ghost" data-close>閉じる</button></div>')}});
  function renderSeatDetail(seat){var o=latest(seat), box=$('#seatDetail'); if(!o){box.innerHTML='<div class="detail-head"><h3>'+seat+'</h3><span class="status-chip">空席</span></div><div class="empty-detail"><strong>注文はありません</strong><button class="primary-btn" id="seatDemo">この席にデモ注文</button></div>';$('#seatDemo').onclick=function(){demo(seat)};return} box.innerHTML='<div class="detail-head"><div><h3>'+seat+'</h3><span class="detail-meta">'+time(o.createdAt)+' 注文</span></div><span class="status-chip '+o.status+'">'+LABEL[o.status]+'</span></div><div class="order-items">'+o.items.map(function(i){return '<div class="order-line"><span>'+esc(i.displayName||i.name)+' ×'+i.qty+'</span><strong>'+yen(i.price*i.qty)+'</strong></div>'}).join('')+'</div><div class="detail-total"><span>合計</span><strong>'+yen(o.total)+'</strong></div><p class="note">'+(o.note?'メモ：'+esc(o.note):'メモなし')+'</p><div class="status-row">'+['ordered','preparing','served','paid'].map(function(s){return '<button class="status-btn '+(o.status===s?'active':'')+'" data-set-status="'+s+'">'+LABEL[s]+'</button>'}).join('')+'</div>'; $$('[data-set-status]').forEach(function(b){b.onclick=function(){o.status=b.dataset.setStatus;save('ippukuOrders',orders);renderAll()}})}
  function orderHtml(o){return '<div class="order-card"><div class="order-seat">'+esc(o.seat)+'</div><div><b>'+o.items.map(function(i){return esc(i.displayName||i.name)+' ×'+i.qty}).join('、')+'</b><p>'+time(o.createdAt)+' ・ '+o.items.reduce(function(a,i){return a+i.qty},0)+'点 ・ '+yen(o.total)+'</p></div><div class="order-card-actions"><span class="status-chip '+o.status+'">'+LABEL[o.status]+'</span><button class="danger-link" data-delete-order="'+esc(o.id)+'">削除</button></div></div>'}
  function renderOrders(){var l=orders.slice().sort(function(a,b){return new Date(b.createdAt)-new Date(a.createdAt)});if(orderFilter!=='all')l=l.filter(function(o){return o.status===orderFilter});$('#ordersList').innerHTML=l.length?l.map(orderHtml).join(''):'<div class="panel note">注文はまだありません。</div>';bindOrderDeleteButtons()}
  $$('[data-order-filter]').forEach(function(b){b.onclick=function(){orderFilter=b.dataset.orderFilter;$$('[data-order-filter]').forEach(function(x){x.classList.toggle('active',x===b)});renderOrders()}}); $('#demoOrderBtn').onclick=function(){demo(SEATS[Math.floor(Math.random()*SEATS.length)])};
  function deleteOrderById(id){
    var o=orders.find(function(x){return String(x.id)===String(id)});
    if(!o)return;
    showModal('<h3>注文を削除しますか？</h3><p class="note">席 '+esc(o.seat)+' / '+o.items.map(function(i){return esc(i.displayName||i.name)+' ×'+i.qty}).join('、')+'</p><p class="delete-warning">この操作は取り消せません。</p><div class="modal-actions"><button class="ghost" data-close>戻る</button><button class="danger-btn" id="confirmDeleteOrder">削除する</button></div>',function(){
      $('#confirmDeleteOrder').onclick=function(){
        orders=orders.filter(function(x){return String(x.id)!==String(id)});
        save('ippukuOrders',orders);
        closeModal();
        renderAll();
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

  function renderInventory(){$('#inventoryList').innerHTML=inventory.map(function(x,i){return '<div class="inventory-card"><div><b>'+esc(x.name)+'</b><small>最低在庫 '+x.min+esc(x.unit)+(x.stock<=x.min?' ・ 発注推奨':'')+'</small></div><input class="stock-input" type="number" value="'+x.stock+'" data-stock="'+i+'"><span class="status '+(x.stock<=x.min?'waiting':'ok')+'">'+x.stock+esc(x.unit)+'</span></div>'}).join('');$$('[data-stock]').forEach(function(inp){inp.onchange=function(){inventory[Number(inp.dataset.stock)].stock=Number(inp.value);save('ippukuInventory',inventory);renderInventory()}})}
  $('#addInventoryBtn').onclick=function(){showModal('<h3>在庫商品を追加</h3><div class="form-row"><label>商品名</label><input id="invName"></div><div class="form-row"><label>現在庫</label><input id="invStock" type="number" value="0"></div><div class="form-row"><label>最低在庫</label><input id="invMin" type="number" value="0"></div><div class="form-row"><label>単位</label><input id="invUnit" value="個"></div><div class="modal-actions"><button class="ghost" data-close>取消</button><button class="primary-btn" id="saveInv">追加</button></div>',function(){$('#saveInv').onclick=function(){inventory.push({name:$('#invName').value||'未設定',stock:Number($('#invStock').value),min:Number($('#invMin').value),unit:$('#invUnit').value||'個'});save('ippukuInventory',inventory);closeModal();renderInventory()}})};
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
    if(!ps.length){box.innerHTML='';box.style.display='none';return}
    box.style.display='block';
    box.innerHTML='<div class="promo-title-row"><div><span class="eyebrow">RECOMMENDED</span><h3>今、いっぷくでおすすめ</h3></div><small>気になったらそのまま追加できます</small></div>'+
      '<div class="promo-scroll">'+ps.map(function(p,i){var m=promoProduct(p.product);return '<article class="promo-card"><span class="promo-tag">'+esc(p.tag||'おすすめ')+'</span><div class="promo-copy"><h3>'+esc(p.headline||p.product)+'</h3><p>'+esc(p.copy||'ぜひ一度お試しください。')+'</p></div><div class="promo-product"><div><b>'+esc(p.product)+'</b><strong>'+yen(m?m.price:0)+'</strong></div><button class="promo-add" data-promo-add="'+esc(p.product)+'">これを注文 ＋</button></div></article>'}).join('')+'</div>';
    $$('[data-promo-add]').forEach(function(b){b.onclick=function(){var m=promoProduct(b.dataset.promoAdd);if(!m)return;addMenuItem(m,function(){b.textContent='追加しました ✓';setTimeout(function(){b.textContent='これを注文 ＋'},900)})}})
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

  function renderCustomer(){if(!customerSeat){showModal('<h3>席番号を選択</h3><div class="form-row"><select id="seatSelect">'+SEATS.map(function(s){return '<option>'+s+'</option>'}).join('')+'</select></div><div class="modal-actions"><button class="primary-btn" id="seatChoose">この席で注文</button></div>',function(){$('#seatChoose').onclick=function(){customerSeat=$('#seatSelect').value;localStorage.setItem('ippukuCustomerSeat',customerSeat);closeModal();renderCustomer()}})}$('#customerSeat').textContent=customerSeat||'未選択';renderCustomerMenu();try{renderCustomerPromos()}catch(e){console.error('promo render failed',e)}renderCart()}
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
    else cart.push({key:key,name:item.name,displayName:item.name+(optionText?' / '+optionText:''),category:item.category,price:finalPrice,basePrice:item.price,qty:1,option:optionText||''});
    renderCart();
  }
  function addMenuItem(item,done){
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
    var labels={all:'すべて','Café':'Café','Relax':'Relax','Refresh':'Refresh','Food':'軽食','Dessert':'スイーツ','Snack':'Snack'};
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

  function renderCart(){var q=cart.reduce(function(a,i){return a+i.qty},0),t=cart.reduce(function(a,i){return a+i.price*i.qty},0);$('#cartSummary').textContent=q+'点 / '+yen(t)}
  function openCartModal(){
    if(!cart.length){alert('商品を選んでください');return}
    function draw(){
      var total=cart.reduce(function(a,i){return a+i.price*i.qty},0);
      $('#modal').innerHTML='<h3>注文内容</h3><div class="cart-edit-list">'+cart.map(function(i,idx){return '<div class="cart-edit-row"><div class="cart-edit-info"><b>'+esc(i.displayName||i.name)+'</b><small>'+yen(i.price)+' / 1点</small></div><div class="cart-qty"><button class="qty-btn" data-cart-dec="'+idx+'">−</button><strong>'+i.qty+'</strong><button class="qty-btn" data-cart-inc="'+idx+'">＋</button></div><div class="cart-line-total">'+yen(i.price*i.qty)+'</div><button class="cart-remove" data-cart-remove="'+idx+'">削除</button></div>'}).join('')+'</div><div class="detail-total"><span>合計</span><strong>'+yen(total)+'</strong></div><div class="form-row"><label>スタッフへのメモ</label><input id="orderNote" placeholder="例：氷少なめ"></div><div class="modal-actions"><button class="ghost" data-close>戻る</button><button class="primary-btn" id="submitOrder">注文する</button></div>';
      $$('[data-close]').forEach(function(b){b.onclick=closeModal});
      $$('[data-cart-dec]').forEach(function(b){b.onclick=function(){var i=Number(b.dataset.cartDec);cart[i].qty--;if(cart[i].qty<=0)cart.splice(i,1);renderCart();if(!cart.length){closeModal();return}draw()}});
      $$('[data-cart-inc]').forEach(function(b){b.onclick=function(){cart[Number(b.dataset.cartInc)].qty++;renderCart();draw()}});
      $$('[data-cart-remove]').forEach(function(b){b.onclick=function(){cart.splice(Number(b.dataset.cartRemove),1);renderCart();if(!cart.length){closeModal();return}draw()}});
      $('#submitOrder').onclick=function(){
        var t=cart.reduce(function(a,i){return a+i.price*i.qty},0);
        var note=$('#orderNote').value;
        var newOrder={id:String(Date.now()),seat:customerSeat,status:'ordered',items:cart.slice(),total:t,createdAt:new Date().toISOString(),note:note};
        orders.push(newOrder);
        save('ippukuOrders',orders);
        var signal={id:newOrder.id,seat:newOrder.seat,items:newOrder.items,total:newOrder.total,ts:Date.now()};
        localStorage.setItem('ippukuOrderSignal',JSON.stringify(signal));
        if(orderChannel)try{orderChannel.postMessage(signal)}catch(e){}
        cart=[];closeModal();alert('注文を受け付けました。\n\nお会計の際は1階へ行き、席番号「'+customerSeat+'」を1階スタッフにお伝えください。');renderCart();renderAll();
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
  function syncRoute(){
    if(location.hash==='#order'||new URLSearchParams(location.search).has('seat'))page('customer');
  }
  window.addEventListener('hashchange',syncRoute);
  syncRoute();
})();
