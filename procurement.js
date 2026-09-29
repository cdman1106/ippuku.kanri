(function(){
  'use strict';
  var $=function(s,root){return (root||document).querySelector(s)};
  var $$=function(s,root){return Array.from((root||document).querySelectorAll(s))};
  var yen=function(n){return '¥'+Math.round(Number(n||0)).toLocaleString('ja-JP')};
  var num=function(v,d){var raw=String(v==null?'':v).replace(/[¥￥,\s]/g,'').trim();if(raw==='')return d==null?0:d;var n=Number(raw);return Number.isFinite(n)?n:(d==null?0:d)};
  var esc=function(v){return String(v==null?'':v).replace(/[&<>"']/g,function(m){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]})};
  var norm=function(v){return String(v==null?'':v).normalize('NFKC').replace(/[\s　]+/g,'').replace(/[（）()【】\[\]・･:：]/g,'').toLowerCase()};
  var today=function(){var d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')};
  function load(k,d){try{var v=localStorage.getItem(k);return v?JSON.parse(v):d}catch(e){return d}}
  function save(k,v){try{localStorage.setItem(k,JSON.stringify(v));return true}catch(e){return false}}

  var KEY='ippukuProcurementV1';
  var state=load(KEY,{master:[],inventory:[],sales:[],manual:[],supplierSettings:{},overrides:{},orders:[],settings:{salesDays:60,targetDays:45,shortageRisk:5,nextJtRegularDate:'',bridgeUrl:'http://127.0.0.1:8765'}});
  if(!state.settings)state.settings={};
  if(!state.manual)state.manual=[];
  if(!state.overrides)state.overrides={};
  if(!state.orders)state.orders=[];

  var SUPPLIERS=[
    {id:'TS',name:'TSネットワーク',codes:['JT','TS'],free:30000,min:0,basis:'下代',shipping:0,cutoff:'平日12:00',delivery:'原則翌々日',method:'Web / 指定発注',payment:'取引条件による',fax:'',samples:false,tsFallback:false,note:'混合注文は30,000円以上で送料無料。JTは別倉庫・別ルール。'},
    {id:'AY',name:'秋山産業',codes:['AY','AK'],free:0,min:0,basis:'',shipping:0,cutoff:'',delivery:'',method:'FAX',payment:'',fax:'03-5434-2050',samples:true,tsFallback:true,note:'直接発注とTS混合の比較対象。送料無料条件は実際の取引条件を設定してください。'},
    {id:'TG',name:'柘製作所',codes:['TG'],free:0,min:0,basis:'',shipping:0,cutoff:'',delivery:'',method:'FAX',payment:'',fax:'03-3845-1225',samples:true,tsFallback:true,note:'たばこはTS混合へ回せる商品あり。喫煙具は原則直接。'},
    {id:'HY',name:'春山商事',codes:['HY'],free:0,min:0,basis:'',shipping:0,cutoff:'',delivery:'',method:'FAX',payment:'',fax:'03-3832-1486',samples:true,tsFallback:true,note:'たばこはTS混合へ回せる商品あり。喫煙具は原則直接。'},
    {id:'IC',name:'インターコンチネンタル商事',codes:['IC'],free:0,min:0,basis:'',shipping:0,cutoff:'',delivery:'',method:'FAX / メール',payment:'',fax:'03-3586-6716',samples:false,tsFallback:true,note:'TS代替可否は商品ごとに最終確認。'},
    {id:'IM',name:'日本たばこアイメックス',codes:['IM'],free:0,min:0,basis:'',shipping:0,cutoff:'',delivery:'',method:'Web / FAX',payment:'',fax:'',samples:true,tsFallback:true,note:'たばこはTS混合へ回せる商品あり。'},
    {id:'MS',name:'モリソン商会',codes:['MS'],free:0,min:0,basis:'',shipping:0,cutoff:'',delivery:'',method:'Web / FAX',payment:'',fax:'03-5828-5912',samples:false,tsFallback:false,note:'RAW等。取引条件を設定してください。'},
    {id:'SM',name:'Smith Corporation / ロックリンク合同会社',codes:['SM'],free:0,min:0,basis:'',shipping:0,cutoff:'',delivery:'',method:'Web / 要確認',payment:'',fax:'',samples:false,tsFallback:false,note:'TSUTSUMI、パピヨン、コピ、バイオリン、バージンロイヤル等。FAX可否は未確認。'}
  ];
  var CODE_MAP={};
  SUPPLIERS.forEach(function(s){s.codes.forEach(function(c){CODE_MAP[c]=s.id})});
  var MANUAL_SUPPLIER={
    'チョイスブースター':'IM',
    'ピールスプラッシュグレープ':'TG',
    'ノーベルプティドミニカンドライシガー':'HY',
    'ブラックジャックスパサワブルーベリー5':'IC'
  };

  function supplierCfg(id){
    var base=SUPPLIERS.find(function(s){return s.id===id})||{id:id,name:id,codes:[],free:0,min:0,method:'要確認',fax:'',samples:false,tsFallback:false,note:''};
    var saved=state.supplierSettings[id]||{};
    return Object.assign({},base,saved);
  }
  function persist(){save(KEY,state)}

  function parseCsvText(text){
    text=String(text||'').replace(/^\uFEFF/,'');
    var rows=[], row=[], cell='', q=false;
    for(var i=0;i<text.length;i++){
      var ch=text[i];
      if(q){
        if(ch==='"'&&text[i+1]==='"'){cell+='"';i++;}
        else if(ch==='"'){q=false;}
        else cell+=ch;
      }else{
        if(ch==='"')q=true;
        else if(ch===','){row.push(cell);cell='';}
        else if(ch==='\n'){row.push(cell.replace(/\r$/,''));rows.push(row);row=[];cell='';}
        else cell+=ch;
      }
    }
    if(cell!==''||row.length){row.push(cell.replace(/\r$/,''));rows.push(row)}
    return rows.filter(function(r){return r.some(function(v){return String(v).trim()!==''})});
  }
  function decodeFile(file){
    return file.arrayBuffer().then(function(buf){
      var bytes=new Uint8Array(buf), utf=new TextDecoder('utf-8',{fatal:false}).decode(bytes);
      var bad=(utf.match(/�/g)||[]).length;
      if(bad>2){try{return new TextDecoder('shift-jis').decode(bytes)}catch(e){return utf}}
      return utf;
    });
  }
  function headerInfo(rows){
    var best=0,bestScore=-1;
    rows.slice(0,10).forEach(function(r,i){
      var joined=r.map(norm).join('|'), score=0;
      ['商品','在庫','売上','数量','バーコード','jan','商品id'].forEach(function(k){if(joined.indexOf(norm(k))>=0)score++});
      if(score>bestScore){bestScore=score;best=i}
    });
    return {index:best,headers:rows[best].map(function(v){return String(v).trim()})};
  }
  function findCol(headers,aliases){
    var hs=headers.map(norm);
    for(var a=0;a<aliases.length;a++){var na=norm(aliases[a]);var exact=hs.indexOf(na);if(exact>=0)return exact}
    for(var b=0;b<aliases.length;b++){var nb=norm(aliases[b]);for(var i=0;i<hs.length;i++){if(hs[i]&&hs[i].indexOf(nb)>=0)return i}}
    return -1;
  }
  function cell(row,i){return i>=0&&i<row.length?String(row[i]||'').trim():''}
  function stripBarcode(v){return String(v||'').trim().replace(/^#/,'')}

  function parseMaster(rows){
    var hi=headerInfo(rows), h=hi.headers, data=rows.slice(hi.index+1);
    var c={id:findCol(h,['商品ID','商品id']),name:findCol(h,['【必須】商品名 ※49文字','商品名']),barcode:findCol(h,['バーコード','JAN','JANコード']),category:findCol(h,['カテゴリーID','カテゴリID','カテゴリー','カテゴリ']),cost:findCol(h,['原価']),price:findCol(h,['【必須】価格 ※半角数字','売価','価格']),note:findCol(h,['備考','コメント','メモ']),visible:findCol(h,['表示/非表示','表示']),code:findCol(h,['商品コード'])};
    return data.map(function(r){var name=cell(r,c.name);if(!name)return null;return {id:cell(r,c.id),name:name,barcode:stripBarcode(cell(r,c.barcode)),category:cell(r,c.category),cost:num(cell(r,c.cost)),price:num(cell(r,c.price)),note:cell(r,c.note),visible:cell(r,c.visible),productCode:cell(r,c.code)}}).filter(Boolean);
  }
  function parseInventory(rows){
    var hi=headerInfo(rows), h=hi.headers, data=rows.slice(hi.index+1);
    var c={id:findCol(h,['商品ID']),name:findCol(h,['商品名']),barcode:findCol(h,['バーコード','JAN']),stock:findCol(h,['現在庫数','在庫数','在庫数量','在庫残数','現在庫','在庫'])};
    return data.map(function(r){var name=cell(r,c.name);var id=cell(r,c.id);if(!name&&!id)return null;return {id:id,name:name,barcode:stripBarcode(cell(r,c.barcode)),stock:num(cell(r,c.stock))}}).filter(Boolean);
  }
  function parseSales(rows){
    var hi=headerInfo(rows), h=hi.headers, data=rows.slice(hi.index+1);
    var c={id:findCol(h,['商品ID']),name:findCol(h,['商品名']),barcode:findCol(h,['バーコード','JAN']),qty:findCol(h,['販売数量','販売数','売上数量','販売個数','商品数','個数','数量','販売点数','売上点数'])};
    var map={};
    data.forEach(function(r){var id=cell(r,c.id), name=cell(r,c.name), bc=stripBarcode(cell(r,c.barcode));if(!id&&!name&&!bc)return;var k=id?('id:'+id):(bc?('bc:'+bc):('n:'+norm(name)));if(!map[k])map[k]={id:id,name:name,barcode:bc,qty:0};map[k].qty+=num(cell(r,c.qty))});
    return Object.keys(map).map(function(k){return map[k]});
  }
  function keyOf(x){if(x.barcode)return 'bc:'+x.barcode;if(x.id)return 'id:'+x.id;return 'n:'+norm(x.name)}
  function indexBy(arr){var m={};(arr||[]).forEach(function(x){m[keyOf(x)]=x;if(x.name)m['n:'+norm(x.name)]=x;if(x.barcode)m['bc:'+x.barcode]=x});return m}

  function supplierFor(p){
    var override=state.overrides[keyOf(p)]||{};
    if(override.supplier)return override.supplier;
    var code=String(p.note||'').trim();
    if(CODE_MAP[code])return CODE_MAP[code];
    var m=MANUAL_SUPPLIER[norm(p.name)];if(m)return m;
    if(code==='MB')return 'MB';if(code==='KK')return 'KK';
    return '';
  }
  function looksTobacco(p){
    var n=norm(p.name), cat=norm(p.category);
    var accessory=['ペーパー','フィルター','ローラー','ライター','灰皿','グラインダー','パイプ','ケース','ポーチ','クリーナー','フリント','ウィック','オイル','ガス','チューブ'];
    if(accessory.some(function(k){return n.indexOf(norm(k))>=0}))return false;
    if(cat.indexOf('たばこ')>=0||cat==='0001')return true;
    var tobacco=['シャグ','シガー','シガリロ','スヌース','スナッフ','葉巻','紙巻','メンソール','バージニア','ドミンゴ','チェ','フランドリア','スタンレー','パピヨン','コピ'];
    return tobacco.some(function(k){return n.indexOf(norm(k))>=0});
  }
  function defaultTsEligible(p,supplier){
    var ov=state.overrides[keyOf(p)]||{};
    if(typeof ov.tsEligible==='boolean')return ov.tsEligible;
    return !!supplierCfg(supplier).tsFallback&&looksTobacco(p);
  }

  function packagingFamilyName(name){
    return norm(String(name||'').replace(/[　\s]*カートン/gi,''));
  }
  function buildPackagingMap(master){
    var groups={},result={};
    (master||[]).forEach(function(p){
      if(String(p.visible).indexOf('非表示')>=0)return;
      if(/廃盤|非継続/.test(String(p.note||'')))return;
      var sid=supplierFor(p);
      if(!SUPPLIERS.some(function(x){return x.id===sid})&&!looksTobacco(p))return;
      var fam=packagingFamilyName(p.name);
      (groups[fam]||(groups[fam]=[])).push(p);
    });
    Object.keys(groups).forEach(function(fam){
      var list=groups[fam].filter(function(p){return num(p.price)>0}).sort(function(a,b){return num(a.price)-num(b.price)});
      var base=list[0]||null,basePrice=base?num(base.price):0,baseCost=base?num(base.cost):0;
      groups[fam].forEach(function(p){
        var explicit=/カートン/i.test(String(p.name||'')),size=1,isCarton=false,priceRatio=basePrice>0?num(p.price)/basePrice:1,costRatio=baseCost>0?num(p.cost)/baseCost:1;
        var ratio=priceRatio>1.5?priceRatio:costRatio;
        var rounded=Math.round(ratio);
        if(ratio>=1.8&&rounded>=2&&rounded<=20&&Math.abs(ratio-rounded)<=0.4){isCarton=true;size=rounded}
        if(explicit){isCarton=true;if(size<2)size=10}
        result[keyOf(p)]={airUnit:isCarton?'carton':'single',cartonSize:isCarton?size:1,autoDetected:isCarton,reason:explicit?'商品名':'価格比'};
      });
    });
    return result;
  }
  function unitLabel(unit){return unit==='carton'?'カートン':'個'}
  function packagingFor(p,map){
    var k=keyOf(p),auto=(map&&map[k])||{airUnit:'single',cartonSize:1,autoDetected:false},ov=state.overrides[k]||{};
    var airUnit=ov.airUnit||auto.airUnit||'single';
    var cartonSize=Math.max(1,num(ov.cartonSize,auto.cartonSize||1));
    if(airUnit==='carton'&&cartonSize<2)cartonSize=10;
    var orderUnit=ov.orderUnit||airUnit;
    return {airUnit:airUnit,cartonSize:cartonSize,orderUnit:orderUnit,autoDetected:!!auto.autoDetected};
  }

  function buildRows(){
    var inv=indexBy(state.inventory), sales=indexBy(state.sales), salesDays=Math.max(1,num(state.settings.salesDays,60)), targetDays=Math.max(1,num(state.settings.targetDays,45));
    var packagingMap=buildPackagingMap(state.master),out=[];
    (state.master||[]).forEach(function(p){
      if(String(p.visible).indexOf('非表示')>=0)return;
      if(/廃盤|非継続/.test(String(p.note||'')))return;
      var k=keyOf(p),si=sales[k]||sales['bc:'+p.barcode]||sales['n:'+norm(p.name)]||{},ii=inv[k]||inv['bc:'+p.barcode]||inv['n:'+norm(p.name)]||{};
      var supplier=supplierFor(p),ov=state.overrides[k]||{},pkg=packagingFor(p,packagingMap),airFactor=pkg.airUnit==='carton'?pkg.cartonSize:1,orderFactor=pkg.orderUnit==='carton'?pkg.cartonSize:1;
      var soldRaw=num(si.qty),stockRaw=num(ii.stock),sold=soldRaw*airFactor,stock=stockRaw*airFactor,forecast=sold*(targetDays/salesDays),need=Math.max(0,forecast-stock),step=Math.max(1,num(ov.pack,1));
      var recommended=need>0?Math.ceil((need/orderFactor)/step)*step:0,fill=forecast>0?stock/forecast:999,daily=sold/salesDays;
      var baseCost=pkg.airUnit==='carton'&&pkg.cartonSize>0?num(p.cost)/pkg.cartonSize:num(p.cost),basePrice=pkg.airUnit==='carton'&&pkg.cartonSize>0?num(p.price)/pkg.cartonSize:num(p.price);
      var orderCost=baseCost*orderFactor,orderPrice=basePrice*orderFactor,qty=Math.max(0,num(ov.qty,recommended));
      var isJT=String(p.note||'').trim()==='JT';
      out.push({key:k,id:p.id,name:p.name,barcode:p.barcode,category:p.category,cost:orderCost,price:orderPrice,airCost:num(p.cost),airPrice:num(p.price),note:p.note,supplier:supplier,sold:sold,stock:stock,soldRaw:soldRaw,stockRaw:stockRaw,forecast:forecast,need:need,fill:fill,daily:daily,pack:step,recommended:recommended,qty:qty,airUnit:pkg.airUnit,orderUnit:pkg.orderUnit,cartonSize:pkg.cartonSize,airUnitLabel:unitLabel(pkg.airUnit),orderUnitLabel:unitLabel(pkg.orderUnit),autoPackDetected:pkg.autoDetected,tsEligible:defaultTsEligible(p,supplier),route:ov.route||'',isJT:isJT,newProduct:false});
    });
    (state.manual||[]).forEach(function(p){
      var k='manual:'+p.uid,ov=state.overrides[k]||{},airUnit=ov.airUnit||p.airUnit||'single',cartonSize=Math.max(1,num(ov.cartonSize,p.cartonSize||1)),orderUnit=ov.orderUnit||p.orderUnit||airUnit,airFactor=airUnit==='carton'?cartonSize:1,orderFactor=orderUnit==='carton'?cartonSize:1,step=Math.max(1,num(ov.pack,p.pack||1));
      var baseCost=airUnit==='carton'?num(p.cost)/cartonSize:num(p.cost),basePrice=airUnit==='carton'?num(p.price)/cartonSize:num(p.price),orderCost=baseCost*orderFactor,orderPrice=basePrice*orderFactor;
      var qty=Math.max(0,num(ov.qty,p.initialQty||1)),need=qty*orderFactor;
      out.push({key:k,id:'',name:p.name,barcode:p.barcode||'',category:p.category||'新商品',cost:orderCost,price:orderPrice,airCost:num(p.cost),airPrice:num(p.price),note:'NEW',supplier:p.supplier||'',sold:0,stock:0,soldRaw:0,stockRaw:0,forecast:0,need:need,fill:0,daily:0,pack:step,recommended:qty,qty:qty,airUnit:airUnit,orderUnit:orderUnit,cartonSize:cartonSize,airUnitLabel:unitLabel(airUnit),orderUnitLabel:unitLabel(orderUnit),autoPackDetected:false,tsEligible:!!p.tsEligible,route:ov.route||'',isJT:false,newProduct:true});
    });
    out.sort(function(a,b){if(a.newProduct!==b.newProduct)return a.newProduct?-1:1;if(a.fill!==b.fill)return a.fill-b.fill;return b.daily-a.daily});
    return out;
  }

  function daysUntil(dateStr){if(!dateStr)return null;var d=new Date(dateStr+'T12:00:00'),now=new Date();return Math.ceil((d-now)/86400000)}
  function suggestedRoute(r){
    if(r.qty<=0)return 'hold';
    if(!r.supplier||!SUPPLIERS.some(function(x){return x.id===r.supplier}))return 'hold';
    if(r.isJT){
      var days=daysUntil(state.settings.nextJtRegularDate), cover=r.daily>0?r.stock/r.daily:999;
      if(days!=null&&days>=0&&cover>=days+2)return 'jt_regular';
      return 'jt_normal';
    }
    return 'direct';
  }
  function applyAutoPlan(rows){
    rows.forEach(function(r){
      var k=r.key,ov=state.overrides[k]||{};
      if(ov.routeLocked)return;
      var route=suggestedRoute(r);
      if(route==='direct'&&r.tsEligible){
        var cfg=supplierCfg(r.supplier);
        var supplierItems=rows.filter(function(x){return x.supplier===r.supplier&&x.qty>0&&!x.isJT});
        var supplierTotal=thresholdSubtotal(supplierItems,cfg);
        if(cfg.free>0&&supplierTotal<cfg.free)route='ts_mixed';
      }
      state.overrides[k]=Object.assign({},ov,{route:route});
    });
    persist();
  }
  function routeOf(r){return (state.overrides[r.key]||{}).route||suggestedRoute(r)}
  function groupId(r){var route=routeOf(r);if(route==='ts_mixed')return 'TS_MIXED';if(route==='jt_regular')return 'JT_REGULAR';if(route==='jt_normal')return 'JT_NORMAL';if(route==='hold')return 'HOLD';return 'DIRECT_'+(r.supplier||'UNKNOWN')}
  function groupName(id){if(id==='TS_MIXED')return 'TSネットワーク混合';if(id==='JT_REGULAR')return 'JT 定期配送待ち';if(id==='JT_NORMAL')return 'JT 通常発注';if(id==='HOLD')return '今回見送り';if(id.indexOf('DIRECT_')===0)return supplierCfg(id.replace('DIRECT_','')).name+' 直接';return id}
  function groupSupplier(id){if(id==='TS_MIXED'||id==='JT_REGULAR'||id==='JT_NORMAL')return 'TS';if(id.indexOf('DIRECT_')===0)return id.replace('DIRECT_','');return ''}

  function groups(rows){var m={};rows.filter(function(r){return r.qty>0}).forEach(function(r){var id=groupId(r);(m[id]||(m[id]=[])).push(r)});return m}
  function thresholdForGroup(id){if(id==='TS_MIXED')return num(supplierCfg('TS').free,30000);if(id==='JT_REGULAR'||id==='JT_NORMAL'||id==='HOLD')return 0;return num(supplierCfg(groupSupplier(id)).free)}
  function thresholdSubtotal(items,cfg){
    var useRetail=String((cfg&&cfg.basis)||'')==='上代';
    return items.reduce(function(a,r){return a+r.qty*(useRetail?num(r.price):num(r.cost))},0);
  }
  function groupStats(id,items){
    var supplier=groupSupplier(id),cfg=supplier?supplierCfg(supplier):{},total=items.reduce(function(a,r){return a+r.qty*r.cost},0),thresholdAmount=thresholdSubtotal(items,cfg),threshold=thresholdForGroup(id),minimum=num(cfg.min),risk=Math.max(0,Math.min(100,num(state.settings.shortageRisk,5)))/100,riskAdjusted=thresholdAmount*(1-risk);
    var basisLabel=cfg.basis?(' / '+cfg.basis+'基準'):'',status='条件未設定';
    if(id==='JT_REGULAR')status='定期配送なら送料無料';
    else if(id==='JT_NORMAL')status='通常送料あり';
    else if(id==='HOLD')status='発注しない';
    else if(minimum>0&&thresholdAmount<minimum)status='最低発注まで '+yen(minimum-thresholdAmount)+' 不足'+basisLabel;
    else if(threshold>0){
      if(thresholdAmount<threshold)status='送料無料まで '+yen(threshold-thresholdAmount)+' 不足'+basisLabel+(num(cfg.shipping)>0?' / 送料'+yen(cfg.shipping):'');
      else if(riskAdjusted<threshold)status='欠品'+Math.round(risk*100)+'%で送料無料割れリスク'+basisLabel;
      else status='送料無料ライン +'+yen(thresholdAmount-threshold)+'余裕'+basisLabel;
    }else if(num(cfg.shipping)>0)status='通常送料 '+yen(cfg.shipping);
    return {total:total,thresholdAmount:thresholdAmount,threshold:threshold,riskAdjusted:riskAdjusted,status:status};
  }

  function setOverride(key,patch){state.overrides[key]=Object.assign({},state.overrides[key]||{},patch);persist()}

  function render(){
    var root=$('#procurementApp');if(!root)return;
    var rows=buildRows();
    var loaded={master:(state.master||[]).length,inventory:(state.inventory||[]).length,sales:(state.sales||[]).length};
    var shortages=rows.filter(function(r){return r.recommended>0}).length,totalNeed=rows.reduce(function(a,r){return a+r.qty*r.cost},0),cartonCount=rows.filter(function(r){return r.airUnit==='carton'}).length;
    root.innerHTML=
      '<div class="proc-kpis">'+
        '<article><span>商品台帳</span><strong>'+loaded.master.toLocaleString()+'</strong><small>カートン判定 '+cartonCount+'件</small></article>'+
        '<article><span>発注候補</span><strong>'+shortages.toLocaleString()+'</strong><small>不足商品</small></article>'+
        '<article><span>発注案総額</span><strong>'+yen(totalNeed)+'</strong><small>選択中</small></article>'+
        '<article><span>予測期間</span><strong>'+esc(state.settings.targetDays||45)+'日</strong><small>売上'+esc(state.settings.salesDays||60)+'日基準</small></article>'+
      '</div>'+csvPanel()+settingsPanel()+summaryPanel(rows)+productPanel(rows)+historyPanel();
    bind(root,rows);
  }

  function csvPanel(){
    return '<section class="panel proc-block"><div class="panel-head"><div><h3>① Airレジ CSV取込</h3><p>商品台帳・現在庫・過去2カ月売上の3ファイルを読み込みます。</p></div><span class="proc-ready">端末内保存</span></div>'+
      '<div class="proc-upload-grid">'+uploadCard('master','商品台帳 最新版',(state.master||[]).length)+' '+uploadCard('inventory','現在庫データ',(state.inventory||[]).length)+' '+uploadCard('sales','過去2カ月 売上',(state.sales||[]).length)+'</div>'+
      '<div class="proc-actions"><button class="ghost" id="procClearCsv">取込データをクリア</button><button class="primary-btn" id="procAutoPlan">推奨発注案を作り直す</button></div></section>';
  }
  function uploadCard(type,label,count){return '<label class="proc-upload-card"><strong>'+esc(label)+'</strong><span>'+(count?count.toLocaleString()+'件 読込済み':'CSVを選択')+'</span><input type="file" data-proc-csv="'+type+'" accept=".csv,text/csv" hidden></label>'}

  function settingsPanel(){
    var st=state.settings;
    return '<details class="panel proc-block proc-settings"><summary><strong>② 発注条件・仕入先設定</strong><span>不足率 / 送料無料 / 送料 / 締切 / 支払 / FAX / JT定期便</span></summary>'+
      '<div class="proc-settings-grid">'+
        field('販売実績日数','procSalesDays',st.salesDays||60,'number')+field('在庫確保日数','procTargetDays',st.targetDays||45,'number')+field('欠品想定率（%）','procRisk',st.shortageRisk||5,'number')+field('次回JT定期配送日','procJtDate',st.nextJtRegularDate||'','date')+field('Mac FAX Bridge','procBridgeUrl',st.bridgeUrl||'http://127.0.0.1:8765','text')+
      '</div><div class="proc-supplier-settings">'+SUPPLIERS.map(function(x){var c=supplierCfg(x.id);return '<div class="proc-supplier-setting"><div class="proc-supplier-main"><strong>'+esc(c.name)+'</strong><small>'+esc(c.note||'')+'</small></div><label>送料無料ライン<input type="number" data-supplier-free="'+x.id+'" value="'+esc(c.free||'')+'" placeholder="未設定"></label><label>最低発注<input type="number" data-supplier-min="'+x.id+'" value="'+esc(c.min||'')+'"></label><label>通常送料<input type="number" data-supplier-shipping="'+x.id+'" value="'+esc(c.shipping||'')+'"></label><label>判定基準<select data-supplier-basis="'+x.id+'"><option value="" '+(!c.basis?'selected':'')+'>未設定</option><option value="下代" '+(c.basis==='下代'?'selected':'')+'>下代</option><option value="上代" '+(c.basis==='上代'?'selected':'')+'>上代</option></select></label><label>発注締切<input data-supplier-cutoff="'+x.id+'" value="'+esc(c.cutoff||'')+'" placeholder="例 12:00"></label><label>配送目安<input data-supplier-delivery="'+x.id+'" value="'+esc(c.delivery||'')+'" placeholder="例 翌々日"></label><label>注文方法<input data-supplier-method="'+x.id+'" value="'+esc(c.method||'')+'"></label><label>支払方法<input data-supplier-payment="'+x.id+'" value="'+esc(c.payment||'')+'"></label><label>FAX<input data-supplier-fax="'+x.id+'" value="'+esc(c.fax||'')+'" placeholder="未設定"></label><label class="proc-checkline"><input type="checkbox" data-supplier-samples="'+x.id+'" '+(c.samples?'checked':'')+'><span>サンプル期待</span></label><label class="proc-checkline"><input type="checkbox" data-supplier-ts="'+x.id+'" '+(c.tsFallback?'checked':'')+'><span>たばこはTS代替候補</span></label></div>'}).join('')+'</div><div class="proc-actions"><button class="primary-btn" id="procSaveSettings">設定を保存</button></div></details>';
  }
  function field(label,id,value,type){return '<label><span>'+esc(label)+'</span><input id="'+id+'" type="'+type+'" value="'+esc(value)+'"></label>'}

  function summaryPanel(rows){
    var gs=groups(rows),ids=Object.keys(gs).sort(function(a,b){if(a==='HOLD')return 1;if(b==='HOLD')return -1;return a.localeCompare(b,'ja')});
    return '<section class="proc-block"><div class="proc-title-row"><div><h3>③ 今回の推奨発注案</h3><p>人間が最終確認してから注文書/FAXへ進みます。</p></div><div class="proc-actions"><button class="ghost" id="procNewProduct">＋ 新規商品</button><button class="primary-btn" id="procFaxAll">FAX可能分を一括送信</button></div></div>'+(ids.length?'<div class="proc-group-grid">'+ids.map(function(id){return groupCard(id,gs[id])}).join('')+'</div>':'<div class="panel proc-empty">CSVを3つ読み込むと発注案を表示します。</div>')+'</section>';
  }
  function groupCard(id,items){
    var st=groupStats(id,items),supplier=groupSupplier(id),cfg=supplier?supplierCfg(supplier):null,danger=st.status.indexOf('リスク')>=0||st.status.indexOf('不足')>=0;
    var top=items.slice().sort(function(a,b){return a.fill-b.fill}).slice(0,4);
    var meta=cfg?['注文 '+(cfg.method||'未設定'),cfg.cutoff?('締切 '+cfg.cutoff):'',cfg.delivery?('配送 '+cfg.delivery):'',cfg.samples?'サンプル期待あり':''].filter(Boolean).join(' / '):'';
    return '<article class="proc-group '+(danger?'danger':'')+'"><div class="proc-group-head"><div><span>'+esc(groupName(id))+'</span><strong>'+yen(st.total)+'</strong></div><span class="proc-status">'+esc(st.status)+'</span></div>'+(meta?'<div class="proc-group-meta">'+esc(meta)+'</div>':'')+'<div class="proc-group-items">'+top.map(function(r){return '<div><span>'+esc(r.name)+'</span><b>'+r.qty+' '+esc(r.orderUnitLabel)+'</b></div>'}).join('')+(items.length>4?'<small>ほか '+(items.length-4)+'商品</small>':'')+'</div><div class="proc-group-actions">'+(id!=='HOLD'&&id!=='JT_REGULAR'?'<button class="ghost" data-proc-doc="'+esc(id)+'">注文書</button>':'')+(cfg&&cfg.fax&&id!=='HOLD'&&id!=='JT_REGULAR'?'<button class="primary-btn" data-proc-fax="'+esc(id)+'">FAX送信</button>':'')+(id!=='HOLD'?'<button class="ghost" data-proc-sent="'+esc(id)+'">注文済みにする</button>':'')+'</div></article>';
  }

  function productPanel(rows){
    var suppliers=['all'].concat(SUPPLIERS.map(function(s){return s.id}),['UNKNOWN']);
    return '<section class="panel proc-block"><div class="panel-head"><div><h3>④ 商品別 発注優先順位</h3><p>単品とカートンを分離。カートンは入数で単品換算して不足率を計算します。</p></div><input id="procSearch" class="search" placeholder="商品名・JANで検索"></div><div class="proc-unit-filter-row"><button class="filter active" data-proc-unit-filter="all">すべて</button><button class="filter" data-proc-unit-filter="single">単品</button><button class="filter" data-proc-unit-filter="carton">カートン</button></div><div class="proc-filters">'+suppliers.map(function(id){return '<button class="filter '+(id==='all'?'active':'')+'" data-proc-supplier-filter="'+id+'">'+(id==='all'?'すべて':id==='UNKNOWN'?'未判定':esc(supplierCfg(id).name))+'</button>'}).join('')+'</div><div class="table-scroll proc-table-wrap"><table class="proc-table proc-pack-table"><thead><tr><th>優先</th><th>商品</th><th>仕入先</th><th>Air単位</th><th>入数</th><th>'+esc(state.settings.salesDays||60)+'日販売</th><th>在庫</th><th>'+esc(state.settings.targetDays||45)+'日予測</th><th>充足率</th><th>発注単位</th><th>発注刻み</th><th>推奨</th><th>発注数</th><th>発注先</th><th>金額</th></tr></thead><tbody id="procTableBody">'+productRows(rows)+'</tbody></table></div></section>';
  }
  function productRows(rows,filter,search,unitFilter){
    filter=filter||'all';unitFilter=unitFilter||'all';search=norm(search||'');
    return rows.filter(function(r){if(r.recommended<=0&&!r.newProduct)return false;if(filter==='UNKNOWN'&&r.supplier)return false;if(filter!=='all'&&filter!=='UNKNOWN'&&r.supplier!==filter)return false;if(unitFilter!=='all'&&r.airUnit!==unitFilter)return false;if(search&&norm(r.name+' '+r.barcode).indexOf(search)<0)return false;return true}).slice(0,800).map(function(r){
      var rate=r.fill>=100?'∞':Math.max(0,r.fill*100).toFixed(0)+'%',urgent=r.newProduct?'新規':(r.fill<0.35?'至急':r.fill<0.7?'高':'通常'),route=routeOf(r),routes=[['direct',supplierCfg(r.supplier).name||'直接']];
      if(r.tsEligible)routes.push(['ts_mixed','TS混合']);
      if(r.isJT)routes=[['jt_normal','JT通常便'],['jt_regular','JT定期便待ち']];
      routes.push(['hold','見送り']);
      var soldText=r.soldRaw.toFixed(0)+' '+esc(r.airUnitLabel)+(r.airUnit==='carton'?'<small>'+r.sold.toFixed(0)+'個換算</small>':'');
      var stockText=r.stockRaw.toFixed(1)+' '+esc(r.airUnitLabel)+(r.airUnit==='carton'?'<small>'+r.stock.toFixed(1)+'個換算</small>':'');
      return '<tr data-proc-row="'+esc(r.key)+'"><td><span class="proc-priority p-'+urgent+'">'+urgent+'</span></td><td><strong>'+esc(r.name)+'</strong><small>'+esc(r.barcode||'JANなし')+(r.newProduct?' / 新規':'')+(r.autoPackDetected?' / 自動カートン判定':'')+'</small></td><td>'+esc(r.supplier?supplierCfg(r.supplier).name:'未判定')+(r.tsEligible?'<small>TS代替候補</small>':'')+'</td><td><select data-proc-air-unit="'+esc(r.key)+'"><option value="single" '+(r.airUnit==='single'?'selected':'')+'>単品</option><option value="carton" '+(r.airUnit==='carton'?'selected':'')+'>カートン</option></select></td><td><input class="proc-mini" type="number" min="1" data-proc-carton-size="'+esc(r.key)+'" value="'+r.cartonSize+'"></td><td>'+soldText+'</td><td>'+stockText+'</td><td>'+r.forecast.toFixed(1)+'個</td><td><b>'+rate+'</b></td><td><select data-proc-order-unit="'+esc(r.key)+'"><option value="single" '+(r.orderUnit==='single'?'selected':'')+'>単品</option><option value="carton" '+(r.orderUnit==='carton'?'selected':'')+'>カートン</option></select></td><td><input class="proc-mini" type="number" min="1" data-proc-pack="'+esc(r.key)+'" value="'+r.pack+'"></td><td>'+r.recommended+' '+esc(r.orderUnitLabel)+'</td><td><input class="proc-mini" type="number" min="0" data-proc-qty="'+esc(r.key)+'" value="'+r.qty+'"></td><td><select data-proc-route="'+esc(r.key)+'">'+routes.map(function(x){return '<option value="'+x[0]+'" '+(route===x[0]?'selected':'')+'>'+esc(x[1])+'</option>'}).join('')+'</select></td><td>'+yen(r.qty*r.cost)+'</td></tr>';
    }).join('');
  }

  function historyPanel(){
    var hist=(state.orders||[]).slice().reverse().slice(0,8);
    return '<section class="panel proc-block"><div class="panel-head"><div><h3>⑤ 発注履歴・欠品記録</h3><p>欠品を記録すると、今後の送料無料割れリスク判定に使えます。</p></div></div>'+(hist.length?'<div class="proc-history">'+hist.map(function(o){return '<div><span>'+esc(o.date)+' '+esc(o.groupName)+'</span><strong>'+yen(o.total)+'</strong><small>欠品 '+yen(o.shortageAmount||0)+'</small><button class="ghost" data-proc-shortage="'+esc(o.id)+'">欠品登録</button></div>'}).join('')+'</div>':'<p class="note">まだ発注履歴はありません。</p>')+'</section>';
  }

  function bind(root,rows){
    $$('[data-proc-csv]',root).forEach(function(inp){inp.onchange=function(){var file=inp.files&&inp.files[0];if(!file)return;decodeFile(file).then(function(text){var parsed=parseCsvText(text),type=inp.dataset.procCsv;if(type==='master')state.master=parseMaster(parsed);if(type==='inventory')state.inventory=parseInventory(parsed);if(type==='sales')state.sales=parseSales(parsed);persist();applyAutoPlan(buildRows());render()}).catch(function(e){alert('CSV読込に失敗しました: '+e.message)})}});
    var clear=$('#procClearCsv',root);if(clear)clear.onclick=function(){if(!confirm('読み込んだ3CSVをクリアしますか？新規商品・設定は残します。'))return;state.master=[];state.inventory=[];state.sales=[];state.overrides={};persist();render()};
    var auto=$('#procAutoPlan',root);if(auto)auto.onclick=function(){applyAutoPlan(buildRows());render()};
    var saveBtn=$('#procSaveSettings',root);if(saveBtn)saveBtn.onclick=function(){
      state.settings.salesDays=num($('#procSalesDays',root).value,60);
      state.settings.targetDays=num($('#procTargetDays',root).value,45);
      state.settings.shortageRisk=num($('#procRisk',root).value,5);
      state.settings.nextJtRegularDate=$('#procJtDate',root).value;
      state.settings.bridgeUrl=$('#procBridgeUrl',root).value.trim()||'http://127.0.0.1:8765';
      SUPPLIERS.forEach(function(sp){
        state.supplierSettings[sp.id]=Object.assign({},state.supplierSettings[sp.id]||{},{
          free:num($('[data-supplier-free="'+sp.id+'"]',root).value),
          min:num($('[data-supplier-min="'+sp.id+'"]',root).value),
          shipping:num($('[data-supplier-shipping="'+sp.id+'"]',root).value),
          basis:$('[data-supplier-basis="'+sp.id+'"]',root).value,
          cutoff:$('[data-supplier-cutoff="'+sp.id+'"]',root).value.trim(),
          delivery:$('[data-supplier-delivery="'+sp.id+'"]',root).value.trim(),
          method:$('[data-supplier-method="'+sp.id+'"]',root).value.trim(),
          payment:$('[data-supplier-payment="'+sp.id+'"]',root).value.trim(),
          fax:$('[data-supplier-fax="'+sp.id+'"]',root).value.trim(),
          samples:$('[data-supplier-samples="'+sp.id+'"]',root).checked,
          tsFallback:$('[data-supplier-ts="'+sp.id+'"]',root).checked
        });
      });
      persist();applyAutoPlan(buildRows());render();alert('発注条件を保存しました');
    };
    var newBtn=$('#procNewProduct',root);if(newBtn)newBtn.onclick=openNewProduct;
    var search=$('#procSearch',root),activeFilter='all',activeUnitFilter='all';
    function redrawTable(){var body=$('#procTableBody',root);if(body){body.innerHTML=productRows(buildRows(),activeFilter,search?search.value:'',activeUnitFilter);bindTable(body)}}
    if(search)search.oninput=redrawTable;
    $('[data-proc-supplier-filter]',root).forEach(function(b){b.onclick=function(){$('[data-proc-supplier-filter]',root).forEach(function(x){x.classList.remove('active')});b.classList.add('active');activeFilter=b.dataset.procSupplierFilter;redrawTable()}});
    $('[data-proc-unit-filter]',root).forEach(function(b){b.onclick=function(){$('[data-proc-unit-filter]',root).forEach(function(x){x.classList.remove('active')});b.classList.add('active');activeUnitFilter=b.dataset.procUnitFilter;redrawTable()}});
    bindTable(root);
    $$('[data-proc-doc]',root).forEach(function(b){b.onclick=function(){openOrderDocument(b.dataset.procDoc)}});
    $$('[data-proc-fax]',root).forEach(function(b){b.onclick=function(){sendFaxGroup(b.dataset.procFax)}});
    $$('[data-proc-sent]',root).forEach(function(b){b.onclick=function(){recordSent(b.dataset.procSent)}});
    var faxAll=$('#procFaxAll',root);if(faxAll)faxAll.onclick=sendFaxAll;
    $$('[data-proc-shortage]',root).forEach(function(b){b.onclick=function(){recordShortage(b.dataset.procShortage)}});
  }
  function bindTable(root){
    $$('[data-proc-qty]',root).forEach(function(i){i.onchange=function(){setOverride(i.dataset.procQty,{qty:Math.max(0,num(i.value))});render()}});
    $$('[data-proc-pack]',root).forEach(function(i){i.onchange=function(){setOverride(i.dataset.procPack,{pack:Math.max(1,num(i.value,1)),qty:null});var ov=state.overrides[i.dataset.procPack]||{};delete ov.qty;state.overrides[i.dataset.procPack]=ov;persist();render()}});
    $$('[data-proc-air-unit]',root).forEach(function(el){el.onchange=function(){var key=el.dataset.procAirUnit,ov=state.overrides[key]||{};ov.airUnit=el.value;ov.orderUnit=el.value;delete ov.qty;state.overrides[key]=ov;persist();render()}});
    $$('[data-proc-carton-size]',root).forEach(function(el){el.onchange=function(){var key=el.dataset.procCartonSize,ov=state.overrides[key]||{};ov.cartonSize=Math.max(1,num(el.value,1));delete ov.qty;state.overrides[key]=ov;persist();render()}});
    $$('[data-proc-order-unit]',root).forEach(function(el){el.onchange=function(){var key=el.dataset.procOrderUnit,ov=state.overrides[key]||{};ov.orderUnit=el.value;delete ov.qty;state.overrides[key]=ov;persist();render()}});
    $$('[data-proc-route]',root).forEach(function(el){el.onchange=function(){setOverride(el.dataset.procRoute,{route:el.value,routeLocked:true});render()}});
  }

  function openNewProduct(){
    var backdrop=$('#modalBackdrop'),modal=$('#modal');if(!backdrop||!modal)return;
    modal.innerHTML='<div class="modal-head"><div><span class="eyebrow">NEW PRODUCT</span><h2>新規商品を発注候補へ追加</h2></div><button class="icon-btn" id="procNewClose">×</button></div><div class="proc-new-form">'+field('商品名','procNewName','','text')+field('JAN / バーコード','procNewBarcode','','text')+'<label><span>仕入先</span><select id="procNewSupplier">'+SUPPLIERS.map(function(s){return '<option value="'+s.id+'">'+esc(s.name)+'</option>'}).join('')+'</select></label>'+field('仕入単価（Air登録単位）','procNewCost','','number')+field('販売価格（Air登録単位）','procNewPrice','','number')+'<label><span>Airレジ登録単位</span><select id="procNewAirUnit"><option value="single">単品</option><option value="carton">カートン</option></select></label>'+field('1カートン入数','procNewCartonSize','10','number')+'<label><span>仕入先への発注単位</span><select id="procNewOrderUnit"><option value="single">単品</option><option value="carton">カートン</option></select></label>'+field('発注刻み','procNewPack','1','number')+field('初回発注数','procNewQty','5','number')+field('分類','procNewCategory','新商品','text')+'<label class="proc-check"><input id="procNewTs" type="checkbox"><span>TS混合でも発注できる</span></label></div><div class="modal-actions"><button class="ghost" id="procNewCancel">キャンセル</button><button class="primary-btn" id="procNewSave">追加して今回の発注へ</button></div>';
    backdrop.classList.add('show');
    function close(){backdrop.classList.remove('show')}
    $('#procNewClose').onclick=close;$('#procNewCancel').onclick=close;
    $('#procNewAirUnit').onchange=function(){if($('#procNewAirUnit').value==='carton')$('#procNewOrderUnit').value='carton'};
    $('#procNewSave').onclick=function(){
      var name=$('#procNewName').value.trim();if(!name){alert('商品名を入力してください');return}
      state.manual.push({uid:Date.now()+'-'+Math.random().toString(36).slice(2,7),name:name,barcode:$('#procNewBarcode').value.trim(),supplier:$('#procNewSupplier').value,cost:num($('#procNewCost').value),price:num($('#procNewPrice').value),airUnit:$('#procNewAirUnit').value,cartonSize:Math.max(1,num($('#procNewCartonSize').value,10)),orderUnit:$('#procNewOrderUnit').value,pack:Math.max(1,num($('#procNewPack').value,1)),initialQty:Math.max(1,num($('#procNewQty').value,1)),category:$('#procNewCategory').value.trim()||'新商品',tsEligible:$('#procNewTs').checked});
      persist();close();render();
    };
  }

  function orderData(group){var rows=buildRows().filter(function(r){return r.qty>0&&groupId(r)===group});return {id:group,name:groupName(group),supplier:groupSupplier(group),rows:rows,stats:groupStats(group,rows)}}
  function orderHtml(group){
    var d=orderData(group),cfg=supplierCfg(d.supplier),isAkiyama=d.supplier==='AY',date=today(),total=d.stats.total;
    var greeting=isAkiyama?'秋山産業様':esc(d.name)+' 御中';
    var account=isAkiyama?'<p class="center"><strong>40159009　北九州のいっぷくです。</strong></p>':'';
    var sample=(cfg.samples||isAkiyama)?'<p class="sample">各種サンプルも同梱できるものがあれば、よろしくお願いいたします。</p>':'';
    return '<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>'+esc(d.name)+' 発注書 '+date+'</title><style>body{font-family:-apple-system,BlinkMacSystemFont,"Hiragino Kaku Gothic ProN","Yu Gothic",sans-serif;color:#111;margin:28px;font-size:14px}.center{text-align:center}h1{font-size:20px;text-align:center;margin:0 0 12px}table{width:100%;border-collapse:collapse;margin:18px 0}th,td{border:1px solid #333;padding:8px;vertical-align:top}th{background:#f4f4f4}td.num,th.num{text-align:right;white-space:nowrap}.total{text-align:right;font-size:18px;font-weight:700}.sample{font-weight:700;margin:22px 0}.store{text-align:center;line-height:1.8;margin-top:28px}.actions{position:fixed;right:18px;top:18px}@media print{.actions{display:none}body{margin:12mm}}</style></head><body><div class="actions"><button onclick="window.print()">印刷 / PDF</button></div><h1>'+greeting+'</h1><p class="center">いつもお世話になり、ありがとうございます。</p>'+account+'<p class="center">下記の通り、発注いたします。よろしくお願いいたします。</p><table><thead><tr><th>商品名</th><th>バーコード</th><th class="num">数</th><th class="num">単価</th><th class="num">発注額</th></tr></thead><tbody>'+d.rows.map(function(r){return '<tr><td>'+esc(r.name)+'</td><td>'+esc(r.barcode||'')+'</td><td class="num">'+r.qty+' '+esc(r.orderUnitLabel)+'</td><td class="num">'+yen(r.cost)+'</td><td class="num">'+yen(r.qty*r.cost)+'</td></tr>'}).join('')+'</tbody></table><div class="total">合計 '+yen(total)+'</div>'+sample+'<div class="store">いっぷく<br>〒807-0806<br>北九州市八幡西区御開1-23-1<br>090-7533-4223<br>E-mail: ippuku.tobacco@gmail.com</div></body></html>';
  }
  function openOrderDocument(group){var d=orderData(group);if(!d.rows.length){alert('発注商品がありません');return}var w=window.open('','_blank');if(!w){alert('ポップアップを許可してください');return}w.document.open();w.document.write(orderHtml(group));w.document.close()}
  function sendFaxGroup(group){
    var d=orderData(group),cfg=supplierCfg(d.supplier);if(!cfg.fax){alert('この仕入先のFAX番号が未設定です。発注条件から登録してください。');return Promise.reject(new Error('FAX未設定'))}
    var url=String(state.settings.bridgeUrl||'').replace(/\/$/,'')+'/fax';
    return fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({supplier:d.name,fax:cfg.fax,title:d.name+' 発注書 '+today(),html:orderHtml(group),items:d.rows.map(function(r){return {name:r.name,barcode:r.barcode,qty:r.qty,unit:r.orderUnitLabel,cartonSize:r.cartonSize,unitPrice:r.cost}})})}).then(function(res){if(!res.ok)throw new Error('Bridge '+res.status);return res.json().catch(function(){return {}})}).then(function(){recordSent(group,true);alert(d.name+' をFAX送信しました')}).catch(function(e){openOrderDocument(group);alert('Mac FAX Bridgeに接続できませんでした。注文書を開いたので、現在のBrother FAX手順で送信してください。\n\n'+e.message);throw e});
  }
  function sendFaxAll(){var gs=groups(buildRows()),ids=Object.keys(gs).filter(function(id){var sid=groupSupplier(id),cfg=sid?supplierCfg(sid):null;return id!=='HOLD'&&id!=='JT_REGULAR'&&cfg&&cfg.fax});if(!ids.length){alert('FAX番号が設定された発注先がありません');return}if(!confirm(ids.length+'社へFAX送信します。発注数量を最終確認しましたか？'))return;var p=Promise.resolve();ids.forEach(function(id){p=p.then(function(){return sendFaxGroup(id).catch(function(){return null})})})}
  function recordSent(group,silent){var d=orderData(group);if(!d.rows.length)return;state.orders.push({id:Date.now()+'-'+Math.random().toString(36).slice(2,6),date:new Date().toLocaleString('ja-JP'),group:group,groupName:d.name,total:d.stats.total,shortageAmount:0,items:d.rows.map(function(r){return {key:r.key,name:r.name,qty:r.qty,unit:r.orderUnitLabel,cartonSize:r.cartonSize,cost:r.cost}})});persist();if(!silent){alert('発注履歴に登録しました');render()}}
  function recordShortage(id){var o=state.orders.find(function(x){return x.id===id});if(!o)return;var v=prompt('欠品で減った金額を入力してください（円）',String(o.shortageAmount||0));if(v==null)return;o.shortageAmount=Math.max(0,num(v));persist();render()}

  function init(){var root=$('#procurementApp');if(root)render();document.addEventListener('click',function(e){var go=e.target.closest&&e.target.closest('[data-go="procurement"]');if(go)setTimeout(render,0)})}
  window.ippukuProcurementRender=render;
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();