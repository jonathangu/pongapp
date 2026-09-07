extends Node2D

const UNIT := 24.0
const SHIP = preload("res://assets/starling-deck-v2.png")
const SURVEY_SHIP = preload("res://assets/royal-survey-ship.png")
const ISLAND = preload("res://assets/island.png")
const WILD_ISLAND = preload("res://assets/wild-island.png")
const MANTA = preload("res://assets/manta.png")
const ENEMIES = {
	"moth": preload("res://assets/glasswing.webp"),
	"beetle": preload("res://assets/ram-beetle.webp"),
	"jelly": preload("res://assets/jelly.webp"),
	"needle": preload("res://assets/needle.webp"),
	"sentinel": preload("res://assets/sentinel.webp"),
	"guardian": preload("res://assets/guardian.webp")
}
const COLORS = {
	"mint": Color("#8effd5"), "coral": Color("#ff8d83"), "gold": Color("#ffe38a"),
	"violet": Color("#bbabff"), "sky": Color("#8be4ff"), "rose": Color("#ffafe0"),
	"lime": Color("#ccf98c"), "pearl": Color("#fff3d6")
}
var state: Dictionary = {}
var clock := 0.0
var ship_position := Vector2.ZERO
var entity_positions: Dictionary = {}
var font: Font

func _ready() -> void:
	font = ThemeDB.fallback_font
	texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS

func set_snapshot(value: Dictionary) -> void:
	if state.is_empty() or state.get("epoch") != value.get("epoch"):
		ship_position = point(value.ship)
		entity_positions.clear()
	state = value

func _process(delta: float) -> void:
	clock += delta
	if not state.is_empty():
		ship_position = ship_position.lerp(point(state.ship), 1.0 - exp(-delta * 24.0))
	queue_redraw()

func point(value: Dictionary) -> Vector2:
	return Vector2(float(value.x), -float(value.y)) * UNIT

func label(text: String, at: Vector2, color := Color("#d5eeeb"), size := 30) -> void:
	var width := font.get_string_size(text, HORIZONTAL_ALIGNMENT_LEFT, -1, size).x
	draw_string_outline(font, at - Vector2(width / 2.0, 0), text, HORIZONTAL_ALIGNMENT_LEFT, -1, size, 6, Color("#092630"))
	draw_string(font, at - Vector2(width / 2.0, 0), text, HORIZONTAL_ALIGNMENT_LEFT, -1, size, color)

func ring(at: Vector2, radius: float, color: Color, width := 3.0) -> void:
	draw_arc(at, radius, 0.0, TAU, 48, color, width, true)

func sprite(texture: Texture2D, at: Vector2, size: Vector2, angle := 0.0, color := Color.WHITE) -> void:
	draw_set_transform(at, angle)
	draw_texture_rect(texture, Rect2(-size / 2.0, size), false, color)
	draw_set_transform(Vector2.ZERO)

func _draw() -> void:
	if state.is_empty():
		return
	# World edges are visible and gently patterned, never invisible walls.
	draw_rect(Rect2(Vector2(-56, -52) * UNIT, Vector2(112, 104) * UNIT), Color(0.4, 0.78, 0.77, 0.2), false, 6.0)
	var reduced: bool = state.get("reducedMotion", false)
	var time: float = 0.0 if reduced else clock
	for i in range(42):
		var x := fmod(float(i * 137) + time * 4.0, 2688.0) - 1344.0
		var y := float((i * 251) % 2496) - 1248.0
		var start := Vector2(x, y)
		draw_line(start, start + Vector2(19 + i % 4 * 5, -2), Color(0.5, 0.9, 0.85, 0.075), 2.0, true)
	# Obstacles have a consistent physical footprint; different heights add depth.
	for obstacle in state.world.obstacles:
		var at := point(obstacle)
		var radius: float = obstacle.radius * UNIT
		var style: int = int(obstacle.style)
		draw_circle(at + Vector2(8, 15), radius * 1.08, Color(0.005, 0.06, 0.09, 0.42), true, -1, true)
		ring(at, radius + 9 + sin(time + float(obstacle.id)) * 2, Color(0.4, 0.93, 0.86, 0.15), 5.0)
		if state.region != "space":
			var tint := Color("#b5e2be") if state.region == "jungle" else Color("#bcd8d1") if style % 2 == 0 else Color.WHITE
			sprite(WILD_ISLAND, at + Vector2(0, -radius * 0.28), Vector2(radius * 2.5, radius * 2.5), float(style % 3 - 1) * 0.07, tint)
		else:
			var points := PackedVector2Array()
			for j in range(9):
				var a := float(j) / 9.0 * TAU
				points.append(at + Vector2.from_angle(a) * radius * (0.9 + 0.08 * sin(float(j * 17 + style))))
			draw_colored_polygon(points, Color("#434564") if style % 2 == 0 else Color("#514168"))
			for j in range(5):
				var a := float(j) / 5.0 * TAU + float(style)
				var crystal := at + Vector2.from_angle(a) * radius * 0.38
				draw_colored_polygon(PackedVector2Array([crystal + Vector2(-radius * 0.18, radius * 0.2), crystal + Vector2(0, -radius * 0.65), crystal + Vector2(radius * 0.21, radius * 0.12)]), Color("#8ca2ad") if j % 2 == 0 else Color("#ad98c3"))
	# Docks are destinations, with generous readable labels.
	for dock in state.docks:
		var at := point(dock)
		if state.region == "space" or state.region == "sky":
			# Orbital and sky docks are built platforms, not ocean islands.
			draw_rect(Rect2(at - Vector2(95, 70), Vector2(190, 140)), Color("#244655"))
			draw_rect(Rect2(at - Vector2(95, 70), Vector2(190, 140)), Color("#b69867"), false, 5.0)
			for side in [-1, 1]:
				draw_rect(Rect2(at + Vector2(side * 130 - 25, -45), Vector2(50, 90)), Color("#456d86"))
				draw_line(at + Vector2(side * 95, 0), at + Vector2(side * 130, 0), Color("#b69867"), 8.0)
			ring(at, 43, Color("#94e2e5"), 5.0)
		else:
			sprite(ISLAND, at - Vector2(0, 65), Vector2(260, 260))
		ring(at, 115.0, Color(0.55, 0.9, 0.83, 0.24), 3.0)
		label(dock.name, at + Vector2(0, 104), Color("#bae8d3"), 28)
	# Return beacon remains visible, inactive until its rescue requirements are met.
	var portal := point(state.world.portal)
	var odyssey: Dictionary = state.get("odyssey", {})
	var ready: bool = state.guardianDefeated
	var portal_color := Color("#a6ffe0") if ready else Color("#7797b1")
	for i in range(3):
		ring(portal, 56.0 + float(i) * 14.0 + sin(time * 1.6 + float(i)) * 4.0, Color(portal_color, 0.2 + float(i) * 0.12), 4.0)
	draw_circle(portal, 25.0, Color(portal_color, 0.14), true, -1, true)
	var beacon_name := "HOME" if ready else "RETURN BEACON"
	if not odyssey.is_empty():
		beacon_name = "CLOUDBREAK" if odyssey.stage == "sky" else "THE FORBIDDEN GATE" if odyssey.stage == "gate" else "FOLLOW THE GOLDEN WINGS"
		if odyssey.stage == "gate":
			for i in range(12):
				var a := float(i) / 12.0 * TAU + time * 0.025
				var moon := portal + Vector2.from_angle(a) * 145.0
				draw_circle(moon, 20.0 + float(i % 3) * 5.0, Color("#272636"), true, -1, true)
				draw_arc(moon, 21.0, a, a + PI, 18, Color("#8f5970"), 3.0, true)
			ring(portal, 132.0, Color("#68d0f4"), 5.0)
		elif odyssey.stage == "inner":
			draw_golden_wings(portal + Vector2(0, -90.0 + sin(time) * 8.0), time)
	label(beacon_name, portal + Vector2(0, 117), Color("#f3dc99") if not odyssey.is_empty() else portal_color, 26)
	for gift in state.world.gifts:
		if gift.opened:
			continue
		var at := point(gift) + Vector2(0, sin(time * 2.0 + float(gift.id)) * 4.0)
		draw_circle(at, 23.0, Color(0.6, 0.9, 0.75, 0.12), true, -1, true)
		var diamond := PackedVector2Array([at + Vector2(0, -15), at + Vector2(13, 0), at + Vector2(0, 15), at + Vector2(-13, 0)])
		draw_colored_polygon(diamond, Color("#aeffe2") if gift.kind == "power" else Color("#b4afff") if gift.kind == "beam" else Color("#ffcc81"))
		draw_polyline(PackedVector2Array([diamond[0], diamond[1], diamond[2], diamond[3], diamond[0]]), Color("#fff0cd"), 2.0, true)
	for cage in state.world.cages:
		if cage.rescued:
			continue
		draw_cage(cage, time)
	for vessel in state.vessels:
		if vessel.disabled:
			continue
		var at := point(vessel.ship)
		if vessel.role == "raider":
			sprite(MANTA, at, Vector2(260, 175), -atan2(float(vessel.ship.vy), float(vessel.ship.vx)))
		else:
			draw_ship(at, vessel.ship, vessel.stations, vessel.crew, Color("#b3d0f1") if vessel.role == "merchant" else Color("#c2edcb"), false)
		label(vessel.name, at + Vector2(0, 168), Color("#e5dac4") if vessel.role != "raider" else Color("#ffad98"), 26)
	for enemy in state.enemies:
		draw_enemy(enemy, time)
	draw_ship(ship_position, state.ship, state.stations, state.crew, Color.WHITE, true)
	for bullet in state.bullets:
		var at := point(bullet)
		var velocity := Vector2(float(bullet.vx), -float(bullet.vy)).normalized()
		var color := Color("#ff877b") if bullet.enemy else Color("#bcffef")
		var radius := maxf(4.0, float(bullet.radius) * UNIT)
		draw_line(at - velocity * (24.0 if bullet.enemy else 38.0), at, Color(color, 0.27), radius * 2.6, true)
		draw_circle(at, radius + 4, Color(color, 0.13), true, -1, true)
		draw_circle(at, radius, color, true, -1, true)
		draw_circle(at - velocity * 2.0, radius * 0.45, Color("#fff8de"), true, -1, true)
	if state.weather.strike:
		var strike := point(state.weather.strike)
		ring(strike, 72, Color("#ffde82"), 4.0)
		label("LIGHTNING", strike - Vector2(0, 90), Color("#ffe9a8"), 26)

func draw_cage(cage: Dictionary, time: float) -> void:
	var at := point(cage)
	var open: bool = cage.open
	var bob := sin(time * 2.0 + float(cage.id)) * 4.0
	var gold := Color("#ffdaa0") if not open else Color("#adffd9")
	draw_circle(at, 57.0, Color(gold, 0.09), true, -1, true)
	ring(at, 49.0 + sin(time * 2.0) * 4.0, Color(gold, 0.25), 3.0)
	draw_set_transform(at + Vector2(0, bob))
	if not open:
		draw_style_box(cage_style(), Rect2(-28, -39, 56, 69))
		draw_arc(Vector2(0, -39), 28.0, PI, TAU, 20, gold, 4, true)
		for x in [-17, 0, 17]:
			draw_line(Vector2(x, -47), Vector2(x, 30), Color(gold, 0.72), 3.0, true)
	draw_circle(Vector2(0, 0), 14, Color("#fff0cf"), true, -1, true)
	draw_circle(Vector2(-10, -12), 6, Color("#f5bc89"), true, -1, true)
	draw_circle(Vector2(10, -12), 6, Color("#f5bc89"), true, -1, true)
	draw_circle(Vector2(-5, -2), 2.5, Color("#183b43"), true, -1, true)
	draw_circle(Vector2(5, -2), 2.5, Color("#183b43"), true, -1, true)
	draw_set_transform(Vector2.ZERO)
	label("PICK UP" if open else "RESCUE", at + Vector2(0, 77), gold, 29)
	if not open:
		draw_line(at + Vector2(-26, 45), at + Vector2(26, 45), Color("#193e48"), 6, true)
		draw_line(at + Vector2(-26, 45), at + Vector2(-26 + 52.0 * float(cage.hp) / 35.0, 45), gold, 4, true)

func cage_style() -> StyleBoxFlat:
	var box := StyleBoxFlat.new()
	box.bg_color = Color(0.15, 0.27, 0.3, 0.88)
	box.border_color = Color("#d8b16a")
	box.set_border_width_all(3)
	box.set_corner_radius_all(8)
	return box

func draw_enemy(enemy: Dictionary, time: float) -> void:
	var at := point(enemy)
	var id: int = int(enemy.id)
	if entity_positions.has(id):
		at = entity_positions[id].lerp(at, 0.55)
	entity_positions[id] = at
	var radius: float = maxf(1.15, float(enemy.radius)) * UNIT
	var telling: bool = enemy.phase == "tell"
	draw_circle(at + Vector2(4, 10), radius * 1.08, Color(0.015, 0.04, 0.06, 0.35), true, -1, true)
	if telling:
		var target := Vector2(float(enemy.targetX), -float(enemy.targetY)) * UNIT
		draw_line(at, target, Color(1.0, 0.4, 0.3, 0.24), 14.0, true)
		ring(at, radius * 1.45 + sin(time * 12.0) * 3.0, Color("#ff8b74"), 4.0)
		label("!", at - Vector2(0, radius * 1.75), Color("#ffd8a0"), 43)
	var texture: Texture2D = ENEMIES.get(enemy.kind, MANTA)
	sprite(texture, at, Vector2.ONE * radius * 2.65, -float(enemy.angle) + PI * 0.5, Color("#ffbaa6") if telling else Color.WHITE)
	if float(enemy.hp) < float(enemy.maxHp):
		draw_line(at + Vector2(-radius, radius + 12), at + Vector2(radius, radius + 12), Color("#163941"), 6.0, true)
		draw_line(at + Vector2(-radius, radius + 12), at + Vector2(-radius + radius * 2.0 * float(enemy.hp) / float(enemy.maxHp), radius + 12), Color("#ffae88"), 4.0, true)
	if enemy.kind == "guardian":
		label("THE BREAKWATER KEEPER" if state.get("story") else "THE LANTERN GUARDIAN", at - Vector2(0, radius * 1.6), Color("#ffe0b0"), 34)

func draw_golden_wings(at: Vector2, time: float) -> void:
	# Six distinct wings answer Luma's lights; a calm guide, never a target.
	for side in [-1, 1]:
		for i in range(3):
			var root := at + Vector2(side * 10, float(i) * 18 - 20)
			var tip := at + Vector2(side * (110 - i * 17), -85 + i * 55 + sin(time * 1.4 + i) * 10)
			var wing := PackedVector2Array([root, root.lerp(tip, 0.6) + Vector2(0, -24), tip, root.lerp(tip, 0.5) + Vector2(0, 24), root + Vector2(0, 12)])
			draw_colored_polygon(wing, Color("#d0a653") if i % 2 == 0 else Color("#eec87d"))
			draw_polyline(PackedVector2Array([wing[0], wing[1], wing[2], wing[3], wing[4], wing[0]]), Color("#ffe5a5"), 3.0, true)
	draw_line(at + Vector2(0, 70), at + Vector2(0, -30), Color("#d6ac55"), 18.0, true)
	draw_circle(at + Vector2(0, -37), 16.0, Color("#ffdf91"), true, -1, true)
	draw_circle(at + Vector2(-6, -41), 3.0, Color("#83f4e8"), true, -1, true)
	draw_circle(at + Vector2(6, -41), 3.0, Color("#83f4e8"), true, -1, true)
	for i in range(5):
		var color: Color = [Color("#ffb879"), Color("#fa8bad"), Color("#bfa0ff"), Color("#91eacb"), Color("#a4e9ff")][i]
		draw_circle(at + Vector2(float(i - 2) * 17, -80), 4.0 + sin(time * 2 + i) * 1.5, color, true, -1, true)

func draw_ship(at: Vector2, ship: Dictionary, stations: Array, crew: Array, tint: Color, player_ship: bool) -> void:
	var radius := 4.7 * UNIT
	var velocity := Vector2(float(ship.vx), -float(ship.vy))
	var speed := velocity.length()
	var flying: bool = state.has("odyssey") and (player_ship or state.region in ["sky", "space"])
	var hull: Texture2D = SURVEY_SHIP if flying else SHIP
	if flying:
		for side in [-1, 1]:
			draw_line(at + Vector2(side * 24, 129), at + Vector2(side * 24, 151 + speed * 4), Color(0.45, 0.9, 1.0, 0.45), 12.0, true)
	if speed > 0.2:
		var behind := -velocity.normalized()
		for i in range(6):
			var distance := radius * 0.7 + float(i) * 23.0 + fmod(clock * 35.0, 23.0)
			var position := at + behind * distance
			draw_arc(position, 12.0 + float(i) * 5.0, behind.angle() - 1.5, behind.angle() + 1.5, 12, Color(0.68, 1.0, 0.9, (1.0 - float(i) / 6.0) * minf(0.4, speed * 0.05)), 3.0, true)
	# A wooden bow, broad working deck and squared stern. Interior gravity stays stable.
	sprite(hull, at + Vector2(8, 15), Vector2(radius * 2.85, radius * 2.85), 0.0, Color(0.01, 0.05, 0.08, 0.4))
	sprite(hull, at, Vector2(radius * 2.85, radius * 2.85), 0.0, Color("#ffc4b3") if float(ship.invulnerable) > 0.0 and fmod(clock * 10.0, 1.0) > 0.5 else tint)
	# These rails/ladder marks match the authoritative walking geometry.
	for deck in [[-2.65, 2.65, -3.4], [-4.1, 4.1, -1.3], [-3.5, 3.5, 0.8], [-1.95, 1.95, 2.8]]:
		draw_line(at + Vector2(deck[0], -deck[2]) * UNIT, at + Vector2(deck[1], -deck[2]) * UNIT, Color(1.0, 0.82, 0.49, 0.48), 2.0, true)
	for ladder in [[-2.15, -3.4, 0.8], [2.15, -1.3, 0.8], [1.15, 0.8, 2.8]]:
		var foot := at + Vector2(ladder[0], -ladder[1]) * UNIT
		var head := at + Vector2(ladder[0], -ladder[2]) * UNIT
		for side in [-4, 4]:
			draw_line(foot + Vector2(side, 0), head + Vector2(side, 0), Color("#ac784b"), 2.0, true)
		for rung in range(int((foot.y - head.y) / 8.0)):
			var y := head.y + float(rung) * 8.0
			draw_line(Vector2(head.x - 4, y), Vector2(head.x + 4, y), Color("#e2b977"), 2.0, true)
	for station in stations:
		var id: String = station.id
		var angle: float = -float(station.angle)
		var direction := Vector2.from_angle(angle)
		if id == "shield" and (station.operated or float(station.lingering) > 0.0):
			draw_arc(at, radius + 24, angle - 0.66, angle + 0.66, 24, Color(1.0, 0.85, 0.4, 0.2), 21.0, true)
			draw_arc(at, radius + 24, angle - 0.66, angle + 0.66, 24, Color("#ffe9a1"), 5.0, true)
		elif id in ["north", "east", "south", "west", "starburst"]:
			var mounts := {"north": Vector2(-0.9, -2.8), "east": Vector2(3.45, 1.3), "south": Vector2(-1.15, 3.4), "west": Vector2(-3.45, 1.3), "starburst": Vector2(0.4, -2.8)}
			var base: Vector2 = at + mounts[id] * UNIT
			draw_circle(base, 11.0, Color("#86633e"), true, -1, true)
			draw_line(base, base + direction * 28.0, Color("#152b35"), 15.0, true)
			draw_line(base, base + direction * 26.0, Color("#a7b9ac") if not station.operated else Color("#ffe0a0"), 8.0, true)
			if station.firing and fmod(clock * 15.0, 1.0) > 0.4:
				draw_circle(base + direction * 31.0, 9.0, Color("#b9ffdc"), true, -1, true)
			if float(station.charge) > 0.0:
				ring(base, 14.0 + float(station.charge) * 14.0, Color("#c6acff"), 4.0)
	var family: Dictionary = state.get("story") if state.get("story") is Dictionary else {}
	var little_wing: Dictionary = state.get("littleWing", {})
	if player_ship and float(little_wing.get("remaining", 0)) > 0:
		for i in range(3):
			ring(at, radius + 19.0 + float(i) * 8.0, Color(0.72, 0.84, 1.0, 0.55 - float(i) * 0.15), 3.0)
		var child := at + Vector2(sin(clock * 2.5) * 13.0, -18)
		draw_line(child + Vector2(0, -9), at + Vector2(0, -100), Color("#d8b779"), 2.0, true)
		draw_circle(child, 7.0, Color("#b99dde"), true, -1, true)
		draw_circle(child + Vector2(0, -8), 5.0, Color("#eac5a1"), true, -1, true)
		draw_arc(child + Vector2(0, -9), 5.0, PI, TAU, 12, Color("#413238"), 3.0, true)
		label("LUMA · 4", child + Vector2(0, -24), Color("#e2d5ff"), 16)
	for person in crew:
		var local := Vector2(float(person.x), -float(person.y) - 0.42) * UNIT
		var color: Color = COLORS.get(person.color, Color.WHITE)
		var bob := sin(float(person.step) * TAU) * 1.4 if not person.seat else 0.0
		var mother: bool = player_ship and person.id == family.get("motherId", "")
		var son: bool = player_ship and person.id == family.get("sonId", "")
		if mother or son:
			var body := at + local + Vector2(0, 3 if son else 0)
			var coat := Color("#d4a642") if son else Color("#347578")
			var scale := 0.78 if son else 1.0
			draw_line(body + Vector2(-3, 4), body + Vector2(-4, 11 + bob), Color("#28333b"), 4.0, true)
			draw_line(body + Vector2(3, 4), body + Vector2(4, 11 - bob), Color("#28333b"), 4.0, true)
			draw_colored_polygon(PackedVector2Array([body + Vector2(-6, -4) * scale, body + Vector2(6, -4) * scale, body + Vector2(8, 8) * scale, body + Vector2(-8, 8) * scale]), coat)
			draw_circle(body + Vector2(0, -8) * scale, 6.0 * scale, Color("#dcac7e"), true, -1, true)
			draw_arc(body + Vector2(0, -9) * scale, 5.0 * scale, PI, TAU, 12, Color("#48372e"), 5.0, true)
			if mother:
				draw_circle(body + Vector2(-7, -8), 3.5, Color("#49382c"), true, -1, true)
				draw_line(body + Vector2(-5, -1), body + Vector2(7, 2), Color("#cd7855"), 4.0, true)
			label("FINN · 9" if son else "MARA", body + Vector2(0, -28), Color("#e5c587") if son else Color("#cbe4d0"), 15)
			if person.id == state.get("playerId"):
				ring(body + Vector2(0, -3), 16.0, Color(0.8, 1.0, 0.85, 0.5), 1.5)
			continue
		draw_line(at + local + Vector2(-3, 4), at + local + Vector2(-4, 11 + bob), color.darkened(0.25), 3.0, true)
		draw_line(at + local + Vector2(3, 4), at + local + Vector2(4, 11 - bob), color.darkened(0.25), 3.0, true)
		draw_circle(at + local, 7.0, color, true, -1, true)
		draw_circle(at + local + Vector2(0, -6), 6.0, Color("#fff0d2"), true, -1, true)
		draw_line(at + local + Vector2(-5, -8), at + local + Vector2(5, -8), color, 4.0, true)
		if person.id == state.get("playerId"):
			draw_colored_polygon(PackedVector2Array([at + local + Vector2(-6, -23), at + local + Vector2(6, -23), at + local + Vector2(0, -16)]), Color("#d4ffe5"))
