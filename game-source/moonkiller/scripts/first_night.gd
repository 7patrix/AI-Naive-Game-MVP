extends Node
## Data-driven dialogue; explicit, guarded story transitions, no arbitrary data code.
const ThirdKnock = preload("res://scripts/third_knock.gd")
const Room = preload("res://scripts/room.gd")
var third_knock: Node
var town: Node3D
var data: Dictionary = {}
var phase: String:
	get: return town.session.state.phase
	set(value): town.session.state.phase=value
var oil: int:
	get: return town.session.state.oil
	set(value): town.session.state.oil=value
var choice: String:
	get: return town.session.state.choice
	set(value): town.session.state.choice=value
var flags: Dictionary:
	get: return town.session.state.flags
	set(value): town.session.state.flags=value
var rooms: Dictionary = {}
var residents: Dictionary = {}
var outdoor: Dictionary = {}
var current_room := ""
var current_dialog := ""
var curtain: ColorRect
var resource_label: Label
var started_ms := 0
var ending_ms := 0
var tower_light: OmniLight3D
var dialog_buttons: Array[Button] = []
var dialog_hint: Label
var dialog_scroll: ScrollContainer
var dialog_generation := 0
var activation_blocked := false
var pending_route := ""

func _ready() -> void:
	started_ms = Time.get_ticks_msec()
	data = JSON.parse_string(FileAccess.get_file_as_string("res://assets/story/first_night.json"))
	_add_oil_confirmations()
	for key in ["inn","apothecary"]:
		var room = Room.new()
		room.town = town
		room.kind = key
		room.position = Vector3(100 if key == "inn" else 130,0,0)
		room.name = key.capitalize()+"Interior"
		town.add_child(room)
		rooms[key] = room
	residents.inn = _resident("innkeeper",rooms.inn.position+Vector3(-1.4,0,-1.0))
	residents.apothecary = _resident("apothecary",rooms.apothecary.position+Vector3(-1.3,0,-1.1))
	residents.clock = _resident("clockmaker",Vector3(1.0,0,-4.6))
	var apoth_entrance = Vector3(8,0,-2.3)
	for building in town.buildings:
		if building.has("volume") and building.volume.kind == "apothecary":
			apoth_entrance = building.volume.to_global(Vector3(0,0,building.volume.depth*0.5+1.15))
	outdoor = {
		"board":{"pos":Vector3(-4,0,2.4),"prompt":"Read the courier's note"},
		"well":{"pos":Vector3(0.2,0,1.4),"prompt":"Retrieve the waxed rope"},
		"enter_inn":{"pos":town.inn_volume.door_approach(),"prompt":"Enter the Moss Lantern Inn"},
		"enter_apothecary":{"pos":apoth_entrance,"prompt":"Enter Mistleaf Apothecary"},
		"clock":{"pos":residents.clock.position+Vector3(0,0,0.5),"prompt":"Talk to Old Ke"}
	}
	tower_light = OmniLight3D.new()
	tower_light.position = Vector3(0,5,-5.8)
	tower_light.light_color = Color("ffd89a")
	tower_light.omni_range = 8
	tower_light.light_energy = 0.3
	town.add_child(tower_light)
	curtain = ColorRect.new()
	curtain.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	curtain.color = Color("101a1c")
	curtain.modulate.a = 0
	curtain.mouse_filter = Control.MOUSE_FILTER_IGNORE
	town.ui.root.add_child(curtain)
	resource_label = town.ui.label("",13,town.ui.GOLD)
	resource_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	town.ui.root.add_child(resource_label)
	town.ui.root.resized.connect(refresh_text)
	town.world.environment.ambient_light_energy = 1.02
	town.world.environment.fog_density = 0.004
	_update_points()
	refresh_text()
	town.ui.toast(_tr({"zh":"黄昏未尽。井边有一张写给送信人的便条。","en":"Dusk lingers. A note for the courier waits by the well."}),6)
	third_knock=ThirdKnock.new()
	third_knock.story=self
	add_child(third_knock)
	town.session.attach_story(self)
	print("FIRST_NIGHT_READY residents=3 interiors=2 oil=2 phase=day")

func _resident(art_name: String, pos: Vector3) -> Node3D:
	var root = Node3D.new()
	root.name = art_name.capitalize()
	root.position = pos
	town.add_child(root)
	var sprite = Sprite3D.new()
	sprite.texture = load("res://assets/art/first_night/%s.png" % art_name)
	sprite.pixel_size = 2.35/643.0
	sprite.offset.y = 316.5
	sprite.billboard = BaseMaterial3D.BILLBOARD_FIXED_Y
	sprite.shaded = true
	sprite.no_depth_test = false
	sprite.alpha_cut = SpriteBase3D.ALPHA_CUT_DISCARD
	sprite.alpha_scissor_threshold = 0.12
	sprite.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	root.add_child(sprite)
	town.add_shadow(root,Vector2(0.7,0.52))
	var body = StaticBody3D.new()
	body.collision_layer = 1
	body.collision_mask = 2
	var collider = CollisionShape3D.new()
	var capsule = CapsuleShape3D.new()
	capsule.radius = 0.3
	capsule.height = 1.4
	collider.shape = capsule
	collider.position.y = 0.7
	body.add_child(collider)
	root.add_child(body)
	return root

func _tr(value: Dictionary) -> String:
	return value.get(town.ui.language,value.get("en",""))

func _update_points() -> void:
	town.nearest = ""
	if current_room.is_empty():
		town.points = outdoor.duplicate(true)
		if phase in ["night","ending"]:
			for key in ["inn","apothecary"]:
				if residents[key].position.x<30:
					town.points[key] = {"pos":residents[key].position+Vector3(0,0,0.5),"prompt":"Talk to A-Huai" if key == "inn" else "Talk to Wen-Xian"}
	else:
		var center: Vector3 = rooms[current_room].position
		town.points = {
			"exit_room":{"pos":center+Vector3(0,0,3.25),"prompt":"Return to the street"},
			}
		if current_room=="inn" and third_knock: town.points["knocker"]={"pos":third_knock.point(),"prompt":"Inspect the door knocker"}
		if residents[current_room].position.distance_to(center)<10:
			town.points[current_room] = {"pos":residents[current_room].position+Vector3(0,0,0.5),"prompt":"Talk to A-Huai" if current_room == "inn" else "Talk to Wen-Xian"}

func prompt(text: String) -> String:
	if text == "Retrieve the waxed rope" and flags.get("cord_taken",false):
		return _tr({"zh":"听一听井水","en":"Listen to the well"})
	var translations = {
		"Read the courier's note":"读送信人的便条","Retrieve the waxed rope":"取井边的蜡绳",
		"Enter the Moss Lantern Inn":"进入苔灯旅店","Enter Mistleaf Apothecary":"进入雾叶药剂铺",
		"Inspect the door knocker":"察看门边的铜扣",
		"Return to the street":"回到街上","Talk to A-Huai":"与阿槐交谈",
		"Talk to Wen-Xian":"与闻弦交谈","Talk to Old Ke":"与老柯交谈"
	}
	return translations.get(text,text) if town.ui.language == "zh" else text

func handle_interaction(key: String) -> void:
	if town.busy: return
	match key:
		"knocker": third_knock.inspect()
		"board": show_dialog("board")
		"well": retrieve_rope()
		"enter_inn":
			if choice == "clock":
				town.ui.toast(_tr({"zh":"旅店今晚锁了门。炉火还在，客人等待天亮。","en":"The inn is locked tonight. Guests wait by the hearth until daylight."}))
			else:
				town.door_open = true
				transition_room("inn")
		"enter_apothecary": transition_room("apothecary")
		"exit_room": transition_room("")
		"inn","apothecary","clock": talk(key)

func talk(key: String) -> void:
	if phase in ["night","ending"]:
		if phase == "ending" and ((choice == "west" and key == "inn") or (choice == "clock" and key == "clock")):
			show_dialog("ending_"+choice)
		elif choice == "west" and key == "inn": show_dialog("night_west")
		elif choice == "clock" and key == "clock": show_dialog("night_clock")
		else: show_dialog("night_other")
		return
	var first = not flags.get("met_"+key,false)
	flags["met_"+key] = true
	if first:
		show_dialog({"inn":"inn_intro","apothecary":"apoth_intro","clock":"clock_intro"}[key])
	elif key == "inn":
		show_dialog("inn_after" if flags.get("medicine_delivered",false) else ("inn_deliver" if flags.get("medicine_held",false) else "inn_wait"))
	elif key == "apothecary":
		show_dialog("apoth_after" if flags.get("medicine_taken",false) else "apoth_intro")
	elif flags.get("cord_held",false): show_dialog("clock_repair")
	elif phase == "ready": show_dialog("oil_choice")
	else: show_dialog("clock_wait")
	refresh_text()
	town.session.checkpoint("resident_letter")

func show_dialog(key: String) -> void:
	dialog_generation += 1
	var generation = dialog_generation
	dialog_buttons.clear()
	activation_blocked = town.ui.story_activation_key_held()
	if key == "oil_choice": pending_route = ""
	current_dialog = key
	town.play_sound("paper")
	town.ui.modal_kind = "story"
	var node: Dictionary = data[key]
	var portrait_key = "innkeeper" if key.begins_with("inn") or key in ["night_west","ending_west"] else ("apothecary" if key.begins_with("apoth") else ("clockmaker" if key.begins_with("clock") or key.begins_with("oil_") or key in ["night_clock","ending_clock"] else ""))
	portrait_key=node.get("portrait",portrait_key)
	var box = town.ui.begin_story_dialogue(_tr(node.title),_tr(node.speaker),portrait_key,key.begins_with("q_"),node.options.size())
	var panel = town.ui.dialogue_panel
	var height = panel.size.y
	var scroll = ScrollContainer.new()
	dialog_scroll = scroll
	scroll.focus_mode = Control.FOCUS_NONE
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	scroll.custom_minimum_size = Vector2(0,48 if key.begins_with("q_") else 64)
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	box.add_child(scroll)
	var body = town.ui.label(_tr(node.body),24 if town.ui.root.size.x>=900 else 20,town.ui.CREAM)
	body.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	body.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.add_child(body)
	town.ui.bind_dialogue_body(body)
	var choices = GridContainer.new()
	choices.columns = 2 if town.ui.root.size.x>=800 else 1
	choices.add_theme_constant_override("h_separation",12)
	choices.add_theme_constant_override("v_separation",8)
	box.add_child(choices)
	for index in range(node.options.size()):
		var item = node.options[index]
		var button = town.ui.button(_tr(item.text))
		var focus_style = button.get_theme_stylebox("focus").duplicate() as StyleBoxFlat
		focus_style.border_color = Color("edd59a")
		focus_style.bg_color = Color("4a4b3c")
		focus_style.set_border_width_all(2)
		button.add_theme_stylebox_override("focus",focus_style)
		button.pressed.connect(func(): _activate_option(index,generation))
		button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		button.add_theme_font_size_override("font_size",18)
		choices.add_child(button)
		dialog_buttons.append(button)
	dialog_hint = town.ui.label(_tr({"zh":"↑↓ / Tab  选择 · Enter  确认 · E / Esc  关闭 · PgUp / PgDn  滚动","en":"↑↓ / Tab Choose · Enter Confirm · E / Esc Close · PgUp / PgDn Scroll"}),12,town.ui.GOLD)
	dialog_hint.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	box.add_child(dialog_hint)
	for i in range(dialog_buttons.size()):
		var previous = dialog_buttons[posmod(i-1,dialog_buttons.size())].get_path()
		var following = dialog_buttons[(i+1)%dialog_buttons.size()].get_path()
		dialog_buttons[i].focus_neighbor_top = previous
		dialog_buttons[i].focus_neighbor_bottom = following
		dialog_buttons[i].focus_previous = previous
		dialog_buttons[i].focus_next = following
	call_deferred("_focus_option",_safe_option_index(node.options),generation)

func _safe_option_index(options: Array) -> int:
	for i in range(options.size()):
		if options[i].get("action","")=="close" or options[i].get("next","")=="oil_choice": return i
	for i in range(options.size()):
		if options[i].has("next"): return i
	return 0

func _focus_option(index: int, generation: int) -> void:
	if generation==dialog_generation and town.ui.modal.visible and index<dialog_buttons.size():
		dialog_buttons[index].grab_focus()

func _activate_option(index: int, generation: int) -> void:
	if generation!=dialog_generation or not town.ui.modal.visible or town.ui.modal_kind!="story" or town.busy: return
	if town.ui.reveal_dialogue_if_typing(): return
	if third_knock: third_knock.read_node(current_dialog)
	var item: Dictionary = data[current_dialog].options[index]
	# Invalidate this page before calling any effect or creating its successor.
	dialog_generation += 1
	if item.has("next"): show_dialog(item.next)
	elif str(item.get("action","")).begins_with("q_"): third_knock.action(item.action)
	else: action(item.action)

func move_dialog_focus(direction: int) -> void:
	var current = dialog_buttons.find(get_viewport().gui_get_focus_owner())
	if not dialog_buttons.is_empty(): dialog_buttons[posmod(current+direction,dialog_buttons.size())].grab_focus()

func activate_dialog_focus() -> void:
	if activation_blocked: return
	var index = dialog_buttons.find(get_viewport().gui_get_focus_owner())
	if index>=0: _activate_option(index,dialog_generation)

func release_dialog_activation() -> void:
	if not town.ui.story_activation_key_held(): activation_blocked = false

func scroll_dialog(direction: int) -> void:
	if is_instance_valid(dialog_scroll):
		dialog_scroll.scroll_vertical += int(dialog_scroll.size.y*0.8)*direction

func dialog_closed() -> void:
	if third_knock and is_instance_valid(town.ui.dialogue_body) and town.ui.dialogue_body.visible_characters==-1: third_knock.read_node(current_dialog)
	dialog_generation += 1
	dialog_buttons.clear()
	pending_route = ""

func _add_oil_confirmations() -> void:
	for route in ["west","clock"]:
		var zh_route = "旅店巷" if route=="west" else "钟楼路"
		var en_route = "inn lane" if route=="west" else "tower route"
		data["oil_confirm_"+route] = {
			"title":{"zh":"确认点亮"+zh_route+"？","en":"Light the "+en_route+"?"},
			"speaker":{"zh":"灯油分配 · 尚未消耗","en":"Oil allocation · nothing spent yet"},
			"body":{"zh":"确认后，两份灯油将全部用于"+zh_route+"，另一条路今晚不会点亮。\n\n你仍可以返回选择或关闭对话；取消不会消耗灯油。","en":"Confirming spends both measures of oil on the "+en_route+". The other route stays dark tonight.\n\nReturn to the choice or close this dialogue to cancel. Nothing is spent until you confirm."},
			"options":[{"text":{"zh":"确认点亮 · 消耗2份灯油","en":"Confirm lighting · spend both measures"},"action":"confirm_"+route},{"text":{"zh":"返回选择 · 暂不消耗","en":"Return to choice · spend nothing"},"next":"oil_choice"}]
		}

func action(key: String) -> void:
	match key:
		"close": town.ui.close_modal()
		"take_medicine":
			if not flags.get("medicine_taken",false):
				flags.medicine_taken = true
				flags.medicine_held = true
			town.ui.close_modal()
			town.ui.toast(_tr({"zh":"收好药包 · 带给旅店里的阿槐。","en":"Medicine collected · bring it to A-Huai at the inn."}))
		"deliver_medicine":
			if flags.get("medicine_held",false):
				flags.medicine_held = false
				flags.medicine_delivered = true
			town.ui.close_modal()
		"repair_clock":
			if flags.get("cord_held",false):
				flags.cord_held = false
				flags.clock_repaired = true
			town.ui.close_modal()
			town.play_sound("key")
		"choose_west","choose_clock":
			if phase == "ready" and oil == 2:
				pending_route = "west" if key=="choose_west" else "clock"
				show_dialog("oil_confirm_"+pending_route)
		"confirm_west","confirm_clock":
			var requested = "west" if key=="confirm_west" else "clock"
			if phase=="ready" and oil==2 and requested==pending_route: begin_night(requested)
		"finish_night":
			if phase == "night":
				if choice=="clock":
					town.play_sound("bell")
					tower_light.light_energy = 2.4
					create_tween().tween_property(tower_light,"light_energy",1.8,1.1)
				phase = "ending"
				ending_ms = Time.get_ticks_msec()
				print("FIRST_NIGHT_ENDING choice=",choice," elapsed_seconds=",(ending_ms-started_ms)/1000.0)
				show_dialog("ending_"+choice)
		"replay": replay()
	_update_phase()
	refresh_text()
	if key not in ["choose_west","choose_clock","replay"]: town.session.checkpoint("story_action")

func _update_phase() -> void:
	if phase == "day" and flags.get("medicine_delivered",false) and flags.get("clock_repaired",false) and flags.get("met_inn",false) and flags.get("met_apothecary",false) and flags.get("met_clock",false):
		phase = "ready"
		print("FIRST_NIGHT_PREPARED")

func retrieve_rope() -> void:
	if phase != "day" or flags.get("cord_taken",false):
		town.ui.toast(_tr({"zh":"桶旁的绳子已经取走。井水轻轻晃了一下。","en":"The rope is already taken. The well water ripples."}))
		return
	town.busy = true
	town.player.locked = true
	town.play_sound("well")
	town.ui.toast(_tr({"zh":"把桶旁的蜡绳卷好……","en":"Coiling the waxed rope beside the bucket…"}),1.3)
	var tween = create_tween()
	tween.tween_interval(1.1)
	tween.tween_callback(func():
		flags.cord_taken = true
		flags.cord_held = true
		town.session.checkpoint("rope_collected")
		town.busy = false
		town.player.locked = town.ui.modal.visible
		refresh_text()
		town.ui.toast(_tr({"zh":"蜡绳已收好 · 带给钟楼前的老柯。","en":"Waxed rope collected · take it to Old Ke."})))

func transition_room(destination: String) -> void:
	if town.busy or destination == current_room: return
	town.ui.close_modal()
	town.busy = true
	town.player.locked = true
	curtain.mouse_filter = Control.MOUSE_FILTER_STOP
	var departing = current_room
	var tween = create_tween()
	tween.tween_property(curtain,"modulate:a",1.0,0.18)
	tween.tween_callback(func():
		if third_knock: third_knock.leave_zone(departing)
		current_room = destination
		if destination.is_empty():
			town.player.teleport(outdoor["enter_"+departing].pos+Vector3(0,0.1,0.55))
			town.camera.size = 22
			town.camera.position = Vector3(-0.8,21,23.6)
			town.camera.look_at(Vector3(-0.8,2,-2.7))
		else:
			town.player.teleport(rooms[destination].position+Vector3(0,0.1,0.9))
			town.camera.size = 11.5
			town.camera.position = rooms[destination].position+Vector3(0,10.8,12.4)
			town.camera.look_at(rooms[destination].position+Vector3(0,1,0))
		_update_points()
		refresh_text())
	tween.tween_property(curtain,"modulate:a",0.0,0.22)
	tween.tween_callback(func():
		town.busy = false
		town.player.locked = false
		curtain.mouse_filter = Control.MOUSE_FILTER_IGNORE
		town.session.checkpoint("room_transition")
		print("FIRST_NIGHT_ROOM ",current_room if not current_room.is_empty() else "street"))

func begin_night(route: String) -> void:
	# Commit before tween/callback; repeated activation cannot double-spend.
	if phase != "ready" or oil != 2 or town.busy: return
	choice = route
	oil = 0
	phase = "night"
	town.ui.close_modal()
	town.busy = true
	town.player.locked = true
	curtain.mouse_filter = Control.MOUSE_FILTER_STOP
	var tween = create_tween()
	tween.tween_property(curtain,"modulate:a",1.0,0.6)
	tween.tween_callback(_apply_night)
	tween.tween_property(curtain,"modulate:a",0.0,0.9)
	tween.tween_callback(func():
		town.busy = false
		town.player.locked = false
		curtain.mouse_filter = Control.MOUSE_FILTER_IGNORE
		refresh_text()
		town.session.checkpoint("night_choice")
		print("FIRST_NIGHT_CHOICE route=",choice," oil=",oil))

func _apply_night() -> void:
	town.world.environment.ambient_light_energy = 0.51
	town.world.environment.ambient_light_color = Color("8da4b3")
	town.world.environment.background_color = Color("1b2c32")
	town.world.environment.fog_light_color = Color("3b555c")
	town.world.environment.fog_light_energy = 0.24
	town.world.environment.fog_density = 0.009
	for child in town.get_children():
		if child is DirectionalLight3D:
			child.light_energy = 0.24
			child.light_color = Color("8aabc0")
	for item in town.lamps:
		var west: bool = item.light.position.x < -3
		item.strength = 1.45 if west == (choice == "west") else 0.035
		item.sprite.modulate = Color.WHITE if item.strength>1 else Color("51646c")
	town.inn_volume.material("inn_front").albedo_color = Color("e6c997") if choice == "west" else Color("59666c")
	for building in town.buildings:
		if building.has("volume") and building.volume.kind == "archive":
			building.volume.material("archive_front").albedo_color = Color("e3d8b7") if choice == "clock" else Color("65757a")
	tower_light.light_energy = 1.8 if choice == "clock" else 0.03
	town.door_open = choice == "west"
	town.door_glow.material_override.albedo_color.a = 0.95 if choice == "west" else 0.02
	rooms.inn.warm.light_energy = 2.2 if choice == "west" else 0.7
	residents.inn.position = outdoor.enter_inn.pos+Vector3(-1.2,0,1.2) if choice == "west" else rooms.inn.position+Vector3(-1.4,0,-1.0)
	residents.apothecary.position = outdoor.enter_inn.pos+Vector3(1.1,0,1.0) if choice == "west" else Vector3(2.3,0,-3.5)
	_update_points()

func refresh_text() -> void:
	if not resource_label: return
	var name_value = {"zh":"雾钟镇","en":"Mothwake"}
	if not current_room.is_empty():
		name_value = {"zh":"苔灯旅店","en":"Moss Lantern Inn"} if current_room == "inn" else {"zh":"雾叶药剂铺","en":"Mistleaf Apothecary"}
	town.ui.title_label.text = _tr(name_value)
	town.ui.subtitle_label.text = _tr({"zh":"第一夜 · 送信人","en":"First night · the courier"})
	town.ui.quest_header.text = _tr({"zh":"今晚要做的事","en":"TONIGHT'S ERRAND"})
	town.ui.status_label.text = _tr({"zh":"黄昏 · 旧镇" if phase in ["day","ready"] else "入夜 · 旧镇","en":"DUSK · OLD TOWN" if phase in ["day","ready"] else "NIGHT · OLD TOWN"})
	var objective_text = {"zh":"把三封信交给旅店、药剂铺和钟楼的居民。","en":"Deliver letters at the inn, apothecary and tower."}
	if phase == "ending": objective_text = {"zh":"第一夜已结束 · 可继续探索或在暂停菜单重玩。","en":"First night complete · explore or replay from Pause."}
	elif phase == "night": objective_text = {"zh":"去亮灯的旅店巷找阿槐，收取回信。","en":"Visit A-Huai in the lit inn lane."} if choice == "west" else {"zh":"去亮灯的钟楼路找老柯，收取回信。","en":"Visit Old Ke on the lit tower route."}
	elif phase == "ready": objective_text = {"zh":"准备已完成 · 去钟楼选择灯油照亮哪条路。","en":"Prepared · choose a lit route at the tower."}
	elif flags.get("medicine_held",false): objective_text = {"zh":"把药包送到旅店里的阿槐手中。","en":"Bring the medicine to A-Huai at the inn."}
	elif flags.get("cord_held",false): objective_text = {"zh":"把蜡绳交给钟楼前的老柯。","en":"Take the waxed rope to Old Ke."}
	elif flags.get("met_apothecary",false) and not flags.get("medicine_taken",false): objective_text = {"zh":"向闻弦领取药包 · 对话中选「收好药包」。","en":"Collect Wen-Xian's medicine in her dialogue."}
	elif flags.get("medicine_delivered",false) and not flags.get("clock_repaired",false): objective_text = {"zh":"去井边取蜡绳，再交给钟楼前的老柯。","en":"Retrieve the well rope; bring it to Old Ke."}
	town.ui.objective.text = _tr(objective_text)
	var delivered = int(flags.get("met_inn",false))+int(flags.get("met_apothecary",false))+int(flags.get("met_clock",false))
	resource_label.text = _tr({"zh":"街灯油 %d / 2   ·   信 %d / 3" % [oil,delivered],"en":"Street oil %d / 2   ·   Letters %d / 3" % [oil,delivered]})
	resource_label.position = Vector2(town.ui.root.size.x-332,106)
	resource_label.size = Vector2(294,24)
	var control_label = town.ui.controls_box.get_child(1)
	control_label.text = _tr({"zh":"E  互动    ESC  暂停    R  回到门口" if not current_room.is_empty() else "E  互动    ESC  暂停    R  回到入口","en":"E Interact   ESC Pause   R Return to doorway" if not current_room.is_empty() else "E Interact   ESC Pause   R Return to arrival"})

func language_changed() -> void:
	refresh_text()
	if town.ui.modal.visible and town.ui.modal_kind == "story": show_dialog(current_dialog)

func reflow_dialogue() -> void:
	if not town.ui.modal.visible or town.ui.modal_kind!="story": return
	var characters=town.ui.dialogue_body.visible_characters if is_instance_valid(town.ui.dialogue_body) else -1
	var focus=dialog_buttons.find(get_viewport().gui_get_focus_owner())
	show_dialog(current_dialog)
	town.ui.dialogue_body.visible_characters=characters
	town.ui.dialogue_reveal=maxi(0,characters)
	if focus>=0: call_deferred("_focus_option",mini(focus,dialog_buttons.size()-1),dialog_generation)

func _process(_delta: float) -> void:
	if resource_label: resource_label.visible = not town.ui.modal.visible

func replay() -> void:
	town.session.begin_again()

func restore_facts() -> void:
	if phase in ["night","ending"]: _apply_night()
	current_room = "" if town.session.state.zone == "street" else town.session.state.zone
	if current_room.is_empty():
		town.player.teleport(town.ARRIVAL)
	else:
		town.player.teleport(rooms[current_room].position+Vector3(0,0.1,0.9))
		town.camera.size = 11.5
		town.camera.position = rooms[current_room].position+Vector3(0,10.8,12.4)
		town.camera.look_at(rooms[current_room].position+Vector3(0,1,0))
	town.ui.language=town.session.state.language
	town.ui.reduced_motion=town.session.state.reduced_motion
	town.set_volume(town.session.state.volume)
	town.ui.apply_language()
	if third_knock: third_knock.apply_facts()
	_update_points()
	refresh_text()
