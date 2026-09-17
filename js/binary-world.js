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
            'applyImportedWorld:applyImportedWorld,\n'+
            'setLocalProjectURL:setLocalProjectURL\n'+
            '};'))();

        window.__BW_INTERNAL=api;

        var background=(function(){
            var progressModal=document.getElementById('bwBackgroundProgress');
            var progressTitle=document.getElementById('bwProgressTitle');
            var progressStage=document.getElementById('bwProgressStage');
            var progressPercent=document.getElementById('bwProgressPercent');
            var progressBar=document.getElementById('bwProgressBar');
            var progressDetail=document.getElementById('bwProgressDetail');
            var settingsModal=document.getElementById('bwSettingsModal');
            var settingsName=document.getElementById('bwSettingsName');
            var settingsX=document.getElementById('bwSettingsX');
            var settingsY=document.getElementById('bwSettingsY');
            var settingsDelay=document.getElementById('bwSettingsDelay');
            var createDelay=document.getElementById('createDelayerInput');
            var importBusy=false;
            var pendingSnapshot=null;
            var closeTimer=0;

            function delayValue(v){v=Number(v);if(!isFinite(v))v=500;return Math.max(0,Math.min(500,Math.round(v)));}
            function gridValue(v){v=Number(v);if(!isFinite(v))v=20;return Math.max(5,Math.min(500,Math.round(v)));}

            function showProgress(title,stage,percent,detail){
                if(!progressModal)return;
                if(closeTimer){clearTimeout(closeTimer);closeTimer=0;}
                progressModal.classList.add('visible');
                progressTitle.textContent=title||'IMPORTING WORLD';
                progressStage.textContent=stage||'';
                var p=Math.max(0,Math.min(100,Number(percent)||0));
                progressPercent.textContent=Math.round(p)+'%';
                progressBar.style.width=p+'%';
                progressDetail.textContent=detail||'';
            }
            function success(detail){
                showProgress('IMPORT SUCCESS','World imported successfully.',100,detail||'Ready.');
                closeTimer=setTimeout(function(){if(progressModal)progressModal.classList.remove('visible');},900);
            }
            function failure(message){
                showProgress('IMPORT FAILED','The world could not be imported.',0,String(message||'Unknown error'));
            }
            function closeProgress(){if(progressModal){if(closeTimer)clearTimeout(closeTimer);progressModal.classList.remove('visible');}}

            async function beforeImportSnapshot(){
                if(!api.currentProjectKey||api.app.style.display==='none')return null;
                try{return await api.simulation.snapshot();}
                catch(e){try{return api.deepSnapshot();}catch(err){return null;}}
            }

            function applyImported(restored,snapshot){
                var wasEmpty=!api.currentProjectKey||api.app.style.display==='none';
                if(wasEmpty){
                    api.currentProjectKey=api.createUniqueProjectKey();
                    api.currentProjectCreatedAt=Date.now();
                    api.clearHistory();
                }else if(snapshot){api.pushHistory(snapshot);}
                api.replaceWorld(restored);
                api.activeLayer=Math.min(api.activeLayer,Math.max(0,restored.layers.length-1));
                try{api.closeModal(api.importModal);}catch(e){}
                api.enterEditor();
                api.updateHistoryButtons();
                try{api.simulation.setDelayer(api.world.meta.delayer);}catch(e){}
                if(api.simulation&&api.simulation.saveLocalRecord){
                    api.simulation.saveLocalRecord(api.currentProjectKey,api.currentProjectCreatedAt,api.activeLayer).then(function(json){
                        try{localStorage.setItem(api.currentProjectKey,json);}catch(e){api.saveCurrentProject();}
                    }).catch(function(){try{api.saveCurrentProject();}catch(e){}});
                }else{api.saveCurrentProject();}
                try{api.updateBrowserProjectURL(restored.meta.name);}catch(e){}
            }

            async function startFileImport(file,format){
                if(importBusy)return;
                importBusy=true;
                showProgress('IMPORTING WORLD','Starting background worker...',0,(file.size/1024/1024).toFixed(2)+' MB');
                try{
                    pendingSnapshot=await beforeImportSnapshot();
                    showProgress('IMPORTING WORLD','READING FILE',2,(file.size/1024/1024).toFixed(2)+' MB');
                    var buffer=await file.arrayBuffer();
                    if(!api.simulation.importBuffer(buffer,format))throw new Error('Background Worker could not be started in this browser.');
                }catch(e){importBusy=false;pendingSnapshot=null;failure(e.message||e);}
            }

            function onWorkerProgress(msg){if(!importBusy)return;showProgress('IMPORTING WORLD',msg.stage||'Processing...',msg.percent||0,msg.detail||'');}
            function onWorkerImportDone(msg){
                if(!importBusy)return;
                try{
                    applyImported(msg.world,pendingSnapshot);
                    pendingSnapshot=null;importBusy=false;
                    success((msg.world&&msg.world.meta&&msg.world.meta.name)||'Ready');
                }catch(e){pendingSnapshot=null;importBusy=false;failure(e.message||e);}
            }
            function onWorkerError(msg){
                if(!importBusy)return;
                importBusy=false;pendingSnapshot=null;
                failure(msg&&msg.error||'Background Worker error');
            }

            function openPicker(format){
                var input=document.createElement('input');
                input.type='file';input.accept=format==='json'?'.json,application/json':'.bw';input.style.display='none';
                document.body.appendChild(input);
                input.addEventListener('change',function(){
                    var f=input.files&&input.files[0];
                    try{input.remove();}catch(e){}
                    if(f)startFileImport(f,format);
                },{once:true});
                input.click();
            }

            function installImportButtons(){
                var ibw=document.getElementById('importBW'),ij=document.getElementById('importJSON');
                if(ibw)ibw.onclick=function(e){e.preventDefault();e.stopImmediatePropagation();api.closeModal(api.importModal);openPicker('bw');};
                if(ij)ij.onclick=function(e){e.preventDefault();e.stopImmediatePropagation();api.closeModal(api.importModal);openPicker('json');};
            }

            function resizeWorld(w,nx,ny){
                var oldW=Number(w.meta.grid[0])||20,oldH=Number(w.meta.grid[1])||20;
                if(oldW===nx&&oldH===ny)return false;
                for(var li=0;li<w.layers.length;li++){
                    var src=w.layers[li].schematic||[],rows=new Array(ny);
                    for(var y=0;y<ny;y++){
                        var out={};
                        if(y<oldH){
                            var row=src[y]||{};
                            for(var k in row){
                                if(!Object.prototype.hasOwnProperty.call(row,k))continue;
                                var b=row[k];if(!b)continue;
                                var x=Number(b.x!==undefined?b.x:k);
                                if(x>=0&&x<nx)out[x]=b;
                            }
                        }
                        rows[y]=out;
                    }
                    w.layers[li].schematic=rows;
                }
                w.meta.grid=[nx,ny];
                return true;
            }

            function openSettings(){
                var w=api.world;
                w.meta.delayer=delayValue(w.meta.delayer);
                settingsName.value=w.meta.name||'Project 1';
                settingsX.value=w.meta.grid[0];settingsY.value=w.meta.grid[1];settingsDelay.value=w.meta.delayer;
                settingsModal.classList.add('visible');
                setTimeout(function(){settingsName.focus();settingsName.select();},0);
            }
            function closeSettings(){settingsModal.classList.remove('visible');}
            function applySettings(){
                var w=api.world;
                var old=api.deepSnapshot();
                var name=String(settingsName.value||'').trim()||'Project 1';
                var nx=gridValue(settingsX.value),ny=gridValue(settingsY.value),nd=delayValue(settingsDelay.value);
                var resized=resizeWorld(w,nx,ny);
                var oldName=String(w.meta.name||'Project 1');
                var oldDelay=delayValue(w.meta.delayer);
                var changed=resized||oldName!==name||oldDelay!==nd||Number(old.meta.grid[0])!==nx||Number(old.meta.grid[1])!==ny;
                w.meta.name=name;w.meta.delayer=nd;
                if(changed){
                    api.pushHistory(old);
                    api.buildWorld();
                    api.simulation.setDelayer(nd);
                    api.simulation.rebuild();
                    api.saveCurrentProject();
                    api.updateBrowserProjectURL(name);
                    api.updateHistoryButtons();
                }
                closeSettings();
            }

            function init(){
                if(progressModal)progressModal.classList.remove('visible');
                var settingsButton=document.getElementById('settingsButton');
                if(settingsButton)settingsButton.onclick=openSettings;
                var cancel=document.getElementById('bwSettingsCancel'),apply=document.getElementById('bwSettingsApply');
                if(cancel)cancel.onclick=closeSettings;if(apply)apply.onclick=applySettings;
                if(settingsModal)settingsModal.addEventListener('click',function(e){if(e.target===settingsModal)closeSettings();});
                var back=document.getElementById('bwProgressClose');if(back)back.onclick=closeProgress;
                installImportButtons();
                if(settingsDelay)settingsDelay.addEventListener('input',function(){settingsDelay.value=delayValue(settingsDelay.value);});
                if(createDelay)createDelay.value='500';
                try{api.world.meta.delayer=delayValue(api.world.meta.delayer);}catch(e){}
                try{api.simulation.setDelayer(api.world.meta.delayer);}catch(e){}
                window.__BW_BACKGROUND_READY=true;
            }

            return {init:init,showProgress:showProgress,close:closeProgress,onWorkerProgress:onWorkerProgress,onWorkerImportDone:onWorkerImportDone,onWorkerError:onWorkerError,openFile:startFileImport,openSettings:openSettings,closeSettings:closeSettings};
        })();

        window.__BWBackground=background;
        background.init();
        window.BinaryWorld=window.BinaryWorld||{};
        window.BinaryWorld.openSettings=background.openSettings;
        window.BinaryWorld.closeSettings=background.closeSettings;
        window.BinaryWorld.backgroundImport=background.openFile;
    }

    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',startBinaryWorld,{once:true});
    else startBinaryWorld();
})();
