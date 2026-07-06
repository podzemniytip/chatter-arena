import json, time
from web3 import Web3

w3 = Web3(Web3.HTTPProvider('https://mainnet.base.org'))
with open('artifacts/contracts/Chatter.sol/Chatter.json') as f:
    abi = json.load(f)['abi']
ctr = w3.eth.contract(address=Web3.to_checksum_address('0x51062475c702655F3508b65f02C8c97de0ACe812'), abi=abi)

sid = ctr.functions.seasonId().call()
print(f'Current seasonId: {sid}')
now = int(time.time())
phases = ['Registration', 'Commit', 'Reveal', 'Complete']

for i in range(1, sid + 1):
    s = ctr.functions.seasons(i).call()
    print(f'\nSeason {i}:')
    print(f'  Phase: {phases[s[0]]}')
    print(f'  Fee: {w3.from_wei(s[1], "ether")} ETH')
    print(f'  Pool: {w3.from_wei(s[5], "ether")} ETH')
    print(f'  regEnd: {s[2]} (ended)' if s[2] <= now else f'  regEnd: {s[2]} ({s[2]-now}s left)')
    print(f'  comEnd: {s[3]} (ended)' if s[3] <= now else f'  comEnd: {s[3]} ({s[3]-now}s left)')
    print(f'  revEnd: {s[4]} (ended)' if s[4] <= now else f'  revEnd: {s[4]} ({s[4]-now}s left)')
    print(f'  Winner: {s[6]}')
    print(f'  Claimed: {s[7]}')
    if s[0] == 3:
        print(f'  Majority: {["Red","Yellow","Green"][s[8]]}')

# Test enter function: check current season
s = ctr.functions.seasons(sid).call()
print(f'\n--- Current season ({sid}) is in {phases[s[0]]} phase ---')

# Get players
players = ctr.functions.getPlayers(sid).call()
print(f'Players: {len(players)}')

# Check our wallet
me = w3.eth.account.from_key('0x2c5d0089762b88d29f00f6a97281197d7d2c30431ffe28780a7e8185fd0571db')
print(f'\nOwner wallet: {me.address}')
bal = w3.eth.get_balance(me.address)
print(f'Balance: {w3.from_wei(bal, "ether")} ETH')
