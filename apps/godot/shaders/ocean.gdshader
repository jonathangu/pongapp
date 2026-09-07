shader_type canvas_item;
uniform vec2 camera_world = vec2(0.0);
uniform vec2 world_span = vec2(50.0, 60.0);
uniform float region = 0.0;
uniform float storm = 0.0;
uniform float motion = 1.0;
uniform float inner_world = 0.0;
void fragment() {
	vec2 p = camera_world + (UV - 0.5) * world_span;
	float t = TIME * motion;
	float wave = sin(p.x * 1.1 + sin(p.y * 0.6 + t * 0.24) * 2.0 + t * 0.36);
	wave += sin(p.y * 1.5 - p.x * 0.35 - t * 0.43) * 0.4;
	float caustic = pow(max(0.0, 1.0 - abs(wave)), 12.0);
	vec3 deep = mix(vec3(0.025, 0.18, 0.23), vec3(0.025, 0.095, 0.16), UV.y);
	vec3 shallow = vec3(0.02, 0.34, 0.36);
	vec3 color = mix(deep, shallow, 0.22 + 0.16 * sin(p.x * 0.035 + p.y * 0.05));
	color += caustic * vec3(0.055, 0.13, 0.13) * 0.15;
	if (region > 0.5 && region < 1.5) {
		color = mix(vec3(0.025, 0.035, 0.12), vec3(0.11, 0.055, 0.21), sin(p.x * 0.03) * 0.5 + 0.5);
		vec2 star = fract(p * 0.77) - 0.5;
		float random = fract(sin(dot(floor(p * 0.77), vec2(127.1, 311.7))) * 43758.5453);
		color += smoothstep(0.025, 0.0, length(star)) * step(0.93, random) * vec3(0.7, 0.8, 1.0);
	}
	if (region > 1.5 && region < 2.5) color *= vec3(0.65, 1.12, 0.77);
	if (region > 2.5) {
		float cloud = sin(p.x * 0.16 + sin(p.y * 0.11 + t * 0.025) * 2.5) * sin(p.y * 0.19 - t * 0.04);
		color = mix(vec3(0.12, 0.4, 0.58), vec3(0.89, 0.91, 0.83), smoothstep(-0.1, 0.72, cloud));
		color += vec3(0.18, 0.09, 0.02) * max(0.0, 1.0 - UV.y * 1.7);
	}
	color *= 1.0 - storm * 0.25;
	if (inner_world > 0.5) {
		vec2 sun_delta = (UV - vec2(0.5, 0.12)) * vec2(1.0, world_span.y / world_span.x);
		float glow = exp(-length(sun_delta) * 5.0);
		float curve = abs(sin(length(p + vec2(0.0, 85.0)) * 0.047));
		color = mix(color, vec3(0.10, 0.43, 0.39), 0.28);
		color += vec3(0.65, 0.42, 0.12) * glow * 0.45;
		color += vec3(0.06, 0.16, 0.10) * pow(curve, 24.0);
	}
	float vignette = 1.0 - 0.22 * length((UV - 0.5) * 1.3);
	COLOR = vec4(color * vignette, 1.0);
}
