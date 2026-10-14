extends Node
## Real input/physics animation tests and one continuous fixed-camera recording.
var town: Node3D
var mode := "qa"
var results: Array[String] = []
var recording := false
var saving := false
var capture_elapsed := 0.0
var capture_accum := 0.0
var captures: Array[Dictionary] = []

func _ready() -> void:
	call_deferred("_run")

func _run() -> void:
	town.sample_mode = true
	town.ui.root.hide()
	town.camera.size = 9.3
	town.camera.position = Vector3(0,14.2,24.3)
	town.camera.look_at(Vector3(0,1.0,6.0))
	if mode == "record":
		await _record()
	else:
		await _qa()

func _ticks(count: int) -> void:
	for i in range(count):
		await get_tree().physics_frame

func _press(actions: Array) -> void:
	for a in actions:
		Input.action_press(a)

func _release(actions: Array) -> void:
	for a in actions:
		Input.action_release(a)

func _check(ok: bool, description: String) -> void:
	var line = ("PASS " if ok else "FAIL ")+description
	results.append(line)
	print("ANIM_QA ",line)

func _qa() -> void:
	var p = town.player
	await _ticks(12)
	for data in [["move_down","front"],["move_up","back"],["move_right","right"],["move_left","left"]]:
		p.teleport(Vector3(0,0.1,8.0))
		var start_distance: float = p.travel_total
		var frames_seen: Dictionary = {}
		_press([data[0]])
		for tick in range(48):
			await get_tree().physics_frame
			frames_seen[p.frame_index] = true
		_check(p.facing==data[1],data[1]+" view follows actual travel")
		_check(frames_seen.size()>=7 and p.is_walking,data[1]+" cycles through painted stepping frames")
		_check(not p.sprite.flip_h and not p.head.flip_h and p.head.texture==p.heads[data[1]],data[1]+" stable identity and explicit non-mirrored view")
		_check(abs(p.gait_phase*p.STRIDE_DISTANCE-(p.travel_total-start_distance))<0.002,data[1]+" cadence equals actual travelled distance")
		_release([data[0]])
		await _ticks(18)
		_check(p.frame_index==0 and not p.is_walking and p.actual_speed<0.05,data[1]+" release returns to standing")
	for actions in [["move_up","move_right"],["move_up","move_left"],["move_down","move_right"],["move_down","move_left"]]:
		p.teleport(Vector3(0,0.1,8))
		_press(actions)
		var previous: String = p.facing
		var changes = 0
		for tick in range(36):
			await get_tree().physics_frame
			if p.facing!=previous:
				changes += 1
				previous = p.facing
		_check(changes<=1 and p.is_walking,"Diagonal "+str(actions)+" retains stable direction family")
		_release(actions)
		await _ticks(15)
		_check(p.frame_index==0,"Diagonal release rests")
	p.teleport(Vector3(0,0.1,8))
	_press(["move_right"])
	await _ticks(48)
	var normal_phase: float = p.gait_phase
	_release(["move_right"])
	await _ticks(18)
	p.teleport(Vector3(0,0.1,8))
	_press(["move_right","hurry"])
	await _ticks(48)
	_check(p.gait_phase>normal_phase*1.25,"Shift increases stepping cadence through faster real travel")
	_release(["move_right","hurry"])
	await _ticks(18)
	for wall in [["move_down",Vector3(0,0.1,11.85)],["move_up",Vector3(0,0.1,-10.75)],["move_right",Vector3(17.8,0.1,7)],["move_left",Vector3(-17.8,0.1,5)]]:
		p.teleport(wall[1])
		_press([wall[0]])
		await _ticks(60)
		var stopped_phase: float = p.gait_phase
		var stopped_position: Vector3 = p.position
		await _ticks(36)
		_check(abs(p.gait_phase-stopped_phase)<0.0001 and p.position.distance_to(stopped_position)<0.02 and p.frame_index==0,"Holding "+wall[0]+" into wall does not slide or step in place")
		_release([wall[0]])
		await _ticks(12)
	p.teleport(Vector3(0,0.1,8))
	_press(["move_right"])
	await _ticks(25)
	town.ui.show_pause()
	var paused_phase: float = p.gait_phase
	var paused_position: Vector3 = p.position
	var paused_frame: int = p.frame_index
	await get_tree().create_timer(0.25,true).timeout
	_check(get_tree().paused and p.gait_phase==paused_phase and p.frame_index==paused_frame and p.position==paused_position,"Pause freezes motion and gait together")
	town.ui.close_modal()
	await _ticks(25)
	_check(p.gait_phase>paused_phase and p.is_walking,"Resume restores stepping without reset flash")
	_release(["move_right"])
	await _ticks(18)
	_check(abs(p.shadow.global_position.x-p.global_position.x)<0.001 and abs(p.shadow.global_position.z-p.global_position.z)<0.001 and is_equal_approx(p.sprite.position.y,0.015),"Feet/shadow anchor stays fixed; no whole-sprite bob")
	p.teleport(town.ARRIVAL)
	town.ui.root.show()
	town.sample_mode = false
	if not OS.has_feature("web"):
		var f = FileAccess.open("res://evidence/animation_v4/qa_results.txt",FileAccess.WRITE)
		f.store_string("\n".join(results)+"\n")
		f.close()
	print("ANIMATION_QA_COMPLETE checks=",results.size())
	if not OS.has_feature("web"):
		get_tree().quit(1 if "FAIL" in "\n".join(results) else 0)

func _segment(actions: Array, ticks: int) -> void:
	_press(actions)
	await _ticks(ticks)
	_release(actions)

func _record() -> void:
	if OS.has_feature("web"):
		print("ANIMATION_RECORD_NATIVE_ONLY")
		return
	get_window().size = Vector2i(960,600)
	town.player.teleport(Vector3(-3.8,0.1,8.0))
	await _ticks(24)
	recording = true
	await _ticks(35)
	await _segment(["move_right"],90)
	await _ticks(30)
	await _segment(["move_up"],60)
	await _ticks(20)
	await _segment(["move_left"],85)
	await _ticks(20)
	await _segment(["move_down"],60)
	await _ticks(30)
	await _segment(["move_up","move_right"],40)
	await _ticks(20)
	await _segment(["move_right","hurry"],40)
	await _ticks(40)
	recording = false
	while saving:
		await get_tree().process_frame
	var f = FileAccess.open("res://evidence/animation_v4/continuous_trace.json",FileAccess.WRITE)
	f.store_string(JSON.stringify({"fixed_camera":true,"teleports_during_recording":0,"frames":captures},"\t"))
	f.close()
	print("ANIMATION_RECORD_COMPLETE frames=",captures.size()," duration=",capture_elapsed)
	get_tree().quit()

func _process(delta: float) -> void:
	if not recording:
		return
	capture_elapsed += delta
	capture_accum += delta
	if capture_accum<1.0/18.0 or saving:
		return
	capture_accum = 0
	saving = true
	await RenderingServer.frame_post_draw
	var name = "frame_%04d.jpg" % captures.size()
	get_viewport().get_texture().get_image().save_jpg("res://evidence/animation_v4/"+name,0.93)
	var p = town.player
	var screen = town.camera.unproject_position(p.position)
	captures.append({"file":name,"time":capture_elapsed,"position":[p.position.x,p.position.y,p.position.z],"screen":[screen.x,screen.y],"facing":p.facing,"frame":p.frame_index,"phase":p.gait_phase,"speed":p.actual_speed,"walking":p.is_walking})
	saving = false
