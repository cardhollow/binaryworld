(function(){
    'use strict';

    function startBinaryWorld(){
        var parts=window.__BinaryWorldSourceParts||[];
        if(parts.length!==7)throw new Error('Binary World source modules did not load correctly: expected 7 parts, got '+parts.length);
        var source=parts.join('');
        delete window.__BinaryWorldSourceParts;

        var api=(new Function(source+'\nreturn {\n'+
            'get world(){return world;},\n'+
            'get activeLayer(){return activeLayer;}, set activeLayer(v){activeLayer=Number(v)||0;},\n'+
            'get currentProjectKey(){return currentProjectKey;}, set currentProjectKey(v){currentProjectKey=v;},\n'+
            'get currentProjectCreatedAt(){return currentProjectCreatedAt;}, set currentProjectCreatedAt(v){currentProjectCreatedAt=Number(v)||0;},\n'+
            'get app(){return app;},\n'+
            'get importModal(){return importModal;},\n'+
            'get simulation(){return simulation;},\n'+
            'get BW(){return BW;},\n'+
            'get blocks(){return blocks;},\n'+
            'getBlock:getBlock,\n'+
            'deepSnapshot:deepSnapshot,\n'+
            'serializableWorld:serializableWorld,\n'+
            'clearHistory:clearHistory,\n'+
            'pushHistory:pushHistory,\n'+
            'updateHistoryButtons:updateHistoryButtons,\n'+
            'createUniqueProjectKey:createUniqueProjectKey,\n'+
            'replaceWorld:replaceWorld,\n'+
            'normalizeJSONWorld:normalizeJSONWorld,\n'+
            'enterEditor:enterEditor,\n'+
            'buildWorld:buildWorld,\n'+
            'saveCurrentProject:saveCurrentProject,\n'+
            'updateBrowserProjectURL:updateBrowserProjectURL,\n'+
            'closeModal:closeModal,\n'+
            'applyImportedWorld:applyImportedWorld\n'+
            '};'))();

        window.__BW_INTERNAL=api;

        function waitForBackgroundController(){
            if(window.__BWBackground){
                window.__BW_BACKGROUND_READY=true;
                window.__BWBackground.install();
                return;
            }
            setTimeout(waitForBackgroundController,0);
        }

        window.__BWBackground=(function(){
            var progressModal=null;
            var progressTitle=null;
            var progressStage=null;
            var progressPercent=null;
            var progressBar=null;
            var progressDetail=null;
            var closeTimer=null;
            var importBusy=false;
            var pendingSnapshot=null;
            var installed=false;

            function installStyle(){
                if(document.getElementById('bw-background-style'))return;
                var style=document.createElement('style');
                style.id='bw-background-style';
                style.textContent=''+
                    '#bwBackgroundProgress{position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.58);backdrop-filter:blur(3px);padding:18px;}' +
                    '#bwBackgroundProgress .bwProgressBox{width:min(440px,92vw);background:#111;border:1px solid rgba(255,255,255,.18);border-radius:16px;box-shadow:0 18px 60px rgba(0,0,0,.5);padding:20px;color:#fff;font:14px/1.35 system-ui,sans-serif;}' +
                    '#bwBackgroundProgress .bwProgressTitle{font-size:18px;font-weight:700;margin-bottom:8px;letter-spacing:.02em;}' +
                    '#bwBackgroundProgress .bwProgressStage{font-size:13px;opacity:.85;margin-bottom:14px;}' +
                    '#bwBackgroundProgress .bwProgressTrack{height:10px;background:#2a2a2a;border-radius:999px;overflow:hidden;}' +
                    '#bwBackgroundProgress .bwProgressBar{height:100%;width:0%;background:#fff;border-radius:999px;transition:width .12s linear;}' +
                    '#bwBackgroundProgress .bwProgressRow{display:flex;justify-content:space-between;gap:12px;margin-top:10px;font-size:12px;opacity:.8;}' +
                    '#bwBackgroundProgress .bwProgressDetail{margin-top:12px;font-size:12px;opacity:.72;word-break:break-word;}' +
                    '#bwBackgroundProgress .bwProgressClose{display:none;margin-top:15px;width:100%;padding:10px;border:1px solid rgba(255,255,255,.2);border-radius:9px;background:#1a1a1a;color:#fff;}';
                document.head.appendChild(style);
            }
            function ensureModal(){
                if(progressModal)return;
                installStyle();
                progressModal=document.createElement('div');
                progressModal.id='bwBackgroundProgress';
                progressModal.innerHTML='<div class="bwProgressBox">'+
                    '<div class="bwProgressTitle">IMPORTING WORLD</div>'+
                    '<div class="bwProgressStage">Starting...</div>'+
                    '<div class="bwProgressTrack"><div class="bwProgressBar"></div></div>'+
                    '<div class="bwProgressRow"><span class="bwProgressPercent">0%</span><span>BACKGROUND WORKER</span></div>'+
                    '<div class="bwProgressDetail"></div>'+
                    '</div>';
                document.body.appendChild(progressModal);
                progressTitle=progressModal.querySelector('.bwProgressTitle');
                progressStage=progressModal.querySelector('.bwProgressStage');
                progressPercent=progressModal.querySelector('.bwProgressPercent');
                progressBar=progressModal.querySelector('.bwProgressBar');
                progressDetail=progressModal.querySelector('.bwProgressDetail');
            }
            function showProgress(title,stage,percent,detail){
                ensureModal();
                clearTimeout(closeTimer);progressModal.style.display='flex';
                progressTitle.textContent=title||'IMPORTING WORLD';
                progressStage.textContent=stage||'';
                percent=Math.max(0,Math.min(100,Number(percent)||0));
                progressPercent.textContent=Math.round(percent)+'%';
                progressBar.style.width=percent+'%';
                progressDetail.textContent=detail||'';
            }
            function success(detail){
                showProgress('IMPORT SUCCESS','World imported successfully.',100,detail||'Simulation continues in the background.');
                clearTimeout(closeTimer);
                closeTimer=setTimeout(function(){if(progressModal)progressModal.style.display='none';},1000);
            }
            function failure(message){
                showProgress('IMPORT FAILED','The world could not be imported.',0,String(message||'Unknown error'));
            }
            function close(){if(progressModal){clearTimeout(closeTimer);progressModal.style.display='none';}}

            async function beforeImportSnapshot(){
                var app=api.app;
                var key=api.currentProjectKey;
                if(!key||app.style.display==='none')return null;
                try{return await api.simulation.snapshot();}catch(e){
                    try{return api.deepSnapshot();}catch(err){return null;}
                }
            }

            function applyImportedWorldBackground(restored,snapshot){
                var app=api.app;
                var key=api.currentProjectKey;
                if(!key||app.style.display==='none'){
                    api.currentProjectKey=api.createUniqueProjectKey();
                    api.currentProjectCreatedAt=Date.now();
                    api.clearHistory();
                }else if(snapshot){
                    api.pushHistory(snapshot);
                }
                api.replaceWorld(restored);
                api.activeLayer=Math.min(api.activeLayer,Math.max(0,restored.layers.length-1));
                try{api.closeModal(api.importModal);}catch(e){}
                api.enterEditor();
                api.updateHistoryButtons();
                if(api.simulation&&api.simulation.saveLocalRecord){
                    api.simulation.saveLocalRecord(api.currentProjectKey,api.currentProjectCreatedAt,api.activeLayer).then(function(json){
                        try{localStorage.setItem(api.currentProjectKey,json);}catch(e){console.warn('Background local save failed:',e);}
                    }).catch(function(e){console.warn('Background local save failed:',e);});
                }else{
                    api.saveCurrentProject();
                }
                try{api.updateBrowserProjectURL(restored.meta.name);}catch(e){}
            }

            async function startFileImport(file,format){
                if(importBusy)return;
                importBusy=true;
                showProgress('IMPORTING WORLD','Reading file...',2,(file.size/1024/1024).toFixed(2)+' MB');
                try{
                    pendingSnapshot=await beforeImportSnapshot();
                    var buffer=await file.arrayBuffer();
                    var ok=api.simulation.importBuffer(buffer,format);
                    if(!ok)throw new Error('Background Worker is unavailable.');
                }catch(err){
                    importBusy=false;failure(err.message||err);return;
                }
            }

            function onWorkerProgress(msg){
                if(!importBusy)return;
                showProgress('IMPORTING WORLD',msg.stage||'Processing...',msg.percent||0,msg.detail||'');
            }
            function onWorkerImportDone(msg){
                if(!importBusy)return;
                try{
                    applyImportedWorldBackground(msg.world,pendingSnapshot);
                    pendingSnapshot=null;
                    importBusy=false;
                    success((msg.world&&msg.world.meta&&msg.world.meta.name)?String(msg.world.meta.name):'Ready');
                }catch(err){
                    importBusy=false;pendingSnapshot=null;failure(err.message||err);
                }
            }
            function onWorkerError(msg){
                if(!importBusy)return;
                importBusy=false;pendingSnapshot=null;
                failure(msg&&msg.error?msg.error:'Background Worker error');
            }

            function captureImportFileInputs(){
                document.addEventListener('change',function(e){
                    var input=e.target;
                    if(!input||String(input.tagName||'').toLowerCase()!=='input'||String(input.type||'').toLowerCase()!=='file')return;
                    var accept=String(input.accept||'').toLowerCase();
                    var isBW=accept.indexOf('.bw')>=0||accept.indexOf('application/x-binary-world')>=0;
                    var isJSON=accept.indexOf('.json')>=0||accept.indexOf('application/json')>=0;
                    if(!isBW&&!isJSON)return;
                    var file=input.files&&input.files[0];
                    if(!file)return;
                    e.stopPropagation();
                    if(e.stopImmediatePropagation)e.stopImmediatePropagation();
                    try{input.remove();}catch(err){}
                    startFileImport(file,isJSON?'json':'bw');
                },true);
            }

            function hookButtons(){
                var bwButton=document.getElementById('importBW');
                var jsonButton=document.getElementById('importJSON');
                if(bwButton){bwButton.onclick=function(){try{api.closeModal(api.importModal);}catch(e){};openPicker('bw');};}
                if(jsonButton){jsonButton.onclick=function(){try{api.closeModal(api.importModal);}catch(e){};openPicker('json');};}
            }
            function openPicker(format){
                var input=document.createElement('input');input.type='file';input.accept=format==='json'?'.json,application/json':'.bw';input.style.display='none';document.body.appendChild(input);
                input.addEventListener('change',function(){var f=input.files&&input.files[0];if(!f){try{input.remove();}catch(e){}return;}startFileImport(f,format);try{input.remove();}catch(e){}},{once:true});
                input.click();
            }

            function install(){
                if(installed)return;
                installed=true;
                installStyle();
                captureImportFileInputs();
                hookButtons();
                window.__BW_BACKGROUND_READY=true;
            }

            return {
                install:install,
                onWorkerProgress:onWorkerProgress,
                onWorkerImportDone:onWorkerImportDone,
                onWorkerError:onWorkerError,
                showProgress:showProgress,
                close:close,
                openFile:function(file,format){return startFileImport(file,format);}
            };
        })();

        window.__BWBackground.install();
    }

    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',startBinaryWorld,{once:true});
    else startBinaryWorld();
})();
