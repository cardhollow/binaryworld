(function(){
'use strict';

function getLoadURL(){
    try{
        var params=new URLSearchParams(window.location.search);
        return params.get('load');
    }catch(e){
        return null;
    }
}

function getLocalURL(){
    try{
        var params=new URLSearchParams(window.location.search);
        return params.get('local');
    }catch(e){
        return null;
    }
}

function projectKey(timestamp){
    var d=new Date(timestamp||Date.now());
    function pad(n){return String(n).padStart(2,'0')}
    return 'project_'+d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())+'_'+pad(d.getHours())+'-'+pad(d.getMinutes())+'-'+pad(d.getSeconds())+'-'+String(d.getMilliseconds()).padStart(3,'0')+'_remote';
}

function uniqueProjectKey(){
    var key=projectKey(),n=0;
    try{
        while(localStorage.getItem(key)!==null){
            n++;
            key=projectKey(Date.now()+n);
        }
    }catch(e){}
    return key;
}

function cleanWorld(world){
    if(!world||!world.meta||!Array.isArray(world.layers))throw new Error('Invalid Binary World data');

    return {
        meta:{
            grid:[
                Number(world.meta.grid&&world.meta.grid[0])||20,
                Number(world.meta.grid&&world.meta.grid[1])||20
            ],
            name:String(world.meta.name||'Remote Project')
        },
        layers:world.layers.map(function(layer,index){
            return {
                name:String(layer&&layer.name||'Layer '+index),
                schematic:(Array.isArray(layer&&layer.schematic)?layer.schematic:[]).map(function(row){
                    var out={};
                    if(!row||typeof row!=='object')return out;
                    for(var k in row){
                        if(!Object.prototype.hasOwnProperty.call(row,k))continue;
                        var b=row[k];
                        if(!b||typeof b!=='object')continue;
                        out[k]={
                            type:b.type,
                            x:Number(b.x!==undefined?b.x:k),
                            y:Number(b.y)||0,
                            layer:Number(b.layer)||index,
                            rotation:Number(b.rotation)||0,
                            pressed:false,
                            state:b.state?1:0
                        };
                    }
                    return out;
                })
            };
        })
    };
}

function detectAndDecode(buffer,text,url){
    var bytes=new Uint8Array(buffer);
    if(bytes.length>=2&&bytes[0]===0x42&&bytes[1]===0x57){
        if(!window.BinaryWorld||!window.BinaryWorld.BW)throw new Error('Binary World BW module is not ready');
        return {
            format:'BW',
            world:window.BinaryWorld.BW.createWorld(window.BinaryWorld.BW.readFile(bytes))
        };
    }

    var looksJSON=false;
    try{
        var trimmed=(text||'').trim();
        looksJSON=trimmed.charAt(0)==='{'||trimmed.charAt(0)==='[';
    }catch(e){}

    if(looksJSON||/\.json(?:[?#].*)?$/i.test(url||'')){
        var data=JSON.parse(text);
        if(window.BinaryWorld&&typeof window.BinaryWorld.normalizeJSONWorld==='function'){
            return {format:'JSON',world:window.BinaryWorld.normalizeJSONWorld(data)};
        }
        return {format:'JSON',world:data};
    }

    throw new Error('Unsupported remote world format. Expected .bw or JSON.');
}

function waitForBinaryWorld(){
    return new Promise(function(resolve,reject){
        var started=Date.now();
        (function check(){
            if(window.BinaryWorld&&window.BinaryWorld.BW){
                resolve();
                return;
            }
            if(Date.now()-started>15000){
                reject(new Error('Binary World did not finish loading.'));
                return;
            }
            setTimeout(check,50);
        })();
    });
}

function saveTemporaryProject(world){
    var cleaned=cleanWorld(world);
    var key=uniqueProjectKey();
    var now=Date.now();
    var record={
        format:'BinaryWorldProject',
        version:2,
        key:key,
        createdAt:now,
        updatedAt:now,
        activeLayer:0,
        world:cleaned
    };
    localStorage.setItem(key,JSON.stringify(record));
    sessionStorage.setItem('__BinaryWorldRemoteLoadKey',key);
    return {key:key,world:cleaned};
}

function findButton(id){
    return document.getElementById(id);
}

function autoOpenLocalProject(key){
    var started=Date.now();

    function step(){
        var loadButton=findButton('loadButton');
        if(!loadButton){
            if(Date.now()-started>15000)throw new Error('LOAD button was not found');
            setTimeout(step,50);
            return;
        }

        loadButton.click();

        setTimeout(function(){
            var localButton=findButton('loadLocalButton');
            if(!localButton){
                if(Date.now()-started>15000)throw new Error('Load from local button was not found');
                setTimeout(step,50);
                return;
            }

            localButton.click();

            setTimeout(function(){
                var rows=document.querySelectorAll('.localProject');
                for(var i=0;i<rows.length;i++){
                    var row=rows[i];
                    var buttons=row.querySelectorAll('.localProjectLoad');
                    if(buttons.length<1)continue;

                    var currentKey=sessionStorage.getItem('__BinaryWorldRemoteLoadKey');
                    var name=row.querySelector('.localProjectName');
                    if(currentKey&&name){
                        var raw=localStorage.getItem(currentKey);
                        if(raw){
                            var record;
                            try{record=JSON.parse(raw)}catch(e){record=null}
                            if(record&&record.world&&String(record.world.meta&&record.world.meta.name||'')===String(name.textContent||'')){
                                buttons[0].click();
                                setTimeout(function(){
                                    var accept=findButton('confirmAccept');
                                    if(accept)accept.click();
                                },50);
                                return;
                            }
                        }
                    }
                }

                if(Date.now()-started>15000)throw new Error('Remote project was not found in local projects');
                setTimeout(step,100);
            },50);
        },50);
    }

    step();
}

async function loadRemoteWorld(url){
    if(!url) return;

    await waitForBinaryWorld();

    var response=await fetch(url,{method:'GET',credentials:'omit',cache:'no-store'});
    if(!response.ok)throw new Error('Remote world request failed: '+response.status+' '+response.statusText);

    var buffer=await response.arrayBuffer();
    var text='';
    try{
        text=new TextDecoder().decode(new Uint8Array(buffer));
    }catch(e){}

    var decoded=detectAndDecode(buffer,text,url);
    var saved=saveTemporaryProject(decoded.world);

    document.documentElement.dataset.binaryWorldRemoteFormat=decoded.format;
    document.documentElement.dataset.binaryWorldRemoteKey=saved.key;

    autoOpenLocalProject(saved.key);
}

function cleanupQuery(){
    try{
        var url=new URL(window.location.href);
        url.searchParams.delete('load');
        window.history.replaceState({},document.title,url.pathname+url.search+url.hash);
    }catch(e){}
}

async function start(){
    try{
        var localName=getLocalURL();
        if(localName){
            await waitForBinaryWorld();
            if(window.BinaryWorldLocalLoader&&window.BinaryWorldLocalLoader.loadByName){
                if(window.BinaryWorldLocalLoader.loadByName(localName))return;
            }
            console.warn('Binary World local project not found:',localName);
        }

        var url=getLoadURL();
        if(!url)return;

        await loadRemoteWorld(url);
        cleanupQuery();
    }catch(error){
        console.error('Binary World load failed:',error);
        alert('Binary World load failed:\n'+error.message);
    }
}

if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',start,{once:true});
}else{
    start();
}

window.BinaryWorldRemoteLoader={
    load:loadRemoteWorld
};

})();
