extends Node2D

var particles: Array[Dictionary] = []
var reduced_motion := false
const UNIT = 24.0

func add_event(event: Dictionary) -> void:
	if event.kind in ["beam", "starburst", "lightning"]:
		particles.append({"kind": "beam", "position": Vector2(float(event.x), -float(event.y)) * UNIT, "angle": -float(event.angle), "age": 0.0, "life": 0.28, "size": maxf(4.0, float(event.size)) * UNIT, "color": Color("#c2fff0")})
	elif event.kind in ["hit", "boom", "cage", "rescue", "socket", "shield", "shot"]:
		var color := Color("#ffd783") if event.kind in ["rescue", "cage", "socket"] else Color("#ff887e") if event.kind in ["hit", "boom"] else Color("#99ffec")
		particles.append({"kind": "ring", "position": Vector2(float(event.x), -float(event.y)) * UNIT, "age": 0.0, "life": 0.48, "size": maxf(0.6, float(event.size)) * UNIT * 1.7, "color": color})
		if not reduced_motion and event.kind != "shot":
			for i in range(8):
				var angle := float(i) / 8.0 * TAU + float(event.id) * 0.37
				particles.append({"kind": "spark", "position": Vector2(float(event.x), -float(event.y)) * UNIT, "velocity": Vector2.from_angle(angle) * (45.0 + float(i % 3) * 30.0), "age": 0.0, "life": 0.6, "size": 5.0, "color": color})
	if particles.size() > 240:
		particles = particles.slice(particles.size() - 240)

func _process(delta: float) -> void:
	for p in particles:
		p.age += delta
		if p.kind == "spark":
			p.position += p.velocity * delta
	particles = particles.filter(func(p): return p.age < p.life)
	queue_redraw()

func _draw() -> void:
	for p in particles:
		var progress: float = p.age / p.life
		var color: Color = p.color
		color.a *= 1.0 - progress
		if p.kind == "beam":
			draw_line(p.position, p.position + Vector2.from_angle(p.angle) * p.size, Color(color, color.a * 0.18), 22.0, true)
			draw_line(p.position, p.position + Vector2.from_angle(p.angle) * p.size, color, 6.0, true)
		elif p.kind == "ring":
			draw_arc(p.position, maxf(2.0, p.size * progress), 0.0, TAU, 32, color, 3.0, true)
		else:
			draw_circle(p.position, p.size * (1.0 - progress), color, true, -1.0, true)
