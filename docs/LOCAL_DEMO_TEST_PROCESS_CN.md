# Chain Fate Arena 本地测试过程

本文档记录 `P_Game` 项目的本地启动、环境配置、合约部署、前端运行以及 Dice/Raffle 两个游戏的测试操作流程。

## 1. 测试目标

本地测试需要跑通以下流程：

- 启动 Anvil 本地区块链。
- 部署 `MockVRFCoordinator`、`ChainFateArena` 和 `MockERC20`。
- 启动 Vite/React 前端。
- 使用 MetaMask 连接本地链。
- 完成一次 Oracle Dice 游戏。
- 完成一次 Epoch Raffle 游戏。
- 通过 Mock VRF 面板手动触发本地随机数回调。

## 2. 前置环境

本机需要安装：

- Foundry：包含 `forge`、`anvil`、`cast`。
- Node.js 和 npm。
- MetaMask 浏览器钱包。

验证命令：

```bash
forge --version
anvil --version
node --version
npm --version
```

如果是第一次运行项目，先安装依赖：

```bash
cd /Users/zhy/NTU/Course_T2/SC6107/Project/P_Game
npm ci
npm --prefix frontend ci
```

本地 Anvil 测试通常不需要填写 `.env`。`.env.example` 主要用于 Sepolia 或 Chainlink VRF 测试网部署。

## 3. 启动本地区块链

打开第一个终端：

```bash
cd /Users/zhy/NTU/Course_T2/SC6107/Project/P_Game
anvil
```

Anvil 默认 RPC 地址：

```text
http://127.0.0.1:8545
```

Anvil 默认 Chain ID：

```text
31337
```

启动后保持该终端运行，不要关闭。

## 4. 配置 MetaMask

在 MetaMask 中添加本地网络：

```text
Network name: Anvil Local
RPC URL: http://127.0.0.1:8545
Chain ID: 31337
Currency symbol: SepoliaETH
```

然后导入 Anvil 终端输出的第一个测试账户私钥。常见默认私钥为：

```text
0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
```

注意：前端把 native token 显示为 `SepoliaETH`，但在 Anvil 本地环境中它只是本地测试 ETH，不是真实主网资产。

## 5. 部署本地演示合约

打开第二个终端：

```bash
cd /Users/zhy/NTU/Course_T2/SC6107/Project/P_Game
npm run deploy:local
```

该命令会执行：

```bash
forge script script/DeployChainFateArena.s.sol:DeployChainFateArena --rpc-url http://127.0.0.1:8545 --broadcast
```

部署脚本会初始化：

- `MockVRFCoordinator`：本地随机数协调器。
- `ChainFateArena`：核心游戏平台合约。
- `MockERC20`：演示用 FATE Token。
- 两个默认 raffle 轮次：`Round 1` 和 `Round 2`。
- SepoliaETH/native test ETH 和 FATE 的初始资金池。

## 6. 更新前端合约地址

部署完成后，确认或更新：

```text
/Users/zhy/NTU/Course_T2/SC6107/Project/P_Game/frontend/config.js
```

干净 Anvil 第一次部署时，常见默认地址为：

```js
window.CHAIN_FATE_CONFIG = {
  arenaAddress: "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
  coordinatorAddress: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
  fateTokenAddress: "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0",
  defaultRoundIds: [1, 2]
};
```

如果重新部署过，应以最新部署结果为准。地址可在下面文件中查看：

```text
/Users/zhy/NTU/Course_T2/SC6107/Project/P_Game/broadcast/DeployChainFateArena.s.sol/31337/run-latest.json
```

需要复制三个 `contractName` 对应的 `contractAddress`：

- `ChainFateArena` -> `arenaAddress`
- `MockVRFCoordinator` -> `coordinatorAddress`
- `MockERC20` -> `fateTokenAddress`

## 7. 启动前端

打开第三个终端：

```bash
cd /Users/zhy/NTU/Course_T2/SC6107/Project/P_Game
npm run frontend:dev
```

前端默认地址：

```text
http://127.0.0.1:8014/
```

打开页面后，点击 `Connect` 连接 MetaMask，并确认 MetaMask 当前网络是 Anvil Local。

## 8. Oracle Dice 测试流程

Dice 是下注掷骰游戏，使用 commit-reveal 机制和 Mock VRF 随机数。

操作步骤：

1. 在页面中选择 `SepoliaETH` 或 `FATE`。
2. 输入 `Wager` 下注金额。
3. 输入 `Reveal Bond` 揭示保证金。
4. 输入 `Roll Under`，合法范围是 2 到 95。
5. 点击 `Commit Dice Bet`，在 MetaMask 中确认交易。
6. 交易确认后，页面会保存本次 bet 的 reveal seed，并显示相关记录或日志。
7. 找到该 bet 对应的 request id。
8. 在 `Mock VRF` 面板中输入 request id。
9. 点击 `Fulfill`，在 MetaMask 中确认交易，让本地 Mock VRF 回调随机数。
10. 回到 `Reveal Center`，点击对应记录的 `Reveal`。
11. MetaMask 确认后，合约会验证 seed 并自动结算。

预期结果：

- 如果骰子结果小于 `Roll Under`，玩家赢，收到 `quoted payout + reveal bond`。
- 如果玩家输，只退回 `reveal bond`，下注进入 treasury。
- 如果玩家没有在 deadline 前 reveal，下注和保证金可被罚没。

## 9. Epoch Raffle 测试流程

Raffle 是限时抽奖游戏，玩家买票并提交 seed commitment，轮次结束后通过 VRF 和已揭示 seed 共同确定中奖票。

操作步骤：

1. 使用部署脚本创建的默认轮次：`Round 1` 或 `Round 2`。
2. 在购票区域输入 `Round Id`。
3. 输入 ticket 数量。
4. 输入 `Reveal Bond` 揭示保证金。
5. 点击 `Buy Tickets`，在 MetaMask 中确认交易。
6. 等待 raffle 轮次关闭。部署脚本创建的默认轮次关闭时间约为部署后 1 天。
7. 轮次关闭后，在 `Round Desk` 输入 round id。
8. 点击 `Draw` 请求随机数。
9. 在 `Raffle Board` 或页面日志中找到该轮次的 request id。
10. 在 `Mock VRF` 面板中输入 request id，点击 `Fulfill`。
11. 在 `Reveal Center` 中 reveal 本钱包保存的 seed，或在 `Raffle Board` 中点击 `Batch Reveal` 批量揭示。
12. reveal deadline 结束后，点击 `Finalize`。
13. 合约自动计算中奖票并发放奖池。

预期结果：

- winner 获得 `pot - house fee`。
- 未 reveal 的 entry 会失去 reveal bond。
- house fee 和罚没保证金进入 treasury。
- 页面会展示轮次是否 ready、是否 finalized、request id 和 proof hash 等信息。

## 10. FATE Token 测试注意事项

使用 `FATE` 下注或购票前，需要先授权：

1. 连接 MetaMask。
2. 点击页面上的 `Approve FATE`。
3. 在 MetaMask 中确认授权交易。
4. 授权完成后再进行 Dice 或 Raffle 操作。

如果没有 FATE 余额，需要确认当前 MetaMask 账户是否是部署脚本 mint FATE 的账户。默认情况下，部署脚本会给 Anvil 第一个账户 mint FATE。

## 11. 常见问题

### 前端连接不上钱包

检查 MetaMask 是否切换到：

```text
http://127.0.0.1:8545
Chain ID 31337
```

### 页面显示合约读取失败

检查 `frontend/config.js` 中地址是否与当前 Anvil 部署一致。每次重启 Anvil 并重新部署后，地址都可能变化。

### 点击 Fulfill 失败

检查 request id 是否正确。Dice 和 Raffle 都需要先执行 commit 或 draw，才会产生有效 request id。

### FATE 交易失败

先点击 `Approve FATE` 授权，再重试。还需要确认当前账户持有 FATE。

### Raffle 无法 Draw 或 Finalize

`Draw` 需要等轮次关闭后才能执行。`Finalize` 需要随机数 ready，并且 reveal 期结束后才能执行。

## 12. 本地测试检查清单

- [ ] `anvil` 已启动。
- [ ] MetaMask 已连接 Anvil Local。
- [ ] 已导入 Anvil 测试账户。
- [ ] `npm run deploy:local` 部署成功。
- [ ] `frontend/config.js` 中三个合约地址正确。
- [ ] `npm run frontend:dev` 启动成功。
- [ ] `http://127.0.0.1:8014/` 可访问。
- [ ] MetaMask 可以连接前端。
- [ ] Dice 可以完成 commit、fulfill、reveal、settle。
- [ ] Raffle 可以完成 buy tickets、draw、fulfill、reveal、finalize。
- [ ] FATE 测试前已完成 `Approve FATE`。
