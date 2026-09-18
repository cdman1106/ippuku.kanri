window.MENU_DATA = [
  {name:"紅茶/アイスティー",category:"Relax",price:550,badges:["HOT","ICE"],choices:[
    {label:"温度",options:["HOT","ICE"]},
    {label:"飲み方",options:["ストレート","ミルク","レモン"]},
    {label:"甘さ",options:["なし","砂糖","ガムシロップ"]}
  ]},
  {name:"ミルクティー",category:"Relax",price:580,badges:["HOT","ICE"],choices:[
    {label:"温度",options:["HOT","ICE"]},
    {label:"甘さ",options:["なし","砂糖","ガムシロップ"]}
  ]},
  {name:"抹茶ラテ",category:"Relax",price:660,badges:["HOT","ICE"],choices:[{label:"温度",options:["HOT","ICE"]}]},
  {name:"ルイボスティー",category:"Relax",price:550,badges:["HOT","ICE"],choices:[
    {label:"温度",options:["HOT","ICE"]},
    {label:"甘さ",options:["なし","砂糖","ガムシロップ"]}
  ]},
  {name:"ゆず蜜",category:"Relax",price:650,badges:["HOT","ICE"],choices:[{label:"割り方",options:["水割り","お湯割り","炭酸割り"]}]},

  {name:"コーヒー",category:"Café",price:550,badges:["HOT","ICE"],choices:[
    {label:"温度",options:["HOT","ICE"]},
    {label:"甘さ",options:["なし（ブラック）","砂糖","ガムシロップ"]},
    {label:"コーヒーフレッシュ",options:["なし","あり"]}
  ]},
  {name:"カフェラテ",category:"Café",price:580,badges:["HOT","ICE"],choices:[
    {label:"温度",options:["HOT","ICE"]},
    {label:"甘さ",options:["なし","砂糖","ガムシロップ"]}
  ]},
  {name:"ウィンナーコーヒー",category:"Café",price:650,badges:["HOT","ICE"],choices:[{label:"温度",options:["HOT","ICE"]}]},
  {name:"キャラメルマキアート",category:"Café",price:660,badges:["HOT","ICE"],choices:[{label:"温度",options:["HOT","ICE"]}]},
  {name:"ホワイトモカ",category:"Café",price:660,badges:["HOT"],fixedOption:"HOT"},
  {name:"カフェ・モカ",category:"Café",price:660,badges:["HOT","ICE"],choices:[{label:"温度",options:["HOT","ICE"]}]},
  {name:"チョコチーノ",category:"Café",price:660,badges:["HOT","ICE"],choices:[{label:"温度",options:["HOT","ICE"]}]},

  {name:"コーラ",category:"Refresh",price:550},
  {name:"みかんジュース",category:"Refresh",price:560,description:"つぶ入り"},
  {name:"青森りんご100%/炭酸",category:"Refresh",price:650},
  {name:"ペリエ",category:"Refresh",price:580,description:"レモン果汁添え"},
  {name:"モンスター",category:"Refresh",price:580},

  {name:"ポパイサンド",category:"Food",price:550,image:"./assets/menu/hot_sand.webp",description:"ハム＆とろ〜りチーズ、きのこ、ほうれん草"},
  {name:"あんバターサンド",category:"Food",price:500,image:"./assets/menu/hot_sand.webp",description:"自家製あんこ＋バター"},
  {name:"チーズケーキ",category:"Dessert",price:330,image:"./assets/menu/cheesecake.webp"},
  {name:"コーヒーゼリーパフェ",category:"Dessert",price:550,image:"./assets/menu/coffee_jelly_parfait.webp"},
  {name:"コーヒーゼリー",category:"Dessert",price:330,image:"./assets/menu/coffee_jelly_parfait.webp",description:"コーヒーゼリーのみ"},
  {name:"こんがりワッフル",category:"Dessert",price:440,image:"./assets/menu/waffle.webp",description:"ソースを選べます",choices:[{label:"ソース",options:["チョコ","キャラメル","ベリー"]}]},
  {name:"濃厚バニラアイス",category:"Dessert",price:380,image:"./assets/menu/vanilla_ice.webp",description:"ダブル（2個盛り）は30円引き",choices:[{label:"盛り方",options:[{label:"シングル",priceDelta:0},{label:"ダブル（2個盛り・30円引き）",priceDelta:350}]}]},

  {name:"ナッツ",category:"Snack",price:220},
  {name:"チョコレート",category:"Snack",price:110},

  {name:"ZIPPOガチャ",category:"Gacha",price:5000,description:"1回5,000円・深夜料金対象外",nightFeeExempt:true},
  {name:"The Cling Lighter ガチャ",category:"Lighter",price:10000,description:"ランダムで1点。試し吸い棚にサンプルあり。音を鳴らして試せます。指名買いは15,000〜20,000円。深夜料金対象外",nightFeeExempt:true}
];
