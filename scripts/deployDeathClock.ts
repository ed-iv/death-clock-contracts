import { ethers } from "hardhat";
import { DeathClock } from "../typechain-types";
import { IDeathClockDescriptor } from "../typechain-types";
import { DeathClockDesciptor } from "../typechain-types/contracts/DeathClockDescriptor.sol";
import _ from "lodash";
import clocksJSON from "../deathClocks.json";
import config from "../config.json";

const MAX_TOKENS = 500;

function prepareClocks() {
	const res: any = [];
	_.each(clocksJSON, (item) => {
		const ti: any = item.topImage;
		ti.realIndex = _.indexOf(config.images, `${item.topImage.name}.jpg`);
		if (ti.realIndex < 0) console.log("TOP", item.topImage.name);

		const bi: any = item.bottomImage;
		bi.realIndex = _.indexOf(config.images, `${bi.name}.jpg`);
		if (bi.realIndex < 0) console.log("B", bi.name);
		res.push(item);
	});
	return res;
}

function getTokenParams() {
	const totalCombinations = clocksJSON.length;
	const params: IDeathClockDescriptor.TokenParamsStruct[] = [];

	for (var i = 0; i < totalCombinations; i++) {
		const conf = clocksJSON[i];
		const topId: number = conf.topImage.index;
		const botId: number = conf.bottomImage.index;
		const colId: number = conf.colorway.index;

		params.push({
			cid: colId,
			tid: topId,
			bid: botId,
		} as IDeathClockDescriptor.TokenParamsStruct);
	}

	if (params.length !== MAX_TOKENS)
		throw Error(
			`Params length not valid [${params.length}] expected to be [${MAX_TOKENS}]`
		);
	return params;
}

async function setChunks(func: Function, array: any[], chunkSize = 99) {
	const chunks = _.chunk(array, chunkSize);
	for (var j = 0; j < chunks.length; j++) {
		const index = j * chunkSize;
		await func(chunks[j], index);
	}
}

async function verify(
	network,
	deathClockSigner,
	webAppUrl,
	previewUrl,
	deathClockDescriptor,
	deathClock,
	remnants
) {
	console.log("💀 DeathClock contract at:", "\t", deathClock.address);
	console.log(
		`npx hardhat verify --network ${network.name} ${deathClock.address} "${deathClockSigner}" "${deathClockDescriptor.address}"`
	);

	console.log("💀 Remnants contract at:", "\t", remnants);
	console.log(
		`npx hardhat verify --network ${network.name} ${remnants} "${deathClock.address}"`
	);

	console.log(
		"💀 Descriptor contract at:",
		"\t",
		deathClockDescriptor.address
	);
	console.log(
		`npx hardhat verify --network ${network.name} ${deathClockDescriptor.address} "${webAppUrl}" "${previewUrl}"`
	);

	// DO THIS MANUALLY INSTEAD
	// await hre.run("verify:verify", {
	//     address: deathClock.address,
	//     network: network.name,
	//     constructorArguments: [deathClockSigner, deathClockDescriptor.address],
	// });

	// await hre.run("verify:verify", {
	//   address: remnants,
	//   network: network.name,
	//   constructorArguments: [deathClock.address],
	// });

	// await hre.run("verify:verify", {
	//     address: deathClockDescriptor.address,
	//     network: network.name,
	//     constructorArguments: [webAppUrl, previewUrl],
	// });
}

export default async function deployDeathClock(
	network,
	deathClockSigner,
	webAppUrl,
	previewUrl,
	isTest
) {
	const DeathClockDescriptor = await ethers.getContractFactory(
		"DeathClockDesciptor"
	);
	const deathClockDescriptor: DeathClockDesciptor =
		await DeathClockDescriptor.deploy(webAppUrl, previewUrl);
	await deathClockDescriptor.deployed();

	const params = getTokenParams();
	await setChunks(deathClockDescriptor.setTokenParams, params);

	const DeathClock = await ethers.getContractFactory("DeathClock");
	const deathClock: DeathClock = await DeathClock.deploy(
		deathClockSigner,
		deathClockDescriptor.address
	);
	await deathClock.deployed();
	const remnants = await deathClock.remnantContract();
	if (!isTest)
		verify(
			network,
			deathClockSigner,
			webAppUrl,
			previewUrl,
			deathClockDescriptor,
			deathClock,
			remnants
		);
	return deathClock;
}
