import app from './../app.js';
import config from './../config.js';
import Base_tools_class from './../core/base-tools.js';
import Base_layers_class from './../core/base-layers.js';

class Brush_class extends Base_tools_class {

	constructor(ctx) {
		super();
		this.Base_layers = new Base_layers_class();
		this.name = 'brush';
		this.layer = {};
		this.params_hash = false;
		this.pressure_supported = false;
		this.pointer_pressure = 0; // has range [0 - 1]
	}

	load() {
		var _this = this;

		//pointer events
		document.addEventListener('pointerdown', function (event) {
			_this.pointerdown(event);
		});
		document.addEventListener('pointermove', function (event) {
			_this.pointermove(event);
		});

		this.default_events();
	}

	dragMove(event) {
		if (config.TOOL.name != this.name)
			return;
		this.mousemove(event);
	}

	pointerdown(e) {
		if (e.pressure && e.pressure !== 0 && e.pressure !== 0.5 && e.pressure <= 1) {
			this.pressure_supported = true;
			this.pointer_pressure = e.pressure;
		} else {
			this.pressure_supported = false;
		}
	}

	pointermove(e) {
		if (this.pressure_supported && e.pressure < 1) {
			this.pointer_pressure = e.pressure;
		}
	}

	mousedown(e) {
		var mouse = this.get_mouse_info(e);
		if (mouse.click_valid == false)
			return;

		var params_hash = this.get_params_hash();
		var opacity = Math.round(config.ALPHA / 255 * 100);
		
		if (config.layer.type != this.name || params_hash != this.params_hash) {
			//register new object - current layer is not ours or params changed
			this.layer = {
				type: this.name,
				data: [],
				opacity: opacity,
				params: this.clone(this.getParams()),
				status: 'draft',
				render_function: [this.name, 'render'],
				x: 0,
				y: 0,
				width: config.WIDTH,
				height: config.HEIGHT,
				hide_selection_if_active: true,
				rotate: null,
				is_vector: true,
				color: config.COLOR
			};
			app.State.do_action(
				new app.Actions.Bundle_action('new_brush_layer', 'New Brush Layer', [
					new app.Actions.Insert_layer_action(this.layer)
				])
			);
			this.params_hash = params_hash;
		}
		else {
			//continue adding layer data, just register break
			const new_data = JSON.parse(JSON.stringify(config.layer.data));
			new_data.push(null);
			app.State.do_action(
				new app.Actions.Bundle_action('update_brush_layer', 'Update Brush Layer', [
					new app.Actions.Update_layer_action(config.layer.id, {
						data: new_data
					})
				])
			);
		}
	}

	mousemove(e) {
		var mouse = this.get_mouse_info(e);
		var params = this.getParams();
		if (mouse.is_drag == false)
			return;
		if (mouse.click_valid == false) {
			return;
		}

		var size = params.size;
		var new_size = size;

		if (params.pressure == true && this.pressure_supported) {
			new_size = size * this.pointer_pressure * 2;
		}

		config.layer.data.push([
			Math.ceil(mouse.x - config.layer.x),
			Math.ceil(mouse.y - config.layer.y),
			new_size
		]);
		this.Base_layers.render();
	}

	mouseup(e) {
		var mouse = this.get_mouse_info(e);
		var params = this.getParams();
		if (mouse.click_valid == false) {
			config.layer.status = null;
			return;
		}

		var size = params.size;
		var new_size = size;

		if (params.pressure == true && this.pressure_supported) {
			new_size = size * this.pointer_pressure * 2;
		}

		config.layer.data.push([
			Math.ceil(mouse.x - config.layer.x),
			Math.ceil(mouse.y - config.layer.y),
			new_size
		]);

		this.check_dimensions();

		config.layer.status = null;
		this.Base_layers.render();
	}

	render(ctx, layer) {
		if (layer.data.length == 0)
			return;

		var params = layer.params;
		var data = layer.data;
		var n = data.length;
		var size = params.size;

		ctx.save();
		ctx.fillStyle = layer.color;
		ctx.strokeStyle = layer.color;
		ctx.lineWidth = params.size;
		ctx.lineCap = 'round';
		ctx.lineJoin = 'round';

		ctx.translate(layer.x, layer.y);

		ctx.beginPath();
		ctx.moveTo(data[0][0], data[0][1]);
		for (var i = 1; i < n; i++) {
			if (data[i] === null) {
				//break
				ctx.beginPath();
			}
			else {
				//line
				ctx.lineWidth = data[i][2];

				if (data[i - 1] == null && data[i + 1] == null) {
					//exception - point
					ctx.arc(data[i][0], data[i][1], size / 2, 0, 2 * Math.PI, false);
					ctx.fill();
				}
				else if (data[i - 1] != null) {
					//lines
					ctx.beginPath();
					ctx.moveTo(data[i - 1][0], data[i - 1][1]);
					ctx.lineTo(data[i][0], data[i][1]);
					ctx.stroke();
				}
			}
		}
		if (n == 1 || data[1] == null) {
			//point
			ctx.beginPath();
			ctx.arc(data[0][0], data[0][1], size / 2, 0, 2 * Math.PI, false);
			ctx.fill();
		}

		ctx.translate(-layer.x, -layer.y);
		ctx.restore();
	}

	check_dimensions() {
		if (config.layer.data.length == 0)
			return;

		var data = JSON.parse(JSON.stringify(config.layer.data)); // Deep copy for history

		var min_x = data[0][0];
		var min_y = data[0][1];
		var max_x = data[0][0];
		var max_y = data[0][1];
		for (var i in data) {
			if (data[i] === null)
				continue;
			min_x = Math.min(min_x, data[i][0]);
			min_y = Math.min(min_y, data[i][1]);
			max_x = Math.max(max_x, data[i][0]);
			max_y = Math.max(max_y, data[i][1]);
		}

		for (var i in data) {
			if (data[i] === null)
				continue;
			data[i][0] = data[i][0] - min_x;
			data[i][1] = data[i][1] - min_y;
		}

		app.State.do_action(
			new app.Actions.Update_layer_action(config.layer.id, {
				x: config.layer.x + min_x,
				y: config.layer.y + min_y,
				width: max_x - min_x,
				height: max_y - min_y,
				data
			}),
			{
				merge_with_history: ['new_brush_layer', 'update_brush_layer']
			}
		);
	}

}

export default Brush_class;
