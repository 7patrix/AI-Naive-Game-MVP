extends Node
const State=preload("res://scripts/game_state.gd")
var town: Node3D
var story: Node
var quest: Node
var results: Array = []

func _ready() -> void:
	process_mode=Node.PROCESS_MODE_ALWAYS
	call_deferred("_run")

func ticks(count: int) -> void:
	for _i in range(count): await get_tree().process_frame

func check(ok: bool, label: String) -> void:
	var line=("PASS " if ok else "FAIL ")+label
	results.append(line)
	print("QUALITY_QA ",line)

func click(key: String) -> void:
	var options=story.data[story.current_dialog].options
	for i in range(options.size()):
		if options[i].get("action",options[i].get("next",""))==key:
			story.dialog_buttons[i].pressed.emit()
			await ticks(2)
			return
	check(false,"Missing presented choice "+key)

func read_through(first: int, last: int) -> void:
	for i in range(first,last): await click("q_%02d" % (i+1))

func fresh(zone := "inn") -> void:
	get_tree().paused=false
	quest.cancel_action()
	town.ui.close_modal()
	town.session.state=State.new()
	town.session.state.zone=zone
	story.restore_facts()

func _run() -> void:
	await ticks(10)
	story=town.story
	quest=story.third_knock
	var initial=State.new().snapshot()
	check(State.decode(initial).ok,"Fresh state round-trips through bounded fact codec")
	check(State.decode(JSON.parse_string(JSON.stringify(initial))).ok,"Serialized JSON numeric types round-trip through codec")
	var old=initial.duplicate(true)
	old.erase("q_third_knock")
	check(State.decode(old).ok and State.decode(old).state.quest.status=="available","Older saves acquire optional quest namespace without changing main facts")
	for field in ["oil","choice","phase","flags","q_third_knock","revision"]:
		var bad=initial.duplicate(true)
		bad[field]={"oil":1,"choice":"evil","phase":"missing","flags":{"evil":true},"q_third_knock":{"status":"completed"},"revision":-1}[field]
		check(not State.decode(bad).ok,"Reject invalid save field: "+field)
	fresh()
	quest.inspect()
	await click("q_07")
	await ticks(3)
	check(quest.q.inspected and quest.q.status=="available","Inspection before acceptance persists independently")
	await click("q_inspect_done")
	quest.topic("inn")
	await read_through(1,5)
	await click("q_accept")
	check(quest.q.status=="active" and quest.q.inspected,"Acceptance retains early inspection")
	quest.topic("apothecary")
	await read_through(11,14)
	await click("q_reply_done")
	check(quest.q.neighbor_reply_received and quest.q.solution=="none","Reading neighbor reply does not select message solution")
	var main_before={"oil":story.oil,"phase":story.phase,"choice":story.choice,"flags":story.flags.duplicate(true)}
	town.player.teleport(quest.point()+Vector3(0,0.1,0.75))
	story.show_dialog("q_15")
	await click("q_tie")
	check(town.busy and quest.hand.visible and quest.q.solution=="none","Tying begins with separate articulated hand and no premature commit")
	town.ui.show_pause()
	var hand_position=quest.hand.position
	await ticks(25)
	check(get_tree().paused and quest.hand.position==hand_position and quest.q.solution=="none","Pause freezes actual action and its state commit")
	quest.cancel_action()
	town.ui.close_modal()
	check(not town.busy and not quest.hand.visible and quest.q.solution=="none","Cancel withdraws hand without committing solution")
	story.show_dialog("q_15")
	await click("q_tie")
	while town.busy: await ticks(2)
	check(quest.q.solution=="quiet" and quest.q.status=="ready_to_report" and quest.cord.visible,"Quiet solution commits only after complete action and appears in world")
	check(main_before=={"oil":story.oil,"phase":story.phase,"choice":story.choice,"flags":story.flags.duplicate(true)},"Side quest consumes no main oil, rope, medicine or main flags")
	quest.topic("inn")
	await read_through(16,19)
	await click("q_complete")
	check(quest.q.status=="completed" and not quest.q.revisit_eligible,"Result dialogue completes quest before revisit becomes eligible")
	story.transition_room("")
	while town.busy: await ticks(2)
	check(quest.q.revisit_eligible,"Leaving real inn area unlocks one follow-up")
	quest.topic("inn")
	check(story.current_dialog=="q_25","Quiet follow-up matches chosen solution")
	await click("q_revisit_done")
	quest.topic("inn")
	check(story.current_dialog=="q_done" and quest.q.revisit_seen,"Follow-up is idempotent and shown once")
	fresh()
	quest.topic("apothecary")
	await read_through(11,14)
	await click("q_reply_done")
	check(quest.q.neighbor_reply_received and not quest.q.inspected,"Neighbor reply before inspection remains valid")
	quest.topic("inn")
	await read_through(1,5)
	await click("q_accept")
	quest.topic("inn")
	check(story.current_dialog=="q_20" and quest.q.solution=="none","Message requires explicit convey choice")
	await click("q_convey")
	town.ui.close_modal()
	quest.topic("inn")
	check(story.current_dialog=="q_21" and quest.q.status=="ready_to_report","Interrupted message resumes committed response without repeat effect")
	await read_through(21,24)
	await click("q_complete")
	check(quest.q.status=="completed" and quest.q.solution=="message" and not quest.cord.visible,"Message outcome preserves loose knocker in the world")
	var completed=town.session.state.snapshot()
	for status in ["available","active","completed"]:
		for route in ["west","clock"]:
			fresh("street")
			if status=="completed": town.session.state.quest=completed.q_third_knock.duplicate(true)
			else: quest.q.status=status
			story.flags={"met_inn":true,"met_apothecary":true,"met_clock":true,"medicine_taken":true,"medicine_delivered":true,"cord_taken":true,"clock_repaired":true}
			story._update_phase()
			var before=quest.q.duplicate(true)
			story.action("choose_"+route)
			await click("confirm_"+route)
			while town.busy: await ticks(2)
			story.action("finish_night")
			check(story.phase=="ending" and story.choice==route and story.oil==0 and quest.q.status==before.status and quest.q.solution==before.solution,"Both main endings remain valid with quest "+status+": "+route)
	town.ui.close_modal()
	town.session.disabled=false
	town.session.writable=true
	town.session.save_file="res://evidence/quality-state-current.json"
	town.session.previous_file="res://evidence/quality-state-previous.json"
	town.session.temp_file="res://evidence/quality-state-pending.json"
	print("QUALITY_SAVE_ROOT ",ProjectSettings.globalize_path(town.session.save_file))
	print("QUALITY_SAVE_GATE booted=",town.session.booted," writable=",town.session.writable," disabled=",town.session.disabled," valid=",State.decode(town.session.state.snapshot()).ok)
	town.session.checkpoint("native_test_first")
	print("QUALITY_SAVE_FILES status=",town.session.status," pending=",FileAccess.file_exists(town.session.temp_file)," current=",FileAccess.file_exists(town.session.save_file))
	check(town.session.status=="saved" and town.session.saved_revision==town.session.state.revision,"Native save acknowledges completed disk commit")
	var first=town.session._read(town.session.save_file)
	check(first.ok and first.value!=null and State.decode(first.value).get("ok",false),"Native save decodes complete ending facts")
	town.session.checkpoint("native_test_second")
	var previous=town.session._read(town.session.previous_file)
	check(previous.ok and previous.value!=null and previous.value.revision<town.session.state.revision,"Native previous save is recoverable and precedes current revision")
	var file=FileAccess.open(town.session.save_file,FileAccess.WRITE)
	file.store_string("{truncated")
	file.close()
	check(not town.session._read(town.session.save_file).ok and town.session._read(town.session.previous_file).ok,"Corrupt current save is detected while previous remains valid")
	var old_session=town.session
	var reader=load("res://scripts/game_session.gd").new()
	town.add_child(reader)
	reader.disabled=false
	reader.save_file=old_session.save_file
	reader.previous_file=old_session.previous_file
	reader.temp_file=old_session.temp_file
	town.session=reader
	reader.attach_story(story)
	check(reader.status=="recovered" and reader.state.phase=="ending" and reader.state.choice=="clock" and reader.state.quest.status=="completed","Regular session load restores previous checkpoint and completed quest facts")
	check(not town.busy and not quest.hand.visible and not town.player.locked,"Restoration applies facts without replaying action or stale locks")
	var broken=FileAccess.open(reader.previous_file,FileAccess.WRITE)
	broken.store_string("{broken")
	broken.close()
	var failed_reader=load("res://scripts/game_session.gd").new()
	town.add_child(failed_reader)
	failed_reader.disabled=false
	failed_reader.save_file=reader.save_file
	failed_reader.previous_file=reader.previous_file
	failed_reader.temp_file=reader.temp_file
	town.session=failed_reader
	failed_reader.attach_story(story)
	var preserved=FileAccess.get_file_as_string(failed_reader.save_file)
	failed_reader.checkpoint("must_not_overwrite")
	check(failed_reader.status=="load_error" and not failed_reader.writable and FileAccess.get_file_as_string(failed_reader.save_file)==preserved,"Unreadable saves remain intact and automatic checkpoints cannot overwrite them")
	failed_reader.inflight_revision=20
	failed_reader.saving=true
	failed_reader._saved(true,19)
	check(failed_reader.saving and failed_reader.saved_revision!=19,"Late acknowledgment cannot mark a newer checkpoint saved")
	failed_reader._saved(false,20)
	var output=FileAccess.open("res://evidence/quality_slice_results.json",FileAccess.WRITE)
	output.store_string(JSON.stringify({"method":"actual game scene, presented choice signals, explicit main-ending fixtures, native files; ordinary Web input verified separately","results":results},"\t"))
	print("QUALITY_QA_COMPLETE checks=",results.size()," failures=",results.filter(func(x): return x.begins_with("FAIL")).size())
	get_tree().quit(1 if results.any(func(x):return x.begins_with("FAIL")) else 0)
