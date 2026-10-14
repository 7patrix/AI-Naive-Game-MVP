extends Node
## Reproducible in-engine usability probes and uninterrupted input-driven footage.
var town: Node3D
var mode := "audit"
var results: Array[String] = []
var captures: Array[Dictionary] = []
var contacts: Array[Dictionary] = []
var recording := false
var saving := false
var elapsed := 0.0
var accumulator := 0.0

func _ready() -> void:
	call_deferred("_run")

func _ticks(n: int) -> void:
	for i in range(n):
		await get_tree().physics_frame

func _check(ok: bool, text: String) -> void:
	var line = ("PASS " if ok else "FAIL ")+text
	results.append(line)
	print("EXPERIENCE_QA ",line)

func _run() -> void:
	await _ticks(12)
	if mode=="record":
		await _record()
	elif mode=="qa":
		await _qa()
	else:
		await _audit()

func _audit() -> void:
	var p = town.player
	var states: Array[String] = []
	for i in range(20):
		p.teleport(town.points.board.pos+Vector3(0,0.1,1.73 if i%2==0 else 1.77))
		town._update_proximity()
		states.append(town.nearest)
		await get_tree().process_frame
	var changes = 0
	for i in range(1,states.size()):
		if states[i]!=states[i-1]: changes+=1
	p.teleport(Vector3(0,0.1,8))
	town.set_volume(0.14)
	Input.action_press("move_right")
	await _ticks(6)
	var contact = {"painted_frame":p.frame_index,"phase":p.gait_phase,"audio_playing":town.audio.step.playing}
	Input.action_release("move_right")
	await _ticks(20)
	town.set_volume(0)
	p.teleport(town.inn_volume.to_global(Vector3(0,0.1,-town.inn_volume.depth/2-1.25)))
	await _ticks(30)
	var hidden: bool = town.courier_occluded()
	if not OS.has_feature("web"):
		await RenderingServer.frame_post_draw
		get_viewport().get_texture().get_image().save_png("res://evidence/experience_v5/occluded_before.png")
	var report = {"threshold_pose_variation_metres":0.04,"prompt_changes":changes,"samples":states,"first_contact":contact,"courier_hidden_by_inn":hidden}
	print("EXPERIENCE_AUDIT ",JSON.stringify(report))
	if not OS.has_feature("web"):
		var f=FileAccess.open("res://evidence/experience_v5/before_audit.json",FileAccess.WRITE)
		f.store_string(JSON.stringify(report,"\t"))
		get_tree().quit()

func _qa() -> void:
	var p = town.player
	_check(town.volume==0 and not town.audio.step.playing,"Quiet entrance stays muted")
	p.teleport(town.points.board.pos+Vector3(0,0.1,1.73))
	town._update_proximity()
	_check(town.nearest=="board","Board prompt enters at reachable distance")
	var stable = true
	for i in range(20):
		p.teleport(town.points.board.pos+Vector3(0,0.1,1.73 if i%2==0 else 1.77))
		town._update_proximity()
		stable = stable and town.nearest=="board"
		await get_tree().process_frame
	_check(stable,"Four centimetre threshold motion does not flicker prompt")
	p.teleport(town.points.board.pos+Vector3(0,0.1,2.2))
	town._update_proximity()
	_check(town.nearest.is_empty() and not town.ui.prompt_panel.visible,"Walking away releases the prompt")
	p.teleport(town.points.well.pos+Vector3(0,0.1,1.2))
	town._update_proximity()
	_check(town.nearest=="well","A different target acquires its own prompt")
	# An actual wall, independent from the interaction target, blocks reach.
	var wall=StaticBody3D.new()
	wall.add_to_group("architecture")
	var collision=CollisionShape3D.new()
	var box=BoxShape3D.new()
	box.size=Vector3(2,2,0.12)
	collision.shape=box
	wall.add_child(collision)
	wall.position=town.points.well.pos+Vector3(0,1,0.55)
	town.add_child(wall)
	await _ticks(3)
	town._update_proximity()
	_check(town.nearest.is_empty(),"An opaque intervening wall blocks nearby interaction")
	wall.queue_free()
	await _ticks(3)
	p.teleport(Vector3(0,0.1,8))
	contacts.clear()
	p.foot_contact.connect(_contact)
	town.set_volume(0.14)
	Input.action_press("move_right")
	await _ticks(6)
	_check(contacts.size()==1 and town.audio.step.playing,"First painted landing produces the first soft step")
	await _ticks(54)
	_check(contacts.size()>=4 and contacts.all(func(c): return c.frame==1 or c.frame==5),"Every emitted step matches one of the two painted contacts")
	_check(town.audio.step.volume_db<=-10,"Footsteps have a restrained independent gain")
	Input.action_release("move_right")
	await _ticks(20)
	var count=contacts.size()
	await _ticks(30)
	_check(contacts.size()==count and p.frame_index==0,"Standing creates no extra step sounds")
	p.teleport(Vector3(17.8,0.1,7))
	Input.action_press("move_right")
	await _ticks(60)
	count=contacts.size()
	await _ticks(36)
	_check(contacts.size()==count,"Holding into the wall creates no landing sounds")
	Input.action_release("move_right")
	town.set_volume(0)
	p.teleport(town.inn_volume.to_global(Vector3(0,0.1,-town.inn_volume.depth/2-1.25)))
	await _ticks(30)
	_check(town.courier_occluded() and town.ui.behind_marker.visible,"Opaque architecture hides the character but retains a small locator")
	_check(town.ui.behind_marker.get_rect().end.x<=town.ui.root.size.x and town.ui.behind_marker.position.x>=0,"Locator stays inside the viewport")
	town.ui.show_pause()
	_check(not town.ui.behind_marker.visible,"Pause hides the behind-wall locator")
	town.ui.close_modal()
	town.busy=true
	town.player.locked=true
	town.ui.show_pause()
	town.ui.close_modal()
	_check(town.player.locked,"Pausing during a timed interaction does not unlock unfinished movement")
	town.busy=false
	town.player.locked=false
	p.teleport(town.ARRIVAL)
	await _ticks(30)
	_check(not town.ui.behind_marker.visible,"Visible character has no extra locator")
	var f: FileAccess
	if not OS.has_feature("web"):
		f=FileAccess.open("res://evidence/experience_v5/qa_results.txt",FileAccess.WRITE)
		f.store_string("\n".join(results)+"\n")
	print("EXPERIENCE_QA_COMPLETE checks=",results.size())
	if not OS.has_feature("web"):
		get_tree().quit(1 if "FAIL" in "\n".join(results) else 0)

func _contact(frame: int, phase: float, speed: float) -> void:
	contacts.append({"time":elapsed,"frame":frame,"phase":phase,"speed":speed,"position":[town.player.position.x,town.player.position.z]})

func _walk_to(target: Vector2) -> void:
	for i in range(400):
		var difference=target-Vector2(town.player.position.x,town.player.position.z)
		if difference.length()<0.18: break
		for data in [["move_left",difference.x < -0.12],["move_right",difference.x>0.12],["move_up",difference.y < -0.12],["move_down",difference.y>0.12]]:
			if data[1]: Input.action_press(data[0])
			else: Input.action_release(data[0])
		await get_tree().physics_frame
	for action in ["move_left","move_right","move_up","move_down"]:
		Input.action_release(action)
	await _ticks(16)
	if target.distance_to(Vector2(town.player.position.x,town.player.position.z))>0.5:
		print("EXPERIENCE_RECORD_BLOCKED target=",target," actual=",town.player.position)
		get_tree().quit(1)

func _record() -> void:
	if OS.has_feature("web"): return
	get_window().size=Vector2i(960,600)
	town.player.teleport(Vector3(-4,0.1,4.13))
	await _ticks(30)
	town.player.foot_contact.connect(_contact)
	recording=true
	await _ticks(30)
	for i in range(4):
		Input.action_press("move_down")
		await _ticks(4)
		Input.action_release("move_down")
		Input.action_press("move_up")
		await _ticks(4)
		Input.action_release("move_up")
		await _ticks(8)
	await _walk_to(Vector2(-2.8,4.13))
	await _walk_to(Vector2(-2.8,0))
	await _walk_to(Vector2(-3.8,0))
	await _walk_to(Vector2(-3.8,-9.2))
	await _walk_to(Vector2(-8,-9.2))
	await _ticks(40)
	await _walk_to(Vector2(-13.5,-9.2))
	await _walk_to(Vector2(-13.5,-1.0))
	await _walk_to(Vector2(town.points.door.pos.x,town.points.door.pos.z+0.9))
	await _ticks(50)
	recording=false
	while saving: await get_tree().process_frame
	var f=FileAccess.open("res://evidence/experience_v5/continuous_trace.json",FileAccess.WRITE)
	f.store_string(JSON.stringify({"teleports_during_recording":0,"camera":"Normal eased gameplay follow","frames":captures,"contacts":contacts},"\t"))
	print("EXPERIENCE_RECORD_COMPLETE frames=",captures.size()," duration=",elapsed)
	get_tree().quit()

func _process(delta: float) -> void:
	if not recording: return
	elapsed+=delta
	accumulator+=delta
	if accumulator<1.0/15.0 or saving: return
	accumulator=0
	saving=true
	await RenderingServer.frame_post_draw
	var name="frame_%04d.jpg" % captures.size()
	get_viewport().get_texture().get_image().save_jpg("res://evidence/experience_v5/"+name,0.93)
	var p=town.player
	captures.append({"file":name,"time":elapsed,"position":[p.position.x,p.position.y,p.position.z],"facing":p.facing,"frame":p.frame_index,"speed":p.actual_speed,"prompt":town.nearest,"occluded":town.courier_occluded(),"locator":town.ui.behind_marker.visible})
	saving=false
