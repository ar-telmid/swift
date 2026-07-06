package com.bouazza.swift.protocol.callbacks

/**
 * Event listener interface for receiving status updates, incoming data, and transfer progress.
 * All functions provide empty default bodies, serving as an adapter pattern.
 */
interface ProtocolListener {
    /**
     * Called when the lower-level transport is successfully connected to a remote peer.
     */
    fun onConnected(host: String, port: Int) {}

    /**
     * Called when the connection to the peer is closed or lost.
     */
    fun onDisconnected() {}

    /**
     * Called when the symmetric handshake exchange is successfully completed.
     *
     * @param deviceName Identifies the peer device.
     * @param appName Name of the application running on the remote side.
     * @param appVersion Version of the application.
     * @param platform Operating system / platform identifier.
     * @param protocolVersion Protocol specification version.
     * @param capabilities Custom delimited capability strings.
     */
    fun onHandshake(
        deviceName: String,
        appName: String,
        appVersion: String,
        platform: String,
        protocolVersion: Short,
        capabilities: String
    ) {}

    /**
     * Called when a plain text chat message is received from the peer.
     *
     * @param sender The sender's declared handle.
     * @param text The text body.
     */
    fun onTextReceived(sender: String, text: String) {}

    /**
     * Called when a file transfer stream has been initiated by the peer.
     *
     * @param transferId Globally unique ID generated for this transfer.
     * @param fileName The base file name.
     * @param fileSize The total size of the file in bytes.
     * @param chunkSize Size of each incoming binary chunk.
     */
    fun onFileStarted(transferId: Int, fileName: String, fileSize: Long, chunkSize: Int) {}

    /**
     * Periodically called to update the transfer progress of an active file transfer.
     *
     * @param transferId ID of the active transfer.
     * @param bytesTransferred Accumulated bytes received/sent so far.
     * @param totalBytes Total file size in bytes.
     * @param percentage Normalized completion percentage (0.0 to 100.0).
     * @param speedBytesPerSec Live transfer velocity in bytes per second.
     * @param estimatedRemainingSeconds Estimated time to completion in seconds (-1 if speed is 0).
     */
    fun onFileProgress(
        transferId: Int,
        bytesTransferred: Long,
        totalBytes: Long,
        percentage: Double,
        speedBytesPerSec: Long,
        estimatedRemainingSeconds: Long
    ) {}

    /**
     * Called when a file stream successfully completes, compiles, and verifies on disk.
     *
     * @param transferId ID of the completed transfer.
     * @param fileName The original file name.
     * @param totalBytesReceived Total bytes written to disk.
     * @param savePath Absolute path where the file is stored locally.
     */
    fun onFileCompleted(transferId: Int, fileName: String, totalBytesReceived: Long, savePath: String) {}

    /**
     * Called when a file transfer was canceled midway by either the sender or receiver.
     */
    fun onFileCancelled(transferId: Int) {}

    /**
     * Generic callback for any critical failures, parsing errors, or Socket IOExceptions.
     */
    fun onError(exception: Exception) {}
}
