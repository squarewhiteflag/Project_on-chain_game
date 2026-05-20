import { useEffect, useMemo, useState } from "react";
import {
  BadgeCheck,
  CircleDollarSign,
  Dice5,
  Gift,
  KeyRound,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Ticket,
  Wallet
} from "lucide-react";
import { ethers } from "ethers";
import arenaArtifact from "../../out/ChainFateArena.sol/ChainFateArena.json";
import { TOKEN_OPTIONS, ZERO_ADDRESS, formatNative, tokenAddressFor, tokenDisplayName } from "./tokens.js";

const STORAGE_PREFIX = "chain-fate-reveals";
const ERC20_ABI = [
  "function approve(address spender, uint256 value) external returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function balanceOf(address account) external view returns (uint256)",
  "function mint(address to, uint256 amount) external",
  "function symbol() external view returns (string)"
];
const MOCK_VRF_ABI = [
  "function fulfillRequest(uint256 requestId) external returns (uint256 randomWord, bytes32 proofHash)",
  "function fulfillRequestWithWord(uint256 requestId, uint256 randomWord) external"
];

const cfg = window.CHAIN_FATE_CONFIG || {};
const DEFAULT_DEMO_NETWORK = {
  chainId: 31337,
  chainHex: "0x7a69",
  chainName: "Anvil Local",
  rpcUrls: ["http://127.0.0.1:8545"],
  nativeCurrency: {
    name: "Anvil Test ETH",
    symbol: "ETH",
    decimals: 18
  },
  demoAccount: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"
};
const demoNetwork = {
  ...DEFAULT_DEMO_NETWORK,
  ...(cfg.network || {}),
  nativeCurrency: {
    ...DEFAULT_DEMO_NETWORK.nativeCurrency,
    ...(cfg.network?.nativeCurrency || {})
  }
};
const expectedChainId = Number(demoNetwork.chainId);
const expectedChainHex = demoNetwork.chainHex || `0x${expectedChainId.toString(16)}`;
const LOCAL_DEMO_CHAIN_IDS = new Set([31337, 1337]);

const emptyMetrics = {
  ethAvailable: "-",
  ethTreasury: "-",
  ethReserved: "-",
  fateAvailable: "-",
  fateTreasury: "-",
  fateReserved: "-"
};

const emptyWalletInfo = {
  chainId: "-",
  chainName: "-",
  nativeBalance: "-",
  fateBalance: "-",
  isExpectedChain: false,
  isDemoAccount: false
};

export default function App() {
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [account, setAccount] = useState("");
  const [arena, setArena] = useState(null);
  const [coordinator, setCoordinator] = useState(null);
  const [fate, setFate] = useState(null);
  const [metrics, setMetrics] = useState(emptyMetrics);
  const [rounds, setRounds] = useState([]);
  const [pending, setPending] = useState([]);
  const [logs, setLogs] = useState(["Load deployed addresses in frontend/config.js, then connect MetaMask."]);
  const [busy, setBusy] = useState(false);
  const [walletInfo, setWalletInfo] = useState(emptyWalletInfo);

  const walletLabel = useMemo(() => (account ? shortAddress(account) : "Not connected"), [account]);

  useEffect(() => {
    setPending(readPending());
    const ethereum = window.ethereum;
    if (!ethereum) return undefined;

    if (ethereum.selectedAddress) {
      void connectWallet();
    }

    const handleAccountsChanged = (accounts = []) => {
      if (accounts.length) {
        void connectWallet();
      } else {
        disconnectWallet();
      }
    };
    const handleChainChanged = () => {
      if (ethereum.selectedAddress) {
        void connectWallet();
      }
    };

    ethereum.on?.("accountsChanged", handleAccountsChanged);
    ethereum.on?.("chainChanged", handleChainChanged);

    return () => {
      ethereum.removeListener?.("accountsChanged", handleAccountsChanged);
      ethereum.removeListener?.("chainChanged", handleChainChanged);
    };
  }, []);

  useEffect(() => {
    if (arena) {
      refreshDashboard(arena);
      refreshWalletInfo(provider, account, fate);
    }
  }, [arena]);

  function pushLog(message) {
    setLogs((items) => [message, ...items].slice(0, 12));
  }

  async function connectWallet() {
    if (!cfg.arenaAddress) {
      pushLog("Missing arenaAddress in frontend/config.js.");
      return;
    }

    try {
      let nextProvider;
      let nextSigner;
      let nextAccount;

      if (window.ethereum) {
        await ensureConfiguredChain();
        nextProvider = new ethers.BrowserProvider(window.ethereum);
        await nextProvider.send("eth_requestAccounts", []);
        nextSigner = await nextProvider.getSigner();
        nextAccount = await nextSigner.getAddress();
      } else if (demoNetwork.demoPrivateKey && demoNetwork.rpcUrls?.[0]) {
        nextProvider = new ethers.JsonRpcProvider(demoNetwork.rpcUrls[0]);
        nextSigner = new ethers.Wallet(demoNetwork.demoPrivateKey, nextProvider);
        nextAccount = await nextSigner.getAddress();
        pushLog("MetaMask not detected; using local Anvil demo wallet.");
      } else {
        pushLog("MetaMask was not detected.");
        return;
      }

      const network = await nextProvider.getNetwork();
      const actualChainId = Number(network.chainId);
      if (actualChainId !== expectedChainId) {
        pushLog(`Wrong network ${actualChainId}; switch MetaMask to ${demoNetwork.chainName} (${expectedChainId}).`);
        return;
      }

      const nextArena = new ethers.Contract(cfg.arenaAddress, arenaArtifact.abi, nextSigner);
      const nextCoordinator = cfg.coordinatorAddress
        ? new ethers.Contract(cfg.coordinatorAddress, MOCK_VRF_ABI, nextSigner)
        : null;
      const nextFate = cfg.fateTokenAddress ? new ethers.Contract(cfg.fateTokenAddress, ERC20_ABI, nextSigner) : null;

      setProvider(nextProvider);
      setSigner(nextSigner);
      setAccount(nextAccount);
      setArena(nextArena);
      setCoordinator(nextCoordinator);
      setFate(nextFate);
      await refreshWalletInfo(nextProvider, nextAccount, nextFate);
      pushLog(`Connected ${shortAddress(nextAccount)} on ${demoNetwork.chainName}.`);
    } catch (error) {
      pushLog(`Wallet connection failed: ${readableError(error)}`);
    }
  }

  function disconnectWallet() {
    setProvider(null);
    setSigner(null);
    setAccount("");
    setArena(null);
    setCoordinator(null);
    setFate(null);
    setMetrics(emptyMetrics);
    setRounds([]);
    setWalletInfo(emptyWalletInfo);
    pushLog("Disconnected wallet state.");
  }

  async function ensureConfiguredChain() {
    const params = buildWalletChainParams();
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: expectedChainHex }]
      });
    } catch (switchError) {
      if (walletErrorCode(switchError) !== 4902) {
        throw switchError;
      }

      await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [params]
      });
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: expectedChainHex }]
      });
    }
  }

  function buildWalletChainParams() {
    const rpcUrls = demoNetwork.rpcUrls?.length ? demoNetwork.rpcUrls : [demoNetwork.rpcUrl].filter(Boolean);
    const params = {
      chainId: expectedChainHex,
      chainName: demoNetwork.chainName,
      nativeCurrency: demoNetwork.nativeCurrency,
      rpcUrls
    };
    if (demoNetwork.blockExplorerUrls?.length) {
      params.blockExplorerUrls = demoNetwork.blockExplorerUrls;
    }
    return params;
  }

  async function refreshWalletInfo(nextProvider = provider, nextAccount = account, nextFate = fate) {
    if (!nextProvider || !nextAccount) {
      setWalletInfo(emptyWalletInfo);
      return;
    }

    try {
      const [network, nativeBalance] = await Promise.all([
        nextProvider.getNetwork(),
        nextProvider.getBalance(nextAccount)
      ]);
      const chainId = Number(network.chainId);
      let fateBalance = "-";
      if (nextFate) {
        fateBalance = formatFate(await nextFate.balanceOf(nextAccount));
      }

      setWalletInfo({
        chainId,
        chainName: chainId === expectedChainId ? demoNetwork.chainName : network.name,
        nativeBalance: formatSepoliaEth(nativeBalance),
        fateBalance,
        isExpectedChain: chainId === expectedChainId,
        isDemoAccount: sameAddress(nextAccount, demoNetwork.demoAccount)
      });
    } catch (error) {
      pushLog(`Wallet balance refresh failed: ${readableError(error)}`);
    }
  }

  async function fundDemoEth() {
    if (!account) {
      pushLog("Connect MetaMask first.");
      return;
    }
    if (!LOCAL_DEMO_CHAIN_IDS.has(expectedChainId)) {
      pushLog("ETH top-up is only available for local Anvil demo chains.");
      return;
    }

    try {
      const params = [account, ethers.toQuantity(ethers.parseEther("10000"))];
      await sendLocalRpcDebugMethod(["anvil_setBalance", "hardhat_setBalance"], params);
      await sendOptionalLocalRpcDebugMethod(["evm_mine"], []);
      const nextBalance = await new ethers.JsonRpcProvider(demoNetwork.rpcUrls?.[0] || demoNetwork.rpcUrl).getBalance(account);
      pushLog(`Set ${shortAddress(account)} to ${trimNumber(ethers.formatEther(nextBalance))} local test ETH on ${demoNetwork.rpcUrls?.[0]}.`);
      await refreshWalletInfo();
    } catch (error) {
      pushLog(`ETH top-up failed: ${readableError(error)}. Confirm Anvil is running at ${demoNetwork.rpcUrls?.[0]}.`);
    }
  }

  async function sendLocalRpcDebugMethod(methods, params) {
    const rpcUrl = demoNetwork.rpcUrls?.[0] || demoNetwork.rpcUrl;
    if (!rpcUrl) {
      throw new Error("No local RPC URL configured.");
    }

    const debugProvider = new ethers.JsonRpcProvider(rpcUrl);
    let lastError;
    for (const method of methods) {
      try {
        return await debugProvider.send(method, params);
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError;
  }

  async function sendOptionalLocalRpcDebugMethod(methods, params) {
    try {
      return await sendLocalRpcDebugMethod(methods, params);
    } catch {
      return null;
    }
  }

  async function mintDemoFate() {
    if (!fate || !account) {
      pushLog("Connect MetaMask and configure fateTokenAddress first.");
      return;
    }
    await withTx("Mint demo FATE", () => fate.mint(account, ethers.parseEther("1000")));
  }

  async function refreshDashboard(contract = arena) {
    if (!contract) return;
    try {
      const [ethAvailable, ethTreasury, ethDice, ethBond, ethPot] = await Promise.all([
        contract.availableBankroll(ZERO_ADDRESS),
        contract.treasuryBalance(ZERO_ADDRESS),
        contract.reservedDicePayouts(ZERO_ADDRESS),
        contract.reservedRevealBonds(ZERO_ADDRESS),
        contract.reservedRafflePots(ZERO_ADDRESS)
      ]);

      const nextMetrics = {
        ethAvailable: formatSepoliaEth(ethAvailable),
        ethTreasury: formatSepoliaEth(ethTreasury),
        ethReserved: formatSepoliaEth(ethDice + ethBond + ethPot),
        fateAvailable: "-",
        fateTreasury: "-",
        fateReserved: "-"
      };

      if (cfg.fateTokenAddress) {
        const [fateAvailable, fateTreasury, fateDice, fateBond, fatePot] = await Promise.all([
          contract.availableBankroll(cfg.fateTokenAddress),
          contract.treasuryBalance(cfg.fateTokenAddress),
          contract.reservedDicePayouts(cfg.fateTokenAddress),
          contract.reservedRevealBonds(cfg.fateTokenAddress),
          contract.reservedRafflePots(cfg.fateTokenAddress)
        ]);
        nextMetrics.fateAvailable = formatFate(fateAvailable);
        nextMetrics.fateTreasury = formatFate(fateTreasury);
        nextMetrics.fateReserved = formatFate(fateDice + fateBond + fatePot);
      }

      setMetrics(nextMetrics);
      await refreshRounds(contract);
      setPending(readPending());
    } catch (error) {
      pushLog(`Refresh failed: ${readableError(error)}`);
    }
  }

  async function refreshRounds(contract = arena) {
    const ids = new Set(cfg.defaultRoundIds || []);
    try {
      const nextRoundId = Number(await contract.nextRaffleRoundId());
      for (let id = 1; id < nextRoundId; id += 1) ids.add(id);
    } catch {
      // Keep configured ids if the call fails.
    }

    const nextRounds = [];
    for (const id of [...ids].sort((a, b) => a - b)) {
      try {
        const round = await contract.getRaffleRound(id);
        if (round.ticketPrice === 0n) continue;
        nextRounds.push({
          id,
          token: round.token,
          totalTickets: round.totalTickets.toString(),
          pot: round.token === ZERO_ADDRESS ? formatSepoliaEth(round.pot) : formatFate(round.pot),
          requestId: round.requestId.toString(),
          randomnessReady: round.randomnessReady,
          finalized: round.finalized,
          proofHash: round.proofHash
        });
      } catch {
        // Ignore rounds that are not deployed.
      }
    }
    setRounds(nextRounds);
  }

  async function withTx(label, action) {
    if (!arena) {
      pushLog("Connect MetaMask first.");
      return;
    }
    setBusy(true);
    try {
      const tx = await action();
      pushLog(`${label} submitted: ${shortHash(tx.hash)}.`);
      await tx.wait();
      pushLog(`${label} confirmed.`);
      await refreshDashboard();
      await refreshWalletInfo();
    } catch (error) {
      pushLog(`${label} failed: ${readableError(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function placeDiceBet(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const tokenMode = form.get("token");
    const token = tokenAddressFor(tokenMode, cfg.fateTokenAddress);
    const wager = parseUnits(form.get("wager"));
    const bond = parseUnits(form.get("bond"));
    const rollUnder = Number(form.get("rollUnder"));
    const seed = ethers.hexlify(ethers.randomBytes(32));
    const commitment = commitmentFor(account, seed);

    await withTx("Dice commit", async () => {
      const overrides = token === ZERO_ADDRESS ? { value: wager + bond } : {};
      const tx = await arena.commitDiceBet(token, wager, rollUnder, commitment, bond, overrides);
      const receipt = await tx.wait();
      const eventLog = receipt.logs
        .map((log) => {
          try {
            return arena.interface.parseLog(log);
          } catch {
            return null;
          }
        })
        .find((log) => log?.name === "DiceCommitted");
      const betId = Number(eventLog?.args?.betId ?? (await arena.nextDiceBetId()) - 1n);
      const requestId = eventLog?.args?.requestId?.toString() || "";
      savePending({ type: "dice", id: betId, requestId, seed, tokenMode, createdAt: Date.now() });
      setPending(readPending());
      pushLog(`Saved dice seed for bet ${betId}${requestId ? `, request ${requestId}` : ""}.`);
      return { hash: tx.hash, wait: async () => receipt };
    });
  }

  async function buyRaffleTickets(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const roundId = Number(form.get("roundId"));
    const ticketCount = Number(form.get("ticketCount"));
    const bond = parseUnits(form.get("bond"));
    const seed = ethers.hexlify(ethers.randomBytes(32));
    const commitment = commitmentFor(account, seed);

    await withTx("Raffle purchase", async () => {
      const round = await arena.getRaffleRound(roundId);
      const token = round.token;
      const total = round.ticketPrice * BigInt(ticketCount) + bond;
      const overrides = token === ZERO_ADDRESS ? { value: total } : {};
      const tx = await arena.buyRaffleTickets(roundId, ticketCount, commitment, bond, overrides);
      const receipt = await tx.wait();
      const entryCount = await arena.getRaffleEntryCount(roundId);
      savePending({
        type: "raffle",
        roundId,
        entryIndex: Number(entryCount) - 1,
        seed,
        tokenMode: token === ZERO_ADDRESS ? "sepoliaeth" : "fate",
        createdAt: Date.now()
      });
      setPending(readPending());
      return { hash: tx.hash, wait: async () => receipt };
    });
  }

  async function drawRaffle(event) {
    event.preventDefault();
    const roundId = Number(new FormData(event.currentTarget).get("roundId"));
    await withTx("Draw", async () => {
      const tx = await arena.drawRaffle(roundId);
      const receipt = await tx.wait();
      const eventLog = receipt.logs
        .map((log) => {
          try {
            return arena.interface.parseLog(log);
          } catch {
            return null;
          }
        })
        .find((log) => log?.name === "RaffleDrawRequested");
      const requestId = eventLog?.args?.requestId?.toString();
      if (requestId) {
        pushLog(`Raffle round ${roundId} request ${requestId} is ready to fulfill.`);
      }
      return { hash: tx.hash, wait: async () => receipt };
    });
  }

  async function createRaffleRound(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const tokenMode = form.get("token");
    const token = tokenAddressFor(tokenMode, cfg.fateTokenAddress);
    const ticketPrice = parseUnits(form.get("ticketPrice"));
    const closesInMinutes = Math.max(1, Number(form.get("closesInMinutes")));
    const latestBlock = provider ? await provider.getBlock("latest") : null;
    const now = latestBlock?.timestamp ?? Math.floor(Date.now() / 1000);
    const closesAt = BigInt(now + closesInMinutes * 60);

    await withTx("Create round", () => arena.createRaffleRound(token, ticketPrice, closesAt));
  }

  async function finalizeRaffle(event) {
    event.preventDefault();
    const roundId = Number(new FormData(event.currentTarget).get("roundId"));
    await withTx("Finalize", () => arena.finalizeRaffle(roundId));
  }

  async function retryRandomness(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const kind = form.get("kind");
    const id = Number(form.get("id"));
    await withTx("Retry", () => (kind === "dice" ? arena.retryDiceRandomness(id) : arena.retryRaffleRandomness(id)));
  }

  async function fulfillRequest(event) {
    event.preventDefault();
    if (!coordinator) {
      pushLog("Missing coordinatorAddress in frontend/config.js.");
      return;
    }
    const form = new FormData(event.currentTarget);
    const requestId = BigInt(form.get("requestId"));
    const word = form.get("word");
    await withTx("VRF fulfill", () =>
      word === "" ? coordinator.fulfillRequest(requestId) : coordinator.fulfillRequestWithWord(requestId, BigInt(word))
    );
  }

  async function fulfillSavedRequest(requestId) {
    if (!coordinator) {
      pushLog("Missing coordinatorAddress in frontend/config.js.");
      return;
    }
    await withTx("VRF fulfill", () => coordinator.fulfillRequest(BigInt(requestId)));
  }

  async function approveFate() {
    if (!fate || !arena) {
      pushLog("Missing FATE token address.");
      return;
    }
    await withTx("FATE approval", () => fate.approve(cfg.arenaAddress, ethers.MaxUint256));
  }

  async function revealPending(item) {
    await withTx("Reveal", async () => {
      const tx =
        item.type === "dice"
          ? await arena.revealDiceSeed(item.id, item.seed)
          : await arena.revealRaffleSeed(item.roundId, item.entryIndex, item.seed);
      const receipt = await tx.wait();
      removePending(item.localId);
      setPending(readPending());
      return { hash: tx.hash, wait: async () => receipt };
    });
  }

  async function revealRoundBatch(roundId) {
    const items = readPending().filter((item) => item.type === "raffle" && item.roundId === roundId);
    if (!items.length) {
      pushLog(`No local seeds for raffle round ${roundId}.`);
      return;
    }

    await withTx("Batch reveal", async () => {
      const entryIndexes = items.map((item) => BigInt(item.entryIndex));
      const seeds = items.map((item) => item.seed);
      const tx = await arena.batchRevealRaffleSeeds(roundId, entryIndexes, seeds);
      const receipt = await tx.wait();
      for (const item of items) {
        removePending(item.localId);
      }
      setPending(readPending());
      return { hash: tx.hash, wait: async () => receipt };
    });
  }

  return (
    <main className="app-shell">
      <div className="texture" aria-hidden="true" />
      <header className="topbar">
        <div>
          <p className="eyebrow">SC6107 Option 4</p>
          <h1>Chain Fate Arena</h1>
        </div>
        <div className="wallet-strip">
          <button className="button primary" type="button" onClick={account ? disconnectWallet : connectWallet}>
            <Wallet size={17} /> {account ? "Disconnect" : "Connect"}
          </button>
          <button className="button quiet" type="button" onClick={approveFate} disabled={!fate || busy}>
            <BadgeCheck size={17} /> Approve FATE
          </button>
          <button className="button quiet" type="button" onClick={fundDemoEth} disabled={!account || busy}>
            <CircleDollarSign size={17} /> Test ETH
          </button>
          <button className="button quiet" type="button" onClick={mintDemoFate} disabled={!fate || busy}>
            <Gift size={17} /> Mint FATE
          </button>
          <div className={`wallet-pill ${walletInfo.isExpectedChain ? "ready" : "warning"}`}>
            <div>
              <span>Wallet</span>
              <strong>{walletLabel}</strong>
            </div>
            <div className="wallet-lines">
              <span>{walletInfo.chainName} {walletInfo.chainId !== "-" ? `(${walletInfo.chainId})` : ""}</span>
              <span>{walletInfo.nativeBalance}</span>
              <span>{walletInfo.fateBalance}</span>
            </div>
            {account && demoNetwork.demoAccount && !walletInfo.isDemoAccount && (
              <small>Demo account {shortAddress(demoNetwork.demoAccount)}</small>
            )}
          </div>
        </div>
      </header>

      <section className="status-grid" aria-label="Protocol status">
        <Metric icon={<CircleDollarSign />} label="SepoliaETH Available" value={metrics.ethAvailable} invert />
        <Metric label="SepoliaETH Treasury" value={metrics.ethTreasury} />
        <Metric label="SepoliaETH Reserved" value={metrics.ethReserved} />
        <Metric icon={<CircleDollarSign />} label="FATE Available" value={metrics.fateAvailable} invert />
        <Metric label="FATE Treasury" value={metrics.fateTreasury} />
        <Metric label="FATE Reserved" value={metrics.fateReserved} />
      </section>

      <section className="workbench">
        <GamePanel eyebrow="Game One" title="Oracle Dice" icon={<Dice5 />}>
          <form className="form-grid" onSubmit={placeDiceBet}>
            <Field label="Token" as="select" name="token" options={TOKEN_OPTIONS} />
            <Field label="Wager" name="wager" type="number" min="0" step="0.01" defaultValue="0.5" />
            <Field label="Reveal Bond" name="bond" type="number" min="0" step="0.01" defaultValue="0.05" />
            <Field label="Roll Under" name="rollUnder" type="number" min="2" max="95" defaultValue="50" />
            <button className="button primary span-2" type="submit" disabled={!arena || busy}>
              {busy ? <Loader2 className="spin" size={17} /> : <Dice5 size={17} />} Commit Dice Bet
            </button>
          </form>
        </GamePanel>

        <GamePanel eyebrow="Game Two" title="Epoch Raffle" icon={<Ticket />}>
          <form className="form-grid" onSubmit={buyRaffleTickets}>
            <Field label="Round Id" name="roundId" type="number" min="1" defaultValue="1" />
            <Field label="Tickets" name="ticketCount" type="number" min="1" defaultValue="1" />
            <Field label="Reveal Bond" name="bond" type="number" min="0" step="0.01" defaultValue="0.1" />
            <button className="button primary span-2" type="submit" disabled={!arena || busy}>
              <Gift size={17} /> Buy Tickets
            </button>
          </form>
        </GamePanel>
      </section>

      <section className="operator-grid">
        <article className="panel">
          <PanelHead eyebrow="Round Desk" title="Draw and finalize" icon={<RefreshCw />} />
          <form className="form-grid compact-form" onSubmit={createRaffleRound}>
            <Field label="Token" as="select" name="token" options={TOKEN_OPTIONS} />
            <Field label="Ticket Price" name="ticketPrice" type="number" min="0" step="0.01" defaultValue="0.2" />
            <Field label="Closes In Minutes" name="closesInMinutes" type="number" min="1" defaultValue="1440" />
            <button className="button quiet" type="submit" disabled={!arena || busy}>
              <Ticket size={17} /> Create Round
            </button>
          </form>
          <form className="inline-form" onSubmit={drawRaffle}>
            <input name="roundId" type="number" min="1" defaultValue="1" required />
            <button className="button quiet" type="submit" disabled={!arena || busy}>Draw</button>
          </form>
          <form className="inline-form" onSubmit={finalizeRaffle}>
            <input name="roundId" type="number" min="1" defaultValue="1" required />
            <button className="button quiet" type="submit" disabled={!arena || busy}>Finalize</button>
          </form>
          <form className="inline-form triple" onSubmit={retryRandomness}>
            <select name="kind">
              <option value="dice">Dice</option>
              <option value="raffle">Raffle</option>
            </select>
            <input name="id" type="number" min="1" placeholder="Bet or round id" required />
            <button className="button quiet" type="submit" disabled={!arena || busy}>Retry</button>
          </form>
        </article>

        <article className="panel dark">
          <PanelHead eyebrow="Mock VRF" title="Fulfill request" icon={<ShieldCheck />} />
          <form className="inline-form triple" onSubmit={fulfillRequest}>
            <input name="requestId" type="text" inputMode="numeric" placeholder="Request id" required />
            <input name="word" type="number" min="0" placeholder="Optional word" />
            <button className="button light" type="submit" disabled={!coordinator || busy}>Fulfill</button>
          </form>
        </article>
      </section>

      <section className="lower-grid">
        <article className="panel">
          <PanelHead eyebrow="Reveal Center" title="Committed seeds" icon={<KeyRound />} />
          <div className="pending-list">
            {pending.length ? (
              pending.map((item) => (
                <div className="pending-item" key={item.localId}>
                  <div>
                    <strong>{item.type === "dice" ? `Dice bet ${item.id}` : `Raffle ${item.roundId}/${item.entryIndex}`}</strong>
                    {item.requestId && <div className="mini-label">request {item.requestId}</div>}
                    <code>{item.seed}</code>
                  </div>
                  <div className="pending-actions">
                    {item.requestId && (
                      <button
                        className="button quiet"
                        type="button"
                        onClick={() => fulfillSavedRequest(item.requestId)}
                        disabled={!coordinator || busy}
                      >
                        Fulfill
                      </button>
                    )}
                    <button className="button quiet" type="button" onClick={() => revealPending(item)} disabled={!arena || busy}>
                      Reveal
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <div className="empty">No local reveal seeds yet.</div>
            )}
          </div>
        </article>

        <article className="panel">
          <PanelHead eyebrow="Raffle Board" title="Rounds" icon={<Ticket />} />
          <div className="round-list">
            {rounds.length ? (
              rounds.map((round) => (
                <div className="round-item" key={round.id}>
                  <strong>Round {round.id} - {tokenDisplayName(round.token, cfg.fateTokenAddress)}</strong>
                  <div className="mini-label">tickets {round.totalTickets} - pot {round.pot}</div>
                  <div className="mini-label">request {round.requestId} - ready {String(round.randomnessReady)} - finalized {String(round.finalized)}</div>
                  <code>proof {round.proofHash}</code>
                  <button
                    className="button quiet round-action"
                    type="button"
                    onClick={() => revealRoundBatch(round.id)}
                    disabled={!arena || busy || !pending.some((item) => item.type === "raffle" && item.roundId === round.id)}
                  >
                    Batch Reveal
                  </button>
                </div>
              ))
            ) : (
              <div className="empty">No configured rounds found.</div>
            )}
          </div>
        </article>
      </section>

      <section className="log-panel">
        <PanelHead eyebrow="Status" title="Transaction log" icon={<RefreshCw />} />
        <div className="status-log">
          {logs.map((line, index) => (
            <div className="log-item" key={`${line}-${index}`}>{line}</div>
          ))}
        </div>
      </section>
    </main>
  );
}

function Metric({ icon, label, value, invert = false }) {
  return (
    <article className={`metric ${invert ? "invert" : ""}`}>
      <div className="metric-head">
        <span>{label}</span>
        {icon}
      </div>
      <strong>{value}</strong>
    </article>
  );
}

function GamePanel({ eyebrow, title, icon, children }) {
  return (
    <article className="panel">
      <PanelHead eyebrow={eyebrow} title={title} icon={icon} />
      {children}
    </article>
  );
}

function PanelHead({ eyebrow, title, icon }) {
  return (
    <div className="panel-head">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
      </div>
      {icon}
    </div>
  );
}

function Field({ label, as, options, ...props }) {
  return (
    <label>
      {label}
      {as === "select" ? (
        <select {...props}>
          {options.map((option) => (
            <option value={option} key={option}>{tokenDisplayName(option)}</option>
          ))}
        </select>
      ) : (
        <input {...props} required />
      )}
    </label>
  );
}

function parseUnits(value) {
  return ethers.parseEther(String(value || "0"));
}

function formatSepoliaEth(value) {
  return formatNative(trimNumber(ethers.formatEther(value)));
}

function formatFate(value) {
  return `${trimNumber(ethers.formatEther(value))} FATE`;
}

function trimNumber(value) {
  const [whole, fraction = ""] = value.split(".");
  const trimmed = fraction.slice(0, 4).replace(/0+$/, "");
  return trimmed ? `${whole}.${trimmed}` : whole;
}

function shortAddress(address) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function shortHash(hash) {
  return `${hash.slice(0, 10)}...${hash.slice(-6)}`;
}

function sameAddress(left, right) {
  return Boolean(left && right && left.toLowerCase() === right.toLowerCase());
}

function commitmentFor(player, seed) {
  return ethers.keccak256(ethers.solidityPacked(["address", "bytes32"], [player, seed]));
}

function storageKey() {
  return `${STORAGE_PREFIX}:${cfg.arenaAddress || "local"}`;
}

function readPending() {
  try {
    return JSON.parse(localStorage.getItem(storageKey()) || "[]");
  } catch {
    return [];
  }
}

function savePending(item) {
  const items = readPending();
  items.push({ ...item, localId: `${item.type}:${item.id ?? item.roundId}:${item.entryIndex ?? "x"}:${Date.now()}` });
  localStorage.setItem(storageKey(), JSON.stringify(items));
}

function removePending(localId) {
  const items = readPending().filter((item) => item.localId !== localId);
  localStorage.setItem(storageKey(), JSON.stringify(items));
}

function readableError(error) {
  return error?.shortMessage || error?.reason || error?.message || "unknown error";
}

function walletErrorCode(error) {
  const code = error?.code || error?.data?.originalError?.code;
  return typeof code === "string" ? Number(code) || code : code;
}
