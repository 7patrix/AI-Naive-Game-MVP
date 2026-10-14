extends Node3D

const Courier = preload("res://scripts/courier_v4.gd")
const TownUI = preload("res://scripts/town_ui.gd")
const VolumeBuilding = preload("res://scripts/volume_building.gd")
const AnimationQA = preload("res://scripts/animation_qa.gd")
const ExperienceQA = preload("res://scripts/experience_qa.gd")
const FirstNight = preload("res://scripts/first_night.gd")
const FirstNightQA = preload("res://scripts/first_night_qa.gd")
const FirstNightWalk = preload("res://scripts/first_night_playthrough.gd")
const QualityQA = preload("res://scripts/quality_slice_qa.gd")
const GameSession = preload("res://scripts/game_session.gd")
const DialogQA = preload("res://scripts/dialog_input_qa.gd")
const ARRIVAL = Vector3(-2.0,0.1,6.6)

var player: CharacterBody3D
var camera: Camera3D
var ui: CanvasLayer
var board_read := false
var has_key := false
var door_open := false
var busy := false
var volume := 0.0
var elapsed := 0.0
var points: Dictionary = {}
var nearest := ""
var interact_ring: MeshInstance3D
var buildings: Array[Dictionary] = []
var sways: Array[Dictionary] = []
var lamps: Array[Dictionary] = []
var audio: Dictionary = {}
var shadow_texture: ImageTexture
var glow_texture: ImageTexture
var inn_sprite: Sprite3D
var inn_volume: Node3D
var door_glow: MeshInstance3D
var world: WorldEnvironment
var qa_mode := false
var capture_mode := false
var sample_mode := false
var qa_results: Array[String] = []
var occluded_time := 0.0
var session: Node
var story: Node

func _ready() -> void:
	qa_mode = "--qa" in OS.get_cmdline_user_args()
	capture_mode = "--capture" in OS.get_cmdline_user_args()
	sample_mode = "--sample-v2" in OS.get_cmdline_user_args() or "--sample-v3" in OS.get_cmdline_user_args()
	seed(782041)
	_setup_input()
	_setup_effect_textures()
	_setup_world()
	_build_town()
	player = Courier.new()
	player.town = self
	player.position = ARRIVAL
	player.name = "Courier"
	add_child(player)
	_setup_camera()
	ui = TownUI.new()
	ui.town = self
	add_child(ui)
	_setup_audio()
	set_volume(0.0)
	var legacy := false
	for argument in OS.get_cmdline_user_args():
		if argument in ["--qa","--qa-reload","--qa-animation","--record-animation","--audit-experience","--qa-experience","--record-experience","--sample-v2","--sample-v3","--capture"]:
			legacy = true
	if not legacy:
		session = GameSession.new()
		add_child(session)
		story = FirstNight.new()
		story.town = self
		add_child(story)
	print("MOTHWAKE_READY renderer=",RenderingServer.get_current_rendering_method()," buildings=4 interactions=3 muted=true")
	if "--qa-quality" in OS.get_cmdline_user_args():
		var driver=QualityQA.new()
		driver.town=self
		add_child(driver)
	elif "--qa-dialog" in OS.get_cmdline_user_args():
		var driver = DialogQA.new()
		driver.town = self
		add_child(driver)
	elif "--walk-west" in OS.get_cmdline_user_args() or "--walk-clock" in OS.get_cmdline_user_args():
		var driver = FirstNightWalk.new()
		driver.town = self
		add_child(driver)
	elif "--qa-first-night" in OS.get_cmdline_user_args():
		var driver = FirstNightQA.new()
		driver.town = self
		add_child(driver)
	elif "--audit-experience" in OS.get_cmdline_user_args() or "--qa-experience" in OS.get_cmdline_user_args() or "--record-experience" in OS.get_cmdline_user_args():
		var driver = ExperienceQA.new()
		driver.town = self
		driver.mode = "record" if "--record-experience" in OS.get_cmdline_user_args() else ("qa" if "--qa-experience" in OS.get_cmdline_user_args() else "audit")
		add_child(driver)
	elif "--qa-animation" in OS.get_cmdline_user_args() or "--record-animation" in OS.get_cmdline_user_args():
		var driver = AnimationQA.new()
		driver.town = self
		driver.mode = "record" if "--record-animation" in OS.get_cmdline_user_args() else "qa"
		add_child(driver)
	elif sample_mode:
		call_deferred("_run_visual_sample")
	elif qa_mode:
		call_deferred("_run_qa")
	elif capture_mode:
		call_deferred("_capture_first_frame")
	elif "--qa-reload" in OS.get_cmdline_user_args():
		call_deferred("_run_reload_check")

func _setup_input() -> void:
	var actions = {
		"move_left":[KEY_A,KEY_LEFT], "move_right":[KEY_D,KEY_RIGHT],
		"move_up":[KEY_W,KEY_UP], "move_down":[KEY_S,KEY_DOWN],
		"interact":[KEY_E], "pause":[KEY_ESCAPE], "hurry":[KEY_SHIFT], "arrival":[KEY_R]
	}
	for action in actions:
		if not InputMap.has_action(action):
			InputMap.add_action(action,0.15)
		for key in actions[action]:
			var event = InputEventKey.new()
			event.physical_keycode = key
			InputMap.action_add_event(action,event)

func _setup_effect_textures() -> void:
	var shadow = Image.create(128,128,false,Image.FORMAT_RGBA8)
	var glow = Image.create(128,128,false,Image.FORMAT_RGBA8)
	for y in range(128):
		for x in range(128):
			var d = Vector2(x-63.5,y-63.5).length()/64.0
			shadow.set_pixel(x,y,Color(0.035,0.044,0.042,pow(max(0.0,1.0-d),1.7)*0.56))
			glow.set_pixel(x,y,Color(1.0,0.64,0.24,pow(max(0.0,1.0-d),2.4)*0.28))
	shadow_texture = ImageTexture.create_from_image(shadow)
	glow_texture = ImageTexture.create_from_image(glow)

func _setup_world() -> void:
	world = WorldEnvironment.new()
	var env = Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = Color("283a3c")
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color("a9babb")
	env.ambient_light_energy = 0.82
	env.tonemap_mode = Environment.TONE_MAPPER_LINEAR
	env.fog_enabled = true
	env.fog_light_color = Color("647d7b")
	env.fog_light_energy = 0.45
	env.fog_density = 0.006
	env.fog_sky_affect = 0
	world.environment = env
	add_child(world)
	var moon = DirectionalLight3D.new()
	moon.rotation_degrees = Vector3(-52,-32,0)
	moon.light_color = Color("bfced1")
	moon.light_energy = 0.72
	moon.shadow_enabled = true
	moon.directional_shadow_mode = DirectionalLight3D.SHADOW_ORTHOGONAL
	moon.directional_shadow_max_distance = 48.0
	moon.shadow_normal_bias = 0.45
	add_child(moon)
	var floor_mesh = MeshInstance3D.new()
	var plane = PlaneMesh.new()
	plane.size = Vector2(128,128)
	floor_mesh.mesh = plane
	var material = ShaderMaterial.new()
	material.shader = load("res://assets/ground.gdshader")
	material.set_shader_parameter("paving",load("res://assets/art/paving.png"))
	floor_mesh.material_override = material
	add_child(floor_mesh)
	add_box(Vector3(0,-0.3,0),Vector3(64,0.6,48),"Ground")
	# Footprint bounds prevent walking through the scenic perimeter.
	add_box(Vector3(-19,1,0),Vector3(1,3,28),"WestPerimeter")
	add_box(Vector3(19,1,0),Vector3(1,3,28),"EastPerimeter")
	add_box(Vector3(0,1,-12.0),Vector3(40,3,1),"NorthPerimeter")
	add_box(Vector3(0,1,13.0),Vector3(40,3,1),"SouthPerimeter")

func add_box(pos: Vector3, size: Vector3, label: String) -> StaticBody3D:
	var body = StaticBody3D.new()
	body.name = label
	body.position = pos
	body.collision_layer = 1
	body.collision_mask = 2
	var shape = CollisionShape3D.new()
	var box = BoxShape3D.new()
	box.size = size
	shape.shape = box
	body.add_child(shape)
	add_child(body)
	return body

func add_round_body(pos: Vector3, radius: float, label: String) -> StaticBody3D:
	var body = StaticBody3D.new()
	body.name = label
	body.position = pos + Vector3(0,0.6,0)
	body.collision_layer = 1
	body.collision_mask = 2
	var shape = CollisionShape3D.new()
	var cylinder = CylinderShape3D.new()
	cylinder.radius = radius
	cylinder.height = 1.2
	shape.shape = cylinder
	body.add_child(shape)
	add_child(body)
	return body

func art(name: String, pos: Vector3, height: float, tint := Color.WHITE) -> Sprite3D:
	var texture: Texture2D = load("res://assets/art/%s.png" % name)
	var s = Sprite3D.new()
	s.name = name.capitalize()
	s.texture = texture
	s.position = pos + Vector3(0,0.035,0)
	s.pixel_size = height / float(texture.get_height())
	s.offset.y = texture.get_height()*0.5
	s.billboard = BaseMaterial3D.BILLBOARD_FIXED_Y
	s.alpha_cut = SpriteBase3D.ALPHA_CUT_DISCARD
	s.alpha_scissor_threshold = 0.12
	s.shaded = true
	s.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	s.no_depth_test = false
	s.texture_filter = BaseMaterial3D.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS
	s.modulate = tint
	add_child(s)
	return s

func add_shadow(parent: Node3D, size: Vector2) -> MeshInstance3D:
	return ground_effect(parent,size,shadow_texture,0.018)

func ground_effect(parent: Node3D, size: Vector2, texture: Texture2D, y := 0.022) -> MeshInstance3D:
	var s = MeshInstance3D.new()
	var plane = PlaneMesh.new()
	plane.size = size
	s.mesh = plane
	s.position.y = y
	var material = StandardMaterial3D.new()
	material.albedo_texture = texture
	material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	material.cull_mode = BaseMaterial3D.CULL_DISABLED
	material.disable_fog = true
	material.render_priority = 1
	s.material_override = material
	parent.add_child(s)
	return s

func scenery_shadow(pos: Vector3, size: Vector2) -> void:
	var node = Node3D.new()
	node.position = pos
	add_child(node)
	add_shadow(node,size)

func building(name: String, pos: Vector3, height: float, width: float, depth: float) -> Sprite3D:
	var s = art(name,pos,height)
	add_box(pos+Vector3(0,1.7,-0.8),Vector3(width,3.4,depth),name.capitalize()+"Footprint")
	scenery_shadow(pos+Vector3(0,0,0.1),Vector2(width*1.5,depth*1.4))
	buildings.append({"sprite":s,"pos":pos,"width":width})
	var lamp = OmniLight3D.new()
	lamp.position = pos + Vector3(0,0.5,0.8)
	lamp.light_color = Color("e4a65f")
	lamp.light_energy = 0.6
	lamp.omni_range = 3.8
	add_child(lamp)
	return s

func _build_town() -> void:
	inn_volume = VolumeBuilding.new()
	inn_volume.position = Vector3(-8.0,0,-5.65)
	inn_volume.rotation.y = deg_to_rad(-12)
	add_child(inn_volume)
	buildings.append({"volume":inn_volume})
	scenery_shadow(inn_volume.position,Vector2(6.7,4.8))
	for data in [
		["archive",Vector3(0,0,-8.25),4.5,3.5,4.6,1.7,8.0],
		["apothecary",Vector3(8,0,-5.1),5.7,3.1,3.25,2.1,10.0],
		["forge",Vector3(11.5,0,4.75),5.5,3.2,3.15,1.9,-14.0]
	]:
		var architecture = VolumeBuilding.new()
		architecture.kind = data[0]
		architecture.position = data[1]
		architecture.width = data[2]
		architecture.depth = data[3]
		architecture.wall_height = data[4]
		architecture.roof_height = data[5]
		architecture.rotation.y = deg_to_rad(data[6])
		add_child(architecture)
		buildings.append({"volume":architecture})
		scenery_shadow(architecture.position,Vector2(data[2]*1.12,data[3]*1.2))
	_build_threshold_stones()
	points = {
		"board":{"pos":Vector3(-4.0,0,2.4),"prompt":"Read the fading notice"},
		"well":{"pos":Vector3(0.2,0,1.4),"prompt":"Lower the bucket"},
		"door":{"pos":Vector3(-8.8,0,-1.65),"prompt":"Knock at the Moth & Ember"}
	}
	points.door.pos = inn_volume.door_approach()
	var board = art("noticeboard",Vector3(-4,0,1.8),2.5)
	sways.append({"sprite":board,"amplitude":0.004,"phase":0.6})
	add_box(Vector3(-4,0.6,1.62),Vector3(1.25,1.2,0.45),"NoticeboardFootprint")
	scenery_shadow(Vector3(-4,0,1.8),Vector2(2,1))
	art("well",Vector3(0.2,0,0.45),2.15)
	add_round_body(Vector3(0.2,0,0.30),0.83,"WellFootprint")
	scenery_shadow(Vector3(0.2,0,0.45),Vector2(2.8,1.7))
	art("bench",Vector3(4.1,0,1.0),1.1)
	add_box(Vector3(4.1,0.55,0.8),Vector3(1.85,1.1,0.55),"BenchFootprint")
	scenery_shadow(Vector3(4.1,0,1.0),Vector2(2.6,1.0))
	art("bench",Vector3(-12.8,0,5.0),1.0,Color("b7c0ba"))
	add_box(Vector3(-12.8,0.5,4.8),Vector3(1.65,1,0.55),"WestBenchFootprint")
	# Clusters attach the facades to the ground and break the stone/mud seam.
	for data in [[-11.7,-3.6,1.18],[-5.5,-3.2,0.95],[10.5,-2.8,1.05],[13.8,6.8,1.1]]:
		var pos = Vector3(data[0],0,data[1])
		art("supplies",pos,data[2])
		scenery_shadow(pos,Vector2(2.0,0.9))
		add_box(pos+Vector3(0,0.45,-0.1),Vector3(1.25,0.9,0.7),"SuppliesFootprint")
	var sign = art("waymarker",Vector3(-8.7,0,3.5),2.5)
	sways.append({"sprite":sign,"amplitude":0.024,"phase":2.0})
	add_round_body(Vector3(-8.7,0,3.5),0.18,"WaymarkerFootprint")
	scenery_shadow(Vector3(-8.7,0,3.5),Vector2(1.3,0.75))
	for data in [[-14.7,7.6,1.0],[13.8,-2.0,1.2],[-2.8,-7.0,0.85]]:
		art("milestone",Vector3(data[0],0,data[1]),data[2],Color("bdc7bc"))
	for data in [
		[-11.0,-3.7,0.55],[-5.5,-3.7,0.5],[5.2,-3.5,0.52],[10.8,-3.4,0.6],
		[-2.5,-6.7,0.47],[2.7,-6.7,0.49],[-6.9,-0.6,0.45],[6.6,-0.5,0.48],
		[-10.4,0.2,0.50],[9.6,1.0,0.5],[-4.7,5.7,0.34],[3.5,5.8,0.4],
		[-15.0,5.7,0.55],[-13.0,1.0,0.45],[12.5,8.0,0.5],[8.0,7.8,0.6],
		[-1.8,9.3,0.48],[2.5,8.3,0.46],[-6.0,8.5,0.52],[14.7,3.5,0.5],
		[-15.5,-4.6,0.8],[16.2,-6.0,0.7]
	]:
		var shrub = art("brambles",Vector3(data[0],0,data[1]),data[2],Color("9da78e"))
		shrub.flip_h = randf()>0.5
		sways.append({"sprite":shrub,"amplitude":0.012,"phase":randf()*6.0})
	for p in [Vector3(-6.1,0,5.2),Vector3(5.4,0,5.2),Vector3(-2.2,0,-4.3),Vector3(11.7,0,-0.4),Vector3(-14,0,-1.2)]:
		streetlamp(p)
	# Scenic tree line: real paper sprites, no visible primitive stand-ins.
	var tree_data = [
		[-16.2,-7.7,6.0],[-12.7,-10.5,5.2],[-5.1,-10.7,6.0],[5.1,-11.1,5.6],
		[14.2,-8.3,6.4],[17.2,-4.5,5.1],[17.3,3.0,5.5],[-17.1,2.1,5.5],
		[-17.1,8.5,6.2],[16.1,10.5,5.2],[-8.0,11.8,3.5]
	]
	for data in tree_data:
		var pos = Vector3(data[0],0,data[1])
		var s = art("tree",pos,data[2],Color("889e98"))
		s.flip_h = randf() > 0.5
		sways.append({"sprite":s,"amplitude":0.0025,"phase":randf()*6})
		add_round_body(pos,0.45,"TreeFootprint")
		scenery_shadow(pos,Vector2(3.7,2))
	# Iron railings set a legible perimeter; leave the arrival gap clear.
	for x in [-16.0,-12.8,-9.6,-6.4,6.4,9.6,12.8,16.0]:
		art("fence",Vector3(x,0,-11.45),1.7,Color("92a5a2"))
	for x in [-15.0,-12.8,7.5,10.0,12.5,15.0]:
		art("fence",Vector3(x,0,11.7),1.3,Color("657976"))
	var glow_node = Node3D.new()
	glow_node.position = points.door.pos
	add_child(glow_node)
	door_glow = ground_effect(glow_node,Vector2(3.7,2.8),glow_texture)
	door_glow.material_override.albedo_color.a = 0.18
	interact_ring = MeshInstance3D.new()
	var ring = TorusMesh.new()
	ring.inner_radius = 0.44
	ring.outer_radius = 0.46
	ring.rings = 32
	ring.ring_segments = 8
	interact_ring.mesh = ring
	var mat = StandardMaterial3D.new()
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.albedo_color = Color(0.81,0.7,0.42,0.7)
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	interact_ring.material_override = mat
	interact_ring.position.y = 0.045
	interact_ring.hide()
	add_child(interact_ring)

func _build_threshold_stones() -> void:
	# A short apron actually meets each rotated wall, avoiding a floating facade/mud seam.
	for item in buildings:
		var b: Node3D = item.volume
		for row in range(3):
			for column in range(6):
				if row == 2 and (column == 0 or column == 5):
					continue
				var slab = MeshInstance3D.new()
				var mesh = BoxMesh.new()
				mesh.size = Vector3(b.width/6.0-0.045,0.035,0.46)
				slab.mesh = mesh
				slab.material_override = b.material("flagstone",Color("8a9c90"))
				slab.position = Vector3((column-2.5)*b.width/6.0+(0.15 if row%2==1 else 0.0)+randf_range(-0.03,0.03),0.012,b.depth/2.0+0.25+row*0.49)
				slab.rotation.y = randf_range(-0.018,0.018)
				b.add_child(slab)

func streetlamp(pos: Vector3) -> void:
	var s = art("lamp",pos,3.5)
	add_round_body(pos,0.16,"LampFootprint")
	scenery_shadow(pos,Vector2(0.9,0.8))
	var node = Node3D.new()
	node.position = pos
	add_child(node)
	var halo = ground_effect(node,Vector2(4.8,3.8),glow_texture)
	var light = OmniLight3D.new()
	light.position = pos + Vector3(0.3,1.8,0.45)
	light.light_color = Color("ffc581")
	light.light_energy = 1.1
	light.omni_range = 4.2
	add_child(light)
	lamps.append({"light":light,"halo":halo,"sprite":s,"phase":randf()*TAU})
	sways.append({"sprite":s,"amplitude":0.002,"phase":randf()*6})

func _setup_camera() -> void:
	camera = Camera3D.new()
	camera.name = "TownCamera"
	camera.projection = Camera3D.PROJECTION_ORTHOGONAL
	camera.size = 22.0
	camera.near = 0.1
	camera.far = 100
	camera.position = Vector3(-0.8,21.0,23.6)
	add_child(camera)
	camera.look_at(Vector3(-0.8,2.0,-2.7),Vector3.UP)
	camera.current = true

func _process(delta: float) -> void:
	elapsed += delta
	var follow = Vector3(clamp(player.position.x*0.34,-5.6,5.6),0,clamp((player.position.z-5.0)*0.32,-3.5,2.0))
	var desired = Vector3(-0.8+follow.x,21.0,23.6+follow.z)
	if story and not story.current_room.is_empty():
		pass
	elif not sample_mode:
		camera.position = camera.position.lerp(desired,1.0-exp(-delta*3.8))
	for item in sways:
		item.sprite.rotation.z = sin(elapsed*1.6+item.phase)*item.amplitude
	for item in lamps:
		var pulse = 0.88 + sin(elapsed*3.2+item.phase)*0.06 + sin(elapsed*8.3+item.phase)*0.025
		item.light.light_energy = pulse*item.get("strength",1.0)
		item.halo.material_override.albedo_color.a = pulse*min(1.0,item.get("strength",1.0))
	# Depth-tested paper sprites occlude naturally. A transparent paper fade
	# keeps the courier visible when directly behind a large facade.
	for item in buildings:
		if item.has("volume"):
			continue
		var hidden = player.position.z < item.pos.z-0.4 and abs(player.position.x-item.pos.x)<item.width*0.55
		var target = 0.28 if hidden else 1.0
		item.sprite.modulate.a = move_toward(item.sprite.modulate.a,target,delta*2.0)
		item.sprite.alpha_cut = SpriteBase3D.ALPHA_CUT_DISABLED if item.sprite.modulate.a < 0.99 else SpriteBase3D.ALPHA_CUT_DISCARD
	_update_proximity()
	if courier_occluded():
		occluded_time += delta
	else:
		occluded_time = 0.0
	ui.update_behind_marker(occluded_time>0.12,camera.unproject_position(player.global_position+Vector3(0,1.15,0)))

func _update_proximity() -> void:
	# Separate acquire/release distances prevent fingertip motion flickering E.
	var best = 1.75
	var candidate := ""
	if points.has(nearest):
		var previous: Vector3 = points[nearest].pos
		var d = Vector2(player.position.x-previous.x,player.position.z-previous.z).length()
		if d<1.98 and _point_reachable(previous):
			candidate = nearest
			best = d-0.18
	for key in points:
		var p: Vector3 = points[key].pos
		var d = Vector2(player.position.x-p.x,player.position.z-p.z).length()
		if d < best and d<1.75 and _point_reachable(p):
			best = d
			candidate = key
	nearest = candidate
	if busy:
		nearest = ""
	interact_ring.visible = not nearest.is_empty() and not ui.modal.visible
	if not nearest.is_empty():
		interact_ring.position = points[nearest].pos + Vector3(0,0.045,0)
		interact_ring.scale = Vector3.ONE * (0.95+sin(elapsed*3.0)*0.035)
		var text: String = points[nearest].prompt
		if nearest == "well" and has_key:
			text = "Listen to the well"
		elif nearest == "door" and has_key:
			text = "Turn the brass key" if not door_open else "Rest at the open inn"
		ui.set_prompt(text)
	else:
		ui.set_prompt("")

func _point_reachable(point: Vector3) -> bool:
	var query = PhysicsRayQueryParameters3D.create(player.global_position+Vector3(0,0.8,0),point+Vector3(0,0.8,0),1)
	query.exclude = [player.get_rid()]
	var hit = get_world_3d().direct_space_state.intersect_ray(query)
	return hit.is_empty() or not hit.collider.is_in_group("architecture")

func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventKey and event.echo:
		return
	if event.is_action_pressed("interact") and not ui.modal.visible:
		interact(nearest)
	elif event.is_action_pressed("arrival") and not ui.modal.visible and not busy:
		if story and not story.current_room.is_empty():
			story.transition_room("")
			return
		player.teleport(ARRIVAL)
		ui.toast("Back beneath the first lamp.",2.5)

func interact(key: String) -> void:
	if busy or key.is_empty():
		return
	if story:
		story.handle_interaction(key)
		return
	match key:
		"board":
			board_read = true
			play_sound("paper")
			ui.show_note()
			ui.update_quest()
			print("INTERACT board read=true")
		"well":
			if has_key:
				play_sound("well")
				ui.toast("Only a ripple answers. You have what you came for.")
			elif not board_read:
				play_sound("well")
				ui.toast("A rope, a bucket, a story. Read the nearby notice first.")
			else:
				busy = true
				player.locked = true
				play_sound("well")
				ui.toast("The rope creaks. Something brass glints in the water...",2.0)
				var tween = create_tween()
				tween.tween_property(camera,"size",21.5,0.45)
				tween.tween_interval(0.6)
				tween.tween_callback(_retrieve_key)
				tween.tween_property(camera,"size",22.0,0.5)
		"door":
			if not has_key:
				play_sound("knock")
				ui.toast("Three hollow knocks. The lock is cold. Try the noticeboard.")
			elif not door_open:
				door_open = true
				play_sound("door")
				create_tween().tween_property(door_glow.material_override,"albedo_color:a",1.0,1.0)
				# The independent oak door now opens on its real hinge.
				ui.update_quest()
				ui.toast("The key turns. Warmth spills across the stones. You are welcome here.",7.0)
				print("INTERACT door open=true complete=true")
			else:
				play_sound("door")
				ui.toast("A room, a lamp, and a moment's rest. The night can wait.",5.0)

func _retrieve_key() -> void:
	has_key = true
	busy = false
	player.locked = false
	play_sound("key")
	ui.update_quest()
	ui.toast("A brass key. The moth-shaped bow is still warm.",5.0)
	print("INTERACT well key=true")

func _setup_audio() -> void:
	for name in ["wind","step","paper","well","knock","key","door","bell"]:
		var node = AudioStreamPlayer.new()
		node.name = name.capitalize()+"Sound"
		node.stream = make_sound(name)
		node.volume_db = -12.0 if name == "wind" else -5.0
		add_child(node)
		audio[name] = node

func make_sound(kind: String) -> AudioStreamWAV:
	var rate = 22050
	var duration = 0.14
	match kind:
		"wind": duration = 6.0
		"paper": duration = 0.38
		"well": duration = 1.7
		"knock": duration = 0.55
		"key": duration = 0.8
		"door": duration = 1.5
		"bell": duration = 2.4
	var samples = int(rate*duration)
	var bytes = PackedByteArray()
	bytes.resize(samples*2)
	var rng = RandomNumberGenerator.new()
	rng.seed = 684724
	var filtered = 0.0
	for i in range(samples):
		var t = float(i)/rate
		var noise = rng.randf_range(-1,1)
		filtered = filtered*0.94+noise*0.06
		var end = pow(1.0-float(i)/samples,2.0)
		var value = 0.0
		match kind:
			"wind": value = filtered*0.34*(0.6+sin(t*TAU/6.0)*0.16)
			"step": value = (filtered*0.10+noise*0.035)*exp(-t*48)+sin(t*TAU*96)*exp(-t*36)*0.16
			"paper": value = noise*0.13*end*(0.5+sin(t*80)*0.5)
			"well": value = sin(t*TAU*(180+t*110))*exp(-t*3)*0.10+filtered*0.20*end
			"knock": value = sin(t*TAU*120)*exp(-fmod(t,0.18)*40)*0.18*end
			"key": value = (sin(t*TAU*660)+sin(t*TAU*990)*0.4)*exp(-t*7)*0.15
			"door": value = sin(t*TAU*(95+sin(t*5)*35))*end*0.09+filtered*end*0.22
			"bell": value = (sin(t*TAU*330)+sin(t*TAU*660)*0.38+sin(t*TAU*917)*0.18)*exp(-fmod(t,0.75)*5.0)*end*0.13
		bytes.encode_s16(i*2,int(clamp(value,-0.85,0.85)*32767))
	var stream = AudioStreamWAV.new()
	stream.format = AudioStreamWAV.FORMAT_16_BITS
	stream.mix_rate = rate
	stream.data = bytes
	if kind == "wind":
		stream.loop_mode = AudioStreamWAV.LOOP_FORWARD
		stream.loop_end = samples
	return stream

func play_sound(kind: String) -> void:
	if volume > 0.0 and audio.has(kind):
		audio[kind].pitch_scale = randf_range(0.94,1.06) if kind == "step" else 1.0
		audio[kind].play()

func play_footstep(_frame: int, phase: float, speed: float) -> void:
	if volume<=0.0: return
	audio.step.volume_db = lerpf(-14.0,-10.0,clampf(speed/5.1,0,1))
	audio.step.pitch_scale = (0.97 if fposmod(phase,1.0)<0.5 else 1.03)+randf_range(-0.02,0.02)
	audio.step.play()

func set_volume(value: float) -> void:
	volume = clamp(value,0,0.35)
	AudioServer.set_bus_volume_db(0,linear_to_db(max(volume,0.00001)))
	if audio.has("wind"):
		if volume>0.0 and not audio.wind.playing:
			audio.wind.play()
		elif volume==0.0:
			audio.wind.stop()

func _exit_tree() -> void:
	# Explicitly release looping synthetic audio on scene reload and shutdown.
	for node in audio.values():
		if is_instance_valid(node):
			node.stop()
			node.stream = null
	audio.clear()

func _run_visual_sample() -> void:
	var version = "v2" if "--sample-v2" in OS.get_cmdline_user_args() else "v3"
	ui.root.hide()
	camera.size = 16.6
	camera.position = Vector3(-7.0,13.4,12.6)
	camera.look_at(Vector3(-7.0,2.2,-2.9))
	player.teleport(Vector3(-9.5,0.1,0.6))
	await get_tree().create_timer(0.8).timeout
	await RenderingServer.frame_post_draw
	_save_screenshot(version+"_sample_front.png")
	Input.action_press("move_right")
	for i in range(8):
		await get_tree().create_timer(0.18).timeout
		await RenderingServer.frame_post_draw
		_save_screenshot(version+"_walk_%02d.png" % i)
	Input.action_release("move_right")
	await get_tree().create_timer(0.2).timeout
	print("SAMPLE_FRONT_WALK position=",player.position," stopped=",player.velocity)
	Input.action_press("move_up")
	await get_tree().create_timer(2.65).timeout
	Input.action_release("move_up")
	await get_tree().create_timer(0.2).timeout
	Input.action_press("move_left")
	await get_tree().create_timer(0.9).timeout
	Input.action_release("move_left")
	await get_tree().create_timer(0.3).timeout
	await RenderingServer.frame_post_draw
	_save_screenshot(version+"_sample_behind.png")
	print("SAMPLE_BEHIND position=",player.position)
	get_tree().quit()

func _capture_first_frame() -> void:
	await get_tree().create_timer(1.7).timeout
	ui.toast_left = 0
	ui.toast_panel.hide()
	await RenderingServer.frame_post_draw
	_save_screenshot("v3_after.png")
	print("CAPTURE_COMPLETE")

func _save_screenshot(name: String) -> void:
	var image = get_viewport().get_texture().get_image()
	var path = ProjectSettings.globalize_path("res://evidence/"+name)
	var result = image.save_png(path)
	print("SCREENSHOT ",path," result=",result," size=",image.get_size())

func check(condition: bool, description: String) -> void:
	var result = ("PASS " if condition else "FAIL ")+description
	qa_results.append(result)
	print("QA ",result)

func _run_qa() -> void:
	await get_tree().create_timer(0.65).timeout
	var missing: Array[int] = []
	for text in TownUI.Localizer.TEXT.values():
		for i in range(text.length()):
			var code = text.unicode_at(i)
			if code>31 and not TownUI.ChineseFont.has_char(code) and not missing.has(code):
				missing.append(code)
	check(missing.is_empty(),"Bundled Chinese font covers every translated glyph")
	check(ui.language=="zh" and ui.objective.text.contains("公告牌"),"Chinese HUD is default")
	ui.toggle_language()
	check(ui.language=="en" and ui.objective.text.contains("notice"),"HUD can switch to English")
	ui.toggle_language()
	check(RenderingServer.get_current_rendering_method()=="gl_compatibility","Compatibility renderer")
	check(is_zero_approx(volume),"Muted entrance")
	check(buildings.size()==4 and points.size()==3,"Four volume buildings and three interactions")
	# Input-driven travel checks actual CharacterBody integration and friction.
	var start = player.position
	Input.action_press("move_right")
	await get_tree().create_timer(0.55).timeout
	Input.action_release("move_right")
	await get_tree().create_timer(0.16).timeout
	check(player.position.x > start.x+1.2,"WASD moves courier with acceleration")
	check(abs(player.velocity.x)<0.05,"Release decelerates to rest")
	# Walk north into a solid well; test physics rather than checking node counts.
	player.teleport(Vector3(0.2,0.1,3.0))
	Input.action_press("move_up")
	await get_tree().create_timer(1.0).timeout
	Input.action_release("move_up")
	check(player.position.z>1.25,"Well footprint blocks northward walking")
	check(player.is_on_floor(),"Courier rests on physical ground")
	player.teleport(Vector3(-8.0,0.1,-0.5))
	var inn_blocked = false
	Input.action_press("move_up")
	for frame in range(110):
		await get_tree().physics_frame
		for i in range(player.get_slide_collision_count()):
			inn_blocked = inn_blocked or player.get_slide_collision(i).get_collider()==inn_volume.body
	Input.action_release("move_up")
	print("INN_COLLISION position=",player.position," hit=",inn_blocked)
	check(inn_blocked,"Visible inn footprint blocks northward walking")
	player.teleport(inn_volume.to_global(Vector3(0,0.1,-inn_volume.depth/2-1.25)))
	await get_tree().create_timer(0.7).timeout
	check(courier_occluded(),"Solid architecture occludes courier behind the inn")
	check(inn_volume.get_node("Front").material_override.transparency==BaseMaterial3D.TRANSPARENCY_DISABLED,"Inn stays opaque during occlusion")
	if not OS.has_feature("web"):
		await RenderingServer.frame_post_draw
		_save_screenshot("qa_occlusion.png")
	# Recovery input keeps progression and camera follow alive.
	player.teleport(ARRIVAL)
	await get_tree().create_timer(0.25).timeout
	check(player.position.distance_to(ARRIVAL)<0.3,"Arrival recovery")
	interact("door")
	check(not door_open,"Door stays locked before brass key")
	interact("well")
	check(not has_key,"Well gives guidance before notice")
	player.teleport(Vector3(-4,0.1,3.1))
	await get_tree().create_timer(0.2).timeout
	check(nearest=="board","Noticeboard proximity prompt")
	check(ui.prompt_panel.position.x>=0 and ui.prompt_panel.position.y>=0 and ui.prompt_panel.get_rect().end.y<=ui.root.size.y,"Interaction prompt is inside the viewport")
	var use = InputEventAction.new()
	use.action = "interact"
	use.pressed = true
	Input.parse_input_event(use)
	await get_tree().process_frame
	use = InputEventAction.new()
	use.action = "interact"
	use.pressed = false
	Input.parse_input_event(use)
	check(board_read and ui.modal.visible,"Notice opens readable dialogue")
	ui.close_modal()
	player.teleport(points.door.pos+Vector3(0,0.1,1.3))
	Input.action_press("move_up")
	await get_tree().create_timer(0.35).timeout
	Input.action_release("move_up")
	await get_tree().create_timer(0.15).timeout
	check(nearest=="door" and player.position.distance_to(points.door.pos)<1.2,"Inn doorway can be approached on foot")
	interact("well")
	await get_tree().create_timer(1.7).timeout
	check(has_key and not busy and not player.locked,"Well retrieval finishes and returns movement")
	interact("door")
	check(door_open,"Brass key opens inn and completes errand")
	await get_tree().create_timer(1.25).timeout
	check(inn_volume.door_hinge.rotation.y < -0.9,"Oak door physically swings on its hinge")
	ui.show_pause()
	var position_before_pause = player.position
	await get_tree().create_timer(0.25,true).timeout
	check(get_tree().paused and player.position.distance_to(position_before_pause)<0.01,"Pause freezes scene")
	ui.close_modal()
	check(not get_tree().paused and not player.locked,"Resume restores movement")
	set_volume(0.14)
	check(volume>0 and AudioServer.get_bus_volume_db(0)<-10,"Low-volume sound option")
	set_volume(0.0)
	# Viewport PNGs use the rendered game, not a concept image.
	player.teleport(ARRIVAL)
	ui.toast_left=0
	ui.toast_panel.hide()
	await get_tree().create_timer(0.6).timeout
	if not OS.has_feature("web"):
		await RenderingServer.frame_post_draw
		_save_screenshot("qa_playable.png")
		get_window().size=Vector2i(960,600)
		await get_tree().create_timer(0.4).timeout
		await RenderingServer.frame_post_draw
		_save_screenshot("qa_960x600.png")
		check(get_window().size==Vector2i(960,600),"Window resize 960x600")
		get_window().size=Vector2i(720,600)
		await get_tree().create_timer(0.3).timeout
		ui.show_note()
		await RenderingServer.frame_post_draw
		_save_screenshot("v3_note_720x600.png")
		check(ui.controls_box.position.y<ui.buttons_box.position.y-30,"Narrow HUD separates controls and buttons")
		check(ui.modal.get_child(ui.modal.get_child_count()-1).size.x<=get_window().size.x-40,"Narrow note stays inside window")
		ui.close_modal()
		ui.show_pause()
		await RenderingServer.frame_post_draw
		_save_screenshot("v3_pause_720x600.png")
		ui.close_modal()
		var file = FileAccess.open("res://evidence/qa_results.txt",FileAccess.WRITE)
		file.store_string("\n".join(qa_results)+"\n")
		file.close()
	print("QA_COMPLETE checks=",qa_results.size())
	if not OS.has_feature("web"):
		get_tree().quit(1 if "FAIL" in "\n".join(qa_results) else 0)

func courier_occluded() -> bool:
	var q = PhysicsRayQueryParameters3D.create(camera.global_position,player.global_position+Vector3(0,1.15,0),1)
	var result = get_world_3d().direct_space_state.intersect_ray(q)
	return not result.is_empty() and result.collider.is_in_group("architecture")

func _run_reload_check() -> void:
	var marker = "user://qa_reload.marker"
	if not FileAccess.file_exists(marker):
		board_read=true
		has_key=true
		door_open=true
		set_volume(0.14)
		player.teleport(Vector3(6,0.1,3))
		var f = FileAccess.open(marker,FileAccess.WRITE)
		f.store_string("reload requested")
		f.close()
		await get_tree().create_timer(0.4).timeout
		print("QA_RELOAD_REQUESTED")
		get_tree().reload_current_scene()
	else:
		DirAccess.remove_absolute(ProjectSettings.globalize_path(marker))
		check(not board_read and not has_key and not door_open,"Scene reload resets errand state")
		check(volume==0 and not get_tree().paused,"Scene reload returns quiet unpaused entrance")
		check(player.position.distance_to(ARRIVAL)<0.1,"Scene reload restores courier")
		await get_tree().create_timer(0.6).timeout
		check(is_instance_valid(ui.root) and player.is_on_floor(),"Scene reload rebuilds HUD and floor collision")
		check(ui.toast_panel.position.x>=0 and ui.toast_panel.position.y>=0 and ui.toast_panel.get_rect().end.y<=ui.root.size.y,"Scene reload keeps entrance toast on screen")
		var f = FileAccess.open("res://evidence/qa_reload.txt",FileAccess.WRITE)
		f.store_string("\n".join(qa_results)+"\n")
		f.close()
		print("QA_RELOAD_COMPLETE")
		get_tree().quit(1 if "FAIL" in "\n".join(qa_results) else 0)
