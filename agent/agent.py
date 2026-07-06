"""
Chatter AI Agent — fully autonomous.
- Monitors the contract, enters seasons, commits, reveals, and claims.
- Uses an LLM (OpenAI/Anthropic) for strategic decision-making.
- Run periodically (cron / systemd timer / every 2 min).
"""

import os
import json
import time
import hashlib
import secrets
from pathlib import Path
from web3 import Web3
from openai import OpenAI

# ─── CONFIG ──────────────────────────────────────────────────────────────────
CONTRACT = "0x51062475c702655F3508b65f02C8c97de0ACe812"
RPC = "https://mainnet.base.org"
PRIVATE_KEY = os.environ.get("AGENT_KEY", "")
LLM_API_KEY = os.environ.get("LLM_KEY", "")
LLM_MODEL = os.environ.get("LLM_MODEL", "gpt-4o")
STATE_FILE = Path("agent/state.json")

COLORS = ["Red", "Yellow", "Green"]
C = {c: i for i, c in enumerate(COLORS)}

# ─── WEB3 ────────────────────────────────────────────────────────────────────
w3 = Web3(Web3.HTTPProvider(RPC))
assert w3.is_connected(), "Base RPC unreachable"

with open("agent/abi.json") as f:
    ABI = json.load(f)
ctr = w3.eth.contract(address=Web3.to_checksum_address(CONTRACT), abi=ABI)
me = w3.eth.account.from_key(PRIVATE_KEY)

print(f"Agent: {me.address}  |  Model: {LLM_MODEL}")

# ─── LLM ─────────────────────────────────────────────────────────────────────
llm = OpenAI(api_key=LLM_API_KEY)

def ask(prompt: str, system: str = "You are a strategic AI agent.") -> str:
    return llm.chat.completions.create(
        model=LLM_MODEL,
        messages=[{"role": "system", "content": system}, {"role": "user", "content": prompt}],
        temperature=0.7,
    ).choices[0].message.content.strip()

# ─── STATE ───────────────────────────────────────────────────────────────────
def load_state() -> dict:
    if STATE_FILE.exists():
        return json.loads(STATE_FILE.read_text())
    return {}

def save_state(data: dict):
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    STATE_FILE.write_text(json.dumps(data, indent=2))

# ─── CONTRACT HELPERS ────────────────────────────────────────────────────────
def season(id) -> dict:
    s = ctr.functions.seasons(id).call()
    return {
        "phase": ["Registration", "Commit", "Reveal", "Complete"][s[0]],
        "fee": s[1], "regEnd": s[2], "comEnd": s[3], "revEnd": s[4],
        "pool": s[5], "winner": s[6], "claimed": s[7], "majority": s[8],
    }

def players(id) -> list:
    return ctr.functions.getPlayers(id).call()

def pdata(id, addr):
    return ctr.functions.getPlayerData(id, addr).call()

def tx(func, value=0, label="tx"):
    nonce = w3.eth.get_transaction_count(me.address)
    t = func.build_transaction({
        "from": me.address, "value": value, "nonce": nonce,
        "gas": 300000,
        "maxFeePerGas": w3.eth.gas_price * 2,
        "maxPriorityFeePerGas": 100_000,
        "chainId": 8453,
    })
    signed = me.sign_transaction(t)
    h = w3.eth.send_raw_transaction(signed.raw_transaction)
    print(f"  {label}: {h.hex()}")
    return w3.eth.wait_for_transaction_receipt(h)

# ─── STRATEGY ────────────────────────────────────────────────────────────────
def build_context(sid) -> str:
    lines = []
    for i in range(max(1, sid - 8), sid):
        s = season(i)
        if s["phase"] != "Complete":
            continue
        plist = players(i)
        moves = []
        for p in plist:
            pd = pdata(i, p)
            if pd[1]:
                moves.append(f"{p[:6]}..{p[-4:]}:{COLORS[pd[2]]}/pred{COLORS[pd[3]]}({pd[4]}pts)")
        lines.append(f"  Season {i}: maj={COLORS[s['majority']]} | {', '.join(moves)}")
    return "\n".join(lines[-6:]) or "  (no history)"

def decide(sid: int):
    ctx = build_context(sid)
    prompt = f"""Season {sid} is active.
Players entered: {len(players(sid))}

Last seasons:
{ctx}

Pick:
1) Your color (Red=0, Yellow=1, Green=2)
2) The MAJORITY color you predict

Output ONLY: {{"color": N, "prediction": N}} where N is 0/1/2"""
    raw = ask(prompt, "You play a meta-game. +2 if your color matches majority, +1 if you predict majority. Be strategic.")
    try:
        raw = raw[raw.index("{"):raw.rindex("}")+1]
        m = json.loads(raw)
        return int(m["color"]), int(m["prediction"])
    except Exception:
        return 0, 0

# ─── MAIN ────────────────────────────────────────────────────────────────────
def run():
    sid = ctr.functions.seasonId().call()
    s = season(sid)
    now = int(time.time())
    state = load_state()
    print(f"> Season {sid} | Phase: {s['phase']} | Pool: {w3.from_wei(s['pool'], 'ether')} ETH")

    # ── ENTER ──
    if s["phase"] == "Registration" and now < s["regEnd"]:
        active, *_ = pdata(sid, me.address)
        if not active:
            print("→ Registering...")
            tx(ctr.functions.enter(), value=s["fee"], label="enter")
        else:
            print("Already registered.")

    # ── COMMIT ──
    phase = s["phase"]
    if phase == "Registration" and now >= s["regEnd"]:
        phase = "Commit"
    if phase == "Commit" and now < s["comEnd"]:
        active, revealed, *_ = pdata(sid, me.address)
        if active and not state.get(f"committed_{sid}"):
            color, pred = decide(sid)
            salt = "0x" + secrets.token_hex(32)
            packed = Web3.solidi_keccak(["uint8", "uint8", "bytes32"], [color, pred, salt])
            tx(ctr.functions.commit(packed), label="commit")
            state[f"committed_{sid}"] = True
            state[f"salt_{sid}"] = salt
            state[f"color_{sid}"] = color
            state[f"pred_{sid}"] = pred
            save_state(state)
            print(f"  Choice: {COLORS[color]}, predict: {COLORS[pred]}")
        elif not active:
            print("Not registered, skipping commit.")
        else:
            print("Already committed.")

    # ── REVEAL ──
    if phase == "Commit" and now >= s["comEnd"]:
        phase = "Reveal"
    if phase == "Reveal" and now < s["revEnd"]:
        if state.get(f"committed_{sid}") and not state.get(f"revealed_{sid}"):
            color = state[f"color_{sid}"]
            pred = state[f"pred_{sid}"]
            salt = state[f"salt_{sid}"]
            tx(ctr.functions.reveal(color, pred, salt), label="reveal")
            state[f"revealed_{sid}"] = True
            save_state(state)
        else:
            print("Nothing to reveal (or already revealed).")

    # ── COMPLETE (call if deadline passed) ──
    if phase == "Reveal" and now >= s["revEnd"]:
        print("→ Reveal ended, calling complete()...")
        tx(ctr.functions.complete(), label="complete")

    # ── CLAIM ──
    if s["phase"] == "Complete" and s["winner"] == me.address and not s["claimed"]:
        print("→ We won! Claiming prize...")
        tx(ctr.functions.claim(sid), label="claim")
    elif s["phase"] == "Complete":
        print(f"Winner: {s['winner'][:6]}..{s['winner'][-4:]} | Claimed: {s['claimed']}")

if __name__ == "__main__":
    run()
