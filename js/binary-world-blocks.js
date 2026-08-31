window.__BinaryWorldSourceParts = window.__BinaryWorldSourceParts || [];

window.__BinaryWorldSourceParts[0] = `
(function(){
	'use strict';

	var blocks = {
		node: {
			id: 'A',
			name: 'Node',
			ports: {
				inputs: [
					{id: 'top', side: 'top'},
					{id: 'right', side: 'right'},
					{id: 'bottom', side: 'bottom'},
					{id: 'left', side: 'left'}
				],
				outputs: []
			},
			zInput: true,

			function: function(ctx){
				return {
					state:
						ctx.inputs.top === 1 ||
						ctx.inputs.right === 1 ||
						ctx.inputs.bottom === 1 ||
						ctx.inputs.left === 1 ||
						ctx.inputs.z === 1
							? 1
							: 0,
					outputs: {},
					zOutputs: {}
				};
			},

			display: function(ctx){
				return '<div class="blockVisual">' +
					'<div class="nodeVisual ' + (ctx.state ? 'on' : '') + '"></div>' +
					'<div class="nodePort top ' + (ctx.inputs.top === 1 ? 'active' : '') + '"></div>' +
					'<div class="nodePort right ' + (ctx.inputs.right === 1 ? 'active' : '') + '"></div>' +
					'<div class="nodePort bottom ' + (ctx.inputs.bottom === 1 ? 'active' : '') + '"></div>' +
					'<div class="nodePort left ' + (ctx.inputs.left === 1 ? 'active' : '') + '"></div>' +
				'</div>';
			}
		},

		input: {
			id: 'B',
			name: 'Input',
			ports: {
				inputs: [],
				outputs: [
					{id: 'out', side: 'right'}
				]
			},

			function: function(ctx){
				return {
					state: ctx.pressed ? 1 : 0,
					outputs: {
						out: ctx.pressed ? 1 : 0
					},
					zOutputs: {}
				};
			},

			display: function(ctx){
				return '<div class="blockVisual">' +
					'<div class="inputOutputLine"></div>' +
					'<div class="inputCircle ' + (ctx.pressed ? 'on' : '') + '"></div>' +
					'<div class="inputOutputPort ' + (ctx.outputs.out === 1 ? 'active' : '') + '"></div>' +
				'</div>';
			}
		},

		comparator: {
			id: 'C',
			name: 'Comparator',

			ports: {
				inputs: [
					{id: 'a', side: 'left'},
					{id: 'b', side: 'top'}
				],
				outputs: [
					{id: 'out', side: 'right'}
				]
			},

			function: function(ctx){
				var a = ctx.inputs.a === 1;
				var b = ctx.inputs.b === 1;

				/*
					AND:
					Output is 1 ONLY when both A and B are powered.

					A B -> OUT
					0 0 -> 0
					0 1 -> 0
					1 0 -> 0
					1 1 -> 1
				*/

				var state = a && b;

				return {
					state: state ? 1 : 0,
					outputs: {
						out: state ? 1 : 0
					},
					zOutputs: {}
				};
			},

			display: function(ctx){
				return '<div class="comparatorVisual">' +
					'<div class="comparatorInputLine"></div>' +
					'<div class="comparatorTopLine"></div>' +
					'<div class="comparatorOutputLine"></div>' +

					/* A input - left */
					'<div class="inputPort comparatorInputLeft ' +
						(ctx.inputs.a === 1 ? 'active' : '') +
					'"></div>' +

					/* B input - top */
					'<div class="inputPort comparatorInputTop ' +
						(ctx.inputs.b === 1 ? 'active' : '') +
					'"></div>' +

					/* Output - right */
					'<div class="outputPort comparatorOutput ' +
						(ctx.outputs.out === 1 ? 'active' : '') +
					'"></div>' +

					'<div class="comparatorBody"></div>' +
				'</div>';
			}
		},

		inverter: {
			id: 'D',
			name: 'Inverter',
			ports: {
				inputs: [
					{id: 'in', side: 'left'}
				],
				outputs: [
					{id: 'out', side: 'right'}
				]
			},

			function: function(ctx){
				var input = ctx.connected.in ? ctx.inputs.in : 0;
				var state = input === 1 ? 0 : 1;

				return {
					state: state,
					outputs: {
						out: state
					},
					zOutputs: {}
				};
			},

			display: function(ctx){
				return '<div class="inverterVisual">' +
					'<div class="line horizontal"></div>' +
					'<div class="inputPort inputLeft ' +
						(ctx.inputs.in === 1 ? 'active' : '') +
					'"></div>' +
					'<div class="inverterTriangle"></div>' +
					'<div class="inverterCircle ' +
						(ctx.outputs.out === 1 ? 'active' : '') +
					'"></div>' +
				'</div>';
			}
		},

		connector: {
			id: 'E',
			name: 'Connector',
			ports: {
				inputs: [
					{id: 'in', side: 'left'}
				],
				outputs: [
					{id: 'out', side: 'right'}
				]
			},

			function: function(ctx){
				var state = ctx.connected.in ? ctx.inputs.in : 0;

				return {
					state: state,
					outputs: {
						out: state
					},
					zOutputs: {}
				};
			},

			display: function(ctx){
				return '<div class="connectorVisual">' +
					'<div class="line horizontal"></div>' +
					'<div class="inputPort inputLeft ' +
						(ctx.inputs.in === 1 ? 'active' : '') +
					'"></div>' +
					'<div class="outputPort outputRight ' +
						(ctx.outputs.out === 1 ? 'active' : '') +
					'"></div>' +
				'</div>';
			}
		},

		delayer: {
			id: 'F',
			name: 'Delayer',
			ports: {
				inputs: [
					{id: 'in', side: 'left'}
				],
				outputs: [
					{id: 'out', side: 'right'}
				]
			},

			function: function(ctx){
				var input = ctx.connected.in ? ctx.inputs.in : 0;
				var output = ctx.runtime.outputs.out === 1 ? 1 : 0;

				return {
					state: output,
					outputs: {
						out: input
					},
					zOutputs: {},
					delay: 500
				};
			},

			display: function(ctx){
				return '<div class="delayerVisual">' +
					'<div class="line horizontal"></div>' +
					'<div class="inputPort inputLeft ' +
						(ctx.inputs.in === 1 ? 'active' : '') +
					'"></div>' +
					'<div class="delayerBox ' +
						(ctx.outputs.out === 1 ? 'active' : '') +
					'"></div>' +
					'<div class="outputPort outputRight ' +
						(ctx.outputs.out === 1 ? 'active' : '') +
					'"></div>' +
				'</div>';
			}
		},

		passer: {
			id: 'G',
			name: 'Passer',
			ports: {
				inputs: [
					{id: 'in', side: 'left'}
				],
				outputs: [
					{id: 'out', side: 'right'}
				]
			},
			zInput: true,
			zOutputs: [
				{id: 'up'},
				{id: 'down'}
			],

			function: function(ctx){
				var local = ctx.connected.in && ctx.inputs.in === 1;
				var up = ctx.inputs.zUp === 1;
				var down = ctx.inputs.zDown === 1;

				var direction = ctx.runtime.zBlock || null;

				if (direction === 'upper' && !up) {
					direction = null;
				} else if (direction === 'lower' && !down) {
					direction = null;
				} else if (direction === 'both' && !up && !down) {
					direction = null;
				}

				if (!direction) {
					if (up && down) {
						direction = 'both';
					} else if (up) {
						direction = 'upper';
					} else if (down) {
						direction = 'lower';
					} else if (local) {
						direction = 'both';
					}
				}

				var state = local || up || down ? 1 : 0;

				var zUp = 0;
				var zDown = 0;

				if (direction === 'upper') {
					zUp = state;
				} else if (direction === 'lower') {
					zDown = state;
				} else if (direction === 'both') {
					zUp = state;
					zDown = state;
				}

				if (!state) {
					direction = null;
				}

				ctx.runtime.zBlock = direction;

				return {
					state: state,
					outputs: {
						out: state
					},
					zOutputs: {
						up: zUp,
						down: zDown
					}
				};
			},

			display: function(ctx){
				return '<div class="passerVisual">' +
					'<div class="passerInputLine"></div>' +
					'<div class="inputPort inputLeft ' +
						(ctx.inputs.in === 1 ? 'active' : '') +
					'"></div>' +
					'<div class="passerCircle ' +
						(ctx.state === 1 ? 'active' : '') +
					'"></div>' +
					'<div class="passerOutputLine"></div>' +
					'<div class="passerOutput ' +
						(ctx.outputs.out === 1 ? 'active' : '') +
					'"></div>' +
				'</div>';
			}
		},

		latch: {
			id: 'H',
			name: 'Latch',
			ports: {
				inputs: [
					{id: 'signal', side: 'left'},
					{id: 'opener', side: 'top'}
				],
				outputs: [
					{id: 'out', side: 'right'}
				]
			},

			function: function(ctx){
				var opener =
					ctx.connected.opener &&
					ctx.inputs.opener === 1;

				var signal =
					ctx.connected.signal
						? ctx.inputs.signal
						: 0;

				var state =
					opener
						? signal
						: ctx.state;

				return {
					state: state,
					outputs: {
						out: state
					},
					zOutputs: {}
				};
			},

			display: function(ctx){
				return '<div class="latchVisual">' +
					'<div class="latchInputLine"></div>' +
					'<div class="latchTopLine"></div>' +
					'<div class="latchOutputLine"></div>' +
					'<div class="inputPort inputLeft ' +
						(ctx.inputs.signal === 1 ? 'active' : '') +
					'"></div>' +
					'<div class="inputPort latchInputTop ' +
						(ctx.inputs.opener === 1 ? 'active' : '') +
					'"></div>' +
					'<div class="outputPort latchOutput ' +
						(ctx.outputs.out === 1 ? 'active' : '') +
					'"></div>' +
					'<div class="latchTriangle"></div>' +
				'</div>';
			}
		}
	};

`;
