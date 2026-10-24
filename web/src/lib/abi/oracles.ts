// Oracle and precompile ABIs read by GET /api/price (research/price-data-source.md section 7).

/** Pyth Core Compatible contract: getPriceUnsafe(bytes32) -> PythStructs.Price */
export const pythAbi = [
  {
    type: "function",
    name: "getPriceUnsafe",
    stateMutability: "view",
    inputs: [{ name: "id", type: "bytes32" }],
    outputs: [
      {
        name: "price",
        type: "tuple",
        components: [
          { name: "price", type: "int64" },
          { name: "conf", type: "uint64" },
          { name: "expo", type: "int32" },
          { name: "publishTime", type: "uint256" },
        ],
      },
    ],
  },
] as const;

/** Stork: getTemporalNumericValueUnsafeV1(bytes32) -> { timestampNs, quantizedValue (1e18) } */
export const storkAbi = [
  {
    type: "function",
    name: "getTemporalNumericValueUnsafeV1",
    stateMutability: "view",
    inputs: [{ name: "id", type: "bytes32" }],
    outputs: [
      {
        name: "value",
        type: "tuple",
        components: [
          { name: "timestampNs", type: "uint64" },
          { name: "quantizedValue", type: "int192" },
        ],
      },
    ],
  },
] as const;

/** Monad staking precompile 0x...1000 (CALL only; works through eth_call). */
export const stakingAbi = [
  {
    type: "function",
    name: "getEpoch",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [
      { name: "epoch", type: "uint64" },
      { name: "inEpochDelayPeriod", type: "bool" },
    ],
  },
  {
    type: "function",
    name: "getProposerValId",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [{ name: "valId", type: "uint64" }],
  },
  {
    type: "function",
    name: "getConsensusValidatorSet",
    stateMutability: "nonpayable",
    inputs: [{ name: "startIndex", type: "uint32" }],
    outputs: [
      { name: "isDone", type: "bool" },
      { name: "nextIndex", type: "uint32" },
      { name: "valIds", type: "uint64[]" },
    ],
  },
] as const;
