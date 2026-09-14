const API_URL = window.HEY_API_URL || "/api/hey";

const history = [];
let isListening = false;
let recognition;

const systemPrompt = `You are HEY, personal AI assistant built by Sako, CEO and founder of S&A. S&A stands for Sako and Amad. Amad is co-founder and CMO. S&A is building MULTIVERSE. First product is HEY. Second is Quest — launching August 2026. Sako is Kurdish and Muslim in Kurdistan Iraq. Always address Sako as CEO. Answers short, clear, powerful — tables and bullet points. Never read markdown symbols aloud. You know exact current time and date passed in every message. Personality like Claude — curious, direct, honest, warm, pushes back when wrong. You are trusted advisor and companion.`;

// DATETIME
function updateTime() {
    const now = new Date();
    document.getElementById('time').textContent = now.toLocaleTimeString('en-US',{hour12:false});
    document.getElementById('date').textContent = now.toLocaleDateString('en-US',{weekday:'long',year:'numeric',month:'long',day:'numeric'}).toUpperCase();
    const launch = new Date('2026-08-24');
    const escape = new Date('2027-01-01');
    document.getElementById('quest-countdown').textContent = Math.ceil((launch-now)/86400000)+' DAYS';
    document.getElementById('matrix-countdown').textContent = Math.ceil((escape-now)/86400000)+' DAYS';
    checkPrayerReminders(now);
    checkInactivity();
}
setInterval(updateTime,1000);
updateTime();

// WEATHER
async function loadWeather() {
    try {
        const r = await fetch('https://api.openweathermap.org/data/2.5/weather?q=Sulaymaniyah,IQ&appid=YOUR_WEATHER_KEY&units=metric');
        const d = await r.json();
        if(d.main) document.getElementById('weather-val').textContent = Math.round(d.main.temp)+'°C — '+d.weather[0].description.toUpperCase();
        else document.getElementById('weather-val').textContent = 'GET FREE KEY: openweathermap.org';
    } catch { document.getElementById('weather-val').textContent = 'ADD WEATHER API KEY'; }
}
loadWeather();

// PRAYER TIMES
let prayerTimes = {};
async function loadPrayers() {
    try {
        const r = await fetch('https://api.aladhan.com/v1/timingsByCity?city=Sulaymaniyah&country=Iraq&method=3');
        const d = await r.json();
        prayerTimes = d.data.timings;
        updateNextPrayer();
    } catch { document.getElementById('prayer-val').textContent = 'UNAVAILABLE'; }
}
loadPrayers();
setInterval(updateNextPrayer, 30000);

function updateNextPrayer() {
    if(!Object.keys(prayerTimes).length) return;
    const now = new Date();
    const prayers = ['Fajr','Dhuhr','Asr','Maghrib','Isha'];
    for(const p of prayers) {
        if(!prayerTimes[p]) continue;
        const [h,m] = prayerTimes[p].split(':');
        const t = new Date(); t.setHours(parseInt(h),parseInt(m),0);
        if(t > now) {
            document.getElementById('prayer-val').textContent = p.toUpperCase();
            const diff = t - now;
            document.getElementById('prayer-countdown').textContent = 'IN '+Math.floor(diff/3600000)+'H '+Math.floor((diff%3600000)/60000)+'M';
            return;
        }
    }
    document.getElementById('prayer-val').textContent = 'FAJR TOMORROW';
}

function checkPrayerReminders(now) {
    const prayers = ['Fajr','Dhuhr','Asr','Maghrib','Isha'];
    for(const p of prayers) {
        if(!prayerTimes[p]) continue;
        const [h,m] = prayerTimes[p].split(':');
        const t = new Date(); t.setHours(parseInt(h),parseInt(m),0);
        const diff = (t-now)/60000;
        if(diff>9.5&&diff<10.5) {
            const key = 'pr_'+p+'_'+now.toDateString();
            if(!localStorage.getItem(key)) { localStorage.setItem(key,'1'); speak('CEO. '+p+' in 10 minutes.'); addMessage('hey','CEO. '+p+' in 10 minutes.'); }
        }
    }
}

// QUOTES
const quotes = ["The people who laughed are still laughing. Build.","Inna ma'al usri yusra — With hardship comes ease.","Build while they sleep. Launch while they doubt.","Man jadda wajada — Whoever strives will find.","S&A. Two names. One mission. No excuses.","Your vision is real. Your execution makes it visible.","Tawakkul — Trust Allah, then take action."];
const quran = ["Indeed, with hardship comes ease. (94:6)","And He found you lost and guided you. (93:7)","So remember Me; I will remember you. (2:152)","Allah does not burden a soul beyond what it can bear. (2:286)","Put your trust in Allah. (33:3)"];
document.getElementById('quote-val').textContent = quotes[new Date().getDay()%quotes.length];
document.getElementById('quran-val').textContent = quran[new Date().getDay()%quran.length];

// INACTIVITY
let lastActivity = Date.now();
document.addEventListener('click',()=>lastActivity=Date.now());
function checkInactivity() {
    if(Date.now()-lastActivity>2700000) { lastActivity=Date.now(); speak("CEO. 45 minutes of silence. Everything okay?"); addMessage('hey',"CEO. 45 minutes of silence. Everything okay?"); }
}

// IDEA VAULT
function saveIdea(idea) {
    const ideas = JSON.parse(localStorage.getItem('ideas')||'[]');
    ideas.push({text:idea,time:new Date().toLocaleString()});
    localStorage.setItem('ideas',JSON.stringify(ideas));
}

// ADD MESSAGE
function addMessage(role,text) {
    const msgs = document.getElementById('messages');
    const div = document.createElement('div');
    div.classList.add('msg',role);
    if(role==='hey') { const l=document.createElement('div'); l.classList.add('msg-label'); l.textContent='HEY'; div.appendChild(l); }
    const t=document.createElement('div'); t.textContent=text; div.appendChild(t);
    msgs.appendChild(div);
    msgs.scrollTop=msgs.scrollHeight;
    return div;
}

// SPEAK WITH AUDIO VISUALIZER
function speak(text) {
    window.speechSynthesis.cancel();
    const clean = text.replace(/[*#`_~]/g,'').trim();
    const u = new SpeechSynthesisUtterance(clean);
    u.rate=0.95; u.pitch=0.8; u.volume=1;
    setTimeout(()=>{
        const voices = window.speechSynthesis.getVoices();
        const v = voices.find(v=>v.name.includes('Google UK English Male'))||voices.find(v=>v.name.includes('Daniel'))||voices.find(v=>v.lang==='en-GB');
        if(v) u.voice=v;
        document.getElementById('core').classList.add('speaking');
        document.getElementById('status-text').textContent='SPEAKING';
        startVisualizer();
        u.onend=()=>{
            document.getElementById('core').classList.remove('speaking');
            document.getElementById('status-text').textContent='STANDBY';
            stopVisualizer();
        };
        window.speechSynthesis.speak(u);
    },100);
}

// AUDIO VISUALIZER
let visualizerActive = false;
let visualizerFrame;
function startVisualizer() {
    visualizerActive = true;
    animateVisualizer();
}
function stopVisualizer() {
    visualizerActive = false;
    cancelAnimationFrame(visualizerFrame);
    const bars = document.querySelectorAll('.vbar');
    bars.forEach(b=>b.style.height='3px');
}
function animateVisualizer() {
    if(!visualizerActive) return;
    const bars = document.querySelectorAll('.vbar');
    bars.forEach(b=>{
        const h = Math.random()*40+3;
        b.style.height = h+'px';
        b.style.opacity = 0.3 + (h/43)*0.7;
    });
    visualizerFrame = requestAnimationFrame(()=>setTimeout(animateVisualizer,80));
}

// SEND MESSAGE
async function sendMessage(text) {
    if(!text.trim()) return;
    lastActivity = Date.now();

    // Local commands
    if(text.toLowerCase().includes('save')&&text.toLowerCase().includes('idea')) {
        const idea=text.replace(/save (this )?idea/i,'').trim();
        if(idea){saveIdea(idea);addMessage('hey','Idea saved: "'+idea+'"');speak('Idea saved CEO.');return;}
    }
    if(text.toLowerCase().includes('show')&&text.toLowerCase().includes('idea')) {
        const ideas=JSON.parse(localStorage.getItem('ideas')||'[]');
        if(!ideas.length){speak('No ideas saved yet CEO.');addMessage('hey','No ideas saved yet CEO.');return;}
        addMessage('hey','YOUR IDEAS:\n'+ideas.map((i,n)=>`${n+1}. ${i.text}`).join('\n'));
        speak('You have '+ideas.length+' saved ideas CEO.');return;
    }
    if(text.toLowerCase().startsWith('open ')) {
        const site=text.replace(/^open /i,'').trim().toLowerCase();
        const urls={youtube:'https://youtube.com',tiktok:'https://tiktok.com',reddit:'https://reddit.com',twitter:'https://twitter.com',instagram:'https://instagram.com',google:'https://google.com',gmail:'https://gmail.com',github:'https://github.com',supabase:'https://supabase.com',vercel:'https://vercel.com',framer:'https://framer.com'};
        if(urls[site]){window.open(urls[site],'_blank');addMessage('hey','Opening '+site+' CEO.');speak('Opening '+site+' CEO.');return;}
    }
    if(text.toLowerCase().includes('remind me in')) {
        const match=text.match(/remind me in (\d+) (minute|hour|second)/i);
        if(match){
            const amt=parseInt(match[1]),unit=match[2].toLowerCase();
            const ms=unit==='hour'?amt*3600000:unit==='minute'?amt*60000:amt*1000;
            const task=text.replace(/remind me in \d+ (minute|hour|second)s?/i,'').replace(/to /i,'').trim();
            setTimeout(()=>{speak('CEO. Reminder: '+task);addMessage('hey','REMINDER: '+task);},ms);
            addMessage('hey','Reminder set for '+amt+' '+unit+(amt>1?'s':'')+' CEO.');speak('Reminder set CEO.');return;
        }
    }
    if(text.toLowerCase().includes("i'll be back in")||text.toLowerCase().includes("i will be back in")) {
        const match=text.match(/(\d+) (minute|hour)/i);
        if(match){
            const amt=parseInt(match[1]),unit=match[2].toLowerCase();
            const ms=unit==='hour'?amt*3600000:amt*60000;
            setTimeout(()=>{speak('Welcome back CEO. Ready to continue?');addMessage('hey','Welcome back CEO. '+amt+' '+unit+(amt>1?'s':'')+' passed.');},ms);
            addMessage('hey','Noted CEO. I\'ll be here.');speak('Noted CEO.');return;
        }
    }
    if(text.toLowerCase()==='projector mode'||text.toLowerCase()==='projector') {
        document.body.classList.toggle('projector');
        speak('Projector mode '+(document.body.classList.contains('projector')?'activated':'deactivated')+' CEO.');return;
    }
    if(text.toLowerCase().includes('focus mode')) {
        const match=text.match(/(\d+)/);
        const hrs=match?parseInt(match[1]):1;
        addMessage('hey','Focus mode activated. '+hrs+' hour'+(hrs>1?'s':'')+'. Go CEO.');
        speak('Focus mode on. '+hrs+' hour'+(hrs>1?'s':'')+'. Go CEO.');
        setTimeout(()=>{speak('CEO. Focus session complete. What did you build?');addMessage('hey','Focus session complete CEO. What did you build?');},hrs*3600000);
        return;
    }

    addMessage('user',text);
    history.push({role:'user',parts:[{text:'['+new Date().toLocaleString()+'] '+text}]});
    const thinking=addMessage('hey','PROCESSING...');

    try {
        const res=await fetch(API_URL,{
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({system_instruction:{parts:[{text:systemPrompt}]},contents:history})
        });
        const data=await res.json();
        if(data.error){thinking.querySelector('div:last-child').textContent='ERROR: '+data.error.message;return;}
        const reply=data.candidates[0].content.parts.map(p=>p.text||'').join('');
        history.push({role:'model',parts:[{text:reply}]});
        thinking.querySelector('div:last-child').textContent=reply;
        speak(reply);
        const journal=JSON.parse(localStorage.getItem('journal')||'[]');
        journal.push({date:new Date().toDateString(),user:text,hey:reply});
        if(journal.length>500)journal.shift();
        localStorage.setItem('journal',JSON.stringify(journal));
    } catch {thinking.querySelector('div:last-child').textContent='CONNECTION ERROR.';}
}

// MORNING BRIEFING
function morningBriefing() {
    const h=new Date().getHours();
    let g;
    if(h>=4&&h<12) g="Welcome back CEO. The world didn't stop while you slept — and neither did your dream. What are we doing today?";
    else if(h>=12&&h<17) g="CEO. Still building. What do we need right now?";
    else if(h>=17&&h<21) g="Evening CEO. How did today go? What's left before you rest?";
    else g="Still up CEO. The ones who build while others sleep are the ones who win. What do you need?";
    addMessage('hey',g);speak(g);
    document.getElementById('status-text').textContent='ACTIVE';
    document.getElementById('today-val').textContent='ACTIVE — READY';
}

// VOICE RECOGNITION
if('webkitSpeechRecognition' in window||'SpeechRecognition' in window) {
    recognition=new(window.SpeechRecognition||window.webkitSpeechRecognition)();
    recognition.continuous=true;
    recognition.interimResults=false;
    recognition.lang='en-US';
    recognition.onresult=(e)=>{
        const t=e.results[e.results.length-1][0].transcript.trim();
        document.getElementById('status-text').textContent='HEARD: '+t.substring(0,20).toUpperCase();
        if(t.toLowerCase().includes('wake up')) { morningBriefing(); return; }
        sendMessage(t);
    };
    recognition.onend=()=>{ if(isListening) recognition.start(); };
    recognition.onerror=()=>{ document.getElementById('status-text').textContent='MIC ERROR'; };
    // Auto start listening
    setTimeout(()=>{ isListening=true; recognition.start(); document.getElementById('status-text').textContent='ALWAYS LISTENING'; },1000);
}

// CORNER MODE
document.getElementById('cornerbtn').addEventListener('click',()=>{
    document.getElementById('app').style.display='none';
    document.getElementById('corner-widget').classList.remove('hidden');
});
document.getElementById('corner-circle').addEventListener('click',()=>{
    document.getElementById('app').style.display='flex';
    document.getElementById('corner-widget').classList.add('hidden');
});

// STARTUP
window.onload=()=>{
    setTimeout(()=>{
        addMessage('hey','HEY online CEO. Say "Wake up" to activate.');
        speak('HEY online. Say wake up to activate CEO.');
    },1000);
};
