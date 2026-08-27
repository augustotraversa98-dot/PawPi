#!/usr/bin/env python3
"""
serpapi_pull.py — pull Pawpi directory data from SerpApi Google Maps.
Breadth-first, budget-capped, RESUMABLE. Reads key from env (SERPAPI_KEY).
Run:  set -a; . ./.env; set +a; python3 serpapi_pull.py
Resume later: just run again — it reads serpapi_run_log.json and skips done work.
"""
import os, sys, json, csv, time, datetime, urllib.parse, urllib.request

API_KEY = os.environ.get("SERPAPI_KEY")
if not API_KEY: sys.exit("ERROR: SERPAPI_KEY not set (source ./.env first).")

HERE = os.path.dirname(os.path.abspath(__file__))
CSV_PATH  = os.path.join(HERE, "serpapi_pull_caba_amba.csv")
JSON_PATH = os.path.join(HERE, "serpapi_pull_caba_amba.json")
LOG_PATH  = os.path.join(HERE, "serpapi_run_log.json")
ENDPOINT  = "https://serpapi.com/search.json"

MAX_SEARCHES    = int(os.environ.get("MAX_SEARCHES", "235"))   # monthly-safe ceiling
PAGES_PER_QUERY = int(os.environ.get("PAGES_PER_QUERY", "3"))
HL, SLEEP_SEC   = "es-419", 0.3
RUN_SECONDS     = int(os.environ.get("RUN_SECONDS", "38"))  # per-chunk wall-clock budget
START_CLOCK     = time.time()

QUERIES = [   # (bucket, term)
    ("provider","veterinaria"), ("provider","pet shop"), ("provider","peluqueria canina"),
    ("pet_friendly","pet friendly cafe"), ("pet_friendly","restaurante pet friendly"),
    ("pet_friendly","hotel pet friendly"),
]
AREAS = [
    "Palermo, CABA","Belgrano, CABA","Recoleta, CABA","Caballito, CABA","Villa Urquiza, CABA",
    "Flores, CABA","Almagro, CABA","Villa Crespo, CABA","Nunez, CABA","Colegiales, CABA",
    "San Telmo, CABA","Villa Devoto, CABA","Barracas, CABA","Boedo, CABA","Saavedra, CABA","Mataderos, CABA",
    "San Isidro, Buenos Aires","Vicente Lopez, Buenos Aires","Tigre, Buenos Aires","San Fernando, Buenos Aires",
    "Quilmes, Buenos Aires","Avellaneda, Buenos Aires","Lanus, Buenos Aires","Lomas de Zamora, Buenos Aires",
    "Moron, Buenos Aires","San Martin, Buenos Aires","Tres de Febrero, Buenos Aires","La Matanza, Buenos Aires",
    "Berazategui, Buenos Aires","Florencio Varela, Buenos Aires","Pilar, Buenos Aires","Escobar, Buenos Aires",
    "Merlo, Buenos Aires","Moreno, Buenos Aires",
]
COLS = ["bucket","provider_type","name","raw_types","address","area","lat","lng","phone","website",
        "rating","reviews","hours_json","pet_policy","unclaimed_on_google","google_place_id",
        "google_data_id","source_query"]

def now(): return datetime.datetime.now().isoformat(timespec="seconds")
def fetch(q, start):
    p={"engine":"google_maps","type":"search","q":q,"hl":HL,"api_key":API_KEY}
    if start: p["start"]=str(start)
    with urllib.request.urlopen(ENDPOINT+"?"+urllib.parse.urlencode(p), timeout=60) as r:
        return json.loads(r.read().decode("utf-8"))
def pet_policy(it):
    for e in it.get("extensions",[]):
        if "pets" in e: return ", ".join(e["pets"])
    for a in it.get("amenities",[]) or []:
        if "pet" in a.lower(): return a
    return ""
def map_type(bucket, it):
    if bucket!="provider": return "pet_friendly"
    tid=(it.get("type_id") or "").lower(); t=(it.get("type") or "").lower()
    if "vet" in tid or "vet" in t: return "vet"
    if "groom" in tid or "groom" in t: return "groomer"
    return "shop"

# ── resume state ─────────────────────────────────────────────────────────────
rows, done, skipped, used = {}, set(), [], 0
if os.path.exists(LOG_PATH):
    lg=json.load(open(LOG_PATH)); done=set(lg.get("done",[])); skipped=lg.get("skipped",[])
    if os.path.exists(JSON_PATH):
        for r in json.load(open(JSON_PATH)): rows[r["google_data_id"]]=r
    print(f"[resume] {len(rows)} places already collected, {len(done)} queries already done.")

def save(status):
    allr=list(rows.values())
    tmp=CSV_PATH+".tmp"
    with open(tmp,"w",newline="",encoding="utf-8") as f:
        w=csv.DictWriter(f,fieldnames=COLS); w.writeheader(); w.writerows(allr)
    os.replace(tmp,CSV_PATH)
    tmp=JSON_PATH+".tmp"; json.dump(allr, open(tmp,"w",encoding="utf-8"), ensure_ascii=False, indent=2); os.replace(tmp,JSON_PATH)
    prov=[r for r in allr if r["bucket"]=="provider"]; pf=[r for r in allr if r["bucket"]=="pet_friendly"]
    json.dump({"status":status,"updated":now(),"searches_used_this_run":used,
        "unique_places":len(allr),"providers":len(prov),"pet_friendly":len(pf),
        "with_phone":sum(1 for r in allr if r["phone"]),"with_hours":sum(1 for r in allr if r["hours_json"] not in ("{}","")),
        "done":sorted(done),"skipped":skipped}, open(LOG_PATH+".tmp","w",encoding="utf-8"), ensure_ascii=False, indent=2)
    os.replace(LOG_PATH+".tmp",LOG_PATH)

print(f"[start] {now()} budget={MAX_SEARCHES} pages={PAGES_PER_QUERY} queries={len(QUERIES)} areas={len(AREAS)}")
status="complete"
try:
    for page in range(PAGES_PER_QUERY):          # breadth-first: all page-1s before page-2s
        for bucket, term in QUERIES:
            for area in AREAS:
                key=f"{term}||{area}||{page}"
                if key in done: continue
                if time.time()-START_CLOCK > RUN_SECONDS:
                    save("paused_time"); print(f"  [pause] time budget hit at {used} searches, {len(rows)} places"); raise SystemExit(0)
                if len(done)>=MAX_SEARCHES:
                    skipped.append(key); continue
                q=f"{term} en {area}"
                try:
                    data=fetch(q, page*20); used+=1
                except Exception as e:
                    msg=str(e)
                    print(f"  ! {q} p{page}: {msg}")
                    if "429" in msg or "throttl" in msg.lower() or "run out" in msg.lower():
                        status="budget_or_rate_limit"; raise
                    done.add(key); continue
                locs=data.get("local_results",[])
                done.add(key)
                for it in locs:
                    did=it.get("data_id") or it.get("place_id")
                    if not did or did in rows: continue
                    gps=it.get("gps_coordinates") or {}
                    rows[did]={"bucket":bucket,"provider_type":map_type(bucket,it),"name":it.get("title",""),
                        "raw_types":" | ".join(it.get("types",[]) or []),"address":it.get("address",""),"area":area,
                        "lat":gps.get("latitude",""),"lng":gps.get("longitude",""),"phone":it.get("phone",""),
                        "website":it.get("website",""),"rating":it.get("rating",""),"reviews":it.get("reviews",""),
                        "hours_json":json.dumps(it.get("operating_hours",{}),ensure_ascii=False),
                        "pet_policy":pet_policy(it),"unclaimed_on_google":it.get("unclaimed_listing",""),
                        "google_place_id":it.get("place_id",""),"google_data_id":did,"source_query":q}
                if used % 10 == 0:
                    save("running"); print(f"  .. {used} searches, {len(rows)} unique places  [{now()}]")
                time.sleep(SLEEP_SEC)
    if any(f"{t}||{a}||{p}" not in done for p in range(PAGES_PER_QUERY) for _,t in QUERIES for a in AREAS):
        status="budget_reached" if len(done)>=MAX_SEARCHES else status
except Exception:
    if status=="complete": status="error"
save(status)
allr=list(rows.values())
print(f"[done] status={status} searches_used={used} unique={len(allr)} "
      f"providers={sum(1 for r in allr if r['bucket']=='provider')} pet_friendly={sum(1 for r in allr if r['bucket']=='pet_friendly')}")
print(f"CSV={CSV_PATH}")
