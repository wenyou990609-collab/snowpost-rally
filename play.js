(() => {
  const $ = id => document.getElementById(id);
  const game = window.SnowGame;
  const movement = new Map([['KeyW',1],['ArrowUp',1],['KeyS',2],['ArrowDown',2],['KeyA',4],['ArrowLeft',4],['KeyD',8],['ArrowRight',8]]);
  const keys = new Set(), touches = new Map();
  const skillKeys = new Map([['ShiftLeft',0],['Space',2]]);
  const surface=$('canvas');
  let mouseLook=false;
  let touchLook=null;
  let firstLockedMove=false;
  let rearKey=false, rearPointer=null;
  const inMenu=()=>$('room').open || $('lookpanel').open;
  const rearButton=$('glance');
  function updateGlance() {
    const held=rearKey || rearPointer!==null;
    if(held!==game.rear) {
      game.rear=held;
      game.rearYaw=game.rearPitch=0;
    }
    rearButton.setAttribute('aria-pressed',String(held));
    $('rearflag').hidden=!held;
  }
  game.resetGlance=()=>{rearKey=false;rearPointer=null;updateGlance();};
  const sensitivity=$('sensitivity');
  function showSensitivity() {
    $('sensitivity-value').textContent=Number(sensitivity.value).toFixed(2)+'×';
  }
  try {
    const saved=Number(localStorage.getItem('snowpost.look.scale'));
    if(saved>=0.5 && saved<=1.5) sensitivity.value=String(saved);
  } catch {}
  showSensitivity();
  sensitivity.oninput=()=>{
    showSensitivity();
    try {localStorage.setItem('snowpost.look.scale',sensitivity.value);} catch {}
  };
  $('looksettings').onclick=()=>$('lookpanel').showModal();
  const refresh = () => {
    game.bits = inMenu() ? 0 : [...keys,...touches.values()].reduce((bits,btn)=>bits | (typeof btn==='string'?movement.get(btn):btn),0);
  };
  const clear = () => {
    keys.clear(); touches.clear(); refresh();
    game.takeSkill();
    game.resetGlance();
  };
  let ac, sound = true, lastEpoch=-1, lastEvent=0, noticeTimer;
  let stepBuffer, stepLoad, stepBus, stepPan, stepLevel;
  function tone(hz,len,when=0) {
    if (!sound || !ac || ac.state!=='running') return;
    const start=ac.currentTime+when, osc=ac.createOscillator(), gain=ac.createGain();
    osc.type='sine'; osc.frequency.value=hz; gain.gain.setValueAtTime(.0001,start);
    gain.gain.exponentialRampToValueAtTime(.07,start+.012);
    gain.gain.exponentialRampToValueAtTime(.0001,start+len);
    osc.connect(gain).connect(ac.destination); osc.start(start); osc.stop(start+len+.01);
  }
  function enableAudio() {
    if (!sound) return;
    try {
      ac ||= new (window.AudioContext || window.webkitAudioContext)();
      if(ac.state==='suspended') ac.resume().catch(()=>{});
      if(!stepBus) {
        stepBus=ac.createGain();stepLevel=ac.createGain();stepPan=ac.createPanner();
        stepPan.panningModel='HRTF';stepPan.rolloffFactor=0;
        stepPan.connect(stepLevel).connect(stepBus).connect(ac.destination);
      }
      if(!stepLoad) {
        stepLoad=fetch('snow-step.wav').then(r=>{if(!r.ok)throw Error();return r.arrayBuffer();})
          .then(data=>ac.decodeAudioData(data)).then(buffer=>{stepBuffer=buffer;}).catch(()=>{stepLoad=null;});
      }
    } catch {}
  }
  game.footstep=(x,z,level,rate)=>{
    if(!sound || !stepBuffer || ac.state!=='running' || document.hidden || inMenu() || level<0.001) return;
    const src=ac.createBufferSource();
    src.buffer=stepBuffer;src.playbackRate.value=rate;
    stepPan.setPosition(x,-1.15,z);
    stepLevel.gain.value=level;
    src.connect(stepPan);
    src.onended=()=>src.disconnect();
    src.start();
  };
  document.addEventListener('pointerdown',enableAudio);
  window.addEventListener('keydown',e=>{
    if (inMenu() || !$('loader').hidden || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.code==='Escape') { mouseLook=false; clear(); return; }
    if (e.target.closest?.('button, input, textarea, [contenteditable="true"]')) return;
    if (e.code==='KeyQ') {e.preventDefault();rearKey=true;updateGlance();enableAudio();return;}
    if (movement.has(e.code)) { e.preventDefault(); keys.add(e.code); refresh(); enableAudio(); }
    if (skillKeys.has(e.code)) { e.preventDefault(); if (!e.repeat) { enableAudio(); game.queueSkill(skillKeys.get(e.code)); } }
  },true);
  window.addEventListener('keyup',e=>{
    if(e.code==='KeyQ'){rearKey=false;updateGlance();}
    keys.delete(e.code); refresh();
  },true);
  function releaseLook() {
    mouseLook=false;
    touchLook=null;
    clear();
    if(document.pointerLockElement===surface) document.exitPointerLock();
  }
  window.addEventListener('blur',releaseLook);
  document.addEventListener('visibilitychange',()=>{if (document.hidden) releaseLook();});
  for(const panel of [$('room'),$('lookpanel')]) {
    new MutationObserver(()=>{if(panel.open) releaseLook();}).observe(panel,{attributes:true,attributeFilter:['open']});
  }
  document.querySelectorAll('[data-dir]').forEach(button=>{
    button.onpointerdown=e=>{e.preventDefault(); button.setPointerCapture(e.pointerId); touches.set(e.pointerId,Number(button.dataset.dir)); refresh();};
    button.onlostpointercapture=e=>{touches.delete(e.pointerId);refresh();};
  });
  const skillButtons=[...document.querySelectorAll('[data-skill]')];
  skillButtons.forEach((btn,k)=>btn.onclick=()=>game.queueSkill(k));
  rearButton.onpointerdown=e=>{
    if(e.button!==0 || !$('loader').hidden || inMenu()) return;
    e.preventDefault();rearPointer=e.pointerId;
    rearButton.setPointerCapture(e.pointerId);updateGlance();
  };
  rearButton.onlostpointercapture=e=>{
    if(rearPointer===e.pointerId){rearPointer=null;updateGlance();}
  };
  rearButton.onkeydown=e=>{
    if(['Space','Enter','KeyQ'].includes(e.code)){e.preventDefault();rearKey=true;updateGlance();}
  };
  rearButton.onkeyup=e=>{
    if(['Space','Enter','KeyQ'].includes(e.code)){e.preventDefault();rearKey=false;updateGlance();}
  };
  rearButton.onblur=()=>{if(rearKey){rearKey=false;updateGlance();}};
  function look(dx,dy) {
    const scale=Number(sensitivity.value);
    const ax=dx*0.0032*scale, ay=dy*0.0024*scale;
    if(game.rear) {
      game.rearYaw=Math.max(-0.65,Math.min(0.65,game.rearYaw-ax));
      game.rearPitch=Math.max(-0.24,Math.min(0.24,game.rearPitch+ay));
    } else {
      game.yaw=(game.yaw-ax)%(2*Math.PI);
      game.pitch=Math.max(-0.17,Math.min(0.63,game.pitch+ay));
    }
  }
  surface.oncontextmenu=e=>e.preventDefault();
  surface.addEventListener('mousedown',e=>{
    if (!$('loader').hidden || inMenu() || e.sourceCapabilities?.firesTouchEvents) return;
    if(e.button===2) {
      e.preventDefault();
      surface.focus();
      game.queueSkill(1);
      return;
    }
    if(e.button!==0) return;
    game.queueSkill(3);
    if(document.pointerLockElement===surface) return;
    surface.focus();
    mouseLook=true;
    // Embedded browsers may deny pointer lock. Relative mouse movements over
    // the focused canvas still steer the character without holding a button.
    try { surface.requestPointerLock?.()?.catch?.(()=>{}); } catch {}
  });
  surface.onpointerdown=e=>{
    if(e.pointerType!=='touch' || touchLook) return;
    e.preventDefault();
    touchLook={id:e.pointerId,x:e.clientX,y:e.clientY};
    surface.setPointerCapture(e.pointerId);
  };
  surface.onpointermove=e=>{
    if(touchLook?.id!==e.pointerId) return;
    look(e.clientX-touchLook.x,e.clientY-touchLook.y);
    touchLook.x=e.clientX; touchLook.y=e.clientY;
  };
  document.addEventListener('mousemove',e=>{
    const onCanvas=mouseLook && e.target===surface && document.activeElement===surface;
    if(inMenu() || (document.pointerLockElement!==surface && !onCanvas)) return;
    if(firstLockedMove) {
      firstLockedMove=false;
      if(Math.abs(e.movementX)>180 || Math.abs(e.movementY)>120) return;
    }
    look(e.movementX,e.movementY);
  });
  document.addEventListener('pointerlockchange',()=>{
    mouseLook=document.pointerLockElement===surface;
    firstLockedMove=mouseLook;
    if(!mouseLook) clear();
  });
  surface.onlostpointercapture=e=>{if(touchLook?.id===e.pointerId) touchLook=null;};
  surface.addEventListener('wheel',e=>{e.preventDefault();game.zoom=Math.max(.62,Math.min(1.38,game.zoom*Math.exp(e.deltaY*.001)));},{passive:false});
  $('audio').onclick=()=>{sound=!sound; game.soundOn=sound; $('audio').textContent=sound?'音效 开':'音效 关';$('audio').setAttribute('aria-pressed',String(sound)); if(stepBus)stepBus.gain.value=sound?1:0; if(sound){enableAudio();tone(660,.12);}};
  const team = ['莓红队','冰蓝队'];
  window.paintHud = data => {
    if (lastEpoch!==game.epoch) { lastEvent=0;lastEpoch=game.epoch;clearTimeout(noticeTimer);$('notice').textContent=''; }
    const me=game.role===2?1:0;
    const foe=1-me;
    const stunned=data.p[me][6]==='stun';
    $('stunned').hidden=!stunned;
    if(stunned) $('stunned').textContent='眩晕中 · '+data.p[me][7].toFixed(1)+' 秒';
    $('red').textContent=data.s[0]; $('blue').textContent=data.s[1];
    $('goal').textContent=data.c===me ? (me?'带礼物回东南角冰蓝仓库':'带礼物回西北角莓红仓库') : data.c===foe ? '拦截'+team[foe]+'的运货员' : data.r>0 ? '下一份礼物即将到达广场' : '在中央广场寻找金带礼盒';
    data.p[me][8].forEach((cd,k)=>{
      skillButtons[k].disabled=stunned;
      skillButtons[k].style.setProperty('--cool',(cd/[3.5,3,2.8,4][k]*100)+'%');
      const running=k===3 && data.p[me][11]>0;
      skillButtons[k].classList.toggle('running',running);
      skillButtons[k].querySelector('small').textContent=running?'疾跑中':cd>.04?cd.toFixed(1)+' 秒':['撞落礼物','抵挡冲刺','破盾致晕','加速移动'][k];
    });
    for(const [id,name,side] of data.e) {
      if(id<=lastEvent) continue;
      lastEvent=id;
      if(name==='drop' && data.e.some(e=>e[0]===id-1 && e[1]==='break')) continue;
      const words={pickup:'拿到了礼物',score:'交付成功 +1',drop:'的礼物掉落',hit:'冲刺命中',block:'挡住了冲刺',break:'击破护盾，对手眩晕',clash:'双方冲刺相撞'};
      $('notice').textContent=name==='clash'?words.clash:team[side]+' '+(words[name]||'');
      clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>{$('notice').textContent='';},1450);
      if(name==='score'){tone(523,.17);tone(659,.19,.09);tone(784,.28,.18);}
      else if(name==='pickup') tone(740,.16);
      else if(name==='drop' && !data.e.some(e=>e[0]>id && ['hit','clash','break'].includes(e[1]))) tone(170,.13);
    }
  };
  async function launch() {
    if (!window.Engine) throw Error('引擎文件尚未加载，请刷新页面。');
    if (!window.WebAssembly || !document.createElement('canvas').getContext('webgl2')) throw Error('需要支持 WebGL 2 的浏览器，请开启硬件加速。');
    // Streaming decompression also works on static hosts without Content-Encoding rules.
    const fetchFile=window.fetch.bind(window);
    window.fetch = async function(resource, opts) {
      const url=new URL(typeof resource==='string'?resource:resource.url||resource,location.href);
      if(!url.pathname.endsWith('/snow.wasm')) return fetchFile(resource,opts);
      url.pathname+='.gz';
      const file=await fetchFile(url,opts);
      if(!file.ok) throw Error('引擎下载失败，请刷新重试。');
      const stream=file.body.pipeThrough(new DecompressionStream('gzip'));
      return new Response(stream,{headers:{'Content-Type':'application/wasm'}});
    };
    const canvas=$('canvas');
    function size() {
      const rect=canvas.parentElement.getBoundingClientRect();
      const scale=Math.min(window.devicePixelRatio||1,1.4,1550/Math.max(1,rect.width));
      canvas.width=Math.max(1,Math.round(rect.width*scale));canvas.height=Math.max(1,Math.round(rect.height*scale));
    }
    size(); new ResizeObserver(size).observe(canvas.parentElement);
    const engine=new Engine({executable:'snow',canvas,canvasResizePolicy:0,focusCanvas:false,ensureCrossOriginIsolationHeaders:false});
    await engine.startGame({onProgress:(done,total)=>{if(total>0)$('progress').style.width=Math.min(98,Math.round(done/total*100))+'%';},
      onExit:()=>{if($('loader').hidden){$('loader').hidden=false;$('loading-title').textContent='雪镇已关闭';$('load-detail').textContent='刷新页面重新进入。';}}});
  }
  launch().catch(error=>{console.error(error);$('loading-title').textContent='未能进入雪镇';$('load-detail').textContent=error.message||'请刷新重试。';});
})();
