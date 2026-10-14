extends CharacterBody3D
## Painted stepping bodies with stable heads, driven only by actual ground travel.
const CANVAS_H := 643.0
const BODY_CUT := 278
const HEAD_H := 286
const PIXEL_SIZE := 2.25/CANVAS_H
const STRIDE_DISTANCE := 2.05
signal foot_contact(frame: int, phase: float, speed: float)
var sprite: Sprite3D
var head: Sprite3D
var shadow: MeshInstance3D
var lantern: OmniLight3D
var facing := "front"
var gait_phase := 0.0
var travel_total := 0.0
var actual_speed := 0.0
var frame_index := 0
var is_walking := false
var locked := false
var bodies: Dictionary = {}
var heads: Dictionary = {}
var head_shift: Dictionary = {"front":14.0,"back":11.0,"right":8.0,"left":0.0}
var last_move := Vector2.ZERO
var town: Node3D
var pace := 3.7
var last_step := -1
var frame_changes := 0

func _ready() -> void:
	collision_layer = 2
	collision_mask = 1
	floor_snap_length = 0.3
	var shape = CollisionShape3D.new()
	var capsule = CapsuleShape3D.new()
	capsule.radius = 0.28
	capsule.height = 1.25
	shape.shape = capsule
	shape.position.y = 0.64
	add_child(shape)
	for direction in ["front","back","right","left"]:
		var frames: Array[Texture2D] = []
		for i in range(9):
			var texture: Texture2D = load("res://assets/art/v4/%s_%d.png" % [direction,i])
			var cropped = AtlasTexture.new()
			cropped.atlas = texture
			cropped.region = Rect2(0,BODY_CUT,720,643-BODY_CUT)
			frames.append(cropped)
		bodies[direction] = frames
		var source: Texture2D
		if direction == "left":
			source = load("res://assets/art/v4/left_0.png")
		else:
			var reference = 0 if direction=="front" else (3 if direction=="back" else 5)
			source = load("res://assets/art/courier_%d.png" % reference)
		var head_crop = AtlasTexture.new()
		head_crop.atlas = source
		head_crop.region = Rect2(0,0,720 if direction=="left" else 434,HEAD_H)
		heads[direction] = head_crop
	sprite = paper_sprite()
	sprite.offset.y = (CANVAS_H-BODY_CUT)*0.5-5
	sprite.position.y = 0.015
	head = paper_sprite()
	head.position.z = 0.003
	lantern = OmniLight3D.new()
	lantern.light_color = Color(1.0,0.67,0.3)
	lantern.light_energy = 0.7
	lantern.omni_range = 2.5
	add_child(lantern)
	shadow = town.add_shadow(self,Vector2(0.68,0.50))
	foot_contact.connect(town.play_footstep)
	add_to_group("courier")
	_apply_pose()

func paper_sprite() -> Sprite3D:
	var s = Sprite3D.new()
	s.pixel_size = PIXEL_SIZE
	s.billboard = BaseMaterial3D.BILLBOARD_FIXED_Y
	s.no_depth_test = false
	s.shaded = true
	s.alpha_cut = SpriteBase3D.ALPHA_CUT_DISCARD
	s.alpha_scissor_threshold = 0.12
	s.texture_filter = BaseMaterial3D.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS
	add_child(s)
	return s

func _physics_process(delta: float) -> void:
	var input = Vector2.ZERO
	if not locked:
		input = Input.get_vector("move_left","move_right","move_up","move_down")
	last_move = input
	var speed = pace*(1.38 if Input.is_action_pressed("hurry") else 1.0)
	var target = Vector3(input.x,0,input.y)*speed
	var accel = 24.0 if input.length()>0.01 else 32.0
	velocity.x = move_toward(velocity.x,target.x,accel*delta)
	velocity.z = move_toward(velocity.z,target.z,accel*delta)
	if locked:
		velocity.x = 0
		velocity.z = 0
	velocity.y = -0.3 if is_on_floor() else velocity.y-18.0*delta
	var before = global_position
	move_and_slide()
	var displacement = Vector2(global_position.x-before.x,global_position.z-before.z)
	actual_speed = displacement.length()/max(delta,0.0001)
	is_walking = not locked and actual_speed>0.12
	var landing := false
	if is_walking:
		_choose_facing(displacement)
		var distance = displacement.length()
		travel_total += distance
		gait_phase += distance/STRIDE_DISTANCE
		var step = int(floor(gait_phase*2.0))
		if step != last_step:
			last_step = step
			landing = true
	elif input.length()>0.05:
		_choose_facing(input)
	var next = 1+int(floor(fposmod(gait_phase,1.0)*8.0)) if is_walking else 0
	if next != frame_index:
		frame_changes += 1
	frame_index = next
	_apply_pose()
	if landing:
		foot_contact.emit(frame_index,gait_phase,actual_speed)

func _choose_facing(direction: Vector2) -> void:
	var was_horizontal = facing=="left" or facing=="right"
	var horizontal = abs(direction.x)>abs(direction.y)*(0.83 if was_horizontal else 1.20)
	if horizontal and abs(direction.x)>0.001:
		facing = "left" if direction.x<0 else "right"
	elif abs(direction.y)>0.001:
		facing = "back" if direction.y<0 else "front"

func _apply_pose() -> void:
	sprite.texture = bodies[facing][frame_index]
	head.texture = heads[facing]
	head.offset.y = CANVAS_H-HEAD_H*0.5-5-head_shift[facing]
	# A tiny head weight shift supplements the real painted legs; no whole-sprite bob.
	head.position.y = 0.015+(sin(gait_phase*TAU*2.0)*0.006 if is_walking else 0.0)
	head.position.x = sin(gait_phase*TAU)*0.009 if is_walking else 0.0
	sprite.flip_h = false
	head.flip_h = false
	sprite.rotation.z = 0
	match facing:
		"front": lantern.position=Vector3(-0.29,0.78,0.16)
		"back": lantern.position=Vector3(0.29,0.78,-0.10)
		"right": lantern.position=Vector3(0.35,0.78,0.13)
		"left": lantern.position=Vector3(-0.34,0.78,-0.13)
	lantern.light_energy = 0.55+sin(Time.get_ticks_msec()*0.007)*0.08

func teleport(to: Vector3) -> void:
	global_position = to
	velocity = Vector3.ZERO
	actual_speed = 0
	is_walking = false
	frame_index = 0
	gait_phase = 0
	last_step = -1
	if sprite:
		_apply_pose()
