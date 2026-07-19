// thrust-formula.mjs — FAQ formula: thrust = 0.6·RS1W + 0.4·RS1M + 0.1·(RS1W_t − RS1W_{t−3}).
// RS1M = PERCENTRANK.INC(close/RSP within own trailing 21)×100 (proven). Fit RS1W variant + rounding.
import { readFileSync } from "fs";
const c = JSON.parse(readFileSync("scripts/.grouprs-cache.json", "utf8"));
const rspMap = new Map(c.benchmarks.RSP.map(b => [b.d, b.c]));
const spyMap = new Map(c.benchmarks.SPY.map(b => [b.d, b.c]));
const byT = new Map();
for (const r of c.raw)   if (r.bars) byT.set(r.t, r.bars);
for (const r of c.rawPF) if (r.bars && !byT.has(r.t)) byT.set(r.t, r.bars);
const GROUPS = [
  ["PBJ",105,100],["FCG",102,100],["MOO",100,100],["WOOD",100,100],["SCHH",100,100],["AMLP",100,100],["USO",100,100],["XOP",100,100],
  ["IYT",91,95],["KIE",91,95],["KRE",88,95],["KBE",86,95],["WCLD",86,95],["KWEB",78,90],["IPAY",74,90],["CHIQ",73,90],["IBUY",73,90],["BUG",73,90],["CLOU",73,90],
  ["XPH",89,85],["XRT",82,85],["KCE",71,85],["FXI",71,85],["ETHA",59,85],["CIBR",59,85],["GNR",80,80],["XTN",74,80],["IBIT",69,80],["MAGS",45,80],["EWZ",45,80],
  ["PPH",100,75],["PBE",88,75],["XHS",88,75],["GUNR",67,75],["PHO",81,70],["XHE",63,70],["BOAT",63,65],["XSW",31,65],
  ["ILF",49,60],["IHF",44,60],["IAI",37,60],["SLX",59,55],["IGV",39,55],["FDN",14,55],["SOLZ",42,50],["ESPO",30,50],["GENZ",18,50],["SOCL",13,50],
];
const PF = [
  ["SPY",2,25],["QQQ",-7,0],["QQQE",-3,0],["IWM",24,10],["DIA",9,5],["SPMO",-7,0],["TLT",81,35],
  ["IJS",82,85],["IJR",78,65],["IJT",28,15],["IJJ",98,95],["IJH",38,25],["IJK",10,5],["IVE",103,100],["IVV",0,25],["IVW",-8,0],
  ["RSPF",100,100],["RSPG",100,100],["RSPS",105,95],["RSPR",96,85],["RSPH",75,70],["RSPC",59,65],["RSPM",77,35],["RSPD",41,15],["RSPN",39,15],["RSPU",9,15],["RSPT",7,15],
  ["XLE",100,100],["XLRE",99,90],["XLF",73,90],["XLP",100,80],["XLV",88,75],["XLC",28,65],["XLB",38,20],["XLI",12,5],["XLY",0,5],["XLK",-7,0],
];  // XLU excluded (low-conf thrust)
const CELLS=[...GROUPS,...PF];
function aligned(bars,m){return bars.filter(x=>m.has(x.d)).map(x=>x.c/m.get(x.d));}
function alignedC(bars,m){return bars.filter(x=>m.has(x.d)).map(x=>({c:x.c,rel:x.c/m.get(x.d)}));}
function prankINC(arr,x){const b=arr.filter(v=>v<x).length;return arr.length>1?b/(arr.length-1)*100:null;}

// RS1M proven
function rs1m(rel,end){ return prankINC(rel.slice(end-20,end+1),rel[end]); }

// RS1W variants — return value "as of index e" using data up to e
function makeRS1W(variant){
  return (rel, e)=>{
    if(variant==="a5"){ // percentrank of 5d rel return in trailing 21
      const chg=i=>rel[i]/rel[i-5]-1; const s=[]; for(let i=e-20;i<=e;i++)s.push(chg(i)); return prankINC(s,chg(e)); }
    if(variant==="a5w25"){ const chg=i=>rel[i]/rel[i-5]-1; const s=[]; for(let i=e-24;i<=e;i++)s.push(chg(i)); return prankINC(s,chg(e)); }
    if(variant==="b_w5"){ return prankINC(rel.slice(e-4,e+1),rel[e]); }
    if(variant==="c_w6"){ return prankINC(rel.slice(e-5,e+1),rel[e]); }
    if(variant==="w7"){ return prankINC(rel.slice(e-6,e+1),rel[e]); }
    if(variant==="w10"){ return prankINC(rel.slice(e-9,e+1),rel[e]); }
    if(variant==="d_wt"){ const W=[5,4,3,2,1]; const wchg=i=>{let x=0;for(let k=0;k<5;k++)x+=W[k]*(rel[i-k]/rel[i-k-1]-1);return x;}; const s=[];for(let i=e-20;i<=e;i++)s.push(wchg(i)); return prankINC(s,wchg(e)); }
    if(variant==="d_wt25"){ const W=[5,4,3,2,1]; const wchg=i=>{let x=0;for(let k=0;k<5;k++)x+=W[k]*(rel[i-k]/rel[i-k-1]-1);return x;}; const s=[];for(let i=e-24;i<=e;i++)s.push(wchg(i)); return prankINC(s,wchg(e)); }
    return null;
  };
}
const VARIANTS=["a5","a5w25","b_w5","c_w6","w7","w10","d_wt","d_wt25"];
const ROUND={ half_up:v=>Math.round(v), floor:v=>Math.floor(v), ceil:v=>Math.ceil(v), trunc:v=>Math.trunc(v),
  bankers:v=>{const f=Math.floor(v);const d=v-f;if(d<0.5)return f;if(d>0.5)return f+1;return f%2===0?f:f+1;} };
const LAGS={t3:3,t2:2,t4:4};
const SNAP={raw:v=>v, snap5:v=>v==null?null:Math.round(v/5)*5};

const res=[];
for(const variant of VARIANTS){
  const rs1w=makeRS1W(variant);
  for(const [snapN,snapF] of Object.entries(SNAP)){
    for(const [lagN,lag] of Object.entries(LAGS)){
      for(const [rN,rF] of Object.entries(ROUND)){
        let ex=0,w1=0; const miss=[]; let n=0;
        for(const [t,thr,hisRS] of CELLS){
          const bars=byT.get(t); if(!bars)continue;
          const rel=aligned(bars,rspMap); const last=rel.length-1;
          const RSM=rs1m(rel,last);
          const w_t=snapF(rs1w(rel,last)); const w_t3=snapF(rs1w(rel,last-lag));
          if(RSM==null||w_t==null||w_t3==null)continue; n++;
          const val=0.6*w_t + 0.4*RSM + 0.1*(w_t - w_t3);
          const p=rF(val);
          if(p===thr)ex++; else miss.push(`${t}:${p}v${thr}`);
          if(Math.abs(val-thr)<=1)w1++;
        }
        res.push({combo:`RS1W=${variant}|snap=${snapN}|lag=${lagN}|round=${rN}`,ex,w1,n,miss});
      }
    }
  }
}
res.sort((a,b)=>b.ex-a.ex||b.w1-a.w1);
console.log("FAQ formula fit  thrust=0.6·RS1W+0.4·RS1M+0.1·(RS1W_t−RS1W_t-lag):  exact/within1 of n");
for(const r of res.slice(0,12)) console.log(`  ${String(r.ex).padStart(2)}/${String(r.w1).padStart(2)} of ${r.n} | ${r.combo}`);
console.log(`\nBEST: ${res[0].combo}  ${res[0].ex}/${res[0].n} exact`);
console.log("  misses:", res[0].miss.join("  "));
