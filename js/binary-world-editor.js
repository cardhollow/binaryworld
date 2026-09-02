window.__BinaryWorldSourceParts = window.__BinaryWorldSourceParts || [];
window.__BinaryWorldSourceParts[8] = `
(function(){
	'use strict';

	var clipboard = null;
	var selectedBlocks = new Set();
	var multiSelectMode = false;

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

			// Ctrl+C - Copy
			if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
				e.preventDefault();
				copySelectedBlocks();
			}

			// Ctrl+X - Cut
			if ((e.ctrlKey || e.metaKey) && e.key === 'x') {
				e.preventDefault();
				cutSelectedBlocks();
			}

			// Ctrl+V - Paste
			if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
				e.preventDefault();
				pasteBlocks();
			}

			// Ctrl+A - Select All
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
	}

	// Copy selected blocks to clipboard
	function copySelectedBlocks() {
		if (selectedBlocks.size === 0) {
			console.log('No blocks selected');
			return;
		}

		var blockData = Array.from(selectedBlocks).map(function(blockId) {
			var block = getBlockById(blockId);
			return {
				id: blockId,
				type: block.type,
				x: block.x,
				y: block.y,
				layer: block.layer,
				data: block.data || {}
			};
		});

		clipboard = {
			blocks: blockData,
			timestamp: Date.now(),
			type: 'binaryworld-blocks'
		};

		// Copy binary representation to system clipboard
		var binaryString = JSON.stringify(clipboard);
		navigator.clipboard.writeText(binaryString).then(function() {
			console.log('Blocks copied to clipboard');
			showNotification('Copied ' + selectedBlocks.size + ' block(s)');
		}).catch(function(err) {
			console.error('Failed to copy to clipboard:', err);
		});
	}

	// Cut selected blocks (copy + delete)
	function cutSelectedBlocks() {
		if (selectedBlocks.size === 0) {
			console.log('No blocks selected');
			return;
		}

		copySelectedBlocks();
		
		// Delete selected blocks
		Array.from(selectedBlocks).forEach(function(blockId) {
			deleteBlockById(blockId);
		});

		selectedBlocks.clear();
		showNotification('Cut ' + selectedBlocks.size + ' block(s)');
	}

	// Paste blocks from clipboard
	function pasteBlocks() {
		if (!clipboard || !clipboard.blocks || clipboard.blocks.length === 0) {
			console.log('Clipboard is empty');
			return;
		}

		deselectAllBlocks();
		
		var offsetX = 20;
		var offsetY = 20;

		clipboard.blocks.forEach(function(blockData, index) {
			var newBlock = {
				id: generateBlockId(),
				type: blockData.type,
				x: blockData.x + offsetX,
				y: blockData.y + offsetY,
				layer: blockData.layer,
				data: JSON.parse(JSON.stringify(blockData.data || {}))
			};

			addBlockToWorld(newBlock);
			selectedBlocks.add(newBlock.id);
		});

		showNotification('Pasted ' + clipboard.blocks.length + ' block(s)');
		renderWorld();
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
		var currentLayer = getCurrentLayer();
		if (!currentLayer) return;

		currentLayer.blocks.forEach(function(block) {
			selectedBlocks.add(block.id);
			updateBlockVisualState(block.id, true);
		});

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
			} else {
				blockElement.classList.remove('selected');
			}
		}
	}

	// Get block by ID (placeholder - implement based on your world structure)
	function getBlockById(blockId) {
		// This should be implemented based on your world data structure
		// For now, returns a placeholder
		return {
			id: blockId,
			type: 'node',
			x: 0,
			y: 0,
			layer: 0,
			data: {}
		};
	}

	// Delete block by ID (placeholder)
	function deleteBlockById(blockId) {
		// This should be implemented based on your world data structure
		console.log('Deleting block:', blockId);
	}

	// Add block to world (placeholder)
	function addBlockToWorld(blockData) {
		// This should be implemented based on your world data structure
		console.log('Adding block:', blockData);
	}

	// Get current layer (placeholder)
	function getCurrentLayer() {
		// This should be implemented based on your world data structure
		return null;
	}

	// Generate unique block ID
	function generateBlockId() {
		return 'block_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
	}

	// Show notification to user
	function showNotification(message) {
		var notification = document.createElement('div');
		notification.className = 'notification';
		notification.textContent = message;
		document.body.appendChild(notification);

		setTimeout(function() {
			notification.remove();
		}, 2000);
	}

	// Render/update the world view
	function renderWorld() {
		// This should be implemented based on your rendering system
		console.log('Rendering world');
	}

	// Export functions for use in other modules
	window.BinaryWorldEditor = {
		initKeyboardShortcuts: initKeyboardShortcuts,
		selectBlock: selectBlock,
		deselectBlock: deselectBlock,
		selectAllBlocks: selectAllBlocks,
		deselectAllBlocks: deselectAllBlocks,
		getSelectedBlocks: getSelectedBlocks,
		copySelectedBlocks: copySelectedBlocks,
		cutSelectedBlocks: cutSelectedBlocks,
		pasteBlocks: pasteBlocks
	};
})();
`;
