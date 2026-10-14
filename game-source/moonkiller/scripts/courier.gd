extends CharacterBody3D

var sprite: Sprite3D
var shadow: MeshInstance3D
var lantern: OmniLight3D
var facing := "front"
var walk_time := 0.0
var step_time := 0.0
var locked := false
var frames: Array[Texture2D] = []
var last_move := Vector2.ZERO
var town: Node3D
var pace := 3.7

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
	for i in range(6):
		frames.append(load("res://assets/art/courier_%d.png" % i))
	sprite = Sprite3D.new()
	sprite.texture = frames[0]
	sprite.pixel_size = 2.25 / float(frames[0].get_height())
	sprite.offset.y = frames[0].get_height() * 0.5 - 5
	sprite.billboard = BaseMaterial3D.BILLBOARD_FIXED_Y
	sprite.no_depth_test = false
	sprite.shaded = true
	sprite.alpha_cut = SpriteBase3D.ALPHA_CUT_DISCARD
	sprite.alpha_scissor_threshold = 0.12
	add_child(sprite)
	lantern = OmniLight3D.new()
	lantern.light_color = Color(1.0, 0.67, 0.3)
	lantern.light_energy = 0.7
	lantern.omni_range = 2.5
	lantern.position = Vector3(-0.28, 0.8, 0.3)
	add_child(lantern)
	shadow = town.add_shadow(self, Vector2(0.68,0.50))
	add_to_group("courier")

func _physics_process(delta: float) -> void:
	var input = Vector2.ZERO
	if not locked:
		input = Input.get_vector("move_left", "move_right", "move_up", "move_down")
	last_move = input
	var speed = pace * (1.38 if Input.is_action_pressed("hurry") else 1.0)
	var target = Vector3(input.x,0,input.y) * speed
	var accel = 24.0 if input.length() > 0.01 else 32.0
	velocity.x = move_toward(velocity.x, target.x, accel * delta)
	velocity.z = move_toward(velocity.z, target.z, accel * delta)
	if not is_on_floor():
		velocity.y -= 18.0 * delta
	else:
		velocity.y = -0.3
	move_and_slide()
	var moving = Vector2(velocity.x,velocity.z).length() > 0.15
	if input.length() > 0.05:
		if abs(input.x) > abs(input.y) * 1.2:
			facing = "side"
			sprite.flip_h = input.x < 0.0
		else:
			facing = "back" if input.y < 0 else "front"
			sprite.flip_h = false
	if moving:
		walk_time += delta * speed * 2.7
		step_time += delta * speed
		if step_time > 1.55:
			step_time = 0
			town.play_sound("step")
	var phase = int(walk_time) % 2
	var index = 0
	if facing == "side":
		index = 5
	elif facing == "back":
		index = 3 + (phase if moving else 0)
	else:
		index = 1 + phase if moving else 0
	sprite.texture = frames[index]
	# A gentle paper puppet bob supplements the stable painted poses.
	sprite.position.y = 0.015 if moving else 0.0
	sprite.rotation.z = sin(walk_time * PI) * 0.009 if moving else 0.0
	lantern.light_energy = 0.55 + sin(Time.get_ticks_msec()*0.007) * 0.08

func teleport(to: Vector3) -> void:
	global_position = to
	velocity = Vector3.ZERO
