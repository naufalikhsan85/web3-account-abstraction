import { expect } from "chai";
import { ethers } from "hardhat";
import { ContractTransactionReceipt } from "ethers";
import { Wallet, WalletFactory } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import abiDecoder from "abi-decoder-typescript"

function findDeployedWallet(
    receipt: ContractTransactionReceipt,
    contractInterface: any[],
    salt: string
): any | null {
    try {
        let abiData = new abiDecoder
        abiData.addABI(contractInterface as any)
        const logs = abiData
        .decodeLogs(receipt.logs)
        .filter((log: any) =>
          log?.name === "WalletDeployed" &&
          log.events?.some((e: any) => e.name === "salt" && e.value === salt)
        );
        if(logs.length == 0) return null;

        return logs[0].events.reduce((acc, curr) => {
            acc[curr.name] = curr.value;
            return acc;
        }, {} as Record<string, any>);

    } catch (error) {
        console.error(`Error finding logs:`, error);
        return null;
    }
}

describe("Testing Wallet Factory Contract", function () {
    let implementationWallet: Wallet;
    let walletFactory: WalletFactory;
    let accounts: HardhatEthersSigner[];

    let wallet1: Wallet;
    let wallet2: Wallet;
    let wallet3: Wallet;

    let ownerDeployerAccount: HardhatEthersSigner;
    let ownerFactory: HardhatEthersSigner;

    let ownerAccount1_num1: HardhatEthersSigner;
    let ownerAccount1_num2: HardhatEthersSigner;
    let ownerAccount1_num3: HardhatEthersSigner;

    let ownerAccount2_num1: HardhatEthersSigner;
    let ownerAccount2_num2: HardhatEthersSigner;
    let ownerAccount2_num3: HardhatEthersSigner;

    let ownerAccount3_num1: HardhatEthersSigner;
    let ownerAccount3_num2: HardhatEthersSigner;
    let ownerAccount3_num3: HardhatEthersSigner;

    let dummyGasToken: HardhatEthersSigner;
    let dummyGasManager: HardhatEthersSigner;
    let dummyEntryPoint: HardhatEthersSigner;

    let nonOwnerAccount: HardhatEthersSigner;

    before(async function () {
        accounts = await ethers.getSigners();

        [ 
            ownerDeployerAccount, 
            ownerFactory,

            ownerAccount1_num1,
            ownerAccount1_num2,
            ownerAccount1_num3,

            ownerAccount2_num1,
            ownerAccount2_num2,
            ownerAccount2_num3,
        
            ownerAccount3_num1,
            ownerAccount3_num2,
            ownerAccount3_num3,

            dummyGasToken,
            dummyGasManager,
            dummyEntryPoint, 

            nonOwnerAccount, 
        ] = accounts;


        // Deploy implementation contract for Wallet
        const WalletFactoryImplementation = await ethers.getContractFactory("Wallet");
        implementationWallet = await WalletFactoryImplementation.connect(ownerDeployerAccount).deploy();

        // Deploy WalletFactory contract
        const WalletFactoryFactory = await ethers.getContractFactory("WalletFactory");
        walletFactory = await WalletFactoryFactory.connect(ownerFactory).deploy(await implementationWallet.getAddress());
    })

    describe("test pausable function part", async function (){
        it("can't set pause by not owner", async function () {
            await expect(
                walletFactory.connect(ownerDeployerAccount).setPause()
            ).to.be.revertedWithCustomError(walletFactory, "OwnableUnauthorizedAccount");
        })
        it("can set pause", async function () {
            await walletFactory.connect(ownerFactory).setPause()
            const result = await walletFactory.paused();
            expect(result).to.equal(true);
        })
        it("can set unpause", async function () {
            await walletFactory.connect(ownerFactory).setPause()
            const result = await walletFactory.paused();
            expect(result).to.equal(false);
        })
    })

    describe("test constructor part", async function (){
        it("can't deploy with zero address of implementation wallet", async function () {
            const WalletFactoryFactory = await ethers.getContractFactory("WalletFactory");
            await expect(
                WalletFactoryFactory.connect(ownerFactory).deploy(ethers.ZeroAddress)
            ).to.be.revertedWith("Factory: Invalid implementation");
        })
    })

    describe("test generate single wallet function part", async function (){
        it("can't generate with unauthorized sender", async function () {
            let addressFactory = await walletFactory.getAddress()
            let uniqueSalt = ethers.solidityPackedKeccak256(
                ["string", "address", "uint256"],
                ["account1-salt", addressFactory, 1] // atau pakai index dari db
            );
            await expect(
                walletFactory.connect(nonOwnerAccount).deployWallet(
                    [ownerAccount1_num1, ownerAccount1_num2, ownerAccount1_num3],
                    dummyGasToken.address,
                    dummyGasManager.address,
                    dummyEntryPoint.address,
                    uniqueSalt
                )
            ).to.be.revertedWith("msg.sender must be admin");
        })

        it("can't generate while paused", async function () {
            await walletFactory.connect(ownerFactory).setPause()

            let addressFactory = await walletFactory.getAddress()
            let uniqueSalt = ethers.solidityPackedKeccak256(
                ["string", "address", "uint256"],
                ["account1-salt", addressFactory, 1] // atau pakai index dari db
            );
            await expect(
                walletFactory.connect(ownerFactory).deployWallet(
                    [ownerAccount1_num1, ownerAccount1_num2, ownerAccount1_num3],
                    dummyGasToken.address,
                    dummyGasManager.address,
                    dummyEntryPoint.address,
                    uniqueSalt
                )
            ).to.be.revertedWithCustomError(walletFactory, 'EnforcedPause()');
            await walletFactory.connect(ownerFactory).setPause()
        })

        it("can't generate with invalid initialize", async function () {
            let addressFactory = await walletFactory.getAddress()
            let uniqueSalt = ethers.solidityPackedKeccak256(
                ["string", "address", "uint256"],
                ["account1-salt", addressFactory, 1] // atau pakai index dari db
            );
            await expect(
                walletFactory.connect(ownerFactory).deployWallet(
                    [],
                    dummyGasToken.address,
                    dummyGasManager.address,
                    dummyEntryPoint.address,
                    uniqueSalt
                )
            ).to.be.revertedWith("At least one owner required")

            await expect(
                walletFactory.connect(ownerFactory).deployWallet(
                    [ownerAccount1_num1, ownerAccount1_num2, ownerAccount1_num3],
                    dummyGasToken.address,
                    dummyGasManager.address,
                    ethers.ZeroAddress,
                    uniqueSalt
                )
            ).to.be.revertedWith("Invalid entryPoint")

            await expect(
                walletFactory.connect(ownerFactory).deployWallet(
                    [ownerAccount1_num1, ownerAccount1_num2, ethers.ZeroAddress],
                    dummyGasToken.address,
                    dummyGasManager.address,
                    dummyEntryPoint.address,
                    uniqueSalt
                )
            ).to.be.revertedWith("Invalid owner address")
        })

        it("can generate single wallet", async function () {
            let addressFactory = await walletFactory.getAddress()
            let uniqueSalt = ethers.solidityPackedKeccak256(
                ["string", "address", "uint256"],
                ["account1-salt", addressFactory, 1] // atau pakai index dari db
            );

            let tx = await walletFactory.connect(ownerFactory).deployWallet(
                [ownerAccount1_num1, ownerAccount1_num2, ownerAccount1_num3],
                dummyGasToken.address,
                dummyGasManager.address,
                dummyEntryPoint.address,
                uniqueSalt
            )
            const receipt = await tx.wait();

            wallet1 = await ethers.getContractAt(
                "Wallet",  
                (findDeployedWallet(receipt!, walletFactory.interface.fragments as any[], uniqueSalt)).wallet
            )

        })

        it("can't generate with deployed clone address", async function () {
            let addressFactory = await walletFactory.getAddress()
            let uniqueSalt = ethers.solidityPackedKeccak256(
                ["string", "address", "uint256"],
                ["account1-salt", addressFactory, 1] // atau pakai index dari db
            );
            await expect(
                walletFactory.connect(ownerFactory).deployWallet(
                    [ownerAccount1_num1, ownerAccount1_num2, ownerAccount1_num3],
                    dummyGasToken.address,
                    dummyGasManager.address,
                    dummyEntryPoint.address,
                    uniqueSalt
                )
            ).to.be.revertedWith("Factory: Wallet already deployed");
        })
    })

    describe("test generate batch wallet function part", async function (){
        it("can't generate with unauthorized sender", async function () {
            let addressFactory = await walletFactory.getAddress()
            let uniqueSalt = ethers.solidityPackedKeccak256(
                ["string", "address", "uint256"],
                ["account2-salt", addressFactory, 2] // atau pakai index dari db
            );

            let uniqueSalt2 = ethers.solidityPackedKeccak256(
                ["string", "address", "uint256"],
                ["account3-salt", addressFactory, 3] // atau pakai index dari db
            );

            await expect(
                walletFactory.connect(nonOwnerAccount).deployBatchWallets(
                    [
                        [ownerAccount2_num1, ownerAccount2_num2, ownerAccount2_num3],
                        [ownerAccount3_num1, ownerAccount3_num2, ownerAccount3_num3],
                    ],
                    dummyGasToken.address,
                    dummyGasManager.address,
                    dummyEntryPoint.address,
                    [uniqueSalt, uniqueSalt2]
                )
            ).to.be.revertedWith("msg.sender must be admin");
        })

        it("can't generate while paused", async function () {
            await walletFactory.connect(ownerFactory).setPause()

            let addressFactory = await walletFactory.getAddress()
            let uniqueSalt = ethers.solidityPackedKeccak256(
                ["string", "address", "uint256"],
                ["account2-salt", addressFactory, 2] // atau pakai index dari db
            );

            let uniqueSalt2 = ethers.solidityPackedKeccak256(
                ["string", "address", "uint256"],
                ["account3-salt", addressFactory, 3] // atau pakai index dari db
            );
            await expect(
                walletFactory.connect(ownerFactory).deployBatchWallets(
                    [
                        [ownerAccount2_num1, ownerAccount2_num2, ownerAccount2_num3],
                        [ownerAccount3_num1, ownerAccount3_num2, ownerAccount3_num3],
                    ],
                    dummyGasToken.address,
                    dummyGasManager.address,
                    dummyEntryPoint.address,
                    [uniqueSalt, uniqueSalt2]
                )
            ).to.be.revertedWithCustomError(walletFactory, 'EnforcedPause()');
            await walletFactory.connect(ownerFactory).setPause()
        })

        it("can't generate with mismatch length owners and salts", async function () {
            let addressFactory = await walletFactory.getAddress()
            let uniqueSalt = ethers.solidityPackedKeccak256(
                ["string", "address", "uint256"],
                ["account2-salt", addressFactory, 2] // atau pakai index dari db
            );

            await expect(
                walletFactory.connect(ownerFactory).deployBatchWallets(
                    [
                        [ownerAccount2_num1, ownerAccount2_num2, ownerAccount2_num3],
                        [ownerAccount3_num1, ownerAccount3_num2, ownerAccount3_num3],
                    ],
                    dummyGasToken.address,
                    dummyGasManager.address,
                    dummyEntryPoint.address,
                    [uniqueSalt]
                )
            ).to.be.revertedWith("Factory: Length mismatch");
        })

        it("can generate batch wallet", async function () {
            let addressFactory = await walletFactory.getAddress()
            let uniqueSalt = ethers.solidityPackedKeccak256(
                ["string", "address", "uint256"],
                ["account2-salt", addressFactory, 2] // atau pakai index dari db
            );

            let uniqueSalt2 = ethers.solidityPackedKeccak256(
                ["string", "address", "uint256"],
                ["account3-salt", addressFactory, 3] // atau pakai index dari db
            );

            let tx = await walletFactory.connect(ownerFactory).deployBatchWallets(
                [
                    [ownerAccount2_num1, ownerAccount2_num2, ownerAccount2_num3],
                    [ownerAccount3_num1, ownerAccount3_num2, ownerAccount3_num3],
                ],
                dummyGasToken.address,
                dummyGasManager.address,
                dummyEntryPoint.address,
                [uniqueSalt, uniqueSalt2]
            )
            const receipt = await tx.wait();

            wallet2 = await ethers.getContractAt(
                "Wallet",  
                (findDeployedWallet(receipt!, walletFactory.interface.fragments as any[], uniqueSalt)).wallet
            )

            wallet3 = await ethers.getContractAt(
                "Wallet",  
                (findDeployedWallet(receipt!, walletFactory.interface.fragments as any[], uniqueSalt2)).wallet
            )
        })
    })

    describe("test deployed wallet part", async function (){
        it("can get deployed wallet address", async function () {
            expect(await wallet1.getAddress()).to.not.equal(ethers.ZeroAddress)
            expect(await wallet2.getAddress()).to.not.equal(ethers.ZeroAddress)
            expect(await wallet3.getAddress()).to.not.equal(ethers.ZeroAddress)
        })

        it("can get owner of wallet", async function () {
            expect(await wallet1.isOwnerOfWallet(ownerAccount1_num1)).to.equal(true)
            expect(await wallet2.isOwnerOfWallet(ownerAccount2_num2)).to.equal(true)
            expect(await wallet3.isOwnerOfWallet(ownerAccount3_num3)).to.equal(true)

            let owners1 = await wallet1.getOwners()
            let owners2 = await wallet2.getOwners()
            let owners3 = await wallet3.getOwners()

            expect(owners1).to.have.lengthOf(3);
            expect(owners2).to.have.lengthOf(3);
            expect(owners3).to.have.lengthOf(3);

            expect(owners1).to.include(ownerAccount1_num3.address)
            expect(owners2).to.include(ownerAccount2_num3.address)
            expect(owners3).to.include(ownerAccount3_num1.address)
        })
    })

    describe("test set for additional admin", async function (){
        it("can't add new admin by not owner", async function () {
            await expect(
                walletFactory.connect(nonOwnerAccount).addAdmin(nonOwnerAccount)
            ).to.be.revertedWithCustomError(walletFactory, "OwnableUnauthorizedAccount");
        });
    
        it("can add new admin", async function () {
            await walletFactory.connect(ownerFactory).addAdmin(nonOwnerAccount)
            await walletFactory.connect(ownerFactory).addAdmin(nonOwnerAccount)
            let _data = await walletFactory.isAdmin(nonOwnerAccount);
            expect(_data).to.equal(true);
        });
    
        it("can't remove admin by not owner", async function () {
            await expect(
                walletFactory.connect(nonOwnerAccount).removeAdmin(nonOwnerAccount)
            ).to.be.revertedWithCustomError(walletFactory, "OwnableUnauthorizedAccount");
        });
        
        it("can remove admin", async function () {
            await walletFactory.connect(ownerFactory).removeAdmin(nonOwnerAccount)
            await walletFactory.connect(ownerFactory).removeAdmin(nonOwnerAccount)
            let _data = await walletFactory.isAdmin(nonOwnerAccount);
            expect(_data).to.equal(false);
        });

        describe("getAdminCount", function () {
            it("should return the correct number of admins", async function () {
              const count = await walletFactory.getAdminCount();
              expect(count).to.equal(1);
            });
          });
        
          describe("getAdminAt", function () {
            it("should return the correct admin address at index", async function () {
              const addr0 = await walletFactory.getAdminAt(0);
        
              expect([addr0]).to.include(ownerFactory.address)
            });
        
            it("should revert if index is out of bounds", async function () {
              await expect(walletFactory.getAdminAt(1)).to.be.revertedWith("index out of bounds");
            });
          });
        
          describe("getAllAdmins", function () {
            it("should return all admin addresses", async function () {
              const admins = await walletFactory.getAllAdmins();
              expect(admins).to.include.members([ownerFactory.address]);
              expect(admins.length).to.equal(1);
            });
          });
    });

})
  


