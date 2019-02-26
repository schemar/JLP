const { Facilitator: MosaicFacilitator, Utils, ContractInteract } = require('@openstfoundation/mosaic.js');

const logger = require('./logger');

class Facilitator {
  constructor(chainConfig) {
    this.chainConfig = chainConfig;
    this.mosaic = chainConfig.toMosaic();
    this.mosaicFacilitator = new MosaicFacilitator(this.mosaic);
  }

  async stake(staker, amount, beneficiary) {
    logger.info('Performing stake');
    const { hashLock, unlockSecret } = Utils.createSecretHashLock();

    logger.info('Hashlock, unlockSecret generated');

    const txOptions = {
      gasPrice: this.chainConfig.originGasPrice,
      from: staker,
    };

    const stakeRequest = {
      staker,
      beneficiary,
      amount,
      gasPrice: '0',
      gasLimit: '0',
      hashLock,
      txOptions,
      unlockSecret,
    };

    await this.mosaicFacilitator.stake(
      stakeRequest.staker,
      stakeRequest.amount,
      stakeRequest.beneficiary,
      stakeRequest.gasPrice,
      stakeRequest.gasLimit,
      stakeRequest.hashLock,
      stakeRequest.txOptions,
    );

    const gatewayInstance = new ContractInteract.EIP20Gateway(
      this.mosaic.origin.web3,
      this.mosaic.origin.contractAddresses.EIP20Gateway,
    );

    logger.info('Getting message hash from the gateway');
    const activeProcess = await gatewayInstance.contract.methods.getOutboxActiveProcess(
      staker,
    ).call();

    // FixMe https://github.com/OpenSTFoundation/mosaic.js/issues/136
    const nextNonce = await gatewayInstance.contract.methods.getNonce(staker).call();
    const currentNonce = parseInt(nextNonce, 10) - 1;

    // FixMe In mosaic.js facilitator.stake should return messageHash. https://github.com/OpenSTFoundation/mosaic.js/issues/136
    const messageHash = activeProcess.messageHash_;
    stakeRequest.messageHash = messageHash;
    stakeRequest.nonce = currentNonce;

    const { stakes } = this.chainConfig;

    stakes[messageHash] = stakeRequest;

    logger.info('Stake successful');
    return { messageHash, unlockSecret, nonce: currentNonce };
  }

  async progressStake(messageHash) {
    logger.info('Stake progress started');
    const stakeRequest = this.chainConfig.stakes[messageHash];

    if (!stakeRequest) {
      logger.error('No stake request found');
      return Promise.reject(new Error('No stake request found.'));
    }

    const txOptionAuxiliary = {
      gasPrice: this.chainConfig.auxiliaryGasPrice,
      from: this.chainConfig.auxiliaryDeployerAddress,
    };

    await this.mosaicFacilitator.progressStake(
      stakeRequest.staker,
      stakeRequest.amount,
      stakeRequest.beneficiary,
      stakeRequest.gasPrice,
      stakeRequest.gasLimit,
      stakeRequest.nonce,
      stakeRequest.hashLock,
      stakeRequest.unlockSecret,
      stakeRequest.txOptions,
      txOptionAuxiliary,
    );

    logger.info('Stake progress success');
  }
}

module.exports = Facilitator;
