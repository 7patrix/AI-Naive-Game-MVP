extends CanvasLayer

const Localizer = preload("res://scripts/localizer.gd")
const ChineseFont = preload("res://assets/fonts/NotoSansCJKsc-Regular.otf")
var language := "zh"
var translatable_nodes: Array[Control] = []
var language_button: Button
var controls_box: VBoxContainer
var buttons_box: HBoxContainer
var modal_kind := ""
var prompt_source := ""

var town: Node3D
var root: Control
var objective: Label
var prompt_panel: PanelContainer
var prompt_text: Label
var toast_label: Label
var toast_panel: PanelContainer
var toast_left := 0.0
var modal: Control
var sound_button: Button
var pause_button: Button
var dim: ColorRect
var atmosphere: ShaderMaterial
var serif: SystemFont
var clock := 0.0
var behind_marker: PanelContainer
var title_label: Label
var subtitle_label: Label
var quest_header: Label
var status_label: Label
var story_keys_down: Dictionary = {}
var outside_focus: Control
var dialogue_panel: PanelContainer
var dialogue_body: Label
var dialogue_reveal := 0.0
var reduced_motion := false
var save_label: Label
var portrait_rect: TextureRect

const CREAM = Color("f0e5d1")
const GOLD = Color("dca85d")
const MUTED = Color("b8bec3")

func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	get_window().focus_exited.connect(_clear_story_key_latch)
	serif = SystemFont.new()
	serif.font_names = PackedStringArray(["Georgia", "Noto Serif", "Times New Roman"])
	if "--english" in OS.get_cmdline_user_args():
		language = "en"
	root = Control.new()
	root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(root)
	var fog = ColorRect.new()
	fog.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	fog.mouse_filter = Control.MOUSE_FILTER_IGNORE
	atmosphere = ShaderMaterial.new()
	atmosphere.shader = load("res://assets/atmosphere.gdshader")
	fog.material = atmosphere
	root.add_child(fog)
	var mast = Control.new()
	mast.position = Vector2(38,28)
	mast.size = Vector2(400,200)
	mast.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(mast)
	var eyebrow = label("MOONKILLER  /  A LANTERN TALE",12,GOLD)
	mast.add_child(eyebrow)
	var title = label("Mothwake",38,CREAM,true)
	title_label = title
	title.position = Vector2(0,17)
	mast.add_child(title)
	var subtitle = label("The town that forgot the dawn.",14,MUTED,true)
	subtitle_label = subtitle
	subtitle.position = Vector2(2,65)
	mast.add_child(subtitle)
	var quest = panel(Vector2(0,104),Vector2(310,74),false)
	mast.add_child(quest)
	var vb = VBoxContainer.new()
	quest.add_child(vb)
	quest_header = label("TONIGHT'S ERRAND",11,GOLD)
	vb.add_child(quest_header)
	objective = label("Read the notice beside the old well.",17,CREAM)
	objective.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	objective.custom_minimum_size.x = 280
	vb.add_child(objective)
	var north = label("NIGHTFALL  ·  OLD TOWN",12,MUTED)
	status_label = north
	north.set_anchors_and_offsets_preset(Control.PRESET_TOP_RIGHT)
	north.position = Vector2(-291,34)
	north.size = Vector2(252,26)
	north.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	root.add_child(north)
	var controls = VBoxContainer.new()
	controls_box = controls
	controls.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_LEFT)
	controls.position = Vector2(38,-72)
	controls.size = Vector2(390,47)
	controls.add_theme_constant_override("separation",6)
	controls.add_child(label("WASD / ARROWS   Walk     SHIFT   Hurry",16,CREAM))
	controls.add_child(label("E   Interact       ESC   Pause       R   Return to arrival",15,MUTED))
	root.add_child(controls)
	prompt_panel = panel(Vector2.ZERO,Vector2(350,54))
	prompt_panel.set_anchors_and_offsets_preset(Control.PRESET_CENTER_BOTTOM)
	prompt_panel.position = Vector2(-175,-120)
	prompt_panel.size = Vector2(350,54)
	root.add_child(prompt_panel)
	prompt_text = label("",16,CREAM)
	prompt_text.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	prompt_panel.add_child(prompt_text)
	prompt_panel.hide()
	toast_panel = panel(Vector2.ZERO,Vector2(550,64),false)
	toast_panel.set_anchors_and_offsets_preset(Control.PRESET_CENTER_BOTTOM)
	toast_panel.position = Vector2(-275,-207)
	toast_panel.size = Vector2(550,64)
	root.add_child(toast_panel)
	toast_label = label("",16,CREAM,true)
	toast_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	toast_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	toast_panel.add_child(toast_label)
	toast_panel.hide()
	var buttons = HBoxContainer.new()
	buttons_box = buttons
	buttons.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_RIGHT)
	buttons.position = Vector2(-260,-66)
	buttons.size = Vector2(224,38)
	buttons.add_theme_constant_override("separation",10)
	root.add_child(buttons)
	sound_button = button("Sound: off")
	sound_button.pressed.connect(func():
		town.set_volume(0.14 if town.volume == 0.0 else 0.0)
		if town.session: town.session.checkpoint("sound_preference")
		set_text(sound_button,"Sound: low" if town.volume > 0 else "Sound: off"))
	buttons.add_child(sound_button)
	pause_button = button("Pause  II")
	pause_button.pressed.connect(show_pause)
	buttons.add_child(pause_button)
	language_button = button("English" if language == "zh" else "中文")
	language_button.pressed.connect(toggle_language)
	root.add_child(language_button)
	behind_marker = panel(Vector2.ZERO,Vector2(92,28),false)
	var marker_style = behind_marker.get_theme_stylebox("panel").duplicate() as StyleBoxFlat
	marker_style.content_margin_left = 6
	marker_style.content_margin_right = 6
	marker_style.content_margin_top = 3
	marker_style.content_margin_bottom = 3
	behind_marker.add_theme_stylebox_override("panel",marker_style)
	behind_marker.mouse_filter = Control.MOUSE_FILTER_IGNORE
	behind_marker.modulate.a = 0.72
	var marker_row = HBoxContainer.new()
	var marker_icon = TextureRect.new()
	marker_icon.texture = load("res://assets/art/v3/moth.png")
	marker_icon.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	marker_icon.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	marker_icon.custom_minimum_size = Vector2(16,16)
	marker_row.add_child(marker_icon)
	marker_row.add_child(label("Behind wall",12,GOLD))
	behind_marker.add_child(marker_row)
	root.add_child(behind_marker)
	behind_marker.hide()
	dim = ColorRect.new()
	dim.color = Color(0.035,0.05,0.055,0.74)
	dim.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	dim.mouse_filter = Control.MOUSE_FILTER_STOP
	dim.hide()
	root.add_child(dim)
	modal = Control.new()
	modal.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	modal.mouse_filter = Control.MOUSE_FILTER_IGNORE
	modal.hide()
	root.add_child(modal)
	toast("Follow the lamps. The noticeboard has a story to tell.",5.5)
	root.resized.connect(layout_hud)
	save_label = label("",12,MUTED)
	root.add_child(save_label)
	call_deferred("layout_hud")

func label(text: String, font_size: int, color: Color, use_serif := false) -> Label:
	var l = Label.new()
	l.set_meta("serif",use_serif)
	set_text(l,text)
	translatable_nodes.append(l)
	l.add_theme_font_size_override("font_size",font_size)
	l.add_theme_color_override("font_color",color)
	l.add_theme_color_override("font_shadow_color",Color(0.02,0.025,0.02,0.8))
	l.add_theme_constant_override("shadow_offset_x",1)
	l.add_theme_constant_override("shadow_offset_y",2)
	l.add_theme_font_override("font",ChineseFont if language == "zh" or not use_serif else serif)
	l.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return l

func panel(pos: Vector2, dimensions: Vector2, border := true) -> PanelContainer:
	var p = PanelContainer.new()
	p.position = pos
	p.size = dimensions
	var style = StyleBoxFlat.new()
	style.bg_color = Color(0.09,0.12,0.16,0.96)
	style.border_color = Color(0.65,0.56,0.37,0.50)
	style.set_border_width_all(1 if border else 0)
	style.set_corner_radius_all(3)
	style.content_margin_left = 16
	style.content_margin_right = 16
	style.content_margin_top = 12
	style.content_margin_bottom = 12
	p.add_theme_stylebox_override("panel",style)
	return p

func button(text: String) -> Button:
	var b = Button.new()
	set_text(b,text)
	translatable_nodes.append(b)
	b.add_theme_font_override("font",ChineseFont)
	b.custom_minimum_size = Vector2(104,44)
	b.add_theme_font_size_override("font_size",16)
	b.add_theme_color_override("font_color",CREAM)
	for key in ["normal","hover","pressed","focus"]:
		var s = StyleBoxFlat.new()
		s.bg_color = Color("253031") if key == "normal" else Color("3b4540")
		s.border_color = Color("8f7d56")
		s.set_border_width_all(1)
		s.set_corner_radius_all(2)
		s.content_margin_left = 16
		s.content_margin_right = 16
		b.add_theme_stylebox_override(key,s)
	return b

func update_quest() -> void:
	if town.story:
		town.story.refresh_text()
		return
	if town.door_open:
		set_text(objective,"The inn is open. A small light survives.")
	elif town.has_key:
		set_text(objective,"Bring the brass key to the Moth & Ember inn.")
	elif town.board_read:
		set_text(objective,"Lower the bucket into the old well.")
	else:
		set_text(objective,"Read the notice beside the old well.")

func set_prompt(text: String) -> void:
	prompt_panel.visible = not text.is_empty() and not modal.visible
	prompt_source = text
	prompt_text.text = "[ E ]   " + (town.story.prompt(text) if town.story else Localizer.translate(text,language))

func update_behind_marker(hidden: bool, screen_position: Vector2) -> void:
	behind_marker.visible = hidden and not modal.visible
	behind_marker.position = Vector2(clamp(screen_position.x-46,8,root.size.x-100),clamp(screen_position.y-42,8,root.size.y-50))

func toast(text: String, duration := 4.0) -> void:
	set_text(toast_label,text)
	toast_left = duration
	toast_panel.show()

func begin_modal(title: String, subtitle: String) -> VBoxContainer:
	if not modal.visible: outside_focus = get_viewport().gui_get_focus_owner()
	for control in [sound_button,pause_button,language_button]: control.focus_mode = Control.FOCUS_NONE
	for child in modal.get_children():
		child.queue_free()
	dim.show()
	modal.show()
	prompt_panel.hide()
	behind_marker.hide()
	town.player.locked = true
	town.player.velocity = Vector3.ZERO
	var modal_width = min(610.0,root.size.x-48.0)
	var p = panel(Vector2.ZERO,Vector2(modal_width,430))
	p.set_anchors_and_offsets_preset(Control.PRESET_CENTER)
	p.position = Vector2(-modal_width*0.5,-215)
	p.size = Vector2(modal_width,430)
	modal.add_child(p)
	var box = VBoxContainer.new()
	box.add_theme_constant_override("separation",17)
	p.add_child(box)
	box.add_child(label(subtitle,13,GOLD))
	box.add_child(label(title,30,CREAM,true))
	return box

func show_note() -> void:
	modal_kind = "note"
	var box = begin_modal("To the last traveler", "A notice in fading ink")
	var body = label("The innkeeper left a brass key in the well.\n\nLower the bucket. Bring back what the dark has borrowed. The Moth & Ember still has a room for you.\n\nPlease leave one light burning.",17,CREAM,true)
	body.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	body.custom_minimum_size = Vector2(min(562.0,root.size.x-96.0),190)
	box.add_child(body)
	var close = button("Fold the notice  ·  E")
	close.pressed.connect(close_modal)
	box.add_child(close)
	close.grab_focus()

func show_pause() -> void:
	if modal.visible:
		close_modal()
		return
	modal_kind = "pause"
	var box = begin_modal("Let the night wait.", "Paused")
	get_tree().paused = true
	var help = "Move with WASD or arrows. Hold Shift to hurry.\nE reads, retrieves and opens. R returns you to arrival."
	if town.story:
		help = "WASD / 方向键移动，Shift 加快。\nE 互动；R 在室内返回门口，在室外回到入口。" if language=="zh" else "WASD / arrows move. Shift hurries.\nE interacts; R returns to the doorway inside, arrival outside."
	box.add_child(label(help,15,MUTED))
	box.add_child(label("Master volume  ·  muted by default",13,GOLD))
	var slider = HSlider.new()
	slider.min_value = 0.0
	slider.max_value = 0.35
	slider.step = 0.01
	slider.value = town.volume
	slider.custom_minimum_size.y = 24
	slider.value_changed.connect(func(v):
		town.set_volume(v)
		if town.session: town.session.checkpoint("sound_preference")
		set_text(sound_button,"Sound: off" if v == 0 else "Sound: low"))
	box.add_child(slider)
	var resume = button(("继续这一夜 · ESC" if language=="zh" else "Continue this night · ESC") if town.story else "Return to the street  ·  ESC")
	resume.pressed.connect(close_modal)
	box.add_child(resume)
	var restart = button("Begin this night again")
	restart.pressed.connect(func():
		if town.session: town.session.begin_again()
		else:
			get_tree().paused = false
			get_tree().reload_current_scene())
	box.add_child(restart)
	if town.story and town.story.third_knock and is_instance_valid(town.story.third_knock.action_tween):
		var cancel = button("取消打结动作" if language=="zh" else "Cancel tying the knot")
		cancel.pressed.connect(func():
			town.story.third_knock.cancel_action()
			close_modal())
		box.add_child(cancel)
	var motion = button(("减少动态：开" if reduced_motion else "减少动态：关") if language=="zh" else ("Reduced motion: on" if reduced_motion else "Reduced motion: off"))
	motion.pressed.connect(func():
		reduced_motion=not reduced_motion
		motion.text=("减少动态：开" if reduced_motion else "减少动态：关") if language=="zh" else ("Reduced motion: on" if reduced_motion else "Reduced motion: off")
		if town.session: town.session.checkpoint("motion_preference"))
	box.add_child(motion)
	resume.grab_focus()

func close_modal() -> void:
	dim.color.a = 0.74
	if town.story and modal_kind=="story": town.story.dialog_closed()
	dialogue_body = null
	modal_kind = ""
	modal.hide()
	dim.hide()
	controls_box.show()
	buttons_box.show()
	language_button.show()
	town.player.locked = town.busy
	get_tree().paused = false
	for control in [sound_button,pause_button,language_button]: control.focus_mode = Control.FOCUS_ALL
	if is_instance_valid(outside_focus) and outside_focus.is_visible_in_tree(): outside_focus.grab_focus()
	outside_focus = null

func story_activation_key_held() -> bool:
	for key in [KEY_ENTER,KEY_KP_ENTER,KEY_SPACE,KEY_E]:
		if story_keys_down.has(key): return true
	return false

func _clear_story_key_latch() -> void:
	story_keys_down.clear()
	if town.story: town.story.release_dialog_activation()

func _input(event: InputEvent) -> void:
	if not event is InputEventKey: return
	var key = event.physical_keycode if event.physical_keycode!=0 else event.keycode
	var was_down = story_keys_down.has(key)
	if event.pressed: story_keys_down[key] = true
	else:
		story_keys_down.erase(key)
		if town.story: town.story.release_dialog_activation()
	var repeated = event.pressed and (event.echo or was_down)
	if repeated and key in [KEY_ENTER,KEY_KP_ENTER,KEY_SPACE,KEY_E,KEY_ESCAPE]:
		get_viewport().set_input_as_handled()
		return
	if not (town.story and modal.visible and modal_kind=="story"): return
	if not key in [KEY_UP,KEY_DOWN,KEY_TAB,KEY_ENTER,KEY_KP_ENTER,KEY_SPACE,KEY_E,KEY_ESCAPE,KEY_PAGEUP,KEY_PAGEDOWN]: return
	get_viewport().set_input_as_handled()
	if not event.pressed or repeated: return
	match key:
		KEY_UP: town.story.move_dialog_focus(-1)
		KEY_DOWN: town.story.move_dialog_focus(1)
		KEY_TAB: town.story.move_dialog_focus(-1 if event.shift_pressed else 1)
		KEY_ENTER,KEY_KP_ENTER: town.story.activate_dialog_focus()
		KEY_E,KEY_ESCAPE: close_modal()
		KEY_PAGEUP: town.story.scroll_dialog(-1)
		KEY_PAGEDOWN: town.story.scroll_dialog(1)

func _process(delta: float) -> void:
	controls_box.visible=not modal.visible
	buttons_box.visible=not modal.visible
	language_button.visible=not modal.visible
	if is_instance_valid(dialogue_body) and modal.visible and modal_kind == "story" and dialogue_body.visible_characters >= 0 and not get_tree().paused:
		dialogue_reveal += delta*46.0
		dialogue_body.visible_characters = mini(int(dialogue_reveal), dialogue_body.text.length())
		if dialogue_body.visible_characters >= dialogue_body.text.length(): dialogue_body.visible_characters = -1
	if town.session:
		var states={"loading":{"zh":"读取存档…","en":"Reading save…"},"saving":{"zh":"保存中…","en":"Saving…"},"saved":{"zh":"进度已保存","en":"Progress saved"},"restored":{"zh":"已恢复进度","en":"Progress restored"},"recovered":{"zh":"已恢复上一份存档","en":"Previous save restored"},"new":{"zh":"新的旅程","en":"A new journey"},"load_error":{"zh":"存档读取失败 · 旧记录已保留","en":"Save read failed · previous record preserved"},"save_error":{"zh":"进度未保存 · 请勿关闭","en":"Progress not saved · keep this window open"}}
		save_label.text=states.get(town.session.status,{}).get(language,"")
		save_label.visible=not modal.visible
	if not get_tree().paused and not reduced_motion:
		clock += delta
	atmosphere.set_shader_parameter("time",clock)
	if toast_left > 0:
		toast_left -= delta
		toast_panel.modulate.a = min(1.0,toast_left)
		if toast_left <= 0:
			toast_panel.hide()

func _unhandled_input(event: InputEvent) -> void:
	if modal.visible and modal_kind=="story": return
	if event is InputEventKey and event.echo:
		return
	if event.is_action_pressed("pause"):
		show_pause()
		get_viewport().set_input_as_handled()
	elif event.is_action_pressed("interact") and modal.visible:
		close_modal()
		get_viewport().set_input_as_handled()

func set_text(control: Control, source: String) -> void:
	control.set_meta("source_text",source)
	control.set("text",Localizer.translate(source,language))

func toggle_language() -> void:
	language = "en" if language == "zh" else "zh"
	apply_language()
	if town.session: town.session.checkpoint("language")

func apply_language() -> void:
	for control in translatable_nodes:
		if not is_instance_valid(control):
			continue
		set_text(control,control.get_meta("source_text",""))
		if control is Label:
			control.add_theme_font_override("font",serif if language == "en" and control.get_meta("serif",false) else ChineseFont)
	language_button.text = "English" if language == "zh" else "中文"
	set_prompt(prompt_source)
	update_quest()
	if town.story:
		toast_left = 0.0
		toast_panel.hide()
		town.story.language_changed()
	print("LANGUAGE ",language)

func layout_hud() -> void:
	if town.story and modal.visible and modal_kind=="story": town.story.call_deferred("reflow_dialogue")
	if save_label: save_label.position=Vector2(38,root.size.y-142)
	var narrow = root.size.x<980
	controls_box.position = Vector2(24,root.size.y-(112 if narrow else 76))
	buttons_box.position = Vector2(root.size.x-292,root.size.y-60)
	language_button.position = Vector2(root.size.x-150,62)
	prompt_panel.set_anchors_preset(Control.PRESET_TOP_LEFT)
	toast_panel.set_anchors_preset(Control.PRESET_TOP_LEFT)
	prompt_panel.size = Vector2(350,54)
	toast_panel.size = Vector2(min(550.0,root.size.x-48.0),64)
	prompt_panel.position = Vector2((root.size.x-prompt_panel.size.x)*0.5,root.size.y-(177 if narrow else 124))
	toast_panel.position = Vector2((root.size.x-toast_panel.size.x)*0.5,root.size.y-(258 if narrow else 215))


func begin_story_dialogue(title: String, speaker: String, portrait_key: String, compact := false, choice_count := 1) -> VBoxContainer:
	begin_modal(title, speaker)
	for child in modal.get_children(): child.queue_free()
	dim.color.a = 0.20
	var width = minf(960.0, root.size.x-48.0)
	var rows=ceilf(float(choice_count)/(2.0 if root.size.x>=800 else 1.0))
	var height = minf(maxf(240.0 if compact else 340.0,rows*52.0+204.0), root.size.y-48.0)
	dialogue_panel = panel(Vector2((root.size.x-width)*0.5,root.size.y-height-24.0),Vector2(width,height))
	var style = dialogue_panel.get_theme_stylebox("panel").duplicate() as StyleBoxFlat
	style.content_margin_left = 24
	style.content_margin_right = 24
	style.content_margin_top = 16
	style.content_margin_bottom = 16
	style.set_corner_radius_all(8)
	dialogue_panel.add_theme_stylebox_override("panel",style)
	modal.add_child(dialogue_panel)
	var row = HBoxContainer.new()
	row.add_theme_constant_override("separation",24)
	dialogue_panel.add_child(row)
	if not portrait_key.is_empty():
		portrait_rect = TextureRect.new()
		var source: Texture2D = load("res://assets/art/first_night/%s.png" % portrait_key)
		var portrait = AtlasTexture.new()
		var column={"innkeeper":0,"apothecary":1,"clockmaker":2}.get(portrait_key,0)
		portrait.atlas = load("res://assets/art/first_night/resident_portraits_quality.png")
		portrait.region = Rect2(column*648,0,648,809)
		portrait_rect.texture = portrait
		portrait_rect.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		portrait_rect.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		portrait_rect.custom_minimum_size = Vector2(112 if width<800 else 144,176 if compact else 210)
		portrait_rect.mouse_filter = Control.MOUSE_FILTER_IGNORE
		row.add_child(portrait_rect)
	var box = VBoxContainer.new()
	box.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	box.add_theme_constant_override("separation",8)
	row.add_child(box)
	box.add_child(label(title,22,GOLD))
	box.add_child(label(speaker,13,MUTED))
	return box

func bind_dialogue_body(body: Label) -> void:
	dialogue_body = body
	dialogue_reveal = 0.0
	var automated = false
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--qa") or arg.begins_with("--walk") or arg.begins_with("--record"): automated = true
	body.visible_characters = -1 if automated or reduced_motion else 0

func reveal_dialogue_if_typing() -> bool:
	if is_instance_valid(dialogue_body) and dialogue_body.visible_characters >= 0 and dialogue_body.visible_characters < dialogue_body.text.length():
		dialogue_body.visible_characters = -1
		return true
	return false
