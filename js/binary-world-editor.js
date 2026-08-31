(function(){
"use strict";

var BW_EDITOR={
    mime:"application/x-binary-world",
    textPrefix:"BINARYWORLD_CLIP_1:",
    selection:new Set(),
    anchor:null,
    primary:null,
    busy:false
};

function isEditingTarget(target){
    if(!target)return false;
    if(target.matches&&target.matches("input,textarea,select,[contenteditable='true'],[contenteditable=''],[role='textbox'],[role='combobox']"))return true;
    if(target.isContentEditable)return true;
    var tag=String(target.tagName||"").toLowerCase();
    return tag==="input"||tag==="textarea"||tag==="select";
}

function isModalVisible(){
    var modals=document.querySelectorAll(".modal.visible");
    return !!modals.length;
}

function selKey(layer,x,y){
    return String(layer)+":"+String(x)+":"+String(y);
}

function parseSelKey(k){
    var p=String(k).split(":");
    return {layer:Number(p[0]),x:Number(p[1]),y:Number(p[2])};
}

function validCell(x,y,layer){
    return Number.isInteger(x)&&Number.isInteger(y)&&Number.isInteger(layer)&&
        layer>=0&&layer<world.layers.length&&
        x>=0&&y>=0&&x<Number(world.meta.grid[0])&&y<Number(world.meta.grid[1]);
}

function getCellElement(x,y){
    return gridElement.querySelector(".cell[data-x='"+x+"'][data-y='"+y+"']");
}

function paintSelection(){
    var cells=gridElement.querySelectorAll(".cell");
    for(var i=0;i<cells.length;i++){
        var cell=cells[i];
        var x=Number(cell.dataset.x),y=Number(cell.dataset.y);
        cell.classList.toggle("bw-multi-selected",BW_EDITOR.selection.has(selKey(activeLayer,x,y)));
        cell.classList.toggle("bw-multi-primary",!!BW_EDITOR.primary&&BW_EDITOR.primary.layer===activeLayer&&BW_EDITOR.primary.x===x&&BW_EDITOR.primary.y===y);
    }
    document.documentElement.style.setProperty("--bw-editor-selection-count",String(BW_EDITOR.selection.size));
}

function syncPrimary(){
    if(BW_EDITOR.primary&&BW_EDITOR.selection.has(selKey(BW_EDITOR.primary.layer,BW_EDITOR.primary.x,BW_EDITOR.primary.y)))return;
    var first=BW_EDITOR.selection.values().next();
    BW_EDITOR.primary=first.done?null:parseSelKey(first.value);
    if(BW_EDITOR.primary&&typeof selected!=="undefined"){
        selected.x=BW_EDITOR.primary.x;
        selected.y=BW_EDITOR.primary.y;
    }
}

function clearSelection(){
    BW_EDITOR.selection.clear();
    BW_EDITOR.primary=null;
    BW_EDITOR.anchor=null;
    if(typeof selected!=="undefined"){
        selected.x=null;
        selected.y=null;
    }
    if(typeof renderAll==="function")renderAll();
    paintSelection();
}

function addCell(x,y,layer){
    if(!validCell(x,y,layer))return;
    var k=selKey(layer,x,y);
    BW_EDITOR.selection.add(k);
    BW_EDITOR.primary={layer:layer,x:x,y:y};
    if(typeof selected!=="undefined"){
        selected.x=x;
        selected.y=y;
    }
}

function toggleCell(x,y,layer){
    if(!validCell(x,y,layer))return;
    var k=selKey(layer,x,y);
    if(BW_EDITOR.selection.has(k)){
        BW_EDITOR.selection.delete(k);
        if(BW_EDITOR.primary&&BW_EDITOR.primary.layer===layer&&BW_EDITOR.primary.x===x&&BW_EDITOR.primary.y===y)BW_EDITOR.primary=null;
    }else{
        BW_EDITOR.selection.add(k);
        BW_EDITOR.primary={layer:layer,x:x,y:y};
    }
    syncPrimary();
}

function addRange(a,b,layer){
    if(!a||!validCell(b.x,b.y,layer))return;
    var x0=Math.min(a.x,b.x),x1=Math.max(a.x,b.x);
    var y0=Math.min(a.y,b.y),y1=Math.max(a.y,b.y);
    for(var y=y0;y<=y1;y++)for(var x=x0;x<=x1;x++)addCell(x,y,layer);
}

function setStatus(){
    if(typeof statusElement==="undefined")return;
    if(!BW_EDITOR.selection.size)return;
    var primary=BW_EDITOR.primary;
    var block=primary&&primary.layer===activeLayer?getBlock(primary.x,primary.y):null;
    var label=BW_EDITOR.selection.size===1&&block?block.type.toUpperCase()+" ["+primary.x+","+primary.y+"]":"MULTI-SELECTION: "+BW_EDITOR.selection.size+" CELLS";
    statusElement.textContent="SELECTED: "+label+" | SIMULATION: ACTIVE";
}

function handleSelectionClick(e){
    if(editingMode!=="selector")return;
    var cell=e.target.closest&&e.target.closest(".cell");
    if(!cell||!gridElement.contains(cell))return;
    if(e.button!==0)return;
    var x=Number(cell.dataset.x),y=Number(cell.dataset.y),layer=activeLayer;
    if(!validCell(x,y,layer))return;

    var multi=e.shiftKey||e.ctrlKey||e.metaKey;
    if(!multi){
        BW_EDITOR.selection.clear();
        addCell(x,y,layer);
        BW_EDITOR.anchor={layer:layer,x:x,y:y};
        if(typeof renderAll==="function")renderAll();
        paintSelection();
        setStatus();
        return;
    }

    e.preventDefault();
    e.stopPropagation();
    if(e.shiftKey){
        var anchor=BW_EDITOR.anchor||BW_EDITOR.primary;
        if(e.ctrlKey||e.metaKey){
            addRange(anchor,{x:x,y:y},layer);
        }else{
            BW_EDITOR.selection.clear();
            addRange(anchor,{x:x,y:y},layer);
        }
        BW_EDITOR.primary={layer:layer,x:x,y:y};
    }else{
        toggleCell(x,y,layer);
        BW_EDITOR.anchor={layer:layer,x:x,y:y};
    }
    if(typeof renderAll==="function")renderAll();
    paintSelection();
    setStatus();
}

function recordsFromSelection(){
    var keys=Array.from(BW_EDITOR.selection);
    if(!keys.length)return [];
    var points=keys.map(parseSelKey);
    var minX=Infinity,minY=Infinity,minL=Infinity,maxX=-Infinity,maxY=-Infinity,maxL=-Infinity;
    var records=[];
    for(var i=0;i<points.length;i++){
        var p=points[i],b=getBlock(p.x,p.y,p.layer);
        if(!b)continue;
        minX=Math.min(minX,p.x);minY=Math.min(minY,p.y);minL=Math.min(minL,p.layer);
        maxX=Math.max(maxX,p.x);maxY=Math.max(maxY,p.y);maxL=Math.max(maxL,p.layer);
    }
    if(!records.length&&minX===Infinity)return [];
    for(var j=0;j<points.length;j++){
        var q=points[j],block=getBlock(q.x,q.y,q.layer);
        if(!block)continue;
        var type=String(block.type);
        records.push({
            type:type,
            x:q.x-minX,
            y:q.layer-minL,
            z:q.y-minY,
            rotation:((((Number(block.rotation)||0)%360)+360)%360)/90|0,
            state:block.state?1:0
        });
    }
    return {
        records:records,
        width:(maxX-minX)+1,
        depth:(maxY-minY)+1,
        layers:(maxL-minL)+1
    };
}

function buildClipBytes(){
    if(typeof BW==="undefined")throw new Error("BW binary engine is not loaded.");
    var part=recordsFromSelection();
    if(!part||!part.records.length)throw new Error("Select at least one block before copying.");
    var dictionary=[],ids=new Map(),all=BW.getBlockTypes();
    for(var i=0;i<part.records.length;i++){
        var type=part.records[i].type.toLowerCase(),entry=null;
        for(var j=0;j<all.length;j++)if(String(all[j].type).toLowerCase()===type){entry=all[j];break}
        if(!entry)throw new Error("Unknown block type: "+part.records[i].type);
        if(!ids.has(type)){ids.set(type,entry.id);dictionary.push(entry)}
    }
    var records=part.records.map(function(r){
        return {id:ids.get(r.type.toLowerCase()),type:r.type,x:r.x,y:r.y,z:r.z,rotation:r.rotation,state:r.state};
    });
    var program=BW.optimizePlacements(records);
    var states=records.filter(function(r){return r.state===1}).map(function(r){return{position:[r.x,r.y,r.z],state:1}});
    var data={
        format:"BW",
        version:BW.VERSION,
        meta:{name:"Clipboard",grid:[part.width,part.depth],layers:part.layers},
        layerNames:Array.from({length:part.layers},function(_,i){return"Layer "+i}),
        dictionary:dictionary,
        program:program,
        states:states
    };
    return BW.writeFile(data);
}

function bytesToBase64(bytes){
    var chunk=0x8000,out="";
    for(var i=0;i<bytes.length;i+=chunk){
        var end=Math.min(bytes.length,i+chunk),s="";
        for(var j=i;j<end;j++)s+=String.fromCharCode(bytes[j]);
        out+=btoa(s);
    }
    return out;
}

function base64ToBytes(text){
    var raw=atob(text),bytes=new Uint8Array(raw.length);
    for(var i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
    return bytes;
}

async function writeClipboard(bytes){
    var base64=bytesToBase64(bytes);
    var fallback=BW_EDITOR.textPrefix+base64;
    if(navigator.clipboard&&window.ClipboardItem&&window.isSecureContext){
        try{
            var item=new ClipboardItem({
                [BW_EDITOR.mime]:new Blob([bytes],{type:BW_EDITOR.mime}),
                "application/octet-stream":new Blob([bytes],{type:"application/octet-stream"}),
                "text/plain":new Blob([fallback],{type:"text/plain"})
            });
            await navigator.clipboard.write([item]);
            return;
        }catch(err){}
    }
    if(navigator.clipboard&&navigator.clipboard.writeText){
        await navigator.clipboard.writeText(fallback);
        return;
    }
    throw new Error("Clipboard access is unavailable. Use HTTPS or localhost.");
}

async function readClipboardBytes(){
    if(navigator.clipboard&&navigator.clipboard.read&&window.ClipboardItem&&window.isSecureContext){
        try{
            var items=await navigator.clipboard.read();
            for(var i=0;i<items.length;i++){
                if(items[i].types.indexOf(BW_EDITOR.mime)>=0){
                    var blob=await items[i].getType(BW_EDITOR.mime);
                    return new Uint8Array(await blob.arrayBuffer());
                }
                if(items[i].types.indexOf("application/octet-stream")>=0){
                    var raw=await items[i].getType("application/octet-stream");
                    return new Uint8Array(await raw.arrayBuffer());
                }
                if(items[i].types.indexOf("text/plain")>=0){
                    var text=await (await items[i].getType("text/plain")).text();
                    if(text.indexOf(BW_EDITOR.textPrefix)===0)return base64ToBytes(text.slice(BW_EDITOR.textPrefix.length));
                }
            }
        }catch(err){}
    }
    if(navigator.clipboard&&navigator.clipboard.readText){
        var text=await navigator.clipboard.readText();
        if(text.indexOf(BW_EDITOR.textPrefix)===0)return base64ToBytes(text.slice(BW_EDITOR.textPrefix.length));
    }
    throw new Error("No Binary World clipboard data was found.");
}

function targetForPaste(data){
    var p=BW_EDITOR.primary;
    var x=p&&p.layer===activeLayer?p.x:0;
    var y=p&&p.layer===activeLayer?p.y:0;
    return {x:x,y:y,layer:activeLayer};
}

function pasteBytes(bytes){
    if(typeof BW==="undefined")throw new Error("BW binary engine is not loaded.");
    var data=BW.readFile(bytes),blocksToPaste=BW.expandProgram(data),target=targetForPaste(data);
    if(!blocksToPaste.length)return 0;
    var before=deepSnapshot();
    var pasted=[];
    var offsetLayers=0;
    if(BW_EDITOR.primary)offsetLayers=target.layer;
    for(var i=0;i<blocksToPaste.length;i++){
        var r=blocksToPaste[i],x=target.x+r.x,y=target.y+r.z,layer=offsetLayers+r.y;
        if(!validCell(x,y,layer))continue;
        var current=getBlock(x,y,layer);
        if(current)continue;
        var def=blocks[r.type];
        if(!def)continue;
        var block={
            type:r.type,x:x,y:y,layer:layer,rotation:r.rotation||0,
            pressed:false,state:0,runtime:createRuntime()
        };
        setBlock(x,y,block,layer);
        pasted.push({x:x,y:y,layer:layer});
        if(data.states){
            for(var s=0;s<data.states.length;s++){
                var st=data.states[s];
                if(st.position[0]===r.x&&st.position[1]===r.y&&st.position[2]===r.z)block.state=st.state?1:0;
            }
        }
    }
    if(!pasted.length)return 0;
    finishWorldChange(before);
    BW_EDITOR.selection.clear();
    for(var j=0;j<pasted.length;j++)BW_EDITOR.selection.add(selKey(pasted[j].layer,pasted[j].x,pasted[j].y));
    var last=pasted[pasted.length-1];
    BW_EDITOR.primary={layer:last.layer,x:last.x,y:last.y};
    BW_EDITOR.anchor=BW_EDITOR.primary;
    selected.x=last.x;selected.y=last.y;
    paintSelection();
    setStatus();
    return pasted.length;
}

function deleteSelection(){
    var keys=Array.from(BW_EDITOR.selection);
    if(!keys.length)return;
    var before=deepSnapshot(),changed=false;
    for(var i=0;i<keys.length;i++){
        var p=parseSelKey(keys[i]),b=getBlock(p.x,p.y,p.layer);
        if(!b)continue;
        setBlock(p.x,p.y,null,p.layer);
        changed=true;
    }
    if(!changed)return;
    finishWorldChange(before);
    clearSelection();
}

function rotateSelection(){
    var keys=Array.from(BW_EDITOR.selection);
    if(!keys.length)return;
    var before=deepSnapshot(),changed=false;
    for(var i=0;i<keys.length;i++){
        var p=parseSelKey(keys[i]),b=getBlock(p.x,p.y,p.layer);
        if(!b)continue;
        b.rotation=((Number(b.rotation)||0)+90)%360;
        changed=true;
    }
    if(changed)finishWorldChange(before);
    paintSelection();
    setStatus();
}

async function copySelection(cut){
    if(!BW_EDITOR.selection.size)return;
    var bytes=buildClipBytes();
    await writeClipboard(bytes);
    if(cut)deleteSelection();
    else setStatus();
}

async function pasteSelection(){
    var bytes=await readClipboardBytes();
    pasteBytes(bytes);
}

function keyHandler(e){
    if(BW_EDITOR.busy)return;
    if(isEditingTarget(document.activeElement))return;
    if(isModalVisible())return;
    var mod=e.ctrlKey||e.metaKey;
    if(mod&&e.key.toLowerCase()==="c"&&BW_EDITOR.selection.size){
        e.preventDefault();e.stopImmediatePropagation();
        BW_EDITOR.busy=true;
        copySelection(false).catch(function(err){console.error(err);}).finally(function(){BW_EDITOR.busy=false;});
        return;
    }
    if(mod&&e.key.toLowerCase()==="x"&&BW_EDITOR.selection.size){
        e.preventDefault();e.stopImmediatePropagation();
        BW_EDITOR.busy=true;
        copySelection(true).catch(function(err){console.error(err);}).finally(function(){BW_EDITOR.busy=false;});
        return;
    }
    if(mod&&e.key.toLowerCase()==="v"){
        e.preventDefault();e.stopImmediatePropagation();
        BW_EDITOR.busy=true;
        pasteSelection().catch(function(err){console.error(err);}).finally(function(){BW_EDITOR.busy=false;});
        return;
    }
    if((e.key==="Delete"||e.key==="Backspace")&&BW_EDITOR.selection.size){
        e.preventDefault();e.stopImmediatePropagation();
        deleteSelection();
        return;
    }
    if(String(e.key).toLowerCase()==="r"&&BW_EDITOR.selection.size){
        e.preventDefault();e.stopImmediatePropagation();
        rotateSelection();
    }
}

function install(){
    document.documentElement.insertAdjacentHTML("beforeend","<style id=\"binary-world-editor-style\">.cell.bw-multi-selected{outline:2px solid currentColor;outline-offset:-2px;filter:brightness(1.08)}.cell.bw-multi-primary{box-shadow:inset 0 0 0 2px currentColor}.bw-selection-badge{position:fixed;right:12px;bottom:12px;z-index:9999;font:600 12px/1.2 sans-serif;padding:7px 9px;border-radius:8px;background:rgba(0,0,0,.78);color:#fff;pointer-events:none;display:none}.bw-selection-badge.visible{display:block}</style>");
    document.body.insertAdjacentHTML("beforeend","<div id=\"bwSelectionBadge\" class=\"bw-selection-badge\"></div>");
    var grid=document.getElementById("grid");
    if(grid)grid.addEventListener("click",handleSelectionClick,true);
    document.addEventListener("keydown",keyHandler,true);
    var observer=new MutationObserver(function(){paintSelection();});
    if(grid)observer.observe(grid,{childList:true,subtree:true});
    if(typeof setMode==="function"){
        var originalSetMode=setMode;
        setMode=function(mode){
            clearSelection();
            return originalSetMode.apply(this,arguments);
        };
    }
    if(typeof buildWorld==="function"){
        var originalBuildWorld=buildWorld;
        buildWorld=function(){
            var previousLayer=activeLayer;
            var result=originalBuildWorld.apply(this,arguments);
            if(previousLayer!==activeLayer)clearSelection();
            else paintSelection();
            return result;
        };
    }
    window.BinaryWorldEditor=BW_EDITOR;
}

if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",install);
else install();

})();
