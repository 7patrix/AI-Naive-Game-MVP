extends Node
## Optional facts are confined to q_third_knock. Main quest resources are never touched.
var story: Node
var town: Node3D
var q: Dictionary:
	get: return town.session.state.quest
var knocker: Node3D
var ring: MeshInstance3D
var cord: MeshInstance3D
var hand: Node3D
var arms: Array[MeshInstance3D] = []
var action_tween: Tween
var objective: Label
var completed_zone := ""
var tap_cooldown := 0.0
var was_near := false

func _ready() -> void:
	town=story.town
	story.data.merge(JSON.parse_string(FileAccess.get_file_as_string("res://assets/story/third_knock.json")))
	for key in story.data.keys():
		if key.begins_with("q_"): continue
		var resident="inn" if key.begins_with("inn") or key in ["night_west","ending_west"] else ("apothecary" if key.begins_with("apoth") else ("clock" if key.begins_with("clock") or key=="oil_choice" or key in ["night_clock","ending_clock"] else ""))
		if not resident.is_empty():
			story.data[key].options.append({"text":{"zh":"门外的两下敲击","en":"The two knocks at the door"},"action":"q_topic_"+resident})
	_build_knocker()
	objective=town.ui.label("",15,town.ui.MUTED)
	objective.autowrap_mode=TextServer.AUTOWRAP_WORD_SMART
	objective.size=Vector2(310,88)
	objective.position=Vector2(38,226)
	town.ui.root.add_child(objective)
	apply_facts()

func point() -> Vector3:
	return story.rooms.inn.position+Vector3(-3.0,0,-2.85)

func _build_knocker() -> void:
	knocker=Node3D.new()
	knocker.position=story.rooms.inn.position+Vector3(-3.0,0,-3.82)
	knocker.name="DoorKnocker"
	town.add_child(knocker)
	var post=MeshInstance3D.new()
	var wood=BoxMesh.new()
	wood.size=Vector3(1.02,2.22,0.13)
	post.mesh=wood
	post.position.y=1.11
	var timber=_material("796958")
	timber.albedo_texture=load("res://assets/art/v3/timber.png")
	timber.uv1_scale=Vector3(1.5,2.0,1)
	post.material_override=timber
	knocker.add_child(post)
	for i in range(4):
		var plank=MeshInstance3D.new()
		var board=BoxMesh.new()
		board.size=Vector3(0.22,2.1,0.06)
		plank.mesh=board
		plank.position=Vector3(-0.36+i*0.24,1.10,0.08)
		plank.material_override=timber
		knocker.add_child(plank)
	for y in [0.38,1.90]:
		var strap=MeshInstance3D.new()
		var bar=BoxMesh.new()
		bar.size=Vector3(0.94,0.07,0.025)
		strap.mesh=bar
		strap.position=Vector3(0,y,0.13)
		strap.material_override=_material("343734")
		knocker.add_child(strap)
	ring=MeshInstance3D.new()
	var torus=TorusMesh.new()
	torus.inner_radius=0.075
	torus.outer_radius=0.115
	ring.mesh=torus
	ring.position=Vector3(0,1.15,0.12)
	ring.rotation.x=PI/2
	ring.material_override=_material("b99859")
	knocker.add_child(ring)
	cord=MeshInstance3D.new()
	var knot=TorusMesh.new()
	knot.inner_radius=0.05
	knot.outer_radius=0.07
	cord.mesh=knot
	cord.position=Vector3(0,1.15,0.15)
	cord.rotation.x=PI/2
	cord.material_override=_material("d4c7a7")
	knocker.add_child(cord)
	# The player's hand is an independently articulated action prop, never a scaled body.
	hand=Node3D.new()
	hand.name="ReachAndTieHand"
	town.player.add_child(hand)
	for i in range(2):
		var sleeve=MeshInstance3D.new()
		var segment=CylinderMesh.new()
		segment.top_radius=0.055 if i==1 else 0.072
		segment.bottom_radius=0.065 if i==1 else 0.082
		segment.height=0.3
		sleeve.mesh=segment
		sleeve.material_override=_material("414839")
		town.player.add_child(sleeve)
		sleeve.hide()
		arms.append(sleeve)
	var palm=MeshInstance3D.new()
	var shape=SphereMesh.new()
	shape.radius=0.09
	shape.height=0.13
	palm.mesh=shape
	palm.material_override=_material("c6a789")
	hand.add_child(palm)
	hand.hide()

func _material(color: String) -> StandardMaterial3D:
	var mat=StandardMaterial3D.new()
	mat.albedo_color=Color(color)
	mat.roughness=0.95
	return mat

func topic(resident: String) -> void:
	if resident=="clock": story.show_dialog("q_08")
	elif resident=="apothecary": story.show_dialog("q_11")
	elif q.status=="available": story.show_dialog("q_01")
	elif q.status=="ready_to_report": story.show_dialog("q_16" if q.solution=="quiet" else "q_21")
	elif q.status=="completed": story.show_dialog(("q_25" if q.solution=="quiet" else "q_26") if q.revisit_eligible and not q.revisit_seen else "q_done")
	elif q.neighbor_reply_received: story.show_dialog("q_20")
	else: story.show_dialog("q_active")

func inspect() -> void:
	story.show_dialog("q_tied" if q.solution=="quiet" else "q_06")

func read_node(key: String) -> void:
	var changed=false
	if key=="q_07" and not q.inspected: q.inspected=true; changed=true
	elif key=="q_10" and not q.repair_hint_seen: q.repair_hint_seen=true; changed=true
	elif key=="q_14" and not q.neighbor_reply_received: q.neighbor_reply_received=true; changed=true
	if changed: town.session.checkpoint("third_knock_read")

func action(key: String) -> void:
	match key:
		"q_topic_inn","q_topic_apothecary","q_topic_clock": topic(key.trim_prefix("q_topic_")); return
		"q_accept":
			if q.status=="available": q.status="active"
		"q_inspect_done":
			read_node("q_07")
			if q.status=="active" and q.solution=="none": story.show_dialog("q_15"); return
		"q_hint_done": read_node("q_10")
		"q_reply_done": read_node("q_14")
		"q_tie":
			if q.status=="active" and q.inspected and q.solution=="none": _tie()
			return
		"q_convey":
			if q.status=="active" and q.neighbor_reply_received and q.solution=="none":
				q.solution="message"
				q.status="ready_to_report"
				apply_facts()
				town.session.checkpoint("third_knock_message")
				story.show_dialog("q_21")
			return
		"q_complete":
			if q.status=="ready_to_report":
				q.status="completed"
				completed_zone=story.current_room
		"q_revisit_done":
			if q.status=="completed" and q.revisit_eligible: q.revisit_seen=true
	apply_facts()
	town.session.checkpoint("third_knock_action")
	town.ui.close_modal()

func _tie() -> void:
	if town.busy or town.player.position.distance_to(point())>1.9: return
	town.ui.close_modal()
	town.busy=true
	town.player.locked=true
	hand.position=Vector3(-0.25,1.05,0.12)
	hand.show()
	for sleeve in arms: sleeve.show()
	var target=town.player.to_local(knocker.position+Vector3(0,1.15,0.24))
	action_tween=create_tween()
	action_tween.tween_property(hand,"position",target,0.42).set_trans(Tween.TRANS_SINE)
	action_tween.tween_property(hand,"rotation:z",0.22,0.24)
	action_tween.tween_property(hand,"rotation:z",-0.15,0.24)
	action_tween.tween_property(hand,"position",Vector3(-0.25,1.05,0.12),0.38).set_trans(Tween.TRANS_SINE)
	action_tween.tween_callback(func():
		if q.status=="active" and q.solution=="none":
			q.solution="quiet"
			q.status="ready_to_report"
		_finish_action()
		apply_facts()
		town.session.checkpoint("third_knock_tied")
		town.ui.toast(story._tr({"zh":"铜扣安静了。把结果告诉阿槐。","en":"The knocker is quiet. Tell A-Huai."})))
	town.ui.toast(story._tr({"zh":"抬手，打一个活结… Esc 可暂停或取消动作。","en":"Reaching up to tie a slipknot… Esc pauses or cancels the action."}),2.5)

func cancel_action() -> void:
	if is_instance_valid(action_tween): action_tween.kill()
	_finish_action()
	apply_facts()

func _finish_action() -> void:
	action_tween=null
	hand.hide()
	for sleeve in arms: sleeve.hide()
	hand.rotation=Vector3.ZERO
	town.busy=false
	town.player.locked=town.ui.modal.visible

func leave_zone(departing: String) -> void:
	if q.status=="completed" and not q.revisit_eligible and departing=="inn":
		q.revisit_eligible=true
		town.session.checkpoint("third_knock_departure")

func apply_facts() -> void:
	if not cord: return
	cord.visible=q.solution=="quiet"
	ring.rotation.y=0
	var sprite=story.residents.inn.get_child(0) as Sprite3D
	if sprite:
		sprite.rotation.z=-0.015 if q.solution=="quiet" else 0.0
		if q.solution=="message": sprite.flip_h=town.player.position.x<story.residents.inn.position.x

func _process(delta: float) -> void:
	if not objective: return
	if is_instance_valid(action_tween):
		var shoulder=Vector3(-0.25,1.08,0.10)
		var elbow=shoulder.lerp(hand.position,0.53)+Vector3(-0.035,-0.12,0.04)
		_align_arm(arms[0],shoulder,elbow)
		_align_arm(arms[1],elbow,hand.position)
	objective.visible=q.status!="available" and not town.ui.modal.visible
	var text={"zh":"门外第三声\n察看门边的铜扣。","en":"THE THIRD KNOCK\nInspect the door knocker."}
	if q.status=="active" and q.inspected: text={"zh":"门外第三声\n固定铜扣，或带回闻弦的话。","en":"THE THIRD KNOCK\nSecure the knocker, or bring back Wen-Xian’s message."}
	elif q.status=="ready_to_report": text={"zh":"门外第三声\n把结果告诉阿槐。","en":"THE THIRD KNOCK\nBring your answer to A-Huai."}
	elif q.status=="completed": text={"zh":"门外第三声 · 已完成","en":"THE THIRD KNOCK · COMPLETE"}
	if q.status in ["active","ready_to_report"] and story.choice=="clock" and story.phase in ["night","ending"]:
		text={"zh":"门外第三声\n旅店今夜落锁；未完成的进度已保留。","en":"THE THIRD KNOCK\nThe inn is locked tonight. Your unfinished errand is preserved."}
	objective.text=story._tr(text)
	if town.ui.modal.visible and town.ui.modal_kind=="story" and is_instance_valid(town.ui.dialogue_body) and town.ui.dialogue_body.visible_characters==-1: read_node(story.current_dialog)
	var near=story.current_room=="inn" and town.player.position.distance_to(point())<2.5
	if q.solution!="quiet": ring.rotation.y=sin(Time.get_ticks_msec()*0.003)*0.09
	tap_cooldown=maxf(0,tap_cooldown-delta)
	if near and not was_near and tap_cooldown==0 and q.solution!="quiet":
		town.play_sound("key")
		var taps=create_tween()
		taps.tween_interval(0.20)
		taps.tween_callback(func(): town.play_sound("key"))
		tap_cooldown=8
	was_near=near
	if q.status=="completed" and not q.revisit_eligible and story.current_room.is_empty() and town.player.position.distance_to(story.residents.inn.position)>7:
		q.revisit_eligible=true
		town.session.checkpoint("third_knock_departure")

func _align_arm(mesh: MeshInstance3D, from: Vector3, to: Vector3) -> void:
	var direction=to-from
	mesh.position=(from+to)*0.5
	mesh.mesh.height=maxf(0.05,direction.length())
	if direction.length()>0.001: mesh.quaternion=Quaternion(Vector3.UP,direction.normalized())
