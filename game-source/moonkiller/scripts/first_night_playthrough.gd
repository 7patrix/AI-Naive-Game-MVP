extends Node
## Uncut native footage and a full real-input route; no setup teleport after arrival.
## Doorway relocation occurs inside the actual game fade, as in normal gameplay.
var town: Node3D
var story: Node
var route := "west"
var recording := false
var saving := false
var clock := 0.0
var accumulator := 0.0
var frames: Array = []
var trace: Array = []
var clip := ""
var started := 0
var failed := false

func _ready() -> void:
	call_deferred("_run")

func _ticks(n: int) -> void:
	for i in range(n): await get_tree().physics_frame

func _walk(target: Vector2) -> void:
	trace.append({"event":"walk","target":[target.x,target.y],"seconds":(Time.get_ticks_msec()-started)/1000.0})
	for i in range(1600):
		var diff = target-Vector2(town.player.position.x,town.player.position.z)
		if diff.length()<0.16: break
		for action in [["move_left",diff.x< -0.10],["move_right",diff.x>0.10],["move_up",diff.y< -0.10],["move_down",diff.y>0.10]]:
			if action[1]: Input.action_press(action[0])
			else: Input.action_release(action[0])
		await get_tree().physics_frame
	for key in ["move_left","move_right","move_up","move_down"]: Input.action_release(key)
	await _ticks(12)
	var error = target.distance_to(Vector2(town.player.position.x,town.player.position.z))
	if error>0.45:
		failed = true
		print("FIRST_NIGHT_WALK_FAIL target=",target," position=",town.player.position)
		get_tree().quit(1)

func _interact(key: String) -> void:
	town._update_proximity()
	if town.nearest!=key:
		failed = true
		print("FIRST_NIGHT_WALK_FAIL prompt expected=",key," actual=",town.nearest)
		get_tree().quit(1)
		return
	var event = InputEventAction.new()
	event.action = "interact"
	event.pressed = true
	Input.parse_input_event(event)
	await _ticks(2)
	event = InputEventAction.new()
	event.action = "interact"
	event.pressed = false
	Input.parse_input_event(event)
	await _ticks(24)
	while town.busy: await _ticks(2)
	print("FIRST_NIGHT_WALK_INTERACT ",key)
	trace.append({"event":"interact","target":key,"seconds":(Time.get_ticks_msec()-started)/1000.0})

func _choice(action: String, next := "") -> void:
	var options = story.data[story.current_dialog].options
	var box = town.ui.modal.get_child(town.ui.modal.get_child_count()-1).get_child(0)
	for i in range(options.size()):
		if options[i].get("action","")==action or (not next.is_empty() and options[i].get("next","")==next):
			box.get_child(3+i).pressed.emit()
			await _ticks(72)
			if action in ["choose_west","choose_clock"] and story.current_dialog.begins_with("oil_confirm_"):
				await _choice("confirm_west" if action=="choose_west" else "confirm_clock")
			return
	failed = true
	print("FIRST_NIGHT_WALK_FAIL missing choice ",action," ",next)
	get_tree().quit(1)

func _entrance(key: String) -> void:
	var point: Vector3 = story.outdoor["enter_"+key].pos
	await _walk(Vector2(town.player.position.x,2.6))
	await _walk(Vector2(point.x,2.6))
	await _walk(Vector2(point.x,point.z+0.8))
	await _interact("enter_"+key)
	var npc: Vector3 = story.residents[key].position
	await _walk(Vector2(npc.x,npc.z+1.1))
	await _interact(key)

func _exit_room() -> void:
	town.ui.close_modal()
	var center: Vector3 = story.rooms[story.current_room].position
	await _walk(Vector2(center.x,2.5))
	await _interact("exit_room")

func _start_clip(name: String) -> void:
	clip = name
	frames = []
	clock = 0
	accumulator = 0
	recording = true

func _end_clip() -> void:
	recording = false
	while saving: await get_tree().process_frame
	var file = FileAccess.open("res://evidence/first_night_v6/"+clip+"_trace.json",FileAccess.WRITE)
	file.store_string(JSON.stringify({"frames":frames,"normal_game_door_transitions":true,"setup_teleports":0,"automation":"real movement inputs and connected dialogue buttons; brief scripted reading pauses"},"\t"))
	print("FIRST_NIGHT_RECORD_COMPLETE ",clip," frames=",frames.size()," duration=",clock)

func _run() -> void:
	if OS.has_feature("web"): return
	story = town.story
	route = "clock" if "--walk-clock" in OS.get_cmdline_user_args() else "west"
	get_window().size=Vector2i(960,600)
	await _ticks(20)
	started = Time.get_ticks_msec()
	await _walk(Vector2(-4,3.3))
	await _interact("board")
	await _choice("close")
	await _entrance("inn")
	await _choice("","inn_secret")
	await _choice("close")
	await _exit_room()
	if route=="west": _start_clip("interior_walk")
	await _entrance("apothecary")
	await _choice("","apoth_secret")
	await _choice("take_medicine")
	await _exit_room()
	if route=="west": await _end_clip()
	await _entrance("inn")
	await _choice("deliver_medicine")
	await _exit_room()
	await _walk(Vector2(town.player.position.x,2.6))
	await _walk(Vector2(0.2,2.6))
	await _walk(Vector2(0.2,2.1))
	await _interact("well")
	await _walk(Vector2(2,2.3))
	await _walk(Vector2(2,-3.3))
	await _walk(Vector2(1,-3.3))
	await _interact("clock")
	await _choice("","clock_secret")
	await _choice("close")
	await _interact("clock")
	await _choice("repair_clock")
	_start_clip("night_"+route)
	await _interact("clock")
	await _ticks(65)
	await _choice("choose_west" if route=="west" else "choose_clock")
	while town.busy: await _ticks(2)
	await _ticks(55)
	if route=="west":
		await _walk(Vector2(2,2.6))
		var npc: Vector3 = story.residents.inn.position
		await _walk(Vector2(npc.x,2.6))
		await _walk(Vector2(npc.x,npc.z+1.1))
		await _interact("inn")
	else:
		await _walk(Vector2(1.9,-2.3))
		await _walk(Vector2(1,-3.3))
		await _interact("clock")
	await _ticks(100)
	await _choice("finish_night")
	await _ticks(120)
	await _end_clip()
	var report = {"route":route,"phase":story.phase,"oil":story.oil,"seconds":(Time.get_ticks_msec()-started)/1000.0,"setup_teleports":0,"reading":"Short scripted pauses; not a measured human reading session.","failed":failed,"input_trace":trace}
	var file=FileAccess.open("res://evidence/first_night_v6/input_walk_"+route+".json",FileAccess.WRITE)
	file.store_string(JSON.stringify(report,"\t"))
	print("FIRST_NIGHT_WALK_COMPLETE ",JSON.stringify(report))
	get_tree().quit(1 if failed or story.phase!="ending" else 0)

func _process(delta: float) -> void:
	if not recording: return
	clock+=delta
	accumulator+=delta
	if accumulator<1.0/15 or saving: return
	accumulator=0
	saving=true
	await RenderingServer.frame_post_draw
	var name = "%s_%04d.jpg" % [clip,frames.size()]
	get_viewport().get_texture().get_image().save_jpg("res://evidence/first_night_v6/"+name,0.92)
	frames.append({"file":name,"time":clock,"position":[town.player.position.x,town.player.position.y,town.player.position.z],"room":story.current_room,"phase":story.phase,"dialog":story.current_dialog if town.ui.modal.visible else "","prompt":town.nearest})
	saving=false
