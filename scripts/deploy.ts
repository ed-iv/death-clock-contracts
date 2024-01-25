import { ethers } from "hardhat";
import _ from 'lodash';

import deployDeathClock from './deployDeathClock'

const viewerURI = 'QmSgsxbCooC7f1ExTj1kYAHQEyquBCMPd2SLG7JSNTCEQ6';
const previewURI = 'QmYzVTDLSbbnrYL5mDvyuqH7jk1XjhKmMAH1gtahWhcYWR';

async function main() {
  const network = await ethers.provider.getNetwork();
  const signer = process.env.DEATH_CLOCK_SIGNER;
  if(!signer) throw Error('No death clock signer provided [DEATH_CLOCK_SIGNER]');
  const deathClock = await deployDeathClock(network, signer, viewerURI, previewURI, false);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
