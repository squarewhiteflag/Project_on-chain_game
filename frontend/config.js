// Local Anvil demo addresses from the latest deployment. Replace these after redeploying.
window.CHAIN_FATE_CONFIG = {
  network: {
    chainId: 31337,
    chainHex: "0x7a69",
    chainName: "Anvil Local",
    rpcUrls: ["http://127.0.0.1:8545"],
    nativeCurrency: {
      name: "Anvil Test ETH",
      symbol: "ETH",
      decimals: 18
    },
    demoAccount: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
    // Public Anvil default key. Only use against a local throwaway chain.
    demoPrivateKey: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
  },
  arenaAddress: "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
  coordinatorAddress: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
  fateTokenAddress: "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0",
  defaultRoundIds: [1, 2]
};
