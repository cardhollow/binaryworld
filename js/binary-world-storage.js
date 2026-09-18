window.__BinaryWorldSourceParts=window.__BinaryWorldSourceParts||[];window.__BinaryWorldSourceParts[3]=`var BINARY_WORLD_DB_NAME='BinaryWorldProjectsDB';
var BINARY_WORLD_DB_VERSION=1;
var BINARY_WORLD_STORE='projects';
var binaryWorldDBPromise=null;
var projectSaveQueue=Promise.resolve();
var creatingNewProject=false;

function openBinaryWorldDB(){
    if(binaryWorldDBPromise)return binaryWorldDBPromise;
    binaryWorldDBPromise=new Promise(function(resolve,reject){
        if(!window.indexedDB){
            reject(new Error('IndexedDB is not supported by this browser'));
            return;
        }

        var request=window.indexedDB.open(BINARY_WORLD_DB_NAME,BINARY_WORLD_DB_VERSION);

        request.onupgradeneeded=function(e){
            var db=e.target.result;
            if(!db.objectStoreNames.contains(BINARY_WORLD_STORE)){
                db.createObjectStore(BINARY_WORLD_STORE,{keyPath:'key'});
            }
        };

        request.onsuccess=function(e){
            resolve(e.target.result);
        };

        request.onerror=function(){
            reject(request.error||new Error('Failed to open IndexedDB'));
        };

        request.onblocked=function(){
            reject(new Error('IndexedDB is blocked by another open database connection'));
        };
    }).catch(function(err){
        binaryWorldDBPromise=null;
        throw err;
    });

    return binaryWorldDBPromise;
}

function idbGetProject(key){
    return openBinaryWorldDB().then(function(db){
        return new Promise(function(resolve,reject){
            var tx=db.transaction(BINARY_WORLD_STORE,'readonly');
            var store=tx.objectStore(BINARY_WORLD_STORE);
            var request=store.get(key);

            request.onsuccess=function(){
                resolve(request.result||null);
            };

            request.onerror=function(){
                reject(request.error||new Error('IndexedDB read failed'));
            };
        });
    });
}

function idbGetAllProjects(){
    return openBinaryWorldDB().then(function(db){
        return new Promise(function(resolve,reject){
            var tx=db.transaction(BINARY_WORLD_STORE,'readonly');
            var store=tx.objectStore(BINARY_WORLD_STORE);
            var request=store.getAll();

            request.onsuccess=function(){
                resolve(Array.isArray(request.result)?request.result:[]);
            };

            request.onerror=function(){
                reject(request.error||new Error('IndexedDB list failed'));
            };
        });
    });
}

function idbPutProject(record){
    return openBinaryWorldDB().then(function(db){
        return new Promise(function(resolve,reject){
            var tx=db.transaction(BINARY_WORLD_STORE,'readwrite');
            var store=tx.objectStore(BINARY_WORLD_STORE);
            var request=store.put(record);

            request.onerror=function(){
                reject(request.error||new Error('IndexedDB save failed'));
            };

            tx.oncomplete=function(){
                resolve();
            };

            tx.onerror=function(){
                reject(tx.error||new Error('IndexedDB save transaction failed'));
            };

            tx.onabort=function(){
                reject(tx.error||new Error('IndexedDB save transaction aborted'));
            };
        });
    });
}

function idbDeleteProject(key){
    return openBinaryWorldDB().then(function(db){
        return new Promise(function(resolve,reject){
            var tx=db.transaction(BINARY_WORLD_STORE,'readwrite');
            var store=tx.objectStore(BINARY_WORLD_STORE);
            var request=store.delete(key);

            request.onerror=function(){
                reject(request.error||new Error('IndexedDB delete failed'));
            };

            tx.oncomplete=function(){
                resolve();
            };

            tx.onerror=function(){
                reject(tx.error||new Error('IndexedDB delete transaction failed'));
            };

            tx.onabort=function(){
                reject(tx.error||new Error('IndexedDB delete transaction aborted'));
            };
        });
    });
}

function projectTimestampKey(timestamp){
    var d=new Date(timestamp||Date.now());
    var pad=function(n){return String(n).padStart(2,'0')};
    return'project_'+d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())+'_'+pad(d.getHours())+'-'+pad(d.getMinutes())+'-'+pad(d.getSeconds())+'-'+String(d.getMilliseconds()).padStart(3,'0')
}

async function createUniqueProjectKey(){
    var base=Date.now();
    var n=0;

    while(true){
        var key=projectTimestampKey(base+n);
        var existing=await idbGetProject(key);

        if(!existing)return key;

        n++;
    }
}

function sanitizeBWFileName(name){
    var value=String(name||'Untitled Project').trim();
    value=value.replace(/[<>:"/\\\\|?*\\u0000-\\u001F]/g,'_');
    if(!value)value='Untitled Project';
    return value+'.bw';
}

function createStoredProjectRecord(keyName,now){
    return{
        format:'BinaryWorldProject',
        version:2,
        key:keyName,
        fileName:sanitizeBWFileName(world.meta&&world.meta.name||'Untitled Project'),
        createdAt:currentProjectCreatedAt||now,
        updatedAt:now,
        activeLayer:activeLayer,
        world:serializableWorld()
    };
}

function saveCurrentProject(){
    if(!currentProjectKey)return Promise.resolve();

    var record;

    try{
        record=createStoredProjectRecord(currentProjectKey,Date.now());
    }catch(e){
        statusElement.textContent='INDEXEDDB SAVE FAILED';
        console.error(e);
        return Promise.reject(e);
    }

    projectSaveQueue=projectSaveQueue.then(function(){
        return idbPutProject(record);
    }).catch(function(e){
        statusElement.textContent='INDEXEDDB SAVE FAILED';
        console.error(e);
    });

    return projectSaveQueue;
}

function setLocalProjectURL(name){
    try{
        var url=new URL(window.location.href);
        url.searchParams.delete('load');
        url.searchParams.set('local',String(name||''));
        window.history.replaceState({},document.title,url.pathname+url.search+url.hash);
    }catch(e){}
}

async function readLocalProjects(){
    var records=await idbGetAllProjects();

    var out=records.filter(function(record){
        return record&&record.format==='BinaryWorldProject'&&record.world;
    }).map(function(record){
        return{
            key:String(record.key||''),
            record:record
        };
    });

    out.sort(function(a,b){
        return Number(b.record.updatedAt||b.record.createdAt||0)-Number(a.record.updatedAt||a.record.createdAt||0)
    });

    return out;
}

function formatProjectDate(ts){
    return ts?new Date(ts).toLocaleString():'Unknown date'
}

async function openLocalProjects(){
    localProjectList.innerHTML='<div class="localEmpty">Loading saved local projects...</div>';
    localProjectsModal.classList.add('visible');

    try{
        var projects=await readLocalProjects();

        localProjectList.innerHTML='';

        if(!projects.length){
            localProjectList.innerHTML='<div class="localEmpty">No saved local projects.</div>';
            return;
        }

        projects.forEach(function(item){
            var row=document.createElement('div');
            row.className='localProject';

            var info=document.createElement('div');
            info.className='localProjectInfo';

            var name=document.createElement('div');
            name.className='localProjectName';
            name.textContent=String((item.record.world.meta&&item.record.world.meta.name)||'Untitled Project');

            var date=document.createElement('div');
            date.className='localProjectDate';
            date.textContent=formatProjectDate(item.record.updatedAt||item.record.createdAt)+(item.key===currentProjectKey?' • CURRENT':'');

            info.appendChild(name);
            info.appendChild(date);

            var actions=document.createElement('div');
            actions.className='localProjectActions';

            var load=document.createElement('button');
            load.className='localProjectLoad';
            load.textContent='LOAD';
            load.onclick=function(){
                confirmLoadStoredProject(item.key);
            };

            var del=document.createElement('button');
            del.className='localProjectLoad';
            del.textContent='DEL';
            del.onclick=function(){
                deleteLocalProject(item.key);
            };

            actions.appendChild(load);
            actions.appendChild(del);

            row.appendChild(info);
            row.appendChild(actions);

            localProjectList.appendChild(row);
        });
    }catch(e){
        console.error(e);
        localProjectList.innerHTML='<div class="localEmpty">Unable to read IndexedDB projects.</div>';
        statusElement.textContent='INDEXEDDB READ FAILED';
    }
}

async function deleteLocalProject(keyName){
    var record;

    try{
        record=await idbGetProject(keyName);
    }catch(e){
        console.error(e);
        alert('Delete failed:\\n'+e.message);
        return;
    }

    if(!record){
        openLocalProjects();
        return;
    }

    var projectName=String(record.world&&record.world.meta&&record.world.meta.name?record.world.meta.name:'Untitled Project');

    var confirmed=await confirmDialog(
        'Delete Project?',
        'Delete "'+projectName+'" from IndexedDB? This cannot be undone.'
    );

    if(!confirmed)return;

    try{
        await idbDeleteProject(keyName);

        if(keyName===currentProjectKey){
            currentProjectKey=null;
            currentProjectCreatedAt=0;
            closeModal(localProjectsModal);
            app.style.display='none';
            startup.style.display='flex';
        }else{
            await openLocalProjects();
        }
    }catch(e){
        console.error(e);
        alert('Delete failed:\\n'+e.message);
    }
}

async function confirmLoadStoredProject(keyName){
    var record;

    try{
        record=await idbGetProject(keyName);
    }catch(e){
        console.error(e);
        alert('Load failed:\\n'+e.message);
        return;
    }

    if(!record){
        openLocalProjects();
        return;
    }

    var projectName=String(record.world&&record.world.meta&&record.world.meta.name?record.world.meta.name:'Untitled Project');

    var confirmed=await confirmDialog(
        'Load Project?',
        'Load "'+projectName+'"? Your current editor state will be replaced by the saved project.'
    );

    if(confirmed){
        await loadStoredProject(keyName);
    }
}

async function loadStoredProject(keyName){
    try{
        var record=await idbGetProject(keyName);

        if(!record)throw new Error('Local project no longer exists');

        if(record.format!=='BinaryWorldProject')throw new Error('Invalid BinaryWorld project data');

        var restored=normalizeJSONWorld(record.world);

        currentProjectKey=String(record.key||keyName);
        currentProjectCreatedAt=Number(record.createdAt||record.updatedAt||Date.now());

        activeLayer=Math.min(
            Number(record.activeLayer)||0,
            Math.max(0,restored.layers.length-1)
        );

        selected.x=null;
        selected.y=null;

        clearHistory();
        replaceWorld(restored);

        closeModal(localProjectsModal);
        closeModal(loadChoiceModal);

        enterEditor();
        setLocalProjectURL(restored.meta.name);
    }catch(e){
        console.error(e);
        alert('Load failed:\\n'+e.message);
    }
}

function confirmDialog(title,subtitle){
    return new Promise(function(resolve){
        confirmResolver=resolve;
        confirmTitleElement.textContent=title;
        confirmSubtitleElement.textContent=subtitle;
        confirmModal.classList.add('visible');
        setTimeout(function(){
            confirmAccept.focus();
        },0);
    });
}

function finishConfirm(value){
    if(confirmResolver===null){
        confirmModal.classList.remove('visible');
        return;
    }

    var resolve=confirmResolver;
    confirmResolver=null;
    confirmModal.classList.remove('visible');
    resolve(value===true);
}

function closeModal(modal){
    modal.classList.remove('visible');
}

document.getElementById('addLayer').onclick=function(){
    applyWorldChange(function(){
        var i=world.layers.length;
        world.layers.push(createLayer('Layer '+i));
        activeLayer=i;
        selected.x=null;
        selected.y=null;
    });
};

document.getElementById('deleteLayer').onclick=function(){
    if(world.layers.length<=1){
        statusElement.textContent='CANNOT DELETE THE LAST LAYER';
        return;
    }

    var layer=world.layers[activeLayer];

    confirmDialog(
        'Delete Layer?',
        'Delete "'+layer.name+'"? This can be undone.'
    ).then(function(ok){
        if(!ok)return;

        applyWorldChange(function(){
            world.layers.splice(activeLayer,1);

            if(activeLayer>=world.layers.length){
                activeLayer=world.layers.length-1;
            }

            selected.x=null;
            selected.y=null;
        });
    });
};

function buildWorld(){
    layerList.innerHTML='';

    world.layers.forEach(function(layer,index){
        var el=document.createElement('div');
        el.className='layer'+(index===activeLayer?' active':'');
        el.textContent=layer.name;

        el.onclick=function(){
            clearTimeout(layerClickTimer);

            layerClickTimer=setTimeout(function(){
                if(renamingInput)return;

                activeLayer=index;
                selected.x=null;
                selected.y=null;

                buildWorld();
                simulation.rebuild();
                saveCurrentProject();
            },220);
        };

        el.ondblclick=function(e){
            e.preventDefault();
            e.stopPropagation();

            clearTimeout(layerClickTimer);

            beginRenameLayer(index,el);
        };

        layerList.appendChild(el);
    });

    buildGrid();
}

function beginRenameLayer(index,element){
    if(renamingInput)finishRename();

    renamingLayerIndex=index;
    renamingProject=false;

    var input=document.createElement('input');
    input.className='layerRenameInput';
    input.value=world.layers[index].name;

    element.innerHTML='';
    element.appendChild(input);

    renamingInput=input;
    activeLayer=index;

    input.focus();
    input.select();

    input.onclick=function(e){
        e.stopPropagation();
    };

    input.onpointerdown=function(e){
        e.stopPropagation();
    };

    input.ondblclick=function(e){
        e.stopPropagation();
    };

    input.onblur=finishRename;

    input.addEventListener('change',function(){
        if(renamingInput===input)finishRename();
    });
}

function beginRenameProject(){
    if(renamingInput)finishRename();

    renamingProject=true;
    renamingLayerIndex=null;

    var input=document.createElement('input');
    input.className='headerRenameInput';
    input.value=String(world.meta.name||'');

    headerTitle.innerHTML='';
    headerTitle.appendChild(input);

    renamingInput=input;

    input.focus();
    input.select();

    input.onclick=function(e){
        e.stopPropagation();
    };

    input.onpointerdown=function(e){
        e.stopPropagation();
    };

    input.ontouchstart=function(e){
        e.stopPropagation();
    };

    input.ondblclick=function(e){
        e.stopPropagation();
    };

    input.onkeydown=function(e){
        if(e.key==='Enter'){
            e.preventDefault();
            e.stopPropagation();
            finishRename();
            return;
        }

        if(e.key==='Escape'){
            e.preventDefault();
            e.stopPropagation();
            cancelRename();
            return;
        }
    };

    input.onblur=function(){
        if(renamingInput===input){
            finishRename();
        }
    };
}

function finishRename(){
    if(!renamingInput)return;

    var input=renamingInput;
    var value=String(input.value||'').trim();
    var wasProject=renamingProject;
    var layerIndex=renamingLayerIndex;

    if(wasProject){
        var oldProjectName=String(world.meta.name||'');

        renamingInput=null;
        renamingProject=false;
        renamingLayerIndex=null;

        if(value&&value!==oldProjectName){
            var beforeProject=deepSnapshot();

            world.meta.name=value;
            headerTitle.textContent=value;

            pushHistory(beforeProject);
            saveCurrentProject();
            updateHistoryButtons();
        }else{
            headerTitle.textContent=world.meta.name;
        }

        return;
    }

    renamingInput=null;
    renamingProject=false;
    renamingLayerIndex=null;

    if(layerIndex===null){
        buildWorld();
        return;
    }

    var oldLayer=String((world.layers[layerIndex]&&world.layers[layerIndex].name)||'');

    if(value&&value!==oldLayer){
        var beforeLayer=deepSnapshot();

        world.layers[layerIndex].name=value;
        finishWorldChange(beforeLayer);

        return;
    }

    buildWorld();
}

function cancelRename(){
    if(!renamingInput)return;

    renamingInput=null;
    renamingProject=false;
    renamingLayerIndex=null;

    headerTitle.textContent=world.meta.name;
    buildWorld();
}

function isTextEditingTarget(el){
    if(!el)return false;

    var tag=String(el.tagName||'').toUpperCase();

    return tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT'||el.isContentEditable;
}

function isModalOpen(){
    return !!document.querySelector('.modal.visible');
}

document.addEventListener('pointerdown',function(e){
    if(!renamingInput)return;
    if(e.target===renamingInput)return;

    finishRename();
},true);

headerTitle.addEventListener('dblclick',function(e){
    e.preventDefault();
    e.stopPropagation();

    if(
        renamingInput||
        isTextEditingTarget(document.activeElement)||
        isModalOpen()
    )return;

    beginRenameProject();
});

undoButton.onclick=undo;
redoButton.onclick=redo;

confirmCancel.onclick=function(){
    finishConfirm(false);
};

confirmAccept.onclick=function(){
    finishConfirm(true);
};

confirmModal.addEventListener('click',function(e){
    if(e.target===confirmModal)finishConfirm(false);
});

document.getElementById('exportButton').onclick=function(){
    exportModal.classList.add('visible');
};

document.getElementById('importButton').onclick=function(){
    importModal.classList.add('visible');
};

document.getElementById('exportClose').onclick=function(){
    closeModal(exportModal);
};

document.getElementById('importClose').onclick=function(){
    closeModal(importModal);
};

[exportModal,importModal,loadChoiceModal,localProjectsModal].forEach(function(m){
    m.addEventListener('click',function(e){
        if(e.target===m)closeModal(m);
    });
});

document.addEventListener('keydown',function(e){
    if(confirmModal.classList.contains('visible')){
        if(e.key==='Enter'||e.key==='Escape'){
            e.preventDefault();
            finishConfirm(e.key==='Enter');
        }
        return;
    }

    if(isModalOpen()&&e.key==='Escape'){
        document.querySelectorAll('.modal.visible').forEach(function(m){
            m.classList.remove('visible');
        });
        return;
    }

    if(renamingInput){
        if(e.key==='Enter'){
            e.preventDefault();
            finishRename();
            return;
        }

        if(e.key==='Escape'){
            e.preventDefault();
            cancelRename();
            return;
        }
    }

    var mod=e.ctrlKey||e.metaKey;

    if(
        mod&&
        !isTextEditingTarget(document.activeElement)&&
        !isModalOpen()&&
        e.key.toLowerCase()==='z'
    ){
        e.preventDefault();

        if(e.shiftKey)redo();
        else undo();

        return;
    }

    if(
        mod&&
        !isTextEditingTarget(document.activeElement)&&
        !isModalOpen()&&
        e.key.toLowerCase()==='y'
    ){
        e.preventDefault();
        redo();
        return;
    }

    if(
        isTextEditingTarget(document.activeElement)||
        isModalOpen()||
        renamingInput
    )return;

    if(e.code==='KeyR'||String(e.key).toLowerCase()==='r'){
        if(selected.x!==null&&selected.y!==null){
            e.preventDefault();
            rotateBlock(selected.x,selected.y);
            return;
        }
    }

    if(selected.x===null||selected.y===null)return;

    if(e.key==='Delete'||e.key==='Backspace'){
        e.preventDefault();
        deleteBlock(selected.x,selected.y);
        return;
    }
});

document.getElementById('createNewButton').onclick=createNewProject;

document.getElementById('loadButton').onclick=function(){
    loadChoiceModal.classList.add('visible');
};

localProjectsAdd.onclick=function(){
    closeModal(localProjectsModal);
    createNewProject();
};

document.getElementById('loadChoiceClose').onclick=function(){
    closeModal(loadChoiceModal);
};

document.getElementById('localProjectsClose').onclick=function(){
    closeModal(localProjectsModal);
};

document.getElementById('loadImportButton').onclick=function(){
    closeModal(loadChoiceModal);
    importModal.classList.add('visible');
};

document.getElementById('loadLocalButton').onclick=function(){
    closeModal(loadChoiceModal);
    openLocalProjects();
};

createNewCancel.onclick=cancelCreateNew;

createNewConfirm.onclick=confirmCreateNew;

createNewModal.addEventListener('click',function(e){
    if(e.target===createNewModal)cancelCreateNew();
});

backButton.onclick=function(){
    commitProjectRenameIfNeeded();
    saveCurrentProject();

    app.style.display='none';
    startup.style.display='flex';
};

function enterEditor(){
    startup.style.display='none';
    app.style.display='flex';
    headerTitle.textContent=world.meta.name;
    buildTools();
    setMode('selector');
    buildWorld();
    simulation.rebuild();
    updateHistoryButtons();
}

function openCreateNewModal(){
    createNameInput.value='';
    createGridXInput.value='20';
    createGridYInput.value='20';

    createNewModal.classList.add('visible');

    setTimeout(function(){
        createNameInput.focus();
    },0);
}

function cancelCreateNew(){
    createNewModal.classList.remove('visible');
}

async function confirmCreateNew(){
    if(creatingNewProject)return;

    var name=String(createNameInput.value||'').trim();
    var w=parseInt(createGridXInput.value,10);
    var h=parseInt(createGridYInput.value,10);

    if(!name){
        alert('NAME IS REQUIRED');
        createNameInput.focus();
        return;
    }

    if(!Number.isFinite(w)||w<5||!Number.isFinite(h)||h<5){
        alert('GRID SIZE CANNOT BE LESS THAN 5 BY 5');
        return;
    }

    creatingNewProject=true;
    createNewConfirm.disabled=true;

    try{
        currentProjectKey=await createUniqueProjectKey();
        currentProjectCreatedAt=Date.now();

        world.meta.grid=[w,h];
        world.meta.name=name;
        world.layers=[createLayer('Layer 0')];

        activeLayer=0;
        selected.x=null;
        selected.y=null;

        clearHistory();
        enterEditor();

        await saveCurrentProject();

        setLocalProjectURL(name);
        cancelCreateNew();
    }catch(e){
        console.error(e);
        currentProjectKey=null;
        currentProjectCreatedAt=0;
        alert('CREATE FAILED:\\n'+e.message);
    }finally{
        creatingNewProject=false;
        createNewConfirm.disabled=false;
    }
}

function createNewProject(){
    openCreateNewModal();
}

function commitProjectRenameIfNeeded(){
    if(renamingInput&&renamingProject)finishRename();
}

window.addEventListener('beforeunload',function(){
    commitProjectRenameIfNeeded();
    saveCurrentProject();
});

document.addEventListener('visibilitychange',function(){
    if(document.visibilityState==='hidden'){
        commitProjectRenameIfNeeded();
        saveCurrentProject();
    }
});

async function loadLocalProjectByName(name){
    var wanted=String(name||'').trim();
    if(!wanted)return false;

    var projects=await readLocalProjects();

    for(var i=0;i<projects.length;i++){
        var item=projects[i];
        var projectName=String(
            item.record.world&&
            item.record.world.meta&&
            item.record.world.meta.name||
            ''
        );

        if(projectName===wanted){
            await loadStoredProject(item.key);
            return true;
        }
    }

    return false;
}

window.BinaryWorldLocalLoader={
    loadByName:loadLocalProjectByName
};
`;
