extends Node
const State = preload("res://scripts/game_state.gd")
const SAVE = "user://mothwake-state-v1.json"
const PREVIOUS = "user://mothwake-state-v1.previous.json"
const TEMP = "user://mothwake-state-v1.pending.json"
const LIMIT = 65536
var save_file := SAVE
var previous_file := PREVIOUS
var temp_file := TEMP
var state = State.new()
var story: Node
var booted := false
var writable := true
var disabled := false
var saving := false
var queued := false
var saved_revision := -1
var inflight_revision := -1
var status := "loading"
var callback: JavaScriptObject
var wait_seconds := 0.0
signal status_changed(value: String)

func _ready() -> void:
	process_mode=Node.PROCESS_MODE_ALWAYS
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--qa") or arg.begins_with("--walk") or arg.begins_with("--record"): disabled=true

func attach_story(value: Node) -> void:
	story=value
	story.town.player.locked=true
	if disabled:
		_finish_load(null,true)
	elif OS.has_feature("web"):
		callback=JavaScriptBridge.create_callback(_web_reply)
		var window=JavaScriptBridge.get_interface("window")
		if window and window.moonkillerSave:
			window.moonkillerSave("load","",callback)
		else: _finish_load(null,false)
	else:
		var loaded=_read(save_file)
		if not loaded.ok or (loaded.value==null and FileAccess.file_exists(previous_file)):
			var previous=_read(previous_file)
			if previous.ok and previous.value!=null:
				loaded=previous
				loaded["recovered"]=true
			elif loaded.ok and loaded.value==null: loaded={"ok":false}
		_finish_load(loaded.get("value"),loaded.ok,loaded.get("recovered",false))

func _read(path: String) -> Dictionary:
	if not FileAccess.file_exists(path): return {"ok":true,"value":null}
	var file=FileAccess.open(path,FileAccess.READ)
	if not file or file.get_length()>LIMIT: return {"ok":false}
	var text=file.get_as_text()
	var parser=JSON.new()
	if parser.parse(text)!=OK: return {"ok":false}
	return {"ok":State.decode(parser.data).ok,"value":parser.data}

func _finish_load(value: Variant, ok: bool, recovered := false) -> void:
	if booted: return
	if ok and value!=null:
		var decoded=State.decode(value)
		ok=decoded.ok
		if ok: state=decoded.state
	if "--english" in OS.get_cmdline_user_args(): state.language="en"
	if ok and value==null and OS.has_feature("web"):
		state.reduced_motion=bool(JavaScriptBridge.get_interface("window").matchMedia("(prefers-reduced-motion: reduce)").matches)
	writable=ok
	booted=true
	saved_revision=state.revision if value!=null and ok else -1
	story.restore_facts()
	story.town.player.locked=false
	_set_status("recovered" if recovered else ("restored" if value!=null and ok else ("new" if ok else "load_error")))
	if not ok: story.town.ui.toast(story._tr({"zh":"存档读取失败。旧存档已保留；本次进度暂不覆盖它。","en":"The save could not be read. It has been preserved; this run will not overwrite it."}),8)

func checkpoint(_reason: String) -> void:
	if not booted or disabled or not writable: return
	state.zone=story.current_room if not story.current_room.is_empty() else "street"
	state.language=story.town.ui.language
	state.volume=story.town.volume
	state.reduced_motion=story.town.ui.reduced_motion
	state.revision+=1
	if saving:
		queued=true
		return
	_save()

func _save() -> void:
	var json=JSON.stringify(state.snapshot())
	if json.to_utf8_buffer().size()>LIMIT:
		_set_status("save_error")
		return
	saving=true
	inflight_revision=state.revision
	wait_seconds=0
	_set_status("saving")
	if OS.has_feature("web"):
		JavaScriptBridge.get_interface("window").moonkillerSave("save",json,callback)
	else:
		var file=FileAccess.open(temp_file,FileAccess.WRITE)
		var ok=file!=null
		if ok:
			file.store_string(json)
			file.flush()
			file.close()
			ok=_read(temp_file).ok
		if ok and FileAccess.file_exists(save_file):
			if _read(save_file).ok:
				if FileAccess.file_exists(previous_file): DirAccess.remove_absolute(previous_file)
				ok=DirAccess.rename_absolute(save_file,previous_file)==OK
			else: ok=DirAccess.remove_absolute(save_file)==OK
		if ok: ok=DirAccess.rename_absolute(temp_file,save_file)==OK
		if not ok and not FileAccess.file_exists(save_file) and FileAccess.file_exists(previous_file): DirAccess.rename_absolute(previous_file,save_file)
		_saved(ok,state.revision)

func _web_reply(args: Array) -> void:
	if args.is_empty(): return
	var response=JSON.parse_string(str(args[0]))
	if not response is Dictionary: return
	if response.get("op")=="load": _finish_load(response.get("value"),response.get("ok",false),response.get("recovered",false))
	elif response.get("op")=="save": _saved(response.get("ok",false),int(response.get("revision",-1)))

func _saved(ok: bool, revision: int) -> void:
	if revision!=inflight_revision: return
	saving=false
	if ok:
		saved_revision=revision
		_set_status("saved")
	else: _set_status("save_error")
	if queued:
		queued=false
		_save()

func _set_status(value: String) -> void:
	status=value
	status_changed.emit(status)

func _process(delta: float) -> void:
	if (not booted or saving) and not disabled:
		wait_seconds+=delta
		if wait_seconds>8:
			if not booted: _finish_load(null,false)
			elif saving:
				queued=false
				_saved(false,inflight_revision)

func begin_again() -> void:
	# An explicit player restart may replace an unreadable save; ordinary play cannot.
	if not booted or saving: return
	var previous_writable=writable
	writable=true
	var previous_state=state
	state=State.new()
	state.language=story.town.ui.language
	state.reduced_motion=story.town.ui.reduced_motion
	if not disabled:
		state.revision=previous_state.revision+1
		_save()
		while saving: await get_tree().process_frame
		if status!="saved":
			state=previous_state
			writable=previous_writable
			story.town.ui.toast(story._tr({"zh":"新旅程未能保存，请稍后重试。","en":"The new journey could not be saved. Please try again."}),6)
			return
	get_tree().paused=false
	get_tree().reload_current_scene()
