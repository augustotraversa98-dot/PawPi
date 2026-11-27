#!/usr/bin/env python3
"""
tinyfish_enrich.py — read unclaimed directory vets' own websites with the TinyFish Agent and save
what they publish (about text, services, prices, hours) to a JSON file for human review.

It NEVER touches the database: load_enrichment.mjs loads the reviewed file (the same two-step
split as serpapi_pull.py -> load_master.mjs). Budget-capped and RESUMABLE. Stdlib only.

Universe: serpapi_gmaps vets whose CSV `area` is AREA, intersected with enrich_universe.json (the
database's unclaimed rows that have a website_url). Create that file with:
    node supabase/seed/directory/load_enrichment.mjs --export-universe

Run (reads TINYFISH_API_KEY from ./.env, or from the environment):
    python3 tinyfish_enrich.py --dry-run          # who would be read; no API calls, no cost
    python3 tinyfish_enrich.py --verify           # re-check saved results against the sites; no cost
    MAX_AGENT_RUNS=10 python3 tinyfish_enrich.py
Resume: run it again — finished listings are skipped and in-flight runs are polled, not re-bought.

Env:
    MAX_AGENT_RUNS  cap on agent runs EVER recorded in the run log (default 10)
    MAX_STEPS       per-run step cap (default 25). Enforced HERE, by cancelling the run: TinyFish's own
    RUN_TIMEOUT     max_steps is a beta feature. A run older than RUN_TIMEOUT seconds (default 600) is
                    cancelled too. Keep the script running: nothing else stops a run before TinyFish's 150.
    AREA            CSV area to read (default "Palermo, CABA")
    ONLY            comma-separated external_ids to limit to
    INCLUDE_SOCIAL  1 = also try Instagram/Facebook/WhatsApp links (login walls; skipped by default)
    RETRY_FAILED    1 = buy a new run for listings whose last run failed
    BROWSER_PROFILE lite (default) | stealth
    OUT_DIR         where the universe, results and run-log files live (default: this folder)
    ENV_FILE        .env to read the key from (default: ./.env)
"""
import csv, datetime, html.parser, json, os, re, sys, time, unicodedata, urllib.error, urllib.parse, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
API = "https://agent.tinyfish.ai"
FETCH_API = "https://api.fetch.tinyfish.ai"  # renders JavaScript; free daily allowance
FINAL = ("COMPLETED", "FAILED", "CANCELLED")
DAYS = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")
SOCIAL_HOSTS = ("instagram.com", "facebook.com", "fb.com", "wa.me", "wa.link", "whatsapp.com", "tiktok.com")


def now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")


def read_json(path, default):
    if not os.path.exists(path):
        return default
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def write_json(path, value):
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(value, f, ensure_ascii=False, indent=2)
    os.replace(tmp, path)


def read_key(env_file):
    key = os.environ.get("TINYFISH_API_KEY")
    if not key and os.path.exists(env_file):
        with open(env_file, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line.startswith("export "):
                    line = line[len("export "):]
                if line.startswith("TINYFISH_API_KEY="):
                    key = line.split("=", 1)[1].strip().strip("\"'")
    return key or None


def host_of(url):
    host = (urllib.parse.urlparse(url).hostname or "").lower()
    return host[4:] if host.startswith("www.") else host


def is_social(url):
    host = host_of(url)
    return any(host == h or host.endswith("." + h) for h in SOCIAL_HOSTS)


# ── universe ─────────────────────────────────────────────────────────────────
def build_universe(csv_rows, db_rows, area):
    """CSV decides the area; the database decides eligibility and which URL is current."""
    eligible = {
        r["external_id"]: r
        for r in db_rows
        if r.get("claim_status") == "unclaimed" and (r.get("website_url") or "").strip()
    }
    out = []
    for row in csv_rows:
        if row.get("external_source") != "serpapi_gmaps" or row.get("provider_type") != "vet":
            continue
        if row.get("area") != area or row.get("external_id") not in eligible:
            continue
        db = eligible[row["external_id"]]
        out.append({
            "external_id": row["external_id"],
            "provider_id": db.get("id"),
            "name": row.get("name", ""),
            "address": row.get("address", ""),
            "website_url": db["website_url"].strip(),
        })
    return out


# ── the goal, and what we keep from the answer ───────────────────────────────
def build_goal(item, max_steps=25):
    return f"""You are reading the public website of a veterinary business.
Business name: {item['name']}
Address: {item['address']}

Task: read this website only (home page plus any services, price list, about and contact pages).
Do not leave this domain, do not log in, do not submit any form, do not open WhatsApp or social links.
Be brief: finish in under {max_steps - 5} steps, returning what you have found so far.

Return ONLY one JSON object with exactly this shape:
{{"status": "success" | "no_content" | "blocked" | "auth_required" | "wrong_site",
  "reason": "<one short sentence>",
  "bio": "<string>" or null,
  "services": [{{"name": "<string>", "description": "<string>" or null, "price_ars": <number> or null,
                "price_text": "<string>" or null, "source_url": "<page you read it on>"}}],
  "hours": {{"mon": [{{"open": "HH:MM", "close": "HH:MM"}}] or "closed" or null, "tue": ..., "wed": ...,
            "thu": ..., "fri": ..., "sat": ..., "sun": ...}} or null}}

Rules:
- Use only information explicitly written on this website. Never guess, infer, or fill gaps from general
  knowledge about what vets usually offer. When unsure, return null or leave the item out.
- Keep all text in the website's own language.
- If the site covers several branches, this listing is ONLY the branch at the address above: include what the
  site offers at that branch or at all branches, and leave out anything it places at another branch
  (for example a 24-hour service available only elsewhere). Use only that branch's prices and hours.
- bio: 1 to 3 consecutive sentences copied character for character from one page where the site describes
  this business. null if it has none. Never summarize, translate or write your own text.
- Service names and descriptions are copied exactly as written on the page, never translated. A service
  with no description on the site gets null.
- services: only services this business explicitly says it offers (for example consultations, vaccination,
  surgery, grooming). Do not list retail products, brands or articles.
- If a price is not published, return null for it, do not estimate. price_ars is only for a fixed price in
  Argentine pesos published for that exact service; copy the exact published price text into price_text.
  For "from"/"desde" prices, ranges, or other currencies, set price_ars to null.
- hours: only opening hours written on the site, in 24-hour HH:MM. null if not stated.
- Do not return any image, logo or photo URLs.
- status: "success" if you could read the site and it belongs to this business; "no_content" if it has no
  usable information; "blocked" for a bot check or CAPTCHA; "auth_required" for a login wall;
  "wrong_site" if the site is clearly about a different business."""


def extract_json(result):
    """The agent's answer arrives as an object, or as a string holding one (sometimes fenced)."""
    if isinstance(result, dict):
        if "status" in result or "services" in result:
            return result
        for key in ("result", "output", "data", "answer"):
            if key in result:
                found = extract_json(result[key])
                if found is not None:
                    return found
        return None
    if isinstance(result, str):
        start, end = result.find("{"), result.rfind("}")
        if start == -1 or end <= start:
            return None
        try:
            return extract_json(json.loads(result[start:end + 1]))
        except ValueError:
            return None
    return None


def text_or_none(value):
    if not isinstance(value, str):
        return None
    value = value.strip()
    return value if value and value.lower() not in ("null", "none", "n/a") else None


def keep_allowed(answer):
    """Allow-list: anything else the agent returns (image URLs included) is dropped here."""
    services = []
    for s in answer.get("services") or []:
        if not isinstance(s, dict) or not text_or_none(s.get("name")):
            continue
        price = s.get("price_ars")
        if isinstance(price, bool) or not isinstance(price, (int, float)):
            price = None
        services.append({
            "name": text_or_none(s.get("name")),
            "description": text_or_none(s.get("description")),
            "price_ars": price,
            "price_text": text_or_none(s.get("price_text")),
            "source_url": text_or_none(s.get("source_url")),
        })
    hours = {}
    raw = answer.get("hours")
    if isinstance(raw, dict):
        for day in DAYS:
            value = raw.get(day)
            if value == "closed":
                hours[day] = "closed"
            elif isinstance(value, list):
                ranges = [
                    {"open": r["open"], "close": r["close"]}
                    for r in value
                    if isinstance(r, dict) and isinstance(r.get("open"), str) and isinstance(r.get("close"), str)
                ]
                if ranges:
                    hours[day] = ranges
    return {"bio": text_or_none(answer.get("bio")), "services": services, "hours": hours or None}


def classify(run):
    """(outcome, reason, data) for a finished run."""
    error = run.get("error") or {}
    if run.get("status") != "COMPLETED":
        code = str(error.get("code") or error.get("category") or run.get("status"))
        hint = (error.get("profile_hint") or {}).get("reason")
        outcome = "blocked" if "BLOCKED" in code.upper() or hint else "failed"
        return outcome, f"{code}: {error.get('message') or ''}".strip(), None
    answer = extract_json(run.get("result"))
    if answer is None:
        return "unparseable", str(run.get("result"))[:300], None
    status = str(answer.get("status") or "unknown").lower()
    reason = text_or_none(answer.get("reason")) or ""
    if status != "success":
        return status, reason, None
    data = keep_allowed(answer)
    if not (data["bio"] or data["services"] or data["hours"]):
        return "no_content", reason, None
    return "success", reason, data


# ── is it really on the site? ────────────────────────────────────────────────
# The agent sometimes summarizes or translates despite the instructions. Anything we cannot find, word
# for word, in the page text is marked off-site and load_enrichment.mjs refuses to write it.
class _PageText(html.parser.HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts, self.skip = [], 0

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style"):
            self.skip += 1

    def handle_endtag(self, tag):
        if tag in ("script", "style") and self.skip:
            self.skip -= 1
        self.parts.append(" ")

    def handle_data(self, data):
        if not self.skip:
            self.parts.append(data)


def fold(text):
    """Lowercase words only: accents, case, punctuation and spacing do not count as differences."""
    plain = unicodedata.normalize("NFD", text or "")
    plain = "".join(c for c in plain if not unicodedata.combining(c)).lower()
    return " ".join(re.findall(r"[a-z0-9]+", plain))


def html_to_text(markup):
    parser = _PageText()
    parser.feed(markup)
    return "".join(parser.parts)


class _Redirects(urllib.request.HTTPRedirectHandler):
    http_error_308 = urllib.request.HTTPRedirectHandler.http_error_301  # not followed before Python 3.11

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return super().redirect_request(req, fp, 301 if code == 308 else code, msg, headers, newurl)


def fetch_page_text(url, key=None):
    """The page's text: read directly, or through TinyFetch when the page only fills in with JavaScript."""
    text = _direct_page_text(url)
    if len(fold(text)) >= 500 or not key:
        return text
    try:
        request = urllib.request.Request(
            FETCH_API,
            data=json.dumps({"urls": [url], "format": "markdown"}).encode("utf-8"),
            headers={"X-API-Key": key, "Content-Type": "application/json", "User-Agent": "directory-enrich/1.0"},
        )
        with urllib.request.urlopen(request, timeout=150) as response:
            results = json.loads(response.read().decode("utf-8")).get("results") or []
        rendered = (results[0].get("text") or "") if results else ""
        return rendered if len(rendered) > len(text) else text
    except Exception as e:
        print(f"    ! TinyFetch could not read {url}: {e}")
        return text


def _direct_page_text(url):
    request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (compatible; directory-enrich/1.0)"})
    try:
        with urllib.request.build_opener(_Redirects).open(request, timeout=30) as response:
            raw = response.read(3_000_000)
            charset = response.headers.get_content_charset()
        try:
            markup = raw.decode(charset or "utf-8")
        except (LookupError, UnicodeDecodeError):
            markup = raw.decode("latin-1")
        return html_to_text(markup)
    except Exception as e:  # unreadable page = nothing on it can be confirmed
        print(f"    ! could not read {url}: {e}")
        return ""


def verify(record, fetch=fetch_page_text):
    """Mark each extracted field with whether the site's own text contains it."""
    data = record.get("data")
    if not data:
        return record
    home = record["website_url"]
    urls = [home]
    for s in data["services"]:
        url = (s.get("source_url") or "").split("#")[0]
        if url.startswith(("http://", "https://")) and host_of(url) == host_of(home) and url not in urls:
            urls.append(url)
    pages = [t for t in (fold(fetch(u)) for u in urls[:12]) if t]

    def on_site(text):
        needle = fold(text)
        return bool(needle) and any(f" {needle} " in f" {page} " for page in pages)

    data["pages_checked"] = len(pages)
    data["bio_on_site"] = on_site(data.get("bio"))
    for s in data["services"]:
        s["name_on_site"] = on_site(s.get("name"))
        s["description_on_site"] = on_site(s.get("description"))
        s["price_text_on_site"] = on_site(s.get("price_text"))
    return record


# ── API ──────────────────────────────────────────────────────────────────────
class ApiError(Exception):
    def __init__(self, status, body):
        super().__init__(f"HTTP {status}: {body[:300]}")
        self.status = status


def call(key, method, path, body=None):
    request = urllib.request.Request(
        API + path,
        method=method,
        data=None if body is None else json.dumps(body).encode("utf-8"),
        headers={"X-API-Key": key, "Content-Type": "application/json", "User-Agent": "directory-enrich/1.0"},
    )
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        raise ApiError(e.code, e.read().decode("utf-8", "replace"))


def wallet_balance(key):
    try:
        return float(call(key, "GET", "/v1/wallet")["available_balance"])
    except Exception:
        return None  # older credit accounts have no wallet endpoint


def step_price(key):
    try:
        for meter in call(key, "GET", "/v1/wallet")["rates"]["meters"]:
            if meter.get("label") == "TinyFish Agent" and meter.get("per") == "step":
                return float(meter["unit_amount"])
    except Exception:
        pass
    return 0.016


def seconds_between(start, end):
    try:
        a =datetime.datetime.fromisoformat(start.replace("Z", "+00:00"))
        b = datetime.datetime.fromisoformat(end.replace("Z", "+00:00"))
        return round((b - a).total_seconds(), 1)
    except (AttributeError, TypeError, ValueError):
        return None


def over_budget(run, max_steps, run_timeout, now_utc=None):
    """Why a still-running run should be cancelled, or None."""
    steps = len(run.get("steps") or [])
    if steps >= max_steps:
        return f"step cap: {steps} steps"
    started = run.get("started_at")
    if started:
        now_utc = now_utc or datetime.datetime.now(datetime.timezone.utc)
        age = seconds_between(started, now_utc.isoformat())
        if age is not None and age > run_timeout:
            return f"time cap: {int(age)}s"
    return None


def poll(key, run_id, max_steps, run_timeout, interval=6, sleep=time.sleep):
    """(run, cancel_reason). run is None when it could not be followed to the end."""
    deadline = time.time() + run_timeout + 120
    errors, cancelled = 0, None
    while time.time() < deadline:
        try:
            run = call(key, "GET", f"/v1/runs/{run_id}?screenshots=none&html=none")
            errors = 0
            if run.get("status") in FINAL:
                if run.get("num_of_steps") is None and run.get("steps"):
                    run["num_of_steps"] = len(run["steps"])
                return run, cancelled
            why = over_budget(run, max_steps, run_timeout)
            if why and not cancelled:
                print(f"    cancelling ({why})")
                call(key, "POST", f"/v1/runs/{run_id}/cancel", {})
                cancelled = why
        except Exception as e:  # transient: keep polling, the run is already paid for
            errors += 1
            if errors >= 5:
                print(f"    ! giving up polling for now: {e}")
                return None, cancelled
        sleep(interval)
    return None, cancelled


# ── main ─────────────────────────────────────────────────────────────────────
def main(argv):
    dry_run = "--dry-run" in argv
    out_dir = os.environ.get("OUT_DIR", HERE)
    area = os.environ.get("AREA", "Palermo, CABA")
    max_runs = int(os.environ.get("MAX_AGENT_RUNS", "10"))
    max_steps = int(os.environ.get("MAX_STEPS", "25"))
    run_timeout = int(os.environ.get("RUN_TIMEOUT", "600"))
    profile = os.environ.get("BROWSER_PROFILE", "lite")
    include_social = os.environ.get("INCLUDE_SOCIAL") == "1"
    retry_failed = os.environ.get("RETRY_FAILED") == "1"
    only = {s.strip() for s in os.environ.get("ONLY", "").split(",") if s.strip()}

    universe_path = os.path.join(out_dir, "enrich_universe.json")
    results_path = os.path.join(out_dir, "tinyfish_results.json")
    log_path = os.path.join(out_dir, "tinyfish_run_log.json")

    if not os.path.exists(universe_path):
        sys.exit(f"ERROR: {universe_path} not found. Create it first:\n"
                 "  node supabase/seed/directory/load_enrichment.mjs --export-universe")
    with open(os.path.join(HERE, "pawpi_directory_master.csv"), encoding="utf-8") as f:
        universe = build_universe(list(csv.DictReader(f)), read_json(universe_path, []), area)
    if only:
        universe = [u for u in universe if u["external_id"] in only]

    log = read_json(log_path, {"runs": {}})
    results = {r["external_id"]: r for r in read_json(results_path, [])}

    def save():
        write_json(log_path, log)
        write_json(results_path, list(results.values()))

    def record(item, outcome, reason, data, run=None, latency=None, price=None):
        steps = (run or {}).get("num_of_steps")
        results[item["external_id"]] = {
            **{k: item[k] for k in ("external_id", "provider_id", "name", "website_url")},
            "outcome": outcome, "reason": reason, "run_id": (run or {}).get("run_id"),
            "num_of_steps": steps, "latency_seconds": latency,
            "estimated_cost_usd": round(steps * price, 4) if steps is not None and price is not None else None,
            "fetched_at": now(), "data": data,
        }

    social = [u for u in universe if is_social(u["website_url"]) and not include_social]
    readable = [u for u in universe if u not in social]
    print(f"[start] area={area} universe={len(universe)} readable={len(readable)} "
          f"social_skipped={len(social)} max_runs={max_runs} max_steps={max_steps}")
    env_file = os.environ.get("ENV_FILE", os.path.join(HERE, ".env"))
    if "--verify" in argv:
        fetch_key = read_key(env_file)
        for record_ in results.values():
            verify(record_, fetch=lambda u: fetch_page_text(u, fetch_key))
        write_json(results_path, list(results.values()))
        verification_summary(list(results.values()))
        return 0
    if dry_run:
        for u in readable:
            print(f"  read  {u['name'][:45]:45}  {u['website_url']}")
        for u in social:
            print(f"  skip  {u['name'][:45]:45}  {u['website_url']}")
        return 0

    for item in social:
        if item["external_id"] not in log["runs"]:
            record(item, "skipped_social", "social/messaging link, not a website", None)
    save()

    key = read_key(env_file)
    if not key:
        sys.exit("ERROR: TINYFISH_API_KEY not set. Put TINYFISH_API_KEY=... in supabase/seed/directory/.env "
                 "(untracked) and run again.")
    price = step_price(key)
    balance_before = wallet_balance(key)
    new_runs = 0

    for item in readable:
        ext = item["external_id"]
        entry = log["runs"].get(ext)
        if entry and entry["state"] == "done":
            failed = results.get(ext, {}).get("outcome") in ("failed", "blocked", "unparseable")
            if not (retry_failed and failed):
                continue
            entry = None
        if not (entry and entry["state"] == "submitted"):
            spent = sum(e.get("attempts", 1) for e in log["runs"].values())
            if spent >= max_runs:
                print(f"  [budget] {spent} runs recorded, cap {max_runs} — stopping new runs")
                continue  # still poll any later in-flight run
            attempts = log["runs"].get(ext, {}).get("attempts", 0) + 1
            body = {"url": item["website_url"], "goal": build_goal(item, max_steps),
                    "browser_profile": profile}
            try:
                response = None
                for wait in (0, 20, 40, 80):
                    time.sleep(wait)
                    try:
                        response = call(key, "POST", "/v1/automation/run-async", body)
                        break
                    except ApiError as e:
                        if e.status != 429:
                            raise
                if not response or not response.get("run_id"):
                    raise ApiError(0, json.dumps((response or {}).get("error") or "rate limited"))
            except ApiError as e:
                if e.status in (401, 402, 403):
                    print(f"  ! stopping: {e}")
                    break
                print(f"  ! {item['name']}: could not start a run — {e}")
                record(item, "failed", str(e), None)
                save()
                continue
            except Exception as e:
                # The server may have created the run: count it, never re-buy it silently.
                print(f"  ! {item['name']}: submit error — {e}")
                log["runs"][ext] = {"state": "done", "run_id": None, "attempts": attempts, "submitted_at": now()}
                record(item, "failed", f"submit error: {e}", None)
                save()
                continue
            entry = {"state": "submitted", "run_id": response["run_id"], "attempts": attempts, "submitted_at": now()}
            log["runs"][ext] = entry
            new_runs += 1
            save()  # before polling, so an interrupted run is resumed rather than bought twice
        print(f"  .. {item['name'][:45]:45} run {entry['run_id']}")
        run, cancel_reason = poll(key, entry["run_id"], max_steps, run_timeout)
        if run is None:
            print("    still running — rerun this script soon to collect or cancel it")
            continue
        outcome, reason, data = classify(run)
        if cancel_reason and outcome != "success":
            outcome, reason = "failed", f"cancelled by this script ({cancel_reason})"
        latency = seconds_between(run.get("started_at"), run.get("finished_at"))
        record(item, outcome, reason, data, run=run, latency=latency, price=price)
        verify(results[ext], fetch=lambda u: fetch_page_text(u, key))
        entry["state"] = "done"
        save()
        print(f"    {outcome} steps={run.get('num_of_steps')} {latency}s "
              f"services={len(data['services']) if data else 0}")

    save()
    summarize(universe, results, price, balance_before, wallet_balance(key), new_runs)
    verification_summary([results[u["external_id"]] for u in universe if u["external_id"] in results])
    return 0


def summarize(universe, results, price, before, after, new_runs):
    mine = [results[u["external_id"]] for u in universe if u["external_id"] in results]
    ran = [r for r in mine if r.get("num_of_steps") is not None]
    outcomes = {}
    for r in mine:
        outcomes[r["outcome"]] = outcomes.get(r["outcome"], 0) + 1
    services = [s for r in mine if r.get("data") for s in r["data"]["services"]]
    steps = sum(r["num_of_steps"] for r in ran)
    latencies = sorted(r["latency_seconds"] for r in ran if r.get("latency_seconds") is not None)
    print("\n[summary]")
    print(f"  outcomes            {outcomes}")
    print(f"  services extracted  {len(services)} ({sum(1 for s in services if s['price_ars'] is not None)} with a "
          "price, before the loader's price check)")
    if ran:
        print(f"  steps               {steps} total, {steps / len(ran):.1f} per run")
        print(f"  estimated cost      US${steps * price:.2f} (US${steps * price / len(ran):.3f} per run at "
              f"US${price}/step)")
    if latencies:
        print(f"  latency per run     median {latencies[len(latencies) // 2]}s, max {latencies[-1]}s")
    if before is not None and after is not None:
        print(f"  wallet              US${before:.2f} -> US${after:.2f} (this invocation: US${before - after:.2f}, "
              f"{new_runs} new runs)")


def verification_summary(records):
    print("\n[found on the site, word for word]")
    for r in records:
        data = r.get("data")
        if not data:
            continue
        services = data["services"]
        print(f"  {r['name'][:40]:40} pages={data['pages_checked']} bio={'yes' if data['bio_on_site'] else 'NO'} "
              f"services={sum(s['name_on_site'] for s in services)}/{len(services)} "
              f"descriptions={sum(s['description_on_site'] for s in services)}/"
              f"{sum(1 for s in services if s['description'])}")


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
