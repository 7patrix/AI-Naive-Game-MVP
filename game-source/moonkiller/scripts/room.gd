extends Node3D
## Small physical cutaway room, never a flat fullscreen backdrop.
var town: Node3D
var kind := "inn"
var warm: OmniLight3D

func _ready() -> void:
	var timber = _material("res://assets/art/v3/timber.png")
	var floor_mat = _material("res://assets/art/v3/timber.png" if kind == "inn" else "res://assets/art/paving.png")
	floor_mat.uv1_scale = Vector3(4,3,1)
	_box("Floor",Vector3(0,-0.16,0),Vector3(12,0.32,8),floor_mat)
	_box("RearWall",Vector3(0,1.7,-4.05),Vector3(12,3.4,0.16),timber,true)
	var wall = MeshInstance3D.new()
	var plane = QuadMesh.new()
	plane.size = Vector2(12,3.4)
	wall.mesh = plane
	wall.position = Vector3(0,1.7,-3.95)
	wall.material_override = _material("res://assets/art/first_night/%s_wall.png" % ("inn" if kind == "inn" else "apothecary"))
	add_child(wall)
	for x in [-6.0,6.0]:
		_box("SideWall",Vector3(x,0.85,0),Vector3(0.15,1.7,8),timber,true)
	# Invisible front boundary leaves a readable cutaway and an accessible threshold.
	_boundary(Vector3(0,0.8,4.08),Vector3(12,1.6,0.16),true)
	_box("Threshold",Vector3(0,0.035,3.35),Vector3(2.4,0.07,0.5),timber)
	for p in [Vector3(3.7,0,-1.8),Vector3(-3.5,0,1.1)]:
		var prop = town.art("bench" if kind == "inn" else "supplies",global_position+p,1.1)
		prop.reparent(self,true)
		_boundary(p+Vector3(0,0.45,-0.15),Vector3(1.7,0.9,0.6),false)
		var shadow = Node3D.new()
		shadow.position = p
		add_child(shadow)
		town.add_shadow(shadow,Vector2(2.2,0.9))
	warm = OmniLight3D.new()
	warm.position = Vector3(-3.1,2,-2.4)
	warm.light_color = Color("ffca83") if kind == "inn" else Color("baceac")
	warm.light_energy = 1.7
	warm.omni_range = 8
	add_child(warm)

func _material(path: String) -> StandardMaterial3D:
	var mat = StandardMaterial3D.new()
	mat.albedo_texture = load(path)
	mat.roughness = 1
	mat.cull_mode = BaseMaterial3D.CULL_DISABLED
	return mat

func _box(label: String, pos: Vector3, size: Vector3, mat: Material, architecture := false) -> void:
	var mesh = MeshInstance3D.new()
	mesh.name = label
	mesh.position = pos
	var shape = BoxMesh.new()
	shape.size = size
	mesh.mesh = shape
	mesh.material_override = mat
	add_child(mesh)
	_boundary(pos,size,architecture)

func _boundary(pos: Vector3, size: Vector3, architecture: bool) -> void:
	var body = StaticBody3D.new()
	body.position = pos
	body.collision_layer = 1
	body.collision_mask = 2
	if architecture: body.add_to_group("architecture")
	var collider = CollisionShape3D.new()
	var box = BoxShape3D.new()
	box.size = size
	collider.shape = box
	body.add_child(collider)
	add_child(body)
