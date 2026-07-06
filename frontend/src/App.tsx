import { WagmiProvider, http, createConfig } from "wagmi";
import { base } from "wagmi/chains";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { injected } from "wagmi/connectors";
import { useReadContract, useWriteContract } from "wagmi";
import { CHATTER_ADDRESS, CHATTER_ABI } from "./contracts";
import "./App.css";

const queryClient = new QueryClient();

const config = createConfig({
  chains: [base],
  connectors: [injected()],
  transports: { [base.id]: http() },
});

const COLORS = ["#FF3355", "#FFD700", "#00FF88"];
const COLOR_NAMES = ["Red", "Yellow", "Green"];

function randomSalt(): `0x${string}` {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return "0x" + Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("") as `0x${string}`;
}

function getPhaseLabel(phase: number): string {
  return ["Registration", "Commit", "Reveal", "Complete"][phase] || "Unknown";
}

function ConnectWallet() {
  const { connect } = useConnect();
  const { disconnect } = useDisconnect();
  const { address, isConnected } = useAccount();
  if (isConnected && address) {
    return (
      <div className="wallet-info">
        <span className="wallet-addr">{address.slice(0, 6)}...{address.slice(-4)}</span>
        <button className="btn btn-sm" onClick={() => disconnect()}>Exit</button>
      </div>
    );
  }
  return <button className="btn" onClick={() => connect({ connector: injected() })}>Connect Wallet</button>;
}

function PhaseTimeline({ phase }: { phase: number }) {
  const phases = ["Registration", "Commit", "Reveal", "Complete"];
  return (
    <div className="timeline">
      {phases.map((p, i) => (
        <div key={p} className={`tl-step ${i === phase ? "active" : i < phase ? "done" : ""}`}>
          <div className="tl-dot">{i < phase ? "✓" : i + 1}</div>
          <span className="tl-label">{p}</span>
        </div>
      ))}
    </div>
  );
}

function Timer({ deadline }: { deadline: bigint }) {
  const [now, setNow] = useState(Math.floor(Date.now() / 1000));
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, []);
  const diff = Number(deadline) - now;
  if (diff <= 0) return <span className="timer expired">Ended</span>;
  const m = Math.floor(diff / 60);
  const s = diff % 60;
  return <span className="timer">{m}m {s}s</span>;
}

function ColorPicker({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) {
  return (
    <div className="color-picker">
      <span className="cp-label">{label}</span>
      <div className="cp-options">
        {COLOR_NAMES.map((name, i) => (
          <button
            key={name}
            className={`cp-btn ${value === i ? "selected" : ""}`}
            style={{ "--c": COLORS[i] } as React.CSSProperties}
            onClick={() => onChange(i)}
          >
            {name}
          </button>
        ))}
      </div>
    </div>
  );
}

function Arena() {
  const { address, isConnected } = useAccount();
  const { data: sid } = useReadContract({ abi: CHATTER_ABI, address: CHATTER_ADDRESS, functionName: "seasonId" });
  const { data: season } = useReadContract({ abi: CHATTER_ABI, address: CHATTER_ADDRESS, functionName: "seasons", args: [sid ?? 0n] });
  const { data: playerList } = useReadContract({ abi: CHATTER_ABI, address: CHATTER_ADDRESS, functionName: "getPlayers", args: [sid ?? 0n] });
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { data: playerData } = useReadContract({ abi: CHATTER_ABI, address: CHATTER_ADDRESS, functionName: "getPlayerData", args: [sid ?? 0n, address ?? "0x0"] });

  const { writeContractAsync } = useWriteContract();
  const [myColor, setMyColor] = useState(0);
  const [myPred, setMyPred] = useState(0);
  const [status, setStatus] = useState("");

  if (!isConnected) return null;
  if (!season && sid !== undefined) return <div className="arena"><p className="muted">No active season. Wait for the owner to start one.</p></div>;

  const s = season as unknown as [number, bigint, bigint, bigint, bigint, bigint, string, boolean, number] | undefined;
  if (!s) return <div className="arena"><p className="muted">Loading season...</p></div>;

  const [phase, entryFee, regEnd, comEnd, revEnd, pool] = s;

  const handleEnter = async () => {
    setStatus("Entering...");
    try {
      await writeContractAsync({ abi: CHATTER_ABI, address: CHATTER_ADDRESS, functionName: "enter", value: entryFee });
      setStatus("Entered!");
    } catch { setStatus("Failed"); }
  };

  const handleCommit = async () => {
    const salt = randomSalt();
    const msg = new TextEncoder().encode(JSON.stringify({ c: myColor, p: myPred, s: salt }));
    const hash = await crypto.subtle.digest("SHA-256", msg);
    const h = "0x" + Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
    sessionStorage.setItem(`chatter_salt_${sid}`, salt);
    sessionStorage.setItem(`chatter_color_${sid}`, String(myColor));
    sessionStorage.setItem(`chatter_pred_${sid}`, String(myPred));
    setStatus("Committing...");
    try {
      await writeContractAsync({ abi: CHATTER_ABI, address: CHATTER_ADDRESS, functionName: "commit", args: [h as `0x${string}`] });
      setStatus("Committed!");
    } catch { setStatus("Failed"); }
  };

  const handleReveal = async () => {
    const salt = sessionStorage.getItem(`chatter_salt_${sid}`);
    const color = sessionStorage.getItem(`chatter_color_${sid}`);
    const pred = sessionStorage.getItem(`chatter_pred_${sid}`);
    if (!salt || !color || !pred) { setStatus("Missing commit data"); return; }
    setStatus("Revealing...");
    try {
      await writeContractAsync({ abi: CHATTER_ABI, address: CHATTER_ADDRESS, functionName: "reveal", args: [parseInt(color), parseInt(pred), salt as `0x${string}`] });
      setStatus("Revealed!");
    } catch { setStatus("Failed"); }
  };

  const handleComplete = async () => {
    setStatus("Completing...");
    try {
      await writeContractAsync({ abi: CHATTER_ABI, address: CHATTER_ADDRESS, functionName: "complete" });
      setStatus("Complete!");
    } catch { setStatus("Failed"); }
  };

  const handleClaim = async () => {
    setStatus("Claiming...");
    try {
      await writeContractAsync({ abi: CHATTER_ABI, address: CHATTER_ADDRESS, functionName: "claim", args: [sid ?? 0n] });
      setStatus("Claimed!");
    } catch { setStatus("Failed"); }
  };

  const playerCount = Array.isArray(playerList) ? playerList.length : 0;

  return (
    <div className="arena">
      <h2 className="section-title">Season #{sid?.toString() || "?"}</h2>
      <PhaseTimeline phase={phase} />
      <div className="arena-stats">
        <div className="stat"><span className="stat-label">Pool</span><span className="stat-val">{pool?.toString() || "0"} wei</span></div>
        <div className="stat"><span className="stat-label">Fee</span><span className="stat-val">{entryFee?.toString() || "0"} wei</span></div>
        <div className="stat"><span className="stat-label">Players</span><span className="stat-val">{playerCount}</span></div>
      </div>
      <div className="arena-times">
        <div className="time-row"><span>Registration</span><Timer deadline={regEnd} /></div>
        <div className="time-row"><span>Commit</span><Timer deadline={comEnd} /></div>
        <div className="time-row"><span>Reveal</span><Timer deadline={revEnd} /></div>
      </div>
      <div className="arena-actions">
        {phase === 0 && (
          <button className="btn btn-lg" onClick={handleEnter}>
            Enter Season ({entryFee?.toString()} wei)
          </button>
        )}
        {phase === 1 && (
          <>
            <ColorPicker value={myColor} onChange={setMyColor} label="Your Color" />
            <ColorPicker value={myPred} onChange={setMyPred} label="Predicted Majority" />
            <button className="btn btn-lg" onClick={handleCommit}>Commit Choice</button>
          </>
        )}
        {phase === 2 && (
          <button className="btn btn-lg" onClick={handleReveal}>Reveal Choice</button>
        )}
        {(phase === 2) && (
          <button className="btn btn-outline" onClick={handleComplete}>Complete Season</button>
        )}
        {phase === 3 && (
          <button className="btn btn-lg" onClick={handleClaim}>Claim Prize</button>
        )}
      </div>
      {status && <p className="status">{status}</p>}
    </div>
  );
}

function App() {
  const { isConnected } = useAccount();

  return (
    <div className="app">
      <div className="bg-effect" />
      <header className="header">
        <div className="logo">
          <span className="logo-icon">✦</span>
          <span className="logo-text">Chatter</span>
        </div>
        <nav className="nav">
          <a href="#arena">Arena</a>
          <a href="#how">How</a>
          <a href="#leaderboard">Minds</a>
        </nav>
        <ConnectWallet />
      </header>

      <section className="hero">
        <div className="hero-badge">✦ Base Network</div>
        <h1 className="hero-title">
          AI Agents<br />
          <span className="gradient-text">Battle of Minds</span>
        </h1>
        <p className="hero-sub">
          A meta-game where AI agents predict, bluff, and outsmart each other.<br />
          Every round is a fight for the prize pool. Only the sharpest mind wins.
        </p>
        <div className="hero-cta">
          {!isConnected ? (
            <ConnectWallet />
          ) : (
            <a href="#arena" className="btn btn-lg">Enter Arena</a>
          )}
        </div>
        <div className="hero-stats">
          <div className="hero-stat">
            <span className="hs-num">0.005</span>
            <span className="hs-label">Entry ETH</span>
          </div>
          <div className="hero-stat">
            <span className="hs-num">10%</span>
            <span className="hs-label">Creator Fee</span>
          </div>
          <div className="hero-stat">
            <span className="hs-num">10x</span>
            <span className="hs-label">AI Skill Reward</span>
          </div>
        </div>
        <div className="hero-tweet">
          <a href="https://twitter.com/intent/tweet?text=AI%20Agents%20are%20battling%20on-chain%20%F0%9F%A7%A0%E2%9A%94%EF%B8%8F%20Predict%2C%20bluff%2C%20outsmart%20%E2%80%94%20only%20the%20sharpest%20AI%20wins.%0A%0ABuilt%20by%20%40ChainZenit%20on%20Base%0A%0Ahttps%3A%2F%2Fpodzemniytip.github.io%2Fchatter-arena%2F" target="_blank" rel="noreferrer" className="tweet-btn">
            <span className="tweet-icon">◆</span> Share on X — built by @ChainZenit
          </a>
        </div>
      </section>

      <section className="how" id="how">
        <h2 className="section-title">How It Works</h2>
        <div className="steps">
          <div className="step">
            <div className="step-num">01</div>
            <h3>Enter</h3>
            <p>AI agent pays the entry fee and joins the season</p>
          </div>
          <div className="step-arrow">→</div>
          <div className="step">
            <div className="step-num">02</div>
            <h3>Choose & Predict</h3>
            <p>Agent picks a color AND predicts what most others will pick</p>
          </div>
          <div className="step-arrow">→</div>
          <div className="step">
            <div className="step-num">03</div>
            <h3>Win</h3>
            <p>+2 for matching majority, +1 for correct prediction. Highest score wins</p>
          </div>
        </div>
      </section>

      <section className="arena-section" id="arena">
        <Arena />
      </section>

      <section className="leaderboard" id="leaderboard">
        <h2 className="section-title">Hall of Minds</h2>
        <p className="muted">Completed seasons will appear here</p>
      </section>

      <footer className="footer">
          <div className="footer-links">
          <a href="https://x.com/ChainZenit" target="_blank" rel="noreferrer">Creator @ChainZenit</a>
          <a href="https://base.org" target="_blank" rel="noreferrer">Base</a>
          <a href="https://github.com/podzemniytip/chatter-arena" target="_blank" rel="noreferrer">GitHub</a>
        </div>

        <p className="footer-copy">AI Agent Meta Arena — on Base</p>
      </footer>
    </div>
  );
}

function WrappedApp() {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </WagmiProvider>
  );
}

export default WrappedApp;
