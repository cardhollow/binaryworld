(function(){
	'use strict';

	var clipboard = null;
	var selectedBlocks = new Set();
	var multiSelectMode = false;
	var worldData = null;
	var currentLayerIndex = 0;

	// Initialize keyboard event listeners
	function initKeyboardShortcuts() {
		document.addEventListener('keydown', function(e) {
			// Check if focus is on an input field
			var isInputFocused = document.activeElement.tagName === 'INPUT' || 
				document.activeElement.tagName === 'TEXTAREA';
			
			if (isInputFocused) return;

			// Multi-select mode toggle (Shift key)
			if (e.shiftKey) {
				multiSelectMode = true;
			}

			// Ctrl+C or Cmd+C - Copy
			if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
				e.preventDefault();
				copySelectedBlocks();
			}

			// Ctrl+X or Cmd+X - Cut
			if ((e.ctrlKey || e.metaKey) && e.key === 'x') {
				e.preventDefault();
				cutSelectedBlocks();
			}

			// Ctrl+V or Cmd+V - Paste
			if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
				e.preventDefault();
				pasteBlocks();
			}

			// Ctrl+A or Cmd+A - Select All
			if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
				e.preventDefault();
				selectAllBlocks();
			}

			// Escape - Deselect all
			if (e.key === 'Escape') {
				deselectAllBlocks();
			}
		});

		document.addEventListener('keyup', function(e) {
			if (!e.shiftKey) {
				multiSelectMode = false;
			}
		});

		// Add click listener for grid items
		document.addEventListener('click', function(e) {
			var blockElement = e.target.closest('[data-block-id]');
			if (blockElement) {
				var blockId = blockElement.getAttribute('data-block-id');
				if (multiSelectMode || e.shiftKey) {
					toggleBlockSelection(blockId);
				} else {
					selectBlock(blockId, false);
				}
			}
		}, true);
	}

	// Copy selected blocks to clipboard
	function copySelectedBlocks() {
		if (selectedBlocks.size === 0) {
			showNotification('No blocks selected');
			return;
		}

		var layer = getCurrentLayer();
		if (!layer) return;

		var blockData = [];
		selectedBlocks.forEach(function(blockId) {
			for (var i = 0; i < layer.schematic.length; i++) {
				var row = layer.schematic[i];
				if (row && row[blockId]) {
					blockData.push({
						id: blockId,
						type: row[blockId].type,
						x: row[blockId].x,
						y: row[blockId].y,
						rotation: row[blockId].rotation || 0,
						state: row[blockId].state || 0
					});
					break;
				}
			}
		});

		clipboard = {
			blocks: blockData,
			timestamp: Date.now(),
			type: 'binaryworld-blocks'
		};

		// Copy to system clipboard as JSON
		var binaryString = JSON.stringify(clipboard);
		if (navigator.clipboard && navigator.clipboard.writeText) {
			navigator.clipboard.writeText(binaryString).then(function() {
				showNotification('Copied ' + blockData.length + ' block(s) to clipboard');
			}).catch(function(err) {
				console.error('Failed to copy to clipboard:', err);
				showNotification('Copied ' + blockData.length + ' block(s)');
			});
		} else {
			showNotification('Copied ' + blockData.length + ' block(s)');
		}
	}

	// Cut selected blocks (copy + delete)
	function cutSelectedBlocks() {
		if (selectedBlocks.size === 0) {
			showNotification('No blocks selected');
			return;
		}

		copySelectedBlocks();
		
		var layer = getCurrentLayer();
		if (!layer) return;

		// Delete selected blocks from schematic
		var blocksToDelete = Array.from(selectedBlocks);
		blocksToDelete.forEach(function(blockId) {
			for (var i = 0; i < layer.schematic.length; i++) {
				var row = layer.schematic[i];
				if (row && row[blockId]) {
					delete row[blockId];
				}
			}
		});

		deselectAllBlocks();
		showNotification('Cut ' + blocksToDelete.length + ' block(s)');
		refreshGridDisplay();
	}

	// Paste blocks from clipboard
	function pasteBlocks() {
		if (!clipboard || !clipboard.blocks || clipboard.blocks.length === 0) {
			showNotification('Clipboard is empty');
			return;
		}

		var layer = getCurrentLayer();
		if (!layer) return;

		deselectAllBlocks();
		
		var offsetX = 20;
		var offsetY = 20;
		var pastedCount = 0;

		clipboard.blocks.forEach(function(blockData) {
			var newBlockId = 'block_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
			var newX = blockData.x + offsetX;
			var newY = blockData.y + offsetY;

			// Find or create row for new block
			var rowIndex = newY;
			while (rowIndex >= layer.schematic.length) {
				layer.schematic.push({});
			}

			var row = layer.schematic[rowIndex];
			if (!row) {
				row = {};
				layer.schematic[rowIndex] = row;
			}

			row[newBlockId] = {
				type: blockData.type,
				x: newX,
				y: newY,
				rotation: blockData.rotation || 0,
				state: blockData.state || 0
			};

			selectedBlocks.add(newBlockId);
			pastedCount++;
		});

		showNotification('Pasted ' + pastedCount + ' block(s)');
		refreshGridDisplay();
	}

	// Toggle block selection (for multi-select)
	function toggleBlockSelection(blockId) {
		if (selectedBlocks.has(blockId)) {
			deselectBlock(blockId);
		} else {
			selectBlock(blockId, true);
		}
	}

	// Select a single block
	function selectBlock(blockId, append) {
		if (!append && !multiSelectMode) {
			deselectAllBlocks();
		}

		selectedBlocks.add(blockId);
		updateBlockVisualState(blockId, true);
	}

	// Deselect a single block
	function deselectBlock(blockId) {
		selectedBlocks.delete(blockId);
		updateBlockVisualState(blockId, false);
	}

	// Select all blocks in current layer
	function selectAllBlocks() {
		var layer = getCurrentLayer();
		if (!layer) return;

		for (var i = 0; i < layer.schematic.length; i++) {
			var row = layer.schematic[i];
			if (row) {
				for (var blockId in row) {
					if (Object.prototype.hasOwnProperty.call(row, blockId)) {
						selectedBlocks.add(blockId);
						updateBlockVisualState(blockId, true);
					}
				}
			}
		}

		showNotification('Selected ' + selectedBlocks.size + ' block(s)');
	}

	// Deselect all blocks
	function deselectAllBlocks() {
		selectedBlocks.forEach(function(blockId) {
			updateBlockVisualState(blockId, false);
		});
		selectedBlocks.clear();
	}

	// Get selected blocks
	function getSelectedBlocks() {
		return Array.from(selectedBlocks);
	}

	// Update visual state of a block (highlight when selected)
	function updateBlockVisualState(blockId, isSelected) {
		var blockElement = document.querySelector('[data-block-id="' + blockId + '"]');
		if (blockElement) {
			if (isSelected) {
				blockElement.classList.add('selected');
				blockElement.style.opacity = '0.7';
				blockElement.style.boxShadow = '0 0 8px rgba(0, 255, 0, 0.8)';
			} else {
				blockElement.classList.remove('selected');
				blockElement.style.opacity = '1';
				blockElement.style.boxShadow = 'none';
			}
		}
	}

	// Get current layer from world data
	function getCurrentLayer() {
		if (!worldData || !worldData.layers) return null;
		return worldData.layers[currentLayerIndex] || null;
	}

	// Show notification to user
	function showNotification(message) {
		var notification = document.createElement('div');
		notification.className = 'editor-notification';
		notification.textContent = message;
		notification.style.cssText = 
			'position: fixed; bottom: 20px; right: 20px; background: #333; color: #0f0; ' +
			'padding: 10px 15px; border-radius: 4px; font-family: monospace; font-size: 12px; ' +
			'z-index: 10000; animation: fadeInOut 2s ease-in-out;';
		document.body.appendChild(notification);

		setTimeout(function() {
			notification.remove();
		}, 2000);
	}

	// Refresh grid display
	function refreshGridDisplay() {
		var gridElement = document.getElementById('grid');
		if (gridElement) {
			gridElement.innerHTML = '';
			renderCurrentLayer();
		}
	}

	// Render current layer (placeholder)
	function renderCurrentLayer() {
		var layer = getCurrentLayer();
		if (!layer) return;

		var gridElement = document.getElementById('grid');
		if (!gridElement) return;

		for (var i = 0; i < layer.schematic.length; i++) {
			var row = layer.schematic[i];
			if (row) {
				for (var blockId in row) {
					if (Object.prototype.hasOwnProperty.call(row, blockId)) {
						var block = row[blockId];
						var blockDiv = document.createElement('div');
						blockDiv.setAttribute('data-block-id', blockId);
						blockDiv.className = 'grid-block';
						blockDiv.style.cssText = 
							'position: absolute; width: 40px; height: 40px; ' +
							'left: ' + (block.x * 40) + 'px; top: ' + (block.y * 40) + 'px; ' +
							'background: #1a1a1a; border: 1px solid #0f0; cursor: pointer;';
						blockDiv.textContent = block.type;
						gridElement.appendChild(blockDiv);
					}
				}
			}
		}
	}

	// Set world data reference
	function setWorldData(data) {
		worldData = data;
	}

	// Set current layer index
	function setCurrentLayerIndex(index) {
		currentLayerIndex = index;
	}

	// Export functions for use in other modules
	window.BinaryWorldEditor = {
		init: initKeyboardShortcuts,
		selectBlock: selectBlock,
		deselectBlock: deselectBlock,
		selectAllBlocks: selectAllBlocks,
		deselectAllBlocks: deselectAllBlocks,
		getSelectedBlocks: getSelectedBlocks,
		copySelectedBlocks: copySelectedBlocks,
		cutSelectedBlocks: cutSelectedBlocks,
		pasteBlocks: pasteBlocks,
		setWorldData: setWorldData,
		setCurrentLayerIndex: setCurrentLayerIndex
	};

	// Auto-initialize on load
	window.initKeyboardShortcuts = initKeyboardShortcuts;
})();
