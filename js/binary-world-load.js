(function(){
'use strict';

function getLoadURL(){
    try{return new URLSearchParams(window.location.search).get('load')}catch(e){return null}
}

function getLocalURL(){
    try{return new URLSearchParams(window.location.search).get('local')}catch(e){return null}
}

function cleanWorld(world){
    if(!world||!world.meta||!Array.isArray(world.layers))throw new Error('Invalid Binary World data');
    return{
        meta:{grid:[Number(world.meta.grid&&world.meta.grid[0])||20,Number(world.meta.grid&&world.meta.grid[1])||20],name:String(world.meta.name||'Remote Project')},
        layers:world.layers.map(function(layer,index){
            return{
                name:String(layer&&layer.name||'Layer '+index),
                schematic:(Array.isArray(layer&&layer.schematic)?layer.schematic:[]).map(function(row){
                    var out={};
                    if(!row||typeof row!=='object')return out;
                    for(var k in row){
                        if(!Object.prototype.hasOwnProperty.call(row,k))continue;
                        var b=row[k];
                        if(!b||typeof b!=='object')continue;
                        out[k]={type:b.type,x:Number(b.x!==undefined?b.x:k),y:Number(b.y)||0,layer:Number(b.layer)||index,rotation:Number(b.rotation)||0,pressed:false,state:b.state?1:0};
                    }
                    return out;
                })
            };
        })
    };
}

async function detectAndDecode(buffer,text,url,progress){var bytes=new Uint8Array(buffer);if(bytes.length>=2&&bytes[0]===0x42&&bytes[1]===0x57){var restored=window.BinaryWorldPerformance&&BinaryWorldPerformance.decodeBW?await BinaryWorldPerformance.decodeBW(bytes,progress):window.BinaryWorld.BW.createWorld(window.BinaryWorld.BW.readFile(bytes));return{format:'BW',world:restored}}var looksJSON=false;try{var trimmed=(text||'').trim();looksJSON=trimmed.charAt(0)==='{'||trimmed.charAt(0)==='['}catch(e){}if(looksJSON||/\.json(?:[?#].*)?$/i.test(url||'')){var data=window.BinaryWorldPerformance&&BinaryWorldPerformance.parseJSON?await BinaryWorldPerformance.parseJSON(text,progress):JSON.parse(text);return{format:'JSON',world:window.BinaryWorld&&typeof window.BinaryWorld.normalizeJSONWorld==='function'?window.BinaryWorld.normalizeJSONWorld(data):data}}throw new Error('Unsupported remote world format. Expected .bw or JSON.')}

function waitForBinaryWorld(){
    return new Promise(function(resolve,reject){
        var started=Date.now();
        (function check(){
            if(window.BinaryWorld&&window.BinaryWorld.BW){resolve();return}
            if(Date.now()-started>15000){reject(new Error('Binary World did not finish loading.'));return}
            setTimeout(check,50);
        })();
    });
}

async function saveTemporaryProject(world){
    var cleaned=cleanWorld(world);
    if(!window.BinaryWorldStorage||typeof window.BinaryWorldStorage.saveWorld!=='function')throw new Error('Binary World storage is not ready.');
    await window.BinaryWorldStorageReady;
    return window.BinaryWorldStorage.saveWorld(cleaned,{activeLayer:0});
}

async function loadRemoteWorld(url){if(!url)return;await waitForBinaryWorld();if(window.BinaryWorldStorageReady)await window.BinaryWorldStorageReady;if(window.BinaryWorldProgress)BinaryWorldProgress.start('LOADING WORLD','Downloading '+url,0);var response=await fetch(url,{method:'GET',credentials:'omit',cache:'no-store'});if(!response.ok)throw new Error('Remote world request failed: '+response.status+' '+response.statusText);var chunks=[],received=0,total=Number(response.headers.get('Content-Length')||0),buffer;if(response.body&&response.body.getReader){var reader=response.body.getReader();for(;;){var part=await reader.read();if(part.done)break;chunks.push(part.value);received+=part.value.byteLength;BinaryWorldProgress.update(total?Math.min(35,Math.round(received/total*35)):Math.min(35,10+Math.round(received/1048576)),'Downloading world')}}else{buffer=await response.arrayBuffer();BinaryWorldProgress.update(35,'Download complete')}if(!buffer){var length=chunks.reduce(function(n,c){return n+c.byteLength},0);var joined=new Uint8Array(length),offset=0;chunks.forEach(function(c){joined.set(c,offset);offset+=c.byteLength});buffer=joined.buffer}var text='';try{text=new TextDecoder().decode(new Uint8Array(buffer))}catch(e){}BinaryWorldProgress.update(40,'Decoding world');var decoded=await detectAndDecode(buffer,text,url,function(p){BinaryWorldProgress.update(40+p*.45,'Processing '+decodedFormat(url,buffer))});BinaryWorldProgress.update(88,'Saving project to IndexedDB');var saved=await saveTemporaryProject(decoded.world);document.documentElement.dataset.binaryWorldRemoteFormat=decoded.format;document.documentElement.dataset.binaryWorldRemoteKey=saved.key;BinaryWorldProgress.update(94,'Opening project');await window.BinaryWorldStorage.loadByKey(saved.key);if(window.BinaryWorldProgress)await BinaryWorldProgress.finish('WORLD LOADED','The imported world is ready.')}

function decodedFormat(url,buffer){var b=new Uint8Array(buffer);return b[0]===0x42&&b[1]===0x57?'.bw':/\.json(?:[?#].*)?$/i.test(url||'')?'.json':'world'}

function cleanupQuery(){
    try{
        var url=new URL(window.location.href);
        url.searchParams.delete('load');
        window.history.replaceState({},document.title,url.pathname+url.search+url.hash);
    }catch(e){}
}

async function start(){
    try{
        if(window.BinaryWorldStorageReady)await window.BinaryWorldStorageReady;
        await waitForBinaryWorld();
        var localName=getLocalURL();
        if(localName){
            if(window.BinaryWorldLocalLoader&&window.BinaryWorldLocalLoader.loadByName){
                var loaded=await window.BinaryWorldLocalLoader.loadByName(localName);
                if(loaded)return;
            }
            console.warn('Binary World local project not found:',localName);
        }
        var url=getLoadURL();
        if(!url)return;
        await loadRemoteWorld(url);
        cleanupQuery();
    }catch(error){
        if(window.BinaryWorldProgress)BinaryWorldProgress.fail('LOAD FAILED',error.message);console.error('Binary World load failed:',error);alert('Binary World load failed:\n'+error.message);
    }
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
else start();

window.BinaryWorldRemoteLoader={load:loadRemoteWorld};

})();
