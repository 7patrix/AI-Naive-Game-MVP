extends RefCounted
## Serializable facts only. Presentation locks, nodes and animation progress never enter a save.
const FLAG_KEYS = ["met_inn","met_apothecary","met_clock","medicine_taken","medicine_held","medicine_delivered","cord_taken","cord_held","clock_repaired"]
var phase := "day"
var oil := 2
var choice := ""
var flags: Dictionary = {}
var quest: Dictionary = fresh_quest()
var zone := "street"
var language := "zh"
var volume := 0.0
var reduced_motion := false
var revision := 0

static func fresh_quest() -> Dictionary:
	return {"status":"available","inspected":false,"repair_hint_seen":false,"neighbor_reply_received":false,"solution":"none","revisit_eligible":false,"revisit_seen":false}

func snapshot() -> Dictionary:
	return {"format":"mothwake-state","schema":1,"content":"first-night-third-knock-1","revision":revision,"phase":phase,"oil":oil,"choice":choice,"flags":flags.duplicate(true),"q_third_knock":quest.duplicate(true),"location":{"zone":zone,"spawn":"arrival" if zone=="street" else "door"},"preferences":{"language":language,"volume":volume,"reduced_motion":reduced_motion}}

static func decode(value: Variant) -> Dictionary:
	if not value is Dictionary or value.get("format")!="mothwake-state" or value.get("schema")!=1: return {"ok":false}
	if not value.get("phase") in ["day","ready","night","ending"]: return {"ok":false}
	var saved_oil=value.get("oil")
	# JSON numbers become floats in Godot; enum array membership uses strict Variant types.
	if not (saved_oil is int or saved_oil is float) or (saved_oil!=0 and saved_oil!=2) or not value.get("choice","") in ["","west","clock"]: return {"ok":false}
	if value.phase in ["day","ready"] and (value.oil!=2 or value.choice!=""): return {"ok":false}
	if value.phase in ["night","ending"] and (value.oil!=0 or value.choice==""): return {"ok":false}
	if not value.get("flags") is Dictionary: return {"ok":false}
	for key in value.flags:
		if not key in FLAG_KEYS or not value.flags[key] is bool: return {"ok":false}
	if value.flags.get("medicine_held",false) and (not value.flags.get("medicine_taken",false) or value.flags.get("medicine_delivered",false)): return {"ok":false}
	if value.flags.get("cord_held",false) and (not value.flags.get("cord_taken",false) or value.flags.get("clock_repaired",false)): return {"ok":false}
	var q = fresh_quest()
	var incoming = value.get("q_third_knock",{})
	if not incoming is Dictionary: return {"ok":false}
	for key in incoming:
		if not q.has(key): return {"ok":false}
		q[key] = incoming[key]
	if not q.status in ["available","active","ready_to_report","completed"] or not q.solution in ["none","quiet","message"]: return {"ok":false}
	for key in ["inspected","repair_hint_seen","neighbor_reply_received","revisit_eligible","revisit_seen"]:
		if not q[key] is bool: return {"ok":false}
	if (q.status in ["available","active"]) != (q.solution=="none"): return {"ok":false}
	if q.solution=="message" and not q.neighbor_reply_received: return {"ok":false}
	if q.solution=="quiet" and not q.inspected: return {"ok":false}
	if (q.revisit_eligible or q.revisit_seen) and q.status!="completed": return {"ok":false}
	if q.revisit_seen and not q.revisit_eligible: return {"ok":false}
	var location = value.get("location",{})
	var prefs = value.get("preferences",{})
	if not location is Dictionary or not location.get("zone","street") in ["street","inn","apothecary"]: return {"ok":false}
	if not prefs is Dictionary or not prefs.get("language","zh") in ["zh","en"]: return {"ok":false}
	var loudness = prefs.get("volume",0.0)
	if not (loudness is float or loudness is int) or not is_finite(float(loudness)) or loudness<0 or loudness>0.35: return {"ok":false}
	if not prefs.get("reduced_motion",false) is bool: return {"ok":false}
	var rev = value.get("revision",0)
	if not (rev is float or rev is int) or not is_finite(float(rev)) or rev<0 or rev>2147483647 or float(rev)!=floor(float(rev)): return {"ok":false}
	var state = new()
	state.phase=value.phase
	state.oil=int(value.oil)
	state.choice=value.choice
	state.flags=value.flags.duplicate(true)
	state.quest=q
	state.zone=location.get("zone","street")
	# The tower ending closes the inn: restore at arrival, never respawn its residents.
	if state.zone=="inn" and state.choice=="clock": state.zone="street"
	state.language=prefs.get("language","zh")
	state.volume=float(loudness)
	state.reduced_motion=prefs.get("reduced_motion",false)
	state.revision=int(rev)
	return {"ok":true,"state":state}
