-- CreateTable
CREATE TABLE "Wallet" (
    "id" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "address" TEXT NOT NULL,
    "addressLc" TEXT NOT NULL,
    "isContract" BOOLEAN,
    "codeSize" INTEGER,
    "balanceWei" TEXT,
    "nonce" INTEGER,
    "firstSeenBlock" INTEGER,
    "lastSeenBlock" INTEGER,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Wallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "hash" TEXT NOT NULL,
    "blockNumber" INTEGER NOT NULL,
    "blockHash" TEXT NOT NULL,
    "blockTime" TIMESTAMP(3) NOT NULL,
    "fromId" TEXT NOT NULL,
    "toId" TEXT,
    "valueWei" TEXT NOT NULL,
    "gasLimit" TEXT NOT NULL,
    "gasPriceWei" TEXT NOT NULL,
    "gasUsed" TEXT,
    "feeWei" TEXT,
    "nonce" INTEGER NOT NULL,
    "inputSize" INTEGER NOT NULL,
    "methodId" TEXT,
    "methodLabel" TEXT,
    "txType" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "isContractCreation" BOOLEAN NOT NULL DEFAULT false,
    "isContractInteraction" BOOLEAN NOT NULL DEFAULT false,
    "sourceStrategy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Relationship" (
    "id" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "sourceId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "txCount" INTEGER NOT NULL DEFAULT 0,
    "volumeWei" TEXT NOT NULL DEFAULT '0',
    "direction" TEXT NOT NULL,
    "firstSeenAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3),
    "confidence" DOUBLE PRECISION NOT NULL,
    "basis" JSONB NOT NULL,
    "sampleTxHashes" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Relationship_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Analysis" (
    "id" TEXT NOT NULL,
    "reportHash" TEXT NOT NULL,
    "reportVersion" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "subjectId" TEXT NOT NULL,
    "fromBlock" INTEGER,
    "toBlock" INTEGER,
    "blocksScanned" INTEGER,
    "txCount" INTEGER NOT NULL DEFAULT 0,
    "counterpartyCount" INTEGER NOT NULL DEFAULT 0,
    "anomalyCount" INTEGER NOT NULL DEFAULT 0,
    "netFlowWei" TEXT NOT NULL DEFAULT '0',
    "successRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "stats" JSONB NOT NULL,
    "graph" JSONB NOT NULL,
    "ai" JSONB NOT NULL,
    "sources" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Analysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Archive" (
    "id" TEXT NOT NULL,
    "reportHash" TEXT NOT NULL,
    "reportVersion" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "subjectId" TEXT NOT NULL,
    "analysisId" TEXT,
    "label" TEXT NOT NULL,
    "metadataCid" TEXT,
    "attestationStatus" TEXT NOT NULL DEFAULT 'not_deployed',
    "attestationTxHash" TEXT,
    "attestationContract" TEXT,
    "attestationChainId" INTEGER,
    "attestationError" TEXT,
    "attestedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Archive_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncState" (
    "id" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "latestSyncedBlock" INTEGER NOT NULL DEFAULT 0,
    "latestBlockTime" TIMESTAMP(3),
    "sourceHost" TEXT,
    "historyIndexMode" TEXT NOT NULL DEFAULT 'none',
    "lastError" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SyncState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Wallet_addressLc_idx" ON "Wallet"("addressLc");

-- CreateIndex
CREATE INDEX "Wallet_chainId_lastSeenBlock_idx" ON "Wallet"("chainId", "lastSeenBlock");

-- CreateIndex
CREATE UNIQUE INDEX "Wallet_chainId_addressLc_key" ON "Wallet"("chainId", "addressLc");

-- CreateIndex
CREATE INDEX "Transaction_chainId_blockNumber_idx" ON "Transaction"("chainId", "blockNumber");

-- CreateIndex
CREATE INDEX "Transaction_fromId_idx" ON "Transaction"("fromId");

-- CreateIndex
CREATE INDEX "Transaction_toId_idx" ON "Transaction"("toId");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_chainId_hash_key" ON "Transaction"("chainId", "hash");

-- CreateIndex
CREATE INDEX "Relationship_chainId_idx" ON "Relationship"("chainId");

-- CreateIndex
CREATE UNIQUE INDEX "Relationship_chainId_sourceId_targetId_key" ON "Relationship"("chainId", "sourceId", "targetId");

-- CreateIndex
CREATE INDEX "Analysis_chainId_reportHash_idx" ON "Analysis"("chainId", "reportHash");

-- CreateIndex
CREATE INDEX "Analysis_subjectId_createdAt_idx" ON "Analysis"("subjectId", "createdAt");

-- CreateIndex
CREATE INDEX "Archive_reportHash_idx" ON "Archive"("reportHash");

-- CreateIndex
CREATE INDEX "Archive_subjectId_createdAt_idx" ON "Archive"("subjectId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SyncState_chainId_key" ON "SyncState"("chainId");

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_fromId_fkey" FOREIGN KEY ("fromId") REFERENCES "Wallet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_toId_fkey" FOREIGN KEY ("toId") REFERENCES "Wallet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Relationship" ADD CONSTRAINT "Relationship_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Wallet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Relationship" ADD CONSTRAINT "Relationship_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "Wallet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Analysis" ADD CONSTRAINT "Analysis_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Wallet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Archive" ADD CONSTRAINT "Archive_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Wallet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Archive" ADD CONSTRAINT "Archive_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "Analysis"("id") ON DELETE SET NULL ON UPDATE CASCADE;


