'use strict';

var blocks={};
var world={meta:{grid:[20,20],name:'Project',delayer:500},layers:[]};
var queue=[];
var queued={};
var processing=false;
var maxSteps=20000;
var delayedTimers=[];
var snapshotWaiters=[];
var saveWaiters=[];
var changed={};

var sides=['top','right','bottom','left'];
var delta={top:[0,-1],right:[1,0],bottom:[0,1],left:[-1,0]};
var opposite={top:'bottom',right:'left',bottom:'top',left:'right'};

function clone(o){return JSON.parse(JSON.stringify(o));}
function key(layer,x,y){return layer+':'+x+':'+y;}
function parseKey(k){var p=String(k).split(':');return{layer:Number(p[0]),x:Number(p[1]),y:Number(p[2])};}
function getBlock(x,y,layer){var l=world.layers[layer];if(!l||!l.schematic||!l.schematic[y])return null;return l.schematic[y][x]||null;}
function rotateSide(side,rotation){var i=sides.indexOf(side);if(i<0)return side;return sides[(i+Math.floor((Number(rotation)||0)/90)+40)%4];}
function worldPorts(block){var d=blocks[block.type];if(!d)return{inputs:[],outputs:[],zOutputs:[]};return{inputs:(d.ports.inputs||[]).map(function(p){return{id:p.id,side:p.side?rotateSide(p.side,block.rotation||0):p.side};}),outputs:(d.ports.outputs||[]).map(function(p){return{id:p.id,side:p.side?rotateSide(p.side,block.rotation||0):p.side};}),zOutputs:(d.zOutputs||[]).map(function(p){return{id:p.id};})};}
function portBySide(ports,side){for(var i=0;i<ports.length;i++)if(ports[i].side===side)return ports[i];return null;}
function localSource(block,input){if(!input.side)return null;var d=delta[input.side];if(!d)return null;var x=block.x+d[0],y=block.y+d[1];if(x<0||y<0||x>=world.meta.grid[0]||y>=world.meta.grid[1])return null;var source=getBlock(x,y,block.layer);if(!source)return null;var sp=portBySide(worldPorts(source).outputs,opposite[input.side]);if(!sp)return null;return{block:source,port:sp};}
function verticalSources(block){var result={up:null,down:null},lower=block.layer-1,upper=block.layer+1;if(lower>=0){var b=getBlock(block.x,block.y,lower);if(b&&b.runtime&&b.runtime.zOutputs&&b.runtime.zOutputs.up===1)result.up=b;}if(upper<world.layers.length){var t=getBlock(block.x,block.y,upper);if(t&&t.runtime&&t.runtime.zOutputs&&t.runtime.zOutputs.down===1)result.down=t;}return result;}
function readInputs(block){
    var inputs={},connected={},sources={},definition=blocks[block.type],direction=block.runtime&&block.runtime.zBlock?block.runtime.zBlock:null;
    var ports=worldPorts(block).inputs;
    for(var i=0;i<ports.length;i++){
        var input=ports[i],source=localSource(block,input);
        inputs[input.id]=source&&source.block.runtime&&source.block.runtime.outputs&&source.block.runtime.outputs[source.port.id]===1?1:0;
        connected[input.id]=!!source;
        sources[input.id]=source;
    }
    if(definition&&definition.zInput){
        var vertical=verticalSources(block),up=!!vertical.up,down=!!vertical.down;
        if(direction==='upper'){up=true;down=false;}else if(direction==='lower'){up=false;down=true;}else if(direction==='both'){up=true;down=true;}
        inputs.zUp=up&&!!vertical.up?1:0;inputs.zDown=down&&!!vertical.down?1:0;inputs.z=inputs.zUp===1||inputs.zDown===1?1:0;
        connected.zUp=!!vertical.up;connected.zDown=!!vertical.down;connected.z=!!vertical.up||!!vertical.down;
        sources.zUp=vertical.up;sources.zDown=vertical.down;sources.z={up:vertical.up,down:vertical.down};
    }
    return{inputs:inputs,connected:connected,sources:sources};
}
function shallowEqual(a,b){
    a=a||{};b=b||{};var ka=Object.keys(a),kb=Object.keys(b);if(ka.length!==kb.length)return false;
    for(var i=0;i<ka.length;i++){var k=ka[i];if((a[k]?1:0)!==(b[k]?1:0))return false;}return true;
}
function markChanged(block,p){
    if(!block)return;
    changed[key(p.layer,p.x,p.y)]={key:key(p.layer,p.x,p.y),state:block.state?1:0,runtime:{inputs:clone(block.runtime&&block.runtime.inputs||{}),connected:clone(block.runtime&&block.runtime.connected||{}),outputs:clone(block.runtime&&block.runtime.outputs||{}),zOutputs:clone(block.runtime&&block.runtime.zOutputs||{}),zBlock:block.runtime&&block.runtime.zBlock?block.runtime.zBlock:null}};
}
function notifyLocal(source,layer,outputPort){var d=delta[outputPort.side];if(!d)return;var x=source.x+d[0],y=source.y+d[1];if(x<0||y<0||x>=world.meta.grid[0]||y>=world.meta.grid[1])return;var target=getBlock(x,y,layer);if(!target)return;var input=portBySide(worldPorts(target).inputs,opposite[outputPort.side]);if(input)schedule(key(layer,x,y));}
function notifyVertical(source,layer){for(var i=0;i<2;i++){var tl=i===0?layer-1:layer+1;if(tl<0||tl>=world.layers.length)continue;var target=getBlock(source.x,source.y,tl);if(target&&blocks[target.type]&&blocks[target.type].zInput)schedule(key(tl,target.x,target.y));}}
function scheduleDelay(k,nextOutputs,nextZOutputs,delay){var p=parseKey(k),block=getBlock(p.x,p.y,p.layer);if(!block)return;if(!block.runtime)block.runtime=createRuntimeWorker();var pending={outputs:clone(nextOutputs),zOutputs:clone(nextZOutputs),timer:null};pending.timer=setTimeout(function(){
    if(!block.runtime)return;
    block.runtime.outputs=clone(pending.outputs);block.runtime.zOutputs=clone(pending.zOutputs);
    var ports=worldPorts(block);
    if(ports.outputs.length===1)block.state=pending.outputs[ports.outputs[0].id]?1:0;
    markChanged(block,p);
    for(var i=0;i<ports.outputs.length;i++)notifyLocal(block,p.layer,ports.outputs[i]);
    for(var j=0;j<ports.zOutputs.length;j++)notifyVertical(block,p.layer);
    flushChanged();
},Math.max(0,Number(delay)||0));
delayedTimers.push(pending.timer);
}
function createRuntimeWorker(){return{inputs:{},connected:{},outputs:{},zOutputs:{},zBlock:null};}
function evaluate(k){
    var p=parseKey(k),block=getBlock(p.x,p.y,p.layer);if(!block)return;var definition=blocks[block.type];if(!definition)return;if(!block.runtime)block.runtime=createRuntimeWorker();
    var oldState=block.state?1:0,oldInputs=clone(block.runtime.inputs||{}),oldConnected=clone(block.runtime.connected||{}),oldOutputs=clone(block.runtime.outputs||{}),oldZ=clone(block.runtime.zOutputs||{}),oldZBlock=block.runtime.zBlock||null;
    var read=readInputs(block);
    block.runtime.inputs=clone(read.inputs);block.runtime.connected=clone(read.connected);
    var result=definition.function({state:block.state?1:0,pressed:!!block.pressed,inputs:clone(read.inputs),connected:clone(read.connected),runtime:block.runtime,delayerMs:Math.max(0,Math.min(500,Number(world.meta&&world.meta.delayer!==undefined?world.meta.delayer:500)||0)),time:(self.performance&&performance.now)?performance.now():Date.now()})||{};
    var newState=result.state?1:0,ports=worldPorts(block),nextOutputs={},nextZ={};
    for(var i=0;i<ports.outputs.length;i++)nextOutputs[ports.outputs[i].id]=result.outputs&&result.outputs[ports.outputs[i].id]?1:0;
    for(var j=0;j<ports.zOutputs.length;j++)nextZ[ports.zOutputs[j].id]=result.zOutputs&&result.zOutputs[ports.zOutputs[j].id]?1:0;
    block.state=newState;
    block.runtime.outputs=clone(nextOutputs);block.runtime.zOutputs=clone(nextZ);
    var routingChanged=(oldZBlock!==(block.runtime.zBlock||null));
    var visibleChange=oldState!==newState||!shallowEqual(oldInputs,read.inputs)||!shallowEqual(oldConnected,read.connected)||!shallowEqual(oldOutputs,nextOutputs)||!shallowEqual(oldZ,nextZ)||routingChanged;
    if(visibleChange)markChanged(block,p);
    if(typeof result.delay==='number'&&result.delay>0){scheduleDelay(k,nextOutputs,nextZ,result.delay);}
    else{
        for(var q=0;q<ports.outputs.length;q++)if((oldOutputs[ports.outputs[q].id]?1:0)!==(nextOutputs[ports.outputs[q].id]?1:0))notifyLocal(block,p.layer,ports.outputs[q]);
        for(var z=0;z<ports.zOutputs.length;z++)if((oldZ[ports.zOutputs[z].id]?1:0)!==(nextZ[ports.zOutputs[z].id]?1:0))notifyVertical(block,p.layer);
    }
}
function schedule(k){if(queued[k])return;queued[k]=true;queue.push(k);run();}
function run(){if(processing)return;processing=true;setTimeout(process,0);}
function process(){
    var steps=0;
    while(queue.length&&steps<maxSteps){var k=queue.shift();delete queued[k];evaluate(k);steps++;}
    flushChanged();
    processing=false;
    if(queue.length){setTimeout(process,0);}
    else{
        if(snapshotWaiters.length){var w=clone(world);var waiters=snapshotWaiters.splice(0);for(var i=0;i<waiters.length;i++)self.postMessage({cmd:'snapshot',world:w});}
        if(saveWaiters.length){
            var saveList=saveWaiters.splice(0);
            for(var si=0;si<saveList.length;si++){
                var req=saveList[si],record={format:'BinaryWorldProject',version:2,key:req.key,createdAt:req.createdAt,updatedAt:Date.now(),activeLayer:req.activeLayer,world:serializableForSave()};
                self.postMessage({cmd:'save-done',token:req.token,json:JSON.stringify(record)});
            }
        }
    }
}
function flushChanged(){var keys=Object.keys(changed);if(!keys.length)return;var arr=new Array(keys.length);for(var i=0;i<keys.length;i++)arr[i]=changed[keys[i]];changed={};self.postMessage({cmd:'changes',changes:arr});}

function serializableForSave(){
    var result={meta:{grid:[Number(world.meta.grid[0])||20,Number(world.meta.grid[1])||20],name:String(world.meta.name||'Project'),delayer:Math.max(0,Math.min(500,world.meta.delayer!==undefined?Number(world.meta.delayer):500))},layers:[]};
    for(var li=0;li<world.layers.length;li++){
        var src=world.layers[li],rows=[];
        for(var y=0;y<world.meta.grid[1];y++){
            var out={};var row=src.schematic[y]||{};
            for(var xKey in row){if(!Object.prototype.hasOwnProperty.call(row,xKey))continue;var b=row[xKey];if(!b)continue;out[xKey]={type:b.type,x:Number(b.x)||Number(xKey)||0,y:Number(b.y)||y,layer:li,rotation:Number(b.rotation)||0,pressed:false,state:b.state?1:0};}
            rows.push(out);
        }
        result.layers.push({name:String(src.name||'Layer '+li),schematic:rows});
    }
    return result;
}

function buildWorldFromSerializable(input){
    var w=input&&input.meta&&input.meta.grid?Number(input.meta.grid[0])||20:20;
    var h=input&&input.meta&&input.meta.grid?Number(input.meta.grid[1])||20:20;
    world={meta:{grid:[w,h],name:String(input&&input.meta&&input.meta.name||'Project'),delayer:Math.max(0,Math.min(500,input&&input.meta&&input.meta.delayer!==undefined?Number(input.meta.delayer):500))},layers:[]};
    var srcLayers=input&&Array.isArray(input.layers)?input.layers:[];
    for(var li=0;li<srcLayers.length;li++){
        var src=srcLayers[li]||{};var rows=Array.from({length:h},function(){return{};});var srcRows=Array.isArray(src.schematic)?src.schematic:[];
        for(var y=0;y<Math.min(h,srcRows.length);y++){
            var row=srcRows[y]||{};for(var xKey in row){if(!Object.prototype.hasOwnProperty.call(row,xKey))continue;var b=row[xKey];if(!b)continue;var x=Number(b.x!==undefined?b.x:xKey),yy=Number(b.y!==undefined?b.y:y);if(x<0||yy<0||x>=w||yy>=h)continue;rows[yy][x]={type:String(b.type),x:x,y:yy,layer:li,rotation:Number(b.rotation)||0,pressed:!!b.pressed,state:b.state?1:0,runtime:b.runtime?clone(b.runtime):createRuntimeWorker()};}}
        world.layers.push({name:String(src.name||'Layer '+li),schematic:rows});
    }
    if(!world.layers.length)world.layers.push({name:'Layer 0',schematic:Array.from({length:h},function(){return{};})});
}
function clearTimers(){for(var i=0;i<delayedTimers.length;i++)try{clearTimeout(delayedTimers[i]);}catch(e){}delayedTimers=[];}
function rebuild(input){clearTimers();queue=[];queued={};processing=false;changed={};buildWorldFromSerializable(input);var total=0;for(var li=0;li<world.layers.length;li++)for(var y=0;y<world.meta.grid[1];y++)for(var x=0;x<world.meta.grid[0];x++)if(getBlock(x,y,li))total++;var done=0;
    for(var layer=0;layer<world.layers.length;layer++)for(var yy=0;yy<world.meta.grid[1];yy++)for(var xx=0;xx<world.meta.grid[0];xx++){var b=getBlock(xx,yy,layer);if(!b)continue;b.runtime=createRuntimeWorker();schedule(key(layer,xx,yy));done++;if(total&&done%2000===0)self.postMessage({cmd:'simulation-progress',percent:Math.min(99,Math.round(done/total*60)+20)});}
    if(total===0)self.postMessage({cmd:'changes',changes:[]});
}

function findBlockType(v){var wanted=String(v||'').toLowerCase();for(var type in blocks){if(!Object.prototype.hasOwnProperty.call(blocks,type))continue;var d=blocks[type];if(type.toLowerCase()===wanted||String(d.id).toLowerCase()===wanted||String(d.name).toLowerCase()===wanted)return type;}return null;}

function Reader(bytes){this.data=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);this.position=0;}
Reader.prototype.u8=function(){if(this.position>=this.data.length)throw new Error('Unexpected end of BW file');return this.data[this.position++];};
Reader.prototype.bytes=function(n){if(this.position+n>this.data.length)throw new Error('Unexpected end of BW file');var r=this.data.slice(this.position,this.position+n);this.position+=n;return r;};
function readVarUint(r){var v=0,s=0;while(true){var b=r.u8();v+=(b&127)*Math.pow(2,s);if(!(b&128))return v;s+=7;if(s>35)throw new Error('Invalid BW varint');}}
function zigzagDecode(v){return v&1?-(Math.floor(v/2)+1):Math.floor(v/2);}
function readVarInt(r){return zigzagDecode(readVarUint(r));}
function readString(r){return new TextDecoder().decode(r.bytes(readVarUint(r)));}
function deltaDecode(b){var r=new Uint8Array(b.length);if(!b.length)return r;r[0]=b[0];for(var i=1;i<b.length;i++)r[i]=(r[i-1]+b[i])&255;return r;}
function varIntDecode(b){var r=new Reader(b),o=[];while(r.position<r.data.length)o.push(readVarUint(r)&255);return new Uint8Array(o);}
function zigzagVarintDecode(b){var r=new Reader(b),o=[],p=0;while(r.position<r.data.length){p=(p+zigzagDecode(readVarUint(r))+256)&255;o.push(p);}return new Uint8Array(o);}
function rleDecode(b){var o=[],i=0;while(i<b.length){var c=b[i++],len=(c&127)+1;if(c&128){if(i>=b.length)throw new Error('Invalid BW RLE data');var v=b[i++];for(var j=0;j<len;j++)o.push(v);}else{if(i+len>b.length)throw new Error('Invalid BW RLE data');for(var k=0;k<len;k++)o.push(b[i+k]);i+=len;}}return new Uint8Array(o);}
function lz77Decode(b){var o=[],i=0;while(i<b.length){var control=b[i++];for(var bit=0;bit<8&&i<b.length;bit++){if(control&(1<<bit)){if(i+2>=b.length)throw new Error('Invalid BW LZ77 data');var d=b[i]|(b[i+1]<<8),len=b[i+2];i+=3;if(!d||d>o.length)throw new Error('Invalid BW LZ77 distance');for(var m=0;m<len;m++)o.push(o[o.length-d]);}else o.push(b[i++]);}}return new Uint8Array(o);}
function decompress(bytes,methods,progress){var cur=new Uint8Array(bytes);for(var i=methods.length-1;i>=0;i--){var m=methods[i];if(m==='delta')cur=deltaDecode(cur);else if(m==='zigzag-varint')cur=zigzagVarintDecode(cur);else if(m==='varint')cur=varIntDecode(cur);else if(m==='rle')cur=rleDecode(cur);else if(m==='lz77')cur=lz77Decode(cur);else throw new Error('Unknown BW compression method: '+m);if(progress)progress(i+1,methods.length);}return cur;}
function readPayload(bytes,progress){var r=new Reader(bytes),width=readVarUint(r),depth=readVarUint(r),layers=readVarUint(r),name=readString(r),ln=readVarUint(r),layerNames=[];for(var i=0;i<ln;i++)layerNames.push(readString(r));var dn=readVarUint(r),dictionary=[];for(i=0;i<dn;i++)dictionary.push({id:readVarUint(r),type:readString(r),name:readString(r),blockId:readString(r)});var pn=readVarUint(r),program=[];for(i=0;i<pn;i++){var op=r.u8();if(op===1)program.push({op:'place',id:readVarUint(r),position:[readVarInt(r),readVarInt(r),readVarInt(r)],rotation:r.u8()&3});else if(op===2){var id=readVarUint(r),axisByte=r.u8();program.push({op:'line',id:id,axis:axisByte===0?'x':axisByte===1?'y':'z',start:[readVarInt(r),readVarInt(r),readVarInt(r)],count:readVarUint(r),rotation:r.u8()&3});}else throw new Error('Invalid BW program opcode');if(progress&&i%1000===0)progress(i,pn);}
    var sn=readVarUint(r),states=[];for(i=0;i<sn;i++){if(r.u8()!==3)throw new Error('Invalid BW state opcode');states.push({position:[readVarInt(r),readVarInt(r),readVarInt(r)],state:r.u8()?1:0});}if(r.u8()!==255)throw new Error('BW payload missing END');return{format:'BW',version:1,meta:{name:name,grid:[width,depth],layers:layers},layerNames:layerNames,dictionary:dictionary,program:program,states:states};}
function readBW(bytes,progress){var r=new Reader(bytes);if(r.u8()!==0x42||r.u8()!==0x57)throw new Error('Not a .bw file');if(r.u8()!==1)throw new Error('Unsupported BW version');var flags=r.u8(),rawLength=(r.u8()|(r.u8()<<8)|(r.u8()<<16)|(r.u8()<<24))>>>0,compressedLength=(r.u8()|(r.u8()<<8)|(r.u8()<<16)|(r.u8()<<24))>>>0,mc=r.u8(),methods=[];var names={1:'delta',2:'zigzag-varint',3:'varint',4:'rle',5:'lz77'};for(var i=0;i<mc;i++){var m=names[r.u8()];if(!m)throw new Error('Unknown BW compression');methods.push(m);}if(!(flags&1)&&mc)throw new Error('Invalid BW compression flags');var payload=decompress(r.bytes(compressedLength),methods,function(done,total){progress&&progress(20+Math.round(done/Math.max(1,total)*25));});if(payload.length!==rawLength)throw new Error('BW decompression size mismatch');return readPayload(payload,function(done,total){progress&&progress(45+Math.round(done/Math.max(1,total)*20));});}
function expandProgram(data,progress){var dictionary={};data.dictionary.forEach(function(e){dictionary[e.id]=e;});var out=[],total=data.program.length;for(var i=0;i<total;i++){var ins=data.program[i],e=dictionary[ins.id];if(!e)throw new Error('Unknown BW block ID: '+ins.id);var type=findBlockType(e.blockId||e.type);if(!type)throw new Error('Block definition missing: '+(e.blockId||e.type));if(ins.op==='place')out.push({type:type,x:ins.position[0],y:ins.position[1],z:ins.position[2],rotation:ins.rotation*90});else for(var j=0;j<ins.count;j++){var x=ins.start[0],y=ins.start[1],z=ins.start[2];if(ins.axis==='x')x+=j;else if(ins.axis==='y')y+=j;else z+=j;out.push({type:type,x:x,y:y,z:z,rotation:ins.rotation*90});}if(progress&&i%1000===0)progress(65+Math.round(i/Math.max(1,total)*20));}return out;}
function createImportedWorld(data,progress){var result={meta:{grid:[data.meta.grid[0],data.meta.grid[1]],name:data.meta.name,delayer:Math.max(0,Math.min(500,data.meta.delayer!==undefined?Number(data.meta.delayer):500))},layers:[]};for(var i=0;i<data.meta.layers;i++)result.layers.push({name:(data.layerNames&&data.layerNames[i])||'Layer '+i,schematic:Array.from({length:data.meta.grid[1]},function(){return{};})});var expanded=expandProgram(data,progress);for(var i=0;i<expanded.length;i++){var r=expanded[i];if(r.y<0||r.y>=result.layers.length||r.x<0||r.x>=result.meta.grid[0]||r.z<0||r.z>=result.meta.grid[1])continue;result.layers[r.y].schematic[r.z][r.x]={type:r.type,x:r.x,y:r.z,layer:r.y,rotation:r.rotation,pressed:false,state:0,runtime:createRuntimeWorker()};if(progress&&i%2000===0)progress(85+Math.round(i/Math.max(1,expanded.length)*10));}data.states.forEach(function(s){var x=s.position[0],y=s.position[1],z=s.position[2];if(y<0||y>=result.layers.length||x<0||x>=result.meta.grid[0]||z<0||z>=result.meta.grid[1])return;var b=result.layers[y].schematic[z][x];if(b)b.state=s.state?1:0;});return result;}
function normalizeJSON(data){if(data&&data.world&&data.world.meta&&Array.isArray(data.world.layers))data=data.world;if(!data||!data.meta||!Array.isArray(data.layers))throw new Error('Invalid Binary World JSON');var grid=Array.isArray(data.meta.grid)?data.meta.grid:[20,20],w=Number(grid[0])||20,h=Number(grid[1])||20,result={meta:{grid:[w,h],name:String(data.meta.name||'Project 1'),delayer:Math.max(0,Math.min(500,data.meta.delayer!==undefined?Number(data.meta.delayer):500))},layers:[]};for(var i=0;i<data.layers.length;i++){var src=data.layers[i]||{},schematic=Array.from({length:h},function(){return{};}),rows=Array.isArray(src.schematic)?src.schematic:[];for(var z=0;z<Math.min(h,rows.length);z++){var row=rows[z]||{};for(var k in row){if(!Object.prototype.hasOwnProperty.call(row,k))continue;var raw=row[k];if(!raw)continue;var type=findBlockType(raw.type);if(!type)throw new Error('Unknown block type in JSON: '+raw.type);var x=Number(raw.x!==undefined?raw.x:k),y=Number(raw.y!==undefined?raw.y:z);if(x<0||x>=w||y<0||y>=h)continue;schematic[y][x]={type:type,x:x,y:y,layer:i,rotation:Number(raw.rotation)||0,pressed:false,state:raw.state?1:0,runtime:createRuntimeWorker()};} }result.layers.push({name:String(src.name||'Layer '+i),schematic:schematic});progress&&progress(20+Math.round((i+1)/Math.max(1,data.layers.length)*75));}if(!result.layers.length)result.layers.push({name:'Layer 0',schematic:Array.from({length:h},function(){return{};})});return result;}

function importBuffer(buffer,format){
    try{
        clearTimers();queue=[];queued={};processing=false;changed={};
        var bytes=new Uint8Array(buffer);
        self.postMessage({cmd:'import-progress',stage:'READING FILE',percent:3,detail:(bytes.length/1024/1024).toFixed(2)+' MB'});
        var worldResult;
        if(String(format).toLowerCase()==='json'){
            self.postMessage({cmd:'import-progress',stage:'PARSING JSON',percent:10,detail:'Decoding text'});
            var text=new TextDecoder().decode(bytes);
            var data=JSON.parse(text);
            worldResult=normalizeJSON(data,function(p){self.postMessage({cmd:'import-progress',stage:'BUILDING WORLD',percent:Math.min(95,p),detail:'Processing layers'});});
        }else{
            self.postMessage({cmd:'import-progress',stage:'DECODING BW',percent:10,detail:'Reading binary header'});
            var data=readBW(bytes,function(p){self.postMessage({cmd:'import-progress',stage:'DECODING BW',percent:Math.min(95,p),detail:'Decompressing / decoding'});});
            self.postMessage({cmd:'import-progress',stage:'BUILDING WORLD',percent:85,detail:'Expanding placements'});
            worldResult=createImportedWorld(data,function(p){self.postMessage({cmd:'import-progress',stage:'BUILDING WORLD',percent:Math.min(98,p),detail:'Expanding placements'});});
        }
        self.postMessage({cmd:'import-progress',stage:'FINALIZING',percent:99,detail:'Preparing editor'});
        self.postMessage({cmd:'import-done',format:String(format),world:worldResult});
    }catch(err){self.postMessage({cmd:'error',error:String(err&&err.message||err),operation:'import'});}
}

self.onmessage=function(ev){
    var m=ev.data||{};
    try{
        if(m.cmd==='init'){
            blocks={};
            var defs=m.blocks||[];
            for(var i=0;i<defs.length;i++){
                var d=defs[i],fn;
                try{fn=Function('return ('+d.functionSource+')')();}catch(e){throw new Error('Could not initialize block '+d.type+': '+e.message);}
                if(d.type==='delayer'){var baseFn=fn;fn=function(ctx){var r=baseFn(ctx)||{};r.delay=Math.max(0,Math.min(500,Number(ctx.delayerMs!==undefined?ctx.delayerMs:500)||0));return r;};} blocks[d.type]={id:d.id,name:d.name,ports:d.ports||{inputs:[],outputs:[]},zInput:!!d.zInput,zOutputs:d.zOutputs||[],function:fn};
            }
            self.postMessage({cmd:'ready'});
            return;
        }
        if(m.cmd==='settings'){if(m.delayerMs!==undefined)world.meta.delayer=Math.max(0,Math.min(500,Number(m.delayerMs)||0));return;}
        if(m.cmd==='rebuild'){rebuild(m.world);return;}
        if(m.cmd==='schedule'){
            var p=parseKey(m.key),b=getBlock(p.x,p.y,p.layer);
            if(b&&m.block){b.pressed=!!m.block.pressed;b.state=m.block.state?1:0;if(m.block.runtime)b.runtime=clone(m.block.runtime);}
            schedule(m.key);return;
        }
        if(m.cmd==='snapshot'){
            if(processing||queue.length){snapshotWaiters.push(true);return;}
            self.postMessage({cmd:'snapshot',world:clone(world)});return;
        }
        if(m.cmd==='save'){
            if(processing||queue.length){saveWaiters.push({key:String(m.key||''),createdAt:Number(m.createdAt)||Date.now(),activeLayer:Number(m.activeLayer)||0,token:String(m.token||'')});return;}
            var record={format:'BinaryWorldProject',version:2,key:String(m.key||''),createdAt:Number(m.createdAt)||Date.now(),updatedAt:Date.now(),activeLayer:Number(m.activeLayer)||0,world:serializableForSave()};
            self.postMessage({cmd:'save-done',token:String(m.token||''),json:JSON.stringify(record)});
            return;
        }
        if(m.cmd==='import'){importBuffer(m.buffer,m.format);return;}
    }catch(err){self.postMessage({cmd:'error',error:String(err&&err.message||err),operation:m.cmd||'unknown'});}
};
