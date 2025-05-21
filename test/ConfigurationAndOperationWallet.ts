import { expect } from "chai";
import { ethers } from "hardhat";
import { ContractTransactionReceipt, LogDescription } from "ethers";
import { Wallet, WalletFactory } from "../typechain-types";
import { ERC20Test, ERC721Test, ERC1155Test } from "../typechain-types";
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

    let token1: ERC20Test
    let token2: ERC721Test
    let token3: ERC1155Test

    let ownerDeployerAccount: HardhatEthersSigner;
    let ownerFactory: HardhatEthersSigner;

    let ownerAccount1_num1: HardhatEthersSigner;
    let ownerAccount1_num2: HardhatEthersSigner;
    let ownerAccount1_num3: HardhatEthersSigner;

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

            dummyGasToken,
            dummyGasManager,
            dummyEntryPoint, 

            nonOwnerAccount, 
        ] = accounts;

        const ERC20Test = await ethers.getContractFactory("ERC20Test");
        token1 = await ERC20Test.connect(ownerDeployerAccount).deploy(ownerDeployerAccount.address);

        const ERC721Test = await ethers.getContractFactory("ERC721Test");
        token2 = await ERC721Test.connect(ownerDeployerAccount).deploy(ownerDeployerAccount.address);
        
        const ERC1155Test = await ethers.getContractFactory("ERC1155Test");
        token3 = await ERC1155Test.connect(ownerDeployerAccount).deploy(ownerDeployerAccount.address);

        // Deploy implementation contract for Wallet
        const WalletFactoryImplementation = await ethers.getContractFactory("Wallet");
        implementationWallet = await WalletFactoryImplementation.connect(ownerDeployerAccount).deploy();

        // Deploy WalletFactory contract
        const WalletFactoryFactory = await ethers.getContractFactory("WalletFactory");
        walletFactory = await WalletFactoryFactory.connect(ownerFactory).deploy(await implementationWallet.getAddress());

        // generate wallet
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

        //fill ether
        await ownerAccount1_num1.sendTransaction({
            to: wallet1.getAddress(),
            value: ethers.parseEther("5"),
        });

        //fill erc20
        await token1.connect(ownerDeployerAccount).mint(await wallet1.getAddress(), ethers.parseEther("1000"))

        //fill erc721
        await token2.connect(ownerDeployerAccount).safeMint(await wallet1.getAddress())

        //fill erc1155
        await token3.connect(ownerDeployerAccount).mint(await wallet1.getAddress(), 1, ethers.parseEther("2000"), "0x00")
        await token3.connect(ownerDeployerAccount).mintBatch(await wallet1.getAddress(), [2,3], [ethers.parseEther("2000"), ethers.parseEther("2000")], "0x00")
    })

    describe("test pausable function part", async function () {
        it("can't set pause by not owner", async function () {
            await expect(
                wallet1.connect(nonOwnerAccount).setPause()
            ).to.be.revertedWith("Not owner or wallet");
        })
        it("can set pause", async function () {
            await wallet1.connect(ownerAccount1_num1).setPause()
            const result = await wallet1.paused();
            expect(result).to.equal(true);
        })
        it("can set unpause", async function () {
            await wallet1.connect(ownerAccount1_num1).setPause()
            const result = await wallet1.paused();
            expect(result).to.equal(false);
        })

    })

    describe("test initialize function part", async function (){
        it("can't reinitialize", async function () {
            await expect(
                wallet1.connect(ownerAccount1_num1).initialize(
                    [ownerAccount1_num1, ownerAccount1_num2, ownerAccount1_num3],
                    dummyGasToken.address,
                    dummyGasManager.address,
                    dummyEntryPoint.address,
                    "2"
                )
            ).to.be.revertedWithCustomError(wallet1, "InvalidInitialization()");
        })
    })

    describe("test add owner function part", async function (){
        it("can't add owner with unauthorized sender", async function () {
            await expect(
                wallet1.connect(nonOwnerAccount).addOwner(
                    nonOwnerAccount
                )
            ).to.be.revertedWith("Not owner or wallet");
        })
        it("can't add owner with zero address", async function () {
            await expect(
                wallet1.connect(ownerAccount1_num1).addOwner(
                    ethers.ZeroAddress
                )
            ).to.be.revertedWith("Invalid address");
        })
        it("can't add owner with already owner", async function () {
            await expect(
                wallet1.connect(ownerAccount1_num1).addOwner(
                    ownerAccount1_num2
                )
            ).to.be.revertedWith("Already an owner");
        })
        it("can't add owner while paused", async function () {
            await wallet1.connect(ownerAccount1_num1).setPause()
            await expect(
                wallet1.connect(ownerAccount1_num1).addOwner(
                    nonOwnerAccount
                )
            ).to.be.revertedWithCustomError(wallet1, 'EnforcedPause()');
            await wallet1.connect(ownerAccount1_num1).setPause()
        })
        it("can add owner", async function () {
            await wallet1.connect(ownerAccount1_num1).addOwner(
                nonOwnerAccount
            )
            expect(await wallet1.isOwnerOfWallet(nonOwnerAccount.address)).to.equal(true)
            wallet1.connect(ownerAccount1_num1).removeOwner(
                nonOwnerAccount
            )
        })

    })

    describe("test remove owner function part", async function (){
        it("can't remove owner with unauthorized sender", async function () {
            await expect(
                wallet1.connect(nonOwnerAccount).removeOwner(
                    nonOwnerAccount
                )
            ).to.be.revertedWith("Not owner or wallet");
        })
        it("can't remove owner with already removed", async function () {
            await expect(
                wallet1.connect(ownerAccount1_num1).removeOwner(
                    nonOwnerAccount
                )
            ).to.be.revertedWith( "Not an owner");
        })
        it("can't remove owner while paused", async function () {
            await wallet1.connect(ownerAccount1_num1).setPause()
            await expect(
                wallet1.connect(ownerAccount1_num1).removeOwner(
                    nonOwnerAccount
                )
            ).to.be.revertedWithCustomError(wallet1, 'EnforcedPause()');
            await wallet1.connect(ownerAccount1_num1).setPause()
        })
        it("can remove owner", async function () {
            await wallet1.connect(ownerAccount1_num1).removeOwner(
                ownerAccount1_num2
            )
            expect(await wallet1.isOwnerOfWallet(ownerAccount1_num2.address)).to.equal(false)
            wallet1.connect(ownerAccount1_num1).addOwner(
                ownerAccount1_num2
            )
        })
    })

    describe("test set for wallet operation function part", async function (){
        it("can't send ether with unauthorized sender", async function () {
            await expect(
                wallet1.connect(nonOwnerAccount).sendEther(
                    nonOwnerAccount.address,
                    ethers.parseEther("1"),
                  )
            ).to.be.revertedWith("Not owner or wallet");
        })
        it("can send ether from wallet", async function () {
            const initialBalance = await ethers.provider.getBalance(nonOwnerAccount.address);
        
            // Kirim 1 ETH dari wallet ke nonOwner
            await wallet1.connect(ownerAccount1_num1).sendEther(
              nonOwnerAccount.address,
              ethers.parseEther("1"),
            );
        
            const finalBalance = await ethers.provider.getBalance(nonOwnerAccount.address);
        
            expect(finalBalance - initialBalance).to.equal(ethers.parseEther("1"));
        });


        it("can't send erc20 with unauthorized sender", async function () {
            await expect(
                wallet1.connect(nonOwnerAccount).transferERC20(
                    await token1.getAddress(),
                    nonOwnerAccount.address,
                    ethers.parseEther("500"),
                  )
            ).to.be.revertedWith("Not owner or wallet");
        })
        it("can send erc20 from wallet", async function () {
            const initialBalance = await token1.balanceOf(nonOwnerAccount.address);
        
            await wallet1.connect(ownerAccount1_num1).transferERC20(
                await token1.getAddress(),
                nonOwnerAccount.address,
                ethers.parseEther("500"),
            );
        
            const finalBalance = await token1.balanceOf(nonOwnerAccount.address);
        
            expect(finalBalance - initialBalance).to.equal(ethers.parseEther("500"));
        });

        it("can't send erc721 with unauthorized sender", async function () {
            await expect(
                wallet1.connect(nonOwnerAccount).transferERC721(
                    await token2.getAddress(),
                    1,
                    nonOwnerAccount.address,
                  )
            ).to.be.revertedWith("Not owner or wallet");
        })
        it("can send erc721 from wallet", async function () {
            expect(ethers.getAddress(await token2.ownerOf(0))).to.equal(ethers.getAddress(await wallet1.getAddress()));
            await wallet1.connect(ownerAccount1_num1).transferERC721(
                await token2.getAddress(),
                0,
                nonOwnerAccount.address,
            );
            expect(ethers.getAddress(await token2.ownerOf(0))).to.equal(ethers.getAddress(nonOwnerAccount.address));
        });


        it("can't send erc1155 with unauthorized sender", async function () {
            await expect(
                wallet1.connect(nonOwnerAccount).transferERC1155(
                    await token3.getAddress(),
                    1,
                    ethers.parseEther("1000"),
                    nonOwnerAccount.address,
                    "0x00"
                  )
            ).to.be.revertedWith("Not owner or wallet");
        })
        it("can send erc1155 from wallet", async function () {
            const initialBalance = await token3.balanceOf(nonOwnerAccount.address, 1);
        
            await wallet1.connect(ownerAccount1_num1).transferERC1155(
                await token3.getAddress(),
                1,
                ethers.parseEther("1000"),
                nonOwnerAccount.address,
                "0x00"
            );
        
            const finalBalance = await token3.balanceOf(nonOwnerAccount.address, 1);
        
            expect(finalBalance - initialBalance).to.equal(ethers.parseEther("1000"));
        });
    })

    describe("test set for support interface function part", async function (){
        it("should return true for IERC721Receiver interfaceId", async function () {
            const IERC721_ID = "0x150b7a02"; // type(IERC721Receiver).interfaceId
            const result = await wallet1.supportsInterface(IERC721_ID);
            expect(result).to.be.true;
          });
        
          it("should return true for IERC1155Receiver interfaceId", async function () {
            const IERC1155_ID = "0x4e2312e0"; // type(IERC1155Receiver).interfaceId
            const result = await wallet1.supportsInterface(IERC1155_ID);
            expect(result).to.be.true;
          });
        
          it("should return false for random interfaceId", async function () {
            const randomInterfaceId = "0x12345678";
            const result = await wallet1.supportsInterface(randomInterfaceId);
            expect(result).to.be.false;
          });
    })

    describe("test set for upgradeable part", async function (){
        it("can't set version with unauthorized sender", async function () {
            await expect(
                wallet1.connect(nonOwnerAccount).setVersion(
                    "2"
                )
            ).to.be.revertedWith("Not owner or wallet");
        })

        it("can set version", async function () {
            await wallet1.connect(ownerAccount1_num1).setVersion(
                "2"
            )
            expect(await wallet1.version()).to.equal("2")
        })
    })
})