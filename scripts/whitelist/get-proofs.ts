import fs from "fs";
// import { utlis } from "hardhat";
import { utils } from "ethers";
import { MerkleTree } from "merkletreejs";
import keccak256 from "keccak256";
import whitelist from "./whitelist.json";

interface Leaf {
  address?: string;
  index?: number;
  leaf?: string;
  proof?: any;
}
const leaves: Array<Leaf> = [];
const proofs: any = {};

const getLeaf = (address: string, index: number): string => {
  const paddedIndex = utils
    .hexZeroPad(utils.hexValue(index), 32)
    .substring(2);
  return address + paddedIndex;
};

async function main() {
  const input: Array<any> = [];

  whitelist.forEach((address, index) => {
    const addy = address.toLowerCase();
    leaves.push({
      address: addy,
      index,
      leaf: getLeaf(addy, index),
    });
  });

  const tree = new MerkleTree(
    leaves.map((l) => l.leaf),
    keccak256,
    { hashLeaves: true, sortPairs: true }
  );

  // Verify & add proofs
  const root = tree.getHexRoot();
  console.log("Root:", root);
  let correct = true;

  leaves.forEach((l: Leaf) => {
    const leaf = keccak256(l.leaf!);
    const proof = tree.getHexProof(leaf);
    correct = correct && tree.verify(proof, leaf, root);
    l.proof = proof;
    proofs[l.address!] = l;
  });
  console.log(`All proofs are correct : ${correct}`);
  const json = JSON.stringify(proofs);
  try {
    fs.writeFileSync("scripts/whitelist/merkleRoot.json", JSON.stringify(root), "utf8");
    fs.writeFileSync("scripts/whitelist/proofs.json", json, "utf8");
  } catch (e) {
    console.log(e);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

