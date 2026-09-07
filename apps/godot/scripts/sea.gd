extends Node2D

const Painter = preload("res://scripts/world_painter.gd")
const Effects = preload("res://scripts/effects.gd")
const UNIT = 24.0
var bridge: JavaScriptObject
var snapshot: Dictionary = {}
var camera: Camera2D
var world: Node2D
var effects: Node2D
var water: ColorRect
var frames: int = 0
var poll_time: float = 0.0
var drag_origin := Vector2.ZERO
var dragging := false
var has_camera := false
var last_event: int = -1
var last_epoch: int = -1

func _ready() -> void:
	var layer := CanvasLayer.new()
	layer.layer = -10
	add_child(layer)
	water = ColorRect.new()
	water.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	water.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var material := ShaderMaterial.new()
	material.shader = preload("res://shaders/ocean.gdshader")
	water.material = material
	layer.add_child(water)
	world = Painter.new()
	add_child(world)
	effects = Effects.new()
	add_child(effects)
	camera = Camera2D.new()
	camera.position_smoothing_enabled = false
	add_child(camera)
	if OS.has_feature("web"):
		bridge = JavaScriptBridge.get_interface("window").parent.__STARLING_BRIDGE__
		if bridge:
			bridge.ready("Godot " + Engine.get_version_info().string)

func _process(delta: float) -> void:
	frames += 1
	poll_time += delta
	if bridge and poll_time >= 1.0 / 30.0:
		poll_time = 0.0
		var raw = bridge.snapshot()
		if raw:
			var parsed = JSON.parse_string(raw)
			if parsed is Dictionary and parsed.has("ship"):
				snapshot = parsed
				world.set_snapshot(snapshot)
				var epoch := int(snapshot.get("epoch", 0))
				if epoch != last_epoch:
					last_epoch = epoch
					last_event = -1
				for event in snapshot.get("events", []):
					if int(event.id) > last_event:
						effects.add_event(event)
						last_event = int(event.id)
	if snapshot.is_empty():
		return
	var ship: Dictionary = snapshot.ship
	var target := Vector2(float(ship.x), -float(ship.y)) * UNIT
	var span := get_viewport_rect().size
	var map_open := bool(snapshot.get("mapView", false))
	var zoom_target := minf(0.48, minf(span.x / (124.0 * UNIT), span.y * 0.62 / (116.0 * UNIT))) if map_open else 1.0
	camera.zoom = camera.zoom.lerp(Vector2.ONE * zoom_target, 1.0 - exp(-delta * 7.0))
	if map_open:
		target = Vector2.ZERO
	else:
		target += Vector2(float(ship.vx), -float(ship.vy)) * UNIT * 0.65
		target.y += span.y * 0.035
	if not has_camera:
		camera.position = target
		has_camera = true
	else:
		camera.position = camera.position.lerp(target, 1.0 - exp(-delta * 5.0))
	water.size = span
	water.material.set_shader_parameter("camera_world", camera.position / UNIT)
	water.material.set_shader_parameter("world_span", span / UNIT / camera.zoom)
	water.material.set_shader_parameter("region", 1.0 if snapshot.region == "space" else 2.0 if snapshot.region == "jungle" else 0.0)
	water.material.set_shader_parameter("storm", float(snapshot.weather.intensity))
	water.material.set_shader_parameter("motion", 0.0 if snapshot.get("reducedMotion", false) else 1.0)
	effects.reduced_motion = bool(snapshot.get("reducedMotion", false))
	if bridge and frames % 30 == 0:
		bridge.metrics(frames, Engine.get_frames_per_second(), span.x / UNIT / camera.zoom.x)

func _input(event: InputEvent) -> void:
	if not bridge:
		return
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT:
		dragging = event.pressed
		drag_origin = event.position
		if not dragging:
			bridge.steer(0.0, 0.0)
	if event is InputEventMouseMotion and dragging:
		var direction: Vector2 = (event.position - drag_origin) / 110.0
		direction = direction.limit_length(1.0)
		bridge.steer(direction.x, -direction.y)
	if event is InputEventKey:
		if event.keycode in [KEY_W, KEY_A, KEY_S, KEY_D, KEY_UP, KEY_DOWN, KEY_LEFT, KEY_RIGHT]:
			var x := float(Input.is_physical_key_pressed(KEY_D) or Input.is_physical_key_pressed(KEY_RIGHT)) - float(Input.is_physical_key_pressed(KEY_A) or Input.is_physical_key_pressed(KEY_LEFT))
			var y := float(Input.is_physical_key_pressed(KEY_W) or Input.is_physical_key_pressed(KEY_UP)) - float(Input.is_physical_key_pressed(KEY_S) or Input.is_physical_key_pressed(KEY_DOWN))
			bridge.steer(x, y)
