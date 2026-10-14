extends Node
## Exercise actual InputEventKey/MouseButton delivery and scene reloads.
var town: Node3D
var story: Node
var results: Array = []
var stage := "west"
var marker := "user://dialog_input_qa.json"

func _ready() -> void:
	call_deferred("_run")

func _ticks(n: int) -> void:
	for i in range(n): await get_tree().physics_frame

func _check(ok: bool, text: String) -> void:
	var line = ("PASS " if ok else "FAIL ")+text
	results.append(line)
	print("DIALOG_QA ",line)

func _key(key: int, pressed: bool, echo := false, shifted := false) -> void:
	var event = InputEventKey.new()
	event.physical_keycode = key
	event.keycode = key
	event.pressed = pressed
	event.echo = echo
	event.shift_pressed = shifted
	Input.parse_input_event(event)
	Input.flush_buffered_events()
	await _ticks(2)
	await get_tree().process_frame

func _tap(key: int, shifted := false) -> void:
	await _key(key,true,false,shifted)
	await _key(key,false,false,shifted)

func _mouse(button: Button) -> void:
	var center = button.get_global_rect().get_center()
	var motion = InputEventMouseMotion.new()
	motion.position = center
	motion.global_position = center
	Input.parse_input_event(motion)
	Input.flush_buffered_events()
	for pressed in [true,false]:
		var event = InputEventMouseButton.new()
		event.position = center
		event.global_position = center
		event.button_index = MOUSE_BUTTON_LEFT
		event.pressed = pressed
		Input.parse_input_event(event)
		Input.flush_buffered_events()
		await _ticks(2)
		await get_tree().process_frame
	await _ticks(4)

func _shot(name: String) -> void:
	if OS.has_feature("web"): return
	await RenderingServer.frame_post_draw
	get_viewport().get_texture().get_image().save_png("res://evidence/dialog_v7/"+name+".png")

func _focus_index() -> int:
	return story.dialog_buttons.find(get_viewport().gui_get_focus_owner())

func _run() -> void:
	story = town.story
	await _ticks(12)
	if FileAccess.file_exists(marker):
		var saved = JSON.parse_string(FileAccess.get_file_as_string(marker))
		stage = saved.stage
		results = saved.results
	_check(story.phase=="day" and story.oil==2 and story.flags.is_empty(),"Reload resets oil, pending route and story flags")
	if stage=="final":
		DirAccess.remove_absolute(marker)
		var failed = results.any(func(x):return x.begins_with("FAIL"))
		print("DIALOG_QA_COMPLETE checks=",results.size()," failures=",results.filter(func(x):return x.begins_with("FAIL")).size())
		if not OS.has_feature("web"):
			var file = FileAccess.open("res://evidence/dialog_v7/native_results.json",FileAccess.WRITE)
			file.store_string(JSON.stringify({"results":results,"method":"actual key and mouse events; ready-state fixture for UI tests; separate full-story regression"},"\t"))
			get_tree().quit(1 if failed else 0)
		return
	if not OS.has_feature("web"): get_window().size=Vector2i(720,540)
	await _ticks(8)
	# Real E opens a resident; the opening press may not also dismiss it.
	story.transition_room("apothecary")
	while town.busy: await _ticks(2)
	town.player.teleport(story.residents.apothecary.position+Vector3(0,0.1,1.2))
	await _ticks(6)
	await _key(KEY_E,true)
	_check(town.ui.modal.visible and story.current_dialog=="apoth_intro","Opening E does not immediately close resident dialogue")
	await _key(KEY_E,true,true)
	await _key(KEY_E,true,false)
	_check(town.ui.modal.visible and not story.flags.get("medicine_taken",false),"Held E and duplicate press do not dismiss or collect medicine")
	get_window().focus_exited.emit()
	_check(not town.ui.story_activation_key_held() and not story.activation_blocked,"Window focus-exit signal clears a key latch rather than stranding dialogue")
	await _key(KEY_E,false)
	_check(_focus_index()==1,"Initial focus chooses a harmless resident topic")
	await _tap(KEY_E)
	print("DIALOG_QA_E_CLOSE_STATE visible=",town.ui.modal.visible," medicine=",story.flags.get("medicine_taken",false)," held=",town.ui.story_keys_down," blocked=",story.activation_blocked)
	_check(not town.ui.modal.visible and not story.flags.get("medicine_taken",false),"Fresh E closes without applying a choice")
	await _tap(KEY_E)
	_check(town.ui.modal.visible and _focus_index()==1,"Reentering dialogue restores safe visible focus")
	await _tap(KEY_UP)
	_check(_focus_index()==0,"Up selects previous dialogue button")
	await _tap(KEY_DOWN)
	_check(_focus_index()==1,"Down selects following dialogue button")
	await _tap(KEY_TAB)
	_check(_focus_index()==2,"Tab reaches the added optional topic without leaving dialogue")
	await _tap(KEY_TAB)
	_check(_focus_index()==0,"Tab wraps within the dialogue rather than background HUD")
	await _tap(KEY_TAB,true)
	_check(_focus_index()==story.dialog_buttons.size()-1,"Shift Tab wraps backward within dialogue")
	await _tap(KEY_UP)
	_check(_focus_index()==1,"Up returns from optional topic to original harmless topic")
	await _key(KEY_ENTER,true)
	_check(story.current_dialog=="apoth_secret" and _focus_index()==0,"Enter deliberately opens selected safe topic")
	await _key(KEY_ENTER,true,true)
	await _key(KEY_ENTER,true,false)
	await _tap(KEY_SPACE)
	_check(town.ui.modal.visible and not story.flags.get("medicine_taken",false),"Held Enter and Space cannot activate the next page's pickup")
	await _key(KEY_ENTER,false)
	await _tap(KEY_ENTER)
	_check(story.flags.get("medicine_taken",false) and story.flags.get("medicine_held",false) and not town.ui.modal.visible,"Released then fresh Enter collects one packet")
	await _tap(KEY_ESCAPE)
	_check(get_tree().paused and town.ui.modal_kind=="pause","Esc after dialogue opens ordinary pause menu")
	await _tap(KEY_ESCAPE)
	_check(not get_tree().paused and not town.player.locked,"Esc resumes pause without leftover dialogue lock")
	await _tap(KEY_E)
	_check(story.current_dialog=="apoth_after","Reentry after pickup offers no duplicate medicine")
	await _tap(KEY_ESCAPE)
	story.transition_room("")
	while town.busy: await _ticks(2)
	# A compact UI fixture avoids replaying the whole quest in every input test.
	# The independent full-story regression still proves both actual quest paths.
	story.phase = "ready"
	story.flags.medicine_held = false
	story.flags.medicine_delivered = true
	story.flags.clock_repaired = true
	story.show_dialog("oil_choice")
	await _ticks(6)
	_check(_focus_index()==2,"Oil decision defaults to spend-nothing cancellation")
	var before = story.oil
	await _tap(KEY_ENTER)
	_check(story.oil==before and not town.ui.modal.visible,"Enter on default oil choice cancels without spending")
	story.show_dialog("oil_choice")
	await _ticks(5)
	town.ui.toggle_language()
	await _ticks(6)
	_check(_focus_index()==2 and "Enter" in story.dialog_hint.text and "Esc" in story.dialog_hint.text,"English rebuild keeps safe focus and shows real keys")
	town.ui.toggle_language()
	await _ticks(6)
	_check(_focus_index()==2 and "选择" in story.dialog_hint.text,"Chinese rebuild keeps safe focus and translated guidance")
	var focus_rect = story.dialog_buttons[2].get_global_rect()
	_check(focus_rect.position.x>=0 and focus_rect.end.x<=town.ui.root.size.x and focus_rect.end.y<=town.ui.root.size.y,"Cancel focus stays visible inside narrow viewport")
	_check(story.dialog_buttons[2].get_theme_stylebox("focus").border_width_left==2,"Focused option has a visible two-pixel gold outline")
	await _shot("oil_safe_focus_"+stage)
	if stage=="west":
		await _tap(KEY_UP)
		await _tap(KEY_UP)
		await _key(KEY_ENTER,true)
	else:
		await _mouse(story.dialog_buttons[1])
	_check(story.current_dialog=="oil_confirm_"+stage and story.pending_route==stage and story.oil==2,"Selecting a route opens confirmation without spending")
	_check(_focus_index()==1,"Final confirmation defaults to return without spending")
	if stage=="west":
		await _key(KEY_ENTER,true,true)
		await _key(KEY_ENTER,true,false)
		_check(story.oil==2 and story.phase=="ready","Held Enter cannot skip final oil confirmation")
		await _key(KEY_ENTER,false)
	await _tap(KEY_ENTER)
	_check(story.current_dialog=="oil_choice" and story.oil==2 and story.pending_route.is_empty(),"Default confirmation action returns with all oil intact")
	await _mouse(story.dialog_buttons[0 if stage=="west" else 1])
	await _tap(KEY_ESCAPE)
	_check(not town.ui.modal.visible and story.oil==2 and story.pending_route.is_empty(),"Esc cancels pending confirmation and clears its route")
	story.show_dialog("oil_choice")
	await _ticks(4)
	await _mouse(story.dialog_buttons[0 if stage=="west" else 1])
	await _shot("confirmation_safe_focus_"+stage)
	var stale = story.dialog_buttons[0]
	if stage=="west":
		await _tap(KEY_UP)
		await _key(KEY_ENTER,true)
		await _key(KEY_ENTER,true,true)
		await _key(KEY_ENTER,true,false)
		await _key(KEY_ENTER,false)
	else: await _mouse(story.dialog_buttons[0])
	if is_instance_valid(stale): stale.pressed.emit()
	_check(story.oil==0 and story.choice==stage,"Explicit final activation spends exactly two measures once")
	while town.busy: await _ticks(3)
	_check(story.phase=="night" and not town.player.locked,"Confirmed night transition restores player control")
	story.talk("inn" if stage=="west" else "clock")
	await _ticks(6)
	await _tap(KEY_ENTER)
	_check(story.phase=="ending" and story.current_dialog=="ending_"+stage,"Keyboard proceeds to matching ending")
	_check(_focus_index()==0,"Ending defaults to remain rather than reset")
	await _tap(KEY_ENTER)
	_check(story.phase=="ending" and not town.ui.modal.visible,"Default ending action preserves completed state")
	var file = FileAccess.open(marker,FileAccess.WRITE)
	file.store_string(JSON.stringify({"stage":"clock" if stage=="west" else "final","results":results}))
	file.close()
	story.replay()
