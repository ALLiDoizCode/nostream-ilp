// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title MultiTokenPaymentChannelFactory
/// @notice Unidirectional payment channel factory supporting any ERC-20 token or native ETH
/// @dev Based on state channels pattern with off-chain signed claims
/// @dev Supports multiple tokens per channel via dynamic token parameter
contract MultiTokenPaymentChannelFactory is ReentrancyGuard {
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;

    // Events
    event ChannelOpened(
        bytes32 indexed channelId,
        address indexed sender,
        address indexed recipient,
        address token,
        uint256 balance,
        uint256 expiration
    );

    event ChannelClosed(
        bytes32 indexed channelId,
        uint256 claimAmount,
        uint256 nonce
    );

    event ChannelToppedUp(
        bytes32 indexed channelId,
        address indexed sender,
        uint256 amount,
        uint256 newBalance,
        uint256 timestamp
    );

    // Errors
    error InvalidRecipient();
    error ChannelExpired();
    error InsufficientBalance();
    error NonceNotMonotonic();
    error InvalidSignature();
    error ChannelAlreadyClosed();
    error ChannelNotExpired();
    error InvalidTokenAddress();
    error ChannelIsAlreadyClosed();
    error OnlySenderCanTopUp();

    // Channel state
    struct Channel {
        address sender;        // Payer's address
        address recipient;     // Payee's address
        address token;         // ERC-20 token address or address(0) for ETH
        uint256 balance;       // Locked token amount
        uint256 highestNonce;  // Last verified nonce (prevents replay)
        uint256 expiration;    // Unix timestamp when channel expires
        bool isClosed;         // Channel status flag
    }

    mapping(bytes32 => Channel) public channels;

    /// @notice Opens a new payment channel funded with any ERC-20 token or native ETH
    /// @dev For ERC-20: Requires prior approval: token.approve(address(this), amount)
    /// @dev For native ETH: Use address(0) as tokenAddress and send ETH via msg.value
    /// @param tokenAddress Address of ERC-20 token or address(0) for native ETH
    /// @param recipient Address that will receive payments from this channel
    /// @param amount Amount of tokens to lock in the channel
    /// @param expiration Unix timestamp after which channel can be expired
    /// @return channelId Unique identifier for the created channel
    function openChannel(
        address tokenAddress,
        address recipient,
        uint256 amount,
        uint256 expiration
    ) external payable returns (bytes32 channelId) {
        // Validate inputs
        if (recipient == address(0)) revert InvalidRecipient();
        if (expiration <= block.timestamp) revert ChannelExpired();
        if (amount == 0) revert InsufficientBalance();

        // Validate token address is a contract (not EOA), except for ETH (address(0))
        if (tokenAddress != address(0)) {
            if (tokenAddress.code.length == 0) revert InvalidTokenAddress();
        }

        // Handle token transfer based on type
        if (tokenAddress == address(0)) {
            // Native ETH
            require(msg.value == amount, "ETH amount mismatch");
        } else {
            // ERC-20 token
            require(msg.value == 0, "ETH not expected for ERC-20");
            require(IERC20(tokenAddress).transferFrom(msg.sender, address(this), amount), "Transfer failed");
        }

        // Generate unique channel ID
        channelId = generateChannelId(msg.sender, recipient, block.timestamp);

        // Store channel state
        channels[channelId] = Channel({
            sender: msg.sender,
            recipient: recipient,
            token: tokenAddress,
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
            tokenAddress,
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

        // Calculate refund amount
        uint256 refundAmount = channel.balance - claimAmount;

        // Transfer based on token type
        if (channel.token == address(0)) {
            // Native ETH transfers
            payable(channel.recipient).transfer(claimAmount);
            if (refundAmount > 0) {
                payable(channel.sender).transfer(refundAmount);
            }
        } else {
            // ERC-20 transfers
            require(IERC20(channel.token).transfer(channel.recipient, claimAmount), "Transfer to recipient failed");
            if (refundAmount > 0) {
                require(IERC20(channel.token).transfer(channel.sender, refundAmount), "Refund to sender failed");
            }
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

        // Refund full balance to sender based on token type
        if (channel.token == address(0)) {
            // Native ETH
            payable(channel.sender).transfer(channel.balance);
        } else {
            // ERC-20
            require(IERC20(channel.token).transfer(channel.sender, channel.balance), "Refund failed");
        }

        emit ChannelClosed(channelId, 0, channel.highestNonce);
    }

    /// @notice Adds funds to an existing open channel
    /// @dev Only sender can top-up their own channel
    /// @param channelId Unique identifier of the channel
    /// @param amount Amount of tokens to add (for ETH, use msg.value)
    function topUpChannel(
        bytes32 channelId,
        uint256 amount
    ) external payable {
        Channel storage channel = channels[channelId];

        // Validation
        if (channel.isClosed) revert ChannelIsAlreadyClosed();
        if (msg.sender != channel.sender) revert OnlySenderCanTopUp();
        if (amount == 0) revert InsufficientBalance();

        // Handle token transfer based on type
        if (channel.token == address(0)) {
            // Native ETH
            require(msg.value == amount, "ETH amount mismatch");
        } else {
            // ERC-20 token
            require(msg.value == 0, "ETH not expected for ERC-20");
            require(IERC20(channel.token).transferFrom(msg.sender, address(this), amount), "Transfer failed");
        }

        // Update balance
        channel.balance += amount;

        // Emit event
        emit ChannelToppedUp(
            channelId,
            msg.sender,
            amount,
            channel.balance,
            block.timestamp
        );
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
