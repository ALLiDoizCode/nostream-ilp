// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title CronosPaymentChannel
/// @notice Unidirectional payment channel for micropayments using AKT ERC-20 tokens on Cronos
/// @dev Based on state channels pattern with off-chain signed claims
/// @dev Deployed on Cronos chain for AKT token payment channels
contract CronosPaymentChannel is ReentrancyGuard {
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;

    IERC20 public immutable aktToken;

    // Events
    event ChannelOpened(
        bytes32 indexed channelId,
        address indexed sender,
        address indexed recipient,
        uint256 balance,
        uint256 expiration
    );

    event ChannelClosed(
        bytes32 indexed channelId,
        uint256 claimAmount,
        uint256 nonce
    );

    // Errors
    error InvalidRecipient();
    error ChannelExpired();
    error InsufficientBalance();
    error NonceNotMonotonic();
    error InvalidSignature();
    error ChannelAlreadyClosed();
    error ChannelNotExpired();

    // Channel state
    struct Channel {
        address sender;        // Payer's address
        address recipient;     // Payee's address
        uint256 balance;       // Locked AKT amount
        uint256 highestNonce;  // Last verified nonce (prevents replay)
        uint256 expiration;    // Unix timestamp when channel expires
        bool isClosed;         // Channel status flag
    }

    mapping(bytes32 => Channel) public channels;

    /// @notice Constructs the CronosPaymentChannel contract with AKT token address
    /// @param _aktTokenAddress Address of AKT ERC-20 token on Cronos
    constructor(address _aktTokenAddress) {
        require(_aktTokenAddress != address(0), "Invalid token address");
        aktToken = IERC20(_aktTokenAddress);
    }

    /// @notice Opens a new payment channel funded with AKT tokens
    /// @dev Requires prior approval: aktToken.approve(address(this), amount)
    /// @param recipient Address that will receive payments from this channel
    /// @param expiration Unix timestamp after which channel can be expired
    /// @param amount Amount of AKT tokens to lock in the channel
    /// @return channelId Unique identifier for the created channel
    function openChannel(
        address recipient,
        uint256 expiration,
        uint256 amount
    ) external returns (bytes32 channelId) {
        // Validate inputs
        if (recipient == address(0)) revert InvalidRecipient();
        if (expiration <= block.timestamp) revert ChannelExpired();
        if (amount == 0) revert InsufficientBalance();

        // Transfer tokens from sender to contract
        require(aktToken.transferFrom(msg.sender, address(this), amount), "Transfer failed");

        // Generate unique channel ID
        channelId = generateChannelId(msg.sender, recipient, block.timestamp);

        // Store channel state
        channels[channelId] = Channel({
            sender: msg.sender,
            recipient: recipient,
            balance: amount,
            highestNonce: 0,
            expiration: expiration,
            isClosed: false
        });

        // Emit event
        emit ChannelOpened(
            channelId,
            msg.sender,
            recipient,
            amount,
            expiration
        );

        return channelId;
    }

    /// @notice Closes a payment channel with a signed claim from the sender
    /// @param channelId Unique identifier of the channel
    /// @param claimAmount Amount being claimed by recipient
    /// @param nonce Monotonically increasing nonce (must be > highestNonce)
    /// @param signature Sender's signature of (channelId, claimAmount, nonce)
    function closeChannel(
        bytes32 channelId,
        uint256 claimAmount,
        uint256 nonce,
        bytes memory signature
    ) external nonReentrant {
        Channel storage channel = channels[channelId];

        // Validation
        if (channel.isClosed) revert ChannelAlreadyClosed();
        if (block.timestamp > channel.expiration) revert ChannelExpired();

        // Verify signature
        _verifyClaimSignature(
            channelId,
            claimAmount,
            nonce,
            signature,
            channel.sender
        );

        // Validate nonce and amount
        if (nonce <= channel.highestNonce) revert NonceNotMonotonic();
        if (claimAmount > channel.balance) revert InsufficientBalance();

        // Update state
        channel.isClosed = true;
        channel.highestNonce = nonce;

        // Transfer claimed amount to recipient
        require(aktToken.transfer(channel.recipient, claimAmount), "Transfer to recipient failed");

        // Refund remaining balance to sender
        uint256 refundAmount = channel.balance - claimAmount;
        if (refundAmount > 0) {
            require(aktToken.transfer(channel.sender, refundAmount), "Refund to sender failed");
        }

        emit ChannelClosed(channelId, claimAmount, nonce);
    }

    /// @notice Expires a channel after expiration timestamp, refunding sender
    /// @param channelId Unique identifier of the channel
    function expireChannel(bytes32 channelId) external {
        Channel storage channel = channels[channelId];

        // Validation
        if (block.timestamp <= channel.expiration) revert ChannelNotExpired();
        if (channel.isClosed) revert ChannelAlreadyClosed();

        // Mark channel closed
        channel.isClosed = true;

        // Refund full balance to sender
        require(aktToken.transfer(channel.sender, channel.balance), "Refund failed");

        emit ChannelClosed(channelId, 0, channel.highestNonce);
    }

    /// @notice Generates a unique channel ID from sender, recipient, and timestamp
    /// @param sender Address of the channel sender
    /// @param recipient Address of the channel recipient
    /// @param timestamp Block timestamp when channel is opened
    /// @return Unique channel identifier
    function generateChannelId(
        address sender,
        address recipient,
        uint256 timestamp
    ) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(sender, recipient, timestamp));
    }

    /// @notice Verifies a claim signature matches the expected signer
    /// @param channelId Channel identifier
    /// @param claimAmount Amount being claimed
    /// @param nonce Nonce for this claim
    /// @param signature Signature to verify
    /// @param expectedSigner Address that should have signed
    function _verifyClaimSignature(
        bytes32 channelId,
        uint256 claimAmount,
        uint256 nonce,
        bytes memory signature,
        address expectedSigner
    ) internal pure {
        bytes32 messageHash = keccak256(
            abi.encodePacked(channelId, claimAmount, nonce)
        );
        bytes32 ethSignedMessageHash = messageHash.toEthSignedMessageHash();
        address recoveredSigner = ethSignedMessageHash.recover(signature);

        if (recoveredSigner != expectedSigner) revert InvalidSignature();
    }

    /// @notice Retrieves channel information
    /// @param channelId Unique identifier of the channel
    /// @return Channel struct with all channel details
    function getChannel(bytes32 channelId) external view returns (Channel memory) {
        return channels[channelId];
    }

    /// @notice Checks if a channel is currently open
    /// @param channelId Unique identifier of the channel
    /// @return True if channel exists and is not closed
    function isChannelOpen(bytes32 channelId) external view returns (bool) {
        return !channels[channelId].isClosed && channels[channelId].sender != address(0);
    }

    /// @notice Gets the current balance of a channel
    /// @param channelId Unique identifier of the channel
    /// @return Current balance locked in the channel
    function getChannelBalance(bytes32 channelId) external view returns (uint256) {
        return channels[channelId].balance;
    }
}
