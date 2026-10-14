extends Node3D
## Fixed architecture: hand-painted flat elevations on real walls and roofs.
## Geometry, collision and doorway all share this local coordinate system.

var kind := "inn"
var width := 5.8
var depth := 3.6
var wall_height := 6.2
var roof_height := 2.5
var door_hinge: Node3D
var body: StaticBody3D
var hanging_sign: Node3D
var door_local := Vector3(-1.6,0,1.83)
var material_cache: Dictionary = {}

func _ready() -> void:
	add_to_group("architecture")
	var z = depth*0.5
	var x = width*0.5
	var h = wall_height
	var front_name = "inn_front" if kind == "inn" else kind+"_front"
	var front = material(front_name)
	var side_name = "side" if kind == "inn" else ("side2" if kind == "archive" else "side1")
	quad("Front",[Vector3(-x,0,z),Vector3(x,0,z),Vector3(x+0.08,h,z),Vector3(-x+0.05,h,z)],front)
	quad("Back",[Vector3(x,0,-z),Vector3(-x,0,-z),Vector3(-x+0.05,h,-z),Vector3(x+0.08,h,-z)],material(side_name,Color("b1b3aa")))
	quad("RightWall",[Vector3(x,0,z),Vector3(x,0,-z),Vector3(x+0.08,h,-z),Vector3(x+0.08,h,z)],material(side_name,Color("bec6bf")))
	quad("LeftWall",[Vector3(-x,0,-z),Vector3(-x,0,z),Vector3(-x+0.05,h,z),Vector3(-x+0.05,h,-z)],material(side_name,Color("aebbb5")))
	# Each roof slope is a physical surface. The slight sag breaks ruler-straight silhouettes.
	var profile = [Vector2(-x-0.35,h-0.18),Vector2(-x*0.66,h+0.48),Vector2(-0.15,h+roof_height),Vector2(x*0.62,h+0.62),Vector2(x+0.38,h-0.14)]
	if kind == "forge":
		profile = [Vector2(-x-0.32,h-0.12),Vector2(-x*0.72,h+0.55),Vector2(-0.6,h+roof_height),Vector2(x*0.68,h+0.38),Vector2(x+0.36,h-0.15)]
	for i in range(profile.size()-1):
		var a: Vector2 = profile[i]
		var b: Vector2 = profile[i+1]
		quad("RoofSlope",[Vector3(a.x,a.y,z+0.34),Vector3(a.x,a.y,-z-0.34),Vector3(b.x,b.y,-z-0.34),Vector3(b.x,b.y,z+0.34)],material("slate"),Vector2(depth/1.55,a.distance_to(b)/1.6))
		beam(Vector3(a.x,a.y,z+0.35),Vector3(b.x,b.y,z+0.35),0.12)
		beam(Vector3(a.x,a.y,-z-0.35),Vector3(b.x,b.y,-z-0.35),0.12)
	var points_front: Array[Vector3] = []
	for p in profile:
		points_front.append(Vector3(p.x,p.y,z+0.02))
	polygon("FrontGable",points_front,material("plaster"))
	for i in range(points_front.size()):
		points_front[i].z = -z-0.02
	polygon("RearGable",points_front,material("plaster",Color("a8b3ad")))
	beam(Vector3(-x,h,z+0.04),Vector3(x,h,z+0.04),0.16)
	beam(Vector3(-0.15,h,z+0.045),Vector3(-0.15,h+roof_height,z+0.045),0.14)
	beam(Vector3(-x*0.68,h,z+0.046),Vector3(-0.15,h+roof_height*0.87,z+0.046),0.09)
	beam(Vector3(x*0.70,h,z+0.046),Vector3(-0.15,h+roof_height*0.87,z+0.046),0.09)
	box("Ridge",Vector3(-0.15,h+roof_height,0),Vector3(0.17,0.13,depth+0.7),material("timber"))
	# Small projecting sills and real timber cornices lend the drawing thickness.
	var cornices = [h/3.0,2.0*h/3.0,h] if kind == "inn" else ([h*0.51,h] if kind == "archive" else [h])
	for y in cornices:
		box("FrontCornice",Vector3(0,y,z+0.055),Vector3(width+0.15,0.10,0.16),material("timber"))
		box("SideCornice",Vector3(x+0.045,y,0),Vector3(0.13,0.10,depth),material("timber"))
	if kind == "inn":
		for y in [h*0.54,h*0.87]:
			for sx in [-2.02,-0.99,0.08,1.13,2.21]:
				box("WindowSill",Vector3(sx*width/5.8,y-0.55,z+0.08),Vector3(0.72*width/5.8,0.10,0.21),material("timber"))
		quad("AtticWindow",[Vector3(-0.60,h+0.2,z+0.055),Vector3(0.35,h+0.2,z+0.055),Vector3(0.35,h+1.72,z+0.055),Vector3(-0.60,h+1.72,z+0.055)],material("attic_window"))
	box("StonePlinth",Vector3(0,0.19,0),Vector3(width+0.12,0.38,depth+0.10),material("stone"))
	# Chimney with cap and soot throat is volume, so its occlusion moves with the roof.
	var chimney = Vector3(x*0.63,h+1.28,-z*0.62)
	box("Chimney",chimney,Vector3(0.55,2.9,0.64),material("stone",Color("c0c1b2")))
	box("ChimneyCap",chimney+Vector3(0,1.48,0),Vector3(0.72,0.14,0.78),material("stone"))
	box("ChimneyThroat",chimney+Vector3(0,1.58,0),Vector3(0.36,0.12,0.40),material("timber",Color("444b48")))
	if kind == "inn":
		_build_inn_details(z,x,h)
	elif kind == "archive":
		_build_clock_tower(z,h)
	elif kind == "apothecary":
		_build_shop_sign(z,"Herb",Color("889477"))
		for bx in [-width*0.31,width*0.31]:
			box("BayWindowCase",Vector3(bx,1.32,z+0.13),Vector3(1.5,1.3,0.28),material("timber"))
			quad("BayWindowGlass",[Vector3(bx-0.70,0.73,z+0.28),Vector3(bx+0.70,0.73,z+0.28),Vector3(bx+0.70,1.91,z+0.28),Vector3(bx-0.70,1.91,z+0.28)],material("shop_window"))
			box("BaySill",Vector3(bx,0.73,z+0.21),Vector3(1.7,0.1,0.48),material("timber"))
	else:
		_build_shop_sign(z,"Anvil",Color("7f8a8b"))
	# Visible outer walls and collider use the same yaw and footprint.
	body = StaticBody3D.new()
	body.name = kind.capitalize()+"Volume"
	body.collision_layer = 1
	body.collision_mask = 2
	body.add_to_group("architecture")
	var shape = CollisionShape3D.new()
	var footprint = BoxShape3D.new()
	footprint.size = Vector3(width+0.16,wall_height,depth+0.12)
	shape.shape = footprint
	shape.position.y = wall_height*0.5
	body.add_child(shape)
	add_child(body)

func material(texture_name: String, tint := Color.WHITE) -> StandardMaterial3D:
	var key = texture_name+str(tint)
	if material_cache.has(key):
		return material_cache[key]
	var m = StandardMaterial3D.new()
	m.albedo_texture = load("res://assets/art/v3/"+texture_name+".png")
	m.albedo_color = tint
	m.roughness = 1.0
	m.diffuse_mode = BaseMaterial3D.DIFFUSE_LAMBERT_WRAP
	m.specular_mode = BaseMaterial3D.SPECULAR_DISABLED
	m.cull_mode = BaseMaterial3D.CULL_DISABLED
	m.texture_filter = BaseMaterial3D.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS
	material_cache[key] = m
	return m

func quad(label: String, p: Array, m: Material, uv_scale := Vector2.ONE) -> MeshInstance3D:
	var st = SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var normal: Vector3 = (p[1]-p[0]).cross(p[2]-p[0]).normalized()
	if label.contains("Roof") and normal.y < 0:
		normal = -normal
	var uv = [Vector2(0,1),Vector2(1,1),Vector2(1,0),Vector2(0,0)]
	for i in [0,1,2,0,2,3]:
		st.set_normal(normal)
		st.set_uv(uv[i]*uv_scale)
		st.add_vertex(p[i])
	var node = MeshInstance3D.new()
	node.name = label
	node.mesh = st.commit()
	node.material_override = m
	add_child(node)
	return node

func polygon(label: String, points: Array[Vector3], m: Material) -> MeshInstance3D:
	var st = SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var min_y = wall_height-0.18
	for i in range(1,points.size()-1):
		for p in [points[0],points[i],points[i+1]]:
			st.set_normal(Vector3(0,0,1))
			st.set_uv(Vector2((p.x+width/2)/width,1-(p.y-min_y)/roof_height))
			st.add_vertex(p)
	var node = MeshInstance3D.new()
	node.name = label
	node.mesh = st.commit()
	node.material_override = m
	add_child(node)
	return node

func box(label: String, pos: Vector3, size: Vector3, m: Material) -> MeshInstance3D:
	var node = MeshInstance3D.new()
	node.name = label
	var mesh = BoxMesh.new()
	mesh.size = size
	node.mesh = mesh
	node.material_override = m
	node.position = pos
	add_child(node)
	return node

func beam(a: Vector3, b: Vector3, thickness: float) -> MeshInstance3D:
	var node = box("InkTimber",(a+b)*0.5,Vector3(thickness,a.distance_to(b),thickness),material("timber"))
	if a.distance_to(b)>0.01:
		node.quaternion = Quaternion(Vector3.UP,(b-a).normalized())
	return node

func _build_inn_details(z: float, _x: float, h: float) -> void:
	# Door fits the dark opening in the flat elevation; hinge is real and independent.
	door_local = Vector3(-width*0.285,0,z+0.025)
	door_hinge = Node3D.new()
	door_hinge.name = "InnDoorHinge"
	door_hinge.position = door_local+Vector3(-0.46,0.03,0.025)
	add_child(door_hinge)
	var door = box("OakDoor",Vector3.ZERO,Vector3(0.91,1.80,0.055),material("door"))
	remove_child(door)
	door_hinge.add_child(door)
	door.position = Vector3(0.455,0.90,0)
	box("Threshold",door_local+Vector3(0,0.045,0.25),Vector3(1.16,0.09,0.52),material("stone"))
	box("DoorLintel",door_local+Vector3(0,1.85,0.04),Vector3(1.14,0.14,0.17),material("timber"))
	# Crooked slate canopy and bracket supports: two planes and edge beams.
	var awning_y = h/3.0+0.22
	quad("PorchRoof",[Vector3(-width/2-0.16,awning_y-0.40,z+0.95),Vector3(-width/2-0.16,awning_y,z),Vector3(width/2+0.14,awning_y,z),Vector3(width/2+0.14,awning_y-0.34,z+0.95)],material("slate"),Vector2(0.72,width/1.6))
	beam(Vector3(-width/2-0.16,awning_y-0.4,z+0.95),Vector3(width/2+0.14,awning_y-0.34,z+0.95),0.13)
	for bx in [-width/2+0.16,width/2-0.16]:
		beam(Vector3(bx,1.3,z+0.12),Vector3(bx,awning_y-0.4,z+0.84),0.12)
	_build_shop_sign(z,"Moth",Color("c4ab65"))
	var glow = OmniLight3D.new()
	glow.position = door_local+Vector3(0,1.1,0.45)
	glow.light_color = Color("f5b96a")
	glow.light_energy = 0.75
	glow.omni_range = 3.4
	add_child(glow)

func _build_shop_sign(z: float, label: String, tint: Color) -> void:
	beam(Vector3(-width/2+0.2,wall_height*0.59,z),Vector3(-width/2-0.55,wall_height*0.59,z+0.4),0.07)
	hanging_sign = Node3D.new()
	hanging_sign.position = Vector3(-width/2-0.43,wall_height*0.59,z+0.37)
	add_child(hanging_sign)
	var sign = MeshInstance3D.new()
	var disc = CylinderMesh.new()
	disc.top_radius = 0.40
	disc.bottom_radius = 0.40
	disc.height = 0.075
	disc.radial_segments = 32
	sign.mesh = disc
	sign.position.y = -0.48
	sign.rotation.x = PI/2
	sign.material_override = material("timber",tint)
	hanging_sign.add_child(sign)
	var face = Sprite3D.new()
	face.texture = load("res://assets/art/v3/"+label.to_lower()+".png")
	face.pixel_size = 0.79/float(face.texture.get_width())
	face.position = Vector3(0,-0.48,0.045)
	face.shaded = true
	face.alpha_cut = SpriteBase3D.ALPHA_CUT_DISCARD
	hanging_sign.add_child(face)
	for sx in [-0.18,0.18]:
		var chain = beam(hanging_sign.position+Vector3(sx,0,0),hanging_sign.position+Vector3(sx,-0.23,0),0.023)
		chain.name = "SignChain"

func _build_clock_tower(z: float, h: float) -> void:
	box("ClockTower",Vector3(0,h+1.9,-0.35),Vector3(1.65,3.4,1.7),material("stone"))
	var face = Sprite3D.new()
	face.texture = load("res://assets/art/v3/clock.png")
	face.pixel_size = 1.44/float(face.texture.get_width())
	face.position = Vector3(0,h+2.25,0.515)
	face.shaded = true
	face.alpha_cut = SpriteBase3D.ALPHA_CUT_DISCARD
	add_child(face)
	var spire = MeshInstance3D.new()
	var cone = CylinderMesh.new()
	cone.top_radius = 0
	cone.bottom_radius = 1.25
	cone.height = 2.4
	cone.radial_segments = 4
	spire.mesh = cone
	spire.material_override = material("slate")
	spire.position = Vector3(0,h+4.8,-0.35)
	spire.rotation.y = PI/4
	add_child(spire)
	beam(Vector3(0,h+6.0,-0.35),Vector3(0,h+6.7,-0.35),0.065)

func _process(delta: float) -> void:
	if hanging_sign:
		hanging_sign.rotation.z = sin(Time.get_ticks_msec()*0.0015)*0.035
	if door_hinge:
		var target = deg_to_rad(-74) if get_parent().door_open else 0.0
		door_hinge.rotation.y = move_toward(door_hinge.rotation.y,target,delta*1.1)

func door_approach() -> Vector3:
	return to_global(door_local+Vector3(0,0,1.05))
