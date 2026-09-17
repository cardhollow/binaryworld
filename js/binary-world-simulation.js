window.__BinaryWorldSourceParts=window.__BinaryWorldSourceParts||[];
window.__BinaryWorldSourceParts[2]=`
var simulation=(function(){
    var worker=null;
    var workerReady=false;
    var initSent=false;
    var started=false;
    var pending=[];
    var renderQueue=[];
    var renderSet=new Set();
    var renderFrame=0;
    var snapshotWaiters=[];
    var fallbackTimer=null;
    var fallbackQueue=[];
    var fallbackQueued={};
    var fallbackProcessing=false;
    var fallbackMaxSteps=900;
    var maxSteps=20000;

    function serialBlockForWorker(block){
        if(!block)return null;
        return {
            type:block.type,
            x:Number(block.x)||0,
            y:Number(block.y)||0,
            layer:Number(block.layer)||0,
            rotation:Number(block.rotation)||0,
            pressed:!!block.pressed,
            state:block.state?1:0,
            runtime:{
                inputs:block.runtime&&block.runtime.inputs?clone(block.runtime.inputs):{},
                connected:block.runtime&&block.runtime.connected?clone(block.runtime.connected):{},
                outputs:block.runtime&&block.runtime.outputs?clone(block.runtime.outputs):{},
                zOutputs:block.runtime&&block.runtime.zOutputs?clone(block.runtime.zOutputs):{},
                zBlock:block.runtime&&block.runtime.zBlock?block.runtime.zBlock:null
            }
        };
    }

    function workerURL(){
        try{
            return new URL('js/binary-world-worker.js',document.baseURI).href;
        }catch(e){
            return 'js/binary-world-worker.js';
        }
    }

    function makeBlockDefinitions(){
        var out=[];
        for(var type in blocks){
            if(!Object.prototype.hasOwnProperty.call(blocks,type))continue;
            var d=blocks[type]||{};
            out.push({
                type:type,
                id:String(d.id||type),
                name:String(d.name||type),
                ports:d.ports?clone(d.ports):{inputs:[],outputs:[]},
                zInput:!!d.zInput,
                zOutputs:d.zOutputs?clone(d.zOutputs):[],
                functionSource:d.function?String(d.function.toString()):'function(){return {state:0,outputs:{},zOutputs:{}};}'
            });
        }
        return out;
    }

    function ensureWorker(){
        if(worker||started)return !!worker;
        started=true;
        try{
            worker=new Worker(workerURL());
        }catch(err){
            worker=null;
            console.warn('Binary World Worker unavailable; using throttled fallback:',err);
            return false;
        }

        worker.onmessage=function(ev){
            var msg=ev.data||{};
            if(msg.cmd==='ready'){
                workerReady=true;
                flushPending();
                return;
            }
            if(msg.cmd==='changes'){
                applyWorkerChanges(msg.changes||[]);
                return;
            }
            if(msg.cmd==='snapshot'){
                var list=snapshotWaiters.splice(0);
                for(var i=0;i<list.length;i++)list[i](msg.world);
                return;
            }
            if(msg.cmd==='import-progress'){
                if(window.__BWBackground&&window.__BWBackground.onWorkerProgress){
                    window.__BWBackground.onWorkerProgress(msg);
                }
                return;
            }
            if(msg.cmd==='import-done'){
                if(window.__BWBackground&&window.__BWBackground.onWorkerImportDone){
                    window.__BWBackground.onWorkerImportDone(msg);
                }
                return;
            }
            if(msg.cmd==='save-done'){
                window.dispatchEvent(new CustomEvent('__bwSaveEvent_'+String(msg.token||''),{detail:msg}));
                return;
            }
            if(msg.cmd==='error'){
                console.error('Binary World Worker:',msg.error||msg);
                if(window.__BWBackground&&window.__BWBackground.onWorkerError){
                    window.__BWBackground.onWorkerError(msg);
                }
            }
        };

        worker.onerror=function(err){
            console.error('Binary World Worker crashed:',err);
            workerReady=false;
            if(window.__BWBackground&&window.__BWBackground.onWorkerError){
                window.__BWBackground.onWorkerError({error:'Worker crashed'});
            }
        };

        try{
            worker.postMessage({cmd:'init',blocks:makeBlockDefinitions()});
            initSent=true;
        }catch(err){
            console.error('Binary World Worker init failed:',err);
            worker=null;
        }
        return !!worker;
    }

    function flushPending(){
        if(!worker||!workerReady)return;
        var items=pending.splice(0);
        for(var i=0;i<items.length;i++){
            try{worker.postMessage(items[i].message,items[i].transfer||[]);}catch(err){
                console.error('Binary World Worker message failed:',err);
            }
        }
    }

    function post(message,transfer){
        if(!ensureWorker())return false;
        if(!workerReady){
            pending.push({message:message,transfer:transfer||[]});
            return true;
        }
        try{
            worker.postMessage(message,transfer||[]);
            return true;
        }catch(err){
            console.error('Binary World Worker post failed:',err);
            return false;
        }
    }

    function activeWorldSnapshot(){
        try{var s=serializableWorld();s.meta.delayer=Math.max(0,Math.min(500,Number(world.meta&&world.meta.delayer!==undefined?world.meta.delayer:500)||0));return s;}catch(e){return{meta:{grid:[20,20],name:'Project',delayer:500},layers:[]};}
    }

    function rebuild(){
        var snapshot=activeWorldSnapshot();
        if(post({cmd:'rebuild',world:snapshot}))return;
        fallbackRebuild(snapshot);
    }

    function schedule(k){
        var p=parseKey(k),block=getBlock(p.x,p.y,p.layer);
        var message={cmd:'schedule',key:k,block:serialBlockForWorker(block)};
        if(post(message))return;
        fallbackSchedule(k);
    }

    function requestSnapshot(){
        return new Promise(function(resolve){
            if(post({cmd:'snapshot'})){
                snapshotWaiters.push(resolve);
                return;
            }
            try{resolve(activeWorldSnapshot());}
            catch(e){resolve({meta:{grid:[20,20],name:'Project'},layers:[]});}
        });
    }

    function importBuffer(buffer,format){
        var bytes=buffer instanceof Uint8Array?buffer:new Uint8Array(buffer);
        var copy=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
        return post({cmd:'import',format:String(format||'auto'),buffer:copy},[copy]);
    }

    function applyWorkerChanges(changes){
        for(var i=0;i<changes.length;i++){
            var c=changes[i];
            if(!c||!c.key)continue;
            var p=parseKey(c.key),block=getBlock(p.x,p.y,p.layer);
            if(!block)continue;
            if(c.state!==undefined)block.state=c.state?1:0;
            if(c.runtime){
                if(!block.runtime)block.runtime=createRuntime();
                block.runtime.inputs=c.runtime.inputs||{};
                block.runtime.connected=c.runtime.connected||{};
                block.runtime.outputs=c.runtime.outputs||{};
                block.runtime.zOutputs=c.runtime.zOutputs||{};
                block.runtime.zBlock=c.runtime.zBlock||null;
            }
            renderQueuePush(c.key);
        }
    }

    function renderQueuePush(k){
        if(renderSet.has(k))return;
        renderSet.add(k);
        renderQueue.push(k);
        if(!renderFrame)renderFrame=requestAnimationFrame(flushRenderQueue);
    }

    function flushRenderQueue(){
        renderFrame=0;
        var startedAt=(window.performance&&performance.now)?performance.now():Date.now();
        var count=0;
        while(renderQueue.length&&count<220){
            var now=(window.performance&&performance.now)?performance.now():Date.now();
            if(now-startedAt>=7)break;
            var k=renderQueue.shift();
            renderSet.delete(k);
            var p=parseKey(k);
            if(p.layer===activeLayer)renderCell(p.x,p.y,p.layer);
            count++;
        }
        if(renderQueue.length)renderFrame=requestAnimationFrame(flushRenderQueue);
    }

    /* Fallback: still cooperative, but only used when Web Workers are unavailable. */
    function fallbackGet(k){var p=parseKey(k);return getBlock(p.x,p.y,p.layer)}
    function fallbackSchedule(k){
        if(fallbackQueued[k])return;
        fallbackQueued[k]=true;
        fallbackQueue.push(k);
        fallbackRun();
    }
    function fallbackRun(){
        if(fallbackProcessing||fallbackTimer)return;
        fallbackProcessing=true;
        fallbackTimer=setTimeout(function(){
            fallbackTimer=null;
            var steps=0;
            while(fallbackQueue.length&&steps<fallbackMaxSteps){
                var k=fallbackQueue.shift();
                delete fallbackQueued[k];
                fallbackEvaluate(k);
                steps++;
            }
            fallbackProcessing=false;
            if(fallbackQueue.length)fallbackRun();
        },0);
    }
    function fallbackRebuild(snapshot){
        fallbackQueue=[];fallbackQueued={};
        for(var layer=0;layer<world.layers.length;layer++){
            for(var y=0;y<world.meta.grid[1];y++)for(var x=0;x<world.meta.grid[0];x++){
                var block=getBlock(x,y,layer);if(!block)continue;
                block.runtime=createRuntime();
                fallbackSchedule(key(layer,x,y));
            }
        }
    }
    function fallbackEvaluate(k){
        var p=parseKey(k),block=fallbackGet(k),definition=block&&blocks[block.type];
        if(!block||!definition)return;
        if(!block.runtime)block.runtime=createRuntime();
        var read=readInputs(block);
        block.runtime.inputs=clone(read.inputs);block.runtime.connected=clone(read.connected);
        var result=definition.function({state:block.state?1:0,pressed:!!block.pressed,inputs:clone(read.inputs),connected:clone(read.connected),runtime:block.runtime,time:(window.performance&&performance.now)?performance.now():Date.now()})||{};
        var oldState=block.state?1:0;
        var nextOutputs={};var ports=worldPorts(block);
        for(var i=0;i<ports.outputs.length;i++)nextOutputs[ports.outputs[i].id]=result.outputs&&result.outputs[ports.outputs[i].id]?1:0;
        var nextZ={};for(var j=0;j<ports.zOutputs.length;j++)nextZ[ports.zOutputs[j].id]=result.zOutputs&&result.zOutputs[ports.zOutputs[j].id]?1:0;
        block.state=result.state?1:0;
        var oldOutputs=clone(block.runtime.outputs||{}),oldZ=clone(block.runtime.zOutputs||{});
        block.runtime.outputs=nextOutputs;block.runtime.zOutputs=nextZ;
        if(oldState!==block.state)renderCell(p.x,p.y,p.layer);
        for(var q=0;q<ports.outputs.length;q++)if((oldOutputs[ports.outputs[q].id]?1:0)!==(nextOutputs[ports.outputs[q].id]?1:0))fallbackNotifyLocal(block,p.layer,ports.outputs[q]);
        for(var z=0;z<ports.zOutputs.length;z++)if((oldZ[ports.zOutputs[z].id]?1:0)!==(nextZ[ports.zOutputs[z].id]?1:0))fallbackNotifyVertical(block,p.layer);
        if(typeof result.delay==='number'&&result.delay>0){
            setTimeout(function(){fallbackCommitDelay(block,p,nextOutputs,nextZ)},Math.max(0,Number(result.delay)||0));
        }
    }
    function fallbackCommitDelay(block,p,nextOutputs,nextZ){
        if(!block||!block.runtime)return;
        block.runtime.outputs=clone(nextOutputs);block.runtime.zOutputs=clone(nextZ);
        renderCell(p.x,p.y,p.layer);
        var ports=worldPorts(block);for(var i=0;i<ports.outputs.length;i++)fallbackNotifyLocal(block,p.layer,ports.outputs[i]);
        for(var j=0;j<ports.zOutputs.length;j++)fallbackNotifyVertical(block,p.layer);
    }
    function fallbackNotifyLocal(source,layer,port){
        var d=delta[port.side];if(!d)return;var x=source.x+d[0],y=source.y+d[1];
        if(x<0||y<0||x>=world.meta.grid[0]||y>=world.meta.grid[1])return;
        var target=getBlock(x,y,layer);if(!target)return;
        if(portBySide(worldPorts(target).inputs,opposite[port.side]))fallbackSchedule(key(layer,x,y));
    }
    function fallbackNotifyVertical(source,layer){
        for(var i=0;i<2;i++){var tl=i===0?layer-1:layer+1;if(tl<0||tl>=world.layers.length)continue;var t=getBlock(source.x,source.y,tl);if(t&&blocks[t.type]&&blocks[t.type].zInput)fallbackSchedule(key(tl,t.x,t.y));}
    }

    return {
        queue:[],
        queued:{},
        processing:false,
        maxSteps:maxSteps,
        rebuild:rebuild,
        schedule:schedule,
        snapshot:requestSnapshot,
        importBuffer:importBuffer,
        saveLocalRecord:function(keyName,createdAt,activeLayerValue){
            return new Promise(function(resolve,reject){
                var token=String(Date.now())+'_'+Math.random();
                function onSave(ev){var msg=ev.data||{};if(msg.cmd==='save-done'&&msg.token===token){worker&&worker.removeEventListener;cleanup();resolve(msg.json);}}
                function cleanup(){window.removeEventListener('__bwSaveEvent_'+token,onSave);clearTimeout(timer);}
                function forwarded(ev){onSave(ev);}
                var timer=setTimeout(function(){cleanup();reject(new Error('Background save timed out'));},30000);
                window.addEventListener('__bwSaveEvent_'+token,forwarded);
                if(!post({cmd:'save',key:String(keyName||''),createdAt:Number(createdAt)||Date.now(),activeLayer:Number(activeLayerValue)||0,token:token})){cleanup();reject(new Error('Background Worker unavailable'));}
            });
        },
        setDelayer:function(ms){ms=Math.max(0,Math.min(500,Number(ms)||0));if(worker)post({cmd:'settings',delayerMs:ms});return ms;},
        isWorker:function(){return !!worker},
        terminate:function(){if(worker){worker.terminate();worker=null;}workerReady=false;started=false;initSent=false;}
    };
})();
`;
