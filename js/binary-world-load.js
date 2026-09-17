(function(){
'use strict';

function getParam(name){try{return new URLSearchParams(window.location.search).get(name);}catch(e){return null;}}
function cleanupQuery(){try{var u=new URL(window.location.href);u.searchParams.delete('load');window.history.replaceState({},document.title,u.pathname+u.search+u.hash);}catch(e){}}
function waitForBackground(){
    return new Promise(function(resolve,reject){
        var started=Date.now();
        (function check(){
            if(window.__BW_BACKGROUND_READY&&window.__BW_INTERNAL&&window.__BW_INTERNAL.simulation){resolve();return;}
            if(Date.now()-started>20000){reject(new Error('Binary World background system did not start.'));return;}
            setTimeout(check,25);
        })();
    });
}
function showLoading(stage,percent,detail){if(window.__BWBackground)window.__BWBackground.showProgress('LOADING WORLD',stage,percent,detail);}

async function loadRemoteWorld(url){
    await waitForBackground();
    showLoading('DOWNLOADING WORLD',2,url);
    var response=await fetch(url,{method:'GET',credentials:'omit',cache:'no-store'});
    if(!response.ok)throw new Error('Remote world request failed: '+response.status+' '+response.statusText);

    var type=/\.json(?:[?#].*)?$/i.test(url)?'json':'bw';
    var buffer;
    if(response.body&&response.body.getReader){
        var reader=response.body.getReader(),parts=[],total=0,loaded=0,length=Number(response.headers.get('content-length'))||0;
        while(true){
            var step=await reader.read();
            if(step.done)break;
            parts.push(step.value);loaded+=step.value.byteLength;
            var p=length?Math.min(35,Math.round(loaded/length*35)):10;
            showLoading('DOWNLOADING WORLD',p,(loaded/1024/1024).toFixed(2)+(length?' / '+(length/1024/1024).toFixed(2):'')+' MB');
        }
        buffer=new Uint8Array(loaded);var off=0;for(var i=0;i<parts.length;i++){buffer.set(parts[i],off);off+=parts[i].byteLength;}
    }else{
        buffer=new Uint8Array(await response.arrayBuffer());
        showLoading('DOWNLOADING WORLD',35,(buffer.byteLength/1024/1024).toFixed(2)+' MB');
    }

    showLoading('DECODING WORLD IN BACKGROUND',40,(buffer.byteLength/1024/1024).toFixed(2)+' MB');
    var ok=window.__BW_INTERNAL.simulation.importBuffer(buffer,type);
    if(!ok)throw new Error('Background Worker is unavailable.');
    cleanupQuery();
}

async function loadLocalByName(name){
    await waitForBackground();
    var wanted=String(name||'').trim();if(!wanted)return false;
    var raw=null,key=null;
    try{
        for(var i=0;i<localStorage.length;i++){
            var k=localStorage.key(i);if(!k||k.indexOf('project_')!==0)continue;
            var text=localStorage.getItem(k);if(!text)continue;
            var simple=text.indexOf('"'+wanted.replace(/([\\"<>])/g,'\\$1')+'"')>=0;
            if(simple){raw=text;key=k;break;}
            /* Name matching is completed in the worker when needed. */
        }
    }catch(e){}
    if(!raw)return false;
    showLoading('LOADING LOCAL PROJECT',5,wanted);
    var buffer=new TextEncoder().encode(raw);
    var ok=window.__BW_INTERNAL.simulation.importBuffer(buffer,'json');
    if(!ok)throw new Error('Background Worker is unavailable.');
    return true;
}

async function start(){
    try{
        var localName=getParam('local');
        if(localName){
            var ok=await loadLocalByName(localName);
            if(ok)return;
            console.warn('Binary World local project not found:',localName);
        }
        var url=getParam('load');
        if(!url)return;
        await loadRemoteWorld(url);
    }catch(error){
        console.error('Binary World background load failed:',error);
        if(window.__BWBackground)window.__BWBackground.onWorkerError({error:error.message});
        else alert('Binary World load failed:\n'+error.message);
    }
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
else start();

window.BinaryWorldRemoteLoader=window.BinaryWorldRemoteLoader||{};
window.BinaryWorldRemoteLoader.load=loadRemoteWorld;
window.BinaryWorldLocalLoader=window.BinaryWorldLocalLoader||{};
window.BinaryWorldLocalLoader.loadByName=loadLocalByName;
})();
/* Binary World Settings / Delayer controls.
 * Loaded after binary-world.js + binary-world-load.js.
 * Does not require index.html changes when included after binary-world-load.js.
 */
(function(){
'use strict';
var api=window.__BW_INTERNAL;
if(!api){console.warn('Binary World Settings: internal API unavailable');return;}

function clampDelay(v){v=Number(v);if(!isFinite(v))v=500;return Math.max(0,Math.min(500,Math.round(v)));}
function clampGrid(v){v=Number(v);if(!isFinite(v))v=20;return Math.max(5,Math.min(500,Math.round(v)));}
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c];});}

function ensureMeta(){
    var w=api.world;
    if(!w.meta)w.meta={};
    if(!Array.isArray(w.meta.grid))w.meta.grid=[20,20];
    w.meta.delayer=clampDelay(w.meta.delayer===undefined?500:w.meta.delayer);
    if(!w.meta.name)w.meta.name='Project 1';
    return w;
}

function installStyle(){
    if(document.getElementById('bwSettingsStyle'))return;
    var s=document.createElement('style');s.id='bwSettingsStyle';
    s.textContent=''+
    '#bwSettingsModal{position:fixed;inset:0;z-index:2147483640;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.62);backdrop-filter:blur(3px);padding:18px;}'+
    '#bwSettingsModal.visible{display:flex;}'+
    '#bwSettingsModal .bwSettingsBox{width:min(480px,94vw);max-height:90vh;overflow:auto;background:#111;border:1px solid rgba(255,255,255,.18);border-radius:16px;box-shadow:0 18px 60px rgba(0,0,0,.55);padding:20px;color:#fff;font:14px/1.35 system-ui,sans-serif;}'+
    '#bwSettingsModal .bwSettingsTitle{font-size:19px;font-weight:700;margin-bottom:6px;}'+
    '#bwSettingsModal .bwSettingsSub{font-size:12px;opacity:.7;margin-bottom:18px;}'+
    '#bwSettingsModal .bwSettingsField{display:block;margin:12px 0;}'+
    '#bwSettingsModal .bwSettingsField>span{display:block;font-size:11px;opacity:.72;margin-bottom:6px;letter-spacing:.08em;}'+
    '#bwSettingsModal input{width:100%;box-sizing:border-box;border:1px solid rgba(255,255,255,.2);border-radius:9px;background:#080808;color:#fff;padding:11px;font:inherit;outline:none;}'+
    '#bwSettingsModal input:focus{border-color:#fff;}'+
    '#bwSettingsModal .bwSettingsGrid{display:grid;grid-template-columns:1fr 1fr;gap:10px;}'+
    '#bwSettingsModal .bwSettingsHint{font-size:11px;opacity:.55;margin-top:5px;}'+
    '#bwSettingsModal .bwSettingsActions{display:flex;justify-content:flex-end;gap:8px;margin-top:20px;}'+
    '#bwSettingsModal button{border:1px solid rgba(255,255,255,.2);border-radius:9px;background:#1b1b1b;color:#fff;padding:10px 14px;font:inherit;}'+
    '#bwSettingsModal button.dark{background:#fff;color:#000;border-color:#fff;}'+
    '#bwSettingsModal .bwSettingsWarn{display:none;margin-top:12px;padding:10px;border-radius:9px;background:#251b0d;border:1px solid #6b4b16;font-size:12px;}'+
    '#bwCreationDelayWrap{margin-top:12px;}'+
    '#bwSettingsButton{margin-left:4px;}';
    document.head.appendChild(s);
}

function makeButton(){
    var hr=document.getElementById('headerRight');if(!hr||document.getElementById('bwSettingsButton'))return;
    var help=hr.querySelector('button[onclick="openGuide()"]');
    var b=document.createElement('button');b.id='bwSettingsButton';b.className='headerButton';b.textContent='SETTINGS';b.title='Project settings';b.onclick=openSettings;
    if(help&&help.parentNode===hr)hr.insertBefore(b,help.nextSibling);else hr.insertBefore(b,hr.firstChild);
}

function makeModal(){
    if(document.getElementById('bwSettingsModal'))return;
    installStyle();
    var m=document.createElement('div');m.id='bwSettingsModal';m.className='modal';
    m.innerHTML='<div class="bwSettingsBox">'+
        '<div class="bwSettingsTitle">SETTINGS</div>'+
        '<div class="bwSettingsSub">Change the current Binary World project settings.</div>'+
        '<label class="bwSettingsField"><span>PROJECT NAME</span><input id="bwSettingsName" type="text" autocomplete="off"></label>'+
        '<div class="bwSettingsGrid">'+
          '<label class="bwSettingsField"><span>GRID X</span><input id="bwSettingsX" type="number" min="5" max="500" step="1" inputmode="numeric"></label>'+
          '<label class="bwSettingsField"><span>GRID Y</span><input id="bwSettingsY" type="number" min="5" max="500" step="1" inputmode="numeric"></label>'+ 
        '</div>'+ 
        '<label class="bwSettingsField"><span>DELAYER (MS)</span><input id="bwSettingsDelay" type="number" min="0" max="500" step="1" inputmode="numeric"></label>'+ 
        '<div class="bwSettingsHint">Delayer default: 500 ms. Maximum: 500 ms. Set 0 for no delay.</div>'+ 
        '<div id="bwSettingsWarn" class="bwSettingsWarn"></div>'+ 
        '<div class="bwSettingsActions"><button id="bwSettingsCancel">CANCEL</button><button id="bwSettingsApply" class="dark">APPLY</button></div>'+ 
      '</div>';
    document.body.appendChild(m);
    m.addEventListener('click',function(e){if(e.target===m)closeSettings();});
    document.getElementById('bwSettingsCancel').onclick=closeSettings;
    document.getElementById('bwSettingsApply').onclick=applySettings;
    document.getElementById('bwSettingsX').addEventListener('input',showResizeWarning);
    document.getElementById('bwSettingsY').addEventListener('input',showResizeWarning);
}
function showResizeWarning(){
    var w=ensureMeta(),x=clampGrid(document.getElementById('bwSettingsX').value),y=clampGrid(document.getElementById('bwSettingsY').value),warn=document.getElementById('bwSettingsWarn');
    if(x<w.meta.grid[0]||y<w.meta.grid[1]){warn.style.display='block';warn.textContent='Reducing the grid can remove blocks outside the new boundaries.';}else warn.style.display='none';
}
function openSettings(){
    makeModal();var w=ensureMeta();
    document.getElementById('bwSettingsName').value=w.meta.name||'Project 1';
    document.getElementById('bwSettingsX').value=w.meta.grid[0];document.getElementById('bwSettingsY').value=w.meta.grid[1];document.getElementById('bwSettingsDelay').value=w.meta.delayer;
    showResizeWarning();document.getElementById('bwSettingsModal').classList.add('visible');
}
function closeSettings(){var m=document.getElementById('bwSettingsModal');if(m)m.classList.remove('visible');}

function resizeWorld(w,newW,newH){
    var oldW=Number(w.meta.grid[0])||20,oldH=Number(w.meta.grid[1])||20;
    if(oldW===newW&&oldH===newH)return false;
    for(var li=0;li<w.layers.length;li++){
        var oldRows=w.layers[li].schematic||[],rows=new Array(newH);
        for(var y=0;y<newH;y++){
            var out={};var row=oldRows[y]||{};
            if(y<oldH){for(var k in row){if(!Object.prototype.hasOwnProperty.call(row,k))continue;var b=row[k];if(!b)continue;var x=Number(b.x!==undefined?b.x:k);if(x>=0&&x<newW){out[x]=b;}}}
            rows[y]=out;
        }
        w.layers[li].schematic=rows;
    }
    w.meta.grid=[newW,newH];return true;
}
function applySettings(){
    var w=ensureMeta();
    var name=(document.getElementById('bwSettingsName').value||'').trim()||'Project 1';
    var nx=clampGrid(document.getElementById('bwSettingsX').value),ny=clampGrid(document.getElementById('bwSettingsY').value),nd=clampDelay(document.getElementById('bwSettingsDelay').value);
    var old=api.deepSnapshot();var changed=resizeWorld(w,nx,ny);w.meta.name=name;w.meta.delayer=nd;
    var metaChanged=JSON.stringify(old.meta)!==JSON.stringify({grid:[nx,ny],name:name});
    if(changed||metaChanged){
        try{api.pushHistory(old);}catch(e){}
        try{api.buildWorld();}catch(e){console.error(e);}
        try{api.simulation.setDelayer(nd);}catch(e){}
        try{api.simulation.rebuild();}catch(e){console.error(e);}
        try{api.saveCurrentProject();}catch(e){console.warn('Settings save failed',e);}
        try{api.updateBrowserProjectURL(name);}catch(e){}
    }else{try{api.simulation.setDelayer(nd);}catch(e){}}
    closeSettings();
}

/* Patch the Delayer definition on the main thread. The Worker gets the same setting
 * through simulation.setDelayer()/world.meta.delayer. */
function patchDelayer(){
    if(!window.__BW_INTERNAL||!window.__BW_INTERNAL.blocks)return;
    var d=window.__BW_INTERNAL.blocks.delayer;if(!d||d.__bwSettingsPatched)return;
    var original=d.function;
    d.function=function(ctx){var r=original(ctx)||{};r.delay=clampDelay(window.__BW_INTERNAL.world.meta&&window.__BW_INTERNAL.world.meta.delayer);return r;};
    d.__bwSettingsPatched=true;
}

/* Add Delayer to CREATE NEW without requiring index.html edits. */
function addCreationField(){
    var modal=document.getElementById('createNewModal');if(!modal||document.getElementById('bwCreateDelayInput'))return;
    var actions=modal.querySelector('.modalActions');if(!actions)return;
    var wrap=document.createElement('label');wrap.className='modalField';wrap.id='bwCreationDelayWrap';wrap.innerHTML='<span>DELAYER MS</span><input id="bwCreateDelayInput" type="number" min="0" max="500" step="1" inputmode="numeric" value="500"><div style="font-size:11px;opacity:.55;margin-top:5px">Default 500 ms · Maximum 500 ms</div>';
    actions.parentNode.insertBefore(wrap,actions);
    document.addEventListener('click',function(e){
        if(e.target&&e.target.id==='createNewConfirm'){
            var value=clampDelay(document.getElementById('bwCreateDelayInput').value);
            setTimeout(function(){
                var w=api.world;w.meta.delayer=value;
                try{api.simulation.setDelayer(value);api.simulation.rebuild();api.saveCurrentProject();}catch(err){console.warn(err);}
            },0);
        }
    },true);
}

/* Keep local/JSON import settings when available. */
function patchImportedMeta(){
    var originalReplace=api.replaceWorld;
    if(originalReplace.__bwSettingsWrapped)return;
    api.replaceWorld=function(restored){
        if(restored&&restored.meta)restored.meta.delayer=clampDelay(restored.meta.delayer===undefined?500:restored.meta.delayer);
        var r=originalReplace(restored);
        try{api.simulation.setDelayer(api.world.meta.delayer);}catch(e){}
        return r;
    };
    api.replaceWorld.__bwSettingsWrapped=true;
}

function boot(){
    makeButton();makeModal();addCreationField();patchDelayer();patchImportedMeta();
    var w=ensureMeta();try{api.simulation.setDelayer(w.meta.delayer);}catch(e){}
    /* Reapply once after startup/load scripts have settled. */
    setTimeout(function(){makeButton();addCreationField();patchDelayer();patchImportedMeta();},100);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
window.BinaryWorld=window.BinaryWorld||{};
window.BinaryWorld.openSettings=openSettings;window.BinaryWorld.closeSettings=closeSettings;
window.BinaryWorld.exportJSON=function(){
    var w=ensureMeta(),out={meta:{grid:[w.meta.grid[0],w.meta.grid[1]],name:w.meta.name,delayer:w.meta.delayer},layers:[]};
    for(var li=0;li<w.layers.length;li++){var src=w.layers[li],rows=[];for(var y=0;y<w.meta.grid[1];y++){var row=src.schematic[y]||{},r={};for(var k in row){if(!Object.prototype.hasOwnProperty.call(row,k))continue;var b=row[k];if(!b)continue;r[k]={type:b.type,x:Number(b.x!==undefined?b.x:k),y:Number(b.y!==undefined?b.y:y),layer:li,rotation:Number(b.rotation)||0,pressed:false,state:b.state?1:0};}rows.push(r);}out.layers.push({name:src.name||'Layer '+li,schematic:rows});}
    if(typeof downloadBytes==='function')downloadBytes(new TextEncoder().encode(JSON.stringify(out,null,2)),filenameSafe(w.meta.name)+'.json','application/json');
    return out;
};
})();
