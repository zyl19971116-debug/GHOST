'use strict';

/**
 * Deploy AnalysisRegistry.
 *
 * Usage:
 *   npx hardhat run scripts/deploy.js --network robinhoodTestnet
 *   npx hardhat run scripts/deploy.js --network robinhood
 *
 * The script refuses to pretend it succeeded:
 *   - it prints the FULL chain metadata it is about to write to,
 *   - it verifies the connected chain id matches the configured one,
 *   - it writes the resulting address to `.deployment.json` only after the
 *     receipt is confirmed.
 *
 * Nothing here moves user funds. The contract has no payable function, no token
 * logic and no transfer capability.
 */

const fs = require('node:fs');
const path = require('node:path');
const hre = require('hardhat');

const { ethers } = hre;

const EXPECTED_CHAIN_IDS = {
  robinhood: 4663,
  robinhoodTestnet: 46630,
  hardhat: 31337,
};

async function main() {
  const networkName = hre.network.name;
  const expected = EXPECTED_CHAIN_IDS[networkName];

  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  console.log(`network      : ${networkName}`);
  console.log(`chainId      : ${chainId}`);
  if (expected !== undefined && chainId !== expected) {
    throw new Error(
      `Refusing to deploy: network "${networkName}" reports chainId ${chainId} but ${expected} was expected. ` +
        'Check your RPC URL before continuing.',
    );
  }

  const signers = await ethers.getSigners();
  if (signers.length === 0) {
    throw new Error(
      'No signer available. Set DEPLOYER_PRIVATE_KEY in contracts/.env to deploy to a real network.',
    );
  }
  const deployer = signers[0];
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`deployer     : ${deployer.address}`);
  console.log(`balance      : ${ethers.formatEther(balance)} ETH`);

  if (balance === 0n && networkName !== 'hardhat') {
    throw new Error('Deployer balance is 0 — deployment would fail. Fund the account first.');
  }

  const head = await ethers.provider.getBlockNumber();
  console.log(`head block   : ${head}`);

  console.log('\ndeploying AnalysisRegistry …');
  const factory = await ethers.getContractFactory('AnalysisRegistry');
  const registry = await factory.deploy();
  const deployTx = registry.deploymentTransaction();
  console.log(`tx hash      : ${deployTx ? deployTx.hash : 'n/a'}`);

  await registry.waitForDeployment();
  const address = await registry.getAddress();
  const receipt = await deployTx.wait();
  console.log(`contract     : ${address}`);
  console.log(`block        : ${receipt.blockNumber}`);
  console.log(`gas used     : ${receipt.gasUsed.toString()}`);

  await verifyRefusesValue(address);

  const artifact = await hre.artifacts.readArtifact('AnalysisRegistry');
  const out = {
    network: networkName,
    chainId,
    address,
    deployer: deployer.address,
    txHash: deployTx ? deployTx.hash : null,
    blockNumber: receipt.blockNumber,
    deployedAt: new Date().toISOString(),
    solidity: hre.config.solidity.compilers[0].version,
    abiHash: ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify(artifact.abi))),
  };

  const outPath = path.join(__dirname, '..', '.deployment.json');
  fs.writeFileSync(outPath, `${JSON.stringify(out, null, 2)}\n`, 'utf8');
  console.log(`\nwrote ${outPath}`);
  console.log('\nNext: put this into the project root .env as');
  console.log(`  NEXT_PUBLIC_REGISTRY_ADDRESS=${address}`);
  console.log(`  NEXT_PUBLIC_REGISTRY_CHAIN_ID=${chainId}`);
}

/** Sanity check: the deployed contract must reject plain ETH transfers. */
async function verifyRefusesValue(address) {
  const [signer] = await ethers.getSigners();
  try {
    await signer.sendTransaction({ to: address, value: 1n });
  } catch {
    console.log('value check  : OK — plain ETH transfer is rejected');
    return;
  }
  throw new Error(
    'Value check FAILED — the deployed contract accepted ETH. It must not be payable.',
  );
}

main().catch((err) => {
  console.error('\nDEPLOYMENT FAILED');
  console.error(err);
  process.exitCode = 1;
});
