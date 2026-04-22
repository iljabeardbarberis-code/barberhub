import React, { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { initializeApp } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "firebase/auth";
import { getFirestore, collection, doc, setDoc, getDoc, addDoc, updateDoc, deleteDoc, onSnapshot, query, orderBy, runTransaction, getDocs, where } from "firebase/firestore";


// ── Telegram notifications ─────────────────────────────────────────────────
const sendTelegramMessage = async (chatId, text) => {
  const TOKEN = import.meta.env.VITE_TELEGRAM_TOKEN;
  if(!TOKEN || !chatId) return;
  // Clean chatId - remove @ if present, use as username
  const chat = chatId.startsWith("@") ? chatId : chatId;
  try{
    await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({chat_id:chat, text, parse_mode:"HTML"})
    });
  }catch(e){}
};

// ── Sound effects ──────────────────────────────────────────────────────────
const playSuccessSound = () => {
  try{
    const ctx = new (window.AudioContext||window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.setValueAtTime(600, ctx.currentTime);
    osc.frequency.setValueAtTime(900, ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.4);
  }catch(e){}
};




const MELODIES = [
  {
    id:"mario", name:"🎮 Super Mario",
    notes:{E5:659,D5:587,C5:523,G4:392,A4:440,B4:494,F5:698,G5:784,A5:880,Bb4:466},
    melody:[["E5",.15],["E5",.15],[null,.15],["E5",.15],[null,.15],["C5",.15],["E5",.3],["G5",.3],[null,.3],["G4",.3],[null,.3],["C5",.3],[null,.15],["G4",.3],[null,.15],["E5",.2],["G5",.2],["A5",.3],["F5",.15],["G5",.3],[null,.15],["E5",.3],[null,.15],["C5",.15],["D5",.15],["B4",.3]],
    type:"square", vol:0.06
  },
  {
    id:"jazz", name:"🎷 Cool Jazz",
    notes:{C4:262,E4:330,G4:392,Bb4:466,D4:294,F4:349,A4:440,C5:523},
    melody:[["C4",.2],["E4",.2],["G4",.2],["Bb4",.4],[null,.1],["A4",.2],["G4",.2],[null,.1],["F4",.2],["E4",.4],[null,.2],["D4",.2],["F4",.2],["A4",.2],["C5",.4],[null,.3]],
    type:"triangle", vol:0.07
  },
  {
    id:"blues", name:"🎸 Blues Riff",
    notes:{A3:220,C4:262,D4:294,Eb4:311,E4:330,G4:392,A4:440},
    melody:[["A3",.15],["A3",.15],["A3",.15],["A3",.15],["C4",.15],["D4",.15],["Eb4",.15],["E4",.3],[null,.1],["E4",.15],["E4",.15],[null,.1],["D4",.15],["C4",.15],["A3",.3],[null,.2]],
    type:"sawtooth", vol:0.05
  },
  {
    id:"lounge", name:"🥂 Lounge Vibes",
    notes:{F4:349,A4:440,C5:523,E5:659,G4:392,B4:494,D5:587},
    melody:[["F4",.3],["A4",.3],["C5",.3],["E5",.6],[null,.2],["D5",.3],["C5",.3],["B4",.3],["A4",.6],[null,.2],["G4",.3],["B4",.3],["D5",.3],["F4",.6],[null,.3]],
    type:"sine", vol:0.06
  },
  {
    id:"bossa", name:"🌴 Bossa Nova",
    notes:{C4:262,E4:330,G4:392,A4:440,D4:294,F4:349,B4:494,C5:523},
    melody:[["C4",.15],[null,.1],["E4",.15],["G4",.15],[null,.1],["A4",.3],[null,.1],["G4",.15],[null,.1],["F4",.15],["E4",.15],[null,.1],["D4",.3],[null,.1],["C4",.15],[null,.1],["B4",.15],[null,.1],["C5",.4],[null,.3]],
    type:"triangle", vol:0.06
  },
  {
    id:"funk", name:"🕺 Funky Beat",
    notes:{A3:220,D4:294,E4:330,G4:392,A4:440,C5:523},
    melody:[["A3",.1],[null,.05],["A3",.1],["D4",.2],[null,.1],["E4",.1],[null,.05],["G4",.1],["A4",.2],[null,.1],["G4",.1],["E4",.1],[null,.05],["D4",.2],[null,.1],["A3",.3],[null,.2]],
    type:"square", vol:0.05
  },
  {
    id:"retro", name:"👾 Retro Arcade",
    notes:{C5:523,E5:659,G5:784,B5:988,A5:880,F5:698,D5:587},
    melody:[["C5",.1],["E5",.1],["G5",.1],["B5",.1],[null,.05],["A5",.15],["G5",.1],[null,.05],["F5",.1],["E5",.1],["D5",.1],["C5",.2],[null,.1],["G5",.1],["A5",.1],["B5",.15],[null,.1],["C5",.2],[null,.2]],
    type:"square", vol:0.04
  },
  {
    id:"swing", name:"🎩 Swing Time",
    notes:{C4:262,E4:330,G4:392,A4:440,B4:494,D4:294,F4:349},
    melody:[["C4",.2],["E4",.1],["G4",.3],[null,.1],["A4",.2],["G4",.1],[null,.05],["E4",.2],["D4",.1],["F4",.3],[null,.1],["E4",.2],["D4",.1],["C4",.4],[null,.3]],
    type:"triangle", vol:0.06
  },
  {
    id:"latin", name:"💃 Latin Heat",
    notes:{E4:330,A4:440,B4:494,C5:523,D5:587,G4:392,F4:349},
    melody:[["E4",.15],[null,.1],["A4",.15],["B4",.15],[null,.1],["C5",.2],[null,.1],["B4",.15],["A4",.15],[null,.1],["G4",.2],[null,.1],["F4",.15],[null,.1],["E4",.3],[null,.2]],
    type:"sine", vol:0.07
  },
  {
    id:"soul", name:"🎤 Soul Groove",
    notes:{G3:196,Bb3:233,C4:262,D4:294,F4:349,G4:392,A4:440},
    melody:[["G3",.2],["Bb3",.2],["C4",.2],["D4",.4],[null,.1],["C4",.2],["Bb3",.2],[null,.1],["G3",.2],["F4",.2],["G4",.4],[null,.1],["A4",.2],["G4",.2],["F4",.2],["D4",.4],[null,.3]],
    type:"triangle", vol:0.06
  },
  {
    id:"ska", name:"🏄 Ska Vibes",
    notes:{C4:262,E4:330,G4:392,A4:440,F4:349,D4:294,B4:494},
    melody:[[null,.15],["G4",.1],[null,.1],["G4",.1],[null,.15],["E4",.1],[null,.1],["E4",.1],[null,.15],["F4",.1],[null,.1],["F4",.1],[null,.15],["D4",.1],[null,.1],["C4",.2],[null,.2]],
    type:"square", vol:0.05
  },
  {
    id:"chill", name:"🌊 Chill Wave",
    notes:{A4:440,C5:523,E5:659,G5:784,F5:698,D5:587,B4:494},
    melody:[["A4",.4],["C5",.4],["E5",.4],["G5",.8],[null,.2],["F5",.4],["E5",.4],["D5",.4],["C5",.8],[null,.2],["B4",.4],["D5",.4],["F5",.4],["A4",.8],[null,.4]],
    type:"sine", vol:0.05
  },
  {
    id:"gospel", name:"🙏 Gospel Cheer",
    notes:{C4:262,E4:330,G4:392,A4:440,C5:523,B4:494,D4:294},
    melody:[["C4",.2],["E4",.2],["G4",.2],["C5",.4],[null,.1],["B4",.2],["A4",.2],[null,.1],["G4",.2],["E4",.2],["D4",.2],["C4",.4],[null,.2],["G4",.2],["A4",.2],["C5",.6],[null,.3]],
    type:"triangle", vol:0.07
  },
  {
    id:"rnb", name:"🎵 R&B Smooth",
    notes:{D4:294,F4:349,A4:440,C5:523,Bb4:466,G4:392,E4:330},
    melody:[["D4",.25],[null,.1],["F4",.25],["A4",.25],[null,.1],["Bb4",.4],[null,.15],["A4",.25],[null,.1],["G4",.25],["F4",.25],[null,.1],["E4",.4],[null,.15],["D4",.5],[null,.3]],
    type:"sine", vol:0.06
  },
  {
    id:"disco", name:"🪩 Disco Fever",
    notes:{C4:262,D4:294,E4:330,G4:392,A4:440,C5:523,B4:494},
    melody:[["C4",.1],["D4",.1],["E4",.1],["G4",.1],["A4",.1],[null,.05],["A4",.1],[null,.05],["G4",.1],["E4",.1],[null,.05],["D4",.1],["C4",.2],[null,.1],["B4",.1],["C5",.1],["B4",.1],["A4",.2],[null,.2]],
    type:"sawtooth", vol:0.04
  },
  {
    id:"piano", name:"🎹 Piano Bar",
    notes:{F4:349,A4:440,C5:523,E5:659,D5:587,G4:392,B4:494},
    melody:[["F4",.3],["A4",.3],["C5",.3],["E5",.6],[null,.2],["D5",.3],["C5",.3],["B4",.3],["A4",.3],[null,.1],["G4",.3],["B4",.3],["D5",.3],["F4",.6],[null,.4]],
    type:"triangle", vol:0.07
  },
  {
    id:"trap", name:"🎧 Lo-Fi Trap",
    notes:{C4:262,Eb4:311,G4:392,Bb4:466,Ab4:415,F4:349},
    melody:[["C4",.2],[null,.1],["C4",.1],[null,.1],["Eb4",.2],[null,.1],["G4",.3],[null,.1],["Bb4",.2],[null,.1],["Ab4",.2],["G4",.3],[null,.2],["F4",.2],[null,.1],["Eb4",.2],[null,.1],["C4",.4],[null,.4]],
    type:"triangle", vol:0.05
  },
  {
    id:"waltz", name:"💫 Vienna Waltz",
    notes:{C4:262,E4:330,G4:392,C5:523,A4:440,F4:349,D4:294},
    melody:[["C4",.3],["E4",.15],["G4",.15],["C5",.3],["G4",.15],[null,.15],["A4",.3],["F4",.15],["A4",.15],[null,.3],["G4",.15],["E4",.15],["D4",.3],["F4",.15],["A4",.15],["C5",.5],[null,.3]],
    type:"sine", vol:0.06
  },
  {
    id:"reggae", name:"🏝️ Reggae Chill",
    notes:{G4:392,A4:440,Bb4:466,C5:523,D5:587,F5:698,E5:659},
    melody:[[null,.15],["G4",.1],[null,.1],["Bb4",.1],[null,.15],["C5",.2],[null,.1],["D5",.1],[null,.1],["C5",.15],[null,.1],["Bb4",.1],[null,.15],["G4",.3],[null,.2],["F5",.2],[null,.1],["E5",.2],[null,.1],["D5",.4],[null,.3]],
    type:"triangle", vol:0.06
  },
  {
    id:"ambient", name:"✨ Ambient Space",
    notes:{C4:262,E4:330,G4:392,B4:494,D5:587,F5:698,A5:880},
    melody:[["C4",.6],[null,.2],["E4",.6],[null,.2],["G4",.6],[null,.2],["B4",.8],[null,.3],["D5",.6],[null,.2],["F5",.6],[null,.2],["G4",.6],[null,.2],["A5",.8],[null,.5]],
    type:"sine", vol:0.04
  },
];

const startMelody = (audioRef, melodyId="mario") => {
  const mel = MELODIES.find(m=>m.id===melodyId) || MELODIES[0];
  const ctx = new (window.AudioContext||window.webkitAudioContext)();
  audioRef.current = ctx;
  const gainNode = ctx.createGain();
  gainNode.gain.setValueAtTime(mel.vol, ctx.currentTime);
  gainNode.connect(ctx.destination);
  const playLoop = () => {
    if(!audioRef.current) return;
    let t = ctx.currentTime + 0.05;
    mel.melody.forEach(([note, dur]) => {
      if(note && mel.notes[note]){
        const osc = ctx.createOscillator();
        osc.connect(gainNode);
        osc.type = mel.type;
        osc.frequency.setValueAtTime(mel.notes[note], t);
        osc.start(t); osc.stop(t + dur * 0.88);
      }
      t += dur;
    });
    audioRef.current._timeout = setTimeout(playLoop, (t - ctx.currentTime) * 1000);
  };
  playLoop();
};


const startMarioMusic = (audioRef) => {
  const ctx = new (window.AudioContext||window.webkitAudioContext)();
  audioRef.current = ctx;

  const notes = {
    E5:659, D5:587, C5:523, G4:392, A4:440, B4:494,
    F5:698, G5:784, A5:880, Bb4:466, Bb5:932
  };

  // Mario overworld theme (simplified)
  const melody = [
    ["E5",.15],["E5",.15],[null,.15],["E5",.15],[null,.15],["C5",.15],["E5",.3],
    ["G5",.3],[null,.3],["G4",.3],[null,.3],
    ["C5",.3],[null,.15],["G4",.3],[null,.15],["E4",.3],[null,.15],
    ["A4",.3],[null,.15],["B4",.3],[null,.15],["Bb4",.15],["A4",.3],
    ["G4",.2],["E5",.2],["G5",.2],["A5",.3],["F5",.15],["G5",.3],
    [null,.15],["E5",.3],[null,.15],["C5",.15],["D5",.15],["B4",.3],
  ];

  let t = ctx.currentTime + 0.1;
  const gainNode = ctx.createGain();
  gainNode.gain.setValueAtTime(0.06, ctx.currentTime);
  gainNode.connect(ctx.destination);

  const playMelody = (startT) => {
    let time = startT;
    melody.forEach(([note, dur]) => {
      if(note && notes[note]){
        const osc = ctx.createOscillator();
        osc.connect(gainNode);
        osc.type = "square";
        osc.frequency.setValueAtTime(notes[note], time);
        osc.start(time);
        osc.stop(time + dur * 0.9);
      }
      time += dur;
    });
    return time;
  };

  // Loop
  const loop = () => {
    if(!audioRef.current) return;
    const end = playMelody(ctx.currentTime + 0.1);
    audioRef.current._timeout = setTimeout(loop, (end - ctx.currentTime) * 1000);
  };
  loop();
};

const stopMarioMusic = (audioRef) => {
  if(audioRef.current){
    try{ audioRef.current.close(); }catch(e){}
    clearTimeout(audioRef.current._timeout);
    audioRef.current = null;
  }
};

const playClickSound = () => {
  try{
    const ctx = new (window.AudioContext||window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.setValueAtTime(800, ctx.currentTime);
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
    osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.08);
  }catch(e){}
};

const playNotifSound = () => {
  try{
    const ctx = new (window.AudioContext||window.webkitAudioContext)();
    [0, 0.1].forEach((t, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.setValueAtTime(i===0?700:1000, ctx.currentTime+t);
      gain.gain.setValueAtTime(0.2, ctx.currentTime+t);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime+t+0.15);
      osc.start(ctx.currentTime+t); osc.stop(ctx.currentTime+t+0.15);
    });
  }catch(e){}
};

const playDeleteSound = () => {
  try{
    const ctx = new (window.AudioContext||window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(400, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(100, ctx.currentTime+0.3);
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime+0.3);
    osc.start(ctx.currentTime); osc.stop(ctx.currentTime+0.3);
  }catch(e){}
};

const playDragSound = () => {
  try{
    const ctx = new (window.AudioContext||window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.setValueAtTime(500, ctx.currentTime);
    osc.frequency.setValueAtTime(700, ctx.currentTime+0.05);
    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime+0.12);
    osc.start(ctx.currentTime); osc.stop(ctx.currentTime+0.12);
  }catch(e){}
};

const playBlockSound = () => {
  try{
    const ctx = new (window.AudioContext||window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = "square";
    osc.frequency.setValueAtTime(200, ctx.currentTime);
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime+0.2);
    osc.start(ctx.currentTime); osc.stop(ctx.currentTime+0.2);
  }catch(e){}
};

const playFailSound = () => {
  try{
    const ctx = new (window.AudioContext||window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.setValueAtTime(300, ctx.currentTime);
    osc.frequency.setValueAtTime(200, ctx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.4);
  }catch(e){}
};


const firebaseConfig = {
  apiKey: "AIzaSyDW8eSrkC1Qsk6-NXS3eYWjrBR4RFKvPVc",
  authDomain: "barber-hub-6c69d.firebaseapp.com",
  projectId: "barber-hub-6c69d",
  storageBucket: "barber-hub-6c69d.firebasestorage.app",
  messagingSenderId: "640750699309",
  appId: "1:640750699309:web:4b735bb959ecb8d10349a4"
};
const fbApp = initializeApp(firebaseConfig);
const fbAuth = getAuth(fbApp);
const fbDb = getFirestore(fbApp);

// ── OWNER ACCOUNT ─────────────────────────────────────────────────────────────
const OWNER = { name:"Владелец", email:"owner@barberhub.com", password:"owner2024", role:"owner" };

const INIT_MASTERS = [];

const SERVICES_RU = [
  { id:1, name:"Классическая стрижка", price:25, mins:45 },
  { id:2, name:"Стрижка + борода",     price:40, mins:75 },
  { id:3, name:"Королевское бритьё",  price:30, mins:60 },
  { id:4, name:"Детская стрижка",      price:18, mins:30 },
  { id:5, name:"Fade / Тейп",          price:28, mins:50 },
  { id:6, name:"Окрашивание",          price:55, mins:90 },
];
const SERVICES_LT = [
  { id:1, name:"Klasikinis kirpimas",     price:25, mins:45 },
  { id:2, name:"Kirpimas + barzda",       price:40, mins:75 },
  { id:3, name:"Karališkasis skutimasis", price:30, mins:60 },
  { id:4, name:"Vaikiškas kirpimas",      price:18, mins:30 },
  { id:5, name:"Fade / Taper",            price:28, mins:50 },
  { id:6, name:"Dažymas",                 price:55, mins:90 },
];

const INIT_SUBS = [
  { id:"basic", name:"BASIC", price:35, popular:false,
    masterId:null,       // null = any master
    serviceIds:[],       // [] = any service
    visitsPerMonth:2,
    perks_ru:["2 визита / мес","Любой мастер","Любая услуга"],
    perks_lt:["2 vizitai / mėn","Bet kuris meistras","Bet kuri paslauga"] },
  { id:"pro", name:"PRO", price:60, popular:true,
    masterId:null,
    serviceIds:[],
    visitsPerMonth:4,
    perks_ru:["4 визита / мес","Любой мастер","Скидка 10%"],
    perks_lt:["4 vizitai / mėn","Bet kuris meistras","10% nuolaida"] },
  { id:"elite", name:"ELITE", price:90, popular:false,
    masterId:null,
    serviceIds:[],
    visitsPerMonth:0,    // 0 = безлимит
    perks_ru:["Безлимит","VIP приоритет","Все услуги"],
    perks_lt:["Neribota","VIP prioritetas","Visos paslaugos"] },
];

// Generate 10-min slots 09:00-20:00
const HOURS = Array.from({length:67},(_,i)=>{
  const m = 9*60 + i*10;
  return `${String(Math.floor(m/60)).padStart(2,"0")}:${String(m%60).padStart(2,"0")}`;
});
const THEME_COLORS = ["#e8650a","#1fba7a","#c47cf5","#3b82f6","#ef4444","#f59e0b","#ec4899","#14b8a6","#f97316","#84cc16"];

const DEMO_REVIEWS = [
  { id:1, masterId:"1", clientName:"Иван П.",   rating:5, text:"Алексей — просто волшебник! Идеальный фейд, чёткие линии. Лучшая стрижка в городе!", date:"2024-03-15" },
  { id:2, masterId:"1", clientName:"Андрей К.", rating:5, text:"Профессионализм на высшем уровне. Сделал именно то что я просил. Рекомендую!", date:"2024-03-20" },
  { id:3, masterId:"1", clientName:"Сергей М.", rating:4, text:"Хорошая работа, быстро и аккуратно. Атмосфера отличная.", date:"2024-03-28" },
  { id:4, masterId:"1", clientName:"Томас Л.",  rating:2, text:"Пришлось долго ждать, стрижка средняя.", date:"2024-03-05" },
  { id:5, masterId:"2", clientName:"Виктор Н.", rating:5, text:"Дмитрий — мастер своего дела! Борода выглядит потрясающе. Королевское бритьё — нечто особенное.", date:"2024-03-10" },
  { id:6, masterId:"2", clientName:"Олег С.",   rating:5, text:"Пришёл впервые — остался очень доволен. Горячее полотенце, точный контур бороды.", date:"2024-03-22" },
  { id:7, masterId:"2", clientName:"Максим Т.", rating:4, text:"Дмитрий знает своё дело. Стрижка держится хорошо, борода аккуратно.", date:"2024-04-01" },
  { id:8, masterId:"3", clientName:"Алина М.",  rating:5, text:"Максим — невероятный колорист! Мелирование получилось именно так как хотела!", date:"2024-03-18" },
  { id:9, masterId:"3", clientName:"Катя В.",   rating:5, text:"Наконец нашла своего мастера! Тонирование и стрижка — результат превзошёл ожидания.", date:"2024-03-25" },
  { id:10, masterId:"3", clientName:"Рита К.",  rating:3, text:"Нормально, но не более того. Цвет немного не тот что хотела.", date:"2024-03-12" },
];

const T = {
  ru:{
    login:"Войти", register:"Регистрация", logout:"Выйти",
    book_btn:"Записаться", my_bookings:"Мои записи", subscription:"Подписка",
    home:"Главная", services:"Услуги", masters:"Мастера",
    hero_tag:"Клайпеда · Барбершоп с 2016",
    hero_sub:"Профессиональная мужская стрижка. Бритьё. Уход за бородой.",
    hero_cta:"Записаться онлайн", hero_services:"Услуги и цены",
    clients:"клиентов", years:"лет", masters_count:"мастера",
    services_title:"ПОПУЛЯРНЫЕ УСЛУГИ", masters_title:"МАСТЕРА", sub_title:"ПОДПИСКА",
    services_tag:"Бестселлеры", masters_tag:"Команда", sub_tag:"Абонементы",
    sub_desc:"Посещайте чаще — платите меньше.",
    sub_per_month:"/ мес", sub_activate:"Оформить", sub_active:"Активна ✓", sub_popular:"Популярный", sub_my:"Моя подписка",
    book_online:"Онлайн-запись", step1:"1. Услуга", step2:"2. Мастер", step3:"3. Дата", step4:"4. Время",
    confirm:"Подтвердить →", selected:"✓",
    summary:"Ваша запись", svc:"Услуга", mst:"Мастер", dt:"Дата", tm:"Время", cl:"Клиент",
    duration:"Длительность",
    success_title:"ЗАПИСЬ ПРИНЯТА!", to_my:"Мои записи", to_home:"Главная",
    my_title:"МОИ ЗАПИСИ", my_empty:"Нет записей.", book_again:"Записаться снова", confirmed:"Подтверждено",
    login_title:"ВХОД", login_sub:"Войдите в аккаунт",
    reg_title:"РЕГИСТРАЦИЯ", reg_sub:"Создайте аккаунт",
    f_name:"Имя", f_email:"Email", f_phone:"Телефон", f_pass:"Пароль",
    no_acc:"Нет аккаунта?", reg_link:"Зарегистрироваться", has_acc:"Есть аккаунт?", login_link:"Войти",
    err_wrong:"Неверный email или пароль", err_fill:"Заполните все поля", err_exists:"Email уже существует",
    demo_client:"Клиент", demo_master:"Мастер",
    master_cab:"Кабинет",
    cal_today:"Сегодня", cal_week:"Неделя", cal_list:"Список",
    prev_week:"‹ Пред.", next_week:"След. ›",
    new_appt:"+ Новая запись", no_appts:"Нет записей",
    clients_tab:"Клиенты", stats_tab:"Статистика", settings_tab:"Настройки", reviews_tab:"Отзывы",
    total_today:"Сегодня", total_week:"Неделя", total_all:"Всего",
    revenue:"Выручка", appts_count:"Записей",
    appt_title:"Новая запись", appt_client_name:"Имя клиента", appt_client_phone:"Телефон",
    appt_service:"Услуга", appt_date:"Дата", appt_time:"Время", appt_notes:"Комментарий",
    appt_save:"Сохранить", appt_cancel:"Отмена",
    appt_new_client:"Новый клиент", appt_existing:"Из базы",
    mark_done:"✓ Выполнено", status_cancel:"Удалить", status_done:"Выполнено",
    popular_services:"Популярные услуги",
    settings_title:"НАСТРОЙКИ ПРОФИЛЯ",
    settings_personal:"Личные данные", settings_appearance:"Внешний вид",
    settings_schedule:"Рабочие часы", settings_about:"О себе",
    s_firstname:"Имя", s_lastname:"Фамилия", s_phone:"Телефон", s_instagram:"Instagram", s_telegram:"Telegram (для уведомлений)",
    s_spec_ru:"Специализация (RU)", s_spec_lt:"Специализация (LT)",
    s_experience:"Опыт (лет)",
    s_about_ru:"О себе (RU)", s_about_lt:"О себе (LT)",
    s_photo_url:"Фото по URL", s_photo_upload:"Загрузить фото",
    s_color:"Цвет темы",
    s_work_start:"Начало работы", s_work_end:"Конец работы",
    s_save:"Сохранить изменения", s_saved:"✓ Сохранено!",
    s_preview:"Предпросмотр карточки",
    s_photo_hint:"Вставьте ссылку на фото или загрузите файл",
    s_reset_photo:"Удалить фото",
    exp_years:"лет опыта",
    svc_manager:"Мои услуги",
    svc_manager_desc:"Управляйте своим прайс-листом. Изменения сразу отображаются при записи.",
    svc_name_ru:"Название (RU)", svc_name_lt:"Название (LT)",
    svc_price:"Цена (€)", svc_duration:"Время услуги (мин)", svc_cleanup:"Уборка (мин)",
    svc_cleanup_hint:"Время между клиентами — уборка рабочего места, подготовка",
    svc_add:"+ Добавить услугу", svc_save:"Сохранить прайс", svc_saved:"✓ Прайс сохранён!",
    svc_delete:"Удалить", svc_enabled:"Активна", svc_disabled:"Скрыта",
    svc_toggle_hint:"Скрытые услуги не показываются клиентам",
    min:"мин",
    reviews_title:"ОТЗЫВЫ", reviews_tag:"Клиенты о нас",
    reviews_section:"Отзывы клиентов", reviews_count:"отзывов",
    review_write:"Оставить отзыв", review_name:"Ваше имя",
    review_text:"Ваш отзыв", review_text_ph:"Расскажите о своём визите...",
    review_master:"Мастер", review_rating:"Оценка",
    review_submit:"Отправить отзыв", review_submitted:"✓ Спасибо за отзыв!",
    review_empty:"Отзывов пока нет.",
    review_best:"Показаны лучшие отзывы (4★ и выше)",
    review_login:"Войдите чтобы оставить отзыв",
    out_of_5:"из 5",
    slot_busy:"Занято", slot_closed:"Не рабочее время",
    cleanup_lbl:"Уборка",
    // Owner panel
    owner_panel:"Панель владельца",
    owner_tab_masters:"Мастера",
    owner_tab_bookings:"Все записи",
    owner_tab_stats:"Статистика",
    owner_tab_reviews:"Отзывы",
    owner_add_master:"+ Добавить мастера",
    owner_edit_master:"Редактировать",
    owner_delete_master:"Удалить мастера",
    owner_confirm_delete:"Удалить этого мастера? Все его записи будут удалены.",
    owner_master_form_title:"Новый мастер",
    owner_master_edit_title:"Редактировать мастера",
    owner_master_fname:"Имя",
    owner_master_lname:"Фамилия",
    owner_master_email:"Email (для входа)",
    owner_master_password:"Пароль (для входа)",
    owner_master_spec_ru:"Специализация RU",
    owner_master_spec_lt:"Специализация LT",
    owner_master_color:"Цвет темы",
    owner_master_emoji:"Эмодзи",
    owner_create:"Создать мастера",
    owner_save:"Сохранить",
    owner_cancel:"Отмена",
    owner_total_revenue:"Общая выручка",
    owner_total_bookings:"Всего записей",
    owner_total_clients:"Клиентов",
    owner_total_masters:"Мастеров",
    owner_review_delete:"Удалить отзыв",
    owner_all_reviews:"Все отзывы",
    owner_filter_all:"Все",
    owner_filter_pos:"Положительные",
    owner_filter_neg:"Отрицательные",
    owner_no_bookings:"Нет записей",
    owner_master_exists:"Мастер с таким email уже существует",
    owner_demo_hint:"Демо: owner@barberhub.com / owner2024",
    // Post-visit review popup
    visit_done_title:"Визит завершён!",
    visit_done_sub:"Как всё прошло? Оцените мастера",
    visit_rate_service:"Оцените качество работы",
    visit_leave_review:"Оставить отзыв (необязательно)",
    visit_review_ph:"Расскажите другим клиентам...",
    visit_tips_title:"Оставить чаевые",
    visit_tips_sub:"Порадуйте мастера за отличную работу",
    visit_tips_custom:"Другая сумма",
    visit_tips_pay:"Оплатить чаевые картой",
    visit_tips_skip:"Пропустить",
    visit_tips_paid:"✓ Спасибо! Чаевые отправлены",
    visit_tips_soon:"Оплата картой скоро будет доступна",
    visit_submit:"Отправить оценку",
    visit_submitted:"✓ Спасибо за отзыв!",
    visit_skip:"Пропустить",
    visit_master_lbl:"Ваш мастер",
    // Schedule blocks & salon hours
    block_add:"+ Заблокировать время",
    block_type_break:"Перерыв",
    block_type_closed:"Нерабочее",
    block_type_vacation:"Отпуск",
    block_reason:"Причина (необязательно)",
    block_save:"Сохранить блок",
    block_delete:"Удалить",
    block_from:"С",
    block_to:"До",
    block_date:"Дата",
    block_all_day:"Весь день",
    salon_hours:"Часы работы салона",
    salon_vacation:"Выходные / Отпуск",
    salon_vacation_add:"+ Добавить выходной",
    salon_work_start:"Открытие",
    salon_work_end:"Закрытие",
    salon_days:"Рабочие дни",
    salon_save:"Сохранить расписание",
    salon_saved:"✓ Расписание сохранено!",
    notif_title:"Уведомления",
    notif_empty:"Нет новых уведомлений",
    notif_mark_read:"Отметить все прочитанными",
    notif_booked:"записался",
    notif_cancelled:"отменил запись",
    notif_rescheduled:"перенёс запись",
    notif_block_added:"добавил блок",
    notif_block_removed:"удалил блок",
    owner_tab_schedule:"Расписание",
    // Subscriptions editor
    owner_tab_subs:"Подписки",
    owner_subs_title:"Редактор подписок",
    owner_sub_name:"Название",
    owner_sub_price:"Цена (€/мес)",
    owner_sub_popular:"Хит продаж",
    owner_sub_perks_ru:"Преимущества (RU) — каждое с новой строки",
    owner_sub_perks_lt:"Преимущества (LT) — каждое с новой строки",
    owner_sub_save:"Сохранить подписки",
    owner_sub_saved:"✓ Подписки обновлены!",
    // Master discount
    discount_title:"Акция / Скидка",
    discount_enabled:"Включить акцию",
    discount_percent:"Размер скидки (%)",
    discount_label_ru:"Текст акции (RU)",
    discount_label_lt:"Текст акции (LT)",
    discount_expires:"Действует до",
    discount_save:"Сохранить акцию",
    discount_saved:"✓ Акция сохранена!",
    discount_badge:"АКЦИЯ",
    discount_off:"скидка",
    discount_hint:"Клиент увидит акцию на главной странице и при записи",
    discount_book_now:"Записаться со скидкой",
    // Payment
    payment_method:"Способ оплаты",
    payment_cash:"Наличными",
    payment_cash_desc:"Оплата в барбершопе после визита",
    payment_online:"Онлайн",
    payment_online_desc:"Оплата картой или через банк",
    payment_online_soon:"Скоро · Будет доступно после подключения платёжной системы",
    payment_selected:"Способ оплаты выбран",
    payment_lbl:"Оплата",
  },
  lt:{
    login:"Prisijungti", register:"Registracija", logout:"Atsijungti",
    book_btn:"Registruotis", my_bookings:"Mano įrašai", subscription:"Prenumerata",
    home:"Pagrindinis", services:"Paslaugos", masters:"Meistrai",
    hero_tag:"Klaipėda · Kirpykla nuo 2016",
    hero_sub:"Profesionalus vyrų kirpimas. Skutimasis. Barzdos priežiūra.",
    hero_cta:"Registruotis internetu", hero_services:"Paslaugos ir kainos",
    clients:"klientų", years:"metai", masters_count:"meistrai",
    services_title:"POPULIARIOS PASLAUGOS", masters_title:"MEISTRAI", sub_title:"PRENUMERATA",
    services_tag:"Populiariausios", masters_tag:"Komanda", sub_tag:"Abonementai",
    sub_desc:"Lankykitės dažniau – mokėkite mažiau.",
    sub_per_month:"/ mėn", sub_activate:"Įsigyti", sub_active:"Aktyvi ✓", sub_popular:"Populiariausias", sub_my:"Mano prenumerata",
    book_online:"Registracija internetu", step1:"1. Paslauga", step2:"2. Meistras", step3:"3. Data", step4:"4. Laikas",
    confirm:"Patvirtinti →", selected:"✓",
    summary:"Jūsų rezervacija", svc:"Paslauga", mst:"Meistras", dt:"Data", tm:"Laikas", cl:"Klientas",
    duration:"Trukmė",
    success_title:"REZERVACIJA PRIIMTA!", to_my:"Mano įrašai", to_home:"Pagrindinis",
    my_title:"MANO ĮRAŠAI", my_empty:"Nėra įrašų.", book_again:"Registruotis dar kartą", confirmed:"Patvirtinta",
    login_title:"PRISIJUNGTI", login_sub:"Prisijunkite",
    reg_title:"REGISTRACIJA", reg_sub:"Sukurkite paskyrą",
    f_name:"Vardas", f_email:"El. paštas", f_phone:"Telefonas", f_pass:"Slaptažodis",
    no_acc:"Neturite paskyros?", reg_link:"Registruotis", has_acc:"Turite paskyrą?", login_link:"Prisijungti",
    err_wrong:"Neteisingas el. paštas arba slaptažodis", err_fill:"Užpildykite visus laukus", err_exists:"El. paštas jau egzistuoja",
    demo_client:"Klientas", demo_master:"Meistras",
    master_cab:"Kabinetas",
    cal_today:"Šiandien", cal_week:"Savaitė", cal_list:"Sąrašas",
    prev_week:"‹ Ankst.", next_week:"Kitas ›",
    new_appt:"+ Nauja registracija", no_appts:"Nėra registracijų",
    clients_tab:"Klientai", stats_tab:"Statistika", settings_tab:"Nustatymai", reviews_tab:"Atsiliepimai",
    total_today:"Šiandien", total_week:"Savaitė", total_all:"Viso",
    revenue:"Pajamos", appts_count:"Registracijų",
    appt_title:"Nauja registracija", appt_client_name:"Kliento vardas", appt_client_phone:"Telefonas",
    appt_service:"Paslauga", appt_date:"Data", appt_time:"Laikas", appt_notes:"Komentaras",
    appt_save:"Išsaugoti", appt_cancel:"Atšaukti",
    appt_new_client:"Naujas klientas", appt_existing:"Iš bazės",
    mark_done:"✓ Atlikta", status_cancel:"Ištrinti", status_done:"Atlikta",
    popular_services:"Populiariausios paslaugos",
    settings_title:"PROFILIO NUSTATYMAI",
    settings_personal:"Asmeniniai duomenys", settings_appearance:"Išvaizda",
    settings_schedule:"Darbo valandos", settings_about:"Apie save",
    s_firstname:"Vardas", s_lastname:"Pavardė", s_phone:"Telefonas", s_instagram:"Instagram",
    s_spec_ru:"Specializacija (RU)", s_spec_lt:"Specializacija (LT)",
    s_experience:"Patirtis (m.)",
    s_about_ru:"Apie save (RU)", s_about_lt:"Apie save (LT)",
    s_photo_url:"Nuotrauka URL", s_photo_upload:"Įkelti nuotrauką",
    s_color:"Temos spalva",
    s_work_start:"Darbo pradžia", s_work_end:"Darbo pabaiga",
    s_save:"Išsaugoti pakeitimus", s_saved:"✓ Išsaugota!",
    s_preview:"Kortelės peržiūra",
    s_photo_hint:"Įklijuokite nuotraukos nuorodą arba įkelkite failą",
    s_reset_photo:"Pašalinti nuotrauką",
    exp_years:"m. patirtis",
    svc_manager:"Mano paslaugos",
    svc_manager_desc:"Valdykite savo kainų sąrašą. Pakeitimai iš karto rodomi.",
    svc_name_ru:"Pavadinimas (RU)", svc_name_lt:"Pavadinimas (LT)",
    svc_price:"Kaina (€)", svc_duration:"Trukmė (min)", svc_cleanup:"Tvarkymas (min)",
    svc_cleanup_hint:"Laikas tarp klientų — darbo vietos tvarkymas",
    svc_add:"+ Pridėti paslaugą", svc_save:"Išsaugoti kainas", svc_saved:"✓ Kainos išsaugotos!",
    svc_delete:"Ištrinti", svc_enabled:"Aktyvi", svc_disabled:"Paslėpta",
    svc_toggle_hint:"Paslėptos paslaugos klientams nerodomos",
    min:"min",
    reviews_title:"ATSILIEPIMAI", reviews_tag:"Klientai apie mus",
    reviews_section:"Klientų atsiliepimai", reviews_count:"atsiliepimai",
    review_write:"Palikti atsiliepimą", review_name:"Jūsų vardas",
    review_text:"Jūsų atsiliepimas", review_text_ph:"Papasakokite apie savo apsilankymą...",
    review_master:"Meistras", review_rating:"Įvertinimas",
    review_submit:"Siųsti atsiliepimą", review_submitted:"✓ Ačiū už atsiliepimą!",
    review_empty:"Atsiliepimų kol kas nėra.",
    review_best:"Rodomi geriausi atsiliepimai (4★ ir daugiau)",
    review_login:"Prisijunkite, kad paliktumėte atsiliepimą",
    out_of_5:"iš 5",
    slot_busy:"Užimta", slot_closed:"Ne darbo laikas",
    cleanup_lbl:"Tvarkymas",
    // Owner panel
    owner_panel:"Savininko skydelis",
    owner_tab_masters:"Meistrai",
    owner_tab_bookings:"Visos rezervacijos",
    owner_tab_stats:"Statistika",
    owner_tab_reviews:"Atsiliepimai",
    owner_add_master:"+ Pridėti meistrą",
    owner_edit_master:"Redaguoti",
    owner_delete_master:"Ištrinti meistrą",
    owner_confirm_delete:"Ištrinti šį meistrą? Visos jo rezervacijos bus ištrintos.",
    owner_master_form_title:"Naujas meistras",
    owner_master_edit_title:"Redaguoti meistrą",
    owner_master_fname:"Vardas",
    owner_master_lname:"Pavardė",
    owner_master_email:"El. paštas (prisijungimui)",
    owner_master_password:"Slaptažodis (prisijungimui)",
    owner_master_spec_ru:"Specializacija RU",
    owner_master_spec_lt:"Specializacija LT",
    owner_master_color:"Temos spalva",
    owner_master_emoji:"Emoji",
    owner_create:"Sukurti meistrą",
    owner_save:"Išsaugoti",
    owner_cancel:"Atšaukti",
    owner_total_revenue:"Bendros pajamos",
    owner_total_bookings:"Viso rezervacijų",
    owner_total_clients:"Klientų",
    owner_total_masters:"Meistrų",
    owner_review_delete:"Ištrinti atsiliepimą",
    owner_all_reviews:"Visi atsiliepimai",
    owner_filter_all:"Visi",
    owner_filter_pos:"Teigiami",
    owner_filter_neg:"Neigiami",
    owner_no_bookings:"Nėra rezervacijų",
    owner_master_exists:"Meistras su tokiu el. paštu jau egzistuoja",
    owner_demo_hint:"Demo: owner@barberhub.com / owner2024",
    // Post-visit review popup
    visit_done_title:"Vizitas baigtas!",
    visit_done_sub:"Kaip viskas sekėsi? Įvertinkite meistrą",
    visit_rate_service:"Įvertinkite darbo kokybę",
    visit_leave_review:"Palikite atsiliepimą (neprivaloma)",
    visit_review_ph:"Papasakokite kitiems klientams...",
    visit_tips_title:"Palikti arbatpinigius",
    visit_tips_sub:"Nudžiuginkite meistrą už puikų darbą",
    visit_tips_custom:"Kita suma",
    visit_tips_pay:"Mokėti arbatpinigius kortele",
    visit_tips_skip:"Praleisti",
    visit_tips_paid:"✓ Ačiū! Arbatpinigiai išsiųsti",
    visit_tips_soon:"Mokėjimas kortele netrukus bus prieinamas",
    visit_submit:"Siųsti įvertinimą",
    visit_submitted:"✓ Ačiū už atsiliepimą!",
    visit_skip:"Praleisti",
    visit_master_lbl:"Jūsų meistras",
    block_add:"+ Blokuoti laiką",
    block_type_break:"Pertrauka",
    block_type_closed:"Ne darbo",
    block_type_vacation:"Atostogos",
    block_reason:"Priežastis (neprivaloma)",
    block_save:"Išsaugoti bloką",
    block_delete:"Ištrinti",
    block_from:"Nuo",
    block_to:"Iki",
    block_date:"Data",
    block_all_day:"Visa diena",
    salon_hours:"Salono darbo valandos",
    salon_vacation:"Poilsio dienos / Atostogos",
    salon_vacation_add:"+ Pridėti poilsio dieną",
    salon_work_start:"Atidarymas",
    salon_work_end:"Uždarymas",
    salon_days:"Darbo dienos",
    salon_save:"Išsaugoti tvarkaraštį",
    salon_saved:"✓ Tvarkaraštis išsaugotas!",
    notif_title:"Pranešimai",
    notif_empty:"Nėra naujų pranešimų",
    notif_mark_read:"Pažymėti visus perskaitytais",
    notif_booked:"užregistravo",
    notif_cancelled:"atšaukė registraciją",
    notif_rescheduled:"perkėlė registraciją",
    notif_block_added:"pridėjo bloką",
    notif_block_removed:"ištrynė bloką",
    owner_tab_schedule:"Tvarkaraštis",
    owner_tab_subs:"Prenumeratos",
    owner_subs_title:"Prenumeratų redaktorius",
    owner_sub_name:"Pavadinimas",
    owner_sub_price:"Kaina (€/mėn)",
    owner_sub_popular:"Populiariausias",
    owner_sub_perks_ru:"Privalumai (RU) — kiekvienas naujoje eilutėje",
    owner_sub_perks_lt:"Privalumai (LT) — kiekvienas naujoje eilutėje",
    owner_sub_save:"Išsaugoti prenumeratas",
    owner_sub_saved:"✓ Prenumeratos atnaujintos!",
    discount_title:"Akcija / Nuolaida",
    discount_enabled:"Įjungti akciją",
    discount_percent:"Nuolaidos dydis (%)",
    discount_label_ru:"Akcijos tekstas (RU)",
    discount_label_lt:"Akcijos tekstas (LT)",
    discount_expires:"Galioja iki",
    discount_save:"Išsaugoti akciją",
    discount_saved:"✓ Akcija išsaugota!",
    discount_badge:"AKCIJA",
    discount_off:"nuolaida",
    discount_hint:"Klientas matys akciją pagrindiniame puslapyje ir registruojantis",
    discount_book_now:"Registruotis su nuolaida",
    // Payment
    payment_method:"Mokėjimo būdas",
    payment_cash:"Grynaisiais",
    payment_cash_desc:"Apmokėjimas kirpykloje po apsilankymo",
    payment_online:"Internetu",
    payment_online_desc:"Mokėjimas kortele arba per banką",
    payment_online_soon:"Netrukus · Bus prieinama po mokėjimo sistemos prijungimo",
    payment_selected:"Mokėjimo būdas pasirinktas",
    payment_lbl:"Mokėjimas",
  }
};

// ── helpers ──────────────────────────────────────────────────────────────────
const fmtDate = d => d.toISOString().split("T")[0];
const todayStr = fmtDate(new Date());
function getWeekDates(anchor) {
  const d=new Date(anchor), day=d.getDay(), mon=new Date(d);
  mon.setDate(d.getDate()-(day===0?6:day-1));
  return Array.from({length:7},(_,i)=>{ const x=new Date(mon); x.setDate(mon.getDate()+i); return x; });
}
function timeToMins(t) { const[h,m]=t.split(":").map(Number); return h*60+m; }
const SLOT_H = 52; // default, overridden by state below
function slotTop(time, sh=52) { return ((timeToMins(time)-timeToMins("09:00"))/10)*sh; }
function slotHeight(mins, sh=52) { return Math.max((mins/10)*sh, Math.min(sh*2, 20)); }

// ── CSS ───────────────────────────────────────────────────────────────────────
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Syne:wght@400;600;700;800&display=swap');
*{margin:0;padding:0;box-sizing:border-box;}
:root{
  --bg:#0e0a06;--dark:#130d05;--card:#1b1109;--card2:#201409;
  --border:#2b1b09;--b2:#361f09;
  --or:#e8650a;--or2:#ff8533;--ord:rgba(232,101,10,.12);
  --gr:#1fba7a;--grd:rgba(31,186,122,.12);
  --wh:#fdf6ec;--mu:#7a6050;--mu2:#9a7a60;
  --red:#e74c3c;--redd:rgba(231,76,60,.1);
  --gold:#f59e0b;
}
body{background:var(--bg);color:var(--wh);font-family:'Syne',sans-serif;min-height:100vh;overflow-x:hidden;}
.nav{display:flex;align-items:center;justify-content:space-between;padding:15px 24px;border-bottom:1px solid var(--border);position:sticky;top:0;z-index:100;background:rgba(14,10,6,.97);backdrop-filter:blur(16px);gap:10px;}
.nav-links{display:flex;align-items:center;gap:4px;flex:1;justify-content:center;flex-wrap:wrap;}
.nav-burger{display:none;background:none;border:none;color:var(--wh);font-size:26px;cursor:pointer;padding:6px 10px;line-height:1;}
.drawer-overlay{display:none;}
.drawer{display:none;}
.logo{font-family:'Bebas Neue',sans-serif;font-size:20px;letter-spacing:4px;cursor:pointer;flex-shrink:0;}
.logo b{color:var(--or);}
.nav-mid{display:flex;gap:2px;flex:1;justify-content:center;flex-wrap:wrap;}
.nl{background:none;border:none;color:var(--mu2);font-family:'Syne',sans-serif;font-size:12px;font-weight:700;cursor:pointer;padding:6px 10px;border-radius:6px;transition:all .18s;}
.nl:hover,.nl.on{color:var(--or);background:var(--ord);}
.nl.g:hover,.nl.g.on{color:var(--gr);background:var(--grd);}
.nav-r{display:flex;align-items:center;gap:5px;flex-shrink:0;max-width:calc(100vw - 220px);}
.lang{display:flex;border:1px solid var(--b2);border-radius:7px;overflow:hidden;}
.lb{background:none;border:none;color:var(--mu);font-family:'Syne',sans-serif;font-size:11px;font-weight:800;cursor:pointer;padding:5px 8px;transition:all .18s;}
.lb.on{color:var(--wh);background:var(--or);border-radius:5px;}
.lang-mobile{display:none;border:1px solid var(--b2);border-radius:7px;overflow:hidden;margin:8px 0;}
.lb.on{background:var(--or);color:var(--bg);}
.ubar{display:flex;align-items:center;gap:7px;}
.udot{width:7px;height:7px;border-radius:50%;animation:pulse 2s infinite;}
.uname{font-size:11px;color:var(--mu2);font-weight:700;max-width:70px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.btn{padding:9px 18px;border-radius:8px;border:none;cursor:pointer;font-family:'Syne',sans-serif;font-size:13px;font-weight:700;transition:all .18s;white-space:nowrap;}
.b-or{background:var(--or);color:var(--bg);}
.b-or:hover{background:var(--or2);transform:translateY(-1px);}
.b-gr{background:var(--gr);color:var(--bg);}
.b-gr:hover{background:#27e894;}
.b-ghost{background:transparent;color:var(--wh);border:1px solid var(--b2);}
.b-ghost:hover{border-color:var(--or);color:var(--or);}
.b-card{background:var(--card2);color:var(--wh);border:1px solid var(--b2);}
.b-card:hover{border-color:var(--or);}
.b-red{background:var(--redd);color:var(--red);border:1px solid transparent;}
.b-red:hover{border-color:var(--red);}
.b-sm{padding:5px 12px;font-size:12px;}
.b-lg{padding:13px 28px;font-size:15px;}
.b-full{width:100%;}
.hero{min-height:90vh;display:flex;flex-direction:column;justify-content:center;padding:64px 28px;position:relative;overflow:hidden;}
.hbg{position:absolute;inset:0;background:radial-gradient(ellipse 55% 55% at 85% 50%,rgba(232,101,10,.08) 0%,transparent 70%);pointer-events:none;}
.hwm{position:absolute;right:-10px;top:50%;transform:translateY(-50%);font-family:'Bebas Neue',sans-serif;font-size:240px;color:rgba(232,101,10,.04);line-height:1;pointer-events:none;letter-spacing:12px;}
.htag{font-size:10px;letter-spacing:5px;color:var(--or);text-transform:uppercase;margin-bottom:14px;font-weight:800;}
.htitle{font-family:'Bebas Neue',sans-serif;font-size:clamp(60px,12vw,120px);line-height:.88;}
.htitle span{color:var(--or);}
.hline{width:60px;height:4px;background:linear-gradient(90deg,var(--or),var(--gr));border-radius:2px;margin:18px 0;}
.hsub{font-size:14px;color:var(--mu2);max-width:360px;line-height:1.65;margin-bottom:28px;}
.hacts{display:flex;gap:10px;flex-wrap:wrap;}
.hstats{display:flex;gap:40px;margin-top:52px;flex-wrap:wrap;}
.snum{font-family:'Bebas Neue',sans-serif;font-size:44px;color:var(--or);line-height:1;}
.slbl{font-size:10px;color:var(--mu);margin-top:3px;font-weight:700;}
.divider{height:1px;background:var(--border);margin:0 28px;}
.sec{padding:56px 28px;}
.stag{font-size:10px;letter-spacing:4px;color:var(--or);text-transform:uppercase;margin-bottom:8px;font-weight:800;}
.stag.g{color:var(--gr);}
.stitle{font-family:'Bebas Neue',sans-serif;font-size:clamp(36px,5vw,58px);margin-bottom:28px;letter-spacing:2px;}
.svc-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:1px;background:var(--border);}
.svc-carousel{display:flex;gap:12px;overflow-x:auto;scroll-snap-type:x mandatory;-webkit-overflow-scrolling:touch;padding-bottom:8px;scrollbar-width:none;}
.svc-carousel::-webkit-scrollbar{display:none;}
.svc-carousel-item{flex-shrink:0;width:220px;scroll-snap-align:start;background:var(--card);border-radius:14px;border:1px solid var(--b2);padding:18px;position:relative;overflow:hidden;transition:border-color .2s;}
.svc-carousel-item:hover{border-color:var(--or);}
.svc-rank{position:absolute;top:10px;right:10px;background:var(--or);color:var(--bg);font-family:"Bebas Neue",sans-serif;font-size:11px;padding:2px 7px;border-radius:20px;letter-spacing:1px;}
.svc-card{background:var(--card);padding:22px;cursor:pointer;transition:all .18s;position:relative;overflow:hidden;}
.svc-card::after{content:'';position:absolute;bottom:0;left:0;height:3px;width:0;background:linear-gradient(90deg,var(--or),var(--gr));transition:width .28s;}
.svc-card:hover::after,.svc-card.sel::after{width:100%;}
.svc-card.sel{background:#1e1309;}
.svc-card:hover{background:#1a1108;}
.sn{font-family:'Bebas Neue',sans-serif;font-size:19px;letter-spacing:1px;margin-bottom:5px;}
.sd{font-size:11px;color:var(--mu2);margin-bottom:10px;line-height:1.5;}
.sm{display:flex;justify-content:space-between;align-items:center;margin-top:10px;}
.sp{font-size:21px;font-weight:700;color:var(--or);}
.sp small{font-size:11px;color:var(--mu);font-weight:400;}
.m-grid{display:flex;gap:16px;flex-wrap:wrap;}
.m-card{flex:1;min-width:190px;background:var(--card);border:1px solid var(--b2);border-radius:14px;padding:24px 18px;text-align:center;transition:all .18s;position:relative;overflow:hidden;}
.m-card:hover{transform:translateY(-3px);}
.m-av{width:76px;height:76px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:32px;margin:0 auto 12px;border:3px solid;overflow:hidden;}
.m-av img{width:100%;height:100%;object-fit:cover;}
.m-name{font-family:'Bebas Neue',sans-serif;font-size:22px;letter-spacing:1px;margin-bottom:2px;}
.m-spec{font-size:11px;color:var(--mu2);margin-bottom:8px;line-height:1.4;}
.m-about{font-size:11px;color:var(--mu);margin-bottom:10px;line-height:1.6;text-align:left;}
.m-exp{font-size:10px;padding:3px 9px;border-radius:20px;font-weight:700;display:inline-block;margin-bottom:5px;}
.m-hours{font-size:10px;color:var(--mu);margin-top:3px;}
.m-ig{font-size:10px;color:var(--mu2);margin-top:2px;}
.sub-grid{display:flex;gap:14px;flex-wrap:wrap;}
.sub-card{flex:1;min-width:190px;background:var(--card);border:2px solid var(--b2);border-radius:14px;padding:24px 20px;position:relative;transition:all .18s;cursor:pointer;}
.sub-card:hover{transform:translateY(-3px);border-color:var(--or);}
.sub-card.pop{border-color:var(--gr);}
.sub-card.act{border-color:var(--or);background:#1d1208;}
.sub-badge{position:absolute;top:-10px;left:50%;transform:translateX(-50%);background:var(--gr);color:var(--bg);font-size:9px;font-weight:800;letter-spacing:2px;padding:3px 10px;border-radius:20px;white-space:nowrap;}
.sub-name{font-family:'Bebas Neue',sans-serif;font-size:28px;color:var(--or);letter-spacing:2px;margin-bottom:4px;}
.sub-price{display:flex;align-items:baseline;gap:3px;margin-bottom:14px;}
.sub-num{font-family:'Bebas Neue',sans-serif;font-size:42px;color:var(--wh);}
.sub-unit{font-size:11px;color:var(--mu);}
.sub-perks{list-style:none;margin-bottom:20px;}
.sub-perks li{font-size:12px;color:var(--mu2);padding:6px 0;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:6px;}
.sub-perks li::before{content:'→';color:var(--gr);font-weight:700;}
.dates-row{display:flex;gap:7px;flex-wrap:wrap;margin-bottom:20px;}
.dbt{padding:8px 13px;border-radius:7px;border:1px solid var(--b2);background:var(--card);color:var(--wh);cursor:pointer;font-family:'Syne',sans-serif;font-size:12px;font-weight:700;transition:all .18s;}
.dbt:hover,.dbt.on{border-color:var(--or);color:var(--or);}
.tgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(78px,1fr));gap:6px;}
.tbt{padding:9px;text-align:center;border-radius:7px;border:1px solid var(--b2);background:var(--card);color:var(--wh);cursor:pointer;font-family:'Syne',sans-serif;font-size:13px;font-weight:700;transition:all .18s;}
.tbt:hover,.tbt.on{border-color:var(--or);background:var(--ord);color:var(--or);}
.tbt.busy{border-color:var(--red);background:var(--redd);color:var(--red);cursor:not-allowed;opacity:.6;text-decoration:line-through;}
.tbt.closed{border-color:var(--border);background:var(--dark);color:var(--mu);cursor:not-allowed;opacity:.4;}
.sumbox{background:var(--card);border:1px solid var(--b2);border-radius:12px;padding:24px;margin-top:36px;max-width:420px;}
.sum-title{font-family:'Bebas Neue',sans-serif;font-size:20px;margin-bottom:14px;color:var(--or);}
.sum-row{display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--border);font-size:13px;}
.sum-row:last-of-type{border-bottom:none;}
.sum-lbl{color:var(--mu);}
.sum-val{font-weight:700;}
.sum-total{font-family:'Bebas Neue',sans-serif;font-size:32px;color:var(--or);margin:12px 0;}
.bk-item{background:var(--card);border:1px solid var(--b2);border-radius:10px;padding:13px 16px;display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;}
.bk-svc{font-family:'Bebas Neue',sans-serif;font-size:17px;margin-bottom:2px;}
.bk-meta{font-size:11px;color:var(--mu);}
.badge{padding:3px 9px;border-radius:20px;font-size:10px;font-weight:800;}
.bor{background:var(--ord);color:var(--or);}
.bgr{background:var(--grd);color:var(--gr);}
.success{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:76vh;text-align:center;padding:36px;}
.s-icon{font-size:68px;margin-bottom:18px;animation:pop .4s ease;}
.s-title{font-family:'Bebas Neue',sans-serif;font-size:48px;color:var(--or);margin-bottom:8px;letter-spacing:2px;}
.s-sub{color:var(--mu2);font-size:14px;max-width:320px;line-height:1.65;margin-bottom:24px;}
/* MASTER CABINET */
.mcab{display:flex;height:calc(100vh - 53px);overflow:hidden;overscroll-behavior:none;-webkit-overflow-scrolling:touch;}
.msb{width:200px;flex-shrink:0;background:var(--dark);border-right:1px solid var(--border);padding:18px 12px;display:flex;flex-direction:column;gap:3px;height:100%;overflow-y:auto;}
.msp{text-align:center;padding:16px 0 18px;border-bottom:1px solid var(--border);margin-bottom:12px;}
.msp-av{width:64px;height:64px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:28px;margin:0 auto 9px;overflow:hidden;border:3px solid;}
.msp-av img{width:100%;height:100%;object-fit:cover;}
.msp-name{font-family:'Bebas Neue',sans-serif;font-size:19px;letter-spacing:1px;}
.msp-role{font-size:10px;margin-top:2px;}
.ms-link{display:flex;align-items:center;gap:8px;background:none;border:none;color:var(--mu2);font-family:'Syne',sans-serif;font-size:12px;font-weight:700;cursor:pointer;padding:8px 10px;border-radius:7px;transition:all .18s;width:100%;text-align:left;}
.ms-link:hover,.ms-link.on{color:var(--or);background:var(--ord);}
.ms-icon{font-size:14px;width:18px;text-align:center;}
.ms-badge{margin-left:auto;background:var(--or);color:var(--bg);font-size:10px;font-weight:800;padding:1px 6px;border-radius:9px;}
.mcon{flex:1;display:flex;flex-direction:column;min-width:0;}
.master-widget-btn{display:none;position:fixed;bottom:24px;left:20px;z-index:200;
  background:var(--or);color:var(--bg);border:none;border-radius:24px;
  padding:10px 18px;font-family:'Syne',sans-serif;font-weight:800;font-size:13px;
  cursor:pointer;box-shadow:0 4px 16px rgba(232,101,10,.4);align-items:center;gap:8px;
  transition:transform .2s;}
.master-widget-btn:hover{transform:scale(1.05);}
.master-drawer-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:201;}
.master-drawer{position:fixed;bottom:0;left:0;right:0;background:var(--dark);
  border-radius:20px 20px 0 0;z-index:202;padding:16px;
  border-top:1px solid var(--border);animation:slideUp .25s ease;}
.master-drawer-handle{width:36px;height:4px;background:var(--border);border-radius:2px;margin:0 auto 12px;}
.master-drawer-profile{display:flex;align-items:center;gap:12px;padding:8px 0 14px;border-bottom:1px solid var(--border);margin-bottom:10px;}
.master-drawer-item{display:flex;align-items:center;gap:12px;padding:12px;border-radius:10px;
  cursor:pointer;border:none;background:none;color:var(--wh);
  font-family:'Syne',sans-serif;font-size:14px;font-weight:700;width:100%;text-align:left;}
.cal-hd{padding:14px 18px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;background:var(--dark);}
.cal-hd-title{font-family:'Bebas Neue',sans-serif;font-size:17px;letter-spacing:1px;}
.cal-nav{display:flex;align-items:center;gap:5px;flex-wrap:wrap;}
.cal-tabs{display:flex;border:1px solid var(--b2);border-radius:7px;overflow:hidden;}
.cal-tab{background:none;border:none;color:var(--mu);font-family:'Syne',sans-serif;font-size:11px;font-weight:700;cursor:pointer;padding:6px 11px;transition:all .18s;}
.cal-tab.on{background:var(--or);color:var(--bg);}
.cal-body{flex:1;overflow:auto;touch-action:pan-x pan-y;user-select:none;-webkit-user-select:none;}
.cal-week{display:flex;flex-direction:column;overflow-x:auto;-webkit-overflow-scrolling:touch;}
.cal-dh{display:grid;border-bottom:2px solid var(--border);background:rgba(14,10,6,.98);}
.cal-dhd{padding:6px 4px;text-align:center;font-size:11px;font-weight:800;color:var(--mu);border-left:1px solid rgba(255,255,255,0.89);}
.cal-dhd.td{color:var(--or);}
.day-num{font-family:'Bebas Neue',sans-serif;font-size:19px;line-height:1.1;display:block;}
.day-name{font-size:8px;letter-spacing:1px;text-transform:uppercase;}
.cal-grid{display:grid;}
.cal-hr{color:var(--mu);padding:0 4px;text-align:right;display:flex;align-items:flex-start;padding-top:2px;border-bottom:1px solid rgba(255,255,255,0.04);overflow:hidden;}
.cal-cell{border-left:1px solid var(--border);border-bottom:1px solid var(--border);position:relative;cursor:pointer;transition:background .15s;}
.cal-cell.block-mode:hover{background:rgba(255,100,100,.08);}
.cal-cell.block-selected{background:rgba(255,100,100,.15)!important;}
.block-lock-icon{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:14px;opacity:0.5;pointer-events:none;}
.block-bottom-bar{position:fixed;bottom:0;left:0;right:0;z-index:300;background:var(--dark);border-top:1px solid var(--border);padding:12px 16px;display:flex;gap:10px;align-items:center;}
.bk-status-overlay{position:fixed;inset:0;z-index:9000;background:rgba(0,0,0,.75);display:flex;align-items:center;justify-content:center;}
.bk-status-card{background:var(--dark);border-radius:20px;padding:36px 32px;text-align:center;min-width:260px;max-width:320px;border:1px solid var(--border);}
.bk-status-icon{font-size:52px;margin-bottom:12px;}
.bk-status-title{font-family:"Bebas Neue",sans-serif;font-size:26px;letter-spacing:1px;margin-bottom:6px;}
.bk-progress{height:4px;background:var(--border);border-radius:2px;overflow:hidden;margin-top:14px;}
.bk-progress-bar{height:100%;background:var(--or);border-radius:2px;animation:bkprog 2s ease-in-out infinite;}
@keyframes bkprog{0%{width:0%}60%{width:80%}100%{width:95%}}
.cal-cell:hover{background:var(--ord);}
.cal-cell.drag-over{background:rgba(31,186,122,.2)!important;border:1px dashed var(--gr);}
.td-col{background:rgba(232,101,10,.03);}
.now-line{position:absolute;left:0;right:0;height:2px;background:var(--or);z-index:10;pointer-events:none;}
.now-dot{position:absolute;left:-4px;top:-4px;width:10px;height:10px;border-radius:50%;background:var(--or);}
.now-label{position:absolute;left:-42px;top:-8px;font-size:9px;color:var(--or);font-weight:800;white-space:nowrap;}
.touch-ghost{position:fixed;z-index:9999;background:var(--or);color:var(--bg);padding:6px 12px;borderRadius:8px;fontSize:12px;fontWeight:800;pointerEvents:none;transform:translate(-50%,-120%);white-space:nowrap;boxShadow:0 4px 16px rgba(232,101,10,.5);}
.ab{position:absolute;left:2px;right:2px;top:2px;border-radius:5px;padding:4px 6px;cursor:grab;overflow:hidden;z-index:5;transition:transform .15s,opacity .2s;user-select:none;touch-action:none;-webkit-user-select:none;}
.ab:hover{transform:scale(1.03);box-shadow:0 4px 14px rgba(0,0,0,.5);}
.ab:active{cursor:grabbing;}
.ab.dragging{opacity:.3;transform:scale(.95);}
.ab.done{opacity:.45;}
.ab-name{font-size:10px;font-weight:800;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.ab-svc{font-size:9px;opacity:.8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.ab-drag-hint{font-size:8px;opacity:.55;margin-top:1px;}
/* RESCHEDULE MODAL */
.reschedule-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(72px,1fr));gap:6px;margin-top:6px;max-height:220px;overflow-y:auto;}
.rs-slot{padding:8px 4px;text-align:center;border-radius:7px;border:1px solid var(--b2);background:var(--card);color:var(--wh);cursor:pointer;font-family:'Syne',sans-serif;font-size:12px;font-weight:700;transition:all .18s;}
.rs-slot:hover,.rs-slot.on{border-color:var(--gr);background:var(--grd);color:var(--gr);}
.rs-slot.busy{border-color:var(--red);background:var(--redd);color:var(--red);cursor:not-allowed;text-decoration:line-through;opacity:.5;}
.rs-slot.closed{opacity:.3;cursor:not-allowed;}
.list-view{padding:16px 18px;}
.ldg{margin-bottom:22px;}
.ldh{font-family:'Bebas Neue',sans-serif;font-size:15px;color:var(--or);letter-spacing:1px;margin-bottom:8px;padding-bottom:5px;border-bottom:1px solid var(--border);}
.li{display:flex;align-items:center;gap:10px;background:var(--card);border:1px solid var(--b2);border-radius:9px;padding:11px 13px;margin-bottom:7px;cursor:pointer;transition:all .18s;}
.li:hover{background:var(--card2);}
.li-time{font-family:'Bebas Neue',sans-serif;font-size:18px;color:var(--or);min-width:46px;}
.li-bar{width:3px;height:34px;border-radius:2px;flex-shrink:0;}
.li-info{flex:1;min-width:0;}
.li-name{font-weight:700;font-size:13px;margin-bottom:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.li-svc{font-size:11px;color:var(--mu2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.li-price{font-family:'Bebas Neue',sans-serif;font-size:17px;flex-shrink:0;}
.no-appts{padding:40px;text-align:center;color:var(--mu);font-size:14px;}
.sg{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px;margin-bottom:22px;}
.sc{background:var(--card);border:1px solid var(--b2);border-radius:10px;padding:16px;}
.sc-lbl{font-size:10px;color:var(--mu);margin-bottom:4px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;}
.sc-val{font-family:'Bebas Neue',sans-serif;font-size:36px;color:var(--or);line-height:1;}
.sc-val.g{color:var(--gr);}
.ct{width:100%;border-collapse:collapse;}
.ct th{font-size:9px;color:var(--mu);letter-spacing:1.5px;text-transform:uppercase;padding:8px 11px;text-align:left;border-bottom:1px solid var(--border);font-weight:800;}
.ct td{padding:10px 11px;border-bottom:1px solid var(--border);font-size:12px;vertical-align:middle;}
.ct tr:hover td{background:var(--card);}
.cav{width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;flex-shrink:0;}
.crow{display:flex;align-items:center;gap:8px;}
/* REVIEWS */
.rev-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(270px,1fr));gap:14px;}
.rev-card{background:var(--card);border:1px solid var(--b2);border-radius:12px;padding:20px;position:relative;overflow:hidden;transition:transform .18s;}
.rev-card:hover{transform:translateY(-3px);}
/* Carousel */
.carousel{position:relative;overflow:hidden;}
.carousel-track{display:flex;transition:transform .38s cubic-bezier(.4,0,.2,1);}
.carousel-slide{flex-shrink:0;padding:0 6px;}
.carousel-btn{position:absolute;top:50%;transform:translateY(-50%);width:38px;height:38px;border-radius:50%;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:900;z-index:5;transition:all .18s;background:var(--card2);color:var(--wh);border:1px solid var(--b2);}
.carousel-btn:hover{background:var(--or);color:var(--bg);border-color:var(--or);}
.carousel-btn.prev{left:0;}
.carousel-btn.next{right:0;}
.carousel-dots{display:flex;justify-content:center;gap:7px;margin-top:18px;}
.rev-card{background:var(--card);border:1px solid var(--b2);border-radius:12px;padding:18px;position:relative;overflow:hidden;height:100%;display:flex;flex-direction:column;gap:10px;}
.rev-top{display:flex;align-items:center;gap:10px;}
.rev-avatar{width:40px;height:40px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:16px;flex-shrink:0;}
.rev-author{font-weight:700;font-size:14px;}
.rev-meta{font-size:11px;color:var(--mu);}
.rev-text{font-size:13px;color:var(--mu2);line-height:1.65;font-style:italic;flex:1;}
.rev-mbadge{display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:20px;font-size:11px;font-weight:700;width:fit-content;}
.carousel-dot{width:7px;height:7px;border-radius:50%;background:var(--border);border:none;cursor:pointer;transition:all .18s;padding:0;}
.carousel-dot.on{background:var(--or);width:22px;border-radius:4px;}
.rev-top{display:flex;align-items:center;gap:10px;margin-bottom:12px;}
.rev-avatar{width:38px;height:38px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:900;flex-shrink:0;}
.rev-author{font-weight:800;font-size:13px;color:var(--wh);margin-bottom:1px;}
.rev-meta{font-size:10px;color:var(--mu2);}
.rev-text{font-size:12px;color:var(--mu2);line-height:1.6;font-style:italic;margin-top:9px;}
.rev-mbadge{display:inline-flex;align-items:center;gap:5px;margin-top:10px;padding:3px 9px;border-radius:20px;font-size:10px;font-weight:700;}
.master-rating-row{display:flex;align-items:center;gap:12px;background:var(--card);border:1px solid var(--b2);border-radius:10px;padding:12px 14px;flex:1;min-width:180px;}
.mr-info{flex:1;}
.mr-name{font-weight:800;font-size:13px;}
.mr-sub{font-size:10px;color:var(--mu2);margin-top:1px;}
.mr-score-num{font-family:'Bebas Neue',sans-serif;font-size:26px;line-height:1;}
.mr-score-lbl{font-size:9px;color:var(--mu);}
/* SETTINGS */
.settings-body{padding:24px;max-width:860px;}
.settings-section{margin-bottom:32px;}
.settings-section-title{font-size:10px;letter-spacing:3px;color:var(--or);text-transform:uppercase;font-weight:800;margin-bottom:14px;padding-bottom:7px;border-bottom:1px solid var(--border);}
.settings-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;}
.sf{display:flex;flex-direction:column;gap:5px;}
.sf label{font-size:9px;color:var(--mu);letter-spacing:1.5px;text-transform:uppercase;font-weight:800;}
.sf input,.sf textarea,.sf select{background:var(--card2);border:1px solid var(--b2);border-radius:7px;padding:10px 12px;color:var(--wh);font-family:'Syne',sans-serif;font-size:13px;outline:none;transition:border-color .18s;width:100%;}
.sf input:focus,.sf textarea:focus,.sf select:focus{border-color:var(--or);}
.sf textarea{resize:vertical;min-height:80px;line-height:1.6;}
.sf select option{background:var(--dark);}
.photo-zone{display:flex;gap:12px;align-items:flex-start;}
.photo-preview{width:80px;height:80px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:32px;overflow:hidden;flex-shrink:0;background:var(--card);}
.photo-preview img{width:100%;height:100%;object-fit:cover;}
.photo-controls{flex:1;display:flex;flex-direction:column;gap:8px;}
.photo-hint{font-size:11px;color:var(--mu);line-height:1.5;}
.color-swatches{display:flex;gap:8px;flex-wrap:wrap;margin-top:4px;}
.swatch{width:30px;height:30px;border-radius:50%;cursor:pointer;transition:transform .15s;border:3px solid transparent;}
.swatch:hover{transform:scale(1.15);}
.swatch.active{border-color:var(--wh);transform:scale(1.15);}
.preview-card{background:var(--card);border-radius:14px;padding:20px;text-align:center;border:1px solid var(--b2);max-width:200px;}
.preview-av{width:64px;height:64px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:28px;margin:0 auto 10px;border:3px solid;overflow:hidden;}
.preview-av img{width:100%;height:100%;object-fit:cover;}
.preview-name{font-family:'Bebas Neue',sans-serif;font-size:20px;letter-spacing:1px;margin-bottom:2px;}
.preview-spec{font-size:10px;color:var(--mu2);margin-bottom:7px;}
.preview-exp{font-size:10px;padding:2px 8px;border-radius:20px;font-weight:700;display:inline-block;}
.save-row{display:flex;align-items:center;gap:14px;margin-top:24px;}
.save-ok{font-size:13px;color:var(--gr);font-weight:700;animation:fadeIn .3s ease;}
.file-upload-btn{background:var(--card);border:1px dashed var(--b2);border-radius:8px;padding:9px 14px;color:var(--mu2);font-family:'Syne',sans-serif;font-size:12px;font-weight:700;cursor:pointer;transition:all .18s;text-align:center;}
.file-upload-btn:hover{border-color:var(--or);color:var(--or);}
/* MODAL */
.overlay{position:fixed;inset:0;background:rgba(0,0,0,.9);display:flex;align-items:center;justify-content:center;z-index:200;padding:16px;animation:fadeIn .18s ease;}
.modal{background:var(--dark);border:1px solid var(--b2);border-radius:16px;padding:28px;width:100%;max-width:380px;animation:slideUp .22s ease;max-height:94vh;overflow-y:auto;}
.modal.wide{max-width:480px;}
.m-title{font-family:'Bebas Neue',sans-serif;font-size:26px;margin-bottom:2px;letter-spacing:1px;}
.m-sub{font-size:12px;color:var(--mu);margin-bottom:20px;}
.field{margin-bottom:12px;}
.field label{display:block;font-size:9px;color:var(--mu);letter-spacing:1.5px;text-transform:uppercase;margin-bottom:5px;font-weight:800;}
.field input,.field select,.field textarea{width:100%;padding:10px 12px;background:var(--card);border:1px solid var(--b2);border-radius:7px;color:var(--wh);font-family:'Syne',sans-serif;font-size:13px;outline:none;transition:border-color .18s;}
.field input:focus,.field select:focus{border-color:var(--or);}
.field select option{background:var(--dark);}
.field textarea{resize:vertical;min-height:60px;}
.m-switch{text-align:center;margin-top:12px;font-size:12px;color:var(--mu);}
.m-switch button{background:none;border:none;color:var(--or);cursor:pointer;font-size:12px;text-decoration:underline;font-family:'Syne',sans-serif;font-weight:700;}
.err{color:var(--red);font-size:12px;margin-bottom:10px;padding:8px 11px;background:var(--redd);border-radius:6px;}
.demo-box{margin-top:12px;padding:10px;background:var(--border);border-radius:7px;font-size:11px;color:var(--mu);line-height:2;}
.dv{color:var(--or);font-weight:800;}
.seg{display:flex;border:1px solid var(--b2);border-radius:7px;overflow:hidden;margin-bottom:12px;}
.seg-btn{flex:1;background:none;border:none;color:var(--mu);font-family:'Syne',sans-serif;font-size:11px;font-weight:700;cursor:pointer;padding:8px;transition:all .18s;}
.seg-btn.on{background:var(--or);color:var(--bg);}
.g2{display:grid;grid-template-columns:1fr 1fr;gap:0 12px;}
.adrow{display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border);}
.adrow:last-child{border-bottom:none;}
.ad-lbl{font-size:10px;color:var(--mu);font-weight:700;text-transform:uppercase;letter-spacing:.5px;}
.ad-val{font-size:13px;font-weight:700;}
.sad{display:flex;gap:7px;margin-top:14px;}
@keyframes fadeIn{from{opacity:0}to{opacity:1}}
@keyframes slideUp{from{transform:translateY(22px);opacity:0}to{transform:translateY(0);opacity:1}}
@keyframes pop{0%{transform:scale(0)}70%{transform:scale(1.15)}100%{transform:scale(1)}}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.35}}
::-webkit-scrollbar{width:5px;height:5px;}
::-webkit-scrollbar-track{background:var(--bg);}
::-webkit-scrollbar-thumb{background:var(--b2);border-radius:3px;}
/* ── MOBILE RESPONSIVE ───────────────────────────────────────────────────── */
@media(max-width:600px){
  .nav{padding:0 10px;height:50px;flex-wrap:nowrap;overflow:hidden;}
  .logout-btn{display:none!important;}
  .lang{display:none!important;}
  .lang-mobile{display:flex!important;}
  .nav-logo{font-size:16px;letter-spacing:2px;}
  .nav-links{display:none!important;}
  .nav-burger{display:flex!important;}
  .drawer-overlay{display:block!important;position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:300;}
  .drawer{display:flex!important;flex-direction:column;position:fixed;top:0;right:0;bottom:0;width:75vw;max-width:280px;background:var(--dark);z-index:301;padding:24px 16px;gap:6px;border-left:1px solid var(--border);animation:slideInRight .25s ease;}
  @keyframes slideInRight{from{transform:translateX(100%)}to{transform:translateX(0)}}
  .drawer .nl{font-size:15px;padding:14px 16px;width:100%;text-align:left;border-radius:10px;}
  .drawer .nl:hover,.drawer .nl.on{background:var(--card);color:var(--or);}
  .drawer-close{background:none;border:none;color:var(--mu);font-size:22px;cursor:pointer;align-self:flex-end;margin-bottom:8px;}
  .hero{padding:44px 16px 36px;}
  .htitle{font-size:48px;line-height:.92;}
  .hsub{font-size:13px;}
  .hbtns{flex-direction:column;gap:10px;}
  .hbtns .btn{width:100%;justify-content:center;}
  .hstats{gap:16px;flex-wrap:wrap;}
  .hstat-n{font-size:34px;}
  .sec{padding:36px 16px;}
  .stitle{font-size:30px;}
  .svc-grid{grid-template-columns:1fr 1fr!important;gap:8px!important;}
  .svc-card{padding:12px 10px;}
  .sn{font-size:13px;}
  .sp{font-size:18px;}
  .sd{font-size:10px;}
  .m-grid{flex-direction:column;gap:10px;}
  .m-card{min-width:unset;width:100%;padding:18px 16px;}
  .dates-row{gap:5px;}
  .dbt{padding:7px 9px;font-size:11px;}
  .tgrid{grid-template-columns:repeat(4,1fr);gap:5px;}
  .tbt{padding:7px 3px;font-size:12px;}
  .sumbox{padding:14px;margin-top:16px;}
  .pay-options{grid-template-columns:1fr;}
  .mcab{flex-direction:column;height:calc(100vh - 50px);overflow:hidden;}
  .msb{display:none!important;}
  .master-widget-btn{display:flex!important;}
  .master-block-btn{display:none!important;}
  .master-drawer-overlay{display:block!important;}
  .mcon{padding:12px;}
  .cal-hd{padding:8px 10px;gap:6px;flex-wrap:wrap;}
  .cal-hd-title{font-size:13px;}
  .cal-hr{font-size:8px;padding:0 2px;}

  .owner-cab{flex-direction:column;}
  /* Owner panel — hide sidebar, show floating bubble */
  .owner-sb{display:none!important;}
  .owner-bubble{display:flex!important;}
  .owner-drawer-overlay{display:block!important;}
  .owner-con{padding:12px;}
  .owner-form{padding:12px;}
  .g2{grid-template-columns:1fr!important;}
  .g2{grid-template-columns:1fr!important;}
  .modal{padding:18px 14px;}
  .m-title{font-size:20px;}
  .success{padding:36px 16px;}
  .s-title{font-size:26px;}
  .bk-card{padding:10px;}
  .list-view{padding:8px 10px;}
  .li{padding:9px 10px;gap:8px;}
  .li-time{font-size:15px;min-width:38px;}
  .settings-body{padding:12px;}
  .sf label{font-size:11px;}
  .master-rating-row{min-width:unset;}
  .sub-card{min-width:unset!important;width:100%!important;}
  .review-card{padding:12px;}
  .notif-panel{width:290px;right:-10px;}
  .visit-modal{margin:8px;}
  .tips-grid{grid-template-columns:repeat(4,1fr);}
}

/* POST-VISIT REVIEW POPUP */
.visit-overlay{position:fixed;inset:0;background:rgba(0,0,0,.92);display:flex;align-items:center;justify-content:center;z-index:500;padding:16px;animation:fadeIn .25s ease;}
.visit-modal{background:var(--dark);border:1px solid var(--b2);border-radius:20px;padding:0;width:100%;max-width:400px;animation:pop .35s cubic-bezier(.34,1.56,.64,1);overflow:hidden;}
.visit-hero{padding:28px 24px 20px;text-align:center;background:linear-gradient(135deg,var(--dark),var(--card));}
.visit-master-av{width:70px;height:70px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:30px;margin:0 auto 12px;border:3px solid;}
.visit-master-av img{width:100%;height:100%;object-fit:cover;border-radius:50%;}
.visit-title{font-family:'Bebas Neue',sans-serif;font-size:26px;letter-spacing:1px;margin-bottom:4px;}
.visit-sub{font-size:13px;color:var(--mu2);line-height:1.5;}
.visit-body{padding:20px 24px;}
.star-pick{display:flex;justify-content:center;gap:8px;margin:14px 0;}
.star-pick-btn{background:none;border:none;cursor:pointer;font-size:36px;transition:transform .15s,filter .15s;line-height:1;padding:2px;}
.star-pick-btn:hover{transform:scale(1.25);}
.star-pick-btn.active{filter:drop-shadow(0 0 6px rgba(245,158,11,.8));}
.visit-textarea{width:100%;padding:11px 14px;background:var(--card2);border:1px solid var(--b2);border-radius:10px;color:var(--wh);font-family:'Syne',sans-serif;font-size:13px;outline:none;resize:none;line-height:1.6;transition:border-color .18s;min-height:80px;}
.visit-textarea:focus{border-color:var(--or);}
.tips-section{background:var(--card);border-radius:12px;padding:16px;margin-top:16px;}
.tips-title{font-family:'Bebas Neue',sans-serif;font-size:18px;letter-spacing:1px;color:var(--gold);margin-bottom:4px;}
.tips-sub{font-size:11px;color:var(--mu2);margin-bottom:12px;}
.tips-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:7px;margin-bottom:10px;}
.tip-btn{padding:10px 4px;border-radius:9px;border:1px solid var(--b2);background:var(--card2);color:var(--wh);cursor:pointer;font-family:'Bebas Neue',sans-serif;font-size:18px;letter-spacing:1px;transition:all .18s;text-align:center;}
.tip-btn:hover,.tip-btn.sel{border-color:var(--gold);background:rgba(245,158,11,.12);color:var(--gold);}
.tip-custom{width:100%;padding:"9px 12px";border-radius:9px;border:1px solid var(--b2);background:var(--card2);color:var(--wh);font-family:'Syne',sans-serif;font-size:13px;outline:none;text-align:center;margin-bottom:10px;}
.visit-footer{padding:16px 24px 20px;display:flex;flex-direction:column;gap:8px;}
.visit-submitted-msg{text-align:center;padding:20px;color:var(--gr);font-weight:700;font-size:15px;}

/* SCHEDULE BLOCKS */
.ab-block{position:absolute;left:1px;right:1px;border-radius:4px;padding:3px 5px;z-index:4;overflow:hidden;cursor:pointer;opacity:.85;}
.ab-block:hover{opacity:1;}
.ab-block-label{font-size:9px;font-weight:800;letter-spacing:.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.block-type-break{background:repeating-linear-gradient(45deg,rgba(245,158,11,.25),rgba(245,158,11,.25) 4px,transparent 4px,transparent 10px);border:1px solid rgba(245,158,11,.5);color:#f59e0b;}
.block-type-closed{background:repeating-linear-gradient(45deg,rgba(100,100,100,.3),rgba(100,100,100,.3) 4px,transparent 4px,transparent 10px);border:1px solid rgba(120,120,120,.4);color:#9a9a9a;}
.block-type-vacation{background:repeating-linear-gradient(45deg,rgba(59,130,246,.25),rgba(59,130,246,.25) 4px,transparent 4px,transparent 10px);border:1px solid rgba(59,130,246,.5);color:#3b82f6;}
.salon-closed-overlay{position:absolute;inset:0;background:rgba(231,76,60,.06);pointer-events:none;z-index:3;}
.notif-bell{position:relative;background:none;border:none;cursor:pointer;padding:6px;font-size:18px;transition:transform .18s;}
.notif-bell:hover{transform:scale(1.15);}
.notif-dot{position:absolute;top:2px;right:2px;width:9px;height:9px;border-radius:50%;background:var(--red);border:2px solid var(--bg);}
.notif-panel{position:fixed;top:56px;right:8px;width:min(340px,95vw);max-height:420px;background:var(--dark);border:1px solid var(--b2);border-radius:14px;z-index:9999;overflow:hidden;animation:slideUp .2s ease;box-shadow:0 8px 32px rgba(0,0,0,.6);}
@media(max-width:600px){
  .notif-panel{position:fixed;bottom:0;left:0;right:0;top:auto;width:100%;max-height:80vh;border-radius:20px 20px 0 0;border-bottom:none;}
}
.notif-head{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid var(--border);}
.notif-head-title{font-family:'Bebas Neue',sans-serif;font-size:18px;letter-spacing:1px;}
.notif-list{overflow-y:auto;max-height:340px;}
.notif-item{padding:11px 16px;border-bottom:1px solid var(--border);transition:background .15s;cursor:default;}
.notif-item:hover{background:var(--card);}
.notif-item.unread{border-left:3px solid var(--or);}
.notif-item-text{font-size:12px;line-height:1.5;color:var(--wh);}
.notif-item-time{font-size:10px;color:var(--mu);margin-top:3px;}
.notif-item-icon{font-size:16px;margin-right:7px;}

/* PAYMENT METHOD */
.pay-options{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:16px 0;}
.pay-card{border:2px solid var(--b2);border-radius:12px;padding:16px;cursor:pointer;transition:all .2s;background:var(--card);position:relative;overflow:hidden;}
.pay-card:hover{border-color:var(--or);}
.pay-card.selected{border-color:var(--or);background:#1d1208;}
.pay-card.disabled{opacity:.45;cursor:not-allowed;}
.pay-card.disabled:hover{border-color:var(--b2);}
.pay-card.sub-card-pay{border-color:var(--gr);background:var(--grd);cursor:default;grid-column:1/-1;}
.pay-card.sub-card-pay:hover{border-color:var(--gr);}
.sub-pay-tier{font-family:'Bebas Neue',sans-serif;font-size:28px;letter-spacing:2px;color:var(--gr);margin-bottom:2px;}
.sub-pay-perks{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;}
.sub-pay-perk{font-size:10px;color:var(--gr);background:var(--grd);padding:2px 8px;border-radius:20px;font-weight:700;border:1px solid var(--gr);}
.pay-icon{font-size:28px;margin-bottom:8px;}
.pay-name{font-family:'Bebas Neue',sans-serif;font-size:18px;letter-spacing:1px;margin-bottom:3px;}
.pay-desc{font-size:11px;color:var(--mu2);line-height:1.5;}
.pay-soon{font-size:10px;color:var(--or);font-weight:700;margin-top:5px;}
.pay-check{position:absolute;top:10px;right:10px;width:20px;height:20px;border-radius:50%;background:var(--or);display:flex;align-items:center;justify-content:center;font-size:11px;color:var(--bg);font-weight:900;}
/* DISCOUNT IN SUMMARY */
.disc-sum-row{display:flex;justify-content:space-between;padding:7px 0;font-size:13px;color:var(--gr);font-weight:700;}
.price-original{text-decoration:line-through;opacity:.5;font-size:22px;}
.price-final{font-family:'Bebas Neue',sans-serif;font-size:40px;color:var(--gr);line-height:1;}
.price-saving{font-size:12px;color:var(--gr);font-weight:700;margin-bottom:4px;}

.disc-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px;margin-bottom:8px;}
.disc-banner{position:relative;border-radius:14px;padding:20px;overflow:hidden;cursor:pointer;transition:transform .2s;}
.disc-banner:hover{transform:translateY(-3px);}
.disc-banner::before{content:'';position:absolute;inset:0;background:linear-gradient(135deg,rgba(255,255,255,.08),transparent 65%);pointer-events:none;}
.disc-pct{font-family:'Bebas Neue',sans-serif;font-size:68px;line-height:.9;color:#fff;margin-bottom:4px;}
.disc-badge-pill{display:inline-block;background:rgba(255,255,255,.22);color:#fff;font-size:10px;font-weight:800;letter-spacing:2px;padding:3px 10px;border-radius:20px;margin-bottom:8px;}
.disc-label{font-size:14px;font-weight:700;color:#fff;margin-bottom:10px;line-height:1.45;}
.disc-master{display:flex;align-items:center;gap:7px;font-size:11px;color:rgba(255,255,255,.7);margin-bottom:12px;}
.disc-book{background:rgba(255,255,255,.22);color:#fff;font-size:13px;font-weight:800;padding:9px 18px;border-radius:8px;border:none;cursor:pointer;font-family:'Syne',sans-serif;transition:background .18s;}
.disc-book:hover{background:rgba(255,255,255,.38);}
.disc-exp{font-size:10px;color:rgba(255,255,255,.55);margin-top:7px;}
/* OWNER SUBS EDITOR */
.sub-edit-card{background:var(--card);border:1px solid var(--b2);border-radius:12px;padding:18px;margin-bottom:12px;}
/* OWNER PANEL */
.owner-cab{display:flex;min-height:calc(100vh - 53px);}
.owner-sb{width:200px;flex-shrink:0;background:var(--dark);border-right:1px solid var(--border);padding:18px 12px;display:flex;flex-direction:column;gap:3px;}
.owner-logo{text-align:center;padding:16px 0 20px;border-bottom:1px solid var(--border);margin-bottom:12px;}
.owner-crown{font-size:36px;margin-bottom:6px;}
.owner-title{font-family:'Bebas Neue',sans-serif;font-size:16px;letter-spacing:2px;color:var(--gold);}
.owner-sub{font-size:10px;color:var(--mu);margin-top:2px;}
.owner-link{display:flex;align-items:center;gap:8px;background:none;border:none;color:var(--mu2);font-family:'Syne',sans-serif;font-size:12px;font-weight:700;cursor:pointer;padding:8px 10px;border-radius:7px;transition:all .18s;width:100%;text-align:left;}
.owner-link:hover,.owner-link.on{color:var(--gold);background:rgba(245,158,11,.1);}
.owner-icon{font-size:14px;width:18px;text-align:center;}
.owner-badge{margin-left:auto;background:var(--gold);color:var(--bg);font-size:10px;font-weight:800;padding:1px 6px;border-radius:9px;}
.owner-con{flex:1;overflow:auto;padding:24px;}
.master-mgmt-card{background:var(--card);border:1px solid var(--b2);border-radius:12px;padding:10px 12px;display:flex;align-items:center;gap:8px;margin-bottom:8px;transition:border-color .18s;overflow:hidden;}
.master-mgmt-card:hover{border-color:var(--b2);}
/* Owner mobile bubble */
.owner-bubble{display:none!important;}
.owner-bubble:hover{transform:scale(1.1);}
.owner-drawer-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:201;}
.owner-drawer-menu{position:fixed;bottom:0;left:0;right:0;background:var(--dark);border-radius:20px 20px 0 0;z-index:202;padding:16px;border-top:1px solid var(--border);animation:slideUp .25s ease;}
.owner-drawer-handle{width:36px;height:4px;background:var(--border);border-radius:2px;margin:0 auto 16px;}
.owner-drawer-item{display:flex;align-items:center;gap:12px;padding:14px 12px;border-radius:10px;cursor:pointer;border:none;background:none;color:var(--wh);font-family:'Syne',sans-serif;font-size:14px;font-weight:700;width:100%;text-align:left;transition:background .15s;}
.owner-drawer-item:hover,.owner-drawer-item.on{background:rgba(245,158,11,.12);color:var(--gold);}
.owner-drawer-item .owner-badge{margin-left:auto;}
.master-mgmt-info{flex:1;}
.master-mgmt-name{font-family:'Bebas Neue',sans-serif;font-size:16px;letter-spacing:1px;margin-bottom:1px;}
.master-mgmt-meta{font-size:11px;color:var(--mu2);}
.master-mgmt-actions{display:flex;gap:4px;flex-shrink:0;flex-wrap:nowrap;align-items:center;}
.owner-stat-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px;margin-bottom:28px;}
.owner-stat{background:var(--card);border:1px solid var(--b2);border-radius:11px;padding:18px;}
.owner-stat-lbl{font-size:10px;color:var(--mu);margin-bottom:4px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;}
.owner-stat-val{font-family:'Bebas Neue',sans-serif;font-size:40px;color:var(--gold);line-height:1;}
.owner-stat-sub{font-size:11px;color:var(--mu);margin-top:2px;}
.owner-form{background:var(--card);border:1px solid var(--b2);border-radius:14px;padding:22px;max-width:520px;margin-bottom:20px;}
.owner-form-title{font-family:'Bebas Neue',sans-serif;font-size:22px;color:var(--gold);margin-bottom:18px;letter-spacing:1px;}
.owner-filter{display:flex;gap:7px;margin-bottom:16px;flex-wrap:wrap;}
.owner-filter-btn{padding:"5px 14px";border-radius:20px;border:1px solid var(--b2);background:var(--card);color:var(--mu2);font-family:'Syne',sans-serif;font-size:12px;font-weight:700;cursor:pointer;transition:all .18s;}
.owner-filter-btn.on{background:var(--gold);color:var(--bg);border-color:var(--gold);}
.all-bookings-row{background:var(--card);border:1px solid var(--b2);border-radius:9px;padding:12px 14px;margin-bottom:7px;display:flex;align-items:center;gap:12px;}
.all-bk-time{font-family:'Bebas Neue',sans-serif;font-size:17px;color:var(--gold);min-width:46px;}
.all-bk-info{flex:1;}
.all-bk-client{font-weight:700;font-size:13px;}
.all-bk-meta{font-size:11px;color:var(--mu2);}

`;

// ── StarRow ───────────────────────────────────────────────────────────────────
function CourseForm({ lang, onSave }) {
  const [name, setName] = React.useState("");
  const [price, setPrice] = React.useState("");
  const [duration, setDuration] = React.useState("");
  const [location, setLocation] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [saved, setSaved] = React.useState(false);
  return(
    <div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 12px"}}>
        <div className="field"><label>{lang==="ru"?"Название":"Pavadinimas"}</label><input value={name} onChange={e=>setName(e.target.value)} placeholder={lang==="ru"?"Курс по стрижке":"Kirpimo kursas"}/></div>
        <div className="field"><label>{lang==="ru"?"Цена":"Kaina"}</label><input value={price} onChange={e=>setPrice(e.target.value)} placeholder="150€"/></div>
        <div className="field"><label>{lang==="ru"?"Длительность":"Trukmė"}</label><input value={duration} onChange={e=>setDuration(e.target.value)} placeholder={lang==="ru"?"2 дня":"2 dienos"}/></div>
        <div className="field"><label>{lang==="ru"?"Место":"Vieta"}</label><input value={location} onChange={e=>setLocation(e.target.value)} placeholder="BARBER HUB, Klaipėda"/></div>
      </div>
      <div className="field"><label>{lang==="ru"?"Описание":"Aprašymas"}</label>
        <textarea value={description} onChange={e=>setDescription(e.target.value)} rows={2} placeholder={lang==="ru"?"Что входит в курс...":"Kas įeina į kursą..."} style={{resize:"vertical"}}/></div>
      {saved&&<div style={{color:"var(--gr)",fontSize:12,marginBottom:6}}>✓ {lang==="ru"?"Добавлено!":"Pridėta!"}</div>}
      <button className="btn b-lg" style={{background:"var(--gold)",color:"var(--bg)",fontWeight:800}} onClick={()=>{
        if(!name||!price) return;
        onSave({name,price,duration,location,description});
        setName(""); setPrice(""); setDuration(""); setLocation(""); setDescription("");
        setSaved(true); setTimeout(()=>setSaved(false),2000);
      }}>{lang==="ru"?"Добавить курс":"Pridėti kursą"}</button>
    </div>
  );
}

function StarRow({ rating, size, active }) {
  const sz = size || 14;
  const activeColor = active || "#f59e0b";
  return (
    <div style={{ display:"flex", gap:1 }}>
      {[1,2,3,4,5].map(i => (
        <span key={i} style={{ fontSize:sz, color: i<=rating ? activeColor : "var(--border)", lineHeight:1 }}>★</span>
      ))}
    </div>
  );
}

// ── ServicesManager ───────────────────────────────────────────────────────────
function ServicesManager({ master, onSave, t, lang }) {
  const [svcs, setSvcs] = useState((master.services||[]).map(s => ({...s})));
  const [saved, setSaved] = useState(false);
  const mc = master.color;

  const upd = (id, k, v) => setSvcs(p => p.map(s => s.id===id ? {...s,[k]:v} : s));
  const tog = (id) => setSvcs(p => p.map(s => s.id===id ? {...s, enabled:!s.enabled} : s));
  const del = (id) => setSvcs(p => p.filter(s => s.id!==id));
  const add = () => setSvcs(p => [...p, { id:`c_${Date.now()}`, name_ru:"", name_lt:"", price:20, mins:30, cleanup:10, enabled:true }]);

  const inp = { background:"var(--card2)", border:"1px solid var(--b2)", borderRadius:7, padding:"9px 11px", color:"var(--wh)", fontFamily:"'Syne',sans-serif", fontSize:13, outline:"none", width:"100%" };
  const lbl = { fontSize:9, color:"var(--mu)", letterSpacing:"1.5px", textTransform:"uppercase", fontWeight:800, display:"block", marginBottom:5 };

  const save = () => { onSave({ services:svcs }); setSaved(true); setTimeout(()=>setSaved(false),2500); };

  return (
    <div className="settings-section">
      <div className="settings-section-title">✂️ {t.svc_manager}</div>
      <p style={{ fontSize:12, color:"var(--mu2)", marginBottom:12, lineHeight:1.6 }}>{t.svc_manager_desc}</p>
      <div style={{ fontSize:11, color:"var(--mu2)", marginBottom:14, padding:"9px 12px", background:"var(--card)", borderRadius:8, borderLeft:`3px solid ${mc}` }}>
        ℹ️ {t.svc_cleanup_hint}
      </div>

      {svcs.map((svc, idx) => {
        const total = (parseInt(svc.mins)||0)+(parseInt(svc.cleanup)||0);
        return (
          <div key={svc.id} style={{ background:svc.enabled?"var(--card)":"var(--dark)", border:`1px solid ${svc.enabled?mc+"55":"var(--border)"}`, borderRadius:12, padding:14, marginBottom:10, opacity:svc.enabled?1:.6 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
              <div style={{ display:"flex", alignItems:"center", gap:9 }}>
                <div style={{ width:26, height:26, borderRadius:"50%", background:mc+"22", color:mc, display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, fontWeight:900 }}>{idx+1}</div>
                <div>
                  <div style={{ fontSize:13, fontWeight:800, color:"var(--wh)" }}>{svc.name_ru || (lang==="ru"?"Новая услуга":"Nauja paslauga")}</div>
                  <div style={{ fontSize:11, color:"var(--mu)", marginTop:1 }}>{svc.price}€ · {svc.mins}+{svc.cleanup}={total}{t.min}</div>
                </div>
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:7 }}>
                <button onClick={()=>tog(svc.id)} style={{ padding:"4px 9px", borderRadius:20, border:"none", cursor:"pointer", fontSize:11, fontWeight:800, background:svc.enabled?"var(--grd)":"var(--border)", color:svc.enabled?"var(--gr)":"var(--mu)" }}>
                  {svc.enabled ? "✓ "+t.svc_enabled : t.svc_disabled}
                </button>
                <button onClick={()=>del(svc.id)} style={{ width:32, height:32, borderRadius:7, border:"1px solid var(--red)", background:"var(--redd)", color:"var(--red)", cursor:"pointer", fontSize:15, display:"flex", alignItems:"center", justifyContent:"center" }}>🗑</button>
              </div>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:10 }}>
              <div><label style={lbl}>{t.svc_name_ru}</label><input style={inp} value={svc.name_ru} onChange={e=>upd(svc.id,"name_ru",e.target.value)} placeholder="Название RU"/></div>
              <div><label style={lbl}>{t.svc_name_lt}</label><input style={inp} value={svc.name_lt} onChange={e=>upd(svc.id,"name_lt",e.target.value)} placeholder="LT pavadinimas"/></div>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10 }}>
              <div><label style={lbl}>{t.svc_price}</label><input style={{...inp,textAlign:"center"}} value={svc.price} onChange={e=>upd(svc.id,"price",e.target.value)} type="number" min="0"/></div>
              <div><label style={lbl}>⏱ {t.svc_duration}</label><input style={{...inp,textAlign:"center"}} value={svc.mins} onChange={e=>upd(svc.id,"mins",e.target.value)} type="number" min="5" step="5"/></div>
              <div><label style={lbl}>🧹 {t.svc_cleanup}</label><input style={{...inp,textAlign:"center"}} value={svc.cleanup} onChange={e=>upd(svc.id,"cleanup",e.target.value)} type="number" min="0" step="5"/></div>
            </div>
            <div style={{ marginTop:8, display:"flex", alignItems:"center", gap:8 }}>
              <div style={{ flex:1, height:4, background:"var(--border)", borderRadius:2 }}>
                <div style={{ width:`${Math.min((total/120)*100,100)}%`, height:"100%", background:`linear-gradient(90deg,${mc},var(--gr))`, borderRadius:2, transition:"width .3s" }}/>
              </div>
              <span style={{ fontSize:11, color:mc, fontWeight:800 }}>= {total} {t.min}</span>
            </div>
            {/* Needs card toggle */}
            <div style={{marginTop:10,display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 10px",background:"var(--card2)",borderRadius:8,border:`1px solid ${svc.needsCard?"var(--gr)":"var(--b2)"}`}}>
              <div>
                <div style={{fontSize:11,fontWeight:700,color:svc.needsCard?"var(--gr)":"var(--mu)"}}>📋 {lang==="ru"?"Требует карточку":"Reikia kortelės"}</div>
                <div style={{fontSize:10,color:"var(--mu2)"}}>{lang==="ru"?"Мастер заполняет карточку после процедуры":"Meistras pildys kortelę po procedūros"}</div>
              </div>
              <button onClick={()=>upd(svc.id,"needsCard",!svc.needsCard)} style={{width:44,height:24,borderRadius:12,border:"none",cursor:"pointer",position:"relative",background:svc.needsCard?"var(--gr)":"var(--border)",transition:"background .2s",flexShrink:0}}>
                <div style={{position:"absolute",top:2,left:svc.needsCard?22:2,width:20,height:20,borderRadius:"50%",background:"#fff",transition:"left .2s"}}/>
              </button>
            </div>
          </div>
        );
      })}

      <button onClick={add} style={{ width:"100%", padding:13, borderRadius:10, border:`2px dashed ${mc}55`, background:"transparent", color:mc, cursor:"pointer", fontSize:14, fontWeight:800, fontFamily:"'Syne',sans-serif", marginBottom:8 }}>
        {t.svc_add}
      </button>
      <div style={{ fontSize:11, color:"var(--mu)", marginBottom:14 }}>💡 {t.svc_toggle_hint}</div>
      <div style={{ display:"flex", alignItems:"center", gap:14 }}>
        <button className="btn b-lg" style={{ background:mc, color:"var(--bg)", fontWeight:800 }} onClick={save}>{t.svc_save}</button>
        {saved && <span style={{ fontSize:13, color:"var(--gr)", fontWeight:700 }}>{t.svc_saved}</span>}
      </div>
    </div>
  );
}

// ── MasterSettings ────────────────────────────────────────────────────────────
function MasterSettings({ master, onSave, t, lang }) {
  const [form, setForm] = useState({...master});
  const [saved, setSaved] = useState(false);
  const fileRef = useRef();
  const set = (k,v) => setForm(f=>({...f,[k]:v}));
  const mc = form.color;
  const fullName = `${form.firstName} ${form.lastName}`.trim();

  const handleSave = () => { onSave(form); setSaved(true); setTimeout(()=>setSaved(false),2500); };
  const handleFile = (e) => {
    const file = e.target.files?.[0]; if(!file) return;
    const r = new FileReader(); r.onload = ev => set("photo", ev.target.result); r.readAsDataURL(file);
  };

  return (
    <div className="settings-body">
      <div className="stag">⚙️ {lang==="ru"?"Кабинет мастера":"Meistro kabinetas"}</div>
      <h2 className="stitle" style={{ marginBottom:24 }}>{t.settings_title}</h2>

      {/* Preview */}
      <div className="settings-section">
        <div className="settings-section-title">👁 {t.s_preview}</div>
        <div style={{ display:"flex", gap:20, alignItems:"flex-start", flexWrap:"wrap" }}>
          <div className="preview-card" style={{ borderColor:mc+"44" }}>
            <div style={{ height:3, background:mc, borderRadius:"14px 14px 0 0", margin:"-20px -20px 14px" }}/>
            <div className="preview-av" style={{ background:mc+"22", borderColor:mc }}>
              {form.photo ? <img src={form.photo} alt="" onError={()=>set("photo","")} /> : <span>{form.emoji}</span>}
            </div>
            <div className="preview-name">{fullName}</div>
            <div className="preview-spec">{lang==="ru"?form.role_ru:form.role_lt}</div>
            {form.experience && <div className="preview-exp" style={{ background:mc+"20", color:mc }}>{form.experience} {t.exp_years}</div>}
            {form.workStart && form.workEnd && <div style={{ fontSize:10, color:"var(--mu)", marginTop:5 }}>🕐 {form.workStart}–{form.workEnd}</div>}
          </div>
        </div>
      </div>

      {/* Photo */}
      <div className="settings-section">
        <div className="settings-section-title">📷 {lang==="ru"?"Фото профиля":"Profilio nuotrauka"}</div>
        <div className="photo-zone">
          <div className="photo-preview" style={{ borderColor:mc, border:`3px solid ${mc}` }}>
            {form.photo ? <img src={form.photo} alt="" onError={()=>set("photo","")} /> : <span style={{ fontSize:32 }}>{form.emoji}</span>}
          </div>
          <div className="photo-controls">
            <p className="photo-hint">{t.s_photo_hint}</p>
            <input ref={fileRef} type="file" accept="image/*" style={{ display:"none" }} onChange={handleFile}/>
            <button className="file-upload-btn" onClick={()=>fileRef.current?.click()}>📁 {t.s_photo_upload}</button>
            <div className="sf"><label>{t.s_photo_url}</label><input value={form.photo?.startsWith("data:")?"":(form.photo||"")} onChange={e=>set("photo",e.target.value)} placeholder="https://..."/></div>
            {form.photo && <button className="btn b-red b-sm" style={{ alignSelf:"flex-start" }} onClick={()=>set("photo","")}>🗑 {t.s_reset_photo}</button>}
          </div>
        </div>
      </div>

      {/* Personal */}
      <div className="settings-section">
        <div className="settings-section-title">👤 {t.settings_personal}</div>
        <div className="settings-grid" style={{ marginBottom:12 }}>
          <div className="sf"><label>{t.s_firstname}</label><input value={form.firstName} onChange={e=>set("firstName",e.target.value)}/></div>
          <div className="sf"><label>{t.s_lastname}</label><input value={form.lastName} onChange={e=>set("lastName",e.target.value)}/></div>
          <div className="sf"><label>{t.s_phone}</label><input value={form.phone} onChange={e=>set("phone",e.target.value)}/></div>
          <div className="sf"><label>{t.s_instagram}</label><input value={form.instagram} onChange={e=>set("instagram",e.target.value)} placeholder="@username"/></div>
          <div className="sf"><label>📱 {lang==="ru"?"Telegram (для уведомлений)":"Telegram (pranešimams)"}</label><input value={form.telegram||""} onChange={e=>set("telegram",e.target.value)} placeholder="@username или chat_id"/></div>
          <div className="sf"><label>{t.s_experience}</label><input value={form.experience} onChange={e=>set("experience",e.target.value)} type="number" min="0" max="50"/></div>
        </div>
      </div>

      {/* Spec */}
      <div className="settings-section">
        <div className="settings-section-title">✂️ {lang==="ru"?"Специализация":"Specializacija"}</div>
        <div className="settings-grid">
          <div className="sf"><label>{t.s_spec_ru}</label><input value={form.role_ru} onChange={e=>set("role_ru",e.target.value)}/></div>
          <div className="sf"><label>{t.s_spec_lt}</label><input value={form.role_lt} onChange={e=>set("role_lt",e.target.value)}/></div>
        </div>
      </div>

      {/* About */}
      <div className="settings-section">
        <div className="settings-section-title">📝 {t.settings_about}</div>
        <div className="settings-grid" style={{ gridTemplateColumns:"1fr" }}>
          <div className="sf"><label>{t.s_about_ru}</label><textarea value={form.about_ru} onChange={e=>set("about_ru",e.target.value)} placeholder="Расскажите о себе..."/></div>
          <div className="sf"><label>{t.s_about_lt}</label><textarea value={form.about_lt} onChange={e=>set("about_lt",e.target.value)} placeholder="Apie save..."/></div>
        </div>
      </div>

      {/* Work hours */}
      <div className="settings-section">
        <div className="settings-section-title">🕐 {t.settings_schedule}</div>
        <div className="settings-grid">
          <div className="sf"><label>{t.s_work_start}</label>
            <select value={form.workStart} onChange={e=>{
              const val=e.target.value;
              const updated={...form,workStart:val};
              setForm(updated);
              onSave(updated);
            }}>
              {HOURS.map(h=><option key={h} value={h}>{h}</option>)}
            </select>
          </div>
          <div className="sf"><label>{t.s_work_end}</label>
            <select value={form.workEnd} onChange={e=>{
              const val=e.target.value;
              const updated={...form,workEnd:val};
              setForm(updated);
              onSave(updated);
            }}>
              {HOURS.map(h=><option key={h} value={h}>{h}</option>)}
            </select>
          </div>
        </div>
        <div style={{fontSize:11,color:"var(--gr)",marginTop:6}}>✓ {lang==="ru"?"Сохраняется автоматически":"Išsaugoma automatiškai"}</div>
      </div>

      {/* Services manager */}
      <ServicesManager master={form} onSave={(data)=>setForm(f=>({...f,...data}))} t={t} lang={lang} />

      {/* DISCOUNT */}
      <div className="settings-section">
        <div className="settings-section-title">🏷️ {t.discount_title}</div>
        <p style={{fontSize:11,color:"var(--mu2)",marginBottom:14,lineHeight:1.6}}>
          {t.discount_hint}
        </p>

        {/* Preview */}
        {form.discount?.enabled && form.discount?.percent > 0 && (
          <div style={{
            background:`linear-gradient(135deg, ${mc}, ${mc}bb)`,
            borderRadius:12, padding:18, marginBottom:16, position:"relative", overflow:"hidden",
          }}>
            <div style={{position:"absolute",right:-10,top:-10,fontSize:80,opacity:.1,fontFamily:"'Bebas Neue',sans-serif",lineHeight:1}}>{form.discount.percent}%</div>
            <div style={{fontSize:10,fontWeight:800,letterSpacing:2,color:"rgba(255,255,255,.7)",textTransform:"uppercase",marginBottom:4}}>{t.discount_badge}</div>
            <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:52,color:"#fff",lineHeight:1}}>−{form.discount.percent}%</div>
            <div style={{fontSize:13,fontWeight:700,color:"#fff",marginTop:4,marginBottom:8}}>
              {(lang==="ru"?form.discount.label_ru:form.discount.label_lt)||"Текст акции..."}
            </div>
            <div style={{fontSize:11,color:"rgba(255,255,255,.75)"}}>
              {form.firstName} {form.lastName} · {lang==="ru"?"так видит клиент":"taip mato klientas"}
            </div>
          </div>
        )}

        {/* Toggle */}
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:16,padding:"12px 14px",background:"var(--card)",borderRadius:9,border:"1px solid var(--b2)"}}>
          <span style={{flex:1,fontSize:13,fontWeight:700}}>{t.discount_enabled}</span>
          <button
            onClick={()=>set("discount",{...(form.discount||{}),enabled:!(form.discount?.enabled)})}
            style={{
              width:44,height:24,borderRadius:12,border:"none",cursor:"pointer",position:"relative",
              background:form.discount?.enabled?mc:"var(--border)",transition:"background .2s",flexShrink:0,
            }}
          >
            <div style={{
              position:"absolute",width:18,height:18,borderRadius:9,background:"#fff",
              top:3,left:form.discount?.enabled?23:3,transition:"left .2s",
            }}/>
          </button>
        </div>

        {/* Fields */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 14px",marginBottom:12}}>
          <div className="sf" style={{gridColumn:"1 / -1"}}>
            <label>{t.discount_percent}</label>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <input
                type="range" min="5" max="70" step="5"
                value={form.discount?.percent||10}
                onChange={e=>set("discount",{...(form.discount||{}),percent:parseInt(e.target.value)})}
                style={{flex:1,accentColor:mc}}
              />
              <div style={{
                fontFamily:"'Bebas Neue',sans-serif",fontSize:36,color:mc,
                minWidth:60,textAlign:"center",lineHeight:1,
              }}>
                {form.discount?.percent||10}%
              </div>
            </div>
            {/* Price examples */}
            <div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:8}}>
              {(form.services||[]).filter(s=>s.enabled).slice(0,4).map(s=>{
                const orig = Number(s.price);
                const disc = Math.round(orig*(1-(form.discount?.percent||10)/100));
                return(
                  <div key={s.id} style={{fontSize:11,background:mc+"18",color:mc,padding:"3px 9px",borderRadius:20,fontWeight:700}}>
                    {lang==="ru"?s.name_ru:s.name_lt}: <s style={{opacity:.6}}>{orig}€</s> → {disc}€
                  </div>
                );
              })}
            </div>
          </div>
          <div className="sf">
            <label>{t.discount_label_ru}</label>
            <input
              value={form.discount?.label_ru||""}
              onChange={e=>set("discount",{...(form.discount||{}),label_ru:e.target.value})}
              placeholder="Скидка на первую стрижку!"
            />
          </div>
          <div className="sf">
            <label>{t.discount_label_lt}</label>
            <input
              value={form.discount?.label_lt||""}
              onChange={e=>set("discount",{...(form.discount||{}),label_lt:e.target.value})}
              placeholder="Nuolaida pirmam kirpimui!"
            />
          </div>
          <div className="sf" style={{gridColumn:"1 / -1"}}>
            <label>{t.discount_expires}</label>
            <input
              type="date"
              value={form.discount?.expires||""}
              onChange={e=>set("discount",{...(form.discount||{}),expires:e.target.value})}
            />
          </div>
        </div>
      </div>

      {/* Color */}
      <div className="settings-section">
        <div className="settings-section-title">🎨 {t.settings_appearance}</div>
        <div className="sf" style={{ marginBottom:12 }}>
          <label>{t.s_color}</label>
          <div className="color-swatches">
            {THEME_COLORS.map(c => (
              <div key={c} className={`swatch${form.color===c?" active":""}`} style={{ background:c }} onClick={()=>set("color",c)}/>
            ))}
          </div>
        </div>
        <div className="sf">
          <label>{lang==="ru"?"Или введите HEX":"Arba įveskite HEX"}</label>
          <div style={{ display:"flex", gap:9, alignItems:"center" }}>
            <input value={form.color} onChange={e=>set("color",e.target.value)} placeholder="#e8650a" style={{ maxWidth:130 }}/>
            <div style={{ width:30, height:30, borderRadius:7, background:form.color, border:"2px solid var(--b2)" }}/>
          </div>
        </div>
      </div>

      <div className="save-row">
        <button className="btn b-lg" style={{ background:mc, color:"var(--bg)", fontWeight:800 }} onClick={handleSave}>{t.s_save}</button>
        {saved && <span className="save-ok">{t.s_saved}</span>}
      </div>
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────

// Standalone form - lives OUTSIDE App, has its own state, never loses focus
function MasterFormModal({ isEdit, initialData, colors, onSave, onCancel, t }) {
  const formRef = useRef(null);
  const [col, setCol] = useState(initialData?.color||"#e8650a");
  const [err, setErr] = useState("");

  const handleSubmit = () => {
    const els = formRef.current.elements;
    const fn = els.fn.value.trim();
    const ln = els.ln.value.trim();
    const em = els.em.value.trim();
    const pw = els.pw.value.trim();
    const rru = els.rru.value.trim();
    const rlt = els.rlt.value.trim();
    const ej = els.ej.value.trim() || "✂️";
    if(!fn||!ln||!em||!pw){ setErr(t.err_fill); return; }
    onSave({ firstName:fn, lastName:ln, email:em, password:pw, role_ru:rru, role_lt:rlt, emoji:ej, color:col });
  };

  return (
    <div className="owner-form">
      <div className="owner-form-title">{isEdit ? t.owner_master_edit_title : t.owner_master_form_title}</div>
      {err&&<div className="err">{err}</div>}
      <form ref={formRef} onSubmit={e=>e.preventDefault()} autoComplete="off">
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 14px"}}>
          <div className="field"><label>{t.owner_master_fname}</label><input name="fn" defaultValue={initialData?.firstName||""} placeholder="Алексей"/></div>
          <div className="field"><label>{t.owner_master_lname}</label><input name="ln" defaultValue={initialData?.lastName||""} placeholder="Волков"/></div>
          <div className="field"><label>{t.owner_master_email}</label><input name="em" defaultValue={initialData?.email||""} placeholder="master@hub.com" type="email"/></div>
          <div className="field"><label>{t.owner_master_password}</label><input name="pw" defaultValue={initialData?.password||""} placeholder="пароль"/></div>
          <div className="field"><label>{t.owner_master_spec_ru}</label><input name="rru" defaultValue={initialData?.role_ru||""} placeholder="Классика & Fade"/></div>
          <div className="field"><label>{t.owner_master_spec_lt}</label><input name="rlt" defaultValue={initialData?.role_lt||""} placeholder="Klasika & Fade"/></div>
          <div className="field"><label>{t.owner_master_emoji}</label><input name="ej" defaultValue={initialData?.emoji||"✂️"} placeholder="✂️" style={{fontSize:20}}/></div>
          <div className="field">
            <label>{t.owner_master_color}</label>
            <div style={{display:"flex",gap:7,flexWrap:"wrap",marginTop:5}}>
              {colors.map(c=><div key={c} className={"swatch"+(col===c?" active":"")} style={{background:c,width:26,height:26,cursor:"pointer"}} onClick={()=>setCol(c)}/>)}
            </div>
          </div>
        </div>
      </form>
      <div style={{display:"flex",gap:9,marginTop:12}}>
        <button className="btn b-lg" style={{background:"var(--gold)",color:"var(--bg)",fontWeight:800,flex:1}} onClick={handleSubmit}>
          {isEdit ? t.owner_save : t.owner_create}
        </button>
        <button className="btn b-ghost" onClick={onCancel}>{t.owner_cancel}</button>
      </div>
    </div>
  );
}

export default function App() {
  const [lang, setLangRaw] = useState(()=>{
    try{ return localStorage.getItem("barberhub_lang")||"lt"; }catch(e){ return "lt"; }
  });
  const setLang = (l) => { setLangRaw(l); try{ localStorage.setItem("barberhub_lang",l); }catch(e){} };
  const t = T[lang];
  const SERVICES = lang==="ru" ? SERVICES_RU : SERVICES_LT;

  const [masters, setMasters] = useState([]);

  // ── Load masters from Firestore ─────────────────────────────────────────
  useEffect(()=>{
    const unsub = onSnapshot(collection(fbDb,"masters"), snap=>{
      const firestoreMasters = snap.docs.map(d=>{
        const data=d.data();
        // Use Firestore doc ID as master ID for consistent save/load
        return {...data, _docId:d.id, id:data.id||d.id};
      });
      if(firestoreMasters.length > 0) setMasters(firestoreMasters);
    }, ()=>{});
    return ()=>unsub();
  },[]);
  const [subs, setSubs] = useState(INIT_SUBS);
  const [users, setUsers] = useState([]);
  const [cur, setCur] = useState(null);
  const [fbLoading, setFbLoading] = useState(true);

  // ── Firebase Auth — restore session on reload ───────────────────────────
  useEffect(()=>{
    // Safety timeout
    const timeout = setTimeout(()=>setFbLoading(false), 5000);

    // Check owner session from localStorage first
    try{
      const saved = localStorage.getItem("barberhub_owner");
      if(saved==="true"){
        setCur({...OWNER});
        clearTimeout(timeout);
        setFbLoading(false);
        return ()=>{};
      }
      // Check master session
      const savedMaster = localStorage.getItem("barberhub_master");
      if(savedMaster){
        const masterData = JSON.parse(savedMaster);
        setCur(masterData);
        clearTimeout(timeout);
        setFbLoading(false);
        return ()=>{};
      }
    }catch(e){}

    const unsub = onAuthStateChanged(fbAuth, async (firebaseUser)=>{
      try{
        if(firebaseUser){
          if(firebaseUser.email===OWNER.email){ setCur({...OWNER}); clearTimeout(timeout); setFbLoading(false); return; }
          const masterSnap = await getDoc(doc(fbDb,"masters",firebaseUser.uid));
          if(masterSnap.exists()){
            setCur({...masterSnap.data(), uid:firebaseUser.uid});
            clearTimeout(timeout); setFbLoading(false); return;
          }
          const userSnap = await getDoc(doc(fbDb,"users",firebaseUser.uid));
          if(userSnap.exists()){
            setCur({...userSnap.data(), uid:firebaseUser.uid});
          } else {
            setCur({ name:firebaseUser.displayName||firebaseUser.email, email:firebaseUser.email, role:"client", sub:null, uid:firebaseUser.uid });
          }
        } else {
          setCur(null);
        }
      } catch(e){
        setCur(null);
      }
      clearTimeout(timeout);
      setFbLoading(false);
    });
    return ()=>{ unsub(); clearTimeout(timeout); };
  },[]);

  // bookings loaded below after state declaration
  const [modal, setModal] = useState(null);
  const [authMode, setAuthMode] = useState("login");
  const [authForm, setAuthForm] = useState({ name:"", email:"", phone:"", password:"", confirmPassword:"" });
  const [showPass, setShowPass] = useState(false);
  const [confirmPassErr, setConfirmPassErr] = useState("");
  const [authErr, setAuthErr] = useState("");
  const [page, setPageRaw] = useState(()=>{
    try{ return localStorage.getItem("barberhub_page")||"home"; }catch(e){ return "home"; }
  });
  const setPage = (p) => {
    setPageRaw(p);
    try{ localStorage.setItem("barberhub_page", p); }catch(e){}
  };
  const [navOpen, setNavOpen] = useState(false);
  const [profileEdit, setProfileEdit] = useState({name:"", phone:""});
  const [profileSaved, setProfileSaved] = useState(false);
  const [clientReschedule, setClientReschedule] = useState(null);
  const [selectedMaster, setSelectedMaster] = useState(null);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [orders, setOrders] = useState([]);
  const [orderModal, setOrderModal] = useState(null); // product being ordered
  const [orderPlaced, setOrderPlaced] = useState(false);
  const [triCards, setTriCards] = useState([]);
  const [triCardModal, setTriCardModal] = useState(null); // {appt, master}
  const [triCardForm, setTriCardForm] = useState({procedure:"",recommendations:"",productRecs:[],photos:[]});
  const [triCardSaving, setTriCardSaving] = useState(false);

  useEffect(()=>{
    const unsub = onSnapshot(collection(fbDb,"trichologyCards"), snap=>{
      setTriCards(snap.docs.map(d=>({...d.data(),id:d.id})));
    }, ()=>{});
    return ()=>unsub();
  },[]);

  useEffect(()=>{
    const unsub = onSnapshot(collection(fbDb,"orders"), snap=>{
      setOrders(snap.docs.map(d=>({...d.data(),id:d.id})));
    }, ()=>{});
    return ()=>unsub();
  },[]); // for master profile page
  const [bookings, setBookings] = useState([]);

  // ── Load ALL data from Firestore after state is ready ─────────────────
  useEffect(()=>{
    // Bookings — real-time, no orderBy to avoid composite index requirement
    const unsubBookings = onSnapshot(collection(fbDb,"bookings"), snap=>{
      const data = snap.docs.map(d=>({...d.data(), id:d.id}));
      // Sort client-side
      data.sort((a,b)=>a.date<b.date?-1:a.date>b.date?1:a.time<b.time?-1:1);
      setBookings(data);
    }, (err)=>{
      console.error("Bookings load error:", err);
    });
    return ()=>unsubBookings();
  },[]);
  const [reviews, setReviews] = useState([]);

  // Load reviews from Firestore
  useEffect(()=>{
    const unsub = onSnapshot(collection(fbDb,"reviews"), snap=>{
      setReviews(snap.docs.map(d=>({...d.data(), id:d.id})));
    }, ()=>{});
    return ()=>unsub();
  },[]);
  const [reviewForm, setReviewForm] = useState({ masterId:"", rating:5, text:"" });
  const [reviewDone, setReviewDone] = useState(false);
  // Post-visit popup
  const [visitReview, setVisitReview] = useState(null); // { bookingId, masterId, masterObj }
  const [visitRating, setVisitRating] = useState(5);
  const [visitText, setVisitText] = useState("");
  const [visitTip, setVisitTip] = useState(null);  // selected tip amount
  const [visitCustomTip, setVisitCustomTip] = useState("");
  const [visitSubmitted, setVisitSubmitted] = useState(false);
  const [visitTipPaid, setVisitTipPaid] = useState(false);
  const [pendingVisitReview, setPendingVisitReview] = useState(null);

  // Check Firestore for pending review popup when client is logged in
  useEffect(()=>{
    if(!cur?.email || cur?.role!=="client") return;
    const key = cur.email.replace(/[.@]/g,"_");
    const unsub = onSnapshot(doc(fbDb,"pendingReviews",key), snap=>{
      if(snap.exists()){
        const data = snap.data();
        setVisitReview(data);
        setVisitRating(5); setVisitText(""); setVisitTip(null);
        setVisitCustomTip(""); setVisitSubmitted(false); setVisitTipPaid(false);
        // Delete so it doesn't show again
        deleteDoc(doc(fbDb,"pendingReviews",key)).catch(()=>{});
      }
    }, ()=>{});
    return ()=>unsub();
  },[cur?.email, cur?.role]);
  const [carouselIdx, setCarouselIdx] = useState(0);
  const carouselTouchStart = useRef(0);
  const [bk, setBk] = useState({ services:[], master:null, date:null, time:null, payment:null });
  const scrollToBkStep = (id) => {
    setTimeout(()=>{
      document.getElementById(id)?.scrollIntoView({behavior:"smooth", block:"start"});
    }, 150);
  };
  const [bkDone, setBkDone] = useState(false);
  const [bkLoading, setBkLoading] = useState(false);
  const [bkStatus, setBkStatus] = useState(null); // null | "checking" | "success" | "fail"
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [bgMusicEnabled, setBgMusicEnabled] = useState(false);
  const [currentMelodyId, setCurrentMelodyId] = useState("mario");
  const bgMusicRef = useRef(null);
  const userInteractedRef = useRef(false);

  // Load global sound settings from Firestore — applies to ALL users
  useEffect(()=>{
    const unsub = onSnapshot(doc(fbDb,"config","appSettings"), snap=>{
      if(snap.exists()){
        const d = snap.data();
        if(d.soundEnabled !== undefined) setSoundEnabled(d.soundEnabled);
        if(d.bgMusicEnabled !== undefined) setBgMusicEnabled(d.bgMusicEnabled);
        if(d.melodyId) setCurrentMelodyId(d.melodyId);
      }
    }, ()=>{});
    return ()=>unsub();
  },[]);

  const saveAppSettings = async(settings) => {
    try{ await setDoc(doc(fbDb,"config","appSettings"), settings, {merge:true}); }catch(e){ console.error("saveAppSettings error:",e); }
  };

  useEffect(()=>{
    if(!bgMusicEnabled){
      stopMarioMusic(bgMusicRef);
      return;
    }
    // If user already interacted — start immediately
    if(userInteractedRef.current){
      startMelody(bgMusicRef, currentMelodyId||"mario");
    }
    // Otherwise wait for first user interaction
    const startOnInteraction = () => {
      if(!userInteractedRef.current){
        userInteractedRef.current = true;
        if(bgMusicEnabled) startMelody(bgMusicRef, currentMelodyId||"mario");
      }
      document.removeEventListener("click", startOnInteraction);
      document.removeEventListener("touchstart", startOnInteraction);
      document.removeEventListener("keydown", startOnInteraction);
    };
    document.addEventListener("click", startOnInteraction);
    document.addEventListener("touchstart", startOnInteraction);
    document.addEventListener("keydown", startOnInteraction);
    return ()=>{
      document.removeEventListener("click", startOnInteraction);
      document.removeEventListener("touchstart", startOnInteraction);
      document.removeEventListener("keydown", startOnInteraction);
      stopMarioMusic(bgMusicRef);
    };
  },[bgMusicEnabled]);
  const [calView, setCalView] = useState("week");
  const [weekAnchor, setWeekAnchor] = useState(new Date());
  const [masterDrawerOpen, setMasterDrawerOpen] = useState(false);
  const [calZoom, setCalZoom] = useState(20);
  const [nowTime, setNowTime] = useState(new Date());
  useEffect(()=>{
    const timer = setInterval(()=>setNowTime(new Date()), 60000);
    return ()=>clearInterval(timer);
  },[]);
  const [mTab, setMTabRaw] = useState(()=>{
    try{ return localStorage.getItem("barberhub_mTab")||"calendar"; }catch(e){ return "calendar"; }
  });
  const setMTab = (t) => { setMTabRaw(t); try{ localStorage.setItem("barberhub_mTab",t); }catch(e){} };

  // Lock body scroll ONLY when on calendar tab
  useEffect(()=>{
    if(page==="master" && mTab==="calendar"){
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return ()=>{ document.body.style.overflow = ""; };
  },[page, mTab]);
  const [widgetBtnVisible, setWidgetBtnVisible] = useState(true);
  const lastScrollY = useRef(0);
  useEffect(()=>{
    const onScroll = () => {
      const current = window.scrollY;
      setWidgetBtnVisible(current <= lastScrollY.current || current < 50);
      lastScrollY.current = current;
    };
    window.addEventListener("scroll", onScroll, {passive:true});
    return ()=>window.removeEventListener("scroll", onScroll);
  },[]);
  const [newAppt, setNewAppt] = useState({ clientMode:"new", clientName:"", clientPhone:"", serviceIds:[], date:todayStr, time:"10:00", notes:"" });
  const [detailAppt, setDetailAppt] = useState(null);
  const [dragId, setDragId] = useState(null);
  const [touchDragGhost, setTouchDragGhost] = useState(null);
  const touchDragRef = useRef({id:null, timer:null, active:false});
  const pinchRef = useRef({active:false, startDist:0, startZoom:32});
  const swipeRef = useRef({active:false});
  const [weekSlide, setWeekSlide] = useState(null);

  const calBodyRef = useRef(null);
  const [dragOver, setDragOver] = useState(null);       // "date|time" string of hovered cell
  const [rescheduleAppt, setRescheduleAppt] = useState(null); // booking being manually rescheduled
  const [rescheduleDate, setRescheduleDate] = useState(null);
  const [rescheduleTime, setRescheduleTime] = useState(null);
  const [ownerTab, setOwnerTabRaw] = useState(()=>{
    try{ return localStorage.getItem("barberhub_ownerTab")||"masters"; }catch(e){ return "masters"; }
  });
  const setOwnerTab = (t) => { setOwnerTabRaw(t); try{ localStorage.setItem("barberhub_ownerTab",t); }catch(e){} };
  const [ownerDrawerOpen, setOwnerDrawerOpen] = useState(false);
  const [ownerMasterForm, setOwnerMasterForm] = useState({ firstName:"", lastName:"", email:"", password:"", role_ru:"", role_lt:"", color:"#e8650a", emoji:"✂️" });
  const [ownerMasterEdit, setOwnerMasterEdit] = useState(null);
  const [ownerFormOpen, setOwnerFormOpen] = useState(false);
  const [ownerFormErr, setOwnerFormErr] = useState("");

  const handleMasterSave = async (form) => {
    if(ownerMasterEdit){
      const updated = {...masters.find(m=>m.id===ownerMasterEdit), ...form};
      setMasters(p=>p.map(m=>m.id===ownerMasterEdit ? updated : m));
      try{ await setDoc(doc(fbDb,"masters",ownerMasterEdit), updated); }catch(e){}
    } else {
      const newId = "master_"+Date.now();
      const newMaster = {
        ...form, id:newId, role:"master",
        photo:"", phone:"", about_ru:"", about_lt:"",
        experience:"", instagram:"",
        workStart:"09:00", workEnd:"20:00",
        services:[{id:"s_"+Date.now(), name_ru:"Классическая стрижка", name_lt:"Klasikinis kirpimas", price:25, mins:45, cleanup:10, enabled:true}]
      };
      setMasters(p=>[...p, newMaster]);
      try{ await setDoc(doc(fbDb,"masters",newId), newMaster); }catch(e){}
    }
    setOwnerMasterEdit(null);
    setOwnerFormOpen(false);
  };

  const handleMasterCancel = () => {
    setOwnerFormOpen(false);
    setOwnerMasterEdit(null);
  };
  const [ownerRevFilter, setOwnerRevFilter] = useState("all");
  const [ownerSubsSaved, setOwnerSubsSaved] = useState(false);
  const [editSubs, setEditSubs] = useState(null);
  // Track sub visits: { "userEmail|subId|YYYY-MM": usedCount }
  const [subVisits, setSubVisits] = useState({});

  // Schedule blocks: { id, masterId (null=salon), date, fromTime, toTime, allDay, type, reason, createdBy }
  const [blocks, setBlocks] = useState([]);

  // Load blocks from Firestore
  useEffect(()=>{
    const unsub = onSnapshot(collection(fbDb,"blocks"), snap=>{
      setBlocks(snap.docs.map(d=>({...d.data(),id:d.id})));
    }, ()=>{});
    return ()=>unsub();
  },[]);

  // Salon-wide schedule: work days, hours, vacation dates
  const [salonInfo, setSalonInfo] = useState({
    tagRu:"Клайпеда · Барбершоп с 2016",
    tagLt:"Klaipėda · Kirpykla nuo 2016",
    instagram:"", facebook:"", phone:"", address:"",
    mapUrl:"",
  });
  const [courses, setCourses] = useState([]);

  // Load salonInfo from Firestore
  useEffect(()=>{
    const unsub = onSnapshot(doc(fbDb,"config","salonInfo"), snap=>{
      if(snap.exists()) setSalonInfo(p=>({...p,...snap.data()}));
    }, ()=>{});
    return ()=>unsub();
  },[]);

  // Load courses from Firestore
  useEffect(()=>{
    const unsub = onSnapshot(collection(fbDb,"courses"), snap=>{
      setCourses(snap.docs.map(d=>({...d.data(),id:d.id})));
    }, ()=>{});
    return ()=>unsub();
  },[]);

  const [salonSchedule, setSalonSchedule] = useState({
    workDays:[1,2,3,4,5,6],
    workStart:"09:00",
    workEnd:"20:00",
    vacations:[],
  });

  // Load salonSchedule from Firestore
  useEffect(()=>{
    const unsub = onSnapshot(doc(fbDb,"config","salonSchedule"), snap=>{
      if(snap.exists()) setSalonSchedule(snap.data());
    }, ()=>{});
    return ()=>unsub();
  },[]);

  // Save salonSchedule to Firestore when it changes
  const saveSalonSchedule = async (newSchedule) => {
    setSalonSchedule(newSchedule);
    try{
      await setDoc(doc(fbDb,"config","salonSchedule"), newSchedule);
      console.log("✅ salonSchedule saved:", newSchedule);
    }catch(e){
      console.error("❌ salonSchedule save error:", e);
      alert(lang==="ru"?"Ошибка сохранения расписания: "+e.message:"Klaida: "+e.message);
    }
  };

  // Notifications
  const [notifications, setNotifications] = useState([]);
  const [showNotifs, setShowNotifs] = useState(false);

  // ── Load notifications from Firestore ──────────────────────────────────────
  useEffect(()=>{
    const unsub = onSnapshot(collection(fbDb,"notifications"), snap=>{
      const data = snap.docs.map(d=>({...d.data(),id:d.id}));
      data.sort((a,b)=>(b.createdAt||"")>(a.createdAt||"")?1:-1);
      setNotifications(data);
    }, (err)=>{ console.error("Notifs error:", err); });
    return ()=>unsub();
  },[]);

  const [blockModal, setBlockModal] = useState(false);
  const [blockMode, setBlockMode] = useState(false); // visual block selection mode
  const [blockSelectedSlots, setBlockSelectedSlots] = useState([]); // [{date,time}]
  const [blockTypeModal, setBlockTypeModal] = useState(false);
  const [blockToDelete, setBlockToDelete] = useState(null);
  const [portfolio, setPortfolio] = useState([]);
  const [products, setProducts] = useState([]);
  const [productForm, setProductForm] = useState({name:"",description:"",price:"",photo:"",category:"",inStock:true});
  const [editingProduct, setEditingProduct] = useState(null);
  const [productSaving, setProductSaving] = useState(false);

  // Load products from Firestore
  useEffect(()=>{
    const unsub = onSnapshot(collection(fbDb,"products"), snap=>{
      setProducts(snap.docs.map(d=>({...d.data(),id:d.id})));
    }, ()=>{});
    return ()=>unsub();
  },[]);
  const [portfolioForm, setPortfolioForm] = useState({photo:"", serviceId:"", caption:""});
  const [portfolioUploading, setPortfolioUploading] = useState(false);

  // Load portfolio from Firestore
  useEffect(()=>{
    const unsub = onSnapshot(collection(fbDb,"portfolio"), snap=>{
      setPortfolio(snap.docs.map(d=>({...d.data(),id:d.id})));
    }, ()=>{});
    return ()=>unsub();
  },[]); // show type picker
  const [blockForm, setBlockForm] = useState({ date:todayStr, fromTime:"13:00", toTime:"14:00", allDay:false, type:"break", reason:"" });
  const [vacForm, setVacForm] = useState({ dateFrom:todayStr, dateTo:todayStr, reason:"" });

  // masterId — кому из мастеров адресовано, forOwner — виден ли владельцу
  const addNotification = async (type, text, masterId=null, forOwner=true) => {
    const now = new Date();
    const time = now.getHours().toString().padStart(2,"0")+":"+now.getMinutes().toString().padStart(2,"0");
    const notif = {masterId:masterId?String(masterId):null, forOwner, type, text, time, read:false, createdAt:new Date().toISOString()};
    try{
      await addDoc(collection(fbDb,"notifications"), notif);
    } catch(e){
      // Offline fallback
      setNotifications(p=>[{...notif,id:Date.now()},...p].slice(0,100));
    }
  };

  const isOwner = cur?.role === "owner";
  const masterObj = cur?.role==="master" 
    ? (masters.find(m=>m.email===cur.email) || (cur.id ? {
        id:cur.id, email:cur.email, firstName:cur.name, lastName:"",
        color:"#e8650a", emoji:"✂️", services:[], workStart:"09:00", workEnd:"20:00",
        role:"master"
      } : null))
    : null;
  const weekDates = getWeekDates(weekAnchor);

  // Уведомления для текущего пользователя
  const myNotifications = notifications.filter(n => {
    if(isOwner) return n.forOwner;
    if(masterObj) return String(n.masterId)===String(masterObj.id);
    return false;
  });
  const unreadCount = myNotifications.filter(n=>!n.read).length;
  const markAllRead = async () => {
    const toMark = notifications.filter(n=>{
      if(isOwner && n.forOwner && !n.read) return true;
      if(masterObj && String(n.masterId)===String(masterObj.id) && !n.read) return true;
      return false;
    });
    setNotifications(p=>p.map(n=>{
      if(isOwner && n.forOwner) return {...n,read:true};
      if(masterObj && String(n.masterId)===String(masterObj.id)) return {...n,read:true};
      return n;
    }));
    // Update in Firestore
    toMark.forEach(n=>{
      try{ updateDoc(doc(fbDb,"notifications",String(n.id)),{read:true}); }catch(e){}
    });
  };

  // Check if a date/time is blocked (salon vacation or master/salon block)
  const isDateSalonClosed = (dateStr) => {
    const d = new Date(dateStr+"T12:00");
    const dow = d.getDay();
    if(!salonSchedule.workDays.includes(dow)) return true;
    return salonSchedule.vacations.some(v=>dateStr>=v.dateFrom&&dateStr<=v.dateTo);
  };
  const getBlocksForSlot = (masterId, date, time) => {
    const hm = timeToMins(time);
    return blocks.filter(b=>{
      if(b.date!==date) return false;
      if(b.masterId!==null&&b.masterId!==masterId) return false;
      if(b.allDay) return true;
      return hm>=timeToMins(b.fromTime)&&hm<timeToMins(b.toTime);
    });
  };

  const resolveSvc = (masterId, serviceId) => {
    const m = masters.find(x=>x.id===masterId||String(x.id)===String(masterId));
    const ms = (m?.services||[]).find(s=>s.id===serviceId||s.id===String(serviceId));
    if (ms) return { name:lang==="ru"?ms.name_ru:ms.name_lt, price:Number(ms.price), mins:Number(ms.mins), cleanup:Number(ms.cleanup||0), needsCard:ms.needsCard===true };
    const gs = SERVICES_RU.find(s=>s.id===serviceId||s.id===Number(serviceId));
    if (gs) return { name:gs.name, price:gs.price, mins:gs.mins, cleanup:0, needsCard:false };
    return null;
  };

  // Resolve all services from a booking — supports both single and multi-service
  const resolveBooking = (b) => {
    const ids = Array.isArray(b.serviceIds)&&b.serviceIds.length ? b.serviceIds : (b.serviceId?[b.serviceId]:[]);
    const svcs = ids.map(id=>resolveSvc(b.masterId,id)).filter(Boolean);
    return {
      name: svcs.map(s=>s.name).join(" + ") || "—",
      price: svcs.reduce((s,x)=>s+x.price,0),
      mins:  svcs.reduce((s,x)=>s+x.mins,0),
      cleanup: svcs.reduce((s,x)=>s+(x.cleanup||0),0),
      needsCard: svcs.some(s=>s.needsCard===true),
      svcs,
    };
  };

  // ID мастера — из объекта мастера или напрямую из cur при загрузке
  const curMasterId = masterObj?.id || (cur?.role==="master" ? cur?.id : null);

  const myBookings = cur?.role==="master"
    ? bookings.filter(b=>String(b.masterId)===String(curMasterId))
    : bookings.filter(b=>
        (cur?.email && b.clientEmail===cur.email) ||
        (cur?.uid && b.clientUid===cur.uid)
      );

  const masterClients = useMemo(()=>{
    if(!masterObj) return [];
    const map={};
    bookings.filter(b=>String(b.masterId)===String(curMasterId)).forEach(b=>{
      if(!map[b.clientName]) map[b.clientName]={name:b.clientName,phone:b.clientPhone,visits:0,lastDate:"",total:0};
      map[b.clientName].visits++;
      const s=resolveBooking(b);
      map[b.clientName].total+=(s?.price||0);
      if(b.date>map[b.clientName].lastDate) map[b.clientName].lastDate=b.date;
    });
    return Object.values(map);
  },[bookings,masterObj,masters,lang]);

  const statsFor = (filter) => {
    if(!masterObj) return {appts:0,rev:0};
    const bs=bookings.filter(b=>String(b.masterId)===String(curMasterId)&&b.status!=="cancelled"&&filter(b));
    return {appts:bs.length, rev:bs.reduce((a,b)=>{return a+resolveBooking(b).price;},0)};
  };
  const statsToday = useMemo(()=>statsFor(b=>b.date===todayStr),[bookings,masterObj,masters]);
  const statsWeek  = useMemo(()=>statsFor(b=>weekDates.map(fmtDate).includes(b.date)),[bookings,masterObj,weekDates,masters]);
  const statsAll   = useMemo(()=>statsFor(()=>true),[bookings,masterObj,masters]);

  // Compute total duration (mins + cleanup) for an array of serviceIds
  const totalDuration = (masterId, serviceIds) => {
    if (!serviceIds || !serviceIds.length) return 30;
    return serviceIds.reduce((sum, sid) => {
      const s = resolveSvc(masterId, sid);
      return sum + (s ? Number(s.mins) + Number(s.cleanup||0) : 0);
    }, 0) || 30;
  };

  // slot availability — works for both single and multi-service + blocks + salon schedule
  const getSlotStatus = (masterId, date, slotTime, serviceIds, excludeId) => {
    // Check salon closed / vacation
    if(isDateSalonClosed(date)) return "busy";
    // Check salon work hours
    const slotHm = timeToMins(slotTime);
    const salonStart = timeToMins(salonSchedule.workStart);
    const salonEnd = timeToMins(salonSchedule.workEnd);
    if(slotHm < salonStart || slotHm >= salonEnd) return "busy";
    // Check schedule blocks for this master (and salon-wide blocks)
    const blk = getBlocksForSlot(masterId, date, slotTime);
    if(blk.length > 0) return "busy";
    // Check existing bookings
    const ids = Array.isArray(serviceIds) ? serviceIds : (serviceIds ? [serviceIds] : []);
    const slotStart = timeToMins(slotTime);
    const dur = ids.length ? totalDuration(masterId, ids) : 30;
    const slotEnd = slotStart + dur;
    for (const b of bookings.filter(x=>String(x.masterId)===String(masterId)&&x.date===date&&x.status!=="cancelled"&&x.id!==excludeId)) {
      const bStart=timeToMins(b.time);
      const bIds=Array.isArray(b.serviceIds)?b.serviceIds:(b.serviceId?[b.serviceId]:[]);
      const bDur=bIds.length?totalDuration(masterId,bIds):30;
      const bEnd=bStart+bDur;
      if(slotStart<bEnd&&slotEnd>bStart) return "busy";
    }
    return "free";
  };

  // reviews helpers
  const getMasterRating = (masterId) => {
    const rs=reviews.filter(r=>String(r.masterId)===String(masterId));
    if(!rs.length) return {avg:0,count:0};
    return {avg:Math.round(rs.reduce((a,r)=>a+r.rating,0)/rs.length*10)/10, count:rs.length};
  };
  const getTopReviews = (masterId) =>
    reviews.filter(r => String(r.masterId)===String(masterId) && r.rating>=4 && r.showPublic!==false && r.text)
           .sort((a,b)=>b.rating-a.rating);

  const submitReview = async () => {
    if(!reviewForm.masterId||!reviewForm.text.trim()) return;
    const rev = {
      masterId:String(reviewForm.masterId),
      clientName:cur?.name||"Аноним",
      rating:reviewForm.rating,
      text:reviewForm.text.trim(),
      date:todayStr,
      showPublic:true,
      createdAt:new Date().toISOString()
    };
    try{ await addDoc(collection(fbDb,"reviews"), rev); }catch(e){
      setReviews(p=>[...p,{...rev,id:Date.now()}]);
    }
    setReviewDone(true);
    setTimeout(()=>{setReviewDone(false);setReviewForm({masterId:"",rating:5,text:""});},3000);
  };

  // ── SUBSCRIPTION VISIT HELPERS ───────────────────────────────────────────
  const monthKey = () => todayStr.slice(0,7); // "YYYY-MM"
  const getSubVisitsUsed = (email, subId) => subVisits[`${email}|${subId}|${monthKey()}`] || 0;
  const getSubVisitsLeft = (email, subId) => {
    const sub = subs.find(s=>s.id===subId);
    if (!sub) return 0;
    if (sub.visitsPerMonth === 0) return Infinity; // unlimited
    return Math.max(0, sub.visitsPerMonth - getSubVisitsUsed(email, subId));
  };
  const useSubVisit = (email, subId) => {
    const key = `${email}|${subId}|${monthKey()}`;
    setSubVisits(p=>({...p, [key]:(p[key]||0)+1}));
  };

  // auth
  const openAuth=(mode)=>{setAuthMode(mode);setAuthForm({name:"",email:"",phone:"",password:""});setAuthErr("");setModal("auth");};
  const doAuth=async()=>{
    setAuthErr("");
    if(authMode==="login"){
      // Owner — локальная проверка
      if(authForm.email===OWNER.email&&authForm.password===OWNER.password){
        try{ localStorage.setItem("barberhub_owner","true"); }catch(e){}
        setCur({...OWNER});setModal(null);setPage("owner");return;
      }
      // Мастер — поиск по email и паролю в Firestore masters
      const m=masters.find(m=>m.email===authForm.email&&m.password===authForm.password);
      if(m){
        const masterData = {...m, name:m.firstName, role:"master", sub:null, uid:String(m.id), id:String(m.id)};
        try{ localStorage.setItem("barberhub_master", JSON.stringify(masterData)); }catch(e){}
        setCur(masterData);
        setModal(null);return;
      }
      // Клиент — Firebase Auth
      try{
        const cred = await signInWithEmailAndPassword(fbAuth,authForm.email,authForm.password);
        const snap = await getDoc(doc(fbDb,"users",cred.user.uid));
        const userData = snap.exists()
          ? snap.data()
          : {name:cred.user.displayName||authForm.email,email:authForm.email,role:"client",sub:null};
        setCur({...userData,uid:cred.user.uid});
        setModal(null);
        if(pendingVisitReview&&pendingVisitReview.clientEmail===authForm.email){
          setVisitReview(pendingVisitReview);
          setVisitRating(5);setVisitText("");setVisitTip(null);setVisitCustomTip("");setVisitSubmitted(false);setVisitTipPaid(false);
          setPendingVisitReview(null);
        }
      }catch(e){
        if(e.code==="auth/invalid-credential"||e.code==="auth/user-not-found"||e.code==="auth/wrong-password")
          setAuthErr(t.err_wrong);
        else setAuthErr(e.message);
      }
    } else {
      if(!authForm.name||!authForm.email||!authForm.phone||!authForm.password||!authForm.confirmPassword) return setAuthErr(t.err_fill);
      if(authForm.password!==authForm.confirmPassword) return setAuthErr(lang==="ru"?"Пароли не совпадают":"Slaptažodžiai nesutampa");
      if(masters.find(m=>m.email===authForm.email)||authForm.email===OWNER.email) return setAuthErr(t.err_exists);
      try{
        const cred = await createUserWithEmailAndPassword(fbAuth,authForm.email,authForm.password);
        const userData = {name:authForm.name,email:authForm.email,phone:authForm.phone,role:"client",sub:null};
        await setDoc(doc(fbDb,"users",cred.user.uid),userData);
        setCur({...userData,uid:cred.user.uid});
        setModal(null);
      }catch(e){
        if(e.code==="auth/email-already-in-use") setAuthErr(t.err_exists);
        else setAuthErr(e.message);
      }
    }
  };
  const logout=async()=>{
    try{ localStorage.removeItem("barberhub_owner"); }catch(e){}
    try{ localStorage.removeItem("barberhub_master"); }catch(e){}
    try{ localStorage.removeItem("barberhub_page"); }catch(e){}
    try{ localStorage.removeItem("barberhub_mTab"); }catch(e){}
    try{ localStorage.removeItem("barberhub_ownerTab"); }catch(e){}
    try{ await signOut(fbAuth); }catch(e){}
    setCur(null);setPageRaw("home");
  };
  const goBook=()=>{if(!cur){openAuth("login");return;}setBkDone(false);setBkLoading(false);setPage("book");};
  const activateSub=(sid)=>{
    if(!cur){openAuth("login");return;}
    const u={...cur,sub:sid};setCur(u);setUsers(p=>p.map(x=>x.email===cur.email?{...x,sub:sid}:x));
  };
  const confirmBk=async()=>{
    const{services,master,date,time,payment}=bk;
    if(!services.length||!master||!date||!time||!payment) return;
    if(bkLoading) return;
    setBkLoading(true);
    setBkStatus("checking");

    const selM = masters.find(m=>String(m.id)===String(master));
    const svcNames = services.map(sid=>{
      const sv=(selM?.services||[]).find(s=>s.id===sid);
      return sv?(lang==="ru"?sv.name_ru:sv.name_lt):"";
    }).filter(Boolean).join(" + ");
    const dur = totalDuration(master, services);
    const slotStart = timeToMins(time);
    const slotEnd = slotStart + dur;

    // Создаём блокировку с уникальным ID для каждого слота
    // Один и тот же слот = один и тот же документ = только один запрос пройдёт
    const lockId = `${master}_${date}_${time.replace(":","")}_${dur}`;
    const lockRef = doc(fbDb, "slotLocks", lockId);

    try{
      await runTransaction(fbDb, async(tx)=>{
        const lockSnap = await tx.get(lockRef);

        // Если блокировка уже существует — слот занят
        if(lockSnap.exists()){
          throw new Error("SLOT_TAKEN");
        }

        // Дополнительно читаем существующие записи на этот день
        const bookingsSnap = await getDocs(query(
          collection(fbDb,"bookings"),
          where("masterId","==",String(master)),
          where("date","==",date)
        ));

        for(const d of bookingsSnap.docs){
          const b = d.data();
          if(b.status==="cancelled") continue;
          const bStart = timeToMins(b.time);
          const bIds = Array.isArray(b.serviceIds)?b.serviceIds:(b.serviceId?[b.serviceId]:[]);
          const bDur = bIds.length ? totalDuration(String(master), bIds) : 30;
          const bEnd = bStart + bDur;
          if(slotStart < bEnd && slotEnd > bStart) throw new Error("SLOT_TAKEN");
        }

        // Всё свободно — ставим блокировку и создаём запись
        const newBookingRef = doc(collection(fbDb,"bookings"));
        tx.set(lockRef,{
          masterId:String(master), date, time,
          clientEmail:cur.email,
          createdAt:new Date().toISOString(),
          bookingId:newBookingRef.id
        });
        tx.set(newBookingRef,{
          masterId: String(master),
          clientName: cur.name||"",
          clientPhone: cur.phone||"",
          clientEmail: cur.email||"",
          clientUid: cur.uid||"",
          serviceIds: services,
          serviceId: services[0],
          date, time,
          notes: "",
          status: "confirmed",
          payment,
          createdAt: new Date().toISOString()
        });
      });

      await addNotification("booked",
        `${cur.name} записался · ${date} ${time} · ${svcNames}`,
        master, true
      );
      // Telegram notification to master
      const tgMaster = masters.find(m=>String(m.id)===String(master));
      if(tgMaster?.telegram){
        await sendTelegramMessage(tgMaster.telegram,
          `🔔 <b>Новая запись!</b>\n👤 ${cur.name}\n📅 ${date} в ${time}\n✂️ ${svcNames}\n📞 ${cur.phone||"—"}`
        );
      }
      setBkStatus("success");
      soundEnabled&&playSuccessSound();
      setTimeout(()=>{ setBkDone(true); setBkStatus(null); }, 1500);

    } catch(e){
      if(e.message==="SLOT_TAKEN"){
        setBk(b=>({...b,time:null}));
      }
      setBkStatus("fail");
      soundEnabled&&playFailSound();
      setTimeout(()=>setBkStatus(null), 2500);
    }
    setBkLoading(false);
  };
  const openNewAppt=(slot)=>{
    setNewAppt({clientMode:"new",clientName:"",clientPhone:"",serviceIds:[],date:slot?fmtDate(slot.date):todayStr,time:slot?.time||"10:00",notes:""});
    setModal("newAppt");
  };
  const saveAppt=async()=>{
    const{clientName,clientPhone,serviceIds,date,time}=newAppt;
    if(!clientName||!serviceIds.length||!date||!time) return;
    soundEnabled&&playClickSound();
    const newBooking = {
      masterId: String(masterObj.id),
      clientName, clientPhone: clientPhone||"",
      clientEmail: "", clientUid: "",
      serviceIds, serviceId:serviceIds[0],
      date, time, notes:newAppt.notes||"",
      status:"confirmed", payment:"cash",
      createdAt: new Date().toISOString(),
      addedByMaster: true
    };
    try{
      await addDoc(collection(fbDb,"bookings"), newBooking);
    }catch(e){
      // Offline fallback
      setBookings(p=>[...p,{...newBooking,id:"local_"+Date.now()}]);
    }
    setModal(null);
  };
  const updateStatus=async(id,status)=>{
    setBookings(p=>p.map(b=>b.id===id?{...b,status}:b));
    setDetailAppt(a=>a?.id===id?{...a,status}:a);
    // Save status to Firestore
    try{ await updateDoc(doc(fbDb,"bookings",id),{status}); }catch(e){}

    if(status==="done"){
      const b=bookings.find(x=>x.id===id);
      if(b){
        const m=masters.find(x=>String(x.id)===String(b.masterId));
        const pending = {
          bookingId:id, masterId:b.masterId,
          masterObj:m, clientEmail:b.clientEmail,
          clientName:b.clientName, serviceIds:b.serviceIds||[b.serviceId]
        };
        // Save pending review to Firestore so client sees it on their device
        try{
          await setDoc(doc(fbDb,"pendingReviews",b.clientEmail.replace(/[.@]/g,"_")), {
            ...pending, masterObj:{
              id:m?.id, firstName:m?.firstName, lastName:m?.lastName,
              color:m?.color, emoji:m?.emoji, photo:m?.photo||""
            }
          });
        }catch(e){}

        // If client is currently logged in on same device — show immediately
        if(cur?.role==="client" && cur?.email===b.clientEmail){
          setVisitReview(pending);
          setVisitRating(5); setVisitText(""); setVisitTip(null);
          setVisitCustomTip(""); setVisitSubmitted(false); setVisitTipPaid(false);
        }
        addNotification(
          "booked",
          lang==="ru"?`Визит завершён · ${b.clientName}`:` Vizitas baigtas · ${b.clientName}`,
          b.masterId, true
        );
      }
    }
  };
  const deleteAppt=async(id)=>{
    soundEnabled&&playDeleteSound();
    const b=bookings.find(x=>x.id===id);
    if(!b) return;
    const cancelledBy = masterObj?.firstName || (isOwner ? "Владелец" : "");
    try{
      await updateDoc(doc(fbDb,"bookings",id),{
        status:"cancelled",
        cancelledBy,
        cancelledAt: new Date().toISOString()
      });
      // Удаляем блокировку слота чтобы время стало доступным снова
      const dur = totalDuration(String(b.masterId), b.serviceIds||[b.serviceId]);
      const lockId = `${b.masterId}_${b.date}_${(b.time||"").replace(":","")}_${dur}`;
      await deleteDoc(doc(fbDb,"slotLocks",lockId));
    }catch(e){}
    setBookings(p=>p.map(x=>x.id===id?{...x,status:"cancelled",cancelledBy}:x));
    setModal(null);
    setDetailAppt(null);
    addNotification("cancelled",
      `${lang==="ru"?"Запись отменена":"Rezervacija atšaukta"}: ${b.clientName} · ${b.date} ${b.time}`,
      b.masterId, true
    );
    // Notify master via Telegram if cancelled by owner/client
    if(!masterObj && b.clientEmail){
      const tgMaster = masters.find(m=>String(m.id)===String(b.masterId));
      if(tgMaster?.telegram){
        sendTelegramMessage(tgMaster.telegram,
          `❌ <b>Запись отменена</b>\n👤 ${b.clientName}\n📅 ${b.date} в ${b.time}`
        );
      }
    }
  };

  // Reschedule a booking to new date+time
  const rescheduleApptByMaster = async (id, newDate, newTime) => {
    soundEnabled&&playSuccessSound();
    setBookings(p => p.map(b => b.id===id ? {...b, date:newDate, time:newTime} : b));
    setDetailAppt(a => a?.id===id ? {...a, date:newDate, time:newTime} : a);
    try{ await updateDoc(doc(fbDb,"bookings",id),{date:newDate, time:newTime, rescheduledAt:new Date().toISOString()}); }catch(e){}
    setRescheduleAppt(null); setRescheduleDate(null); setRescheduleTime(null);
    setModal(null);
    const b2=bookings.find(x=>x.id===id);
    addNotification("rescheduled",
      `${lang==="ru"?"Запись перенесена":"Rezervacija perkelta"}: ${b2?.clientName||""} → ${newDate} ${newTime}`,
      b2?.masterId||null, true
    );
  };

  // Drop handler: move booking to new slot
  const handleDrop = async (targetDate, targetTime, explicitId) => {
    const activeId = explicitId || dragId;
    if (!activeId) return;
    const appt = bookings.find(b => b.id === activeId);
    if (!appt) return;
    const ids = Array.isArray(appt.serviceIds)?appt.serviceIds:(appt.serviceId?[appt.serviceId]:[]);
    if(getSlotStatus(appt.masterId, targetDate, targetTime, ids, activeId)==="free"){
      soundEnabled&&playSuccessSound();
      setBookings(p => p.map(b => b.id===activeId ? {...b, date:targetDate, time:targetTime} : b));
      if(detailAppt?.id===activeId) setDetailAppt(a=>({...a, date:targetDate, time:targetTime}));
      try{
        await updateDoc(doc(fbDb,"bookings",activeId),{
          date:targetDate, time:targetTime,
          rescheduledAt:new Date().toISOString()
        });
      }catch(e){}
    }
    setDragId(null); setDragOver(null);
  };
  const saveMasterProfile=async(data)=>{
    const updated = {...masterObj,...data};
    setMasters(p=>p.map(m=>m.id===masterObj.id?updated:m));
    if(data.firstName) setCur(c=>({...c,name:data.firstName}));
    try{
      if(masterObj._docId){
        await setDoc(doc(fbDb,"masters",masterObj._docId), updated);
        console.log("✅ saved to _docId:", masterObj._docId, "workStart:", updated.workStart);
      } else {
        const snap = await getDocs(query(collection(fbDb,"masters"), where("email","==",masterObj.email)));
        if(!snap.empty){
          await setDoc(snap.docs[0].ref, updated);
          console.log("✅ saved by email:", masterObj.email, "workStart:", updated.workStart);
        } else {
          await setDoc(doc(fbDb,"masters",String(masterObj.id)), updated);
          console.log("✅ saved by id:", masterObj.id, "workStart:", updated.workStart);
        }
      }
    }catch(e){ console.error("❌ saveMasterProfile error:", e); }
  };

  // Owner: create master
  const ownerCreateMaster = async () => {
    const f = ownerMasterForm;
    if(!f.firstName||!f.lastName||!f.email||!f.password) return setOwnerFormErr(t.err_fill);
    if(masters.find(m=>m.email===f.email)||f.email===OWNER.email) return setOwnerFormErr(t.owner_master_exists);
    const newMaster = {
      id: Date.now(), email:f.email, password:f.password,
      firstName:f.firstName, lastName:f.lastName,
      role_ru:f.role_ru||"Мастер", role_lt:f.role_lt||"Meistras",
      photo:"", emoji:f.emoji||"✂️", color:f.color||"#e8650a",
      phone:"", about_ru:"", about_lt:"", experience:"", instagram:"", telegram:"",
      workStart:"09:00", workEnd:"20:00",
      services:[
        { id:`s${Date.now()}_1`, name_ru:"Классическая стрижка", name_lt:"Klasikinis kirpimas", price:25, mins:45, cleanup:10, enabled:true },
      ],
    };
    setMasters(p=>[...p,newMaster]);
    setOwnerMasterForm({firstName:"",lastName:"",email:"",password:"",role_ru:"",role_lt:"",color:"#e8650a",emoji:"✂️"});
    setOwnerFormOpen(false); setOwnerFormErr("");
    // Save to Firestore using id as document key
    try{ await setDoc(doc(fbDb,"masters",String(newMaster.id)), newMaster); }catch(e){ console.error(e); }
  };

  // Owner: save edited master
  const ownerSaveMaster = async () => {
    const f = ownerMasterForm;
    if(!f.firstName||!f.lastName||!f.email||!f.password) return setOwnerFormErr(t.err_fill);
    const conflict = masters.find(m=>m.email===f.email&&m.id!==ownerMasterEdit);
    if(conflict||f.email===OWNER.email) return setOwnerFormErr(t.owner_master_exists);
    const updatedMaster = masters.find(m=>m.id===ownerMasterEdit);
    const merged = {...updatedMaster,...f};
    setMasters(p=>p.map(m=>m.id===ownerMasterEdit?merged:m));
    setOwnerMasterEdit(null); setOwnerFormOpen(false); setOwnerFormErr("");
    try{
      const docId = updatedMaster?._docId || String(ownerMasterEdit);
      await setDoc(doc(fbDb,"masters",docId), merged);
    }catch(e){}
  };

  // Owner: delete master
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [ownerCalWeek, setOwnerCalWeek] = useState(new Date());
  const [ownerCalZoom, setOwnerCalZoom] = useState(32);
  const [ownerCalFilter, setOwnerCalFilter] = useState(null);
  const [ownerSelDay, setOwnerSelDay] = useState(todayStr);
  const [statsMaster, setStatsMaster] = useState(null);
  const [statsPeriod, setStatsPeriod] = useState("month");
  const [statsDay, setStatsDay] = useState(todayStr);
  const [statsMonth, setStatsMonth] = useState(todayStr.slice(0,7));
  const [statsYear, setStatsYear] = useState(String(new Date().getFullYear()));
  const ownerDeleteMaster = async (id) => {
    if(confirmDeleteId!==id){ setConfirmDeleteId(id); setTimeout(()=>setConfirmDeleteId(null),3000); return; }
    setConfirmDeleteId(null);
    const mToDelete = masters.find(m=>m.id===id);
    setMasters(p=>p.filter(m=>m.id!==id));
    try{
      const docId = mToDelete?._docId || String(id);
      await deleteDoc(doc(fbDb,"masters",docId));
    }catch(e){}
  };

  // Owner: open edit form
  const ownerOpenEdit = (master) => {
    setOwnerMasterForm({
      firstName:master.firstName, lastName:master.lastName,
      email:master.email, password:master.password,
      role_ru:master.role_ru, role_lt:master.role_lt,
      color:master.color, emoji:master.emoji,
    });
    setOwnerMasterEdit(master.id);
    setOwnerFormOpen(true); setOwnerFormErr("");
  };

  // Validate and correct page based on user role after auth restore
  useEffect(()=>{
    if(fbLoading) return;
    if(!cur){ 
      // Not logged in — only allow public pages
      if(["master","owner","my","book","profile"].includes(page)) setPage("home");
      return;
    }
    if(cur.role==="master"){
      // Master should be on master page
      if(["my","owner"].includes(page)) setPage("master");
    } else if(cur.role==="owner"){
      if(["my","master"].includes(page)) setPage("owner");
    } else {
      // Client — not on master/owner pages
      if(["master","owner"].includes(page)) setPage("home");
    }
  },[fbLoading, cur?.role]);

  const mc = masterObj?.color||"var(--or)";

  // Wait for Firebase to restore session before rendering
  if(fbLoading) return (
    <div style={{
      minHeight:"100vh", background:"#0e0a06",
      display:"flex", alignItems:"center", justifyContent:"center",
      flexDirection:"column", gap:12
    }}>
      <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:42,letterSpacing:6,color:"#e8650a"}}>BARBER HUB</div>
      <div style={{
        width:40, height:40, borderRadius:"50%",
        border:"3px solid #e8650a", borderTopColor:"transparent",
        animation:"spin 0.8s linear infinite"
      }}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  return (
    <>
      <style>{CSS}</style>
      <div>
        {/* NAV */}
        <nav className="nav">
          <div className="logo" onClick={()=>{setPage("home");setNavOpen(false);}}><b>BARBER</b> HUB</div>
          {/* Burger button — opens owner drawer for owner, nav drawer for others */}
          <button className="nav-burger" onClick={e=>{e.preventDefault();e.stopPropagation();isOwner ? setOwnerDrawerOpen(true) : setNavOpen(true);}}>☰</button>
          <div className="nav-mid nav-links">
            <button className={`nl${page==="home"?" on":""}`} onClick={()=>setPage("home")}>{t.home}</button>
            <button className="nl" onClick={()=>{setPage("home");setTimeout(()=>document.getElementById("svcs")?.scrollIntoView({behavior:"smooth"}),80);}}>{t.services}</button>
            <button className="nl" onClick={()=>{setPage("home");setTimeout(()=>document.getElementById("msts")?.scrollIntoView({behavior:"smooth"}),80);}}>{t.masters}</button>
            <button className={`nl g${page==="sub"?" on":""}`} onClick={()=>setPage("sub")}>{t.subscription}</button>
            {cur&&!masterObj&&!isOwner&&<button className={`nl${page==="my"?" on":""}`} onClick={()=>setPage("my")}>{t.my_bookings}</button>}
            {masterObj&&<button className={`nl${page==="master"?" on":""}`} onClick={()=>setPage("master")}>{t.master_cab}</button>}
            {isOwner&&<button className={`nl${page==="owner"?" on":""}`} style={page==="owner"?{color:"var(--gold)",background:"rgba(245,158,11,.1)"}:{color:"var(--gold)"}} onClick={()=>setPage("owner")}>👑 {t.owner_panel}</button>}
          </div>
          <div className="nav-r">
            <div className="lang">
              <button className={`lb${lang==="ru"?" on":""}`} onClick={()=>setLang("ru")}>RU</button>
              <button className={`lb${lang==="lt"?" on":""}`} onClick={()=>setLang("lt")}>LT</button>
            </div>
            {cur?(
              <>
                <div className="ubar" onClick={()=>!masterObj&&!isOwner&&setPage("profile")}
                  style={{cursor:!masterObj&&!isOwner?"pointer":"default"}}>
                  <div className="udot" style={{ background:isOwner?"var(--gold)":masterObj?mc:"var(--gr)" }}/>
                  <span className="uname">{cur.name}</span>
                </div>
                {!masterObj&&!isOwner&&<button className="btn b-or b-sm" onClick={goBook}>{t.book_btn}</button>}
                {(masterObj||isOwner)&&(
                  <div style={{position:"relative",zIndex:150}}>
                    <button className="notif-bell" style={{zIndex:150,position:"relative"}} onClick={e=>{e.preventDefault();e.stopPropagation();soundEnabled&&playNotifSound();setShowNotifs(p=>!p);}} title={t.notif_title}>
                      🔔{unreadCount>0&&<div className="notif-dot"/>}
                    </button>
                  </div>
                )}
                <button className="btn b-ghost b-sm logout-btn" onClick={logout}>{t.logout}</button>
              </>
            ):(
              <>
                <button className="btn b-ghost b-sm" onClick={()=>openAuth("login")}>{t.login}</button>
                <button className="btn b-or b-sm" onClick={()=>openAuth("register")}>{t.register}</button>
              </>
            )}
          </div>
        </nav>
        {/* MOBILE DRAWER */}
        {navOpen&&<>
          <div className="drawer-overlay" onClick={()=>setNavOpen(false)}/>
          <div className="drawer">
            <button className="drawer-close" onClick={()=>setNavOpen(false)}>✕</button>
            <div className="lang-mobile">
              <button className={`lb${lang==="ru"?" on":""}`} onClick={()=>setLang("ru")}>RU</button>
              <button className={`lb${lang==="lt"?" on":""}`} onClick={()=>setLang("lt")}>LT</button>
            </div>
            <button className={`nl${page==="home"?" on":""}`} onClick={()=>{setPage("home");setNavOpen(false);}}>{t.home}</button>
            <button className="nl" onClick={()=>{setPage("home");setNavOpen(false);setTimeout(()=>document.getElementById("svcs")?.scrollIntoView({behavior:"smooth"}),100);}}>{t.services}</button>
            <button className="nl" onClick={()=>{setPage("home");setNavOpen(false);setTimeout(()=>document.getElementById("msts")?.scrollIntoView({behavior:"smooth"}),100);}}>{t.masters}</button>
            <button className={`nl${page==="sub"?" on":""}`} onClick={()=>{setPage("sub");setNavOpen(false);}}>{t.subscription}</button>
            {cur&&!masterObj&&!isOwner&&<button className={`nl${page==="my"?" on":""}`} onClick={()=>{setPage("my");setNavOpen(false);}}>{t.my_bookings}</button>}
            {masterObj&&<button className={`nl${page==="master"?" on":""}`} onClick={()=>{setPage("master");setNavOpen(false);}}>{t.master_cab}</button>}
            {isOwner&&<button className={`nl${page==="owner"?" on":""}`} style={{color:"var(--gold)"}} onClick={()=>{setPage("owner");setNavOpen(false);}}>👑 {t.owner_panel}</button>}
            {/* Social links */}
            <div style={{borderTop:"1px solid var(--border)",marginTop:10,paddingTop:10}}>
              {salonInfo.phone&&<a href={`tel:${salonInfo.phone}`} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 0",color:"var(--wh)",textDecoration:"none",fontSize:14}}>📞 {salonInfo.phone}</a>}
              {salonInfo.instagram&&<a href={`https://instagram.com/${salonInfo.instagram.replace("@","")}`} target="_blank" rel="noreferrer" style={{display:"flex",alignItems:"center",gap:10,padding:"10px 0",color:"var(--wh)",textDecoration:"none",fontSize:14}}>📸 {salonInfo.instagram}</a>}
              {salonInfo.facebook&&<a href={salonInfo.facebook.startsWith("http")?salonInfo.facebook:`https://facebook.com/${salonInfo.facebook}`} target="_blank" rel="noreferrer" style={{display:"flex",alignItems:"center",gap:10,padding:"10px 0",color:"var(--wh)",textDecoration:"none",fontSize:14}}>👍 Facebook</a>}
              {salonInfo.address&&<a href={salonInfo.mapUrl||`https://maps.google.com/?q=${encodeURIComponent(salonInfo.address)}`} target="_blank" rel="noreferrer" style={{display:"flex",alignItems:"center",gap:10,padding:"10px 0",color:"var(--wh)",textDecoration:"none",fontSize:14}}>📍 {salonInfo.address}</a>}
              {courses.length>0&&<button className="nl" style={{padding:"10px 0",textAlign:"left",width:"100%",fontSize:14}} onClick={()=>{setPage("courses");setNavOpen(false);}}>🎓 {lang==="ru"?"Обучение":"Mokymai"}</button>}
            </div>
            {cur&&!masterObj&&!isOwner&&<>
              <button className="btn b-card b-full" style={{marginTop:8}} onClick={()=>{setPage("profile");setNavOpen(false);}}>
                👤 {lang==="ru"?"Мой профиль":"Mano profilis"}
              </button>
              <button className="btn b-ghost b-full" style={{marginTop:6,color:"var(--red)"}} onClick={()=>{logout();setNavOpen(false);}}>
                🚪 {lang==="ru"?"Выйти":"Atsijungti"}
              </button>
            </>}
            {!cur&&<><button className="btn b-ghost" style={{marginTop:8}} onClick={()=>{openAuth("login");setNavOpen(false);}}>{t.login}</button>
            <button className="btn b-or" style={{marginTop:6}} onClick={()=>{openAuth("register");setNavOpen(false);}}>{t.register}</button></>}
          </div>
        </>}


        {/* HOME */}
        {page==="home"&&<>
          <section className="hero">
            <div className="hbg"/><div className="hwm">HUB</div>
            <div className="htag">{lang==="ru"?salonInfo.tagRu:salonInfo.tagLt}</div>
            <h1 className="htitle"><span>BARBER</span><br/>HUB</h1>
            <div className="hline"/>
            <p className="hsub">{t.hero_sub}</p>
            <div className="hacts">
              <button className="btn b-or b-lg" onClick={goBook}>{t.hero_cta}</button>
              <button className="btn b-ghost b-lg" onClick={()=>document.getElementById("svcs")?.scrollIntoView({behavior:"smooth"})}>{t.hero_services}</button>
            </div>
            <div className="hstats">
              {(()=>{
                // Total bookings count
                const totalBookings = bookings.filter(b=>b.status!=="cancelled").length;
                // Time since September 2024
                const startDate = new Date(2024, 8, 1);
                const now = new Date();
                const totalMonths = (now.getFullYear()-startDate.getFullYear())*12 + (now.getMonth()-startDate.getMonth());
                const years = Math.floor(totalMonths/12);
                const months = totalMonths % 12;
                let timeLabel, timeUnit;
                if(years === 0){
                  timeLabel = totalMonths;
                  timeUnit = lang==="ru"?"мес.":"mėn.";
                } else if(months === 0){
                  timeLabel = years;
                  timeUnit = lang==="ru"?(years===1?"год":years<5?"года":"лет"):"metai";
                } else {
                  timeLabel = `${years}.${months}`;
                  timeUnit = lang==="ru"?"лет":"metai";
                }
                return(<>
                  <div><div className="snum">{totalBookings}</div><div className="slbl">{t.clients}</div></div>
                  <div><div className="snum">{timeLabel}</div><div className="slbl">{timeUnit}</div></div>
                  <div><div className="snum">{masters.length}</div><div className="slbl">{t.masters_count}</div></div>
                </>);
              })()}
            </div>
          </section>
          <div className="divider"/>
          <section className="sec" id="svcs">
            <div className="stag">{t.services_tag}</div>
            <h2 className="stitle">{t.services_title}</h2>
            {(()=>{
              // Collect all unique services with booking count
              const serviceStats = {};
              bookings.filter(b=>b.status!=="cancelled").forEach(b=>{
                const ids = Array.isArray(b.serviceIds)?b.serviceIds:(b.serviceId?[b.serviceId]:[]);
                ids.forEach(id=>{ serviceStats[id]=(serviceStats[id]||0)+1; });
              });

              const allServices = [];
              const seen = new Set();
              masters.forEach(m=>{
                (m.services||[]).filter(s=>s.enabled!==false).forEach(s=>{
                  const key=(lang==="ru"?s.name_ru:s.name_lt)||s.name||"";
                  if(key&&!seen.has(key)){
                    seen.add(key);
                    allServices.push({
                      ...s,
                      masterColor:m.color,
                      masterId:m.id,
                      bookCount:serviceStats[s.id]||0
                    });
                  }
                });
              });

              if(allServices.length===0) return(
                <div style={{color:"var(--mu)",fontSize:14,padding:"20px 0"}}>
                  {lang==="ru"?"Услуги скоро появятся":"Paslaugos netrukus atsiras"}
                </div>
              );

              // Sort: least booked first (show as "popular" to boost them)
              const sorted = [...allServices].sort((a,b)=>a.bookCount-b.bookCount);

              return(
                <div className="svc-carousel">
                  {sorted.map((s,i)=>(
                    <div key={i} className="svc-carousel-item" style={{borderTopColor:s.masterColor}}>
                      {/* Top accent line */}
                      <div style={{position:"absolute",top:0,left:0,right:0,height:3,background:s.masterColor,borderRadius:"14px 14px 0 0"}}/>
                      {/* Popular badge */}
                      <div className="svc-rank">
                        {i===0?(lang==="ru"?"🔥 ХИТ":"🔥 HIT"):i<3?(lang==="ru"?"⭐ ТОП":"⭐ TOP"):(lang==="ru"?"✓ ПОПУЛЯРНО":"✓ POPULIARU")}
                      </div>
                      <div style={{marginTop:8}}>
                        <div className="sn" style={{fontSize:16,marginBottom:8}}>{lang==="ru"?s.name_ru:s.name_lt}</div>
                        <div style={{fontSize:12,color:"var(--mu2)",marginBottom:14}}>⏱ {s.mins} {t.min}</div>
                        <div className="sm">
                          <div className="sp" style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:22}}>{s.price}€</div>
                          <button className="btn b-or b-sm" onClick={()=>{
                            setBk(b=>({...b,master:s.masterId,services:[s.id]}));
                            goBook();
                          }}>{t.book_btn}</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
          </section>
          <div className="divider"/>
          <section className="sec" id="msts">
            <div className="stag">{t.masters_tag}</div>
            <h2 className="stitle">{t.masters_title}</h2>
            <div className="m-grid">
              {masters.map(m=>{
                const{avg,count}=getMasterRating(m.id);
                const fullName=`${m.firstName} ${m.lastName}`.trim();
                return(
                  <div key={m.id} className="m-card" style={{borderColor:m.color+"33",cursor:"pointer"}} onClick={()=>setSelectedMaster(m)}>
                    <div style={{position:"absolute",top:0,left:0,right:0,height:3,background:m.color,borderRadius:"14px 14px 0 0"}}/>
                    <div className="m-av" style={{background:m.color+"22",borderColor:m.color}}>
                      {m.photo?<img src={m.photo} alt={fullName} onError={e=>e.target.style.display="none"}/>:<span>{m.emoji}</span>}
                    </div>
                    <div className="m-name">{fullName}</div>
                    <div className="m-spec">{lang==="ru"?m.role_ru:m.role_lt}</div>
                    {count>0&&(
                      <div style={{display:"flex",alignItems:"center",gap:5,justifyContent:"center",marginBottom:7}}>
                        <StarRow rating={Math.round(avg)} size={12}/>
                        <span style={{fontSize:12,fontWeight:800,color:"var(--gold)"}}>{avg}</span>
                        <span style={{fontSize:10,color:"var(--mu)"}}>({count})</span>
                      </div>
                    )}
                    {(lang==="ru"?m.about_ru:m.about_lt)&&<div className="m-about">{(lang==="ru"?m.about_ru:m.about_lt).slice(0,90)}...</div>}
                    {m.experience&&<div className="m-exp" style={{background:m.color+"20",color:m.color}}>{m.experience} {t.exp_years}</div>}
                    {m.workStart&&m.workEnd&&<div className="m-hours">🕐 {m.workStart}–{m.workEnd}</div>}
                    {m.instagram&&<div className="m-ig">{m.instagram}</div>}
                    <button className="btn b-sm" style={{background:m.color,color:"var(--bg)",marginTop:10}} onClick={goBook}>{t.book_btn}</button>
                  </div>
                );
              })}
            </div>
          </section>

          {/* DISCOUNT BANNERS — показываются только если мастер включил акцию */}
          {masters.some(m=>m.discount?.enabled)&&<>
            <div className="divider"/>
            <section className="sec" id="discounts">
              <div className="stag" style={{color:"var(--red)"}}>🏷️ {lang==="ru"?"Акции и скидки":"Akcijos ir nuolaidos"}</div>
              <h2 className="stitle">{lang==="ru"?"СЕЙЧАС ВЫГОДНО":"DABAR NAUDINGA"}</h2>
              <div className="disc-grid">
                {masters.filter(m=>m.discount?.enabled&&m.discount?.percent>0).map(m=>{
                  const d=m.discount;
                  const label=lang==="ru"?d.label_ru:d.label_lt;
                  return(
                    <div key={m.id} className="disc-banner" style={{background:`linear-gradient(135deg,${m.color},${m.color}99)`}} onClick={goBook}>
                      <div style={{position:"absolute",right:-8,top:-8,fontFamily:"'Bebas Neue',sans-serif",fontSize:110,color:"rgba(255,255,255,.08)",lineHeight:1,pointerEvents:"none"}}>%</div>
                      <div className="disc-badge-pill">{t.discount_badge}</div>
                      <div className="disc-pct">−{d.percent}%</div>
                      <div className="disc-label">{label||`${d.percent}% ${t.discount_off}`}</div>
                      <div className="disc-master">
                        <span style={{fontSize:16}}>{m.emoji}</span>
                        <span>{m.firstName} {m.lastName}</span>
                        <span style={{opacity:.7}}>· {lang==="ru"?m.role_ru:m.role_lt}</span>
                      </div>
                      {/* Price examples */}
                      <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:12}}>
                        {(m.services||[]).filter(s=>s.enabled).slice(0,3).map(s=>{
                          const orig=Number(s.price);
                          const disc=Math.round(orig*(1-d.percent/100));
                          return(
                            <div key={s.id} style={{background:"rgba(255,255,255,.18)",borderRadius:20,padding:"2px 9px",fontSize:11,color:"#fff",fontWeight:700}}>
                              {lang==="ru"?s.name_ru:s.name_lt}: <s style={{opacity:.65}}>{orig}€</s> <strong>{disc}€</strong>
                            </div>
                          );
                        })}
                      </div>
                      <button className="disc-book">{t.discount_book_now} →</button>
                      {d.expires&&<div className="disc-exp">⏱ {lang==="ru"?"До":"Iki"} {new Date(d.expires).toLocaleDateString(lang==="ru"?"ru-RU":"lt-LT",{day:"numeric",month:"long"})}</div>}
                    </div>
                  );
                })}
              </div>
            </section>
          </>}
          <div className="divider"/>

          {/* PRODUCTS SECTION */}
          {products.length>0&&(
            <>
              <section className="sec" id="shop">
                <div className="stag" style={{color:"var(--gr)"}}>🛍️ {lang==="ru"?"Наша продукция":"Mūsų produkcija"}</div>
                <h2 className="stitle">{lang==="ru"?"ПРОДУКТЫ":"PRODUKTAI"}</h2>

                {/* Carousel */}
                <div style={{display:"flex",gap:12,overflowX:"auto",scrollSnapType:"x mandatory",WebkitOverflowScrolling:"touch",paddingBottom:8,scrollbarWidth:"none"}}>
                  {products.map(p=>(
                    <div key={p.id} style={{flexShrink:0,width:180,scrollSnapAlign:"start",background:"var(--card)",border:"1px solid var(--b2)",borderRadius:14,overflow:"hidden",cursor:"pointer"}}
                      onClick={()=>setSelectedProduct(p)}>
                      {p.photo
                        ?<img src={p.photo} alt={p.name} style={{width:"100%",height:160,objectFit:"cover"}}/>
                        :<div style={{height:120,background:"var(--card2)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:40}}>🧴</div>
                      }
                      <div style={{padding:"10px 12px"}}>
                        {p.category&&<div style={{fontSize:10,color:"var(--gr)",fontWeight:700,marginBottom:3}}>{p.category}</div>}
                        <div style={{fontWeight:700,fontSize:13,marginBottom:4}}>{p.name}</div>
                        {p.price>0&&<div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:18,color:"var(--gr)"}}>{p.price}€</div>}
                        <button className="btn b-sm" style={{marginTop:6,width:"100%",background:"var(--gr)",color:"#fff",fontWeight:700}}
                          onClick={e=>{e.stopPropagation();setSelectedProduct(p);}}>
                          {lang==="ru"?"Подробнее":"Plačiau"}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
              <div className="divider"/>
            </>
          )}

          {/* REVIEWS SECTION */}
          <section className="sec" id="reviews">
            <div className="stag g">⭐ {t.reviews_tag}</div>
            <h2 className="stitle">{t.reviews_title}</h2>

            {/* Master ratings row */}
            <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:32}}>
              {masters.map(m=>{
                const{avg,count}=getMasterRating(m.id);
                return(
                  <div key={m.id} className="master-rating-row" style={{borderColor:m.color+"44",flex:1,minWidth:180}}>
                    <div style={{width:38,height:38,borderRadius:"50%",background:m.color+"22",border:`2px solid ${m.color}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>
                      {m.photo?<img src={m.photo} alt="" style={{width:"100%",height:"100%",objectFit:"cover",borderRadius:"50%"}} onError={e=>e.target.style.display="none"}/>:m.emoji}
                    </div>
                    <div className="mr-info">
                      <div className="mr-name">{m.firstName}</div>
                      <StarRow rating={Math.round(avg)} size={10}/>
                      <div className="mr-sub">{count} {t.reviews_count}</div>
                    </div>
                    <div style={{textAlign:"right"}}>
                      <div className="mr-score-num" style={{color:m.color}}>{count>0?avg:"—"}</div>
                      <div className="mr-score-lbl">{t.out_of_5}</div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Best reviews CAROUSEL */}
            <div style={{fontSize:11,color:"var(--mu)",marginBottom:16,display:"flex",alignItems:"center",gap:5}}>
              <span style={{color:"var(--gold)"}}>★★★★★</span> {t.review_best}
            </div>
            {(()=>{
              const topRevs = masters
                .flatMap(m=>getTopReviews(m.id).slice(0,2).map(r=>({...r,master:m})))
                .sort((a,b)=>b.rating-a.rating||new Date(b.date)-new Date(a.date))
                .slice(0,8);
              if(!topRevs.length) return null;
              return(
                <div style={{
                  display:"flex",
                  gap:14,
                  overflowX:"auto",
                  scrollSnapType:"x mandatory",
                  WebkitOverflowScrolling:"touch",
                  paddingBottom:12,
                  scrollbarWidth:"none",
                  msOverflowStyle:"none",
                }}>
                  {topRevs.map(r=>(
                    <div key={r.id} style={{
                      flex:"0 0 min(300px, 82vw)",
                      scrollSnapAlign:"start",
                    }}>
                      <div className="rev-card" style={{borderColor:r.master.color+"33",height:"100%"}}>
                        <div style={{position:"absolute",top:0,left:0,right:0,height:3,background:r.master.color,borderRadius:"12px 12px 0 0"}}/>
                        <div className="rev-top">
                          <div className="rev-avatar" style={{background:r.master.color+"22",color:r.master.color}}>{r.clientName[0]}</div>
                          <div>
                            <div className="rev-author">{r.clientName}</div>
                            <div className="rev-meta">{new Date(r.date).toLocaleDateString(lang==="ru"?"ru-RU":"lt-LT",{day:"numeric",month:"long"})}</div>
                          </div>
                        </div>
                        <StarRow rating={r.rating} size={14}/>
                        <div className="rev-text">"{r.text}"</div>
                        <div className="rev-mbadge" style={{background:r.master.color+"18",color:r.master.color}}>
                          {r.master.emoji} {r.master.firstName} {r.master.lastName}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}

            {/* Write review */}
            <div style={{marginTop:40}}>
              <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:26,letterSpacing:1,marginBottom:6}}>{t.review_write}</div>
              {!cur?(
                <div style={{padding:"13px 16px",background:"var(--card)",border:"1px solid var(--b2)",borderRadius:9,fontSize:13,color:"var(--mu2)"}}>🔒 {t.review_login}</div>
              ):reviewDone?(
                <div style={{padding:"14px 18px",background:"var(--grd)",border:"1px solid var(--gr)",borderRadius:9,fontSize:13,color:"var(--gr)",fontWeight:700}}>{t.review_submitted}</div>
              ):(
                <div style={{background:"var(--card)",border:"1px solid var(--b2)",borderRadius:12,padding:22,maxWidth:500}}>
                  <div className="field">
                    <label>{t.review_master}</label>
                    <select value={reviewForm.masterId} onChange={e=>setReviewForm(f=>({...f,masterId:e.target.value}))}>
                      <option value="">— {lang==="ru"?"Выберите мастера":"Pasirinkite meistrą"}</option>
                      {masters.map(m=><option key={m.id} value={m.id}>{m.firstName} {m.lastName}</option>)}
                    </select>
                  </div>
                  <div className="field">
                    <label>{t.review_rating}</label>
                    <div style={{display:"flex",gap:5,marginTop:2}}>
                      {[1,2,3,4,5].map(n=>(
                        <button key={n} onClick={()=>setReviewForm(f=>({...f,rating:n}))} style={{background:"none",border:"none",cursor:"pointer",padding:2,fontSize:26,color:n<=reviewForm.rating?"var(--gold)":"var(--border)",lineHeight:1}}>★</button>
                      ))}
                      <span style={{alignSelf:"center",fontSize:12,fontWeight:800,color:"var(--gold)",marginLeft:4}}>{reviewForm.rating}/5</span>
                    </div>
                  </div>
                  <div className="field">
                    <label>{t.review_text}</label>
                    <textarea value={reviewForm.text} onChange={e=>setReviewForm(f=>({...f,text:e.target.value}))} placeholder={t.review_text_ph} style={{width:"100%",minHeight:90,padding:"10px 12px",background:"var(--card2)",border:"1px solid var(--b2)",borderRadius:8,color:"var(--wh)",fontFamily:"'Syne',sans-serif",fontSize:13,outline:"none",resize:"vertical",lineHeight:1.6}}/>
                  </div>
                  <button className="btn b-or b-full" onClick={submitReview}>{t.review_submit}</button>
                </div>
              )}
            </div>
          </section>
        </>}

        {/* SUBSCRIPTION */}
        {page==="sub"&&(
          <section className="sec">
            <div className="stag g">{t.sub_tag}</div>
            <h2 className="stitle">{t.sub_title}</h2>
            <p style={{color:"var(--mu2)",fontSize:14,marginBottom:28,maxWidth:460,lineHeight:1.7}}>{t.sub_desc}</p>
            {cur?.sub&&<div style={{marginBottom:22,padding:"9px 14px",background:"var(--grd)",border:"1px solid var(--gr)",borderRadius:8,fontSize:12,color:"var(--gr)",fontWeight:700}}>{t.sub_my}: {cur.sub.toUpperCase()} — {t.sub_active}</div>}
            <div className="sub-grid">
              {subs.map(s=>(
                <div key={s.id} className={`sub-card${s.popular?" pop":""}${cur?.sub===s.id?" act":""}`}>
                  {s.popular&&<div className="sub-badge">{t.sub_popular}</div>}
                  <div className="sub-name">{s.name}</div>
                  <div className="sub-price"><span className="sub-num">{s.price}€</span><span className="sub-unit">{t.sub_per_month}</span></div>
                  <ul className="sub-perks">{(lang==="ru"?s.perks_ru:s.perks_lt).map((p,i)=><li key={i}>{p}</li>)}</ul>
                  <button className={`btn b-full${s.popular?" b-gr":" b-or"}`} onClick={()=>activateSub(s.id)}>{cur?.sub===s.id?t.sub_active:t.sub_activate}</button>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* BOOKING */}
        {page==="book"&&!bkDone&&(
          <section className="sec">
            <div className="stag">{t.book_online}</div>
            <h2 className="stitle">{t.book_online.toUpperCase()}</h2>

            {/* STEP 2: Master first */}
            <div className="stag" style={{marginBottom:10}}>{t.step2}</div>
            <div className="m-grid" style={{marginBottom:32}}>
              {masters.map(m=>{
                const fullName=`${m.firstName} ${m.lastName}`.trim();
                return(
                  <div key={m.id} className={`m-card${String(bk.master)===String(m.id)?" sel":""}`}
                    style={String(bk.master)===String(m.id)?{borderColor:m.color,borderWidth:2}:{}}
                    onClick={()=>setBk(b=>({...b,master:m.id,services:[],time:null}))}>
                    <div className="m-av" style={{background:m.color+"22",borderColor:m.color}}>
                      {m.photo?<img src={m.photo} alt={fullName} onError={e=>e.target.style.display="none"}/>:<span>{m.emoji}</span>}
                    </div>
                    <div className="m-name">{fullName}</div>
                    <div className="m-spec">{lang==="ru"?m.role_ru:m.role_lt}</div>
                    {bk.master===m.id&&<span className="badge bor" style={{marginTop:6}}>{t.selected}</span>}
                  </div>
                );
              })}
            </div>

            {/* STEP 1: Multi-service selection */}
            {bk.master&&(()=>{
              const m=masters.find(x=>String(x.id)===String(bk.master));
              const avail=(m?.services||[]).filter(s=>s.enabled);
              const selIds=bk.services||[];
              const ttlMins=selIds.reduce((s,sid)=>{const sv=avail.find(x=>x.id===sid);return s+(sv?(Number(sv.mins)+Number(sv.cleanup||0)):0);},0);
              const ttlPrice=selIds.reduce((s,sid)=>{const sv=avail.find(x=>x.id===sid);return s+(sv?Number(sv.price):0);},0);
              const toggle=(id)=>{
                setBk(b=>{
                  const newIds=b.services.includes(id)?b.services.filter(x=>x!==id):[...b.services,id];
                  if(newIds.length>0) scrollToBkStep("bk-step-date");
                  return {...b,services:newIds,time:null};
                });
              };
              return(<>
                <div id="bk-step-service" className="stag" style={{marginBottom:8}}>{t.step1}</div>
                <p style={{fontSize:11,color:"var(--mu2)",marginBottom:14}}>
                  {lang==="ru"?"Выберите одну или несколько услуг — они записываются одним блоком":"Pasirinkite vieną ar kelias paslaugas — jos užregistruojamos vienu bloku"}
                </p>
                <div className="svc-grid" style={{marginBottom:12}}>
                  {avail.map(s=>{
                    const sel=selIds.includes(s.id);
                    return(
                      <div key={s.id} className={`svc-card${sel?" sel":""}`} onClick={()=>toggle(s.id)} style={{cursor:"pointer",position:"relative"}}>
                        <div style={{position:"absolute",top:10,right:10,width:20,height:20,borderRadius:5,border:`2px solid ${sel?m.color:"var(--b2)"}`,background:sel?m.color:"transparent",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,color:"#fff",fontWeight:900,transition:"all .18s"}}>{sel?"✓":""}</div>
                        <div className="sn" style={{paddingRight:28}}>{lang==="ru"?s.name_ru:s.name_lt}</div>
                        <div className="sd">⏱ {s.mins} {t.min} · 🧹 +{s.cleanup} {t.min}</div>
                        <div className="sm"><div className="sp">{s.price}€</div></div>
                      </div>
                    );
                  })}
                </div>
                {selIds.length>0&&(
                  <div style={{display:"flex",gap:16,alignItems:"center",flexWrap:"wrap",padding:"12px 16px",background:"var(--card)",borderRadius:10,border:`1px solid ${m.color}55`,marginBottom:24}}>
                    <div style={{flex:1}}>
                      <div style={{fontSize:10,color:"var(--mu)",fontWeight:800,textTransform:"uppercase",letterSpacing:1,marginBottom:6}}>
                        {lang==="ru"?"Выбрано":"Pasirinkta"}: {selIds.length}
                      </div>
                      <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                        {selIds.map(sid=>{const sv=avail.find(x=>x.id===sid);return sv?(<span key={sid} style={{fontSize:11,background:m.color+"22",color:m.color,padding:"2px 8px",borderRadius:20,fontWeight:700}}>{lang==="ru"?sv.name_ru:sv.name_lt}</span>):null;})}
                      </div>
                    </div>
                    <div style={{textAlign:"right",flexShrink:0}}>
                      <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:10,color:"var(--mu)",letterSpacing:1}}>{lang==="ru"?"ИТОГО":"IŠ VISO"}</div>
                      <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:24,color:m.color,lineHeight:1}}>{ttlMins} {t.min}</div>
                      <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:20,color:"var(--gr)"}}>{ttlPrice}€</div>
                    </div>
                  </div>
                )}
              </>);
            })()}

            {/* STEP 3: Date */}
            {bk.master&&bk.services.length>0&&<>
              <div id="bk-step-date"/>
              <div className="stag" style={{marginBottom:10}}>{t.step3}</div>
              <div className="dates-row">
                {Array.from({length:14},(_,i)=>{const d=new Date();d.setDate(d.getDate()+i);return d;}).map(d=>(
                  <button key={fmtDate(d)} className={`dbt${bk.date===fmtDate(d)?" on":""}`} onClick={()=>{soundEnabled&&playClickSound();setBk(b=>({...b,date:fmtDate(d),time:null}));scrollToBkStep("bk-step-time");}}>
                    {d.toLocaleDateString(lang==="ru"?"ru-RU":"lt-LT",{weekday:"short",day:"numeric",month:"short"})}
                  </button>
                ))}
              </div>
            </>}

            {/* STEP 4: Time */}
            {bk.date&&bk.master&&bk.services.length>0&&<>
              <div id="bk-step-time"/>
              <div className="stag" style={{margin:"18px 0 8px"}}>{t.step4}</div>
              {(()=>{
                const m=masters.find(x=>String(x.id)===String(bk.master));
                const dur=totalDuration(bk.master,bk.services);
                return(<div style={{fontSize:11,color:"var(--mu2)",marginBottom:10,padding:"8px 12px",background:"var(--card)",borderRadius:8,borderLeft:`3px solid ${m?.color||"var(--or)"}`}}>
                  ⏱ {lang==="ru"?"Блок времени":"Laiko blokas"}: <strong style={{color:m?.color||"var(--or)"}}>{dur} {t.min}</strong>
                  {" "}{lang==="ru"?"будет заблокировано целиком":"bus užblokuota visiškai"}
                </div>);
              })()}
              <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:10,fontSize:11,color:"var(--mu)"}}>
                <span style={{color:"var(--gr)"}}>■</span>{lang==="ru"?"Свободно":"Laisva"}
                <span style={{color:"var(--red)",marginLeft:8}}>■</span>{lang==="ru"?"Занято":"Užimta"}
                <span style={{color:"var(--border)",marginLeft:8}}>■</span>{lang==="ru"?"Не рабочее":"Ne darbo"}
              </div>
              <div className="tgrid" style={{marginBottom:32}}>
                {HOURS.map(h=>{
                  const status=getSlotStatus(bk.master,bk.date,h,bk.services);
                  const busy=status==="busy";
                  const selM=masters.find(x=>String(x.id)===String(bk.master));
                  const hm=timeToMins(h);
                  const closed=selM?.workStart&&selM?.workEnd?(hm<timeToMins(selM.workStart)||hm>=timeToMins(selM.workEnd)):false;
                  if(closed) return <div key={h} className="tbt closed" title={t.slot_closed}>{h}</div>;
                  if(busy) return <div key={h} className="tbt busy" title={t.slot_busy}>{h}</div>;
                  return <button key={h} className={`tbt${bk.time===h?" on":""}`} onClick={()=>setBk(b=>({...b,time:h}))}>{h}</button>;
                })}
              </div>
            </>}

            {/* SUMMARY */}
            {bk.services.length>0&&bk.master&&bk.date&&bk.time&&(()=>{
              const selM=masters.find(m=>m.id===bk.master);
              const disc=selM?.discount?.enabled&&selM?.discount?.percent>0?selM.discount:null;
              const avail=(selM?.services||[]);
              const selSvcs=bk.services.map(sid=>avail.find(s=>s.id===sid)).filter(Boolean);
              const origPrice=selSvcs.reduce((s,x)=>s+Number(x.price),0);
              const ttlMins=selSvcs.reduce((s,x)=>s+Number(x.mins),0);
              const ttlClean=selSvcs.reduce((s,x)=>s+Number(x.cleanup||0),0);
              const finalPrice=disc?Math.round(origPrice*(1-disc.percent/100)):origPrice;
              const saving=origPrice-finalPrice;
              return(
                <div className="sumbox">
                  <div className="sum-title">{t.summary}</div>
                  <div style={{marginBottom:10}}>
                    <div className="sum-row"><span className="sum-lbl">{t.svc}</span><span/></div>
                    {selSvcs.map(s=>(
                      <div key={s.id} style={{display:"flex",justifyContent:"space-between",padding:"4px 0 4px 12px",fontSize:12}}>
                        <span>{lang==="ru"?s.name_ru:s.name_lt}</span>
                        <span style={{color:"var(--or)",fontWeight:700}}>{s.price}€</span>
                      </div>
                    ))}
                  </div>
                  {[[t.mst,`${selM?.firstName} ${selM?.lastName}`.trim()],[t.dt,new Date(bk.date).toLocaleDateString(lang==="ru"?"ru-RU":"lt-LT",{weekday:"long",day:"numeric",month:"long"})],[t.tm,bk.time],[t.cl,cur?.name],[t.duration,`${ttlMins} ${t.min}`]].map(([l,v])=>(
                    <div key={l} className="sum-row"><span className="sum-lbl">{l}</span><span className="sum-val">{v}</span></div>
                  ))}
                  {ttlClean>0&&<div className="sum-row" style={{opacity:.6}}><span className="sum-lbl">🧹 {t.cleanup_lbl}</span><span className="sum-val">+{ttlClean} {t.min}</span></div>}
                  {disc&&<div className="disc-sum-row"><span>🏷️ {lang==="ru"?disc.label_ru||"Акция":disc.label_lt||"Akcija"} −{disc.percent}%</span><span>−{saving}€</span></div>}
                  <div style={{margin:"10px 0 16px"}}>
                    {disc&&<><div><span className="price-original">{origPrice}€</span></div><div className="price-saving">✓ {lang==="ru"?"Вы экономите":"Taupote"} {saving}€</div></>}
                    <div className={disc?"price-final":"sum-total"}>{finalPrice}€</div>
                  </div>
                  <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:16,letterSpacing:1,marginBottom:2,color:"var(--or)"}}>{t.payment_method}</div>

                  {cur?.sub ? (()=>{
                    const subData = subs.find(s=>s.id===cur.sub);
                    const perks = lang==="ru" ? subData?.perks_ru : subData?.perks_lt;
                    const used = getSubVisitsUsed(cur.email, cur.sub);
                    const total = subData?.visitsPerMonth || 0;
                    const left = getSubVisitsLeft(cur.email, cur.sub);
                    const unlimited = total === 0;
                    const limitReached = !unlimited && left === 0;

                    // Auto-select subscription if limit not reached, reset if limit reached
                    if(!limitReached && bk.payment!=="subscription") setBk(b=>({...b,payment:"subscription"}));
                    if(limitReached && bk.payment==="subscription") setBk(b=>({...b,payment:null}));

                    return(<>
                      {/* Subscription status badge — always visible */}
                      <div style={{
                        display:"flex",alignItems:"center",gap:10,
                        padding:"12px 14px",borderRadius:10,marginBottom:10,
                        background: limitReached ? "var(--redd)" : "var(--grd)",
                        border: `1px solid ${limitReached ? "var(--red)" : "var(--gr)"}`,
                      }}>
                        <span style={{fontSize:22}}>💳</span>
                        <div style={{flex:1}}>
                          <div style={{fontSize:10,fontWeight:800,letterSpacing:2,textTransform:"uppercase",color:limitReached?"var(--red)":"var(--gr)"}}>
                            {t.sub_my} · {cur.sub.toUpperCase()}
                          </div>
                          {!unlimited&&(
                            <div style={{marginTop:5}}>
                              {/* Progress bar */}
                              <div style={{height:5,background:"rgba(255,255,255,.1)",borderRadius:3,marginBottom:4}}>
                                <div style={{
                                  width:`${Math.min((used/total)*100,100)}%`,
                                  height:"100%",
                                  background:limitReached?"var(--red)":"var(--gr)",
                                  borderRadius:3,transition:"width .3s"
                                }}/>
                              </div>
                              <div style={{fontSize:11,fontWeight:800,color:limitReached?"var(--red)":"var(--gr)"}}>
                                {limitReached
                                  ? `✗ ${lang==="ru"?"Лимит исчерпан — выберите другой способ оплаты":"Limitas išnaudotas — pasirinkite kitą mokėjimo būdą"}`
                                  : `✓ ${lang==="ru"?`Осталось ${left} из ${total} визитов`:`Liko ${left} iš ${total} vizitų`}`
                                }
                              </div>
                            </div>
                          )}
                          {unlimited&&!limitReached&&(
                            <div style={{fontSize:11,fontWeight:800,color:"var(--gr)",marginTop:2}}>
                              ∞ {lang==="ru"?"Безлимит — оплата покрывается подпиской":"Neribota — mokėjimas padengtas prenumerata"}
                            </div>
                          )}
                        </div>
                        <div style={{textAlign:"right",flexShrink:0}}>
                          <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:22,color:limitReached?"var(--red)":"var(--gr)",lineHeight:1}}>
                            {unlimited?"∞":`${used}/${total}`}
                          </div>
                          <div style={{fontSize:9,color:"var(--mu)"}}>
                            {lang==="ru"?"визитов":"vizitų"}
                          </div>
                        </div>
                      </div>

                      {/* If limit reached — show regular payment options */}
                      {limitReached ? (
                        <>
                          <div style={{fontSize:11,color:"var(--mu2)",marginBottom:10,padding:"8px 12px",background:"var(--card)",borderRadius:8,borderLeft:"3px solid var(--or)"}}>
                            💡 {lang==="ru"
                              ?"Подписка использована полностью. Вы всё равно можете записаться — просто выберите способ оплаты:"
                              :"Prenumerata visiškai panaudota. Vis tiek galite rezervuoti — tiesiog pasirinkite mokėjimo būdą:"
                            }
                          </div>
                          <div className="pay-options">
                            <div className={`pay-card${bk.payment==="cash"?" selected":""}`} onClick={()=>setBk(b=>({...b,payment:"cash"}))}>
                              {bk.payment==="cash"&&<div className="pay-check">✓</div>}
                              <div className="pay-icon">💵</div>
                              <div className="pay-name">{t.payment_cash}</div>
                              <div className="pay-desc">{t.payment_cash_desc}</div>
                            </div>
                            <div className="pay-card disabled">
                              <div className="pay-icon" style={{filter:"grayscale(1)",opacity:.5}}>💳</div>
                              <div className="pay-name" style={{color:"var(--mu)"}}>{t.payment_online}</div>
                              <div className="pay-desc">{t.payment_online_desc}</div>
                              <div className="pay-soon">⏳ {t.payment_online_soon}</div>
                            </div>
                          </div>
                        </>
                      ) : (
                        /* Subscription active — show perks */
                        perks&&<div className="sub-pay-perks" style={{marginBottom:6}}>
                          {perks.filter(Boolean).map((p,i)=><span key={i} className="sub-pay-perk">→ {p}</span>)}
                        </div>
                      )}
                    </>);
                  })() : (
                    <div className="pay-options">
                      <div className={`pay-card${bk.payment==="cash"?" selected":""}`} onClick={()=>setBk(b=>({...b,payment:"cash"}))}>
                        {bk.payment==="cash"&&<div className="pay-check">✓</div>}
                        <div className="pay-icon">💵</div>
                        <div className="pay-name">{t.payment_cash}</div>
                        <div className="pay-desc">{t.payment_cash_desc}</div>
                      </div>
                      <div className="pay-card disabled">
                        <div className="pay-icon" style={{filter:"grayscale(1)",opacity:.5}}>💳</div>
                        <div className="pay-name" style={{color:"var(--mu)"}}>{t.payment_online}</div>
                        <div className="pay-desc">{t.payment_online_desc}</div>
                        <div className="pay-soon">⏳ {t.payment_online_soon}</div>
                      </div>
                    </div>
                  )}
                  <button className="btn b-or b-lg b-full" onClick={confirmBk} disabled={bkLoading||!bk.payment}
                    style={{
                      opacity:(bk.payment&&!bkLoading)?1:.45,
                      cursor:(bk.payment&&!bkLoading)?"pointer":"not-allowed",
                      background: bk.payment==="subscription" ? "var(--gr)" : undefined,
                    }}>
                    {bkLoading ? (lang==="ru"?"Сохраняем...":"Išsaugome...")
                      : bk.payment==="subscription"
                        ? `${t.confirm} · 💳 ${cur?.sub?.toUpperCase()}`
                        : bk.payment==="cash"
                          ? `${t.confirm} · 💵 ${t.payment_cash}`
                          : `↑ ${t.payment_method}`
                    }
                  </button>
                </div>
              );
            })()}
          </section>
        )}
                {page==="book"&&bkDone&&(
          <div className="success">
            <div className="s-icon">✂️</div>
            <div className="s-title">{t.success_title}</div>
            <p className="s-sub">{cur?.name} · {(()=>{const m=masters.find(m=>m.id===bk.master);return `${m?.firstName} ${m?.lastName}`.trim();})() } · {bk.time}</p>
            <div style={{display:"flex",gap:10}}>
              <button className="btn b-or b-lg" onClick={()=>{setPage("my");setBk({services:[],master:null,date:null,time:null,payment:null});}}>{t.to_my}</button>
              <button className="btn b-ghost b-lg" onClick={()=>{setPage("home");setBk({services:[],master:null,date:null,time:null,payment:null});}}>{t.to_home}</button>
            </div>
          </div>
        )}

        {/* MY BOOKINGS */}

        {/* COURSES PAGE */}
        {page==="courses"&&(
          <section className="sec" style={{maxWidth:600,margin:"0 auto"}}>
            <div className="stag">🎓 {lang==="ru"?"ОБУЧЕНИЕ":"MOKYMAI"}</div>
            <h2 className="stitle" style={{marginBottom:20}}>{lang==="ru"?"Курсы и обучение":"Kursai ir mokymai"}</h2>
            {courses.length===0?(
              <p style={{color:"var(--mu)",fontSize:14}}>{lang==="ru"?"Курсы скоро появятся":"Kursai netrukus atsiras"}</p>
            ):courses.map(c=>(
              <div key={c.id} style={{background:"var(--card)",borderRadius:14,padding:20,border:"1px solid var(--b2)",marginBottom:12}}>
                <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:22,letterSpacing:1,marginBottom:8}}>{c.name}</div>
                <div style={{display:"flex",gap:16,flexWrap:"wrap",marginBottom:c.description?10:12}}>
                  <span style={{fontSize:13,color:"var(--or)",fontWeight:700}}>💰 {c.price}</span>
                  {c.duration&&<span style={{fontSize:13,color:"var(--mu2)"}}>⏱ {c.duration}</span>}
                  {c.location&&<span style={{fontSize:13,color:"var(--mu2)"}}>📍 {c.location}</span>}
                </div>
                {c.description&&<p style={{fontSize:13,color:"var(--mu2)",lineHeight:1.6,marginBottom:12}}>{c.description}</p>}
                <a href={`tel:${salonInfo.phone||""}`} style={{display:"inline-block"}}>
                  <button className="btn b-or">{lang==="ru"?"Записаться на консультацию":"Registruotis konsultacijai"}</button>
                </a>
              </div>
            ))}
          </section>
        )}

        {/* CLIENT PROFILE PAGE */}

        {/* MASTER PROFILE PAGE */}
        {/* ORDER MODAL */}
        {orderModal&&(
          <div className="overlay" onClick={()=>setOrderModal(null)}>
            <div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:360}}>
              {orderPlaced ? (
                <div style={{textAlign:"center",padding:"20px 0"}}>
                  <div style={{fontSize:48,marginBottom:12}}>✅</div>
                  <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:24,marginBottom:8}}>
                    {lang==="ru"?"ЗАКАЗ ПРИНЯТ!":"UŽSAKYMAS PRIIMTAS!"}
                  </div>
                  <div style={{fontSize:13,color:"var(--mu2)",marginBottom:20,lineHeight:1.6}}>
                    {lang==="ru"
                      ?"Мы свяжемся с вами для подтверждения. Оплата наличными при получении в салоне."
                      :"Susisieksime su jumis patvirtinimui. Apmokėjimas grynaisiais atsiimant salone."}
                  </div>
                  <button className="btn b-or b-full" onClick={()=>{setOrderModal(null);setOrderPlaced(false);}}>
                    {lang==="ru"?"Закрыть":"Uždaryti"}
                  </button>
                </div>
              ) : (
                <>
                  <div className="m-title">{lang==="ru"?"Оформить заказ":"Užsakyti"}</div>
                  <div style={{background:"var(--card2)",borderRadius:10,padding:"12px 14px",marginBottom:16,display:"flex",gap:12,alignItems:"center"}}>
                    {orderModal.photo&&<img src={orderModal.photo} alt="" style={{width:56,height:56,objectFit:"cover",borderRadius:8}}/>}
                    <div>
                      <div style={{fontWeight:700,fontSize:14}}>{orderModal.name}</div>
                      {orderModal.price>0&&<div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:20,color:"var(--gr)"}}>{orderModal.price}€</div>}
                    </div>
                  </div>
                  <div style={{background:"var(--card2)",borderRadius:10,padding:"12px 14px",marginBottom:16,fontSize:13}}>
                    <div style={{fontWeight:700,marginBottom:6}}>💳 {lang==="ru"?"Способ оплаты":"Mokėjimo būdas"}</div>
                    <div style={{display:"flex",alignItems:"center",gap:8,color:"var(--gr)"}}>
                      <span style={{fontSize:18}}>💵</span>
                      <span style={{fontWeight:700}}>{lang==="ru"?"Наличными в салоне":"Grynaisiais salone"}</span>
                    </div>
                  </div>
                  <div style={{background:"var(--card2)",borderRadius:10,padding:"12px 14px",marginBottom:16,fontSize:12,color:"var(--mu2)",display:"flex",gap:8}}>
                    <span>📍</span>
                    <span>{lang==="ru"?"Забрать в салоне BARBER HUB, Klaipėda":"Atsiimti salone BARBER HUB, Klaipėda"}</span>
                  </div>
                  {cur ? (
                    <button className="btn b-lg b-full" style={{background:"var(--gr)",color:"#fff",fontWeight:800,marginBottom:8}}
                      onClick={async()=>{
                        try{
                          await addDoc(collection(fbDb,"orders"),{
                            productId:orderModal.id,
                            productName:orderModal.name,
                            productPhoto:orderModal.photo||"",
                            price:orderModal.price||0,
                            clientName:cur.name||"",
                            clientEmail:cur.email||"",
                            clientPhone:cur.phone||"",
                            clientUid:cur.uid||"",
                            payment:"cash",
                            pickup:"salon",
                            status:"pending",
                            createdAt:new Date().toISOString(),
                          });
                          setOrderPlaced(true);
                          const token="8633790548:AAEN_fmoagZvNkAPflv2CrRLjS4dMuSbRIk";
                          const chatId="1299718955";
                          fetch(`https://api.telegram.org/bot${token}/sendMessage`,{
                            method:"POST",headers:{"Content-Type":"application/json"},
                            body:JSON.stringify({chat_id:chatId,parse_mode:"Markdown",
                              text:`🛒 *Новый заказ!*\n📦 ${orderModal.name}\n💰 ${orderModal.price}€\n👤 ${cur.name}\n📞 ${cur.phone||"—"}\n💵 Наличными в салоне`
                            })
                          }).catch(()=>{});
                        }catch(e){ alert("Ошибка"); }
                      }}>
                      ✓ {lang==="ru"?"Подтвердить заказ":"Patvirtinti užsakymą"}
                    </button>
                  ) : (
                    <button className="btn b-lg b-full" style={{background:"var(--or)",color:"#fff",fontWeight:800,marginBottom:8}}
                      onClick={()=>{setOrderModal(null);setModal("auth");setAuthMode("login");}}>
                      {lang==="ru"?"Войти чтобы купить":"Prisijungti norėdami pirkti"}
                    </button>
                  )}
                  <button className="btn b-full" style={{background:"none",color:"var(--mu)",border:"1px solid var(--border)"}}
                    onClick={()=>setOrderModal(null)}>
                    {lang==="ru"?"Отмена":"Atšaukti"}
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {/* PRODUCT DETAIL MODAL */}
        {selectedProduct&&(
          <div style={{position:"fixed",inset:0,background:"var(--bg)",zIndex:300,overflowY:"auto"}}>
            <div style={{maxWidth:500,margin:"0 auto",padding:16}}>
              <button onClick={()=>setSelectedProduct(null)} style={{background:"none",border:"none",color:"var(--gr)",cursor:"pointer",fontSize:14,fontWeight:700,marginBottom:16,padding:"8px 0",display:"flex",alignItems:"center",gap:6}}>
                ← {lang==="ru"?"Назад":"Atgal"}
              </button>
              {selectedProduct.photo&&(
                <img src={selectedProduct.photo} alt={selectedProduct.name} style={{width:"100%",maxHeight:300,objectFit:"cover",borderRadius:14,marginBottom:16}}/>
              )}
              <div style={{background:"var(--card)",borderRadius:14,padding:20,border:"1px solid var(--b2)"}}>
                {selectedProduct.category&&<div style={{fontSize:11,color:"var(--gr)",fontWeight:700,marginBottom:6}}>{selectedProduct.category}</div>}
                <h2 style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:28,letterSpacing:1,marginBottom:8}}>{selectedProduct.name}</h2>
                {selectedProduct.price>0&&<div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:32,color:"var(--gr)",marginBottom:12}}>{selectedProduct.price}€</div>}
                {selectedProduct.description&&(
                  <p style={{fontSize:14,color:"var(--mu2)",lineHeight:1.7,marginBottom:16}}>{selectedProduct.description}</p>
                )}
                {/* Stock status */}
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:16,padding:"10px 14px",background:selectedProduct.inStock!==false?"rgba(31,186,122,.1)":"rgba(255,50,50,.1)",borderRadius:10,border:`1px solid ${selectedProduct.inStock!==false?"var(--gr)":"var(--red)"}`}}>
                  <span style={{fontSize:16}}>{selectedProduct.inStock!==false?"✅":"❌"}</span>
                  <span style={{fontSize:13,fontWeight:700,color:selectedProduct.inStock!==false?"var(--gr)":"var(--red)"}}>
                    {selectedProduct.inStock!==false
                      ?(lang==="ru"?"В наличии":"Yra sandėlyje")
                      :(lang==="ru"?"Нет в наличии":"Nėra sandėlyje")}
                  </span>
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:8}}>
                  {selectedProduct.inStock!==false
                    ? <button className="btn b-lg b-full" style={{background:"var(--gr)",color:"#fff",fontWeight:800,fontSize:16}}
                        onClick={()=>{setOrderModal(selectedProduct);setSelectedProduct(null);}}>
                        🛒 {lang==="ru"?"Купить":"Pirkti"}
                      </button>
                    : <div style={{padding:"12px 16px",background:"var(--card2)",borderRadius:10,fontSize:13,color:"var(--mu2)",textAlign:"center"}}>
                        {lang==="ru"?"Нет в наличии — скоро появится":"Nėra — netrukus atsiras"}
                      </div>
                  }
                  <div style={{padding:"10px 14px",background:"var(--card2)",borderRadius:10,fontSize:12,color:"var(--mu2)",display:"flex",gap:8,alignItems:"center"}}>
                    <span>📍</span>
                    <span>{lang==="ru"?"Оплата наличными. Забрать в салоне BARBER HUB":"Apmokėjimas grynaisiais. Atsiimti salone BARBER HUB"}</span>
                  </div>
                  <button className="btn b-lg b-full" style={{background:"var(--card2)",color:"var(--mu)",fontWeight:700}}
                    onClick={()=>setSelectedProduct(null)}>
                    ← {lang==="ru"?"Назад":"Atgal"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {selectedMaster&&(
          <div style={{position:"fixed",inset:0,background:"var(--bg)",zIndex:300,overflowY:"auto"}}>
            <div style={{maxWidth:600,margin:"0 auto",padding:"16px"}}>
              {/* Back button */}
              <button onClick={()=>setSelectedMaster(null)} style={{background:"none",border:"none",color:"var(--or)",cursor:"pointer",fontSize:14,fontWeight:700,marginBottom:16,padding:"8px 0",display:"flex",alignItems:"center",gap:6}}>
                ← {lang==="ru"?"Назад":"Atgal"}
              </button>
              {/* Master header */}
              <div style={{background:"var(--card)",borderRadius:16,padding:20,marginBottom:16,border:`1px solid ${selectedMaster.color}44`}}>
                <div style={{display:"flex",gap:16,alignItems:"center",marginBottom:16}}>
                  <div style={{width:72,height:72,borderRadius:"50%",background:selectedMaster.color+"22",border:`3px solid ${selectedMaster.color}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:32,flexShrink:0}}>
                    {selectedMaster.photo?<img src={selectedMaster.photo} alt="" style={{width:"100%",height:"100%",objectFit:"cover",borderRadius:"50%"}}/>:selectedMaster.emoji}
                  </div>
                  <div>
                    <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:24,letterSpacing:1}}>{selectedMaster.firstName} {selectedMaster.lastName}</div>
                    <div style={{color:selectedMaster.color,fontSize:13,fontWeight:700}}>{lang==="ru"?selectedMaster.role_ru:selectedMaster.role_lt}</div>
                    {selectedMaster.experience&&<div style={{fontSize:11,color:"var(--mu2)",marginTop:2}}>⭐ {selectedMaster.experience} {lang==="ru"?"лет опыта":"m. patirtis"}</div>}
                  </div>
                </div>
                {(selectedMaster.about_ru||selectedMaster.about_lt)&&(
                  <p style={{fontSize:13,color:"var(--mu2)",lineHeight:1.6,marginBottom:12}}>
                    {lang==="ru"?selectedMaster.about_ru:selectedMaster.about_lt}
                  </p>
                )}
                <button className="btn b-or b-full b-lg" onClick={()=>{setBk(b=>({...b,master:selectedMaster.id}));setSelectedMaster(null);goBook();}}>
                  {lang==="ru"?"Записаться к этому мастеру":"Registruotis pas šį meistrą"}
                </button>
              </div>
              {/* Services */}
              {(selectedMaster.services||[]).filter(s=>s.enabled!==false).length>0&&(
                <div style={{marginBottom:16}}>
                  <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:18,letterSpacing:1,marginBottom:10,color:selectedMaster.color}}>
                    {lang==="ru"?"УСЛУГИ":"PASLAUGOS"}
                  </div>
                  {(selectedMaster.services||[]).filter(s=>s.enabled!==false).map((s,i)=>(
                    <div key={i} style={{background:"var(--card)",borderRadius:10,padding:"12px 16px",marginBottom:6,display:"flex",justifyContent:"space-between",alignItems:"center",border:"1px solid var(--b2)"}}>
                      <div>
                        <div style={{fontWeight:700,fontSize:13}}>{lang==="ru"?s.name_ru:s.name_lt}</div>
                        <div style={{fontSize:11,color:"var(--mu2)"}}>{s.mins} {lang==="ru"?"мин":"min"}</div>
                      </div>
                      <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:20,color:selectedMaster.color}}>{s.price}€</div>
                    </div>
                  ))}
                </div>
              )}
              {/* Portfolio */}
              {(()=>{
                const masterPortfolio = portfolio
                  .filter(p=>String(p.masterId)===String(selectedMaster.id))
                  .sort((a,b)=>b.createdAt>a.createdAt?1:-1);
                if(masterPortfolio.length===0) return null;
                return(
                  <div style={{marginBottom:16}}>
                    <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:18,letterSpacing:1,marginBottom:10,color:selectedMaster.color}}>
                      {lang==="ru"?"РАБОТЫ":"DARBAI"}
                    </div>
                    {/* Carousel */}
                    <div style={{display:"flex",gap:8,overflowX:"auto",WebkitOverflowScrolling:"touch",scrollSnapType:"x mandatory",paddingBottom:8}}>
                      {masterPortfolio.map((item,i)=>{
                        const svc=(selectedMaster.services||[]).find(s=>s.id===item.serviceId);
                        return(
                          <div key={item.id} style={{flexShrink:0,width:200,scrollSnapAlign:"start"}}>
                            <div style={{borderRadius:12,overflow:"hidden",background:"var(--card)",border:`1px solid ${selectedMaster.color}33`}}>
                              <img src={item.photo} alt="" style={{width:"100%",height:200,objectFit:"cover",display:"block"}}/>
                              <div style={{padding:"8px 10px"}}>
                                {svc&&<div style={{fontSize:11,fontWeight:700,color:selectedMaster.color}}>{lang==="ru"?svc.name_ru:svc.name_lt}</div>}
                                {item.caption&&<div style={{fontSize:11,color:"var(--mu2)",marginTop:2}}>{item.caption}</div>}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
              {/* Reviews */}
              {reviews.filter(r=>String(r.masterId)===String(selectedMaster.id)).length>0&&(
                <div>
                  <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:18,letterSpacing:1,marginBottom:10,color:selectedMaster.color}}>
                    {lang==="ru"?"ОТЗЫВЫ":"ATSILIEPIMAI"}
                  </div>
                  {reviews.filter(r=>String(r.masterId)===String(selectedMaster.id)).slice(0,5).map((r,i)=>(
                    <div key={i} style={{background:"var(--card)",borderRadius:10,padding:"12px 16px",marginBottom:6,border:"1px solid var(--b2)"}}>
                      <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                        <div style={{fontWeight:700,fontSize:13}}>{r.clientName}</div>
                        <div style={{color:"var(--gold)",fontSize:12}}>{"★".repeat(r.rating)}{"☆".repeat(5-r.rating)}</div>
                      </div>
                      {r.text&&<div style={{fontSize:12,color:"var(--mu2)",fontStyle:"italic"}}>"{r.text}"</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* MY PROCEDURES PAGE */}
        {page==="procedures"&&cur&&!masterObj&&!isOwner&&(
          <section className="sec" style={{maxWidth:520,margin:"0 auto"}}>
            <button onClick={()=>setPage("profile")} style={{background:"none",border:"none",color:"var(--gr)",cursor:"pointer",fontSize:14,fontWeight:700,marginBottom:16,padding:"8px 0",display:"flex",alignItems:"center",gap:6}}>
              ← {lang==="ru"?"Назад":"Atgal"}
            </button>
            <div className="stag" style={{color:"var(--gr)"}}>🧬 {lang==="ru"?"Мои процедуры":"Mano procedūros"}</div>
            <h2 className="stitle" style={{marginBottom:20}}>{lang==="ru"?"МОИ ПРОЦЕДУРЫ":"MANO PROCEDŪROS"}</h2>

            {(()=>{
              const myCards = triCards
                .filter(c=>c.clientEmail===cur.email||c.clientUid===cur.uid)
                .sort((a,b)=>b.date>a.date?1:-1);

              if(myCards.length===0) return(
                <div style={{color:"var(--mu)",fontSize:13,textAlign:"center",padding:32}}>
                  {lang==="ru"?"Процедур пока нет":"Procedūrų dar nėra"}
                </div>
              );

              return myCards.map(card=>{
                const recProducts = products.filter(p=>(card.productRecs||[]).includes(p.id));
                const master = masters.find(m=>String(m.id)===String(card.masterId));
                return(
                  <div key={card.id} style={{background:"var(--card)",border:"1px solid var(--b2)",borderRadius:14,overflow:"hidden",marginBottom:16}}>
                    {/* Header */}
                    <div style={{background:"linear-gradient(135deg,var(--gr)22,transparent)",padding:"14px 16px",borderBottom:"1px solid var(--b2)"}}>
                      <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:20,letterSpacing:1,color:"var(--gr)"}}>{card.serviceName}</div>
                      <div style={{fontSize:11,color:"var(--mu2)",marginTop:2,display:"flex",gap:10}}>
                        <span>📅 {new Date(card.date).toLocaleDateString(lang==="ru"?"ru-RU":"lt-LT",{day:"numeric",month:"long",year:"numeric"})}</span>
                        {master&&<span>✂️ {master.firstName} {master.lastName}</span>}
                      </div>
                    </div>

                    <div style={{padding:16}}>
                      {/* Что делали */}
                      {card.procedure&&(
                        <div style={{marginBottom:14}}>
                          <div style={{fontSize:11,fontWeight:800,color:"var(--gr)",textTransform:"uppercase",letterSpacing:1,marginBottom:6}}>✂️ {lang==="ru"?"Что делали":"Ką darėme"}</div>
                          <div style={{fontSize:13,color:"var(--mu2)",lineHeight:1.7}}>{card.procedure}</div>
                        </div>
                      )}

                      {/* Рекомендации */}
                      {card.recommendations&&(
                        <div style={{marginBottom:14}}>
                          <div style={{fontSize:11,fontWeight:800,color:"var(--or)",textTransform:"uppercase",letterSpacing:1,marginBottom:6}}>💡 {lang==="ru"?"Рекомендации":"Rekomendacijos"}</div>
                          <div style={{fontSize:13,color:"var(--mu2)",lineHeight:1.7}}>{card.recommendations}</div>
                        </div>
                      )}

                      {/* Фото */}
                      {card.photos?.length>0&&(
                        <div style={{marginBottom:14}}>
                          <div style={{fontSize:11,fontWeight:800,color:"var(--mu)",textTransform:"uppercase",letterSpacing:1,marginBottom:8}}>📸 {lang==="ru"?"Фото":"Nuotraukos"}</div>
                          <div style={{display:"flex",gap:8,overflowX:"auto",WebkitOverflowScrolling:"touch"}}>
                            {card.photos.map((ph,i)=>(
                              <div key={i} style={{flexShrink:0}}>
                                <img src={ph.url} alt="" style={{width:140,height:140,objectFit:"cover",borderRadius:10,display:"block"}}/>
                                {ph.note&&<div style={{fontSize:10,color:"var(--mu2)",marginTop:4,maxWidth:140}}>{ph.note}</div>}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Рекомендуемые продукты */}
                      {recProducts.length>0&&(
                        <div>
                          <div style={{fontSize:11,fontWeight:800,color:"var(--gold)",textTransform:"uppercase",letterSpacing:1,marginBottom:8}}>🛍️ {lang==="ru"?"Рекомендуемые продукты":"Rekomenduojami produktai"}</div>
                          <div style={{display:"flex",flexDirection:"column",gap:8}}>
                            {recProducts.map(p=>(
                              <div key={p.id} style={{display:"flex",gap:10,alignItems:"center",padding:"10px 12px",background:"var(--card2)",borderRadius:10,cursor:"pointer"}}
                                onClick={()=>setSelectedProduct(p)}>
                                {p.photo&&<img src={p.photo} alt="" style={{width:44,height:44,objectFit:"cover",borderRadius:8}}/>}
                                {!p.photo&&<div style={{width:44,height:44,background:"var(--border)",borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20}}>🧴</div>}
                                <div style={{flex:1}}>
                                  <div style={{fontWeight:700,fontSize:13}}>{p.name}</div>
                                  {p.category&&<div style={{fontSize:10,color:"var(--mu2)"}}>{p.category}</div>}
                                  {p.price>0&&<div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:16,color:"var(--gr)"}}>{p.price}€</div>}
                                </div>
                                <span style={{fontSize:12,color:"var(--mu)"}}>›</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              });
            })()}
          </section>
        )}

        {page==="profile"&&cur&&!masterObj&&!isOwner&&(
          <section className="sec" style={{maxWidth:480,margin:"0 auto"}}>
            <div className="stag">{lang==="ru"?"МОЙ ПРОФИЛЬ":"MANO PROFILIS"}</div>
            <h2 className="stitle" style={{marginBottom:24}}>{lang==="ru"?"Профиль":"Profilis"}</h2>
            {/* Avatar */}
            <div style={{display:"flex",alignItems:"center",gap:16,marginBottom:28,padding:"20px",background:"var(--card)",borderRadius:14,border:"1px solid var(--b2)"}}>
              <div style={{width:64,height:64,borderRadius:"50%",background:"var(--gr)22",border:"2px solid var(--gr)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:28,fontWeight:800,color:"var(--gr)",flexShrink:0}}>
                {cur.name?.[0]?.toUpperCase()||"?"}
              </div>
              <div>
                <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:20,letterSpacing:1}}>{cur.name}</div>
                <div style={{fontSize:12,color:"var(--mu2)"}}>{cur.email}</div>
                <div style={{fontSize:11,color:"var(--gr)",marginTop:4,fontWeight:700}}>● {lang==="ru"?"Клиент":"Klientas"}</div>
              </div>
            </div>
            {/* Edit form */}
            <div style={{background:"var(--card)",borderRadius:14,border:"1px solid var(--b2)",padding:20,marginBottom:16}}>
              <div style={{fontWeight:700,marginBottom:16,fontSize:14}}>{lang==="ru"?"Редактировать профиль":"Redaguoti profilį"}</div>
              <div className="field"><label>{lang==="ru"?"Имя":"Vardas"}</label>
                <input defaultValue={cur.name||""} onChange={e=>setProfileEdit(p=>({...p,name:e.target.value}))} placeholder={lang==="ru"?"Ваше имя":"Jūsų vardas"}/></div>
              <div className="field"><label>{lang==="ru"?"Телефон":"Telefonas"}</label>
                <input defaultValue={cur.phone||""} onChange={e=>setProfileEdit(p=>({...p,phone:e.target.value}))} placeholder="+370 600 00000" type="tel"/></div>
              <div className="field"><label>Email</label>
                <input value={cur.email||""} disabled style={{opacity:.5}}/></div>
              {profileSaved&&<div style={{color:"var(--gr)",fontSize:12,marginBottom:8,fontWeight:700}}>✓ {lang==="ru"?"Сохранено!":"Išsaugota!"}</div>}
              <button className="btn b-or b-full" style={{marginTop:8}} onClick={async()=>{
                const name = profileEdit.name||cur.name;
                const phone = profileEdit.phone||cur.phone||"";
                setCur(c=>({...c,name,phone}));
                try{
                  if(cur.uid) await import("firebase/firestore").then(async({doc,updateDoc})=>{
                    const {db:fdb} = await import("./firebase.js");
                    await updateDoc(doc(fdb,"users",cur.uid),{name,phone});
                  });
                  // Update localStorage if master
                  const saved = localStorage.getItem("barberhub_master");
                  if(saved){ const d=JSON.parse(saved); localStorage.setItem("barberhub_master",JSON.stringify({...d,name,phone})); }
                }catch(e){}
                setProfileSaved(true);
                setTimeout(()=>setProfileSaved(false),2500);
              }}>
                {lang==="ru"?"Сохранить":"Išsaugoti"}
              </button>
            </div>
            {/* My bookings link */}
            <button className="btn b-card b-full" style={{marginBottom:10}} onClick={()=>setPage("my")}>
              📋 {lang==="ru"?"Мои записи":"Mano įrašai"}
            </button>
            {/* My procedures link */}
            {triCards.filter(c=>c.clientEmail===cur.email||c.clientUid===cur.uid).length>0&&(
              <button className="btn b-card b-full" style={{marginBottom:10,borderColor:"var(--gr)",color:"var(--gr)"}} onClick={()=>setPage("procedures")}>
                🧬 {lang==="ru"?"Мои процедуры":"Mano procedūros"} ({triCards.filter(c=>c.clientEmail===cur.email||c.clientUid===cur.uid).length})
              </button>
            )}
            {/* Sound settings */}
            <div style={{background:"var(--card)",borderRadius:14,border:"1px solid var(--b2)",padding:16,marginBottom:12}}>
              <div style={{fontWeight:700,fontSize:13,marginBottom:12}}>🔊 {lang==="ru"?"Звуки":"Garsai"}</div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                <span style={{fontSize:13}}>{lang==="ru"?"Звуковые эффекты":"Garso efektai"}</span>
                <button onClick={()=>{
                  const v=!soundEnabled;setSoundEnabled(v);
                  try{localStorage.setItem("barberhub_sound",v?"on":"off");}catch(e){}
                }} style={{
                  width:48,height:26,borderRadius:13,border:"none",cursor:"pointer",position:"relative",
                  background:soundEnabled?"var(--gr)":"var(--border)",transition:"background .2s"
                }}>
                  <div style={{position:"absolute",top:3,left:soundEnabled?24:3,width:20,height:20,borderRadius:"50%",background:"#fff",transition:"left .2s"}}/>
                </button>
              </div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span style={{fontSize:13}}>🎮 {lang==="ru"?"Музыка Mario":"Mario muzika"}</span>
                <button onClick={()=>{
                  const v=!bgMusicEnabled;setBgMusicEnabled(v);
                  try{localStorage.setItem("barberhub_bgmusic",v?"on":"off");}catch(e){}
                }} style={{
                  width:48,height:26,borderRadius:13,border:"none",cursor:"pointer",position:"relative",
                  background:bgMusicEnabled?"var(--or)":"var(--border)",transition:"background .2s"
                }}>
                  <div style={{position:"absolute",top:3,left:bgMusicEnabled?24:3,width:20,height:20,borderRadius:"50%",background:"#fff",transition:"left .2s"}}/>
                </button>
              </div>
            </div>

            {/* Logout */}
            <button className="btn b-ghost b-full" style={{color:"var(--red)",borderColor:"var(--red)"}} onClick={logout}>
              🚪 {lang==="ru"?"Выйти из аккаунта":"Atsijungti"}
            </button>
          </section>
        )}

        {page==="my"&&(
          <section className="sec">
            <div className="stag">{t.my_bookings}</div>
            <h2 className="stitle">{t.my_title}</h2>
            {cur?.sub&&<div style={{marginBottom:18,padding:"9px 14px",background:"var(--grd)",border:"1px solid var(--gr)",borderRadius:8,fontSize:12,color:"var(--gr)",fontWeight:700}}>{t.sub_my}: {cur.sub.toUpperCase()} — {t.sub_active}</div>}
            {myBookings.length===0?<p style={{color:"var(--mu)",fontSize:14,marginBottom:22}}>{t.my_empty}</p>
            :myBookings.map(b=>{
              const s=resolveBooking(b),m=masters.find(x=>String(x.id)===String(b.masterId));
              const isCancelled = b.status==="cancelled";
              const isDone = b.status==="done";
              const isRescheduling = clientReschedule?.id === b.id;
              // Check if cancellation is allowed (>24h before appointment)
              const bDateTime = new Date(b.date + "T" + b.time + ":00");
              const hoursUntil = (bDateTime - new Date()) / 3600000;
              const canCancel = !isCancelled && !isDone && hoursUntil > 24;
              const tooLateToCancel = !isCancelled && !isDone && hoursUntil <= 24 && hoursUntil > 0;
              return(
                <div key={b.id}>
                  <div className="bk-item" style={{opacity:isCancelled?0.7:1,borderLeft:isCancelled?"3px solid var(--red)":isDone?"3px solid var(--gr)":"3px solid var(--or)"}}>
                    <div style={{flex:1}}>
                      <div className="bk-svc" style={{textDecoration:isCancelled?"line-through":"none"}}>{s?.name||"—"}</div>
                      <div className="bk-meta">{m?.firstName} {m?.lastName} · {b.date} · {b.time}{b.payment?" · "+(b.payment==="cash"?"💵":"💳"):""}</div>
                      {isCancelled&&<div style={{fontSize:11,color:"var(--red)",marginTop:3,fontWeight:700}}>
                        ❌ {lang==="ru"?"Отменено":"Atšaukta"}{b.cancelledBy?` · ${b.cancelledBy}`:""}
                      </div>}
                      {tooLateToCancel&&<div style={{fontSize:10,color:"var(--mu)",marginTop:2}}>
                        🔒 {lang==="ru"?"Отмена недоступна (менее 24ч)":"Atšaukimas negalimas (mažiau 24val)"}
                      </div>}
                    </div>
                    <div style={{display:"flex",flexDirection:"column",gap:4,alignItems:"flex-end"}}>
                      <span className={`badge ${isDone?"bgr":isCancelled?"b-red":"bor"}`} style={isCancelled?{background:"var(--red)",color:"#fff"}:{}}>
                        {isDone?(lang==="ru"?"Выполнено":"Atlikta"):isCancelled?(lang==="ru"?"Отменено":"Atšaukta"):t.confirmed}
                      </span>
                      {!isCancelled&&!isDone&&(
                        <button
                          onClick={()=>{
                            if(isRescheduling){ setClientReschedule(null); }
                            else { setClientReschedule(b); setRescheduleDate(null); setRescheduleTime(null); }
                          }}
                          style={{
                            background:isRescheduling?"var(--card2)":"var(--or)",
                            color:isRescheduling?"var(--mu)":"var(--bg)",
                            border:"none",borderRadius:8,padding:"5px 10px",
                            fontSize:11,fontWeight:700,cursor:"pointer",
                            whiteSpace:"nowrap"
                          }}>
                          {isRescheduling?"✕":"📅 Перенести"}
                        </button>
                      )}
                      {canCancel&&(
                        <button onClick={async()=>{
                          if(!window.confirm(lang==="ru"?"Отменить запись?":"Atšaukti rezervaciją?")) return;
                          try{
                            await updateDoc(doc(fbDb,"bookings",b.id),{
                              status:"cancelled",
                              cancelledBy:cur.name,
                              cancelledAt:new Date().toISOString()
                            });
                            addNotification("cancelled",
                              `${cur.name} ${lang==="ru"?"отменил":"atšaukė"} · ${b.date} ${b.time}`,
                              b.masterId, true
                            );
                          }catch(e){}
                        }} style={{background:"none",border:"1px solid var(--red)",borderRadius:8,padding:"4px 8px",fontSize:10,fontWeight:700,cursor:"pointer",color:"var(--red)",whiteSpace:"nowrap"}}>
                          ✕ {lang==="ru"?"Отменить":"Atšaukti"}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Reschedule panel */}
                  {isRescheduling&&clientReschedule&&(
                    <div style={{background:"var(--card2)",border:"1px solid var(--b2)",borderRadius:10,padding:14,marginBottom:8,marginTop:-4}}>
                      <div style={{fontSize:12,fontWeight:700,marginBottom:10,color:"var(--or)"}}>
                        📅 {lang==="ru"?"Выберите новую дату и время":"Pasirinkite naują datą ir laiką"}
                      </div>
                      {/* Date picker - next 14 days */}
                      <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:10}}>
                        {Array.from({length:14},(_,i)=>{
                          const d = new Date(); d.setDate(d.getDate()+i+1);
                          const ds = fmtDate(d);
                          const isSalonClosed = isDateSalonClosed(ds);
                          return(
                            <button key={ds} className={`dbt${rescheduleDate===ds?" on":""}`}
                              style={{opacity:isSalonClosed?.4:1}}
                              disabled={isSalonClosed}
                              onClick={()=>{setRescheduleDate(ds);setRescheduleTime(null);}}>
                              {d.toLocaleDateString(lang==="ru"?"ru-RU":"lt-LT",{weekday:"short",day:"numeric",month:"short"})}
                            </button>
                          );
                        })}
                      </div>
                      {/* Time slots */}
                      {rescheduleDate&&(
                        <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:12}}>
                          {HOURS.map(h=>{
                            const status = getSlotStatus(clientReschedule.masterId, rescheduleDate, h, clientReschedule.serviceIds||[clientReschedule.serviceId], clientReschedule.id);
                            const isFree = status==="free";
                            return(
                              <button key={h} className={`tbt${rescheduleTime===h?" on":""}`}
                                style={{opacity:isFree?1:.3,background:rescheduleTime===h?"var(--or)":isFree?"var(--card)":"var(--card2)",cursor:isFree?"pointer":"not-allowed"}}
                                disabled={!isFree}
                                onClick={()=>isFree&&setRescheduleTime(h)}>
                                {h}
                              </button>
                            );
                          })}
                        </div>
                      )}
                      {rescheduleDate&&rescheduleTime&&(
                        <button className="btn b-or b-full" onClick={async()=>{
                          try{
                            await updateDoc(doc(fbDb,"bookings",clientReschedule.id),{
                              date:rescheduleDate,
                              time:rescheduleTime,
                              rescheduledAt:new Date().toISOString()
                            });
                            addNotification("rescheduled",
                              `${cur.name} перенёс запись на ${rescheduleDate} ${rescheduleTime}`,
                              clientReschedule.masterId, true
                            );
                            setClientReschedule(null);
                          }catch(e){ alert(lang==="ru"?"Ошибка. Попробуйте снова.":"Klaida."); }
                        }}>
                          ✓ {lang==="ru"?`Перенести на ${rescheduleDate} ${rescheduleTime}`:`Perkelti į ${rescheduleDate} ${rescheduleTime}`}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            <button className="btn b-or b-lg" onClick={goBook}>{t.book_again}</button>
          </section>
        )}

        {/* MASTER CABINET */}
        {page==="master"&&masterObj&&(()=>{
          return(
            <div className="mcab">
              {/* MOBILE WIDGET BUTTON — only show when NOT on calendar */}
              {mTab!=="calendar"&&(
                <button className="master-widget-btn"
                  style={{opacity:widgetBtnVisible?1:0,transform:widgetBtnVisible?"scale(1)":"scale(0.8)",pointerEvents:widgetBtnVisible?"auto":"none",transition:"all .3s"}}
                  onClick={()=>setMasterDrawerOpen(true)}>
                  ☰ {lang==="ru"?"Виджеты":"Valdikliai"}
                </button>
              )}

              {/* MOBILE MASTER DRAWER */}
              {masterDrawerOpen&&(
                <>
                  <div className="master-drawer-overlay" onClick={()=>setMasterDrawerOpen(false)}/>
                  <div className="master-drawer">
                    <div className="master-drawer-handle"/>
                    <div className="master-drawer-profile">
                      <div style={{width:44,height:44,borderRadius:"50%",background:mc+"22",border:`2px solid ${mc}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,flexShrink:0}}>
                        {masterObj.photo?<img src={masterObj.photo} alt="" style={{width:"100%",height:"100%",objectFit:"cover",borderRadius:"50%"}}/>:masterObj.emoji}
                      </div>
                      <div>
                        <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:18,letterSpacing:1}}>{masterObj.firstName}</div>
                        <div style={{fontSize:11,color:mc}}>{lang==="ru"?masterObj.role_ru:masterObj.role_lt}</div>
                      </div>
                    </div>
                    {[
                      {key:"calendar",icon:"📅",label:lang==="ru"?"Расписание":"Tvarkaraštis"},
                      {key:"clients", icon:"👥",label:t.clients_tab,badge:masterClients.length||null},
                      {key:"stats",   icon:"📊",label:t.stats_tab},
                      {key:"reviews", icon:"⭐",label:t.reviews_tab},
                      {key:"portfolio",icon:"🖼️",label:lang==="ru"?"Фото работ":"Darbų nuotraukos"},
                      {key:"settings",icon:"⚙️",label:t.settings_tab},
                    ].map(item=>(
                      <button key={item.key} className="master-drawer-item"
                        style={{background:mTab===item.key?mc+"18":"none",color:mTab===item.key?mc:"var(--wh)"}}
                        onClick={()=>{setMTab(item.key);setMasterDrawerOpen(false);}}>
                        <span style={{fontSize:18}}>{item.icon}</span>
                        <span style={{flex:1}}>{item.label}</span>
                        {item.badge!=null&&<span style={{background:mc,color:"var(--bg)",fontSize:10,fontWeight:800,padding:"1px 7px",borderRadius:9}}>{item.badge}</span>}
                      </button>
                    ))}
                    <button className="btn b-full" style={{background:mc,color:"var(--bg)",marginTop:8,fontWeight:800}}
                      onClick={()=>{openNewAppt(null);setMasterDrawerOpen(false);}}>
                      {t.new_appt}
                    </button>
                    <button className="btn b-ghost b-full" style={{marginTop:6,color:"var(--red)",borderColor:"var(--red)"}}
                      onClick={()=>{logout();setMasterDrawerOpen(false);}}>
                      🚪 {lang==="ru"?"Выйти":"Atsijungti"}
                    </button>
                  </div>
                </>
              )}
              {/* SIDEBAR */}
              <div className="msb">
                <div className="msp">
                  <div className="msp-av" style={{background:mc+"22",border:`3px solid ${mc}`}}>
                    {masterObj.photo?<img src={masterObj.photo} alt="" onError={e=>e.target.style.display="none"}/>:masterObj.emoji}
                  </div>
                  <div className="msp-name">{masterObj.firstName}</div>
                  <div className="msp-role" style={{color:mc}}>{lang==="ru"?masterObj.role_ru:masterObj.role_lt}</div>
                </div>
                {[
                  {key:"calendar",icon:"📅",label:lang==="ru"?"Расписание":"Tvarkaraštis",badge:statsToday.appts||null},
                  {key:"clients", icon:"👥",label:t.clients_tab,badge:masterClients.length||null},
                  {key:"stats",   icon:"📊",label:t.stats_tab},
                  {key:"reviews", icon:"⭐",label:t.reviews_tab,badge:reviews.filter(r=>String(r.masterId)===String(masterObj.id)).length||null},
                  {key:"portfolio",icon:"🖼️",label:lang==="ru"?"Фото работ":"Darbų nuotraukos"},
                  {key:"settings",icon:"⚙️",label:t.settings_tab},
                ].map(item=>(
                  <button key={item.key} className={`ms-link${mTab===item.key?" on":""}`}
                    style={mTab===item.key?{color:mc,background:mc+"18"}:{}}
                    onClick={()=>setMTab(item.key)}>
                    <span className="ms-icon">{item.icon}</span>{item.label}
                    {item.badge!=null&&<span className="ms-badge" style={{background:mc}}>{item.badge}</span>}
                  </button>
                ))}
                <div style={{flex:1}}/>
                <button className="btn b-full b-sm" style={{background:mc,color:"var(--bg)",marginTop:10}} onClick={()=>openNewAppt(null)}>{t.new_appt}</button>
                <button className="btn b-full b-sm" style={{background:blockMode?"var(--red)":"var(--card2)",color:blockMode?"#fff":"var(--gold)",border:"1px solid var(--gold)",marginTop:6}}
                  onClick={()=>{setBlockMode(p=>!p);setBlockSelectedSlots([]);}}>
                  {blockMode?(lang==="ru"?"✕ Отмена":"✕ Atšaukti"):"🔒 "+(lang==="ru"?"Блок времени":"Blokuoti laiką")}
                </button>
              </div>

              {/* CONTENT */}
              <div className="mcon" style={mTab==="calendar"?{overflow:"hidden",height:"100%",overscrollBehavior:"none"}:{overflow:"auto"}}>

                {/* SETTINGS */}
                {mTab==="settings"&&<MasterSettings master={masterObj} onSave={saveMasterProfile} t={t} lang={lang}/>}

                {/* PORTFOLIO TAB */}
                {mTab==="portfolio"&&(
                  <div style={{padding:18}}>
                    <div className="stag">🖼️ {lang==="ru"?"Фото работ":"Darbų nuotraukos"}</div>
                    <h2 style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:26,letterSpacing:1,marginBottom:16}}>
                      {lang==="ru"?"МОИ РАБОТЫ":"MANO DARBAI"}
                    </h2>

                    {/* Upload form */}
                    <div style={{background:"var(--card)",border:`1px solid ${mc}44`,borderRadius:14,padding:16,marginBottom:20}}>
                      <div style={{fontWeight:700,fontSize:13,marginBottom:12,color:mc}}>
                        + {lang==="ru"?"Добавить фото":"Pridėti nuotrauką"}
                      </div>

                      {/* Photo upload */}
                      <div className="field">
                        <label>{lang==="ru"?"Фото":"Nuotrauka"}</label>
                        <input type="file" accept="image/*" onChange={e=>{
                          const file=e.target.files?.[0]; if(!file) return;
                          // Compress image using canvas before storing
                          const img=new Image();
                          const url=URL.createObjectURL(file);
                          img.onload=()=>{
                            const canvas=document.createElement("canvas");
                            const MAX=800;
                            let w=img.width, h=img.height;
                            if(w>h){ if(w>MAX){h=Math.round(h*MAX/w);w=MAX;} }
                            else { if(h>MAX){w=Math.round(w*MAX/h);h=MAX;} }
                            canvas.width=w; canvas.height=h;
                            canvas.getContext("2d").drawImage(img,0,0,w,h);
                            const compressed=canvas.toDataURL("image/jpeg",0.7);
                            setPortfolioForm(f=>({...f,photo:compressed}));
                            URL.revokeObjectURL(url);
                          };
                          img.src=url;
                        }}/>
                        {portfolioForm.photo&&(
                          <img src={portfolioForm.photo} alt="" style={{width:"100%",maxHeight:200,objectFit:"cover",borderRadius:8,marginTop:8}}/>
                        )}
                      </div>

                      {/* Service selector */}
                      <div className="field">
                        <label>{lang==="ru"?"Услуга":"Paslauga"}</label>
                        <select value={portfolioForm.serviceId} onChange={e=>setPortfolioForm(f=>({...f,serviceId:e.target.value}))}>
                          <option value="">— {lang==="ru"?"Выберите услугу":"Pasirinkite paslaugą"}</option>
                          {(masterObj.services||[]).filter(s=>s.enabled).map(s=>(
                            <option key={s.id} value={s.id}>{lang==="ru"?s.name_ru:s.name_lt}</option>
                          ))}
                        </select>
                      </div>

                      {/* Caption */}
                      <div className="field">
                        <label>{lang==="ru"?"Описание (необязательно)":"Aprašymas (neprivaloma)"}</label>
                        <input value={portfolioForm.caption} onChange={e=>setPortfolioForm(f=>({...f,caption:e.target.value}))}
                          placeholder={lang==="ru"?"Классическая стрижка...":"Klasikinis kirpimas..."}/>
                      </div>

                      <button className="btn b-lg b-full"
                        style={{background:portfolioForm.photo&&portfolioForm.serviceId?mc:"var(--border)",color:"var(--bg)",fontWeight:800,marginTop:4}}
                        disabled={!portfolioForm.photo||!portfolioForm.serviceId||portfolioUploading}
                        onClick={async()=>{
                          if(!portfolioForm.photo||!portfolioForm.serviceId) return;
                          setPortfolioUploading(true);
                          try{
                            await addDoc(collection(fbDb,"portfolio"),{
                              masterId:String(masterObj.id),
                              photo:portfolioForm.photo,
                              serviceId:portfolioForm.serviceId,
                              caption:portfolioForm.caption||"",
                              createdAt:new Date().toISOString(),
                            });
                            // Only clear form on success
                            setPortfolioForm({photo:"",serviceId:"",caption:""});
                          }catch(e){
                            alert(lang==="ru"?"Ошибка: фото слишком большое. Попробуйте другое.":"Klaida: nuotrauka per didelė.");
                          }
                          setPortfolioUploading(false);
                        }}>
                        {portfolioUploading?(lang==="ru"?"Сохранение...":"Išsaugoma..."):(lang==="ru"?"Опубликовать":"Paskelbti")}
                      </button>
                    </div>

                    {/* My portfolio grid */}
                    {(()=>{
                      const myPortfolio = portfolio.filter(p=>String(p.masterId)===String(masterObj.id))
                        .sort((a,b)=>b.createdAt>a.createdAt?1:-1);
                      if(myPortfolio.length===0) return(
                        <div style={{color:"var(--mu)",fontSize:13,textAlign:"center",padding:24}}>
                          {lang==="ru"?"Фото пока нет. Добавьте первую работу!":"Nuotraukų dar nėra. Pridėkite pirmą darbą!"}
                        </div>
                      );
                      return(
                        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))",gap:8}}>
                          {myPortfolio.map(item=>{
                            const svc=(masterObj.services||[]).find(s=>s.id===item.serviceId);
                            return(
                              <div key={item.id} style={{position:"relative",borderRadius:10,overflow:"hidden",background:"var(--card)",border:"1px solid var(--b2)"}}>
                                <img src={item.photo} alt="" style={{width:"100%",aspectRatio:"1",objectFit:"cover",display:"block"}}/>
                                <div style={{padding:"6px 8px"}}>
                                  <div style={{fontSize:10,fontWeight:700,color:mc,marginBottom:2}}>
                                    {svc?(lang==="ru"?svc.name_ru:svc.name_lt):""}
                                  </div>
                                  {item.caption&&<div style={{fontSize:10,color:"var(--mu2)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.caption}</div>}
                                </div>
                                <button onClick={async()=>{
                                  try{ await deleteDoc(doc(fbDb,"portfolio",item.id)); }catch(e){}
                                }} style={{position:"absolute",top:4,right:4,background:"rgba(0,0,0,.6)",border:"none",borderRadius:"50%",width:24,height:24,color:"#fff",cursor:"pointer",fontSize:12,display:"flex",alignItems:"center",justifyContent:"center"}}>
                                  ✕
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </div>
                )}

                {/* CALENDAR */}
                {mTab==="calendar"&&<>
                  <div className="cal-hd" style={{flexDirection:"column",gap:6,padding:"8px 10px"}}>
                    {/* Row 1: Navigation */}
                    <div style={{display:"flex",alignItems:"center",gap:6,width:"100%"}}>
                      <button className="btn b-card b-sm" onClick={()=>setMasterDrawerOpen(true)} style={{padding:"6px 10px",fontSize:16}}>☰</button>
                      <button className="btn b-card b-sm" onClick={()=>setWeekAnchor(new Date())}>{t.cal_today}</button>
                      <button className="btn b-card b-sm" onClick={()=>{
                        setWeekSlide("right");
                        setTimeout(()=>setWeekSlide(null),380);
                        const d=new Date(weekAnchor);d.setDate(d.getDate()-7);setWeekAnchor(d);
                      }}>‹</button>
                      <div className="cal-hd-title" style={{flex:1,textAlign:"center",fontSize:12}}>
                        {weekDates[0].toLocaleDateString(lang==="ru"?"ru-RU":"lt-LT",{day:"numeric",month:"short"})} – {weekDates[6].toLocaleDateString(lang==="ru"?"ru-RU":"lt-LT",{day:"numeric",month:"short"})}
                      </div>
                      <button className="btn b-card b-sm" onClick={()=>{
                        setWeekSlide("left");
                        setTimeout(()=>setWeekSlide(null),380);
                        const d=new Date(weekAnchor);d.setDate(d.getDate()+7);setWeekAnchor(d);
                      }}>›</button>
                    </div>
                    {/* Row 2: Actions */}
                    <div style={{display:"flex",alignItems:"center",gap:6,width:"100%"}}>
                      <div className="cal-tabs" style={{flex:1}}>
                        <button className={`cal-tab${calView==="week"?" on":""}`} onClick={()=>setCalView("week")}>{t.cal_week}</button>
                        <button className={`cal-tab${calView==="list"?" on":""}`} onClick={()=>setCalView("list")}>{t.cal_list}</button>
                      </div>
                      <button className="btn b-card b-sm" style={{padding:"4px 8px",fontSize:14}} onClick={()=>setCalZoom(z=>Math.max(10,z-4))}>−</button>
                      <button className="btn b-card b-sm" style={{padding:"4px 8px",fontSize:14}} onClick={()=>setCalZoom(z=>Math.min(80,z+4))}>+</button>
                      <button className="btn b-sm" style={{background:mc,color:"var(--bg)",flexShrink:0}} onClick={()=>openNewAppt(null)}>+ {lang==="ru"?"Запись":"Įrašas"}</button>
                      <button className="btn b-sm" style={{flexShrink:0,background:blockMode?"var(--red)":"var(--card2)",color:blockMode?"#fff":"var(--gold)",border:`1px solid ${blockMode?"var(--red)":"var(--gold)"}`}}
                        onClick={()=>{setBlockMode(p=>!p);setBlockSelectedSlots([]);}}>
                        {blockMode?"✕":"🔒"}
                      </button>
                    </div>
                  </div>

                  {calView==="week"&&(<>

                    {/* STICKY DATE HEADER — outside scroll area */}
                    <div className="cal-dh" style={{
                      gridTemplateColumns:`48px repeat(7,1fr)`,
                      position:"sticky",top:0,zIndex:20,
                    }}>
                      <div style={{borderBottom:"2px solid var(--border)",background:"rgba(14,10,6,.98)"}}/>
                      {weekDates.map(d=>(
                        <div key={fmtDate(d)} className={`cal-dhd${fmtDate(d)===todayStr?" td":""}`}
                          style={{background:"rgba(14,10,6,.98)"}}>
                          <span className="day-name">{d.toLocaleDateString(lang==="ru"?"ru-RU":"lt-LT",{weekday:"short"})}</span>
                          <span className="day-num" style={fmtDate(d)===todayStr?{color:mc}:{}}>{d.getDate()}</span>
                        </div>
                      ))}
                    </div>
                    <div className="cal-body" ref={calBodyRef}
                      onTouchStart={e=>{
                        if(e.touches.length===2){
                          e.preventDefault();
                          const dx=e.touches[0].clientX-e.touches[1].clientX;
                          const dy=e.touches[0].clientY-e.touches[1].clientY;
                          pinchRef.current={
                            active:true,
                            startDist:Math.hypot(dx,dy),
                            startZoom:calZoom
                          };
                          // Cancel swipe when pinching
                          swipeRef.current.active=false;
                        } else if(e.touches.length===1){
                          pinchRef.current.active=false;
                          swipeRef.current={
                            active:true,
                            startX:e.touches[0].clientX,
                            startY:e.touches[0].clientY,
                            moved:false
                          };
                        }
                      }}
                      onTouchMove={e=>{
                        if(e.touches.length===2&&pinchRef.current.active){
                          e.preventDefault();
                          const dx=e.touches[0].clientX-e.touches[1].clientX;
                          const dy=e.touches[0].clientY-e.touches[1].clientY;
                          const dist=Math.hypot(dx,dy);
                          const ratio=dist/pinchRef.current.startDist;
                          const raw=pinchRef.current.startZoom*ratio;
                          setCalZoom(Math.round(Math.max(12,Math.min(90,raw))));
                        } else if(e.touches.length===1&&swipeRef.current.active){
                          const dx=e.touches[0].clientX-swipeRef.current.startX;
                          const dy=e.touches[0].clientY-swipeRef.current.startY;
                          // Only horizontal swipe (dx > dy means horizontal)
                          if(Math.abs(dx)>Math.abs(dy)&&Math.abs(dx)>30){
                            swipeRef.current.moved=true;
                            swipeRef.current.dx=dx;
                          }
                        }
                      }}
                      onTouchEnd={e=>{
                        if(swipeRef.current.active&&swipeRef.current.moved){
                          const dx=swipeRef.current.dx||0;
                          if(Math.abs(dx)>60){
                            const dir=dx<0?"left":"right";
                            setWeekSlide(dir);
                            setTimeout(()=>setWeekSlide(null),380);
                            const d=new Date(weekAnchor);
                            d.setDate(d.getDate()+(dx<0?7:-7));
                            setWeekAnchor(d);
                          }
                        }
                        pinchRef.current.active=false;
                        swipeRef.current={active:false};
                      }}
                      onTouchCancel={()=>{
                        pinchRef.current.active=false;
                        swipeRef.current={active:false};
                      }}>
                      <div className={`cal-week${weekSlide?" slide-"+weekSlide:""}`}>
                        <div className="cal-grid" style={{minHeight:HOURS.length*calZoom,gridTemplateColumns:`48px repeat(7,1fr)`,display:"grid"}}>
                          {/* TIME COLUMN */}
                          {(()=>{
                            const TIME_COL = 48; // fixed width always
                            return(
                              <div style={{width:TIME_COL,flexShrink:0,background:"rgba(14,10,6,.98)",position:"sticky",left:0,zIndex:6,borderRight:"1px solid rgba(255,255,255,0.89)"}}>
                                {HOURS.map((h,i)=>{
                                  const isHour = h.endsWith(":00");
                                  const isHalf = h.endsWith(":30");
                                  const showLabel = calZoom>=50 ? true
                                    : calZoom>=24 ? (isHour||isHalf)
                                    : isHour;
                                  return(
                                    <div key={h} style={{
                                      height:calZoom,
                                      display:"flex",
                                      alignItems:"center",
                                      justifyContent:"flex-end",
                                      paddingRight:5,
                                      fontSize:isHour?11:9,
                                      color:isHour?"rgba(255,255,255,0.9)":isHalf?"rgba(255,255,255,0.5)":"transparent",
                                      fontWeight:isHour?800:500,
                                      fontFamily:"'Syne',sans-serif",
                                      letterSpacing:-0.3,
                                      borderBottom:isHour
                                        ?"1px solid rgba(255,255,255,0.15)"
                                        :isHalf?"1px solid rgba(255,255,255,0.06)"
                                        :"1px solid rgba(255,255,255,0.02)",
                                      boxSizing:"border-box",
                                      whiteSpace:"nowrap",
                                      overflow:"visible",
                                    }}>
                                      {showLabel ? h : ""}
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          })()}
                          {weekDates.map(d=>{
                            const ds=fmtDate(d);
                            const dayA=myBookings.filter(b=>b.date===ds&&b.status!=="cancelled");
                            return(
                              <div key={ds} className={fmtDate(d)===todayStr?"td-col":""} style={{position:"relative",minHeight:HOURS.length*calZoom}}>
                                {/* Full-height vertical separator on left of each day */}
                                <div style={{position:"absolute",top:0,bottom:0,left:0,width:1,background:"rgba(255,255,255,0.89)",zIndex:2,pointerEvents:"none"}}/>
                                {/* Hour/half-hour guide lines across full width */}
                                {HOURS.map((h,hi)=>{
                                  const isHour = h.endsWith(":00");
                                  const isHalf = h.endsWith(":30");
                                  if(!isHour&&!isHalf) return null;
                                  return(
                                    <div key={"line-"+h} style={{
                                      position:"absolute",
                                      top: hi*calZoom,
                                      left:0,right:0,
                                      height:0,
                                      borderTop: isHour
                                        ?"1px solid rgba(255,255,255,0.89)"
                                        :"1px solid rgba(255,255,255,0.25)",
                                      zIndex:1,
                                      pointerEvents:"none",
                                    }}/>
                                  );
                                })}
                                {/* Current time line */}
                                {fmtDate(d)===todayStr&&(()=>{
                                  const nowMins = nowTime.getHours()*60+nowTime.getMinutes();
                                  const startMins = timeToMins(HOURS[0]);
                                  const slotH = calZoom; // each slot = 10 min
                                  const top = ((nowMins-startMins)/10)*slotH;
                                  if(top<0||top>HOURS.length*calZoom) return null;
                                  return(
                                    <div className="now-line" style={{top}}>
                                      <div className="now-dot"/>
                                    </div>
                                  );
                                })()}
                                {HOURS.map(h=>{
                                  const cellKey=`${ds}|${h}`;
                                  const isOver=dragOver===cellKey;
                                  const isBlockSelected = blockSelectedSlots.some(s=>s.date===ds&&s.time===h);
                                  const isSlotFree = getSlotStatus(curMasterId,ds,h,[])==="free";
                                  return(
                                    <div key={h}
                                      className={`cal-cell${isOver?" drag-over":""}${blockMode?" block-mode":""}${isBlockSelected?" block-selected":""}${h.endsWith(":00")?" cal-cell-hour":h.endsWith(":30")?" cal-cell-half":""}`}
                                      style={{height:calZoom}}
                                      data-cellkey={cellKey}
                                      onClick={()=>{
                                        if(blockMode){
                                          if(!isSlotFree) return;
                                          setBlockSelectedSlots(p=>
                                            isBlockSelected
                                              ? p.filter(s=>!(s.date===ds&&s.time===h))
                                              : [...p,{date:ds,time:h}]
                                          );
                                          return;
                                        }
                                        if(!dragId&&!touchDragRef.current?.active) openNewAppt({date:d,time:h});
                                      }}
                                      onDragOver={e=>{e.preventDefault();setDragOver(cellKey);}}
                                      onDragLeave={()=>setDragOver(null)}
                                      onDrop={()=>handleDrop(ds,h)}
                                    >
                                      {blockMode&&isSlotFree&&!isBlockSelected&&(
                                        <div className="block-lock-icon">🔒</div>
                                      )}
                                      {isBlockSelected&&(
                                        <div className="block-lock-icon" style={{opacity:1,fontSize:16}}>✕</div>
                                      )}
                                    </div>
                                  );
                                })}
                                {/* Schedule blocks */}
                                {blocks.filter(b=>b.date===ds&&(b.masterId===null||String(b.masterId)===String(curMasterId))).map(blk=>{
                                  const fromH=slotTop(blk.allDay?"09:00":blk.fromTime,calZoom);
                                  const toH=blk.allDay?HOURS.length*calZoom:slotTop(blk.toTime,calZoom);
                                  const h=Math.max(toH-fromH,26);
                                  return(
                                    <div key={blk.id}
                                      className={"ab-block block-type-"+blk.type}
                                      style={{top:fromH+2,height:h-4}}
                                      title={blk.reason||blk.type}
                                      onClick={e=>{
                                        e.stopPropagation();
                                        // Show confirm via state instead of window.confirm
                                        setBlockToDelete(blk.id===blockToDelete?null:blk.id);
                                      }}>
                                      {blockToDelete===blk.id ? (
                                        <div style={{position:"absolute",inset:0,background:"rgba(200,0,0,.92)",display:"flex",alignItems:"center",justifyContent:"center",gap:6,borderRadius:4,zIndex:10}}>
                                          <button style={{fontSize:11,padding:"3px 8px",background:"#fff",border:"none",borderRadius:4,color:"var(--red)",cursor:"pointer",fontWeight:900}}
                                            onClick={async(e)=>{e.stopPropagation();
                                              setBlocks(p=>p.filter(x=>x.id!==blk.id));
                                              try{ await deleteDoc(doc(fbDb,"blocks",blk.id)); }catch(er){}
                                              setBlockToDelete(null);
                                            }}>✓</button>
                                          <button style={{fontSize:11,padding:"3px 8px",background:"rgba(255,255,255,.25)",border:"none",borderRadius:4,color:"#fff",cursor:"pointer",fontWeight:900}}
                                            onClick={e=>{e.stopPropagation();setBlockToDelete(null);}}>✕</button>
                                        </div>
                                      ) : null}
                                      <div className="ab-block-label">
                                        {blk.type==="break"?"☕":blk.type==="vacation"?"🏖️":"🚫"} {blk.reason||(lang==="ru"?blk.type==="break"?"Перерыв":blk.type==="vacation"?"Отпуск":"Закрыто":blk.type)}
                                      </div>
                                    </div>
                                  );
                                })}
                                {isDateSalonClosed(ds)&&<div className="salon-closed-overlay"/>}
                                {dayA.map(appt=>{
                                  const svc=resolveBooking(appt);
                                  const isDragging=dragId===appt.id;
                                  return(
                                    <div key={appt.id}
                                      className={`ab${appt.status==="done"?" done":""}${isDragging?" dragging":""}`}
                                      style={{top:slotTop(appt.time,calZoom),height:slotHeight(svc?.mins||30,calZoom),background:mc,color:"#fff"}}
                                  onTouchStart={e=>{
                                    e.stopPropagation();
                                    e.preventDefault(); // prevent browser scroll immediately
                                    const touch=e.touches[0];
                                    const apptId=appt.id;
                                    const apptName=appt.clientName;
                                    clearTimeout(touchDragRef.current.timer);
                                    touchDragRef.current={
                                      id:apptId,active:false,timer:null,
                                      startX:touch.clientX,startY:touch.clientY
                                    };
                                    touchDragRef.current.timer=setTimeout(()=>{
                                      touchDragRef.current.active=true;
                                      // Lock scroll immediately when drag activates
                                      if(calBodyRef.current) calBodyRef.current.style.overflow="hidden";
                                      document.body.style.overflow="hidden";
                                      setTouchDragGhost({x:touch.clientX,y:touch.clientY,label:`${apptName} → ?`});
                                    },400);
                                  }}
                                  onTouchMove={e=>{
                                    // If not yet active, check if user is scrolling (big movement = cancel drag)
                                    if(!touchDragRef.current.active){
                                      if(touchDragRef.current.id===appt.id){
                                        const dx=Math.abs(e.touches[0].clientX-touchDragRef.current.startX);
                                        const dy=Math.abs(e.touches[0].clientY-touchDragRef.current.startY);
                                        if(dx>10||dy>10){
                                          // User is scrolling - cancel pending drag
                                          clearTimeout(touchDragRef.current.timer);
                                          touchDragRef.current={id:null,timer:null,active:false};
                                        }
                                      }
                                      return;
                                    }
                                    if(touchDragRef.current.id!==appt.id) return;
                                    e.preventDefault();
                                    e.stopPropagation();
                                    document.body.style.overflow="hidden";
                                    const touch=e.touches[0];
                                    setTouchDragGhost({x:touch.clientX,y:touch.clientY,label:`${appt.clientName} → ?`});
                                    const el=document.elementFromPoint(touch.clientX,touch.clientY);
                                    if(el?.dataset?.cellkey){
                                      setDragOver(el.dataset.cellkey);
                                      const[,t]=el.dataset.cellkey.split("|");
                                      if(t) setTouchDragGhost({x:touch.clientX,y:touch.clientY,label:`${appt.clientName} → ${t}`});
                                    }
                                    // Auto-scroll cal-body when near edges
                                    const calBody = calBodyRef.current;
                                    if(calBody){
                                      const rect = calBody.getBoundingClientRect();
                                      const y = touch.clientY;
                                      const threshold = 80;
                                      const speed = 8;
                                      if(y > rect.bottom - threshold){
                                        calBody.scrollTop += speed;
                                      } else if(y < rect.top + threshold){
                                        calBody.scrollTop -= speed;
                                      }
                                      // Horizontal auto-scroll
                                      const x = touch.clientX;
                                      if(x > rect.right - 40){
                                        calBody.scrollLeft += speed;
                                      } else if(x < rect.left + 60){
                                        calBody.scrollLeft -= speed;
                                      }
                                    }
                                  }}
                                  onTouchEnd={e=>{
                                    document.body.style.overflow="";
                                    if(calBodyRef.current) calBodyRef.current.style.overflow="";
                                    clearTimeout(touchDragRef.current.timer);
                                    if(touchDragRef.current.active&&touchDragRef.current.id===appt.id){
                                      const touch=e.changedTouches[0];
                                      const el=document.elementFromPoint(touch.clientX,touch.clientY);
                                      if(el?.dataset?.cellkey){
                                        const[targetDate,targetTime]=el.dataset.cellkey.split("|");
                                        if(targetDate&&targetTime) handleDrop(targetDate,targetTime,appt.id);
                                      }
                                    }
                                    touchDragRef.current={id:null,timer:null,active:false};
                                    setTouchDragGhost(null);
                                    setDragOver(null);
                                  }}
                                  onTouchCancel={()=>{
                                    document.body.style.overflow="";
                                    if(calBodyRef.current) calBodyRef.current.style.overflow="";
                                    clearTimeout(touchDragRef.current.timer);
                                    touchDragRef.current={id:null,timer:null,active:false};
                                    setTouchDragGhost(null);
                                    setDragOver(null);
                                  }}
                                      draggable
                                      onDragStart={e=>{setDragId(appt.id);e.dataTransfer.effectAllowed="move";}}
                                      onDragEnd={()=>{setDragId(null);setDragOver(null);}}
                                      onClick={e=>{e.stopPropagation();setDetailAppt(appt);setModal("detail");}}
                                    >
                                      <div className="ab-name">{appt.clientName}</div>
                                      <div className="ab-svc">{svc?.name}</div>
                                      <div className="ab-drag-hint">✥ {lang==="ru"?"перетащить":"vilkti"}</div>
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </>)}

                  {calView==="list"&&(
                    <div className="list-view">
                      {weekDates.map(d=>{
                        const ds=fmtDate(d);
                        const dayA=myBookings.filter(b=>b.date===ds&&b.status!=="cancelled").sort((a,b)=>a.time.localeCompare(b.time));
                        if(!dayA.length) return null;
                        return(
                          <div key={ds} className="ldg">
                            <div className="ldh">{d.toLocaleDateString(lang==="ru"?"ru-RU":"lt-LT",{weekday:"long",day:"numeric",month:"long"})}{ds===todayStr?" 📍":""}</div>
                            {dayA.map(appt=>{
                              const svc=resolveBooking(appt);
                              return(
                                <div key={appt.id} className="li" onClick={()=>{setDetailAppt(appt);setModal("detail");}}>
                                  <div className="li-time" style={{color:mc}}>{appt.time}</div>
                                  <div className="li-bar" style={{background:mc}}/>
                                  <div className="li-info">
                                    <div className="li-name">{appt.clientName}</div>
                                    <div className="li-svc">{svc?.name} · {appt.clientPhone}</div>
                                  </div>
                                  <div className="li-price" style={{color:mc}}>{svc?.price}€</div>
                                  <span className={`badge ${appt.status==="done"?"bgr":"bor"}`}>{appt.status==="done"?t.status_done:lang==="ru"?"Ждёт":"Laukia"}</span>
                                </div>
                              );
                            })}
                          </div>
                        );
                      }).filter(Boolean)}
                      {weekDates.every(d=>!myBookings.find(b=>b.date===fmtDate(d)))&&<div className="no-appts">{t.no_appts}</div>}
                    </div>
                  )}
                </>}

                {/* CLIENTS */}
                {mTab==="clients"&&(
                  <div style={{padding:"22px"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
                      <div>
                        <div className="stag">{t.clients_tab}</div>
                        <h2 style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:28,letterSpacing:1}}>{masterClients.length} {lang==="ru"?"клиентов":"klientų"}</h2>
                      </div>
                      <button className="btn b-sm" style={{background:mc,color:"var(--bg)"}} onClick={()=>openNewAppt(null)}>{t.new_appt}</button>
                        <button className="btn b-sm" style={{background:"var(--card2)",color:"var(--gold)",border:"1px solid var(--gold)"}} onClick={()=>{setBlockForm({date:fmtDate(weekDates[0]),fromTime:"13:00",toTime:"14:00",allDay:false,type:"break",reason:""});setBlockModal(true);}}>🚫 {t.block_add}</button>
                    </div>
                    {masterClients.length===0?<div className="no-appts">{t.no_appts}</div>:(
                      <div style={{display:"flex",flexDirection:"column",gap:10}}>
                        {masterClients.sort((a,b)=>b.visits-a.visits).map((c,i)=>(
                          <div key={i} style={{background:"var(--card)",border:"1px solid var(--b2)",borderRadius:12,padding:"14px 16px",display:"flex",alignItems:"center",gap:12}}>
                            <div style={{width:42,height:42,borderRadius:"50%",background:mc+"22",color:mc,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:18,flexShrink:0}}>
                              {c.name[0]}
                            </div>
                            <div style={{flex:1,minWidth:0}}>
                              <div style={{fontWeight:700,fontSize:14,marginBottom:2}}>{c.name}</div>
                              <div style={{fontSize:12,color:"var(--mu2)",marginBottom:4}}>{c.phone||"—"}</div>
                              <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
                                <span style={{fontSize:11,color:mc}}>📅 {c.visits} {lang==="ru"?"визитов":"vizitų"}</span>
                                <span style={{fontSize:11,color:"var(--gr)"}}>💰 {c.total}€</span>
                                {c.lastDate&&<span style={{fontSize:11,color:"var(--mu2)"}}>🕐 {new Date(c.lastDate).toLocaleDateString(lang==="ru"?"ru-RU":"lt-LT",{day:"numeric",month:"short"})}</span>}
                              </div>
                            </div>
                            <button className="btn b-card b-sm" style={{flexShrink:0,fontSize:11}}
                              onClick={()=>{setNewAppt(p=>({...p,clientName:c.name,clientPhone:c.phone||"",clientMode:"existing",date:todayStr,serviceIds:[],notes:""}));setModal("newAppt");}}>
                              + {lang==="ru"?"Запись":"Įrašas"}
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* STATS */}
                {mTab==="stats"&&(
                  <div style={{padding:"22px"}}>
                    <div className="stag">{t.stats_tab}</div>
                    <h2 style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:28,letterSpacing:1,marginBottom:20}}>{lang==="ru"?"СТАТИСТИКА":"STATISTIKA"}</h2>
                    <div className="sg">
                      {[{lbl:t.total_today,a:statsToday.appts,r:statsToday.rev},{lbl:t.total_week,a:statsWeek.appts,r:statsWeek.rev},{lbl:t.total_all,a:statsAll.appts,r:statsAll.rev}].map(s=>[
                        <div key={s.lbl+"a"} className="sc"><div className="sc-lbl">{s.lbl} · {t.appts_count}</div><div className="sc-val" style={{color:mc}}>{s.a}</div></div>,
                        <div key={s.lbl+"r"} className="sc"><div className="sc-lbl">{s.lbl} · {t.revenue}</div><div className="sc-val g">{s.r}€</div></div>,
                      ]).flat()}
                    </div>
                    <div className="stag" style={{marginBottom:10}}>{t.popular_services}</div>
                    {(masterObj.services||[]).map(svc=>{
                      const cnt=myBookings.filter(b=>{const ids=Array.isArray(b.serviceIds)?b.serviceIds:(b.serviceId?[b.serviceId]:[]);return ids.some(id=>String(id)===String(svc.id));}).length;
                      if(!cnt) return null;
                      return(
                        <div key={svc.id} style={{display:"flex",alignItems:"center",gap:10,marginBottom:9}}>
                          <div style={{width:140,fontSize:11,color:"var(--mu2)",fontWeight:700,flexShrink:0}}>{lang==="ru"?svc.name_ru:svc.name_lt}</div>
                          <div style={{flex:1,height:5,background:"var(--border)",borderRadius:3}}>
                            <div style={{width:`${(cnt/myBookings.length)*100}%`,height:"100%",background:`linear-gradient(90deg,${mc},var(--gr))`,borderRadius:3}}/>
                          </div>
                          <div style={{width:28,textAlign:"right",fontFamily:"'Bebas Neue',sans-serif",fontSize:15,color:mc}}>{cnt}×</div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* REVIEWS TAB */}
                {mTab==="reviews"&&(()=>{
                  const{avg,count}=getMasterRating(masterObj.id);
                  const masterRevs=reviews.filter(r=>String(r.masterId)===String(masterObj.id)).sort((a,b)=>new Date(b.date)-new Date(a.date));
                  return(
                    <div style={{padding:"22px"}}>
                      <div className="stag">{t.reviews_tab}</div>
                      <h2 style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:28,letterSpacing:1,marginBottom:18}}>{lang==="ru"?"МОИ ОТЗЫВЫ":"MANO ATSILIEPIMAI"}</h2>
                      {/* Rating summary */}
                      <div style={{display:"flex",alignItems:"center",gap:18,marginBottom:24,padding:"18px 20px",background:"var(--card)",borderRadius:12,border:`1px solid ${mc}44`}}>
                        <div>
                          <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:58,color:mc,lineHeight:1}}>{count>0?avg:"—"}</div>
                          <div style={{marginTop:4}}><StarRow rating={Math.round(avg)} size={16}/></div>
                          <div style={{fontSize:11,color:"var(--mu)",marginTop:3}}>{count} {t.reviews_count}</div>
                        </div>
                        <div style={{flex:1}}>
                          {[5,4,3,2,1].map(star=>{
                            const cnt=masterRevs.filter(r=>r.rating===star).length;
                            const pct=count>0?(cnt/count)*100:0;
                            return(
                              <div key={star} style={{display:"flex",alignItems:"center",gap:7,marginBottom:5}}>
                                <span style={{fontSize:10,color:"var(--mu)",width:12,textAlign:"right"}}>{star}</span>
                                <span style={{color:"var(--gold)",fontSize:10}}>★</span>
                                <div style={{flex:1,height:5,background:"var(--border)",borderRadius:3}}>
                                  <div style={{width:`${pct}%`,height:"100%",background:mc,borderRadius:3}}/>
                                </div>
                                <span style={{fontSize:10,color:"var(--mu)",width:16}}>{cnt}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                      {/* Review list */}
                      {masterRevs.length===0?<div className="no-appts">{t.review_empty}</div>
                      :masterRevs.map(r=>(
                        <div key={r.id} style={{background:"var(--card)",border:`1px solid ${r.rating>=4?mc+"44":"var(--border)"}`,borderRadius:9,padding:"12px 14px",marginBottom:9,borderLeft:`3px solid ${r.rating>=4?mc:r.rating>=3?"var(--or)":"var(--red)"}`}}>
                          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5}}>
                            <div style={{display:"flex",alignItems:"center",gap:9}}>
                              <div style={{width:30,height:30,borderRadius:"50%",background:mc+"22",color:mc,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:900}}>{r.clientName[0]}</div>
                              <div>
                                <div style={{fontWeight:800,fontSize:12}}>{r.clientName}</div>
                                <div style={{fontSize:10,color:"var(--mu)"}}>{new Date(r.date).toLocaleDateString(lang==="ru"?"ru-RU":"lt-LT",{day:"numeric",month:"long",year:"numeric"})}</div>
                              </div>
                            </div>
                            <StarRow rating={r.rating} size={12}/>
                          </div>
                          <div style={{fontSize:12,color:"var(--mu2)",lineHeight:1.6,fontStyle:"italic"}}>"{r.text}"</div>
                        </div>
                      ))}
                    </div>
                  );
                })()}

              </div>
            </div>
          );
        })()}
        {/* NOTIFICATIONS — bottom sheet on mobile, dropdown on desktop */}
        {showNotifs&&(
          <>
            <div style={{position:"fixed",inset:0,zIndex:9990,background:"rgba(0,0,0,.5)"}} onClick={()=>setShowNotifs(false)}/>
            <div style={{
              position:"fixed",bottom:0,left:0,right:0,
              background:"var(--dark)",borderRadius:"20px 20px 0 0",
              zIndex:9991,maxHeight:"75vh",display:"flex",flexDirection:"column",
              border:"1px solid var(--border)",
              animation:"slideUp .25s ease"
            }} onClick={e=>e.stopPropagation()}>
              {/* Handle */}
              <div style={{width:36,height:4,background:"var(--border)",borderRadius:2,margin:"14px auto 0"}}/>
              {/* Header */}
              <div style={{padding:"12px 16px",borderBottom:"1px solid var(--border)"}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:unreadCount>0?8:0}}>
                  <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:20,letterSpacing:1}}>
                    🔔 {t.notif_title}
                    {unreadCount>0&&<span style={{fontSize:11,background:"var(--red)",color:"#fff",padding:"2px 7px",borderRadius:20,fontWeight:800,marginLeft:8}}>{unreadCount}</span>}
                  </div>
                  <button style={{background:"none",border:"none",cursor:"pointer",color:"var(--mu)",fontSize:22,lineHeight:1,padding:"0 4px"}} onClick={()=>setShowNotifs(false)}>✕</button>
                </div>
                {unreadCount>0&&<button className="btn b-card b-sm" onClick={markAllRead} style={{fontSize:11,width:"100%"}}>{t.notif_mark_read}</button>}
              </div>
              {/* List */}
              <div style={{overflowY:"auto",flex:1,padding:"8px 0"}}>
                {myNotifications.length===0
                  ?<div style={{padding:"32px",textAlign:"center",color:"var(--mu)",fontSize:13}}>{t.notif_empty}</div>
                  :myNotifications.map(n=>(
                    <div key={n.id} className={`notif-item${n.read?"":" unread"}`}>
                      <div className="notif-item-text">
                        <span className="notif-item-icon">
                          {n.type==="booked"?"✅":n.type==="cancelled"?"❌":n.type==="rescheduled"?"📅":n.type==="block_added"?"🚫":n.type==="block_removed"?"✓":"ℹ️"}
                        </span>
                        {n.text}
                      </div>
                      <div className="notif-item-time">{n.time}</div>
                    </div>
                  ))
                }
              </div>
            </div>
          </>
        )}
        {isOwner&&ownerDrawerOpen&&(
          <>
            <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.6)",zIndex:9998}} onClick={()=>setOwnerDrawerOpen(false)}/>
            <div style={{position:"fixed",bottom:0,left:0,right:0,background:"var(--dark)",borderRadius:"20px 20px 0 0",zIndex:9999,padding:16,borderTop:"1px solid var(--border)",animation:"slideUp .25s ease"}}>
              <div style={{width:36,height:4,background:"var(--border)",borderRadius:2,margin:"0 auto 16px"}}/>
              {[
                {key:"owner",    icon:"👑", label:t.owner_panel},
                {key:"masters",  icon:"✂️", label:t.owner_tab_masters,  badge:masters.length},
                {key:"bookings", icon:"📋", label:t.owner_tab_bookings, badge:bookings.length},
                {key:"stats",    icon:"📊", label:t.owner_tab_stats},
                {key:"reviews",  icon:"⭐", label:t.owner_tab_reviews,  badge:reviews.length},
                {key:"subs",     icon:"💳", label:t.owner_tab_subs},
                {key:"ownercal", icon:"📅", label:lang==="ru"?"Календарь":"Kalendorius"},
                {key:"schedule", icon:"🗓️", label:t.owner_tab_schedule},
                {key:"siteinfo",  icon:"🌐", label:lang==="ru"?"Сайт":"Svetainė"},
                {key:"products", icon:"🛍️", label:lang==="ru"?"Продукция":"Produkcija"},
                {key:"shoporders",icon:"📦", label:lang==="ru"?"Заказы":"Užsakymai", badge:orders.filter(o=>o.status==="pending").length||null},
                {key:"courses",  icon:"🎓", label:lang==="ru"?"Обучение":"Mokymai"},
              ].map(item=>(
                <button key={item.key}
                  style={{display:"flex",alignItems:"center",gap:12,padding:"13px 12px",borderRadius:10,cursor:"pointer",border:"none",
                    background:((item.key==="owner"&&page==="owner")||(item.key!=="owner"&&page==="owner"&&ownerTab===item.key))?"rgba(245,158,11,.12)":"none",
                    color:((item.key==="owner"&&page==="owner")||(item.key!=="owner"&&page==="owner"&&ownerTab===item.key))?"var(--gold)":"var(--wh)",
                    fontFamily:"'Syne',sans-serif",fontSize:14,fontWeight:700,width:"100%",textAlign:"left",transition:"background .15s"}}
                  onClick={()=>{
                    if(item.key==="owner"){ setPage("owner"); }
                    else { setPage("owner"); setOwnerTab(item.key); }
                    setOwnerDrawerOpen(false);
                  }}>
                  <span style={{fontSize:18}}>{item.icon}</span>
                  <span style={{flex:1}}>{item.label}</span>
                  {item.badge!=null&&<span className="owner-badge">{item.badge}</span>}
                </button>
              ))}
            </div>
          </>
        )}
        {page==="owner"&&isOwner&&ownerFormOpen&&(
          <div style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(0,0,0,.7)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
            <div style={{width:"min(540px,98vw)",maxHeight:"90vh",overflowY:"auto"}}>
              <MasterFormModal
                key={ownerMasterEdit||"new"}
                isEdit={!!ownerMasterEdit}
                initialData={ownerMasterEdit ? ownerMasterForm : undefined}
                colors={THEME_COLORS}
                t={t}
                onCancel={handleMasterCancel}
                onSave={handleMasterSave}
              />
            </div>
          </div>
        )}

        {page==="owner"&&isOwner&&(()=>{
          const allStats = {
            revenue: bookings.reduce((a,b)=>{return a+resolveBooking(b).price;},0),
            bookings: bookings.length,
            clients: [...new Set(bookings.map(b=>b.clientEmail||b.clientName))].length,
            masters: masters.length,
          };

          const omf = ownerMasterForm;
          const setOmf = (k,v) => setOwnerMasterForm(f=>({...f,[k]:v}));

          return (
            <div className="owner-cab">
              {/* SIDEBAR */}
              <div className="owner-sb">
                <div className="owner-logo">
                  <div className="owner-crown">👑</div>
                  <div className="owner-title">ВЛАДЕЛЕЦ</div>
                  <div className="owner-sub">BARBER HUB</div>
                </div>
                {[
                  {key:"masters",  icon:"✂️", label:t.owner_tab_masters,  badge:masters.length},
                  {key:"bookings", icon:"📋", label:t.owner_tab_bookings, badge:bookings.length},
                  {key:"stats",    icon:"📊", label:t.owner_tab_stats},
                  {key:"reviews",  icon:"⭐", label:t.owner_tab_reviews,  badge:reviews.length},
                  {key:"subs",     icon:"💳", label:t.owner_tab_subs},
                  {key:"ownercal", icon:"📅", label:lang==="ru"?"Календарь":"Kalendorius"},
                  {key:"schedule",  icon:"🗓️", label:t.owner_tab_schedule},
                  {key:"siteinfo",  icon:"🌐", label:lang==="ru"?"Сайт":"Svetainė"},
                  {key:"courses",  icon:"🎓", label:lang==="ru"?"Обучение":"Mokymai"},
                ].map(item=>(
                  <button key={item.key} className={`owner-link${ownerTab===item.key?" on":""}`} onClick={()=>setOwnerTab(item.key)}>
                    <span className="owner-icon">{item.icon}</span>{item.label}
                    {item.badge!=null&&<span className="owner-badge">{item.badge}</span>}
                  </button>
                ))}
              </div>

              {/* CONTENT */}
              <div className="owner-con">

                {/* MASTERS TAB */}
                {ownerTab==="masters"&&(
                  <div>
                    {/* LEFT — master list */}
                    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:10}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
                        <div>
                          <div className="stag" style={{color:"var(--gold)"}}>✂️ {lang==="ru"?"Команда":"Komanda"}</div>
                          <h2 style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:28,letterSpacing:1}}>{masters.length} {lang==="ru"?"мастеров":"meistrų"}</h2>
                        </div>
                        {!ownerFormOpen&&<button
                          onClick={()=>{setOwnerMasterEdit(null);setOwnerFormOpen(true);}}
                          style={{width:42,height:42,borderRadius:"50%",background:"var(--gold)",border:"none",cursor:"pointer",fontSize:26,color:"var(--bg)",fontWeight:900,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,boxShadow:"0 2px 12px rgba(245,158,11,.4)"}}>
                          +
                        </button>}
                      </div>
                      {masters.map(m=>{
                        const{avg,count}=getMasterRating(m.id);
                        const mBookings=bookings.filter(b=>b.masterId===m.id);
                        const mRev=bookings.reduce((a,b)=>{if(b.masterId!==m.id)return a;return a+resolveBooking(b).price;},0);
                        return(
                          <div key={m.id} className="master-mgmt-card" style={{borderLeft:`4px solid ${m.color}`}}>
                            <div style={{width:50,height:50,borderRadius:"50%",background:m.color+"22",border:`2px solid ${m.color}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:24,flexShrink:0}}>
                              {m.photo?<img src={m.photo} alt="" style={{width:"100%",height:"100%",objectFit:"cover",borderRadius:"50%"}}/>:m.emoji}
                            </div>
                            <div className="master-mgmt-info">
                              <div className="master-mgmt-name">{m.firstName} {m.lastName}</div>
                              <div className="master-mgmt-meta" style={{fontSize:10}}>{lang==="ru"?m.role_ru:m.role_lt}</div>
                              <div style={{display:"flex",gap:12,marginTop:5,flexWrap:"wrap"}}>
                                <span style={{fontSize:11,color:"var(--mu2)"}}>📅 {mBookings.length} {lang==="ru"?"записей":"rezerv."}</span>
                                <span style={{fontSize:11,color:"var(--gr)"}}>💰 {mRev}€</span>
                                {count>0&&<span style={{fontSize:11,color:"var(--gold)"}}>⭐ {avg} ({count})</span>}
                              </div>
                            </div>
                            <div className="master-mgmt-actions">
                              <button onClick={()=>ownerOpenEdit(m)} style={{background:"var(--card2)",border:"1px solid var(--b2)",borderRadius:7,padding:"5px 8px",cursor:"pointer",fontSize:13,color:"var(--wh)"}}>✏️</button>
                              <button onClick={()=>ownerDeleteMaster(m.id)} style={{background:confirmDeleteId===m.id?"var(--red)":"var(--card2)",border:confirmDeleteId===m.id?"1px solid var(--red)":"1px solid var(--b2)",borderRadius:7,padding:"5px 8px",cursor:"pointer",fontSize:confirmDeleteId===m.id?11:13,color:confirmDeleteId===m.id?"#fff":"var(--wh)",whiteSpace:"nowrap",fontWeight:confirmDeleteId===m.id?700:400}}>
                                {confirmDeleteId===m.id?(lang==="ru"?"Удалить?":"Ištrinti?"):"🗑"}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* RIGHT — form rendered outside IIFE above */}
                  </div>
                )}

                {/* SITE INFO TAB */}
                {ownerTab==="siteinfo"&&(
                  <div style={{maxWidth:500}}>
                    <div className="stag" style={{color:"var(--gold)"}}>🌐 {lang==="ru"?"Настройки сайта":"Svetainės nustatymai"}</div>
                    <h2 style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:24,letterSpacing:1,marginBottom:20}}>{lang==="ru"?"Сайт и соцсети":"Svetainė ir socialiniai"}</h2>
                    {[
                      {label:lang==="ru"?"Слоган (RU)":"Šūkis (RU)", key:"tagRu", placeholder:"Клайпеда · Барбершоп с 2016"},
                      {label:lang==="ru"?"Слоган (LT)":"Šūkis (LT)", key:"tagLt", placeholder:"Klaipėda · Kirpykla nuo 2016"},
                      {label:"Instagram", key:"instagram", placeholder:"@barberhub"},
                      {label:"Facebook", key:"facebook", placeholder:"facebook.com/barberhub"},
                      {label:lang==="ru"?"Телефон":"Telefonas", key:"phone", placeholder:"+370 600 00000"},
                      {label:lang==="ru"?"Адрес":"Adresas", key:"address", placeholder:"Minijos 133a, Klaipėda"},
                      {label:lang==="ru"?"Ссылка на карту":"Nuoroda į žemėlapį", key:"mapUrl", placeholder:"https://maps.google.com/..."},
                    ].map(f=>(
                      <div key={f.key} className="field">
                        <label>{f.label}</label>
                        <input value={salonInfo[f.key]||""} onChange={e=>setSalonInfo(p=>({...p,[f.key]:e.target.value}))} placeholder={f.placeholder}/>
                      </div>
                    ))}
                    <button className="btn b-lg" style={{background:"var(--gold)",color:"var(--bg)",fontWeight:800,marginTop:8}}
                      onClick={async()=>{
                        try{ await setDoc(doc(fbDb,"config","salonInfo"),salonInfo); alert(lang==="ru"?"Сохранено!":"Išsaugota!"); }catch(e){}
                      }}>
                      {lang==="ru"?"Сохранить":"Išsaugoti"}
                    </button>

                    {/* Sound settings */}
                    <div style={{marginTop:24,background:"var(--card)",border:"1px solid var(--b2)",borderRadius:12,padding:16}}>
                      <div style={{fontWeight:700,fontSize:14,marginBottom:14,color:"var(--or)"}}>🔊 {lang==="ru"?"Звук":"Garsas"}</div>

                      {/* Sound effects toggle */}
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:"1px solid var(--border)",marginBottom:14}}>
                        <span style={{fontSize:13,fontWeight:600}}>🔔 {lang==="ru"?"Звуковые эффекты":"Garso efektai"}</span>
                        <button onClick={async()=>{
                          const v=!soundEnabled; setSoundEnabled(v);
                          await saveAppSettings({soundEnabled:v});
                        }} style={{width:50,height:26,borderRadius:13,border:"none",cursor:"pointer",position:"relative",background:soundEnabled?"var(--gr)":"var(--border)",transition:"background .2s",flexShrink:0}}>
                          <div style={{position:"absolute",top:3,left:soundEnabled?26:3,width:20,height:20,borderRadius:"50%",background:"#fff",transition:"left .2s"}}/>
                        </button>
                      </div>

                      {/* Melody list — each with its own toggle */}
                      <div style={{fontSize:12,color:"var(--mu)",fontWeight:700,marginBottom:10,textTransform:"uppercase",letterSpacing:1}}>
                        🎵 {lang==="ru"?"Фоновая музыка — выберите и включите":"Foninė muzika — pasirinkite ir įjunkite"}
                      </div>
                      <div style={{display:"flex",flexDirection:"column",gap:6,maxHeight:360,overflowY:"auto"}}>
                        {MELODIES.map(m=>{
                          const isActive = bgMusicEnabled && currentMelodyId===m.id;
                          return(
                            <div key={m.id} style={{
                              display:"flex",alignItems:"center",gap:10,padding:"10px 14px",
                              borderRadius:10,border:`1px solid ${isActive?"var(--or)":"var(--b2)"}`,
                              background:isActive?"var(--or)11":"var(--card2)",
                            }}>
                              <span style={{flex:1,fontSize:13,fontWeight:isActive?700:400,color:isActive?"var(--or)":"var(--wh)"}}>
                                {isActive&&"▶ "}{m.name}
                              </span>
                              <button onClick={async()=>{
                                if(isActive){
                                  // Turn off music
                                  setBgMusicEnabled(false);
                                  stopMarioMusic(bgMusicRef);
                                  await saveAppSettings({bgMusicEnabled:false});
                                } else {
                                  // Switch to this melody and turn on
                                  setCurrentMelodyId(m.id);
                                  setBgMusicEnabled(true);
                                  stopMarioMusic(bgMusicRef);
                                  if(userInteractedRef.current) startMelody(bgMusicRef, m.id);
                                  await saveAppSettings({bgMusicEnabled:true, melodyId:m.id});
                                }
                              }} style={{
                                width:50,height:26,borderRadius:13,border:"none",cursor:"pointer",
                                position:"relative",flexShrink:0,
                                background:isActive?"var(--or)":"var(--border)",transition:"background .2s"
                              }}>
                                <div style={{position:"absolute",top:3,left:isActive?26:3,width:20,height:20,borderRadius:"50%",background:"#fff",transition:"left .2s"}}/>
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}

                {/* ORDERS TAB */}
                {ownerTab==="shoporders"&&(
                  <div>
                    <div className="stag" style={{color:"var(--gold)"}}>📦 {lang==="ru"?"Заказы":"Užsakymai"}</div>
                    <h2 style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:26,letterSpacing:1,marginBottom:16}}>
                      {lang==="ru"?"ЗАКАЗЫ ПРОДУКТОВ":"PRODUKTŲ UŽSAKYMAI"}
                    </h2>

                    {orders.length===0&&(
                      <div style={{color:"var(--mu)",fontSize:13,textAlign:"center",padding:32}}>
                        {lang==="ru"?"Заказов пока нет":"Užsakymų dar nėra"}
                      </div>
                    )}

                    {/* Pending first, then completed */}
                    {["pending","confirmed","done","cancelled"].map(status=>{
                      const statusOrders = orders.filter(o=>o.status===status)
                        .sort((a,b)=>b.createdAt>a.createdAt?1:-1);
                      if(!statusOrders.length) return null;
                      const labels={
                        pending:lang==="ru"?"🔔 Новые":"🔔 Nauji",
                        confirmed:lang==="ru"?"✅ Подтверждены":"✅ Patvirtinti",
                        done:lang==="ru"?"✓ Выданы":"✓ Išduoti",
                        cancelled:lang==="ru"?"✗ Отменены":"✗ Atšaukti",
                      };
                      return(
                        <div key={status} style={{marginBottom:20}}>
                          <div style={{fontSize:12,fontWeight:800,color:"var(--mu)",textTransform:"uppercase",letterSpacing:1,marginBottom:8}}>
                            {labels[status]} ({statusOrders.length})
                          </div>
                          {statusOrders.map(order=>(
                            <div key={order.id} style={{background:"var(--card)",border:`1px solid ${status==="pending"?"var(--or)":"var(--b2)"}`,borderRadius:12,padding:14,marginBottom:8}}>
                              <div style={{display:"flex",gap:12,alignItems:"center",marginBottom:10}}>
                                {order.productPhoto&&<img src={order.productPhoto} alt="" style={{width:48,height:48,objectFit:"cover",borderRadius:8}}/>}
                                <div style={{flex:1}}>
                                  <div style={{fontWeight:700,fontSize:14}}>{order.productName}</div>
                                  <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:18,color:"var(--gr)"}}>{order.price}€</div>
                                </div>
                                <div style={{fontSize:10,color:"var(--mu2)",textAlign:"right"}}>
                                  {new Date(order.createdAt).toLocaleDateString(lang==="ru"?"ru-RU":"lt-LT",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"})}
                                </div>
                              </div>
                              <div style={{fontSize:12,color:"var(--mu2)",marginBottom:10,borderTop:"1px solid var(--border)",paddingTop:8}}>
                                <div>👤 <b>{order.clientName}</b></div>
                                {order.clientPhone&&<div>📞 {order.clientPhone}</div>}
                                {order.clientEmail&&<div>📧 {order.clientEmail}</div>}
                                <div>💵 {lang==="ru"?"Наличными в салоне":"Grynaisiais salone"}</div>
                              </div>
                              {status==="pending"&&(
                                <div style={{display:"flex",gap:6}}>
                                  <button className="btn b-sm" style={{flex:1,background:"var(--gr)",color:"#fff",fontWeight:700}}
                                    onClick={async()=>{
                                      try{ await setDoc(doc(fbDb,"orders",order.id),{...order,status:"confirmed"}); }catch(e){}
                                    }}>
                                    ✓ {lang==="ru"?"Подтвердить":"Patvirtinti"}
                                  </button>
                                  <button className="btn b-sm b-red" style={{flex:1}}
                                    onClick={async()=>{
                                      try{ await setDoc(doc(fbDb,"orders",order.id),{...order,status:"cancelled"}); }catch(e){}
                                    }}>
                                    ✗ {lang==="ru"?"Отменить":"Atšaukti"}
                                  </button>
                                </div>
                              )}
                              {status==="confirmed"&&(
                                <button className="btn b-sm b-full" style={{background:"var(--gold)",color:"var(--bg)",fontWeight:700}}
                                  onClick={async()=>{
                                    try{ await setDoc(doc(fbDb,"orders",order.id),{...order,status:"done"}); }catch(e){}
                                  }}>
                                  📦 {lang==="ru"?"Товар выдан":"Prekė išduota"}
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* PRODUCTS TAB */}
                {ownerTab==="products"&&(
                  <div>
                    <div className="stag" style={{color:"var(--gold)"}}>🛍️ {lang==="ru"?"Продукция":"Produkcija"}</div>
                    <h2 style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:26,letterSpacing:1,marginBottom:16}}>
                      {lang==="ru"?"НАШИ ПРОДУКТЫ":"MŪSŲ PRODUKTAI"}
                    </h2>

                    {/* Add / Edit product form */}
                    <div style={{background:"var(--card)",border:`1px solid ${editingProduct?"var(--or)":"var(--b2)"}`,borderRadius:14,padding:18,marginBottom:20}}>
                      <div style={{fontWeight:700,fontSize:13,marginBottom:14,color:editingProduct?"var(--or)":"var(--gold)"}}>
                        {editingProduct?(lang==="ru"?"✏️ Редактировать продукт":"✏️ Redaguoti produktą"):`+ ${lang==="ru"?"Добавить продукт":"Pridėti produktą"}`}
                      </div>
                      <div className="g2">
                        <div className="field"><label>{lang==="ru"?"Название":"Pavadinimas"}</label>
                          <input value={productForm.name} onChange={e=>setProductForm(f=>({...f,name:e.target.value}))} placeholder={lang==="ru"?"Шампунь Kerastase":"Šampūnas"}/></div>
                        <div className="field"><label>{lang==="ru"?"Цена":"Kaina"}</label>
                          <input value={productForm.price} onChange={e=>setProductForm(f=>({...f,price:e.target.value}))} placeholder="29.99" type="number"/></div>
                      </div>
                      <div className="field"><label>{lang==="ru"?"Категория":"Kategorija"}</label>
                        <select value={productForm.category} onChange={e=>setProductForm(f=>({...f,category:e.target.value}))}>
                          <option value="">—</option>
                          {["Шампунь","Кондиционер","Маска","Масло","Стайлинг","Уход за бородой","Другое"].map(c=>(
                            <option key={c} value={c}>{c}</option>
                          ))}
                        </select></div>
                      <div className="field"><label>{lang==="ru"?"Описание":"Aprašymas"}</label>
                        <textarea value={productForm.description} onChange={e=>setProductForm(f=>({...f,description:e.target.value}))}
                          placeholder={lang==="ru"?"Для кого подходит, как использовать...":"Kam tinka, kaip naudoti..."}
                          style={{minHeight:70}}/></div>

                      {/* In stock toggle */}
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 0",borderBottom:"1px solid var(--border)",marginBottom:12}}>
                        <span style={{fontSize:13,fontWeight:700}}>{lang==="ru"?"В наличии":"Sandėlyje"}</span>
                        <button onClick={()=>setProductForm(f=>({...f,inStock:!f.inStock}))}
                          style={{width:50,height:26,borderRadius:13,border:"none",cursor:"pointer",position:"relative",background:productForm.inStock?"var(--gr)":"var(--border)",transition:"background .2s"}}>
                          <div style={{position:"absolute",top:3,left:productForm.inStock?26:3,width:20,height:20,borderRadius:"50%",background:"#fff",transition:"left .2s"}}/>
                        </button>
                      </div>

                      <div className="field"><label>{lang==="ru"?"Фото продукта":"Produkto nuotrauka"}</label>
                        <input type="file" accept="image/*" onChange={e=>{
                          const file=e.target.files?.[0]; if(!file) return;
                          const img=new Image(); const url=URL.createObjectURL(file);
                          img.onload=()=>{
                            const canvas=document.createElement("canvas");
                            const MAX=600; let w=img.width,h=img.height;
                            if(w>h){if(w>MAX){h=Math.round(h*MAX/w);w=MAX;}}else{if(h>MAX){w=Math.round(w*MAX/h);h=MAX;}}
                            canvas.width=w;canvas.height=h;
                            canvas.getContext("2d").drawImage(img,0,0,w,h);
                            setProductForm(f=>({...f,photo:canvas.toDataURL("image/jpeg",0.75)}));
                            URL.revokeObjectURL(url);
                          };img.src=url;
                        }}/>
                        {productForm.photo&&<img src={productForm.photo} alt="" style={{width:100,height:100,objectFit:"cover",borderRadius:8,marginTop:6}}/>}
                      </div>

                      <div style={{display:"flex",gap:8}}>
                        <button className="btn b-lg" style={{flex:1,background:productForm.name?"var(--gold)":"var(--border)",color:"var(--bg)",fontWeight:800}}
                          disabled={!productForm.name||productSaving}
                          onClick={async()=>{
                            if(!productForm.name) return;
                            setProductSaving(true);
                            try{
                              const data={...productForm,price:parseFloat(productForm.price)||0,createdAt:editingProduct?.createdAt||new Date().toISOString()};
                              if(editingProduct){
                                await setDoc(doc(fbDb,"products",editingProduct.id),data);
                                setEditingProduct(null);
                              } else {
                                await addDoc(collection(fbDb,"products"),{...data,createdAt:new Date().toISOString()});
                              }
                              setProductForm({name:"",description:"",price:"",photo:"",category:"",inStock:true});
                            }catch(e){ alert(lang==="ru"?"Ошибка":"Klaida"); }
                            setProductSaving(false);
                          }}>
                          {productSaving?"...":(editingProduct?(lang==="ru"?"Сохранить изменения":"Išsaugoti"):(lang==="ru"?"Добавить":"Pridėti"))}
                        </button>
                        {editingProduct&&(
                          <button className="btn b-lg" style={{background:"var(--card2)",color:"var(--mu)"}}
                            onClick={()=>{setEditingProduct(null);setProductForm({name:"",description:"",price:"",photo:"",category:"",inStock:true});}}>
                            {lang==="ru"?"Отмена":"Atšaukti"}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Products list */}
                    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:10}}>
                      {products.sort((a,b)=>b.createdAt>a.createdAt?1:-1).map(p=>(
                        <div key={p.id} style={{background:"var(--card)",border:`1px solid ${editingProduct?.id===p.id?"var(--or)":"var(--b2)"}`,borderRadius:12,overflow:"hidden"}}>
                          {p.photo&&<img src={p.photo} alt="" style={{width:"100%",height:120,objectFit:"cover"}}/>}
                          {!p.photo&&<div style={{width:"100%",height:80,background:"var(--card2)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:32}}>🧴</div>}
                          <div style={{padding:"8px 10px"}}>
                            <div style={{display:"flex",alignItems:"center",gap:4,marginBottom:2}}>
                              <div style={{fontWeight:700,fontSize:12,flex:1}}>{p.name}</div>
                              <span style={{fontSize:9,fontWeight:700,color:p.inStock!==false?"var(--gr)":"var(--red)"}}>{p.inStock!==false?"●":"○"}</span>
                            </div>
                            {p.category&&<div style={{fontSize:10,color:"var(--gold)",marginBottom:4}}>{p.category}</div>}
                            {p.price>0&&<div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:16,color:"var(--gr)"}}>{p.price}€</div>}
                            <div style={{display:"flex",gap:4,marginTop:6}}>
                              <button onClick={()=>{
                                setEditingProduct(p);
                                setProductForm({name:p.name||"",description:p.description||"",price:p.price||"",photo:p.photo||"",category:p.category||"",inStock:p.inStock!==false});
                                window.scrollTo(0,0);
                              }} style={{flex:1,background:"var(--card2)",border:"1px solid var(--border)",borderRadius:6,padding:"3px 0",color:"var(--or)",fontSize:11,cursor:"pointer",fontWeight:700}}>
                                ✏️
                              </button>
                              <button onClick={async()=>{
                                // Toggle stock
                                const updated={...p,inStock:p.inStock===false?true:false};
                                try{ await setDoc(doc(fbDb,"products",p.id),updated); }catch(e){}
                              }} style={{flex:1,background:p.inStock!==false?"rgba(31,186,122,.15)":"rgba(255,50,50,.15)",border:`1px solid ${p.inStock!==false?"var(--gr)":"var(--red)"}`,borderRadius:6,padding:"3px 0",color:p.inStock!==false?"var(--gr)":"var(--red)",fontSize:10,cursor:"pointer",fontWeight:700}}>
                                {p.inStock!==false?"✓":"✗"}
                              </button>
                              <button onClick={async()=>{
                                try{ await deleteDoc(doc(fbDb,"products",p.id)); }catch(e){}
                              }} style={{flex:1,background:"none",border:"1px solid var(--border)",borderRadius:6,padding:"3px 0",color:"var(--mu)",fontSize:11,cursor:"pointer"}}>
                                🗑
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    {products.length===0&&<div style={{color:"var(--mu)",fontSize:13,textAlign:"center",padding:24}}>
                      {lang==="ru"?"Продуктов пока нет":"Produktų dar nėra"}
                    </div>}
                  </div>
                )}

                {/* COURSES TAB */}
                {ownerTab==="courses"&&(
                  <div>
                    <div className="stag" style={{color:"var(--gold)"}}>🎓 {lang==="ru"?"Обучение":"Mokymai"}</div>
                    <h2 style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:24,letterSpacing:1,marginBottom:16}}>{lang==="ru"?"Курсы":"Kursai"}</h2>
                    {/* Add course form */}
                    <div style={{background:"var(--card)",borderRadius:12,padding:16,border:"1px solid var(--b2)",marginBottom:16}}>
                      <div style={{fontWeight:700,fontSize:13,marginBottom:12}}>{lang==="ru"?"+ Добавить курс":"+ Pridėti kursą"}</div>
                      <CourseForm lang={lang} onSave={async(c)=>{
                        try{ await addDoc(collection(fbDb,"courses"),{...c,createdAt:new Date().toISOString()}); }catch(e){}
                      }}/>
                    </div>
                    {/* Courses list */}
                    {courses.map(c=>(
                      <div key={c.id} style={{background:"var(--card)",borderRadius:12,padding:14,border:"1px solid var(--b2)",marginBottom:8}}>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                          <div>
                            <div style={{fontWeight:700,fontSize:15}}>{c.name}</div>
                            <div style={{fontSize:12,color:"var(--mu2)",marginTop:4}}>💰 {c.price}€ · ⏱ {c.duration} · 📍 {c.location}</div>
                            {c.description&&<div style={{fontSize:11,color:"var(--mu)",marginTop:4}}>{c.description}</div>}
                          </div>
                          <button onClick={async()=>{ try{ await deleteDoc(doc(fbDb,"courses",c.id)); }catch(e){} }}
                            style={{background:"none",border:"none",cursor:"pointer",color:"var(--red)",fontSize:16}}>🗑</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* ALL BOOKINGS TAB */}
                {ownerTab==="bookings"&&(
                  <div>
                    <div className="stag" style={{color:"var(--gold)"}}>📋 {lang==="ru"?"Все записи":"Visos rezervacijos"}</div>
                    <h2 style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:28,letterSpacing:1,marginBottom:18}}>{bookings.length} {lang==="ru"?"записей":"rezervacijų"}</h2>
                    {/* Group by master */}
                    {masters.map(m=>{
                      const mBks=bookings.filter(b=>b.masterId===m.id).sort((a,b)=>a.date.localeCompare(b.date)||a.time.localeCompare(b.time));
                      if(!mBks.length) return null;
                      return(
                        <div key={m.id} style={{marginBottom:24}}>
                          <div style={{display:"flex",alignItems:"center",gap:9,marginBottom:10,paddingBottom:7,borderBottom:`2px solid ${m.color}44`}}>
                            <span style={{fontSize:18}}>{m.emoji}</span>
                            <span style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:18,letterSpacing:1,color:m.color}}>{m.firstName} {m.lastName}</span>
                            <span className="badge" style={{background:m.color+"20",color:m.color}}>{mBks.length}</span>
                          </div>
                          {mBks.map(b=>{
                            const svc=resolveBooking(b);
                            return(
                              <div key={b.id} className="all-bookings-row">
                                <div className="all-bk-time" style={{color:m.color}}>{b.time}</div>
                                <div style={{width:3,height:36,borderRadius:2,background:m.color,flexShrink:0}}/>
                                <div className="all-bk-info">
                                  <div className="all-bk-client">{b.clientName}</div>
                                  <div className="all-bk-meta">{svc?.name} · {b.date} · {b.clientPhone}</div>
                                </div>
                                <span style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:16,color:m.color,flexShrink:0}}>{svc?.price}€</span>
                                <span className={`badge ${b.status==="done"?"bgr":"bor"}`}>{b.status==="done"?t.status_done:lang==="ru"?"Ждёт":"Laukia"}</span>
                                <button className="btn b-red b-sm" style={{flexShrink:0}} onClick={()=>deleteAppt(b.id)}>🗑</button>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                    {bookings.length===0&&<div className="no-appts">{t.owner_no_bookings}</div>}
                  </div>
                )}

                {/* STATS TAB */}
                {ownerTab==="stats"&&(()=>{
                  const filteredBks = bookings.filter(b=>{
                    if(b.status==="cancelled") return false;
                    if(statsMaster && String(b.masterId)!==String(statsMaster)) return false;
                    if(statsPeriod==="day") return b.date===statsDay;
                    if(statsPeriod==="month") return b.date?.startsWith(statsMonth);
                    if(statsPeriod==="year") return b.date?.startsWith(statsYear);
                    return true;
                  });

                  const revenue = filteredBks.reduce((a,b)=>a+resolveBooking(b).price,0);
                  const uniqueClients = new Set(filteredBks.map(b=>b.clientEmail||b.clientName)).size;

                  return(
                  <div>
                    <div className="stag" style={{color:"var(--gold)"}}>📊 {lang==="ru"?"Статистика":"Statistika"}</div>
                    <h2 style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:28,letterSpacing:1,marginBottom:16}}>{lang==="ru"?"АНАЛИТИКА":"ANALITIKA"}</h2>

                    {/* Master selector */}
                    <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:14}}>
                      <button onClick={()=>setStatsMaster(null)}
                        style={{padding:"6px 14px",borderRadius:20,border:`1px solid ${!statsMaster?"var(--gold)":"var(--b2)"}`,background:!statsMaster?"var(--gold)":"var(--card)",color:!statsMaster?"var(--bg)":"var(--mu2)",fontFamily:"'Syne',sans-serif",fontSize:12,fontWeight:700,cursor:"pointer"}}>
                        {lang==="ru"?"Все мастера":"Visi meistrai"}
                      </button>
                      {masters.map(m=>(
                        <button key={m.id} onClick={()=>setStatsMaster(String(m.id))}
                          style={{padding:"6px 14px",borderRadius:20,border:`1px solid ${statsMaster===String(m.id)?m.color:"var(--b2)"}`,background:statsMaster===String(m.id)?m.color+"22":"var(--card)",color:statsMaster===String(m.id)?m.color:"var(--mu2)",fontFamily:"'Syne',sans-serif",fontSize:12,fontWeight:700,cursor:"pointer"}}>
                          {m.emoji} {m.firstName}
                        </button>
                      ))}
                    </div>

                    {/* Period selector */}
                    <div style={{display:"flex",gap:6,marginBottom:14,flexWrap:"wrap",alignItems:"center"}}>
                      {[["day",lang==="ru"?"День":"Diena"],["month",lang==="ru"?"Месяц":"Mėnuo"],["year",lang==="ru"?"Год":"Metai"],["all",lang==="ru"?"Всё время":"Visas laikas"]].map(([k,lbl])=>(
                        <button key={k} onClick={()=>setStatsPeriod(k)}
                          style={{padding:"6px 14px",borderRadius:20,border:`1px solid ${statsPeriod===k?"var(--or)":"var(--b2)"}`,background:statsPeriod===k?"var(--or)":"var(--card)",color:statsPeriod===k?"var(--bg)":"var(--mu2)",fontFamily:"'Syne',sans-serif",fontSize:12,fontWeight:700,cursor:"pointer"}}>
                          {lbl}
                        </button>
                      ))}
                    </div>

                    {/* Date input */}
                    {statsPeriod==="day"&&(
                      <div style={{marginBottom:14}}>
                        <input type="date" value={statsDay} onChange={e=>setStatsDay(e.target.value)}
                          style={{background:"var(--card)",border:"1px solid var(--b2)",borderRadius:8,padding:"8px 12px",color:"var(--wh)",fontSize:13}}/>
                      </div>
                    )}
                    {statsPeriod==="month"&&(
                      <div style={{marginBottom:14}}>
                        <input type="month" value={statsMonth} onChange={e=>setStatsMonth(e.target.value)}
                          style={{background:"var(--card)",border:"1px solid var(--b2)",borderRadius:8,padding:"8px 12px",color:"var(--wh)",fontSize:13}}/>
                      </div>
                    )}
                    {statsPeriod==="year"&&(
                      <div style={{display:"flex",gap:6,marginBottom:14,flexWrap:"wrap"}}>
                        {[2024,2025,2026,2027].map(y=>(
                          <button key={y} onClick={()=>setStatsYear(String(y))}
                            style={{padding:"6px 14px",borderRadius:8,border:`1px solid ${statsYear===String(y)?"var(--or)":"var(--b2)"}`,background:statsYear===String(y)?"var(--or)22":"var(--card)",color:statsYear===String(y)?"var(--or)":"var(--mu2)",fontSize:13,fontWeight:700,cursor:"pointer"}}>
                            {y}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Stats cards */}
                    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))",gap:10,marginBottom:20}}>
                      {[
                        {lbl:lang==="ru"?"Записей":"Rezervacijų", val:filteredBks.length, icon:"📋", color:"var(--or)"},
                        {lbl:lang==="ru"?"Выручка":"Pajamos", val:`${revenue}€`, icon:"💰", color:"var(--gr)"},
                        {lbl:lang==="ru"?"Клиентов":"Klientų", val:uniqueClients, icon:"👥", color:"var(--gold)"},
                      ].map(s=>(
                        <div key={s.lbl} style={{background:"var(--card)",border:`1px solid ${s.color}33`,borderRadius:12,padding:"16px",textAlign:"center"}}>
                          <div style={{fontSize:24,marginBottom:6}}>{s.icon}</div>
                          <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:32,color:s.color,lineHeight:1}}>{s.val}</div>
                          <div style={{fontSize:11,color:"var(--mu)",marginTop:4,fontWeight:700,textTransform:"uppercase"}}>{s.lbl}</div>
                        </div>
                      ))}
                    </div>

                    {/* Per master breakdown */}
                    {!statsMaster&&(
                      <>
                        <div className="stag" style={{color:"var(--gold)",marginBottom:12}}>{lang==="ru"?"По мастерам":"Pagal meistrus"}</div>
                        {masters.map(m=>{
                          const mBks = filteredBks.filter(b=>String(b.masterId)===String(m.id));
                          const mRev = mBks.reduce((a,b)=>a+resolveBooking(b).price,0);
                          const {avg,count} = getMasterRating(m.id);
                          const pct = revenue>0?(mRev/revenue)*100:0;
                          return(
                            <div key={m.id} style={{background:"var(--card)",border:`1px solid ${m.color}33`,borderRadius:10,padding:"14px 16px",marginBottom:9,cursor:"pointer"}}
                              onClick={()=>setStatsMaster(String(m.id))}>
                              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
                                <span style={{fontSize:20}}>{m.emoji}</span>
                                <span style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:18,color:m.color}}>{m.firstName} {m.lastName}</span>
                                {count>0&&<span style={{fontSize:11,color:"var(--gold)",marginLeft:"auto"}}>⭐ {avg}</span>}
                              </div>
                              <div style={{display:"flex",gap:20,flexWrap:"wrap",marginBottom:10}}>
                                <div><div style={{fontSize:10,color:"var(--mu)",fontWeight:800,textTransform:"uppercase"}}>{lang==="ru"?"Записей":"Rezerv."}</div><div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:28,color:m.color,lineHeight:1}}>{mBks.length}</div></div>
                                <div><div style={{fontSize:10,color:"var(--mu)",fontWeight:800,textTransform:"uppercase"}}>{lang==="ru"?"Выручка":"Pajamos"}</div><div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:28,color:"var(--gr)",lineHeight:1}}>{mRev}€</div></div>
                                <div><div style={{fontSize:10,color:"var(--mu)",fontWeight:800,textTransform:"uppercase"}}>{lang==="ru"?"Доля":"Dalis"}</div><div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:28,color:"var(--gold)",lineHeight:1}}>{Math.round(pct)}%</div></div>
                              </div>
                              <div style={{height:6,background:"var(--border)",borderRadius:3}}>
                                <div style={{width:`${pct}%`,height:"100%",background:`linear-gradient(90deg,${m.color},var(--gr))`,borderRadius:3,transition:"width .4s"}}/>
                              </div>
                            </div>
                          );
                        })}
                      </>
                    )}

                    {/* Bookings list for selected period */}
                    {filteredBks.length>0&&(
                      <>
                        <div className="stag" style={{color:"var(--gold)",marginBottom:12,marginTop:8}}>{lang==="ru"?"Записи":"Rezervacijos"}</div>
                        {filteredBks.sort((a,b)=>a.date<b.date?1:-1).map(b=>{
                          const m=masters.find(x=>String(x.id)===String(b.masterId));
                          const s=resolveBooking(b);
                          return(
                            <div key={b.id} style={{background:"var(--card)",borderRadius:8,padding:"10px 14px",marginBottom:6,display:"flex",gap:10,alignItems:"center",borderLeft:`3px solid ${m?.color||"var(--or)"}`}}>
                              <div style={{flex:1,minWidth:0}}>
                                <div style={{fontWeight:700,fontSize:13,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{b.clientName}</div>
                                <div style={{fontSize:11,color:"var(--mu2)"}}>{s?.name||"—"} · {b.date} {b.time}</div>
                              </div>
                              <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:18,color:"var(--gr)",flexShrink:0}}>{s?.price||0}€</div>
                            </div>
                          );
                        })}
                      </>
                    )}
                    {filteredBks.length===0&&(
                      <div style={{color:"var(--mu)",fontSize:13,textAlign:"center",padding:24}}>{lang==="ru"?"Нет данных за выбранный период":"Nėra duomenų pasirinktu laikotarpiu"}</div>
                    )}
                  </div>
                  );
                })()}

                {/* REVIEWS TAB */}
                {ownerTab==="reviews"&&(
                  <div>
                    <div className="stag" style={{color:"var(--gold)"}}>⭐ {lang==="ru"?"Управление отзывами":"Atsiliepimų valdymas"}</div>
                    <h2 style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:28,letterSpacing:1,marginBottom:16}}>{reviews.length} {t.reviews_count}</h2>
                    {/* Filter */}
                    <div style={{display:"flex",gap:7,marginBottom:16,flexWrap:"wrap"}}>
                      {[["all",t.owner_filter_all],["pos",t.owner_filter_pos],["neg",t.owner_filter_neg]].map(([k,lbl])=>(
                        <button key={k} onClick={()=>setOwnerRevFilter(k)} style={{padding:"5px 14px",borderRadius:20,border:`1px solid ${ownerRevFilter===k?"var(--gold)":"var(--b2)"}`,background:ownerRevFilter===k?"var(--gold)":"var(--card)",color:ownerRevFilter===k?"var(--bg)":"var(--mu2)",fontFamily:"'Syne',sans-serif",fontSize:12,fontWeight:700,cursor:"pointer"}}>{lbl}</button>
                      ))}
                    </div>
                    {reviews
                      .filter(r=>ownerRevFilter==="all"?true:ownerRevFilter==="pos"?r.rating>=4:r.rating<4)
                      .sort((a,b)=>new Date(b.date)-new Date(a.date))
                      .map(r=>{
                        const m=masters.find(x=>x.id===r.masterId);
                        return(
                          <div key={r.id} style={{background:"var(--card)",border:`1px solid ${r.rating>=4?m?.color+"44":"var(--red)44"}`,borderRadius:9,padding:"12px 14px",marginBottom:8,display:"flex",gap:12,alignItems:"flex-start",borderLeft:`3px solid ${r.rating>=4?m?.color||"var(--gr)":"var(--red)"}`}}>
                            <div style={{flex:1}}>
                              <div style={{display:"flex",alignItems:"center",gap:9,marginBottom:5}}>
                                <div style={{width:28,height:28,borderRadius:"50%",background:(m?.color||"var(--or)")+"22",color:m?.color||"var(--or)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:900}}>{r.clientName[0]}</div>
                                <div style={{fontWeight:800,fontSize:13}}>{r.clientName}</div>
                                <StarRow rating={r.rating} size={11}/>
                                <span style={{fontSize:10,color:"var(--mu)",marginLeft:"auto"}}>{r.date}</span>
                              </div>
                              <div style={{fontSize:12,color:"var(--mu2)",lineHeight:1.6,fontStyle:"italic",marginBottom:5}}>"{r.text}"</div>
                              {m&&<div style={{fontSize:10,color:m.color,fontWeight:700}}>{m.emoji} {m.firstName} {m.lastName}</div>}
                            </div>
                            <button className="btn b-red b-sm" style={{flexShrink:0}} onClick={async()=>{
                              setReviews(p=>p.filter(x=>x.id!==r.id));
                              try{ await deleteDoc(doc(fbDb,"reviews",String(r.id))); }catch(e){}
                            }} title={t.owner_review_delete}>🗑</button>
                          </div>
                        );
                      })
                    }
                  </div>
                )}

                {/* SUBSCRIPTIONS TAB */}
                {ownerTab==="subs"&&(()=>{
                  const working = editSubs || subs.map(s=>({...s}));
                  const setW = (fn) => setEditSubs(p=>fn(p||subs.map(s=>({...s,serviceIds:[...(s.serviceIds||[])],perks_ru:[...s.perks_ru],perks_lt:[...s.perks_lt]}))));
                  const upd = (id,k,v) => setW(p=>p.map(s=>s.id===id?{...s,[k]:v}:s));
                  const delSub = (id) => setW(p=>p.filter(s=>s.id!==id));
                  const addSub = () => setW(p=>[...p,{
                    id:`sub_${Date.now()}`,name:"NEW",price:50,popular:false,
                    masterId:null,serviceIds:[],visitsPerMonth:2,
                    perks_ru:["2 визита / мес"],perks_lt:["2 vizitai / mėn"]
                  }]);
                  const save = () => { setSubs(working); setEditSubs(null); setOwnerSubsSaved(true); setTimeout(()=>setOwnerSubsSaved(false),2500); };

                  // All unique services across all masters
                  const allServices = masters.flatMap(m=>(m.services||[]).filter(s=>s.enabled).map(s=>({...s,masterId:m.id,masterName:`${m.firstName} ${m.lastName}`,masterColor:m.color,masterEmoji:m.emoji})));

                  return(
                    <div>
                      <div className="stag" style={{color:"var(--gold)"}}>💳 {lang==="ru"?"Редактор подписок":"Prenumeratų redaktorius"}</div>
                      <h2 style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:28,letterSpacing:1,marginBottom:6}}>{lang==="ru"?"ПОДПИСКИ":"PRENUMERATOS"}</h2>
                      <p style={{fontSize:11,color:"var(--mu2)",marginBottom:20,lineHeight:1.6}}>
                        {lang==="ru"
                          ?"Настройте тарифы: привяжите мастера и услугу, установите количество визитов в месяц."
                          :"Nustatykite tarifus: pridėkite meistrą ir paslaugą, nustatykite vizitų skaičių per mėnesį."
                        }
                      </p>

                      {working.map(s=>{
                        const subMaster = s.masterId ? masters.find(m=>m.id===s.masterId) : null;
                        const masterServices = s.masterId
                          ? (masters.find(m=>m.id===s.masterId)?.services||[]).filter(sv=>sv.enabled)
                          : allServices;

                        return(
                          <div key={s.id} className="sub-edit-card" style={{borderLeft:`4px solid ${s.popular?"var(--gr)":"var(--gold)"}`}}>
                            {/* Header row */}
                            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16,flexWrap:"wrap"}}>
                              <div style={{flex:1,display:"grid",gridTemplateColumns:"1fr 1fr 80px",gap:"0 10px",alignItems:"end"}}>
                                <div className="sf">
                                  <label>{t.owner_sub_name}</label>
                                  <input value={s.name} onChange={e=>upd(s.id,"name",e.target.value)} style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:18,letterSpacing:1}}/>
                                </div>
                                <div className="sf">
                                  <label>{t.owner_sub_price}</label>
                                  <input type="number" min="0" value={s.price} onChange={e=>upd(s.id,"price",parseInt(e.target.value)||0)}/>
                                </div>
                                <div className="sf">
                                  <label style={{whiteSpace:"nowrap"}}>{lang==="ru"?"Хит":"Top"}</label>
                                  <button onClick={()=>upd(s.id,"popular",!s.popular)} style={{width:40,height:32,borderRadius:8,border:"none",cursor:"pointer",background:s.popular?"var(--gr)":"var(--border)",color:s.popular?"var(--bg)":"var(--mu)",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center"}}>
                                    {s.popular?"⭐":"☆"}
                                  </button>
                                </div>
                              </div>
                              <button className="btn b-red b-sm" onClick={()=>delSub(s.id)} title={lang==="ru"?"Удалить подписку":"Ištrinti"}>🗑</button>
                            </div>

                            {/* Visits per month */}
                            <div style={{marginBottom:14}}>
                              <div style={{fontSize:9,color:"var(--mu)",letterSpacing:"1.5px",textTransform:"uppercase",fontWeight:800,marginBottom:6}}>
                                {lang==="ru"?"Визитов в месяц (0 = безлимит)":"Vizitų per mėnesį (0 = neribota)"}
                              </div>
                              <div style={{display:"flex",alignItems:"center",gap:12}}>
                                <input type="range" min="0" max="20" step="1"
                                  value={s.visitsPerMonth}
                                  onChange={e=>upd(s.id,"visitsPerMonth",parseInt(e.target.value))}
                                  style={{flex:1,accentColor:"var(--gold)"}}
                                />
                                <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:32,color:"var(--gold)",minWidth:60,textAlign:"center",lineHeight:1}}>
                                  {s.visitsPerMonth===0?"∞":s.visitsPerMonth}
                                </div>
                              </div>
                            </div>

                            {/* Master picker */}
                            <div style={{marginBottom:12}}>
                              <div style={{fontSize:9,color:"var(--mu)",letterSpacing:"1.5px",textTransform:"uppercase",fontWeight:800,marginBottom:6}}>
                                {lang==="ru"?"Привязать к мастеру":"Priskirti meistrui"}
                              </div>
                              <div style={{display:"flex",gap:7,flexWrap:"wrap"}}>
                                <button
                                  onClick={()=>upd(s.id,"masterId",null)}
                                  style={{padding:"6px 12px",borderRadius:20,border:`1px solid ${s.masterId===null?"var(--gold)":"var(--b2)"}`,background:s.masterId===null?"var(--gold)":"var(--card)",color:s.masterId===null?"var(--bg)":"var(--mu2)",fontSize:12,fontWeight:700,cursor:"pointer"}}
                                >
                                  {lang==="ru"?"Любой мастер":"Bet kuris"}
                                </button>
                                {masters.map(m=>(
                                  <button key={m.id}
                                    onClick={()=>upd(s.id,"masterId",m.id)}
                                    style={{padding:"6px 12px",borderRadius:20,border:`1px solid ${s.masterId===m.id?m.color:"var(--b2)"}`,background:s.masterId===m.id?m.color+"22":"var(--card)",color:s.masterId===m.id?m.color:"var(--mu2)",fontSize:12,fontWeight:700,cursor:"pointer"}}
                                  >
                                    {m.emoji} {m.firstName}
                                  </button>
                                ))}
                              </div>
                            </div>

                            {/* Service picker */}
                            <div style={{marginBottom:14}}>
                              <div style={{fontSize:9,color:"var(--mu)",letterSpacing:"1.5px",textTransform:"uppercase",fontWeight:800,marginBottom:6}}>
                                {lang==="ru"?"Услуги по подписке":"Paslaugos pagal prenumeratą"}
                              </div>
                              <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:6}}>
                                <button
                                  onClick={()=>upd(s.id,"serviceIds",[])}
                                  style={{padding:"5px 11px",borderRadius:20,border:`1px solid ${s.serviceIds.length===0?"var(--gold)":"var(--b2)"}`,background:s.serviceIds.length===0?"var(--gold)":"var(--card)",color:s.serviceIds.length===0?"var(--bg)":"var(--mu2)",fontSize:11,fontWeight:700,cursor:"pointer"}}
                                >
                                  {lang==="ru"?"Все услуги":"Visos paslaugos"}
                                </button>
                                {masterServices.map(sv=>{
                                  const sel=(s.serviceIds||[]).includes(sv.id);
                                  const mc2=sv.masterColor||"var(--or)";
                                  return(
                                    <button key={sv.id}
                                      onClick={()=>{
                                        const cur2=s.serviceIds||[];
                                        upd(s.id,"serviceIds",sel?cur2.filter(x=>x!==sv.id):[...cur2,sv.id]);
                                      }}
                                      style={{padding:"5px 11px",borderRadius:20,border:`1px solid ${sel?mc2:"var(--b2)"}`,background:sel?mc2+"22":"var(--card)",color:sel?mc2:"var(--mu2)",fontSize:11,fontWeight:700,cursor:"pointer"}}
                                    >
                                      {sv.masterEmoji} {lang==="ru"?sv.name_ru:sv.name_lt}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>

                            {/* Perks text */}
                            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 12px",marginBottom:10}}>
                              <div className="sf">
                                <label>{t.owner_sub_perks_ru}</label>
                                <textarea value={s.perks_ru.join("\n")} onChange={e=>upd(s.id,"perks_ru",e.target.value.split("\n"))} style={{minHeight:70,fontSize:12}}/>
                              </div>
                              <div className="sf">
                                <label>{t.owner_sub_perks_lt}</label>
                                <textarea value={s.perks_lt.join("\n")} onChange={e=>upd(s.id,"perks_lt",e.target.value.split("\n"))} style={{minHeight:70,fontSize:12}}/>
                              </div>
                            </div>

                            {/* Preview */}
                            <div style={{padding:"10px 14px",background:"var(--dark)",borderRadius:8,display:"flex",alignItems:"center",gap:14}}>
                              <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:28,color:s.popular?"var(--gr)":"var(--gold)",letterSpacing:1}}>{s.price}€</div>
                              <div style={{fontSize:11,color:"var(--mu2)"}}>
                                <div style={{color:s.popular?"var(--gr)":"var(--gold)",fontWeight:800,marginBottom:2}}>{s.name} · {s.visitsPerMonth===0?"∞":`${s.visitsPerMonth}×`}/мес</div>
                                {s.masterId&&<span style={{color:masters.find(m=>m.id===s.masterId)?.color}}>{masters.find(m=>m.id===s.masterId)?.emoji} {masters.find(m=>m.id===s.masterId)?.firstName} · </span>}
                                {s.serviceIds.length===0
                                  ?(lang==="ru"?"Все услуги":"Visos paslaugos")
                                  :s.serviceIds.map(id=>allServices.find(sv=>sv.id===id)).filter(Boolean).map(sv=>lang==="ru"?sv.name_ru:sv.name_lt).join(", ")
                                }
                              </div>
                            </div>
                          </div>
                        );
                      })}

                      {/* Add + Save */}
                      <div style={{display:"flex",gap:10,marginTop:12,flexWrap:"wrap"}}>
                        <button className="btn b-lg" style={{background:"var(--card)",color:"var(--gold)",border:"2px dashed var(--gold)",fontWeight:800}} onClick={addSub}>
                          + {lang==="ru"?"Добавить подписку":"Pridėti prenumeratą"}
                        </button>
                        <button className="btn b-lg" style={{background:"var(--gold)",color:"var(--bg)",fontWeight:800}} onClick={save}>{t.owner_sub_save}</button>
                        {ownerSubsSaved&&<span style={{alignSelf:"center",fontSize:13,color:"var(--gr)",fontWeight:700}}>{t.owner_sub_saved}</span>}
                      </div>
                    </div>
                  );
                })()}


                {/* OWNER CALENDAR TAB */}
                {ownerTab==="ownercal"&&(()=>{
                  const ownerWeekDates = getWeekDates(ownerCalWeek);
                  const timeColW = 48;
                  const isAllMasters = !ownerCalFilter;

                  // ALL MASTERS MODE: pick one day, columns = masters
                  // SINGLE MASTER MODE: columns = 7 days
                  const [ownerSelDay, setOwnerSelDay] = [
                    ownerCalFilter ? null : (ownerWeekDates.find(d=>fmtDate(d)===todayStr) ? todayStr : fmtDate(ownerWeekDates[0])),
                    () => {}
                  ];

                  // Use separate state for selected day in all-masters mode
                  const selDay = isAllMasters ? ownerSelDay : null;

                  const columns = isAllMasters
                    ? masters.map(m=>({key:String(m.id), label:`${m.emoji} ${m.firstName}`, color:m.color, masterId:String(m.id), date:selDay}))
                    : ownerWeekDates.map(d=>({key:fmtDate(d), label:d.toLocaleDateString(lang==="ru"?"ru-RU":"lt-LT",{weekday:"short",day:"numeric"}), color:"var(--or)", date:fmtDate(d), masterId:ownerCalFilter}));

                  const colCount = columns.length;

                  return(
                  <div style={{display:"flex",flexDirection:"column",height:"100%",overflow:"hidden"}}>
                    {/* Toolbar */}
                    <div style={{padding:"10px 16px",borderBottom:"1px solid var(--border)",display:"flex",gap:8,alignItems:"center",flexWrap:"wrap",background:"var(--dark)",flexShrink:0}}>
                      {isAllMasters ? (
                        // Day picker for all-masters mode
                        <>
                          <button className="btn b-card b-sm" onClick={()=>{setOwnerSelDay(todayStr);setOwnerCalWeek(new Date());}}>{t.cal_today}</button>
                          <div style={{display:"flex",gap:4,overflowX:"auto",flex:1}}>
                            {ownerWeekDates.map(d=>{
                              const ds=fmtDate(d);
                              const isSelected=ownerSelDay===ds;
                              return(
                                <button key={ds} onClick={()=>{setOwnerSelDay(ds);}}
                                  style={{padding:"4px 10px",borderRadius:8,border:`1px solid ${isSelected?"var(--gold)":"var(--b2)"}`,background:isSelected?"var(--gold)":"var(--card)",color:isSelected?"var(--bg)":"var(--mu2)",fontSize:11,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap",flexShrink:0}}>
                                  {d.toLocaleDateString(lang==="ru"?"ru-RU":"lt-LT",{weekday:"short",day:"numeric"})}
                                  {ds===todayStr?" 📍":""}
                                </button>
                              );
                            })}
                          </div>
                          <button className="btn b-card b-sm" onClick={()=>{const d=new Date(ownerCalWeek);d.setDate(d.getDate()-7);setOwnerCalWeek(d);}}>‹ {lang==="ru"?"Нед":"Sav"}</button>
                          <button className="btn b-card b-sm" onClick={()=>{const d=new Date(ownerCalWeek);d.setDate(d.getDate()+7);setOwnerCalWeek(d);}}>› {lang==="ru"?"Нед":"Sav"}</button>
                        </>
                      ) : (
                        // Week nav for single master mode
                        <>
                          <button className="btn b-card b-sm" onClick={()=>setOwnerCalWeek(new Date())}>{t.cal_today}</button>
                          <button className="btn b-card b-sm" onClick={()=>{const d=new Date(ownerCalWeek);d.setDate(d.getDate()-7);setOwnerCalWeek(d);}}>‹</button>
                          <span style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:13,flex:1,textAlign:"center"}}>
                            {ownerWeekDates[0].toLocaleDateString(lang==="ru"?"ru-RU":"lt-LT",{day:"numeric",month:"short"})} – {ownerWeekDates[6].toLocaleDateString(lang==="ru"?"ru-RU":"lt-LT",{day:"numeric",month:"short"})}
                          </span>
                          <button className="btn b-card b-sm" onClick={()=>{const d=new Date(ownerCalWeek);d.setDate(d.getDate()+7);setOwnerCalWeek(d);}}>›</button>
                        </>
                      )}
                      <button className="btn b-card b-sm" style={{padding:"4px 8px"}} onClick={()=>setOwnerCalZoom(z=>Math.max(12,z-4))}>−</button>
                      <button className="btn b-card b-sm" style={{padding:"4px 8px"}} onClick={()=>setOwnerCalZoom(z=>Math.min(80,z+4))}>+</button>
                    </div>

                    {/* Master filter */}
                    <div style={{padding:"6px 16px",borderBottom:"1px solid var(--border)",display:"flex",gap:6,overflowX:"auto",flexShrink:0}}>
                      <button onClick={()=>setOwnerCalFilter(null)}
                        style={{padding:"4px 12px",borderRadius:20,border:`1px solid ${isAllMasters?"var(--gold)":"var(--b2)"}`,background:isAllMasters?"var(--gold)":"var(--card)",color:isAllMasters?"var(--bg)":"var(--mu2)",fontSize:11,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}>
                        {lang==="ru"?"Все мастера":"Visi meistrai"}
                      </button>
                      {masters.map(m=>(
                        <button key={m.id} onClick={()=>setOwnerCalFilter(String(m.id))}
                          style={{padding:"4px 12px",borderRadius:20,border:`1px solid ${ownerCalFilter===String(m.id)?m.color:"var(--b2)"}`,background:ownerCalFilter===String(m.id)?m.color+"22":"var(--card)",color:ownerCalFilter===String(m.id)?m.color:"var(--mu2)",fontSize:11,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}>
                          {m.emoji} {m.firstName}
                        </button>
                      ))}
                    </div>

                    {/* Column headers */}
                    <div style={{display:"grid",gridTemplateColumns:`${timeColW}px repeat(${colCount},1fr)`,borderBottom:"2px solid var(--border)",background:"rgba(14,10,6,.98)",flexShrink:0}}>
                      <div/>
                      {columns.map(col=>(
                        <div key={col.key} style={{padding:"8px 4px",textAlign:"center",borderLeft:"1px solid rgba(255,255,255,0.89)",background:"rgba(14,10,6,.98)"}}>
                          <div style={{fontSize:11,fontWeight:800,color:col.color}}>{col.label}</div>
                          {col.date===todayStr&&<div style={{width:6,height:6,borderRadius:"50%",background:"var(--or)",margin:"2px auto 0"}}/>}
                        </div>
                      ))}
                    </div>

                    {/* Calendar body */}
                    <div style={{flex:1,overflow:"auto",overscrollBehavior:"none"}}>
                      <div style={{display:"grid",gridTemplateColumns:`${timeColW}px repeat(${colCount},minmax(120px,1fr))`,minHeight:HOURS.length*ownerCalZoom}}>
                        {/* Time column */}
                        <div style={{width:timeColW,background:"rgba(14,10,6,.98)",position:"sticky",left:0,zIndex:6,borderRight:"1px solid rgba(255,255,255,0.89)"}}>
                          {HOURS.map(h=>{
                            const isHour=h.endsWith(":00");
                            const isHalf=h.endsWith(":30");
                            const show=ownerCalZoom>=50?true:ownerCalZoom>=24?(isHour||isHalf):isHour;
                            return(
                              <div key={h} style={{height:ownerCalZoom,display:"flex",alignItems:"center",justifyContent:"flex-end",paddingRight:5,fontSize:isHour?11:9,color:isHour?"rgba(255,255,255,0.9)":isHalf?"rgba(255,255,255,0.5)":"transparent",fontWeight:isHour?800:500,borderBottom:isHour?"1px solid rgba(255,255,255,0.15)":isHalf?"1px solid rgba(255,255,255,0.06)":"1px solid rgba(255,255,255,0.02)",boxSizing:"border-box",whiteSpace:"nowrap"}}>
                                {show?h:""}
                              </div>
                            );
                          })}
                        </div>
                        {/* Data columns */}
                        {columns.map(col=>{
                          const colBookings = bookings.filter(b=>
                            b.status!=="cancelled" &&
                            b.date===col.date &&
                            String(b.masterId)===col.masterId
                          );
                          const isToday = col.date===todayStr;
                          return(
                            <div key={col.key} className={isToday?"td-col":""} style={{position:"relative",minHeight:HOURS.length*ownerCalZoom,borderLeft:"1px solid rgba(255,255,255,0.89)"}}>
                              {/* Hour lines */}
                              {HOURS.map((h,hi)=>{
                                const isHour=h.endsWith(":00");
                                const isHalf=h.endsWith(":30");
                                if(!isHour&&!isHalf) return null;
                                return <div key={"l"+h} style={{position:"absolute",top:hi*ownerCalZoom,left:0,right:0,height:0,borderTop:isHour?"1px solid rgba(255,255,255,0.89)":"1px solid rgba(255,255,255,0.25)",zIndex:1,pointerEvents:"none"}}/>;
                              })}
                              {/* Now line */}
                              {isToday&&(()=>{
                                const nowMins=new Date().getHours()*60+new Date().getMinutes();
                                const top=((nowMins-timeToMins(HOURS[0]))/10)*ownerCalZoom;
                                if(top<0||top>HOURS.length*ownerCalZoom) return null;
                                return <div className="now-line" style={{top,zIndex:8}}><div className="now-dot"/></div>;
                              })()}
                              {/* Bookings */}
                              {colBookings.map(appt=>{
                                const master=masters.find(m=>String(m.id)===String(appt.masterId));
                                const mc=master?.color||col.color||"var(--or)";
                                const svc=resolveBooking(appt);
                                const top=slotTop(appt.time,ownerCalZoom);
                                const h=Math.max(slotHeight(svc?.mins||30,ownerCalZoom),20);
                                return(
                                  <div key={appt.id} style={{
                                    position:"absolute",left:2,right:2,top,height:h,
                                    background:mc+"dd",color:"#fff",borderRadius:5,
                                    padding:"2px 5px",fontSize:10,fontWeight:700,
                                    overflow:"hidden",zIndex:5,cursor:"pointer",
                                    borderLeft:`3px solid ${mc}`,
                                    boxShadow:"0 1px 4px rgba(0,0,0,.4)",
                                  }}>
                                    <div style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{appt.clientName}</div>
                                    <div style={{fontSize:8,opacity:0.8}}>{appt.time}{appt.source==="treatwell"?" · TW":""}</div>
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                  );
                })()}

                {ownerTab==="schedule"&&(
                  <div>
                    <div className="stag" style={{color:"var(--gold)"}}>🗓️ {t.owner_tab_schedule}</div>
                    <h2 style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:28,letterSpacing:1,marginBottom:20}}>{lang==="ru"?"РАСПИСАНИЕ САЛОНА":"SALONO TVARKARAŠTIS"}</h2>

                    {/* Work days */}
                    <div className="owner-form" style={{marginBottom:16}}>
                      <div style={{fontSize:10,color:"var(--mu)",fontWeight:800,letterSpacing:"1.5px",textTransform:"uppercase",marginBottom:10}}>{t.salon_days}</div>
                      <div style={{display:"flex",gap:7,flexWrap:"wrap",marginBottom:16}}>
                        {[0,1,2,3,4,5,6].map(d=>{
                          const on=salonSchedule.workDays.includes(d);
                          const labels=lang==="ru"?["Вс","Пн","Вт","Ср","Чт","Пт","Сб"]:["Sk","Pr","An","Tr","Kt","Pt","Š"];
                          return(<button key={d} onClick={()=>saveSalonSchedule({...salonSchedule,workDays:salonSchedule.workDays.includes(d)?salonSchedule.workDays.filter(x=>x!==d):[...salonSchedule.workDays,d].sort()})} style={{width:40,height:40,borderRadius:8,border:`1px solid ${on?"var(--gold)":"var(--b2)"}`,background:on?"var(--gold)":"var(--card)",color:on?"var(--bg)":"var(--mu)",fontSize:12,fontWeight:800,cursor:"pointer"}}>{labels[d]}</button>);
                        })}
                      </div>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 12px",marginBottom:12}}>
                        <div className="sf">
                          <label>{t.salon_work_start}</label>
                          <select value={salonSchedule.workStart} onChange={e=>saveSalonSchedule({...salonSchedule,workStart:e.target.value})}>
                            {HOURS.map(h=><option key={h} value={h}>{h}</option>)}
                          </select>
                        </div>
                        <div className="sf">
                          <label>{t.salon_work_end}</label>
                          <select value={salonSchedule.workEnd} onChange={e=>saveSalonSchedule({...salonSchedule,workEnd:e.target.value})}>
                            {HOURS.map(h=><option key={h} value={h}>{h}</option>)}
                          </select>
                        </div>
                      </div>
                      <div style={{fontSize:11,color:"var(--mu2)",marginBottom:12,padding:"8px 12px",background:"var(--dark)",borderRadius:8}}>
                        ℹ️ {lang==="ru"?"Изменения сразу синхронизируются — сотрудники не смогут записать клиентов вне этих часов":"Pakeitimai iš karto sinchronizuojami"}
                      </div>
                      <button className="btn b-lg" style={{background:"var(--gold)",color:"var(--bg)",fontWeight:800}} onClick={()=>addNotification("block_added","Владелец обновил расписание салона", null, true)}>{t.salon_save}</button>
                    </div>

                    {/* Vacations */}
                    <div className="owner-form" style={{marginBottom:16}}>
                      <div style={{fontSize:10,color:"var(--mu)",fontWeight:800,letterSpacing:"1.5px",textTransform:"uppercase",marginBottom:12}}>{t.salon_vacation}</div>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 12px",marginBottom:10}}>
                        <div className="sf"><label>{t.block_from}</label><input type="date" value={vacForm.dateFrom} onChange={e=>setVacForm(f=>({...f,dateFrom:e.target.value}))}/></div>
                        <div className="sf"><label>{t.block_to}</label><input type="date" value={vacForm.dateTo} onChange={e=>setVacForm(f=>({...f,dateTo:e.target.value}))}/></div>
                      </div>
                      <div className="sf" style={{marginBottom:10}}>
                        <label>{t.block_reason}</label>
                        <input value={vacForm.reason} onChange={e=>setVacForm(f=>({...f,reason:e.target.value}))} placeholder={lang==="ru"?"Новый год, ремонт, праздник...":"Naujieji metai, remontas..."}/>
                      </div>
                      <button className="btn b-or" onClick={()=>{
                        saveSalonSchedule({...salonSchedule,vacations:[...salonSchedule.vacations,{id:"v"+Date.now(),...vacForm}]});
                        addNotification("block_added",`${lang==="ru"?"Владелец закрыл салон":"Savininkas uždarė saloną"}: ${vacForm.dateFrom}${vacForm.dateTo!==vacForm.dateFrom?" → "+vacForm.dateTo:""} ${vacForm.reason?`(${vacForm.reason})`:""}`);
                        setVacForm({dateFrom:todayStr,dateTo:todayStr,reason:""});
                      }}>{t.salon_vacation_add}</button>
                      {salonSchedule.vacations.length>0&&(
                        <div style={{marginTop:12}}>
                          {salonSchedule.vacations.map(v=>(
                            <div key={v.id} style={{display:"flex",alignItems:"center",gap:10,padding:"9px 12px",background:"var(--dark)",borderRadius:8,marginBottom:6}}>
                              <span style={{fontSize:16}}>🏖️</span>
                              <div style={{flex:1}}>
                                <div style={{fontSize:13,fontWeight:700}}>{v.dateFrom===v.dateTo?v.dateFrom:`${v.dateFrom} → ${v.dateTo}`}</div>
                                {v.reason&&<div style={{fontSize:11,color:"var(--mu2)"}}>{v.reason}</div>}
                              </div>
                              <button className="btn b-red b-sm" onClick={()=>{saveSalonSchedule({...salonSchedule,vacations:salonSchedule.vacations.filter(x=>x.id!==v.id)});addNotification("block_removed","Владелец снял выходной", null, true);}}>🗑</button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* All master blocks — owner can delete */}
                    <div>
                      <div style={{fontSize:10,color:"var(--mu)",fontWeight:800,letterSpacing:"1.5px",textTransform:"uppercase",marginBottom:12}}>{lang==="ru"?"Блоки сотрудников":"Darbuotojų blokai"}</div>
                      {blocks.length===0
                        ?<div className="no-appts">{lang==="ru"?"Нет активных блоков":"Nėra aktyvių blokų"}</div>
                        :blocks.sort((a,b)=>a.date.localeCompare(b.date)).map(blk=>{
                          const m=blk.masterId?masters.find(x=>x.id===blk.masterId):null;
                          return(
                            <div key={blk.id} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",background:"var(--card)",border:"1px solid var(--b2)",borderRadius:9,marginBottom:7,borderLeft:`3px solid ${blk.type==="break"?"var(--gold)":blk.type==="vacation"?"#3b82f6":"var(--mu)"}`}}>
                              <span style={{fontSize:18}}>{blk.type==="break"?"☕":blk.type==="vacation"?"🏖️":"🚫"}</span>
                              <div style={{flex:1}}>
                                <div style={{fontSize:13,fontWeight:700}}>{m?`${m.emoji} ${m.firstName} ${m.lastName}`:(lang==="ru"?"Весь салон":"Visas salonas")}</div>
                                <div style={{fontSize:11,color:"var(--mu2)"}}>{blk.date} · {blk.allDay?(lang==="ru"?"Весь день":"Visa diena"):`${blk.fromTime}–${blk.toTime}`}{blk.reason?` · ${blk.reason}`:""}</div>
                              </div>
                              <button className="btn b-red b-sm" onClick={()=>{setBlocks(p=>p.filter(x=>x.id!==blk.id));addNotification("block_removed",`Владелец удалил блок у ${m?.firstName||"салона"} · ${blk.date}`, blk.masterId, true);}}>🗑</button>
                            </div>
                          );
                        })
                      }
                    </div>
                  </div>
                )}
                {/* APP SETTINGS TAB */}
                {ownerTab==="appsettings"&&(
                  <div>
                    <div className="stag" style={{color:"var(--gold)"}}>⚙️ {lang==="ru"?"Настройки приложения":"Programos nustatymai"}</div>
                    <h2 style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:28,letterSpacing:1,marginBottom:20}}>{lang==="ru"?"НАСТРОЙКИ":"NUSTATYMAI"}</h2>

                    <div style={{background:"var(--card)",border:"1px solid var(--b2)",borderRadius:14,padding:20,marginBottom:14}}>
                      <div style={{fontWeight:700,fontSize:14,marginBottom:16,color:"var(--or)"}}>🔊 {lang==="ru"?"Звук для всех пользователей":"Garsas visiems naudotojams"}</div>

                      {[
                        {key:"soundEnabled", label:lang==="ru"?"Звуковые эффекты (клики, уведомления)":"Garso efektai (paspaudimai)", icon:"🔔"},
                        {key:"bgMusicEnabled", label:lang==="ru"?"Фоновая музыка Mario 🎮":"Foninis Mario muzika 🎮", icon:"🎮"},
                      ].map(opt=>{
                        const val = opt.key==="soundEnabled"?soundEnabled:bgMusicEnabled;
                        return(
                          <div key={opt.key} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 0",borderBottom:"1px solid var(--border)"}}>
                            <div>
                              <div style={{fontSize:13,fontWeight:600}}>{opt.icon} {opt.label}</div>
                              <div style={{fontSize:11,color:"var(--mu)",marginTop:2}}>{val?(lang==="ru"?"Включено":"Įjungta"):(lang==="ru"?"Выключено":"Išjungta")}</div>
                            </div>
                            <button onClick={async()=>{
                              const newVal = !val;
                              if(opt.key==="soundEnabled") setSoundEnabled(newVal);
                              else setBgMusicEnabled(newVal);
                              await saveAppSettings({[opt.key]:newVal});
                            }} style={{
                              width:52,height:28,borderRadius:14,border:"none",cursor:"pointer",position:"relative",
                              background:val?"var(--gr)":"var(--border)",transition:"background .2s",flexShrink:0
                            }}>
                              <div style={{position:"absolute",top:4,left:val?28:4,width:20,height:20,borderRadius:"50%",background:"#fff",transition:"left .2s"}}/>
                            </button>
                          </div>
                        );
                      })}
                    </div>

                    <div style={{fontSize:12,color:"var(--mu)",padding:"10px 14px",background:"var(--card2)",borderRadius:10,border:"1px solid var(--border)"}}>
                      ℹ️ {lang==="ru"?"Настройки применяются ко всем пользователям сайта через Firestore.":"Nustatymai taikomi visiems svetainės naudotojams per Firestore."}
                    </div>
                  </div>
                )}

              </div>
            </div>
          );
        })()}
      </div>
      {modal==="auth"&&(
        <div className="overlay" onClick={()=>setModal(null)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div className="m-title">{authMode==="login"?t.login_title:t.reg_title}</div>
            <div className="m-sub">{authMode==="login"?t.login_sub:t.reg_sub}</div>
            {authErr&&<div className="err">{authErr}</div>}
            {authMode==="register"&&<div className="field"><label>{t.f_name}</label><input value={authForm.name} onChange={e=>setAuthForm(f=>({...f,name:e.target.value}))} placeholder="Иван"/></div>}
            <div className="field"><label>{t.f_email}</label><input value={authForm.email} onChange={e=>setAuthForm(f=>({...f,email:e.target.value}))} placeholder="email@example.com"/></div>
            {authMode==="register"&&<div className="field"><label>{t.f_phone}</label><input value={authForm.phone} onChange={e=>setAuthForm(f=>({...f,phone:e.target.value}))} placeholder="+370 600 00000"/></div>}
            <div className="field">
              <label>{t.f_pass}</label>
              <div style={{position:"relative"}}>
                <input type={showPass?"text":"password"} value={authForm.password} onChange={e=>setAuthForm(f=>({...f,password:e.target.value}))} onKeyDown={e=>e.key==="Enter"&&doAuth()} placeholder="••••••••" style={{paddingRight:40}}/>
                <button onClick={()=>setShowPass(p=>!p)} style={{position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer",color:"var(--mu)",fontSize:16,padding:0}}>
                  {showPass?"🙈":"👁"}
                </button>
              </div>
            </div>
            {authMode==="register"&&(
              <div className="field">
                <label>{lang==="ru"?"Повторите пароль":"Pakartokite slaptažodį"}</label>
                <div style={{position:"relative"}}>
                  <input type={showPass?"text":"password"} value={authForm.confirmPassword} onChange={e=>setAuthForm(f=>({...f,confirmPassword:e.target.value}))} placeholder="••••••••" style={{paddingRight:40,borderColor:authForm.confirmPassword&&authForm.confirmPassword!==authForm.password?"var(--red)":""}}/>
                  <button onClick={()=>setShowPass(p=>!p)} style={{position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer",color:"var(--mu)",fontSize:16,padding:0}}>
                    {showPass?"🙈":"👁"}
                  </button>
                </div>
                {authForm.confirmPassword&&authForm.confirmPassword!==authForm.password&&(
                  <div style={{fontSize:11,color:"var(--red)",marginTop:4}}>{lang==="ru"?"Пароли не совпадают":"Slaptažodžiai nesutampa"}</div>
                )}
              </div>
            )}
            <button className="btn b-or b-full b-lg" onClick={doAuth}>{authMode==="login"?t.login:t.register}</button>
            <div className="m-switch">{authMode==="login"?<>{t.no_acc} <button onClick={()=>{setAuthMode("register");setAuthErr("");}}>{t.reg_link}</button></>:<>{t.has_acc} <button onClick={()=>{setAuthMode("login");setAuthErr("");}}>{t.login_link}</button></>}</div>
            {authMode==="login"&&<div style={{marginTop:8,fontSize:11,color:"var(--mu)",textAlign:"center"}}>
              {lang==="ru"?"Мастера входят через аккаунт выданный владельцем":"Meistrai prisijungia per savininko sukurtą paskyrą"}
            </div>}
          </div>
        </div>
      )}

      {/* NEW APPOINTMENT MODAL */}
      {modal==="newAppt"&&masterObj&&(
        <div className="overlay" onClick={()=>setModal(null)}>
          <div className="modal wide" onClick={e=>e.stopPropagation()}>
            <div className="m-title">{t.appt_title}</div>
            <div className="m-sub" style={{color:mc}}>{masterObj.firstName} {masterObj.lastName} · BARBER HUB</div>
            <div className="seg">
              <button className={`seg-btn${newAppt.clientMode==="new"?" on":""}`} style={newAppt.clientMode==="new"?{background:mc,color:"var(--bg)"}:{}} onClick={()=>setNewAppt(p=>({...p,clientMode:"new",clientName:"",clientPhone:""}))}>+ {t.appt_new_client}</button>
              <button className={`seg-btn${newAppt.clientMode==="existing"?" on":""}`} style={newAppt.clientMode==="existing"?{background:mc,color:"var(--bg)"}:{}} onClick={()=>setNewAppt(p=>({...p,clientMode:"existing"}))}>👥 {t.appt_existing}</button>
            </div>
            {newAppt.clientMode==="existing"&&masterClients.length>0&&(
              <div className="field">
                <label>{lang==="ru"?"Выберите из базы":"Pasirinkite"}</label>
                <select value={newAppt.clientName} onChange={e=>{const c=masterClients.find(x=>x.name===e.target.value);setNewAppt(p=>({...p,clientName:e.target.value,clientPhone:c?.phone||""}));}}>
                  <option value="">—</option>
                  {masterClients.map(c=><option key={c.name} value={c.name}>{c.name} ({c.visits} {lang==="ru"?"визитов":"vizitų"})</option>)}
                </select>
              </div>
            )}
            <div className="g2">
              <div className="field"><label>{t.appt_client_name}</label><input value={newAppt.clientName} onChange={e=>setNewAppt(p=>({...p,clientName:e.target.value}))} placeholder="Иван Петров"/></div>
              <div className="field"><label>{t.appt_client_phone}</label><input value={newAppt.clientPhone} onChange={e=>setNewAppt(p=>({...p,clientPhone:e.target.value}))} placeholder="+370 600 00000"/></div>
            </div>
            {/* SERVICE MULTI-SELECT */}
            <div className="field">
              <label>{t.appt_service}</label>
              <div style={{display:"flex",flexDirection:"column",gap:6,marginTop:4}}>
                {(masterObj.services||[]).filter(s=>s.enabled).map(s=>{
                  const sel=newAppt.serviceIds.includes(s.id);
                  return(
                    <div key={s.id}
                      onClick={()=>setNewAppt(p=>({...p,serviceIds:sel?p.serviceIds.filter(x=>x!==s.id):[...p.serviceIds,s.id]}))}
                      style={{
                        display:"flex",alignItems:"center",gap:10,
                        padding:"10px 12px",borderRadius:8,cursor:"pointer",
                        background:sel?"var(--card2)":"var(--card)",
                        border:`1px solid ${sel?mc:"var(--b2)"}`,
                        transition:"all .18s",
                      }}>
                      <div style={{
                        width:20,height:20,borderRadius:5,flexShrink:0,
                        border:`2px solid ${sel?mc:"var(--b2)"}`,
                        background:sel?mc:"transparent",
                        display:"flex",alignItems:"center",justifyContent:"center",
                        fontSize:12,color:"#fff",fontWeight:900,
                      }}>{sel?"✓":""}</div>
                      <div style={{flex:1}}>
                        <div style={{fontSize:13,fontWeight:700,color:sel?mc:"var(--wh)"}}>
                          {lang==="ru"?s.name_ru:s.name_lt}
                        </div>
                        <div style={{fontSize:11,color:"var(--mu2)"}}>
                          {s.price}€ · ⏱{s.mins}{t.min} · 🧹+{s.cleanup}{t.min}
                        </div>
                      </div>
                      {sel&&<div style={{fontSize:12,fontWeight:800,color:mc}}>{s.price}€</div>}
                    </div>
                  );
                })}
              </div>
              {/* Running total */}
              {newAppt.serviceIds.length>0&&(()=>{
                const selSvcs=(masterObj.services||[]).filter(s=>newAppt.serviceIds.includes(s.id));
                const ttlPrice=selSvcs.reduce((a,s)=>a+Number(s.price),0);
                const ttlMins=selSvcs.reduce((a,s)=>a+Number(s.mins)+Number(s.cleanup||0),0);
                return(
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:8,padding:"8px 12px",background:`${mc}18`,borderRadius:8,border:`1px solid ${mc}44`}}>
                    <span style={{fontSize:11,color:"var(--mu2)",fontWeight:700}}>
                      {lang==="ru"?"Итого блок":"Iš viso blokas"}: <strong style={{color:mc}}>{ttlMins} {t.min}</strong>
                    </span>
                    <span style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:20,color:"var(--gr)"}}>{ttlPrice}€</span>
                  </div>
                );
              })()}
            </div>
            <div className="g2">
              <div className="field">
                <label>{t.appt_date}</label>
                <select value={newAppt.date} onChange={e=>setNewAppt(p=>({...p,date:e.target.value}))}>
                  {Array.from({length:14},(_,i)=>{const d=new Date();d.setDate(d.getDate()+i);return d;}).map(d=>(
                    <option key={fmtDate(d)} value={fmtDate(d)}>{d.toLocaleDateString(lang==="ru"?"ru-RU":"lt-LT",{weekday:"short",day:"numeric",month:"short"})}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>{t.appt_time}</label>
                <div style={{display:"flex",flexWrap:"wrap",gap:5,marginTop:4}}>
                  {HOURS.map(h=>{
                    const busy = newAppt.date&&newAppt.serviceIds.length ? getSlotStatus(masterObj.id,newAppt.date,h,newAppt.serviceIds)==="busy" : false;
                    const hm = timeToMins(h);
                    const closed = masterObj.workStart&&masterObj.workEnd ? (hm<timeToMins(masterObj.workStart)||hm>=timeToMins(masterObj.workEnd)) : false;
                    const disabled = busy||closed;
                    const selected = newAppt.time===h;
                    return(
                      <button key={h} type="button"
                        disabled={disabled}
                        onClick={()=>!disabled&&setNewAppt(p=>({...p,time:h}))}
                        style={{
                          padding:"5px 9px",borderRadius:7,fontSize:12,fontWeight:700,
                          border:`1px solid ${selected?mc:disabled?"var(--border)":"var(--b2)"}`,
                          background:selected?mc:disabled?"var(--card2)":"var(--card)",
                          color:selected?"var(--bg)":disabled?"var(--border)":"var(--wh)",
                          cursor:disabled?"not-allowed":"pointer",
                          opacity:disabled?0.4:1,
                        }}>
                        {h}{closed?" 🔒":busy?" ✗":""}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="field"><label>{t.appt_notes}</label><textarea value={newAppt.notes} onChange={e=>setNewAppt(p=>({...p,notes:e.target.value}))} placeholder={lang==="ru"?"Пожелания...":"Pageidavimai..."}/></div>
            <div style={{display:"flex",gap:8}}>
              <button className="btn b-lg" style={{flex:1,background:mc,color:"var(--bg)"}} onClick={saveAppt}>{t.appt_save}</button>
              <button className="btn b-ghost" onClick={()=>setModal(null)}>{t.appt_cancel}</button>
            </div>
          </div>
        </div>
      )}

      {/* APPOINTMENT DETAIL */}
      {/* TRICHOLOGY CARD MODAL */}
      {triCardModal&&(
        <div style={{position:"fixed",inset:0,background:"var(--bg)",zIndex:400,overflowY:"auto"}}>
          <div style={{maxWidth:520,margin:"0 auto",padding:16}}>
            <button onClick={()=>setTriCardModal(null)} style={{background:"none",border:"none",color:mc,cursor:"pointer",fontSize:14,fontWeight:700,marginBottom:16,padding:"8px 0",display:"flex",alignItems:"center",gap:6}}>
              ← {lang==="ru"?"Назад":"Atgal"}
            </button>
            <div style={{background:"var(--card)",border:`1px solid ${mc}44`,borderRadius:14,padding:18,marginBottom:16}}>
              <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:22,letterSpacing:1,marginBottom:4}}>📋 {lang==="ru"?"КАРТОЧКА ПРОЦЕДУРЫ":"PROCEDŪROS KORTELĖ"}</div>
              <div style={{fontSize:12,color:mc,fontWeight:700}}>{triCardModal.svc?.name} · {triCardModal.appt.clientName} · {triCardModal.appt.date}</div>
            </div>

            {/* 1. Что делали */}
            <div className="field" style={{marginBottom:14}}>
              <label style={{fontSize:12,fontWeight:700,marginBottom:6,display:"block"}}>✂️ {lang==="ru"?"Что делали (описание процедуры)":"Ką darėme (procedūros aprašymas)"}</label>
              <textarea value={triCardForm.procedure} onChange={e=>setTriCardForm(f=>({...f,procedure:e.target.value}))}
                placeholder={lang==="ru"?"Опишите что было сделано в ходе процедуры...":"Aprašykite, kas buvo atlikta procedūros metu..."}
                style={{minHeight:90,width:"100%"}}/>
            </div>

            {/* 2. Рекомендации */}
            <div className="field" style={{marginBottom:14}}>
              <label style={{fontSize:12,fontWeight:700,marginBottom:6,display:"block"}}>💡 {lang==="ru"?"Рекомендации клиенту":"Rekomendacijos klientui"}</label>
              <textarea value={triCardForm.recommendations} onChange={e=>setTriCardForm(f=>({...f,recommendations:e.target.value}))}
                placeholder={lang==="ru"?"Что рекомендуете делать дома, как ухаживать...":"Ką rekomenduojate daryti namuose..."}
                style={{minHeight:90,width:"100%"}}/>
            </div>

            {/* 3. Рекомендуемые продукты */}
            <div style={{marginBottom:14}}>
              <label style={{fontSize:12,fontWeight:700,marginBottom:8,display:"block"}}>🛍️ {lang==="ru"?"Рекомендуемые продукты":"Rekomenduojami produktai"}</label>
              {products.length===0&&<div style={{fontSize:12,color:"var(--mu2)",marginBottom:8}}>{lang==="ru"?"Продукты не добавлены владельцем":"Produktai nepridėti savininko"}</div>}
              <div style={{display:"flex",flexDirection:"column",gap:6}}>
                {products.map(p=>{
                  const selected=triCardForm.productRecs.includes(p.id);
                  return(
                    <button key={p.id} onClick={()=>setTriCardForm(f=>({...f,productRecs:selected?f.productRecs.filter(x=>x!==p.id):[...f.productRecs,p.id]}))}
                      style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",borderRadius:10,border:`1px solid ${selected?"var(--gr)":"var(--b2)"}`,background:selected?"var(--gr)11":"var(--card)",cursor:"pointer",textAlign:"left"}}>
                      {p.photo&&<img src={p.photo} alt="" style={{width:36,height:36,objectFit:"cover",borderRadius:6}}/>}
                      <div style={{flex:1}}>
                        <div style={{fontSize:12,fontWeight:700,color:selected?"var(--gr)":"var(--wh)"}}>{p.name}</div>
                        {p.category&&<div style={{fontSize:10,color:"var(--mu2)"}}>{p.category}</div>}
                      </div>
                      <span style={{fontSize:16}}>{selected?"✅":"○"}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 4. Фото с примечаниями */}
            <div style={{marginBottom:20}}>
              <label style={{fontSize:12,fontWeight:700,marginBottom:8,display:"block"}}>📸 {lang==="ru"?"Фото (с примечаниями)":"Nuotraukos (su pastabomis)"}</label>
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {triCardForm.photos.map((ph,i)=>(
                  <div key={i} style={{background:"var(--card)",border:"1px solid var(--b2)",borderRadius:10,padding:10}}>
                    <img src={ph.url} alt="" style={{width:"100%",maxHeight:160,objectFit:"cover",borderRadius:8,marginBottom:6}}/>
                    <input value={ph.note||""} onChange={e=>setTriCardForm(f=>({...f,photos:f.photos.map((p2,j)=>j===i?{...p2,note:e.target.value}:p2)}))}
                      placeholder={lang==="ru"?"Примечание к фото...":"Pastaba prie nuotraukos..."} style={{width:"100%",fontSize:12}}/>
                    <button onClick={()=>setTriCardForm(f=>({...f,photos:f.photos.filter((_,j)=>j!==i)}))}
                      style={{marginTop:6,background:"none",border:"1px solid var(--border)",borderRadius:6,padding:"3px 8px",color:"var(--red)",fontSize:11,cursor:"pointer"}}>
                      🗑 {lang==="ru"?"Удалить":"Ištrinti"}
                    </button>
                  </div>
                ))}
                <label style={{display:"flex",alignItems:"center",gap:8,padding:"10px 14px",border:"1px dashed var(--b2)",borderRadius:10,cursor:"pointer",color:"var(--mu)"}}>
                  <span>📷 {lang==="ru"?"Добавить фото":"Pridėti nuotrauką"}</span>
                  <input type="file" accept="image/*" style={{display:"none"}} onChange={e=>{
                    const file=e.target.files?.[0]; if(!file) return;
                    const img=new Image(); const url=URL.createObjectURL(file);
                    img.onload=()=>{
                      const canvas=document.createElement("canvas");
                      const MAX=800; let w=img.width,h=img.height;
                      if(w>h){if(w>MAX){h=Math.round(h*MAX/w);w=MAX;}}else{if(h>MAX){w=Math.round(w*MAX/h);h=MAX;}}
                      canvas.width=w;canvas.height=h;
                      canvas.getContext("2d").drawImage(img,0,0,w,h);
                      setTriCardForm(f=>({...f,photos:[...f.photos,{url:canvas.toDataURL("image/jpeg",0.75),note:""}]}));
                      URL.revokeObjectURL(url);
                    };img.src=url;
                  }}/>
                </label>
              </div>
            </div>

            <button className="btn b-lg b-full" style={{background:mc,color:"var(--bg)",fontWeight:800}}
              disabled={triCardSaving||!triCardForm.procedure}
              onClick={async()=>{
                setTriCardSaving(true);
                try{
                  const data={
                    apptId:triCardModal.appt.id,
                    masterId:String(masterObj.id),
                    clientEmail:triCardModal.appt.clientEmail||"",
                    clientName:triCardModal.appt.clientName,
                    clientUid:triCardModal.appt.clientUid||"",
                    serviceId:triCardModal.appt.serviceId||"",
                    serviceName:triCardModal.svc?.name||"",
                    date:triCardModal.appt.date,
                    procedure:triCardForm.procedure,
                    recommendations:triCardForm.recommendations,
                    productRecs:triCardForm.productRecs,
                    photos:triCardForm.photos,
                    createdAt:triCardModal.existing?.createdAt||new Date().toISOString(),
                    updatedAt:new Date().toISOString(),
                  };
                  if(triCardModal.existing){
                    await setDoc(doc(fbDb,"trichologyCards",triCardModal.existing.id),data);
                  } else {
                    await addDoc(collection(fbDb,"trichologyCards"),data);
                  }
                  setTriCardModal(null);
                }catch(e){ alert(lang==="ru"?"Ошибка":"Klaida"); }
                setTriCardSaving(false);
              }}>
              {triCardSaving?"...":(lang==="ru"?"Сохранить карточку":"Išsaugoti kortelę")}
            </button>
          </div>
        </div>
      )}

      {modal==="detail"&&detailAppt&&masterObj&&(()=>{
        const svc=resolveBooking(detailAppt);
        const needsCard=svc?.needsCard===true;
        const existingCard=triCards.find(c=>c.apptId===detailAppt.id);
        return(
          <div className="overlay" onClick={()=>setModal(null)}>
            <div className="modal" onClick={e=>e.stopPropagation()}>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:4}}>
                <div style={{width:38,height:38,borderRadius:"50%",background:mc+"22",border:`2px solid ${mc}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>{detailAppt.clientName[0]}</div>
                <div>
                  <div className="m-title" style={{fontSize:22}}>{detailAppt.clientName}</div>
                  <div style={{fontSize:11,color:"var(--mu)"}}>{detailAppt.clientPhone||"—"}</div>
                </div>
              </div>
              <div style={{height:3,background:`linear-gradient(90deg,${mc},transparent)`,borderRadius:2,margin:"12px 0 16px"}}/>
              {[
                [t.appt_service,svc?.name],
                [t.appt_date,`${new Date(detailAppt.date).toLocaleDateString(lang==="ru"?"ru-RU":"lt-LT",{weekday:"long",day:"numeric",month:"long"})} · ${detailAppt.time}`],
                [lang==="ru"?"Стоимость":"Kaina",`${svc?.price||"—"}€`],
                [t.payment_lbl, detailAppt.payment==="cash"?"💵 "+t.payment_cash:detailAppt.payment==="subscription"?"💳 "+t.sub_my+" "+detailAppt.payment?.toUpperCase():detailAppt.payment==="online"?"💳 "+t.payment_online:"—"],
                [lang==="ru"?"Статус":"Statusas",detailAppt.status==="done"?t.status_done:lang==="ru"?"Ожидает":"Laukia"],
              ].map(([l,v])=>(
                <div key={l} className="adrow"><span className="ad-lbl">{l}</span><span className="ad-val">{v}</span></div>
              ))}
              {detailAppt.notes&&<div className="adrow"><span className="ad-lbl">{t.appt_notes}</span><span className="ad-val" style={{color:"var(--mu2)"}}>{detailAppt.notes}</span></div>}

              {/* Trichology card button */}
              {needsCard&&(
                <div style={{marginTop:12,marginBottom:4}}>
                  <button className="btn b-full" style={{
                    background:existingCard?"var(--gr)22":"var(--card2)",
                    border:`1px solid ${existingCard?"var(--gr)":"var(--b2)"}`,
                    color:existingCard?"var(--gr)":"var(--wh)",fontWeight:700,fontSize:13
                  }} onClick={()=>{
                    setTriCardForm(existingCard?{
                      procedure:existingCard.procedure||"",
                      recommendations:existingCard.recommendations||"",
                      productRecs:existingCard.productRecs||[],
                      photos:existingCard.photos||[],
                    }:{procedure:"",recommendations:"",productRecs:[],photos:[]});
                    setTriCardModal({appt:detailAppt,svc,existing:existingCard||null});
                    setModal(null);
                  }}>
                    📋 {existingCard
                      ?(lang==="ru"?"Карточка заполнена — редактировать":"Kortelė užpildyta — redaguoti")
                      :(lang==="ru"?"+ Добавить карточку процедуры":"+ Pridėti procedūros kortelę")
                    }
                  </button>
                </div>
              )}

              <div className="sad">
                {detailAppt.status!=="done"&&<button className="btn b-gr" style={{flex:1}} onClick={()=>updateStatus(detailAppt.id,"done")}>{t.mark_done}</button>}
                <button className="btn b-card" onClick={()=>{setRescheduleAppt(detailAppt);setRescheduleDate(detailAppt.date);setRescheduleTime(null);setModal("reschedule");}}>
                  📅 {lang==="ru"?"Перенести":"Perkelti"}
                </button>
                <button className="btn b-red" onClick={()=>deleteAppt(detailAppt.id)}>{t.status_cancel}</button>
                <button className="btn b-ghost" onClick={()=>setModal(null)}>✕</button>
              </div>
            </div>
          </div>
        );
      })()}


      {/* ══ POST-VISIT REVIEW POPUP — only for clients ══ */}
      {/* Block mode bottom bar */}
      {blockMode&&(
        <div className="block-bottom-bar">
          <div style={{flex:1,fontSize:13,fontWeight:700,color:"var(--gold)"}}>
            🔒 {blockSelectedSlots.length > 0
              ? `${blockSelectedSlots.length} ${lang==="ru"?"слот(ов) выбрано":"laiko tarpų pasirinkta"}`
              : (lang==="ru"?"Нажмите на свободные слоты":"Spustelėkite laisvus laikus")}
          </div>
          {blockSelectedSlots.length>0&&(
            <button className="btn b-red" style={{fontWeight:800}} onClick={()=>setBlockTypeModal(true)}>
              🔒 {lang==="ru"?"Заблокировать":"Blokuoti"}
            </button>
          )}
          <button className="btn b-ghost b-sm" onClick={()=>{setBlockMode(false);setBlockSelectedSlots([]);}}>✕</button>
        </div>
      )}

      {/* Block type picker modal */}
      {blockTypeModal&&(
        <div className="overlay" onClick={()=>setBlockTypeModal(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div className="m-title">🔒 {lang==="ru"?"Тип блокировки":"Blokavimo tipas"}</div>
            <div className="m-sub">{blockSelectedSlots.length} {lang==="ru"?"слот(ов)":"laiko tarpų"}</div>
            <div style={{display:"flex",flexDirection:"column",gap:8,marginTop:16}}>
              {[
                {type:"break", icon:"☕", label:lang==="ru"?"Перерыв":"Pertrauka", color:"var(--gold)"},
                {type:"rest",  icon:"🛌", label:lang==="ru"?"Отдых":"Poilsis", color:"var(--gr)"},
                {type:"closed",icon:"🚫", label:lang==="ru"?"Нерабочее время":"Nedarbo laikas", color:"var(--red)"},
              ].map(opt=>(
                <button key={opt.type}
                  onClick={async()=>{
                    // Save each selected slot as a block
                    for(const slot of blockSelectedSlots){
                      const block = {
                        masterId: String(curMasterId),
                        date: slot.date,
                        fromTime: slot.time,
                        toTime: HOURS[Math.min(HOURS.indexOf(slot.time)+1, HOURS.length-1)],
                        type: opt.type,
                        reason: opt.label,
                        allDay: false,
                        createdAt: new Date().toISOString()
                      };
                      try{
                        await addDoc(collection(fbDb,"blocks"), block);
                      }catch(e){}
                    }
                    addNotification("block_added",
                      `${masterObj?.firstName} ${lang==="ru"?"заблокировал время":"blokavo laiką"} (${opt.label})`,
                      curMasterId, true
                    );
                    soundEnabled&&playSuccessSound();
                    setBlockTypeModal(false);
                    setBlockMode(false);
                    setBlockSelectedSlots([]);
                  }}
                  style={{
                    display:"flex",alignItems:"center",gap:14,padding:"14px 16px",
                    borderRadius:10,border:`1px solid ${opt.color}44`,
                    background:`${opt.color}11`,cursor:"pointer",
                    fontFamily:"'Syne',sans-serif",fontSize:14,fontWeight:700,color:opt.color
                  }}>
                  <span style={{fontSize:24}}>{opt.icon}</span>
                  {opt.label}
                </button>
              ))}
            </div>
            <button className="btn b-ghost b-full" style={{marginTop:12}} onClick={()=>setBlockTypeModal(false)}>
              {lang==="ru"?"Отмена":"Atšaukti"}
            </button>
          </div>
        </div>
      )}

      {/* Booking status overlay */}
      {bkStatus&&(
        <div className="bk-status-overlay">
          <div className="bk-status-card">
            {bkStatus==="checking"&&(
              <>
                <div className="bk-status-icon">⏳</div>
                <div className="bk-status-title">{lang==="ru"?"Проверка...":"Tikrinama..."}</div>
                <div style={{fontSize:13,color:"var(--mu)",marginBottom:4}}>
                  {lang==="ru"?"Проверяем доступность места":"Tikriname vietos prieinamumą"}
                </div>
                <div className="bk-progress"><div className="bk-progress-bar"/></div>
              </>
            )}
            {bkStatus==="success"&&(
              <>
                <div className="bk-status-icon">✅</div>
                <div className="bk-status-title" style={{color:"var(--gr)"}}>
                  {lang==="ru"?"Зарегистрирован!":"Užregistruota!"}
                </div>
                <div style={{fontSize:13,color:"var(--mu)"}}>
                  {lang==="ru"?"Запись подтверждена":"Rezervacija patvirtinta"}
                </div>
              </>
            )}
            {bkStatus==="fail"&&(
              <>
                <div className="bk-status-icon">❌</div>
                <div className="bk-status-title" style={{color:"var(--red)"}}>
                  {lang==="ru"?"Не зарегистрирован":"Neužregistruota"}
                </div>
                <div style={{fontSize:13,color:"var(--mu)"}}>
                  {lang==="ru"?"Это время уже занято. Выберите другое.":"Šis laikas jau užimtas."}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Touch drag ghost */}
      {touchDragGhost&&(
        <div style={{position:"fixed",zIndex:9999,background:"var(--or)",color:"var(--bg)",padding:"6px 12px",borderRadius:8,fontSize:12,fontWeight:800,pointerEvents:"none",left:touchDragGhost.x,top:touchDragGhost.y,transform:"translate(-50%,-120%)",whiteSpace:"nowrap",boxShadow:"0 4px 16px rgba(232,101,10,.5)"}}>
          ✋ {touchDragGhost.label}
        </div>
      )}

      {visitReview&&cur?.role==="client"&&(
        <div className="visit-overlay" onClick={()=>!visitSubmitted&&setVisitReview(null)}>
          <div className="visit-modal" onClick={e=>e.stopPropagation()}>
            {visitSubmitted?(
              <div className="visit-submitted-msg">
                <div style={{fontSize:52,marginBottom:12}}>🎉</div>
                <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:28,color:"var(--gr)",marginBottom:8}}>{t.visit_submitted}</div>
                <div style={{fontSize:13,color:"var(--mu2)",marginBottom:20}}>{lang==="ru"?"Спасибо! Ваш отзыв поможет другим клиентам.":"Ačiū! Jūsų atsiliepimas padės kitiems klientams."}</div>
                <button className="btn b-gr b-lg" style={{width:"100%"}} onClick={()=>setVisitReview(null)}>{lang==="ru"?"Закрыть":"Uždaryti"}</button>
              </div>
            ):(
              <>
                {/* Hero */}
                <div className="visit-hero">
                  <div className="visit-master-av" style={{background:(visitReview.masterObj?.color||"var(--or)")+"22",borderColor:visitReview.masterObj?.color||"var(--or)"}}>
                    {visitReview.masterObj?.photo
                      ?<img src={visitReview.masterObj.photo} alt=""/>
                      :<span>{visitReview.masterObj?.emoji||"✂️"}</span>}
                  </div>
                  <div className="visit-title">{t.visit_done_title}</div>
                  <div className="visit-sub">{t.visit_master_lbl}: <strong style={{color:visitReview.masterObj?.color||"var(--or)"}}>{visitReview.masterObj?.firstName} {visitReview.masterObj?.lastName}</strong></div>
                </div>

                <div className="visit-body">
                  {/* Star rating */}
                  <div style={{textAlign:"center"}}>
                    <div style={{fontSize:11,color:"var(--mu)",fontWeight:800,letterSpacing:"1.5px",textTransform:"uppercase",marginBottom:4}}>{t.visit_rate_service}</div>
                    <div className="star-pick">
                      {[1,2,3,4,5].map(n=>(
                        <button key={n} className={"star-pick-btn"+(visitRating>=n?" active":"")}
                          onClick={()=>setVisitRating(n)}>
                          <span style={{color:visitRating>=n?"var(--gold)":"var(--border)"}}>{visitRating>=n?"★":"☆"}</span>
                        </button>
                      ))}
                    </div>
                    <div style={{fontSize:13,color:"var(--gold)",fontWeight:800,marginBottom:4}}>
                      {["","😞 Плохо","😐 Нормально","🙂 Хорошо","😊 Отлично","🤩 Превосходно"][visitRating]}
                    </div>
                  </div>

                  {/* Review text */}
                  <div style={{fontSize:11,color:"var(--mu)",fontWeight:800,letterSpacing:"1.5px",textTransform:"uppercase",margin:"12px 0 6px"}}>{t.visit_leave_review}</div>
                  <textarea className="visit-textarea" value={visitText} onChange={e=>setVisitText(e.target.value)} placeholder={t.visit_review_ph}/>

                  {/* Tips */}
                  <div className="tips-section">
                    <div className="tips-title">💰 {t.visit_tips_title}</div>
                    <div className="tips-sub">{t.visit_tips_sub}</div>
                    <div className="tips-grid">
                      {[1,2,5,10].map(amt=>(
                        <button key={amt} className={"tip-btn"+(visitTip===amt?" sel":"")} onClick={()=>setVisitTip(visitTip===amt?null:amt)}>
                          {amt}€
                        </button>
                      ))}
                    </div>
                    <input className="tip-custom"
                      type="number" min="0" max="200"
                      placeholder={t.visit_tips_custom+"..."}
                      value={visitCustomTip}
                      onChange={e=>{setVisitCustomTip(e.target.value);setVisitTip(null);}}
                      style={{width:"100%",padding:"9px 12px",borderRadius:9,border:"1px solid var(--b2)",background:"var(--card2)",color:"var(--wh)",fontFamily:"'Syne',sans-serif",fontSize:13,outline:"none",marginBottom:10}}
                    />
                    {visitTipPaid?(
                      <div style={{textAlign:"center",color:"var(--gr)",fontWeight:700,fontSize:13,padding:"8px 0"}}>{t.visit_tips_paid}</div>
                    ):(visitTip||parseFloat(visitCustomTip)>0)?(
                      <div style={{display:"flex",flexDirection:"column",gap:7}}>
                        <button className="btn b-gr b-full" onClick={()=>{
                          setVisitTipPaid(true);
                          addNotification("booked",
                            lang==="ru"?`${visitReview.clientName||"Клиент"} оставил чаевые ${visitTip||visitCustomTip}€ для ${visitReview.masterObj?.firstName}`:`${visitReview.clientName||"Klientas"} paliko arbatpinigius ${visitTip||visitCustomTip}€`,
                            visitReview.masterId, true
                          );
                        }}>
                          💳 {t.visit_tips_pay} · {visitTip||parseFloat(visitCustomTip)||0}€
                        </button>
                        <div style={{fontSize:10,textAlign:"center",color:"var(--mu)"}}>{t.visit_tips_soon}</div>
                      </div>
                    ):null}
                  </div>
                </div>

                {/* Footer */}
                <div className="visit-footer">
                  <button className="btn b-or b-lg" style={{background:visitReview.masterObj?.color||"var(--or)",color:"var(--bg)",fontWeight:800}}
                    onClick={async()=>{
                      const hasText = visitText.trim().length > 0;
                      const rev = {
                        masterId:String(visitReview.masterId),
                        clientName:cur?.name||visitReview.clientName||"Клиент",
                        rating:visitRating,
                        text:hasText ? visitText.trim() : (visitRating>=5 ? (lang==="ru"?"Отличный визит!":"Puikus vizitas!") : ""),
                        date:todayStr,
                        fromVisit:true,
                        showPublic: hasText || visitRating>=4,
                        createdAt:new Date().toISOString()
                      };
                      try{ await addDoc(collection(fbDb,"reviews"), rev); }catch(e){
                        setReviews(p=>[...p,{...rev,id:Date.now()}]);
                      }
                      setVisitSubmitted(true);
                    }}>
                    {t.visit_submit} · {[,"⭐","⭐⭐","⭐⭐⭐","⭐⭐⭐⭐","⭐⭐⭐⭐⭐"][visitRating]}
                  </button>
                  <button className="btn b-ghost" style={{fontSize:12}} onClick={()=>setVisitReview(null)}>{t.visit_skip}</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ══ BLOCK TIME MODAL ══ */}
      {blockModal&&masterObj&&(
        <div className="overlay" onClick={()=>setBlockModal(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div className="m-title">🚫 {t.block_add}</div>
            <div className="m-sub" style={{color:mc}}>{masterObj.firstName} {masterObj.lastName}</div>
            <div className="field">
              <label>{t.block_date}</label>
              <select value={blockForm.date} onChange={e=>setBlockForm(f=>({...f,date:e.target.value}))}>
                {Array.from({length:30},(_,i)=>{const d=new Date();d.setDate(d.getDate()+i);return d;}).map(d=>(
                  <option key={fmtDate(d)} value={fmtDate(d)}>{d.toLocaleDateString(lang==="ru"?"ru-RU":"lt-LT",{weekday:"short",day:"numeric",month:"short"})}</option>
                ))}
              </select>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12,padding:"10px 12px",background:"var(--card)",borderRadius:8}}>
              <span style={{fontSize:13,fontWeight:700,flex:1}}>{t.block_all_day}</span>
              <button onClick={()=>setBlockForm(f=>({...f,allDay:!f.allDay}))}
                style={{width:42,height:24,borderRadius:12,border:"none",cursor:"pointer",position:"relative",background:blockForm.allDay?"var(--or)":"var(--border)",transition:"background .2s"}}>
                <div style={{position:"absolute",width:18,height:18,borderRadius:9,background:"#fff",top:3,left:blockForm.allDay?21:3,transition:"left .2s"}}/>
              </button>
            </div>
            {!blockForm.allDay&&<div className="g2">
              <div className="field">
                <label>{t.block_from}</label>
                <select value={blockForm.fromTime} onChange={e=>setBlockForm(f=>({...f,fromTime:e.target.value}))}>
                  {HOURS.map(h=><option key={h} value={h}>{h}</option>)}
                </select>
              </div>
              <div className="field">
                <label>{t.block_to}</label>
                <select value={blockForm.toTime} onChange={e=>setBlockForm(f=>({...f,toTime:e.target.value}))}>
                  {HOURS.map(h=><option key={h} value={h}>{h}</option>)}
                </select>
              </div>
            </div>}
            <div className="field">
              <label>{lang==="ru"?"Тип блока":"Bloko tipas"}</label>
              <div style={{display:"flex",gap:7,marginTop:4}}>
                {[["break","☕ "+(lang==="ru"?t.block_type_break:t.block_type_break),"var(--gold)"],["closed","🚫 "+(lang==="ru"?t.block_type_closed:t.block_type_closed),"var(--mu)"],["vacation","🏖️ "+(lang==="ru"?t.block_type_vacation:t.block_type_vacation),"#3b82f6"]].map(([type,label,color])=>(
                  <button key={type} onClick={()=>setBlockForm(f=>({...f,type}))}
                    style={{flex:1,padding:"8px 4px",borderRadius:8,border:`1px solid ${blockForm.type===type?color:"var(--b2)"}`,background:blockForm.type===type?color+"22":"var(--card)",color:blockForm.type===type?color:"var(--mu)",fontSize:11,fontWeight:700,cursor:"pointer"}}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="field">
              <label>{t.block_reason}</label>
              <input value={blockForm.reason} onChange={e=>setBlockForm(f=>({...f,reason:e.target.value}))} placeholder={lang==="ru"?"Обед, встреча, личное...":"Pietūs, susitikimas..."}/>
            </div>
            <div style={{display:"flex",gap:8}}>
              <button className="btn b-lg" style={{flex:1,background:mc,color:"var(--bg)",fontWeight:800}} onClick={()=>{
                const newBlock={id:"bl_"+Date.now(),masterId:masterObj.id,date:blockForm.date,fromTime:blockForm.fromTime,toTime:blockForm.toTime,allDay:blockForm.allDay,type:blockForm.type,reason:blockForm.reason,createdBy:"master"};
                setBlocks(p=>[...p,newBlock]);
                addNotification("block_added",`${masterObj.firstName} заблокировал ${blockForm.date}${!blockForm.allDay?" "+blockForm.fromTime+"–"+blockForm.toTime:" (весь день)"}${blockForm.reason?" · "+blockForm.reason:""}`, masterObj.id, true);
                setBlockModal(false);
              }}>{t.block_save}</button>
              <button className="btn b-ghost" onClick={()=>setBlockModal(false)}>{t.appt_cancel}</button>
            </div>
          </div>
        </div>
      )}
      {/* ══ RESCHEDULE MODAL ══ */}
      {modal==="reschedule"&&rescheduleAppt&&masterObj&&(()=>{
        const svc=resolveBooking(rescheduleAppt);
        const dates=Array.from({length:14},(_,i)=>{const d=new Date();d.setDate(d.getDate()+i);return d;});
        return(
          <div className="overlay" onClick={()=>setModal(null)}>
            <div className="modal wide" onClick={e=>e.stopPropagation()}>
              <div className="m-title">📅 {lang==="ru"?"Перенести запись":"Perkelti rezervaciją"}</div>
              <div className="m-sub" style={{color:masterObj.color}}>
                {rescheduleAppt.clientName} · {svc?.name}
              </div>

              {/* Current time */}
              <div style={{padding:"9px 14px",background:"var(--redd)",border:"1px solid var(--red)",borderRadius:8,fontSize:12,color:"var(--red)",fontWeight:700,marginBottom:16}}>
                📍 {lang==="ru"?"Сейчас":"Dabar"}: {rescheduleAppt.date} {rescheduleAppt.time}
              </div>

              {/* Date picker */}
              <div style={{fontSize:10,color:"var(--mu)",letterSpacing:"1.5px",textTransform:"uppercase",fontWeight:800,marginBottom:7}}>
                {lang==="ru"?"Новая дата":"Nauja data"}
              </div>
              <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:16}}>
                {dates.map(d=>{
                  const ds=fmtDate(d);
                  const isToday=ds===todayStr;
                  return(
                    <button key={ds}
                      className={`dbt${rescheduleDate===ds?" on":""}`}
                      onClick={()=>{setRescheduleDate(ds);setRescheduleTime(null);}}
                    >
                      {isToday?(lang==="ru"?"Сегодня":"Šiandien"):d.toLocaleDateString(lang==="ru"?"ru-RU":"lt-LT",{weekday:"short",day:"numeric",month:"short"})}
                    </button>
                  );
                })}
              </div>

              {/* Time picker */}
              {rescheduleDate&&<>
                <div style={{fontSize:10,color:"var(--mu)",letterSpacing:"1.5px",textTransform:"uppercase",fontWeight:800,marginBottom:7}}>
                  {lang==="ru"?"Новое время":"Naujas laikas"}
                </div>
                <div className="reschedule-grid">
                  {HOURS.map(h=>{
                    // Check conflict (exclude current booking)
                    const slotStart=timeToMins(h);
                    const dur=svc?Number(svc.mins)+Number(svc.cleanup||0):30;
                    const slotEnd=slotStart+dur;
                    const conflict=bookings.some(b=>{
                      if(b.id===rescheduleAppt.id) return false;
                      if(b.status==="cancelled") return false;
                      if(String(b.masterId)!==String(rescheduleAppt.masterId)||b.date!==rescheduleDate) return false;
                      const bStart=timeToMins(b.time);
                      const bSvc=resolveSvc(b.masterId,b.serviceIds?.[0]||b.serviceId);
                      const bEnd=bStart+(bSvc?Number(bSvc.mins)+Number(bSvc.cleanup||0):30);
                      return slotStart<bEnd&&slotEnd>bStart;
                    });
                    const hm=timeToMins(h);
                    const closed=masterObj.workStart&&masterObj.workEnd?(hm<timeToMins(masterObj.workStart)||hm>=timeToMins(masterObj.workEnd)):false;
                    if(closed) return <div key={h} className="rs-slot closed">{h}</div>;
                    if(conflict) return <div key={h} className="rs-slot busy" title={lang==="ru"?"Занято":"Užimta"}>{h} ✗</div>;
                    return(
                      <button key={h} className={`rs-slot${rescheduleTime===h?" on":""}`} onClick={()=>setRescheduleTime(h)}>{h}</button>
                    );
                  })}
                </div>
              </>}

              {/* Confirm */}
              {rescheduleDate&&rescheduleTime&&(
                <div style={{marginTop:16,padding:"12px 14px",background:"var(--grd)",border:"1px solid var(--gr)",borderRadius:9,display:"flex",justifyContent:"space-between",alignItems:"center",gap:12}}>
                  <div>
                    <div style={{fontSize:11,color:"var(--mu)",fontWeight:700}}>{lang==="ru"?"Новое время:":"Naujas laikas:"}</div>
                    <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:22,color:"var(--gr)"}}>
                      {new Date(rescheduleDate+"T12:00").toLocaleDateString(lang==="ru"?"ru-RU":"lt-LT",{weekday:"short",day:"numeric",month:"short"})} · {rescheduleTime}
                    </div>
                  </div>
                  <button className="btn b-gr b-lg" onClick={()=>rescheduleApptByMaster(rescheduleAppt.id,rescheduleDate,rescheduleTime)}>
                    ✓ {lang==="ru"?"Подтвердить":"Patvirtinti"}
                  </button>
                </div>
              )}

              <div style={{display:"flex",gap:8,marginTop:12}}>
                <button className="btn b-ghost" style={{flex:1}} onClick={()=>setModal(null)}>{lang==="ru"?"Отмена":"Atšaukti"}</button>
              </div>
            </div>
          </div>
        );
      })()}
    </>
  );
}
