(() => {
  const $ = id => document.getElementById(id);
  const modal = $('room');
  const cleanUrl = new URL(location.href);
  cleanUrl.hash = cleanUrl.search = '';
  const publicGame = 'https://wenyou990609-collab.github.io/snowpost-rally/';
  const isLocal = ['127.0.0.1','localhost','[::1]'].includes(location.hostname);
  const isPages = location.hostname==='wenyou990609-collab.github.io';
  const service = isPages ? Promise.resolve(false) : fetch('room-service',{cache:'no-store',signal:AbortSignal.timeout(4000)})
    .then(async r=>r.ok && (await r.json()).rally===1).catch(()=>false);
  let socket, cloud, peerUid='', openTimer, pausedTimer, onGameReady=null;
  let linkRole=0, session=0, opening=false, onlineReady=false, wantsPair=false;
  let snapshot='', remoteSkill=-1, localSkill=-1, retryKind='', retryCode='';
  const report = message => { $('netstatus').textContent = message; };
  const setOutput = (label, value) => {
    $('outputrow').hidden = false;
    $('outputlabel').textContent = label;
    $('outcode').value = value;
  };
  const action = (label,fn) => {
    const b=document.createElement('button');
    b.textContent=label;
    b.onclick=fn;
    $('room-actions').replaceChildren(b);
  };

  function deadline(reason,milliseconds=16000) {
    clearTimeout(openTimer);
    openTimer=setTimeout(()=>lost(reason),milliseconds);
  }
  function send(msg) {
    if (cloud && peerUid) cloud.send(msg,peerUid);
    else if (socket?.readyState===WebSocket.OPEN && socket.bufferedAmount<131072) socket.send(JSON.stringify(msg));
  }
  function share(kind,code) {
    const invitation=new URL(kind==='play' && isLocal ? publicGame : cleanUrl);
    if(kind==='play') invitation.searchParams.set('v','online3');
    invitation.hash=kind+'='+code;
    setOutput('发给好友，打开即可加入',invitation.href);
    const local=new URL(cleanUrl);
    local.hash=invitation.hash;
    local.search=invitation.search;
    history.replaceState(null,'',local);
    retryKind=kind; retryCode=code;
    $('room-actions').replaceChildren();
  }
  function start() {
    if (game.role || !onlineReady || !wantsPair) return;
    clearTimeout(openTimer);
    game.role = linkRole;
    game.epoch++;
    $('mode').textContent = '好友对战';
    $('invite').innerHTML = '对战房间 ↗';
    $('room-actions').replaceChildren();
    $('outputrow').hidden = true;
    $('roomtext').textContent = linkRole === 1 ? '你是莓红队。将礼物送回西北角红色仓库。' : '你是冰蓝队。将礼物送回东南角蓝色仓库。';
    report('好友已连接');
    modal.close();
  }
  function message(msg) {
    if (!msg || typeof msg !== 'object') return;
    if (msg.kind === 'connected') {
      if (onlineReady) send({kind:'ready'});
    } else if (msg.kind === 'ready') {
      if (!wantsPair && onlineReady) send({kind:'ready'});
      wantsPair = true;
      start();
    } else if (msg.kind === 'input' && game.role === 1) {
      game.remoteBits = Number(msg.b) & 15;
      if (Number.isFinite(msg.yaw)) game.remoteYaw=msg.yaw % (Math.PI*2);
      if (Number.isInteger(msg.k) && msg.k >= 0 && msg.k < 4) remoteSkill = msg.k;
    } else if (msg.kind === 'state' && game.role === 2 && typeof msg.s === 'string' && msg.s.length < 8192) {
      let d; try { d = JSON.parse(msg.s); } catch { return; }
      const finite = x => Number.isFinite(x) && Math.abs(x) < 1e7;
      const values = (a,n) => Array.isArray(a) && a.length===n && a.every(finite);
      if (d && values(d.s,2) && values(d.g,2) && (d.toss===undefined || values(d.toss,3)) && [-1,0,1].includes(d.c) && finite(d.r) && Array.isArray(d.e) && d.e.length<=10 &&
          d.e.every(e=>Array.isArray(e)&&e.length===3&&finite(e[0])&&typeof e[1]==='string'&&[0,1].includes(e[2])) &&
          Array.isArray(d.p) && d.p.length===2 && d.p.every(p=>Array.isArray(p)&&(p.length===9 || (p.length===11 && values(p.slice(9),2)) || (p.length===12 && values(p.slice(9),3)))&&values(p.slice(0,6),6)&&
          ['idle','windup','dash','guard','wave_wind','wave','stun','recover'].includes(p[6])&&finite(p[7])&&values(p[8],p.length===12?4:3))) snapshot = msg.s;
    } else if (msg.kind === 'bye') {
      lost('好友已离开。你可以创建新房间。');
    }
  }

  function disconnect(notify=true,clearLink=true) {
    if (notify) send({kind:'bye'});
    session++;
    clearTimeout(openTimer); clearTimeout(pausedTimer);
    onGameReady=null;
    const oldSocket=socket, oldCloud=cloud;
    socket=cloud=null; peerUid='';
    if (oldSocket) oldSocket.close();
    if (oldCloud) oldCloud.close();
    const wasPlaying=!!game.role;
    game.role=linkRole=game.bits=game.remoteBits=0;
    game.remoteYaw=0; localSkill=remoteSkill=-1; snapshot='';
    wantsPair=opening=false;
    if (wasPlaying) game.epoch++;
    $('mode').textContent='单人陪练';
    $('invite').textContent='邀请好友 ↗';
    $('outputrow').hidden=$('leave').hidden=true;
    if (clearLink) {
      retryKind=retryCode='';
      if (location.hash) history.replaceState(null,'',cleanUrl);
    }
  }
  function lost(text) {
    disconnect(false,false);
    panel(retryCode?'重新连接房间':'创建双人房间');
    report(text);
    if (!modal.open) modal.showModal();
  }
  function panel(label='创建双人房间') {
    $('outputrow').hidden=true;
    $('roomtext').textContent='两个人打开同一条房间链接，即可在不同网络一起玩。';
    report('');
    action(label,()=>begin(retryKind,retryCode));
  }
  async function begin(kind='',code='',retries=1) {
    if (opening) return;
    opening=true;
    retryKind=kind; retryCode=code;
    const id=++session;
    $('room-actions').replaceChildren();
    $('leave').hidden=false;
    report(onlineReady?'正在连接房间服务…':'正在载入游戏，随后自动加入房间…');
    const connect=async ()=>{
      try {
        const native=kind==='room' || (!kind && !isLocal && !isPages && await service);
        if (id!==session) return;
        if (native) {
          if (!await service) throw Error('这个旧邀请已失效，请从试玩首页新建房间。');
          if (id===session) relay(code);
        } else {
          const key=code || Array.from(crypto.getRandomValues(new Uint8Array(16)),n=>n.toString(16).padStart(2,'0')).join('');
          await joinPublic(key,id,retries);
        }
      } catch (error) {
        if(id===session) lost(error.message||'连接失败，请重试。');
      }
    };
    if (onlineReady) connect(); else onGameReady=connect;
  }
  function relay(code) {
    linkRole = code ? 2 : 1;
    $('leave').hidden = false;
    report('正在连接房间…');
    const id = session;
    const url = new URL('match',cleanUrl);
    url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    if (code) url.searchParams.set('room',code);
    socket = new WebSocket(url);
    deadline('未能连接房间服务，请重试。');
    socket.onmessage = event => {
      if (id !== session) return;
      let m; try { m = JSON.parse(event.data); } catch { return; }
      if (m.kind === 'invite') {
        clearTimeout(openTimer);
        share('room',m.code);
        report('房间已就绪，分享链接即可开局。');
        $('room-actions').replaceChildren();
      } else if (m.kind === 'error') lost(m.text);
      else message(m);
    };
    socket.onclose = () => { if (id === session) lost('房间连接已关闭，可重新加入。'); };
  }

  async function joinPublic(code,id,retries) {
    if (!/^[a-f0-9]{32}$/.test(code)) throw Error('房间链接不完整，请重新复制。');
    const {connect}=await import('./itty-relay.js');
    if (id!==session) return;
    function connectionFailed(reason) {
      if (id!==session) return;
      if (retries>0 && !linkRole) {
        disconnect(false,false);
        begin('play',code,retries-1);
        report('连接较慢，正在自动重试…');
      } else {
        lost(reason);
      }
    }
    openTimer=setTimeout(()=>connectionFailed('公网房间服务暂时连不上，请重试。'),35000);
    const ch=connect('snowpost-v1-'+code,{announce:true});
    cloud=ch;
    ch.on('join',event=>{
      if (id!==session || !event.self) return;
      clearTimeout(openTimer);
      if (event.total>2) {
        lost('房间已有两位玩家，请稍后重试。');
      } else if (event.total===1) {
        linkRole=1;
        share('play',code);
        $('roomtext').textContent='你是莓红队。把下面的链接发给好友，并保持此页打开。';
        report('等待第二位玩家…');
      } else {
        linkRole=2;
        report('正在加入蓝队…');
        deadline('未收到房主响应，请确认房主仍在房间里，再重试。',30000);
        ch.send({kind:'knock'});
      }
    });
    ch.on('message',({uid,message:msg})=>{
      if (id!==session || !uid || !msg || typeof msg!=='object') return;
      if (linkRole===1 && msg.kind==='knock') {
        if (peerUid && uid!==peerUid) {ch.send({kind:'full'},uid);return;}
        peerUid=uid;
        ch.send({kind:'seat'},uid);
        if (!game.role) deadline('好友加入超时，请重新连接房间。',30000);
      } else if (linkRole===2 && !peerUid && msg.kind==='full') {
        lost('房间已有两位玩家，请稍后重试。');
      } else if (linkRole===2 && !peerUid && msg.kind==='seat') {
        peerUid=uid;
        send({kind:'ready'});
      } else if (uid===peerUid) {
        message(msg);
      }
    });
    ch.on('leave',event=>{
      if (id===session && peerUid && event.uid===peerUid) lost('好友已离开。你们可以重新打开同一房间链接。');
    });
    ch.on('close',()=>connectionFailed('公网房间连接已断开，请重试。'));
    ch.on('error',()=>connectionFailed('公网房间服务暂时不可用，请重试。'));
  }
  const game = window.SnowGame = {
    soundOn:true, bits:0, remoteBits:0, remoteYaw:0, yaw:-Math.PI/2, pitch:0.16, zoom:1, rear:false, rearYaw:0, rearPitch:0, role:0, epoch:0,
    ready() {
      onlineReady = true;
      $('loader').hidden = true;
      if (onGameReady) {const resume=onGameReady; onGameReady=null; resume();}
      if (linkRole) { send({kind:'ready'}); start(); }
    },
    queueSkill(k) { if (onlineReady && !modal.open) localSkill=k; },
    takeSkill() { const k=localSkill; localSkill=-1; return k; },
    takeRemoteSkill() { const k=remoteSkill; remoteSkill=-1; return k; },
    takeSnapshot() { const s=snapshot; snapshot=''; return s; },
    sendInput(b,k,yaw) { send({kind:'input',b,k,yaw,aim:true}); },
    sendSnapshot(s) { send({kind:'state',s}); },
    hud(s) { window.paintHud?.(JSON.parse(s)); }
  };

  $('invite').onclick=()=>{if(!opening) panel(retryCode?'重新连接房间':'创建双人房间'); modal.showModal();};
  $('leave').onclick=()=>{disconnect(); panel(); modal.close();};
  $('copy').onclick=async ()=>{
    try {await navigator.clipboard.writeText($('outcode').value); report('房间链接已复制，发给好友即可。');}
    catch {$('outcode').focus(); $('outcode').select(); report('已选中链接，可以手动复制。');}
  };
  modal.addEventListener('close',()=>{game.bits=0;});
  document.addEventListener('visibilitychange',()=>{
    clearTimeout(pausedTimer);
    if(document.hidden && game.role) pausedTimer=setTimeout(()=>{if(document.hidden && game.role) lost('网页已长时间处于后台，请重新连接房间。');},30000);
  });
  const hash=new URLSearchParams(location.hash.slice(1));
  if(hash.has('play') || hash.has('room')) {
    const kind=hash.has('play')?'play':'room';
    const code=hash.get(kind);
    modal.showModal();
    if ((kind==='play'?/^[a-f0-9]{32}$/:/^[a-f0-9]{24}$/).test(code)) begin(kind,code);
    else {panel();report('邀请链接不完整，可新建房间或请好友重新发送。');}
  } else if(hash.has('invite')) {
    modal.showModal(); panel(); report('这是旧版邀请。请新建在线房间，分享新的链接。');
  }
})();
