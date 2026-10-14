import sys
import time
import traceback

import requests

base_url = "https://lfdiego.xyz".rstrip("/")
cast_url = f"{base_url}/hub/api/games/fishing/cast"
reel_url = f"{base_url}/hub/api/games/fishing/reel"
TIMEOUT = 10

session = requests.Session()

session.headers.update({
    "Content-Type": "application/json",
    "User-Agent": "LocalDevTest/1.0"
})

session.cookies.set("hub_session", "gNHyP2YUClIRnfJ2BHBCFMRn7YDrlZK3t3T-4ZMdTh8", domain="lfdiego.xyz")
session.cookies.set("cf_clearance", "pO71sKk85F3Qth28KNPmXJwo.Yju5sOwPIf4oQu8hw4-1791977444-1.2.1.1-Mp._wUE4pJfo56QY00nzPxkIZ2jCX02PzxK2mlLHVAFrKRpe7WvFXZwX2gQMfoSKBh_IFIRmKIzqh8OvB2qHYXPhszGsJeXErTI8P_gtNZjt3cw8.9.aaw6wcyoxG5xaADg1YwPvw1DeDZx2x7McQiKC1OdJXBToUkZ2jsZ6fCVYo2cPgi4YGCnPrGdK.yo3NXY5Xg_Lj63.g.4NMSBQGMrvx7f6DSP6OPRJfCSCVSyOkERwUkNZq67cuiTcGn7oXg3cpfcf0cHWBtqPoXfFNcE417ZNWa7F2G0F95Gl0JNleQ47VU94OvY1XZOYjn0vFKAEVIa25xi89BDy9va0Uyz2FU4WcBCZ0TnNSQedBg0EjAUwd1NhdAfk_aweDeDdVwyrJETIHVOwxDoP02lNNg", domain="lfdiego.xyz")


def explain_http_error(step, res):
    """Print everything useful about a non-200 response."""
    print(f"💀 {step} failed: HTTP {res.status_code} {res.reason}")
    print(f"   URL:     {res.url}")
    print(f"   Headers: content-type={res.headers.get('Content-Type')!r}, "
          f"server={res.headers.get('Server')!r}")
    print(f"   Body:    {res.text[:500]!r}")


def parse_json(step, res):
    """Return the parsed JSON body, or None after printing why it failed."""
    try:
        return res.json()
    except ValueError:
        print(f"💀 {step} returned 200 but the body is not JSON.")
        print(f"   Body: {res.text[:500]!r}")
        return None


def main():
    cast_payload = {
        "city": "neustadt",
        "spot": "ns-fluss"
    }

    print("🎣 Casting the line with auth...")
    cast_res = session.post(cast_url, json=cast_payload, timeout=TIMEOUT)

    if cast_res.status_code in (401, 403):
       
        explain_http_error("Cast", cast_res)
        return 1
    if cast_res.status_code != 200:
        explain_http_error("Cast", cast_res)
        return 1

    stats = parse_json("Cast", cast_res)
    if stats is None:
        return 1

    cast_id = stats.get("castId")
    if not cast_id:
       
        print(f"   Keys received: {list(stats.keys())}")
        return 1
    

    reel_payload = {
        "castId": cast_id,
        "score": 0.9676756468100209
    }

    bite_ms = stats.get("biteInMs", 0)
    min_ms = stats.get("reelMinMs", 3000)
    max_ms = stats.get("reelMaxMs", 15000)
    wait_s = (bite_ms + min_ms) / 1000 + 0.3
    
    print(f"⏳ Waiting {wait_s:.1f}s before reeling...")
    time.sleep(wait_s)

    reel_res = session.post(reel_url, json=reel_payload, timeout=TIMEOUT)
    if reel_res.status_code != 200:
        explain_http_error("Reel", reel_res)
        return 1

    result = parse_json("Reel", reel_res)
    if result is None:
        return 1
    print(f"📦 Reel response: {result}")

    failed = (
        result.get("success") is False
        or result.get("caught") is False
        or "error" in result
    )
    if failed:
        print("🐟 Server says the fish did NOT get caught (see response above).")
        return 1

    print("🏆 Server accepted the reel.")
    return 0


def run():
    """One full cast+reel; turns errors into a non-zero exit code."""
    try:
        return main()
    except requests.exceptions.ConnectionError as e:
        print(f"🔌 Could not connect to {base_url}: {e}")
    except requests.exceptions.Timeout as e:
        print(f"⏱️ Request timed out after {TIMEOUT}s: {e}")
    except requests.exceptions.RequestException as e:
        print(f"📡 Request error: {type(e).__name__}: {e}")
    except Exception:
        print("Big yikes, worker crashed:")
        traceback.print_exc()
    return 2


if __name__ == "__main__":
    caught = 0
    try:
        while True:
            if run() != 0:
                print("🛑 Round failed, stopping.")
                break
            caught += 1
            print(f"✅ {caught} caught so far.\n")
            time.sleep(1)
    except KeyboardInterrupt:
        print("\n⏹️ Stopped by user.")
    print(f"Done: {caught} caught.")
    sys.exit(0)

