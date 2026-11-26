(() => {
  const $ = (id) => document.getElementById(id);
  const modal = $('room');
  let socket, peer, channel, openTimer, pausedTimer, linkRole = 0, session = 0;
  let snapshot = '', remoteSkill = -1, localSkill = -1, onlineReady = false;
  let wantsPair = false;
  const cleanUrl = new URL(location.href);
  cleanUrl.hash = '';
  cleanUrl.search = '';
  const service = fetch('room-service', {cache:'no-store'}).then(async r => r.ok && (await r.json()).rally === 1).catch(() => false);
  const report = message => { $('netstatus').textContent = message; };
  const setOutput = (label, value) => {
    $('outputrow').hidden = false;
    $('outputlabel').textContent = label;
    $('outcode').value = value;
  };
  const action = (name, fn) => {
    const b = document.createElement('button');
    b.innerText = name;
    b.onclick = () => Promise.resolve(fn()).catch(err => {
      disconnect(false);
      panel();
      report(err.message || '连接失败，请重试。');
    });
    $('room-actions').replaceChildren(b);
  };
  function send(msg) {
    const wire = channel && channel.readyState === 'open' ? channel : socket && socket.readyState === 1 ? socket : null;
    if (wire && wire.bufferedAmount < 131072) wire.send(JSON.stringify(msg));
  }
  function start() {
    if (game.role || !onlineReady || !wantsPair) return;
    game.role = linkRole;
    game.epoch++;
    $('mode').textContent = '好友对战';
    $('invite').innerHTML = '对战房间 ↗';
    $('room-actions').replaceChildren();
    $('inputrow').hidden = $('outputrow').hidden = true;
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
  function disconnect(notify = true) {
    session++;
    if (notify) send({kind:'bye'});
    clearTimeout(openTimer);
    clearTimeout(pausedTimer);
    const s = socket, p = peer, c = channel;
    socket = peer = channel = null;
    if (s) s.close();
    if (c) c.close();
    if (p) p.close();
    const wasPlaying = !!game.role;
    game.role = linkRole = game.bits = game.remoteBits = 0;
    game.remoteYaw=0;
    localSkill = remoteSkill = -1;
    snapshot = '';
    wantsPair = false;
    if (wasPlaying) game.epoch++;
    $('mode').textContent = '单人陪练';
    $('invite').innerHTML = '邀请好友 <b>↗</b>';
    $('leave').hidden = true;
    if (location.hash) history.replaceState(null,'',cleanUrl);
  }
  function lost(text) {
    disconnect(false);
    panel();
    report(text);
    if (!modal.open) modal.showModal();
  }
  function panel() {
    if (linkRole) return;
    $('inputrow').hidden = $('outputrow').hidden = true;
    $('roomtext').textContent = '邀请一位好友加入。两队从各自仓库出发。';
    report('');
    action('创建双人房间', async () => {
      $('room-actions').replaceChildren();
      if (await service) relay('');
      else await directHost();
    });
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
    socket.onmessage = event => {
      if (id !== session) return;
      let m; try { m = JSON.parse(event.data); } catch { return; }
      if (m.kind === 'invite') {
        const url = new URL(cleanUrl);
        url.hash = 'room=' + m.code;
        setOutput('邀请链接',url.href);
        report('等待好友进入。');
        $('room-actions').replaceChildren();
      } else if (m.kind === 'error') lost(m.text);
      else message(m);
    };
    socket.onclose = () => { if (id === session) lost('房间连接已关闭，可重新加入。'); };
  }
  function setupPeer(role) {
    if (!window.RTCPeerConnection) throw Error('此浏览器不支持网页直连，请使用新版 Edge、Chrome 或 Safari。');
    const id = session;
    linkRole = role;
    $('leave').hidden = false;
    peer = new RTCPeerConnection({iceServers:[{urls:['stun:stun.cloudflare.com:3478','stun:stun.l.google.com:19302']}]});
    peer.onconnectionstatechange = () => {
      if (id !== session || !peer) return;
      if (peer.connectionState === 'failed') lost('两端网络未能直连。可更换网络，或使用带房间服务的试玩地址。');
    };
    function use(ch) {
      channel = ch;
      ch.onopen = () => {
        if (id !== session) return;
        clearTimeout(openTimer);
        if (onlineReady) send({kind:'ready'});
      };
      ch.onmessage = e => {
        if (id !== session || typeof e.data !== 'string' || e.data.length>12000) return;
        try { message(JSON.parse(e.data)); } catch { /* Ignore malformed packets. */ }
      };
      ch.onclose = () => { if (id === session) lost('好友连接已结束。'); };
    }
    if (role === 1) use(peer.createDataChannel('snowpost'));
    else peer.ondatachannel = e => use(e.channel);
  }
  async function description() {
    const p = peer;
    await p.setLocalDescription();
    if (p.iceGatheringState !== 'complete') {
      await new Promise(resolve => {
        const end = () => { clearTimeout(timer); p.removeEventListener('icegatheringstatechange',check); resolve(); };
        const check = () => { if (p.iceGatheringState==='complete') end(); };
        const timer = setTimeout(end,4500);
        p.addEventListener('icegatheringstatechange',check);
        check();
      });
    }
    if (p !== peer) throw Error('邀请已取消。');
    return btoa(p.localDescription.sdp).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  }
  function sdp(code) {
    if (!/^[\w-]{20,22000}$/.test(code)) throw Error('邀请码格式有误，请完整复制。');
    return atob(code.replace(/-/g,'+').replace(/_/g,'/'));
  }
  async function directHost() {
    setupPeer(1);
    report('正在生成邀请链接…');
    const code = await description();
    const url = new URL(cleanUrl);
    url.hash = 'invite='+code;
    setOutput('① 将邀请链接发给好友',url.href);
    $('inputrow').hidden = false;
    $('roomtext').textContent = '好友打开链接后会得到一段回执。将回执贴到这里，双方即可开局。';
    report('等待好友回执。请保持此页打开。');
  }
  function timeout() {
    clearTimeout(openTimer);
    openTimer = setTimeout(() => lost('连接超时。请重新邀请，或使用带房间服务的试玩地址。'),30000);
  }
  async function directGuest(code) {
    setupPeer(2);
    report('正在生成回执…');
    await peer.setRemoteDescription({type:'offer',sdp:sdp(code)});
    setOutput('复制回执，发给邀请你的好友',await description());
    report('等待房主粘贴回执。');
  }
  const game = window.SnowGame = {
    soundOn:true, bits:0, remoteBits:0, remoteYaw:0, yaw:-Math.PI/2, pitch:0.16, zoom:1, rear:false, rearYaw:0, rearPitch:0, role:0, epoch:0,
    ready() {
      onlineReady = true;
      $('loader').hidden = true;
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
  $('invite').onclick = () => { if (!linkRole) panel(); modal.showModal(); };
  $('leave').onclick = () => { disconnect(); panel(); modal.close(); };
  $('copy').onclick = async () => {
    try { await navigator.clipboard.writeText($('outcode').value); report('已复制，可以发给好友。'); }
    catch { $('outcode').focus(); $('outcode').select(); report('已选中，可手动复制。'); }
  };
  $('accept').onclick = async () => {
    try { await peer.setRemoteDescription({type:'answer',sdp:sdp($('answer').value.trim())}); report('正在连接好友…'); timeout(); }
    catch { report('回执无效或已过期，请检查内容。'); }
  };
  modal.addEventListener('close',() => { game.bits=0; });
  document.addEventListener('visibilitychange',() => {
    clearTimeout(pausedTimer);
    if (document.hidden && game.role) pausedTimer=setTimeout(()=>{ if(document.hidden && game.role) lost('游戏页已长时间处于后台，请重新加入。'); },30000);
  });
  const hash = new URLSearchParams(location.hash.slice(1));
  if (hash.has('room') || hash.has('invite')) {
    modal.showModal();
    const code = hash.get('room') || hash.get('invite');
    action('加入好友对战',async () => {
      $('room-actions').replaceChildren();
      if (hash.has('room')) {
        if (!await service) throw Error('该地址未启用房间服务。请让好友重新创建邀请。');
        relay(code);
      } else await directGuest(code);
    });
    $('roomtext').textContent = '好友邀请你到雪镇争夺礼物。你将从蓝色仓库出发。';
  }
})();
