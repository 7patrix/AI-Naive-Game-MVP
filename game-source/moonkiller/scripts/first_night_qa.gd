extends Node
## Real scene reloads, physical room motion and UI callbacks; setup teleports are explicit.
var town: Node3D
var results: Array = []
var story: Node
var stage := "west"
var marker := "user://first_night_qa.json"
var began := 0
var evidence_directory := "res://evidence/dialog_v7/"

func _ready() -> void:
	call_deferred("_run")

func _ticks(count: int) -> void:
	for i in range(count): await get_tree().physics_frame

func _check(value: bool, message: String) -> void:
	var line = ("PASS " if value else "FAIL ")+message
	results.append(line)
	print("FIRST_NIGHT_QA ",line)

func _shot(name: String) -> void:
	if OS.has_feature("web"): return
	await RenderingServer.frame_post_draw
	get_viewport().get_texture().get_image().save_png(evidence_directory+name+".png")

func _approach(key: String) -> void:
	town.player.teleport(town.points[key].pos+Vector3(0,0.1,-1.0 if key=="exit_room" else 1.0))
	await _ticks(8)
	town._update_proximity()
	_check(town.nearest==key,"Reachable physical prompt: "+key)
	town.interact(town.nearest)
	await _ticks(8)

func _click(action: String) -> void:
	# Invoke the connected Button signal, so test follows the presented choice.
	var node = story.data[story.current_dialog]
	var option_index = -1
	for i in range(node.options.size()):
		if node.options[i].get("action","")==action: option_index=i
	if option_index<0:
		_check(false,"Dialogue exposes action "+action)
		return
	story.dialog_buttons[option_index].pressed.emit()
	if action=="replay": return
	await _ticks(4)
	if action in ["choose_west","choose_clock"] and story.current_dialog.begins_with("oil_confirm_"):
		await _click("confirm_west" if action=="choose_west" else "confirm_clock")

func _room(key: String) -> void:
	await _approach("enter_"+key)
	if town.busy:
		town.ui.show_pause()
		_check(get_tree().paused and town.player.locked,"Pause during doorway transition stays locked")
		town.ui.close_modal()
		_check(town.player.locked,"Doorway resume preserves transition lock")
	while town.busy: await _ticks(2)
	_check(story.current_room==key and town.player.position.x>90,"Enter physical "+key+" interior")
	var before = town.player.position
	Input.action_press("move_right")
	await _ticks(20)
	Input.action_release("move_right")
	await _ticks(12)
	_check(town.player.position.distance_to(before)>0.7 and town.player.is_on_floor(),"Interior ground motion and contact: "+key)
	town.player.teleport(story.rooms[key].position+Vector3(5.2,0.1,2))
	Input.action_press("move_right")
	await _ticks(35)
	Input.action_release("move_right")
	await _ticks(10)
	_check(town.player.position.x<story.rooms[key].position.x+5.7,"Real interior side wall blocks movement: "+key)
	town.player.teleport(story.rooms[key].position+Vector3(0,0.1,0.9))
	await _shot(key+"_room_"+stage)
	await _approach(key)
	await _shot(key+"_"+stage)

func _leave() -> void:
	town.ui.close_modal()
	await _approach("exit_room")
	while town.busy: await _ticks(2)
	_check(story.current_room.is_empty() and town.player.position.x<30,"Return from interior to reachable street")

func _run() -> void:
	began = Time.get_ticks_msec()
	story = town.story
	await _ticks(15)
	if FileAccess.file_exists(marker):
		var saved = JSON.parse_string(FileAccess.get_file_as_string(marker))
		stage = saved.stage
		results = saved.results
	_check(story.phase=="day" and story.oil==2 and story.flags.is_empty(),"Fresh/reloaded scene resets flags, phase and two measures")
	_check(town.volume==0 and not town.busy and not town.player.locked,"Fresh/reloaded quiet unlocked entrance")
	if stage=="final":
		DirAccess.remove_absolute(marker)
		print("FIRST_NIGHT_QA_COMPLETE results=",results.size()," failures=",results.filter(func(x):return x.begins_with("FAIL")).size())
		if not OS.has_feature("web"):
			var file = FileAccess.open(evidence_directory+"first_night_results.json",FileAccess.WRITE)
			file.store_string(JSON.stringify({"results":results,"qa_mode":"automated fast path, not human playtime"},"\t"))
			get_tree().quit(1 if results.any(func(x):return x.begins_with("FAIL")) else 0)
		return
	if not OS.has_feature("web"): get_window().size=Vector2i(960,600)
	await _ticks(12)
	await _shot("arrival_"+stage)
	story.action("choose_clock")
	_check(story.oil==2 and story.phase=="day","Oil cannot be spent before preparation")
	await _approach("board")
	_check(town.ui.modal.visible and town.player.locked,"Read courier note locks walking")
	await _click("close")
	# Different task order per branch proves order independence.
	if stage=="west":
		await _room("inn")
		_check(story.flags.get("met_inn",false),"First letter delivered to A-Huai")
		await _leave()
	await _room("apothecary")
	town.ui.close_modal()
	await _approach("apothecary")
	_check(story.current_dialog=="apoth_intro","Closing medicine dialogue does not lose the pickup")
	await _click("take_medicine")
	_check(story.flags.get("medicine_held",false),"Medicine obtained once from dialogue button")
	await _leave()
	await _room("inn")
	if story.current_dialog=="inn_intro":
		town.ui.close_modal()
		await _approach("inn")
	await _click("deliver_medicine")
	_check(story.flags.get("medicine_delivered",false) and not story.flags.get("medicine_held",false),"Medicine handoff consumes held packet")
	await _leave()
	await _approach("clock")
	town.ui.close_modal()
	var barrier = town.add_box(town.points.clock.pos+Vector3(0,1,0.5),Vector3(2,2,0.15),"StoryReachBarrier")
	barrier.add_to_group("architecture")
	await _ticks(3)
	town._update_proximity()
	_check(town.nearest.is_empty(),"Intervening architecture prevents resident conversation")
	barrier.queue_free()
	await _ticks(3)
	await _approach("well")
	_check(town.busy and town.player.locked,"Rope feedback locks player while handling bucket")
	town.ui.show_pause()
	_check(get_tree().paused,"Pause freezes timed rope interaction")
	town.ui.close_modal()
	_check(town.player.locked,"Resume preserves rope interaction lock")
	while town.busy: await _ticks(3)
	_check(story.flags.get("cord_held",false),"Waxed rope recovered after actual timer")
	await _approach("clock")
	await _click("repair_clock")
	_check(story.phase=="ready" and story.flags.get("clock_repaired",false),"All letters and preparations unlock oil decision")
	await _approach("clock")
	_check(story.current_dialog=="oil_choice","Oil decision presents explicit two-route cost")
	await _click("close")
	_check(story.oil==2 and story.choice.is_empty(),"Consider longer does not spend oil")
	await _approach("clock")
	if not OS.has_feature("web"):
		get_window().size=Vector2i(720,540)
		await _ticks(10)
		story.show_dialog("oil_choice")
		await _ticks(6)
		var panel = town.ui.modal.get_child(town.ui.modal.get_child_count()-1)
		_check(panel.get_global_rect().end.x<=720 and panel.get_global_rect().end.y<=540 and panel.get_global_rect().position.y>=0,"Choice modal including optional topic stays within 720x540")
		await _shot("choice_720_"+stage)
		get_window().size=Vector2i(960,600)
		await _ticks(10)
	town.ui.toggle_language()
	_check(town.ui.title_label.text=="Mothwake" and town.ui.dialogue_body.text==story.data.oil_choice.body.en,"Language switch refreshes story body and HUD")
	town.ui.toggle_language()
	var missing: Array = []
	for node in story.data.values():
		for ch in (node.body.zh+node.title.zh+node.speaker.zh):
			if ch.unicode_at(0)>127 and not town.ui.ChineseFont.has_char(ch.unicode_at(0)): missing.append(ch)
	_check(missing.is_empty(),"Bundled font contains every story Chinese glyph")
	await _click("choose_west" if stage=="west" else "choose_clock")
	story.action("choose_clock" if stage=="west" else "choose_west")
	_check(story.oil==0 and story.choice==stage,"Oil commits once and rejects repeated conflicting action")
	while town.busy: await _ticks(3)
	_check(story.phase=="night" and not town.player.locked,"Night transition returns movement control")
	_check(town.door_open==(stage=="west") and is_equal_approx(story.tower_light.light_energy,1.8 if stage=="clock" else 0.03),"Actual inn door and tower illumination differ by route")
	var west_lamps = town.lamps.filter(func(x):return x.light.position.x< -3)
	_check(west_lamps[0].strength==(1.45 if stage=="west" else 0.035),"Actual streetlamp strength follows selected route")
	_check((story.residents.inn.position.x<30)==(stage=="west"),"Innkeeper remains inside locked inn or joins illuminated lane")
	await _shot("night_"+stage)
	await _approach("inn" if stage=="west" else "clock")
	await _click("finish_night")
	_check(story.phase=="ending" and story.current_dialog=="ending_"+stage,"Visit chosen route produces corresponding ending")
	await _shot("ending_"+stage)
	print("FIRST_NIGHT_QA_FAST_PATH_SECONDS ",stage," ",(Time.get_ticks_msec()-began)/1000.0)
	var saved = FileAccess.open(marker,FileAccess.WRITE)
	saved.store_string(JSON.stringify({"stage":"clock" if stage=="west" else "final","results":results}))
	saved.close()
	await _click("replay")
