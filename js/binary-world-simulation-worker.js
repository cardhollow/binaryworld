/* Binary World simulation worker. The complete simulation state and signal propagation live off the UI thread. */
'use strict';

var defs={};
var world=null;
var blocksByKey=new Map();
var links=new Map();
var networkByKey=new Map();
var networks=[];
var queue=[];
var queued=new Set();
var generation=0;
var runToken=0;
var processing=false;
var changed=new Map();
var pendingTimers=new Map();
var delta={top:[0,-1],right:[1,0],bottom:[0,1],left:[-1,0]};
var opposite={top:'bottom',right:'left',bottom:'top',left:'right'};
var sides=['top','right','bottom','left'];
var MAX_STEPS_PER_RUN=250000;
var SLICE_STEPS=5000;

function clone(o){return JSON.parse(JSON.stringify(o));}
function key(layer,x,y){return String(layer)+':'+String(x)+':'+String(y);}
function blockAt(x,y,layer){return blocksByKey.get(key(layer,x,y))||null;}
function defFor(type){return defs[type]||null;}
function rotateSide(side,rotation){var i=sides.indexOf(side);if(i<0)return side;return sides[(i+Math.floor((Number(rotation)||0)/90)+40)%4];}
function portsFor(block){var d=defFor(block.type);if(!d)return{inputs:[],outputs:[],zOutputs:[]};var inputs=d.ports&&d.ports.inputs||[],outputs=d.ports&&d.ports.outputs||[];return{inputs:inputs.map(function(p){return{id:p.id,side:p.side?rotateSide(p.side,block.rotation||0):p.side};}),outputs:outputs.map(function(p){return{id:p.id,side:p.side?rotateSide(p.side,block.rotation||0):p.side};}),zOutputs:(d.zOutputs||[]).map(function(p){return{id:p.id};})};}
function portBySide(ports,side){for(var i=0;i<ports.length;i++)if(ports[i].side===side)return ports[i];return null;}
function isNetworkType(block){var d=defFor(block.type);if(!d)return false;var name=String(d.name||block.type).toLowerCase(),inputs=d.ports&&d.ports.inputs||[],outputs=d.ports&&d.ports.outputs||[];return (d.network||block.type==='connector'||block.type==='wire'||name==='wire')&&inputs.length===1&&outputs.length===1;}
function sameFlags(a,b){a=a||{};b=b||{};var k;for(k in a)if(Object.prototype.hasOwnProperty.call(a,k)&&!!a[k]!==!!b[k])return false;for(k in b)if(Object.prototype.hasOwnProperty.call(b,k)&&!!a[k]!==!!b[k])return false;return true;}
function markChanged(block){var r=block.runtime||{};changed.set(key(block.layer,block.x,block.y),{layer:block.layer,x:block.x,y:block.y,type:block.type,state:block.state?1:0,pressed:!!block.pressed,inputs:clone(r.inputs||{}),connected:clone(r.connected||{}),outputs:clone(r.outputs||{}),zOutputs:clone(r.zOutputs||{}),zBlock:r.zBlock||null});}

function buildWorld(snapshot){
	world=clone(snapshot||{});
	blocksByKey.clear();
	links.clear();
	networkByKey.clear();
	networks=[];
	queue=[];
	queued.clear();
	changed.clear();
	pendingTimers.forEach(function(t){clearTimeout(t.timer);});
	pendingTimers.clear();
	var layers=world.layers||[];
	for(var li=0;li<layers.length;li++){
		var rows=layers[li]&&layers[li].schematic||[];
		for(var y=0;y<rows.length;y++){
			var row=rows[y]||{};
			for(var x in row){
				if(!Object.prototype.hasOwnProperty.call(row,x))continue;
				var raw=row[x];
				if(!raw)continue;
				var b={
					type:raw.type,
					x:Number(raw.x!==undefined?raw.x:x),
					y:Number(raw.y!==undefined?raw.y:y),
					layer:li,
					rotation:Number(raw.rotation)||0,
					pressed:!!raw.pressed,
					state:raw.state?1:0,
					runtime:{inputs:{},connected:{},outputs:{},zOutputs:{},zBlock:null}
				};
				blocksByKey.set(key(li,b.x,b.y),b);
			}
		}
	}
	buildTopology();
}

function buildTopology(){
	var connectorNodes=[];
	var connectorIndex=new Map();
	blocksByKey.forEach(function(block,k){
		if(isNetworkType(block)){
			connectorIndex.set(k,connectorNodes.length);
			connectorNodes.push(k);
		}
	});

	var adj=Array.from({length:connectorNodes.length},function(){return[];});
	var undirected=Array.from({length:connectorNodes.length},function(){return[];});
	links.clear();

	blocksByKey.forEach(function(source,sourceKey){
		var sourcePorts=portsFor(source);
		for(var i=0;i<sourcePorts.outputs.length;i++){
			var output=sourcePorts.outputs[i],d=delta[output.side];
			if(!d)continue;
			var tx=source.x+d[0],ty=source.y+d[1];
			if(tx<0||ty<0||tx>=Number(world.meta.grid[0])||ty>=Number(world.meta.grid[1]))continue;
			var target=blockAt(tx,ty,source.layer);
			if(!target)continue;
			var input=portBySide(portsFor(target).inputs,opposite[output.side]);
			if(!input)continue;
			var targetKey=key(target.layer,target.x,target.y);
			var edge={sourceKey:sourceKey,sourcePort:output.id,targetKey:targetKey,inputId:input.id};
			var targetLinks=links.get(targetKey);
			if(!targetLinks){targetLinks={};links.set(targetKey,targetLinks);}
			targetLinks[input.id]=edge;
			if(connectorIndex.has(sourceKey)&&connectorIndex.has(targetKey)){
				var si=connectorIndex.get(sourceKey),ti=connectorIndex.get(targetKey);
				adj[si].push(ti);
				undirected[si].push(ti);
				undirected[ti].push(si);
			}
		}
	});

	var comp=new Int32Array(connectorNodes.length);
	for(var ci=0;ci<comp.length;ci++)comp[ci]=-1;
	var count=0;
	for(var root=0;root<connectorNodes.length;root++){
		if(comp[root]!==-1)continue;
		var stack=[root];
		comp[root]=count;
		while(stack.length){
			var v=stack.pop();
			for(var j=0;j<undirected[v].length;j++){
				var n=undirected[v][j];
				if(comp[n]===-1){comp[n]=count;stack.push(n);}
			}
		}
		count++;
	}

	networks=Array.from({length:count},function(_,id){return{id:id,members:[],incoming:[],outgoing:[],internal:new Map()};});
	for(ci=0;ci<connectorNodes.length;ci++){
		var connectorKey=connectorNodes[ci],networkId=comp[ci];
		networkByKey.set(connectorKey,networkId);
		networks[networkId].members.push(connectorKey);
		networks[networkId].internal.set(connectorKey,[]);
	}
	for(ci=0;ci<connectorNodes.length;ci++){
		var from=connectorNodes[ci],fromIndex=ci;
		for(var ai=0;ai<adj[fromIndex].length;ai++){
			var to=connectorNodes[adj[fromIndex][ai]];
			networks[comp[fromIndex]].internal.get(from).push(to);
		}
	}

	blocksByKey.forEach(function(block,bk){
		if(!isNetworkType(block))return;
		var nid=networkByKey.get(bk),net=networks[nid],inMap=links.get(bk)||{},inPorts=portsFor(block).inputs;
		for(var i=0;i<inPorts.length;i++){
			var input=inPorts[i],edge=inMap[input.id];
			if(edge&&!networkByKey.has(edge.sourceKey))net.incoming.push(edge);
		}
		var outPorts=portsFor(block).outputs;
		for(var j=0;j<outPorts.length;j++){
			var output=outPorts[j],d=delta[output.side];
			if(!d)continue;
			var target=blockAt(block.x+d[0],block.y+d[1],block.layer);
			if(!target)continue;
			var targetKey=key(target.layer,target.x,target.y);
			if(networkByKey.has(targetKey))continue;
			var inputPort=portBySide(portsFor(target).inputs,opposite[output.side]);
			if(!inputPort)continue;
			var targetMap=links.get(targetKey)||{},edge=targetMap[inputPort.id];
			if(edge)net.outgoing.push(edge);
		}
	});

	for(var ni=0;ni<networks.length;ni++){
		networks[ni].incoming=dedupeEdges(networks[ni].incoming);
		networks[ni].outgoing=dedupeEdges(networks[ni].outgoing);
	}
}

function dedupeEdges(arr){
	var seen=new Set(),out=[];
	for(var i=0;i<arr.length;i++){
		var e=arr[i],k=e.sourceKey+'>'+e.targetKey+'>'+e.inputId;
		if(seen.has(k))continue;
		seen.add(k);out.push(e);
	}
	return out;
}

function linksForBlock(block){return links.get(key(block.layer,block.x,block.y))||{};}

function sourceValue(edge){if(!edge)return 0;if(networkByKey.has(edge.sourceKey)){var member=blocksByKey.get(edge.sourceKey);return member&&member.state?1:0;}var source=blocksByKey.get(edge.sourceKey);return source&&source.runtime&&source.runtime.outputs&&source.runtime.outputs[edge.sourcePort]===1?1:0;}

function verticalRead(block){
	var up=null,down=null;
	var lower=block.layer-1,upper=block.layer+1;
	if(lower>=0){
		var below=blockAt(block.x,block.y,lower);
		if(below&&below.runtime&&below.runtime.zOutputs&&below.runtime.zOutputs.up===1)up=below;
	}
	if(upper<(world.layers||[]).length){
		var above=blockAt(block.x,block.y,upper);
		if(above&&above.runtime&&above.runtime.zOutputs&&above.runtime.zOutputs.down===1)down=above;
	}
	return{up:up,down:down};
}

function readInputs(block){
	var inputs={},connected={},sources={};
	var ps=portsFor(block),linkMap=linksForBlock(block);
	for(var i=0;i<ps.inputs.length;i++){
		var input=ps.inputs[i],edge=linkMap[input.id];
		if(edge){
			inputs[input.id]=sourceValue(edge);
			connected[input.id]=true;
			sources[input.id]=edge;
		}else{
			inputs[input.id]=0;
			connected[input.id]=false;
			sources[input.id]=null;
		}
	}
	var d=defFor(block.type);
	if(d&&d.zInput){
		var vertical=verticalRead(block),direction=block.runtime&&block.runtime.zBlock?block.runtime.zBlock:null;
		var up=!!vertical.up,down=!!vertical.down;
		if(direction==='upper'){up=true;down=false;}else if(direction==='lower'){up=false;down=true;}else if(direction==='both'){up=true;down=true;}
		inputs.zUp=up&&!!vertical.up?1:0;
		inputs.zDown=down&&!!vertical.down?1:0;
		inputs.z=inputs.zUp||inputs.zDown?1:0;
		connected.zUp=!!vertical.up;
		connected.zDown=!!vertical.down;
		connected.z=!!vertical.up||!!vertical.down;
		sources.zUp=vertical.up;
		sources.zDown=vertical.down;
		sources.z={up:vertical.up,down:vertical.down};
	}
	return{inputs:inputs,connected:connected,sources:sources};
}

function scheduleBlock(k){
	if(!blocksByKey.has(k))return;
	var q='b:'+k;
	if(queued.has(q))return;
	queued.add(q);queue.push(q);
}
function scheduleNetwork(id){
	var q='n:'+id;
	if(queued.has(q))return;
	queued.add(q);queue.push(q);
}

function notifyOutput(source,output){
	var d=delta[output.side];
	if(!d)return;
	var target=blockAt(source.x+d[0],source.y+d[1],source.layer);
	if(!target)return;
	var targetKey=key(target.layer,target.x,target.y);
	if(networkByKey.has(targetKey))scheduleNetwork(networkByKey.get(targetKey));
	else scheduleBlock(targetKey);
}

function notifyVertical(source){
	for(var i=0;i<2;i++){
		var layer=i===0?source.layer-1:source.layer+1;
		if(layer<0||layer>=(world.layers||[]).length)continue;
		var target=blockAt(source.x,source.y,layer);
		if(target){var d=defFor(target.type);if(d&&d.zInput)scheduleBlock(key(target.layer,target.x,target.y));}
	}
}

function commitOutputs(block,nextOutputs,nextZOutputs){
	var oldOutputs=block.runtime.outputs||{},oldZ=block.runtime.zOutputs||{};
	var outputChanged=!sameFlags(oldOutputs,nextOutputs),zChanged=!sameFlags(oldZ,nextZOutputs);
	block.runtime.outputs=clone(nextOutputs);
	block.runtime.zOutputs=clone(nextZOutputs);
	if(outputChanged){
		var ps=portsFor(block);
		for(var i=0;i<ps.outputs.length;i++){
			var output=ps.outputs[i],a=oldOutputs[output.id]?1:0,b=nextOutputs[output.id]?1:0;
			if(a!==b)notifyOutput(block,output);
		}
	}
	if(zChanged)notifyVertical(block);
}

function scheduleDelay(block,nextOutputs,nextZOutputs,delay){
	var k=key(block.layer,block.x,block.y);
	var old=pendingTimers.get(k);
	var same=old&&JSON.stringify(old.outputs)===JSON.stringify(nextOutputs)&&JSON.stringify(old.zOutputs)===JSON.stringify(nextZOutputs);
	if(same)return;
	if(old){clearTimeout(old.timer);pendingTimers.delete(k);}
	var token=generation;
	var timer=setTimeout(function(){
		pendingTimers.delete(k);
		if(token!==generation)return;
		var current=blocksByKey.get(k);
		if(!current)return;
		commitOutputs(current,nextOutputs,nextZOutputs);
		var keys=Object.keys(nextOutputs);
		if(keys.length===1)current.state=nextOutputs[keys[0]]?1:0;
		markChanged(current);
		if(!processing)flushChanged();
		if(queue.length)runQueue();
	},Math.max(0,Number(delay)||0));
	pendingTimers.set(k,{timer:timer,outputs:clone(nextOutputs),zOutputs:clone(nextZOutputs)});
}

function evaluateNetwork(id){
	var net=networks[id];
	if(!net)return;
	var active=new Set();
	var frontier=[];
	for(var i=0;i<net.incoming.length;i++){
		var incoming=net.incoming[i];
		if(sourceValue(incoming)===1){
			if(!active.has(incoming.targetKey)){
				active.add(incoming.targetKey);
				frontier.push(incoming.targetKey);
			}
		}
	}
	while(frontier.length){
		var current=frontier.pop(),next=net.internal.get(current)||[];
		for(var j=0;j<next.length;j++){
			var targetKey=next[j];
			if(!active.has(targetKey)){
				active.add(targetKey);
				frontier.push(targetKey);
			}
		}
	}

	var changedExternal=[];
	for(i=0;i<net.members.length;i++){
		var block=blocksByKey.get(net.members[i]);
		if(!block)continue;
		var linkMap=linksForBlock(block),inputKeys=Object.keys(linkMap),inputConnected=false,inputValue=0;
		for(var ii=0;ii<inputKeys.length;ii++){
			if(linkMap[inputKeys[ii]]){inputConnected=true;if(sourceValue(linkMap[inputKeys[ii]])===1)inputValue=1;}
		}
		var nextState=active.has(net.members[i])?1:0;
		var beforeState=block.state?1:0,beforeInputs=block.runtime.inputs||{},beforeConnected=block.runtime.connected||{},beforeOutputs=block.runtime.outputs||{};
		block.runtime.inputs={in:inputValue};
		block.runtime.connected={in:inputConnected};
		block.runtime.outputs={out:nextState};
		block.runtime.zOutputs={};
		block.state=nextState;
		if(beforeState!==nextState||!sameFlags(beforeInputs,{in:inputValue})||!sameFlags(beforeConnected,{in:inputConnected})||!sameFlags(beforeOutputs,{out:nextState})){
			markChanged(block);
			if(beforeState!==nextState)changedExternal.push(block);
		}
	}
	for(i=0;i<changedExternal.length;i++){
		var changedBlock=changedExternal[i],ps=portsFor(changedBlock);
		for(var oi=0;oi<ps.outputs.length;oi++)notifyOutput(changedBlock,ps.outputs[oi]);
	}
}

function evaluateBlock(k){
	var block=blocksByKey.get(k);
	if(!block||isNetworkType(block))return;
	var d=defFor(block.type);
	if(!d||typeof d.function!=='function')return;
	if(!block.runtime)block.runtime={inputs:{},connected:{},outputs:{},zOutputs:{},zBlock:null};
	var oldState=block.state?1:0,oldInputs=block.runtime.inputs||{},oldConnected=block.runtime.connected||{},oldOutputs=block.runtime.outputs||{},oldZOutputs=block.runtime.zOutputs||{};
	var read=readInputs(block);
	block.runtime.inputs=clone(read.inputs);
	block.runtime.connected=clone(read.connected);
	var result;
	try{
		result=d.function({state:oldState,pressed:!!block.pressed,inputs:clone(read.inputs),connected:clone(read.connected),runtime:block.runtime,time:Date.now()})||{};
	}catch(error){
		postMessage({type:'error',generation:generation,message:'Block '+block.type+' at '+block.x+','+block.y+' threw: '+String(error&&error.message||error)});
		return;
	}
	var newState=result.state?1:0,ps=portsFor(block),nextOutputs={},nextZOutputs={};
	for(var i=0;i<ps.outputs.length;i++){
		var output=ps.outputs[i];
		nextOutputs[output.id]=result.outputs&&result.outputs[output.id]?1:0;
	}
	for(var j=0;j<ps.zOutputs.length;j++){
		var z=ps.zOutputs[j];
		nextZOutputs[z.id]=result.zOutputs&&result.zOutputs[z.id]?1:0;
	}
	block.state=newState;
	if(typeof result.delay==='number'&&result.delay>0)scheduleDelay(block,nextOutputs,nextZOutputs,result.delay);
	else commitOutputs(block,nextOutputs,nextZOutputs);
	if(oldState!==newState||!sameFlags(oldInputs,read.inputs)||!sameFlags(oldConnected,read.connected)||!sameFlags(oldOutputs,nextOutputs)||!sameFlags(oldZOutputs,nextZOutputs))markChanged(block);
}

function initialise(){
	for(var i=0;i<networks.length;i++)scheduleNetwork(i);
	blocksByKey.forEach(function(block,k){if(!isNetworkType(block))scheduleBlock(k);});
	runQueue();
}

function runQueue(){
	if(processing)return;
	var token=++runToken;
	if(!queue.length){flushChanged();postMessage({type:'sync-complete',generation:generation});return;}
	processing=true;
	var totalSteps=0;
	function slice(){
		if(token!==runToken)return;
		var steps=0;
		while(queue.length&&steps<SLICE_STEPS&&totalSteps<MAX_STEPS_PER_RUN){
			var item=queue.shift();
			queued.delete(item);
			if(item.charAt(0)==='n')evaluateNetwork(Number(item.slice(2)));
			else evaluateBlock(item.slice(2));
			steps++;totalSteps++;
		}
		flushChanged();
		if(queue.length&&totalSteps<MAX_STEPS_PER_RUN){setTimeout(slice,0);return;}
		processing=false;
		if(queue.length){queue=[];queued.clear();postMessage({type:'error',generation:generation,message:'Simulation step limit reached. A feedback loop may be oscillating.'});}
		else postMessage({type:'sync-complete',generation:generation});
	}
	slice();
}

function flushChanged(){
	if(!changed.size)return;
	var list=Array.from(changed.values());
	changed.clear();
	for(var i=0;i<list.length;i+=1000)postMessage({type:'diff',generation:generation,changes:list.slice(i,i+1000)});
}

function parseDefinitions(definitions){
	defs={};
	for(var type in definitions){
		if(!Object.prototype.hasOwnProperty.call(definitions,type))continue;
		var raw=definitions[type]||{},fn=null;
		try{fn=raw.functionSource?Function('return ('+raw.functionSource+')')():null;}catch(e){fn=null;}
		defs[type]={name:raw.name||type,ports:raw.ports||{inputs:[],outputs:[]},zInput:!!raw.zInput,zOutputs:raw.zOutputs||[],network:!!raw.network,function:fn};
	}
}

self.onmessage=function(event){
	var message=event.data||{};
	try{
		if(message.type==='definitions'){
			parseDefinitions(message.definitions||{});
			postMessage({type:'definitions-ready'});
			return;
		}
		if(message.type==='sync'){
			generation=Number(message.generation)||0;
			runToken++;
			queue=[];queued.clear();changed.clear();processing=false;
			buildWorld(message.world||{});
			initialise();
			return;
		}
		if(message.type==='input'){
			if(Number(message.generation)!==generation)return;
			var block=blocksByKey.get(String(message.key));
			if(!block)return;
			block.pressed=!!message.pressed;
			scheduleBlock(String(message.key));
			runQueue();
			return;
		}
	}catch(error){
		postMessage({type:'error',generation:generation,message:String(error&&error.stack||error)});
	}
};

postMessage({type:'worker-ready'});
