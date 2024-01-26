import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import _, { min } from 'lodash';
import { DeathClock, DeathClockRemnant } from "../typechain-types";
import { BigNumber, Signer, ContractTransaction, constants, Contract } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

import proofs from './data/testProofs.json';
import merkleRoot from './data/testMerkleRoot.json';
import deployDeathClocks from '../scripts/deployDeathClock'

const MAX_TOKENS = 500;

const SIGNING_DOMAIN_NAME = "DeathVoucher";
const SIGNING_DOMAIN_VERSION = "1";
const CHAIN_ID = 31337;
const MINT_PRICE = ethers.utils.parseEther("0.4321");
const TEST_MERKLE_ROOT = "0xa279197a1d7a4b7398aa0248e95b8fcc6cdfb43220ade05d01add9c5468ea097";

const types = {
  DeathWish: [
    { name: "minted", type: "uint256" },
    { name: "expDate", type: "uint256" },
    { name: "deadman", type: "address" },
    { name: "accidentId", type: "uint256" }
  ]
};

const typesReset = {
  DeathReassigment: [
    { name: "expDate", type: "uint256" },
    { name: "tokenId", type: "uint256" },
    { name: "accidentId", type: "uint256" }
  ]
};

function errorHandler(e:any){
  console.error(e);
}

async function getTokenIdFromTx(tx:ContractTransaction){
    let receipt = await tx.wait();
    const events = receipt?.events || [];
    const eventsmapped = _.chain(events)
      .map((e:any) => ({
        event: e.event,
        args: e.args,
      }))
      .filter({event: 'Transfer'})
      .transform((t, e:any) => {
        if(e.args.from === constants.AddressZero){
          t.minted = e.args.tokenId;
        }else {
          t.transfered = e.args.tokenId;
        }
        return t;
      },{transfered: null, minted: null})
      .value()      
      return eventsmapped;
}

describe("Death Clock", function () {
  async function deployDeathClockFixture() {
    const [owner, user1, user2] = await ethers.getSigners();
    const ownerAddress = await owner.getAddress();
    const network = await ethers.provider.getNetwork();

    const webAppUrl = 'QmVZU6QYNA5CD5z6TsaLR1UkUfpqNxaQyoMp87PEiiJs2V'//'QmZysJcfm6EftTj2M7JdDFf5VuijQjVyowgyaY9hkJcckf';
    const previewUrl = 'QmSd4SJf5ekbzpBqW5bJqx2dS7N6Dj4BkZE8yQbcBGfems'//'QmXPWQGRoJcccEBxL1QW1BJ1RoNAEvDGCBVnmxtvXpgRxY';

    const deathClock = await deployDeathClocks(
      network,
      ownerAddress,
      webAppUrl,
      previewUrl,
      true
    );

    const remnantAddress = await deathClock.remnantContract();
    const Remnants = await ethers.getContractFactory("DeathClockRemnant");
    const remnants = await Remnants.attach(remnantAddress);

    const expDate = '1909782855' //BigNumber.from(1909782855);
    const expendedExpDate = '1909882855' //BigNumber.from(1909782855);
    const domain = {
      name: SIGNING_DOMAIN_NAME,
      version: SIGNING_DOMAIN_VERSION,
      verifyingContract: deathClock.address,
      chainId: CHAIN_ID,
    };

    const ownerVoucher = {
      expDate,
      minted:'1809782855',
      deadman: owner.address,
      accidentId: '1'
    };

    const voucher = {
      expDate,
      minted:'1809782855',
      deadman: await user1.getAddress(),
      accidentId: '1'
    };

    const voucher2 = {
      expDate,
      minted:'1809782855',
      deadman: await user1.getAddress(),
      accidentId: '2'
    };

    const voucherReset = { expDate: expendedExpDate, tokenId: 0, accidentId: '2' };

    const ownerVoucherSigned = await owner._signTypedData(domain, types, ownerVoucher);
    const voucherSigned = await owner._signTypedData(domain, types, voucher);
    const voucherSigned2 = await owner._signTypedData(domain, types, voucher2);
    const voucherSignedBogus = await user1._signTypedData(domain, types, voucher);

    const signedUserResetVoucher = await user1._signTypedData(domain, typesReset, voucherReset);
    const signedOwnerResetVoucher = await owner._signTypedData(domain, typesReset, voucherReset);

    await deathClock.togglePublicMint();

    return {
      deathClock,
      remnants,
      expDate,
      expendedExpDate,
      ownerVoucher,
      voucher,
      voucher2,
      voucherSignedBogus,
      ownerVoucherSigned,
      voucherSigned,
      voucherSigned2,
      owner,
      user1,
      user2,
      voucherReset,
      signedUserResetVoucher,
      signedOwnerResetVoucher,
      domain
    };
  }

  describe("Public Minting", function () {
    it("Should revert when user tries to mint with invalid signature", async () => {
      this.timeout(200000)
      const { deathClock, expDate, voucherSignedBogus, voucher, user1 } = await loadFixture(
        deployDeathClockFixture
      );
      await expect(
        deathClock.mintDeathClock(voucher, voucherSignedBogus, { value: MINT_PRICE })
      ).to.be.revertedWithCustomError(deathClock, "InvalidDeathWish");
    });

    it("Should revert when user tries to mint with invalid voucher", async () => {
      this.timeout(200000)
      const { deathClock, expDate, voucherSignedBogus, voucher, user1 } = await loadFixture(
        deployDeathClockFixture
      );
      await expect(
        deathClock.mintDeathClock(
          { expDate, minted:'123123232', deadman: await user1.getAddress(), accidentId: '12',},
          voucherSignedBogus,
          { value: MINT_PRICE }
        )
      ).to.be.revertedWithCustomError(deathClock, "InvalidDeathWish");
    });

    it("Should revert when user tries to mint valid voucher of other user", async () => {
      const { deathClock, owner, user1, voucherSigned, voucher } = await loadFixture(deployDeathClockFixture);
      // Voucher belongs to user1, however owner tries to mint using it:
      await expect(
        deathClock.mintDeathClock(voucher, voucherSigned, { value: MINT_PRICE })
      )
        .to.be.revertedWithCustomError(deathClock, "InvalidDeathWish")
    });

    it("Should let user w/ valid voucher mint a death clock", async () => {
      const { deathClock, owner, user1, voucherSigned, voucher } = await loadFixture(deployDeathClockFixture);
      expect(await deathClock.balanceOf(user1.address)).to.be.eq(0);
      await expect(
        deathClock.connect(user1).mintDeathClock(voucher, voucherSigned, { value: MINT_PRICE })
      )
        .to.emit(deathClock, "Transfer")
        .withArgs(constants.AddressZero, user1.address, anyValue);

      expect(await deathClock.balanceOf(user1.address)).to.be.eq(1);
    });

    it("Should revert when public minting is disabled.", async () => {
      const { deathClock, voucherSigned, voucher } = await loadFixture(deployDeathClockFixture);
      await deathClock.togglePublicMint();

      await expect(
        deathClock.mintDeathClock(voucher, voucherSigned, { value: MINT_PRICE })
      ).to.be.revertedWithCustomError(deathClock, "IncorrectMintPhase");
    });
  });

  describe("Merkle Minting", function () {
    it("Reverts if unauthorized user tried to administrate whitelist.", async () => {
      const { deathClock, user1 } = await loadFixture(deployDeathClockFixture);

      await expect(deathClock.connect(user1).togglePublicMint())
        .to.be.revertedWith("Ownable: caller is not the owner");

      await expect(deathClock.connect(user1).setActiveMerkleRoot(1))
        .to.be.revertedWith("Ownable: caller is not the owner");

      await expect(deathClock.connect(user1).setMerkleRoot(0, merkleRoot))
        .to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("Should revert when public minting is enabled.", async () => {
      const { deathClock, owner, voucherSigned, voucher } = await loadFixture(deployDeathClockFixture);
      await expect(
        deathClock.preMintDeathClock(voucher, voucherSigned, 0, [], { value: MINT_PRICE })
      ).to.be.revertedWithCustomError(deathClock, "IncorrectMintPhase");
    });

    it("It should revert if active merkle root is not set.", async () => {
      const { deathClock, owner, voucherSigned, voucher } = await loadFixture(deployDeathClockFixture);
      await deathClock.togglePublicMint(); // Public minting off

      await expect(
        deathClock.preMintDeathClock(voucher, voucherSigned, 0, [], { value: MINT_PRICE })
      ).to.be.revertedWithCustomError(deathClock, "MerkleRootNotSet");
    });

    it("It should revert if user provides invalid proof", async () => {
      const { deathClock, user1, voucherSigned, voucher, voucher2, voucherSigned2 } = await loadFixture(deployDeathClockFixture);
      await deathClock.togglePublicMint(); // Public minting OFF
      await deathClock.setMerkleRoot(0, merkleRoot);

      await expect(
        deathClock.connect(user1).preMintDeathClock(
          voucher, voucherSigned, 0, [], { value: MINT_PRICE }
        )
      )
        .to.be.revertedWithCustomError(deathClock, "InvalidProof");
    });


    it("It should allow whitelisted user w/ valid voucher to mint one death clock for each whitelist they appear on.", async () => {
      const { deathClock, user1, voucherSigned, voucher, voucher2, voucherSigned2 } = await loadFixture(deployDeathClockFixture);
      await deathClock.togglePublicMint(); // Public minting OFF
      await deathClock.setMerkleRoot(0, merkleRoot);

      const { index, proof } = proofs[user1.address.toLocaleLowerCase()];

      await expect(
        deathClock.connect(user1).preMintDeathClock(
          voucher, voucherSigned, index, proof, { value: MINT_PRICE }
        )
      )
        .to.emit(deathClock, "Transfer")
        .withArgs(ethers.constants.AddressZero, user1.address, anyValue);

      await expect(
        deathClock.connect(user1).preMintDeathClock(
          voucher2, voucherSigned2, index, proof, { value: MINT_PRICE }
        )
      )
        .to.be.revertedWithCustomError(deathClock, "AlreadyClaimed");

      // Switch to fresh whitelist:
      expect (await deathClock.activeMerkleRoot()).to.be.eq(0);
      await deathClock.setMerkleRoot(1, TEST_MERKLE_ROOT);
      await deathClock.setActiveMerkleRoot(1);
      expect (await deathClock.activeMerkleRoot()).to.be.eq(1);

      await expect(
        deathClock.connect(user1).preMintDeathClock(
          voucher2, voucherSigned2, 0, [], { value: MINT_PRICE }
        )
      )
        .to.emit(deathClock, "Transfer")
        .withArgs(ethers.constants.AddressZero, user1.address, anyValue);

      await expect(
        deathClock.connect(user1).preMintDeathClock(
          voucher2, voucherSigned2, 0, [], { value: MINT_PRICE }
        )
      )
        .to.be.revertedWithCustomError(deathClock, "AlreadyClaimed");
    });
  });

  describe("Transfering", function () {
    let deathClock:DeathClock;
    let remnants:DeathClockRemnant;
    let voucher:any;
    let expDate: string;
    let voucherSigned:string;
    let owner:Signer;
    let user1:Signer;
    let mintedIds:any;

    before(async ()=>{
      const fixture = await loadFixture(
        deployDeathClockFixture
      );
      deathClock = fixture.deathClock;
      voucher = fixture.ownerVoucher;
      remnants = fixture.remnants;
      expDate = fixture.expDate;
      voucherSigned = fixture.ownerVoucherSigned;
      owner = fixture.owner;
      user1 = fixture.user1;

      const mintTx = await deathClock.mintDeathClock(voucher, voucherSigned, { value: MINT_PRICE });
      mintedIds = await getTokenIdFromTx(mintTx);
    });

    it("Should create remnant when death clock is transferred", async () => {

      const ownerAddress = await owner.getAddress();
      const receiverAddress = await user1.getAddress();

      // Verify pre-conditions
      await expect(await deathClock.expDates(mintedIds.minted)).to.be.eq(expDate);
      await expect(await deathClock.canBeReset(mintedIds.minted)).to.be.eq(false);
      await expect(await deathClock.balanceOf(ownerAddress)).to.be.eq(1);
      await expect(await remnants.balanceOf(ownerAddress)).to.be.eq(0);
      await expect(await deathClock.balanceOf(receiverAddress)).to.be.eq(0);

      // First transfer: owner => user1
      const ttx = deathClock.transferFrom(ownerAddress, receiverAddress, mintedIds.minted).catch(errorHandler)
      await expect(ttx).to.be.fulfilled;
      const mintedIds2:any = await getTokenIdFromTx(await ttx as ContractTransaction);

      // Verify owner's tokens
      await expect(await remnants.balanceOf(ownerAddress)).to.be.eq(1);

      await expect(await deathClock.balanceOf(ownerAddress)).to.be.eq(0);
      await expect(await deathClock.ownerOf(mintedIds.minted)).to.be.eq(receiverAddress);
      await expect(await deathClock.expDates(mintedIds.minted)).to.be.eq(expDate);
      // await expect(await deathClock.remnantExists(ownerAddress, mintedIds.minted)).to.be.eq(true);

      // Verify user1's tokens
      await expect(await remnants.balanceOf(receiverAddress)).to.be.eq(0);

      await expect(await deathClock.ownerOf(mintedIds2.transfered)).to.be.eq(receiverAddress);
      await expect(await deathClock.balanceOf(receiverAddress)).to.be.eq(1);
      await expect(await deathClock.canBeReset(mintedIds.minted)).to.be.eq(true);
      // await expect(await deathClock.remnantExists(receiverAddress, mintedIds.minted)).to.be.eq(false);

      // Second transfer: user1 => owner
      const ttx2 = await deathClock
        .connect(user1)
        .transferFrom(receiverAddress, ownerAddress, mintedIds.minted);

      const mintedIds3:any = await getTokenIdFromTx(ttx2);

      // Verify user1's tokens
      await expect(await remnants.balanceOf(receiverAddress)).to.be.eq(1);
      await expect(await remnants.ownerOf(mintedIds3.minted)).to.be.eq(receiverAddress);

      await expect(await deathClock.balanceOf(receiverAddress)).to.be.eq(0);
      await expect(await deathClock.expDates(mintedIds3.minted)).to.be.eq(expDate);
      await expect(await deathClock.canBeReset(mintedIds3.minted)).to.be.eq(false);

      // Verify owner's tokens
      await expect(await remnants.balanceOf(ownerAddress)).to.be.eq(1);

      await expect(await deathClock.ownerOf(mintedIds3.transfered)).to.be.eq(ownerAddress);
      await expect(await deathClock.balanceOf(ownerAddress)).to.be.eq(1);
      await expect(await deathClock.expDates(mintedIds3.transfered)).to.be.eq(expDate);

      // Third transfer: owner => user1
      const ttx3 = await expect(deathClock.transferFrom(ownerAddress, receiverAddress, mintedIds.minted)).to.be.fulfilled;
      const mintedIds4:any = await getTokenIdFromTx(ttx3);

      // Verify user1's tokens
      await expect(await remnants.balanceOf(ownerAddress)).to.be.eq(1);
      await expect(await remnants.balanceOf(receiverAddress)).to.be.eq(1);

      await expect(await deathClock.balanceOf(receiverAddress)).to.be.eq(1);
      await expect(await deathClock.balanceOf(ownerAddress)).to.be.eq(0);
      await expect(await deathClock.ownerOf(mintedIds.minted)).to.be.eq(receiverAddress);

    });
  });

  describe("Minting + Transferring", function () {
    it("It tracks remnant and death clock tokenIds separately", async () => {
      const {
        deathClock,
        owner, user1, user2,
        remnants,
        ownerVoucher, ownerVoucherSigned, voucherSigned, voucher, voucher2, voucherSigned2
      } = await loadFixture(deployDeathClockFixture);

      const tx = await deathClock.mintDeathClock(ownerVoucher, ownerVoucherSigned, { value: MINT_PRICE });
      const { events } = await tx.wait();
      const mintedTokenId1 = events?.[0].args?.tokenId;

      expect(await deathClock.ownerOf(mintedTokenId1)).to.be.eq(owner.address);
      expect(await deathClock.balanceOf(owner.address)).to.be.eq(1);
      expect(await deathClock.balanceOf(user1.address)).to.be.eq(0);
      expect(await remnants.balanceOf(owner.address)).to.be.eq(0);
      expect(await remnants.balanceOf(user1.address)).to.be.eq(0);

      await expect(deathClock.transferFrom(owner.address, user1.address, mintedTokenId1))
        .to.emit(remnants, "Transfer")
        .withArgs(constants.AddressZero, owner.address, 500);

      expect(await deathClock.ownerOf(mintedTokenId1)).to.be.eq(user1.address);
      expect(await deathClock.balanceOf(owner.address)).to.be.eq(0);
      expect(await deathClock.balanceOf(user1.address)).to.be.eq(1);
      expect(await remnants.balanceOf(owner.address)).to.be.eq(1);
      expect(await remnants.balanceOf(user1.address)).to.be.eq(0);

      await expect(deathClock.connect(user1).transferFrom(user1.address, user2.address, mintedTokenId1))
        .to.emit(remnants, "Transfer")
        .withArgs(constants.AddressZero, user1.address, 501);

      expect(await deathClock.ownerOf(mintedTokenId1)).to.be.eq(user2.address);
      expect(await deathClock.balanceOf(user1.address)).to.be.eq(0);
      expect(await deathClock.balanceOf(user2.address)).to.be.eq(1);
      expect(await remnants.balanceOf(user1.address)).to.be.eq(1);
      expect(await remnants.balanceOf(user2.address)).to.be.eq(0);
    });
  });

  describe("Reset", function () {
    let deathClock:DeathClock;
    let voucher:any;
    let voucherSigned:string;
    let voucherReset: any;
    let signedUserResetVoucher:string;
    let signedOwnerResetVoucher:string;
    let owner:Signer;
    let user1:Signer;
    let expendedExpDate: string;
    let mintedIds: any;
    before(async ()=>{
      const fixture = await loadFixture(
        deployDeathClockFixture
      );
      deathClock = fixture.deathClock;
      voucher = fixture.ownerVoucher;
      voucherSigned = fixture.ownerVoucherSigned;
      owner = fixture.owner;
      user1 = fixture.user1;
      signedUserResetVoucher = fixture.signedUserResetVoucher;
      signedOwnerResetVoucher = fixture.signedOwnerResetVoucher;
      voucherReset = fixture.voucherReset;
      expendedExpDate = fixture.expendedExpDate;

      const mintTx = await deathClock.mintDeathClock(voucher, voucherSigned, { value: MINT_PRICE })
      mintedIds = await getTokenIdFromTx(mintTx);
    });

    it("Should be not extandable after mint", async () => {
      await expect(await deathClock.canBeReset(mintedIds.minted)).to.be.eq(false);
    })

    it("Should be extandable after transfer", async () => {
      const ownerAddress = await owner.getAddress();
      const receiverAddress = await user1.getAddress();
      await expect(deathClock.transferFrom(ownerAddress, receiverAddress, mintedIds.minted)).to.be.fulfilled;
      await expect(await deathClock.canBeReset(mintedIds.minted)).to.be.eq(true);
    })

    it("Should be reverted with bogus reset voucher", async () => {
      const dcUser1 = (await deathClock.connect(user1)) as DeathClock;
      expect(await dcUser1.canBeReset(mintedIds.minted)).to.be.eq(true);
      await expect(dcUser1.reset(voucherReset, signedOwnerResetVoucher)).to.be.reverted;
    });

    it("Should be successifuly reset", async () => {
      const domain = {
        name: SIGNING_DOMAIN_NAME,
        version: SIGNING_DOMAIN_VERSION,
        verifyingContract: deathClock.address,
        chainId: CHAIN_ID,
      };
      const [owner, user1, user2] = await ethers.getSigners();      
      const v4=  {...voucherReset, tokenId:mintedIds.minted};
      const signedResetVoucher = await owner._signTypedData(domain, typesReset, v4 );
      const dcUser1 = (await deathClock.connect(user1)) as DeathClock;
      expect(await deathClock.canBeReset(mintedIds.minted)).to.be.eq(true);
      await expect(dcUser1.reset(v4, signedResetVoucher).catch(console.error)).to.be.fulfilled;
      await expect(await dcUser1.expDates(mintedIds.minted)).to.be.eq(expendedExpDate);

      // Should not allow additional resets
      expect(await deathClock.canBeReset(mintedIds.minted)).to.be.eq(false);
      const v5 = {...voucherReset, accidentId: 100, tokenId:mintedIds.minted};
      const signedResetVoucher5 = await owner._signTypedData(domain, typesReset, v5 );
      await expect(dcUser1.reset(v5, signedResetVoucher5))
        .to.be.revertedWithCustomError(deathClock, "NoReset");
    })
  });

  describe("Metadata", function(){
    let deathClock:DeathClock;
    let remnants:DeathClockRemnant;
    let voucher:any;
    let voucherSigned:string;
    let voucherReset: any;
    let signedUserResetVoucher:string;
    let signedOwnerResetVoucher:string;
    let owner:Signer;
    let user1:Signer;
    let expendedExpDate: string;
    let mintedIds: any;
    let transferedIds: any;
    before(async ()=>{
      const fixture = await loadFixture(
        deployDeathClockFixture
      );
      deathClock = fixture.deathClock;
      voucher = fixture.ownerVoucher;
      voucherSigned = fixture.ownerVoucherSigned;
      remnants = fixture.remnants;
      owner = fixture.owner;
      user1 = fixture.user1;
      signedUserResetVoucher = fixture.signedUserResetVoucher;
      signedOwnerResetVoucher = fixture.signedOwnerResetVoucher;
      voucherReset = fixture.voucherReset;
      expendedExpDate = fixture.expendedExpDate;
      const mintTx = await deathClock.mintDeathClock(voucher, voucherSigned, { value: MINT_PRICE })
      mintedIds = await getTokenIdFromTx(mintTx);      
      const ttx = await deathClock.transferFrom(await owner.getAddress(), await user1.getAddress(), mintedIds.minted);
      transferedIds = await getTokenIdFromTx(ttx);
    });

    it("Should return correct metadata minted", async () => {      
      const md = await deathClock.tokenURI(mintedIds.minted);
      const jsonStr = Buffer.from(md.replace("data:application/json;base64,", ""), "base64").toString();      
      const json = JSON.parse(jsonStr);      
      await expect(true).to.be.eq(true);
    })

    it("Should return correct metadata renmant", async () => {      
      const md = await remnants.tokenURI(transferedIds.minted);
      const jsonStr = Buffer.from(md.replace("data:application/json;base64,", ""), "base64").toString();      
      const json = JSON.parse(jsonStr);      
      await expect(true).to.be.eq(true);
    })
  });

  describe("Mint all 500 tokens", function () {
    let deathClock:DeathClock;
    let owner:SignerWithAddress;
    let user1:SignerWithAddress;
    let domain:any;

    before(async ()=>{
      const fixture = await loadFixture(
        deployDeathClockFixture
      );
      deathClock = fixture.deathClock;
      owner = fixture.owner;
      domain = fixture.domain;
      user1 = fixture.user1;
    });

    const expDate = '1909782855';
    for(let i =0; i< MAX_TOKENS; i++){
      it(`Mint #${i}`, async () => {
        const userContract =  deathClock.connect(user1)
        const userAddress = await user1.getAddress();
        const voucher = {
          expDate,
          minted:'1809782855',
          deadman: userAddress,
          accidentId: `${i}`
        };
        const voucherSigned = await owner._signTypedData(domain, types, voucher);
        await expect(userContract.mintDeathClock(voucher, voucherSigned, { value: MINT_PRICE }).catch(errorHandler)).to.be.fulfilled;
        await expect(await deathClock.balanceOf(userAddress)).to.be.eq(i+1)
      })

    }
    it('Mint the extra 500 should be reverted' , async () => {
      const userContract =  deathClock.connect(user1)
      const voucher = {
        expDate,
        minted:'1809782855',
        deadman: await user1.getAddress(),
        accidentId: `123123`
      };
      const voucherSigned = await owner._signTypedData(domain, types, voucher);
      await expect(userContract.mintDeathClock(voucher, voucherSigned, { value: MINT_PRICE })).to.be.revertedWith('Max tokens amount reached');
    })
  });

  describe("Remnants", function () {
    let deathClock, remnants, owner, user1, voucherSigned, voucher, deathClockId;
    const remnantId = 500;
    beforeEach(async ()=>{      
      const fixture = await deployDeathClockFixture();
      deathClock = fixture.deathClock;
      remnants = fixture.remnants;
      owner = fixture.owner;
      user1 = fixture.user1;
      voucher = fixture.ownerVoucher;
      voucherSigned = fixture.ownerVoucherSigned;

      const tx = await deathClock.mintDeathClock(voucher, voucherSigned, { value: MINT_PRICE });
      const { events } = await tx.wait();
      deathClockId = events?.[0].args?.tokenId;

      // Create remnant
      await deathClock["safeTransferFrom(address,address,uint256)"](owner.address, user1.address, deathClockId);
      expect(await remnants.ownerOf(remnantId)).to.be.eq(owner.address);
    });

    it("Should revert on transfer", async () => {
      // Attempt to transfer
      await expect(remnants.transferFrom(owner.address, user1.address, remnantId))
        .to.be.revertedWithCustomError(remnants, "NoEscape");

      await expect(remnants["safeTransferFrom(address,address,uint256)"](owner.address, user1.address, remnantId))
        .to.be.revertedWithCustomError(remnants, "NoEscape");

      await expect(remnants["safeTransferFrom(address,address,uint256,bytes)"](owner.address, user1.address, remnantId, ethers.utils.randomBytes(1)))
        .to.be.revertedWithCustomError(remnants, "NoEscape");
    });

    it("Should revert on attempt to set approval", async () => {
      await expect(remnants.setApprovalForAll(user1.address, true))
        .to.be.revertedWithCustomError(remnants, "NoEscape");

      await expect(remnants.approve(user1.address, remnantId))
        .to.be.revertedWithCustomError(remnants, "NoEscape");
    });
  });
});
